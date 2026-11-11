import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
  User,
  Mail,
  Smartphone,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  X,
  Key,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
  KeyRound,
} from "lucide-react";

type MFAMethod = "PASSWORD" | "EMAIL" | "SMS" | "AUTHENTICATOR";

interface LoginPageProps {
  onLoginSuccess: (
    userId: string,
    role: string,
    email: string,
    username: string
  ) => void;
  kickedReason?: string | null;
  onClearKickedReason?: () => void;
}

interface SessionConflictData {
  deviceInfo: string;
  createdAt?: string;
  message?: string;
  onConfirm: () => void;
}

export default function LoginPage({
  onLoginSuccess,
  kickedReason,
  onClearKickedReason,
}: LoginPageProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);

  // 1 = Employee ID, 2 = Choose MFA Method, 3 = Verification (Code or QR Scan)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // MFA State
  const [mfaTicket, setMfaTicket] = useState("");
  const [availableMethods, setAvailableMethods] = useState<MFAMethod[]>([]);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [hasAuthenticatorSetup, setHasAuthenticatorSetup] = useState(false);
  const [realEmployeeId, setRealEmployeeId] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<MFAMethod>("PASSWORD");

  // Password login state
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Code entry and feedback
  const [otpCode, setOtpCode] = useState("");
  const [displayOtp, setDisplayOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSentNotice, setOtpSentNotice] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  // Authenticator enrollment state
  const [isEnrollingTotp, setIsEnrollingTotp] = useState(false);
  const [totpQrSvg, setTotpQrSvg] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [showManualKey, setShowManualKey] = useState(false);

  // Active session conflict
  const [sessionConflict, setSessionConflict] =
    useState<SessionConflictData | null>(null);

  const otpBoxesRef = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedOtpIndex, setFocusedOtpIndex] = useState<number | null>(0);

  // First-time password change intercept state
  const [isFirstTimeChange, setIsFirstTimeChange] = useState(false);
  const [pendingAuthData, setPendingAuthData] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Forgot password state
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [resetTokenInput, setResetTokenInput] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [forgotNotice, setForgotNotice] = useState("");
  const [devResetToken, setDevResetToken] = useState("");
  const [isMustChangeInitial, setIsMustChangeInitial] = useState(false);

  // ---------------------------------------------------------------------------
  // Device information
  // ---------------------------------------------------------------------------

  const getDeviceLabel = () => {
    const ua = navigator.userAgent;

    let browser = "Browser";

    if (ua.includes("Firefox/")) {
      browser = "Firefox";
    } else if (ua.includes("Edg/")) {
      browser = "Edge";
    } else if (ua.includes("Chrome/")) {
      browser = "Chrome";
    } else if (ua.includes("Safari/")) {
      browser = "Safari";
    }

    let os = "Desktop";

    if (ua.includes("Win")) {
      os = "Windows";
    } else if (ua.includes("Mac")) {
      os = "macOS";
    } else if (ua.includes("Linux")) {
      os = "Linux";
    } else if (ua.includes("Android")) {
      os = "Android";
    } else if (ua.includes("iPhone") || ua.includes("iPad")) {
      os = "iOS";
    }

    return `${browser} on ${os}`;
  };

  // ---------------------------------------------------------------------------
  // Resend timer
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (resendTimer <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setResendTimer((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [resendTimer]);

  // ---------------------------------------------------------------------------
  // Focus OTP input
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (step === 3 && selectedMethod !== "PASSWORD") {
      const timer = window.setTimeout(() => {
        otpBoxesRef.current[0]?.focus();
        setFocusedOtpIndex(0);
      }, 150);

      return () => window.clearTimeout(timer);
    }
  }, [step, selectedMethod]);

  const handleBoxChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, "");
    if (!rawVal) {
      const chars = otpCode.split("");
      chars[index] = "";
      setOtpCode(chars.join("").trimEnd());
      return;
    }
    const char = rawVal.slice(-1);
    const chars = (otpCode.padEnd(6, " ")).split("");
    chars[index] = char;
    const nextCode = chars.join("").trimEnd();
    setOtpCode(nextCode);

    if (index < 5) {
      otpBoxesRef.current[index + 1]?.focus();
    }
  };

  const handleBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!otpCode[index] && index > 0) {
        e.preventDefault();
        const chars = (otpCode.padEnd(6, " ")).split("");
        chars[index - 1] = " ";
        setOtpCode(chars.join("").trimEnd());
        otpBoxesRef.current[index - 1]?.focus();
      } else {
        const chars = (otpCode.padEnd(6, " ")).split("");
        chars[index] = " ";
        setOtpCode(chars.join("").trimEnd());
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      otpBoxesRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      otpBoxesRef.current[index + 1]?.focus();
    }
  };

  const handleBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (pasted) {
      setOtpCode(pasted);
      const nextIdx = Math.min(pasted.length, 5);
      otpBoxesRef.current[nextIdx]?.focus();
    }
  };

  const handleFinishAuthSuccess = (data: any) => {
    if (data.must_change_password || data.user?.must_change_password) {
      if (data.token) {
        localStorage.setItem("authToken", data.token);
      }
      setPendingAuthData(data);
      setIsFirstTimeChange(true);
      setOtpError("");
      return;
    }

    if (data.token && data.user) {
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("currentUserUsername", data.user.username);
      localStorage.setItem("currentUserRole", data.user.role || "");
      localStorage.setItem("currentUserEmail", data.user.email || "");
      localStorage.setItem("currentUserName", data.user.name || "");
      localStorage.setItem("currentUserEmployeeId", data.user.employee_id || "");

      onLoginSuccess(
        data.user.id,
        data.user.role,
        data.user.email,
        data.user.username
      );
    }
  };

  const handleSubmitFirstTimeChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");

    const newPwd = newPassword.trim();
    const confirmPwd = confirmPassword.trim();

    if (!newPwd) {
      setOtpError("Please enter a new password.");
      return;
    }

    if (newPwd.length < 6) {
      setOtpError("Password must be at least 6 characters long.");
      return;
    }

    if (newPwd !== confirmPwd) {
      setOtpError("New password and confirmation do not match.");
      return;
    }

    const currentEmpId = (pendingAuthData?.user?.employee_id || realEmployeeId || employeeId || "").trim();
    if (newPwd.toUpperCase() === currentEmpId.toUpperCase()) {
      setOtpError("Your new password cannot be your Employee ID. Please select a different secure password.");
      return;
    }

    setLoading(true);
    try {
      const token = pendingAuthData?.token || localStorage.getItem("authToken");
      const currentPwdToSubmit = passwordInput.trim() || currentEmpId;

      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPwdToSubmit,
          new_password: newPwd,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || "Failed to update password.");
      }

      // Finalize login on success
      const user = pendingAuthData?.user;
      if (user) {
        localStorage.setItem("currentUserUsername", user.username);
        localStorage.setItem("currentUserRole", user.role || "");
        localStorage.setItem("currentUserEmail", user.email || "");
        localStorage.setItem("currentUserName", user.name || "");
        localStorage.setItem("currentUserEmployeeId", user.employee_id || "");

        setIsFirstTimeChange(false);
        onLoginSuccess(user.id, user.role, user.email, user.username);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to change password.";
      setOtpError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = (forgotIdentifier || employeeId).trim();
    if (!id) {
      setOtpError("Please enter your Employee ID or Username.");
      return;
    }

    setLoading(true);
    setOtpError("");
    setForgotNotice("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Failed to request password reset.");
      }

      setForgotNotice(data.message || "Reset instructions dispatched.");
      if (data.reset_token) {
        setDevResetToken(data.reset_token);
        setResetTokenInput(data.reset_token);
      }
      setForgotStep(2);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to request password reset.";
      setOtpError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompletePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = resetTokenInput.trim();
    const newPwd = resetNewPassword.trim();

    if (!token) {
      setOtpError("Please enter the reset token.");
      return;
    }

    if (!newPwd) {
      setOtpError("Please enter a new password.");
      return;
    }

    if (newPwd.length < 6) {
      setOtpError("Password must be at least 6 characters long.");
      return;
    }

    if (newPwd !== resetConfirmPassword.trim()) {
      setOtpError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setOtpError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          new_password: newPwd,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Failed to reset password.");
      }

      setIsForgotPassword(false);
      setForgotStep(1);
      setResetTokenInput("");
      setResetNewPassword("");
      setResetConfirmPassword("");
      setDevResetToken("");
      setStep(1);
      setOtpSentNotice("Your password has been successfully reset! You can now log in with your new password.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reset password.";
      setOtpError(message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 1: Identification (Employee ID or Username)
  // ---------------------------------------------------------------------------

  const handleIdentifyUser = async () => {
    const identifier = employeeId.trim();

    if (!identifier) {
      setOtpError("Please enter your Name, Employee ID, or Username");
      return;
    }

    if (identifier.includes("@")) {
      setOtpError("Login with email address is not permitted. Please enter your Name, Employee ID, or Username.");
      return;
    }

    const cleanDigits = identifier.replace(/[\s\-()+]/g, "");
    const isPhoneNumber =
      identifier.startsWith("+") ||
      (cleanDigits.length >= 10 &&
        /^\d+$/.test(cleanDigits) &&
        ["6", "7", "8", "9"].includes(cleanDigits.slice(-10)[0]));

    if (isPhoneNumber) {
      setOtpError("Login with phone number is not permitted. Please enter your Name, Employee ID, or Username.");
      return;
    }

    setLoading(true);
    setOtpError("");
    setOtpSentNotice("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: identifier,
          password: "",
          device_info: getDeviceLabel(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.detail || "Unable to find user account"
        );
      }

      if (data.mfa_required) {
        if (!data.mfa_ticket) {
          throw new Error("Authentication ticket was not returned");
        }

        setMfaTicket(data.mfa_ticket);
        const methods: MFAMethod[] = Array.isArray(data.available_methods)
          ? data.available_methods
          : [];
        setAvailableMethods(methods);
        setMaskedEmail(data.masked_email || "");
        setMaskedPhone(data.masked_phone || "");
        setHasAuthenticatorSetup(Boolean(data.has_authenticator_setup));
        setRealEmployeeId(data.employee_id || "");
        setIsMustChangeInitial(Boolean(data.must_change_password));

        // Default selection to PASSWORD if available
        if (methods.includes("PASSWORD")) {
          setSelectedMethod("PASSWORD");
        } else if (methods.length > 0) {
          setSelectedMethod(methods[0]);
        }

        // Advance directly to Step 2: Choose Verification Method (User selects their method)
        setStep(2);
        return;
      }

      // Direct login if MFA not required
      if (data.token && data.user) {
        handleFinishAuthSuccess(data);
        return;
      }

      throw new Error("Unexpected authentication response");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to sign in. Please try again.";

      setOtpError(message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2: Select MFA Method
  // ---------------------------------------------------------------------------

  const handleSelectMethod = async (method: MFAMethod) => {
    setSelectedMethod(method);
    setOtpCode("");
    setPasswordInput("");
    setOtpError("");
    setOtpSentNotice("");

    if (method === "PASSWORD") {
      setStep(3);
      return;
    }

    if (method === "EMAIL" || method === "SMS") {
      setLoading(true);
      try {
        const res = await fetch("/api/auth/mfa/send-otp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ticket: mfaTicket,
            method: method,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data.detail || `Failed to send ${method} verification code`
          );
        }

        const target = method === "EMAIL" ? maskedEmail : maskedPhone;
        setOtpSentNotice(
          data.message ||
            `A verification code has been dispatched to ${target}.`
        );

        if (data.otp) {
          setDisplayOtp(data.otp);
        }

        setResendTimer(60);
        setStep(3);
      } catch (err: unknown) {
        setOtpError(
          err instanceof Error
            ? err.message
            : `Failed to send ${method} OTP`
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (method === "AUTHENTICATOR") {
      if (hasAuthenticatorSetup) {
        setIsEnrollingTotp(false);
        setStep(3);
      } else {
        setLoading(true);
        try {
          const res = await fetch("/api/auth/mfa/setup-totp", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ticket: mfaTicket }),
          });

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            throw new Error(
              data.detail || "Failed to initialize Authenticator setup"
            );
          }

          setTotpQrSvg(data.qr_svg_data_url || "");
          setTotpSecret(data.secret || "");
          setIsEnrollingTotp(true);
          setStep(3);
        } catch (err: unknown) {
          setOtpError(
            err instanceof Error
              ? err.message
              : "Failed to load Authenticator QR code"
          );
        } finally {
          setLoading(false);
        }
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Resend OTP (Email or SMS)
  // ---------------------------------------------------------------------------

  const handleResendOtp = async () => {
    if (resendTimer > 0 || !mfaTicket || loading) {
      return;
    }

    setLoading(true);
    setOtpError("");
    setOtpSentNotice("");

    try {
      const res = await fetch("/api/auth/mfa/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticket: mfaTicket,
          method: selectedMethod,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.detail || "Failed to resend verification code"
        );
      }

      const target = selectedMethod === "EMAIL" ? maskedEmail : maskedPhone;
      setOtpSentNotice(
        data.message ||
          `A new verification code has been dispatched to ${target}.`
      );

      if (data.otp) {
        setDisplayOtp(data.otp);
      }

      setOtpCode("");
      setResendTimer(60);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to resend verification code";

      setOtpError(message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 3: Verify OTP or Authenticator Code
  // ---------------------------------------------------------------------------

  const handleVerifyOtp = async (
    e: React.FormEvent,
    forceLogin = false
  ) => {
    e.preventDefault();

    if (!mfaTicket) {
      setOtpError(
        "Your authentication session has expired. Please sign in again."
      );
      setStep(1);
      return;
    }

    if (selectedMethod === "PASSWORD") {
      const pwd = passwordInput.trim();
      if (!pwd) {
        setOtpError("Please enter your account password or Employee ID");
        return;
      }

      setLoading(true);
      setOtpError("");

      try {
        const res = await fetch("/api/auth/mfa/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ticket: mfaTicket,
            method: "PASSWORD",
            code: pwd,
            force_login: forceLogin,
            device_info: getDeviceLabel(),
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data.detail || "Invalid password. Default password is your Employee ID."
          );
        }

        // Active session conflict handling
        if (data.active_session_conflict) {
          setSessionConflict({
            deviceInfo:
              data.active_device_info ||
              "Another device/browser",
            createdAt: data.session_created_at,
            message: data.message,
            onConfirm: () => {
              setSessionConflict(null);
              void handleVerifyOtp(e, true);
            },
          });
          return;
        }

        if (!data.token || !data.user) {
          throw new Error(
            "Authentication succeeded but no login session was returned."
          );
        }

        handleFinishAuthSuccess(data);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Password verification failed";
        setOtpError(message);
      } finally {
        setLoading(false);
      }
      return;
    }

    const code = otpCode.trim();

    if (!code) {
      setOtpError("Please enter your 6-digit code");
      return;
    }

    if (code.length !== 6) {
      setOtpError("Please enter all 6 digits of the code");
      return;
    }

    setLoading(true);
    setOtpError("");

    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticket: mfaTicket,
          method: selectedMethod,
          code: code,
          force_login: forceLogin,
          device_info: getDeviceLabel(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.detail || "Invalid verification code"
        );
      }

      // Existing session conflict handling
      if (data.active_session_conflict) {
        setSessionConflict({
          deviceInfo:
            data.active_device_info ||
            "Another device/browser",
          createdAt: data.session_created_at,
          message: data.message,
          onConfirm: () => {
            setSessionConflict(null);
            void handleVerifyOtp(e, true);
          },
        });

        return;
      }

      if (!data.token || !data.user) {
        throw new Error(
          "Authentication succeeded but no login session was returned."
        );
      }

      // Finish login / force password change if required
      handleFinishAuthSuccess(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Verification failed";

      setOtpError(message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Back navigation
  // ---------------------------------------------------------------------------

  const handleBackToId = () => {
    setStep(1);
    setOtpCode("");
    setPasswordInput("");
    setOtpError("");
    setOtpSentNotice("");
    setMfaTicket("");
    setMaskedEmail("");
    setMaskedPhone("");
    setResendTimer(0);
    setIsEnrollingTotp(false);
  };

  const handleBackToMethods = () => {
    setStep(2);
    setOtpCode("");
    setPasswordInput("");
    setOtpError("");
    setOtpSentNotice("");
    setResendTimer(0);
  };

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#FAF8F3] flex font-sans w-full overflow-hidden select-none">
      {/* LEFT BRAND PANEL */}
      <div className="hidden lg:flex lg:w-[30%] relative bg-gradient-to-b from-[#004B32] via-[#003F29] to-[#002E1E] overflow-hidden rounded-r-[28px] flex-col justify-center items-center p-8 min-h-screen text-white">
        {/* Dot matrix */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 grid grid-cols-4 gap-2.5 opacity-30 pointer-events-none">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-[#9FD7C0]"
            />
          ))}
        </div>

        {/* Footer geometry */}
        <div className="absolute bottom-0 left-0 w-full h-28 pointer-events-none z-10">
          <svg
            className="w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polygon
              points="0,100 0,26 48,100"
              fill="#D20A16"
            />
            <polygon
              points="48,100 100,26 100,100"
              fill="#F2C000"
            />
          </svg>
        </div>

        {/* Footer dots */}
        <div className="absolute bottom-5 left-6 grid grid-cols-4 gap-2 z-20 pointer-events-none">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-yellow-300 opacity-90"
            />
          ))}
        </div>

        {/* Brand */}
        <div className="relative z-30 -translate-y-10 flex flex-col items-center text-center space-y-3">
          <div className="w-24 h-24 rounded-full bg-[#F4FAF7] flex items-center justify-center shadow-[0_12px_32px_rgba(0,0,0,0.22)] mb-1">
            <Layers className="w-12 h-12 text-[#003F29]" />
          </div>

          <h1 className="text-4xl font-extrabold tracking-wider text-white uppercase font-display drop-shadow-sm">
            DAAS
          </h1>

          <p className="text-white/80 text-[11px] font-semibold tracking-[0.16em] uppercase leading-relaxed max-w-xs">
            Document Approval &amp;
            <br />
            Automation System
          </p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <main className="flex-1 flex flex-col justify-between px-8 sm:px-16 lg:px-24 py-8 bg-[#FAF8F3] relative min-h-screen">
        <div className="hidden lg:block h-2" />
        <div className="w-full max-w-md mx-auto my-auto py-4">
          {/* Session kicked alert */}
          {kickedReason && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />

              <div className="flex-1 text-xs text-amber-800">
                <span className="font-bold">
                  Session Replaced:{" "}
                </span>
                {kickedReason}
              </div>

              {onClearKickedReason && (
                <button
                  type="button"
                  onClick={onClearKickedReason}
                  className="text-amber-500 hover:text-amber-800"
                  aria-label="Dismiss session alert"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Global error */}
          {otpError && (
            <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="font-medium">
                {otpError}
              </span>
            </div>
          )}

          {/* ============================================================= */}
          {/* FIRST TIME PASSWORD SETUP (FORCED CHANGE) */}
          {/* ============================================================= */}
          {isFirstTimeChange && (
            <div className="space-y-6 animate-fadeIn text-left">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 leading-relaxed">
                  <span className="font-bold">Initial Login Detected:</span> Your account is currently using your Employee ID as the temporary password. Please set a new personal password to secure your account before continuing.
                </div>
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-[#003F29] tracking-tight">
                  Set Your New Password
                </h2>
                <p className="text-gray-500 text-xs">
                  Create a secure password for employee <span className="font-semibold text-gray-700">{pendingAuthData?.user?.employee_name || pendingAuthData?.user?.username}</span> ({pendingAuthData?.user?.employee_id}).
                </p>
              </div>

              <form onSubmit={handleSubmitFirstTimeChange} className="space-y-4 pt-1">
                {/* Current password (Employee ID) */}
                <div className="space-y-1.5">
                  <label htmlFor="firsttime-current-password" className="text-xs font-semibold text-gray-800">
                    Current Password / Employee ID
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      id="firsttime-current-password"
                      name="current_password"
                      type="text"
                      disabled
                      value={passwordInput || pendingAuthData?.user?.employee_id || employeeId}
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono"
                    />
                  </div>
                </div>

                {/* New password */}
                <div className="space-y-1.5">
                  <label htmlFor="firsttime-new-password" className="text-xs font-semibold text-gray-800">
                    New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <input
                      id="firsttime-new-password"
                      name="new_password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      autoFocus
                      className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#003F29]/30 focus:border-[#003F29]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label="Toggle new password visibility"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label htmlFor="firsttime-confirm-password" className="text-xs font-semibold text-gray-800">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <input
                      id="firsttime-confirm-password"
                      name="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      required
                      className="w-full pl-10 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#003F29]/30 focus:border-[#003F29]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label="Toggle confirm password visibility"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-[11px] text-gray-600 space-y-1">
                  <div className="font-semibold text-gray-700">Security Requirements:</div>
                  <div>&bull; Must be at least 6 characters long</div>
                  <div>&bull; Cannot be the same as your Employee ID</div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full py-3.5 px-4 bg-[#003F29] hover:bg-[#002E1E] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer mt-4"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving New Password...</span>
                    </div>
                  ) : (
                    <>
                      <span>Save Password & Access Workspace</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================= */}
          {/* FORGOT PASSWORD WORKFLOW */}
          {/* ============================================================= */}
          {isForgotPassword && !isFirstTimeChange && (
            <div className="space-y-6 animate-fadeIn text-left">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setForgotStep(1);
                    setOtpError("");
                  }}
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-[#003F29] cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to Sign In
                </button>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Step {forgotStep} of 2
                </span>
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-[#003F29] tracking-tight">
                  {forgotStep === 1 ? "Forgot Password" : "Reset Your Password"}
                </h2>
                <p className="text-gray-500 text-xs">
                  {forgotStep === 1
                    ? "Enter your Employee ID or Username to receive a password reset token."
                    : "Enter the reset token sent to your email and choose a new password."}
                </p>
              </div>

              {forgotNotice && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                  {forgotNotice}
                </div>
              )}

              {devResetToken && forgotStep === 2 && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Reset Token (Dev / Display Mode)
                  </div>
                  <div className="font-mono text-xs font-bold text-amber-950 break-all select-all">
                    {devResetToken}
                  </div>
                </div>
              )}

              {forgotStep === 1 ? (
                <form onSubmit={handleRequestPasswordReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="forgot-identifier" className="text-xs font-semibold text-gray-800">
                      Employee ID or Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                        <User className="h-4 w-4" />
                      </div>
                      <input
                        id="forgot-identifier"
                        name="identifier"
                        type="text"
                        value={forgotIdentifier}
                        onChange={(e) => setForgotIdentifier(e.target.value)}
                        placeholder="e.g. 16220 or EMP_01"
                        required
                        autoFocus
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#003F29]/30 focus:border-[#003F29]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !forgotIdentifier.trim()}
                    className="w-full py-3.5 px-4 bg-[#003F29] hover:bg-[#002E1E] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer mt-4"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending Request...</span>
                      </div>
                    ) : (
                      <>
                        <span>Get Reset Code</span>
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleCompletePasswordReset} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="reset-token-input" className="text-xs font-semibold text-gray-800">
                      Reset Token / Verification Code
                    </label>
                    <input
                      id="reset-token-input"
                      name="reset_token"
                      type="text"
                      value={resetTokenInput}
                      onChange={(e) => setResetTokenInput(e.target.value)}
                      placeholder="Paste the reset code"
                      required
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#003F29]/30 focus:border-[#003F29]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reset-new-password" className="text-xs font-semibold text-gray-800">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="reset-new-password"
                        name="new_password"
                        type={showResetPassword ? "text" : "password"}
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        required
                        className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#003F29]/30 focus:border-[#003F29]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(!showResetPassword)}
                        aria-label="Toggle new password visibility"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reset-confirm-password" className="text-xs font-semibold text-gray-800">
                      Confirm New Password
                    </label>
                    <input
                      id="reset-confirm-password"
                      name="confirm_password"
                      type="password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      placeholder="Confirm your new password"
                      required
                      className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#003F29]/30 focus:border-[#003F29]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !resetTokenInput.trim() || !resetNewPassword}
                    className="w-full py-3.5 px-4 bg-[#003F29] hover:bg-[#002E1E] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer mt-4"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Updating Password...</span>
                      </div>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Reset Password & Finish</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {!isFirstTimeChange && !isForgotPassword && (
            <>
              {/* ============================================================= */}
              {/* STEP 1: Employee ID / Username */}
              {/* ============================================================= */}

          {step === 1 && (
            <div className="space-y-6">
              <div className="text-left space-y-1">
                <h2 className="text-3xl font-bold text-[#003F29] tracking-tight">
                  Welcome Back
                </h2>

                <p className="text-gray-500 text-sm font-normal">
                  Login to access your workspace
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleIdentifyUser();
                }}
                className="space-y-5 pt-2"
              >
                {/* Employee ID / Username / Name */}
                <div className="space-y-1.5 text-left">
                  <label htmlFor="login-employee-id" className="text-xs font-semibold text-gray-800">
                    Name, Employee ID, or Username
                  </label>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>

                    <input
                      id="login-employee-id"
                      name="username"
                      type="text"
                      value={employeeId}
                      onChange={(e) =>
                        setEmployeeId(e.target.value)
                      }
                      placeholder="Enter Name, Employee ID (e.g. 16220), or Username"
                      required
                      autoFocus
                      autoComplete="username"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#003F29]/30 focus:border-[#003F29] transition-colors"
                    />
                  </div>
                </div>

                {/* 2FA info badge */}
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 text-[#003F29] mt-0.5 shrink-0" />

                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Secure passwordless login via <strong>Email OTP</strong>,{" "}
                    <strong>SMS OTP</strong>, or <strong>Authenticator App</strong>.
                  </p>
                </div>

                {/* Continue button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#003F29] hover:bg-[#002E1E] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer mt-6"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Checking Account...</span>
                    </div>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setForgotIdentifier(employeeId);
                      setOtpError("");
                      setIsForgotPassword(true);
                      setForgotStep(1);
                    }}
                    className="text-xs text-gray-500 hover:text-[#003F29] font-medium transition-colors cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============================================================= */}
          {/* STEP 2: Choose MFA Method */}
          {/* ============================================================= */}

          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBackToId}
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-[#003F29] cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Change User ({employeeId})
                </button>
              </div>

              <div className="text-left space-y-1">
                <h2 className="text-2xl font-bold text-[#003F29] tracking-tight">
                  Choose Verification Method
                </h2>

                <p className="text-gray-500 text-xs leading-relaxed">
                  Select your preferred two-factor authentication method.
                </p>
              </div>

              {availableMethods.length === 0 ? (
                <div className="space-y-4 pt-2">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-amber-900">
                          Verification Unavailable
                        </h3>
                        <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                          No verification method is available. Please contact your administrator.
                        </p>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleBackToId}
                    className="w-full py-3.5 px-4 bg-[#003F29] hover:bg-[#002E1E] text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    <span>Back to login</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {/* 1. PASSWORD LOGIN */}
                  {availableMethods.includes("PASSWORD") ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleSelectMethod("PASSWORD")}
                      className="w-full p-4 border rounded-xl flex items-center justify-between transition-all duration-200 text-left cursor-pointer border-gray-200 hover:border-[#003F29] hover:bg-emerald-50/50 bg-white shadow-xs group"
                    >
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 text-[#003F29] flex items-center justify-center shrink-0 group-hover:bg-[#003F29] group-hover:text-white transition-colors">
                          <Lock className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            Password Login
                          </div>
                          <div className="text-xs text-gray-500">
                            Enter your account password or Employee ID
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                          Instant
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </button>
                  ) : null}

                  {/* 2. EMAIL OTP */}
                  {availableMethods.includes("EMAIL") ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleSelectMethod("EMAIL")}
                      className="w-full p-4 border rounded-xl flex items-center justify-between transition-all duration-200 text-left cursor-pointer border-gray-200 hover:border-[#003F29] hover:bg-emerald-50/50 bg-white shadow-xs"
                    >
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100/80 text-[#003F29] flex items-center justify-center shrink-0">
                          <Mail className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            Email OTP
                          </div>
                          <div className="text-xs text-gray-500">
                            {maskedEmail ? `Send code to ${maskedEmail}` : "Registered email"}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </button>
                  ) : (
                    <div className="w-full p-4 border border-gray-200 rounded-xl flex items-center justify-between bg-gray-50 opacity-60">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center shrink-0">
                          <Mail className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-700">
                            Email OTP
                          </div>
                          <div className="text-xs text-gray-400">
                            Email OTP is not configured yet
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded">
                        Disabled
                      </span>
                    </div>
                  )}

                  {/* 2. SMS OTP */}
                  {availableMethods.includes("SMS") ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleSelectMethod("SMS")}
                      className="w-full p-4 border rounded-xl flex items-center justify-between transition-all duration-200 text-left cursor-pointer border-gray-200 hover:border-[#003F29] hover:bg-emerald-50/50 bg-white shadow-xs"
                    >
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0">
                          <Smartphone className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            SMS OTP
                          </div>
                          <div className="text-xs text-gray-500">
                            {maskedPhone ? `Send code to ${maskedPhone}` : "Registered mobile number"}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </button>
                  ) : (
                    <div className="w-full p-4 border border-gray-200 rounded-xl flex items-center justify-between bg-gray-50 opacity-60">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center shrink-0">
                          <Smartphone className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-700">
                            SMS OTP
                          </div>
                          <div className="text-xs text-gray-400">
                            No registered phone number found on account
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded">
                        Unavailable
                      </span>
                    </div>
                  )}

                  {/* 3. AUTHENTICATOR APP */}
                  {availableMethods.includes("AUTHENTICATOR") ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void handleSelectMethod("AUTHENTICATOR")}
                      className="w-full p-4 border rounded-xl flex items-center justify-between transition-all duration-200 text-left cursor-pointer border-gray-200 hover:border-[#003F29] hover:bg-emerald-50/50 bg-white shadow-xs"
                    >
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-purple-100/80 text-purple-700 flex items-center justify-center shrink-0">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            Authenticator App (TOTP)
                          </div>
                          <div className="text-xs text-gray-500">
                            {hasAuthenticatorSetup
                              ? "Use Google or Microsoft Authenticator code"
                              : "First-time setup with QR code scan"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            hasAuthenticatorSetup
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {hasAuthenticatorSetup ? "Configured" : "Setup Required"}
                        </span>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </button>
                  ) : (
                    <div className="w-full p-4 border border-gray-200 rounded-xl flex items-center justify-between bg-gray-50 opacity-60">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-lg bg-gray-200 text-gray-400 flex items-center justify-center shrink-0">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-700">
                            Authenticator App (TOTP)
                          </div>
                          <div className="text-xs text-gray-400">
                            Not enrolled on this account
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded">
                        Unavailable
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ============================================================= */}
          {/* STEP 3: Verification (Email OTP, SMS OTP, or Authenticator) */}
          {/* ============================================================= */}

          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBackToMethods}
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-[#003F29] cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Choose another method
                </button>

                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 uppercase">
                  {selectedMethod === "PASSWORD"
                    ? "Password"
                    : selectedMethod === "AUTHENTICATOR"
                    ? isEnrollingTotp
                      ? "First-Time Setup"
                      : "Authenticator"
                    : `${selectedMethod} OTP`}
                </span>
              </div>

              {/* Title & Description */}
              <div className="text-left space-y-1">
                <h2 className="text-2xl font-bold text-[#003F29] tracking-tight">
                  {selectedMethod === "PASSWORD"
                    ? "Enter Password"
                    : selectedMethod === "AUTHENTICATOR"
                    ? isEnrollingTotp
                      ? "Set Up Authenticator"
                      : "Enter Authenticator Code"
                    : "Enter Verification Code"}
                </h2>

                <p className="text-gray-500 text-xs leading-relaxed">
                  {selectedMethod === "PASSWORD" && (
                    <>
                      Enter the password for <span className="font-semibold text-gray-700">{employeeId}</span>. Initial default password is your Employee ID.
                    </>
                  )}
                  {selectedMethod === "EMAIL" && (
                    <>
                      Enter the 6-digit code sent to{" "}
                      <span className="font-semibold text-gray-700">{maskedEmail}</span>.
                    </>
                  )}
                  {selectedMethod === "SMS" && (
                    <>
                      Enter the 6-digit code sent to{" "}
                      <span className="font-semibold text-gray-700">{maskedPhone}</span>.
                    </>
                  )}
                  {selectedMethod === "AUTHENTICATOR" && isEnrollingTotp && (
                    <>
                      Scan the QR code below using <strong>Microsoft Authenticator</strong> or{" "}
                      <strong>Google Authenticator</strong>, then enter the 6-digit code.
                    </>
                  )}
                  {selectedMethod === "AUTHENTICATOR" && !isEnrollingTotp && (
                    <>
                      Open your Authenticator app and enter the current 6-digit code for DAAS.
                    </>
                  )}
                </p>
              </div>

              {/* Dispatch Notice for Email/SMS */}
              {otpSentNotice && selectedMethod !== "AUTHENTICATOR" && selectedMethod !== "PASSWORD" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                  {otpSentNotice}
                </div>
              )}

              {/* Display Generated OTP for Testing / Presentation */}
              {displayOtp && selectedMethod !== "AUTHENTICATOR" && selectedMethod !== "PASSWORD" && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                      Generated OTP (Dev / Demo Mode)
                    </div>
                    <div className="text-2xl font-mono font-extrabold tracking-widest text-amber-900 mt-0.5">
                      {displayOtp}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtpCode(displayOtp)}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    Auto Fill
                  </button>
                </div>
              )}

              {/* QR Code display for First-Time Authenticator Setup */}
              {selectedMethod === "AUTHENTICATOR" && isEnrollingTotp && totpQrSvg && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-white rounded-xl shadow-xs border border-gray-200">
                    <img
                      src={totpQrSvg}
                      alt="Authenticator QR Code"
                      width="176"
                      height="176"
                      className="w-44 h-44 object-contain"
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowManualKey((prev) => !prev)}
                      className="text-xs font-semibold text-[#003F29] hover:underline inline-flex items-center space-x-1 cursor-pointer"
                    >
                      <Key className="h-3.5 w-3.5" />
                      <span>{showManualKey ? "Hide manual key" : "Can't scan QR? View key"}</span>
                    </button>

                    {showManualKey && totpSecret && (
                      <div className="p-2 bg-white rounded border border-gray-300 font-mono text-xs text-gray-800 select-all break-all max-w-xs mt-1">
                        {totpSecret}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Password entry form vs Code entry form */}
              {selectedMethod === "PASSWORD" ? (
                <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-5">
                  <div className="space-y-2 text-left">
                    <label htmlFor="login-password" className="text-xs font-semibold text-gray-800">
                      Account Password / Employee ID
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="Enter password or Employee ID"
                        autoFocus
                        className="w-full pl-10 pr-10 py-3 text-sm font-medium border border-gray-300 rounded-xl focus:outline-none focus:border-[#003F29] focus:ring-2 focus:ring-[#003F29]/20 transition-all text-gray-900 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label="Toggle password visibility"
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {isMustChangeInitial ? (
                      <p className="text-[11px] text-gray-500">
                        Default initial password is your Employee ID (e.g. <span className="font-mono font-semibold">{realEmployeeId || employeeId}</span>).
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-500">
                        Enter your personal password.
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !passwordInput.trim()}
                    className="w-full py-3.5 px-4 bg-[#003F29] hover:bg-[#002E1E] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying Password...</span>
                      </div>
                    ) : (
                      <span>Sign In to Workspace</span>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1">
                    {isMustChangeInitial ? (
                      <span className="text-gray-400">First time? Use your Employee ID</span>
                    ) : (
                      <span className="text-gray-400">Account password</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setForgotIdentifier(realEmployeeId || employeeId);
                        setOtpError("");
                        setIsForgotPassword(true);
                        setForgotStep(1);
                      }}
                      className="text-emerald-700 hover:text-emerald-900 font-medium cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <div className="pt-2 text-center border-t border-gray-100 mt-2">
                    <button
                      type="button"
                      onClick={handleBackToMethods}
                      className="text-xs text-emerald-700 hover:text-emerald-900 font-medium cursor-pointer"
                    >
                      ← Switch to Email OTP, SMS, or Authenticator App
                    </button>
                  </div>
                </form>
              ) : (
              <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-5">
                <div className="space-y-2 text-left">
                  <label className="text-xs font-semibold text-gray-800">
                    {selectedMethod === "AUTHENTICATOR"
                      ? "6-Digit Authenticator Code"
                      : "6-digit passcode"}
                  </label>

                  {/* 6-Box OTP Input */}
                  <div className="flex items-center justify-between gap-2 sm:gap-2.5">
                    {[0, 1, 2, 3, 4, 5].map((i) => {
                      const digit = otpCode[i] || "";
                      const isFocused = focusedOtpIndex === i;
                      return (
                        <div
                          key={i}
                          className="relative flex-1 aspect-square max-w-[56px] min-h-[52px]"
                        >
                          <input
                            ref={(el) => { otpBoxesRef.current[i] = el; }}
                            id={`otp-box-${i}`}
                            name={`otp-${i}`}
                            aria-label={`Verification code digit ${i + 1}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete={i === 0 ? "one-time-code" : "off"}
                            maxLength={2}
                            value={digit}
                            onFocus={() => setFocusedOtpIndex(i)}
                            onBlur={() => setFocusedOtpIndex(null)}
                            onChange={(e) => handleBoxChange(i, e)}
                            onKeyDown={(e) => handleBoxKeyDown(i, e)}
                            onPaste={handleBoxPaste}
                            className={`w-full h-full text-center text-xl font-bold font-mono rounded-xl bg-white transition-all cursor-text outline-none select-none ${
                              isFocused
                                ? "border-2 border-[#003F29] ring-3 ring-[#003F29]/15 shadow-sm text-gray-900"
                                : digit
                                ? "border border-gray-300 text-gray-900 shadow-2xs"
                                : "border border-gray-200 text-transparent hover:border-gray-300"
                            }`}
                          />
                          {/* Centered dot indicator matching design when empty */}
                          {!digit && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div
                                className={`w-2 h-2 rounded-full transition-colors ${
                                  isFocused ? "bg-[#003F29]" : "bg-slate-400/80"
                                }`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full py-3.5 px-4 bg-[#003F29] hover:bg-[#002E1E] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <span>
                      {selectedMethod === "AUTHENTICATOR" && isEnrollingTotp
                        ? "Verify & Complete Enrollment"
                        : "Verify & Enter Workspace"}
                    </span>
                  )}
                </button>

                {/* Resend for Email / SMS */}
                {selectedMethod !== "AUTHENTICATOR" && (
                  <div className="text-center pt-2">
                    {resendTimer > 0 ? (
                      <p className="text-xs text-gray-400">
                        Resend code in{" "}
                        <span className="font-semibold text-gray-600">
                          {resendTimer}s
                        </span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleResendOtp()}
                        disabled={loading}
                        className="text-xs font-semibold text-[#003F29] hover:underline cursor-pointer"
                      >
                        Didn't receive code? Resend OTP
                      </button>
                    )}
                  </div>
                )}

                <div className="pt-2 text-center border-t border-gray-100 mt-2">
                  <button
                    type="button"
                    onClick={handleBackToMethods}
                    className="text-xs text-emerald-700 hover:text-emerald-900 font-medium cursor-pointer"
                  >
                    ← Switch to {selectedMethod === "EMAIL" ? "Password, SMS OTP, or Authenticator App" : "Password or Email OTP"}
                  </button>
                </div>
              </form>
              )}
            </div>
          )}
            </>
          )}
        </div>

        {/* LOGIN FOOTER */}
        <footer className="w-full max-w-lg mx-auto pt-4 pb-1 text-center text-[10.5px] text-slate-600 select-none space-y-1">
          <p className="font-semibold text-slate-700 tracking-tight">
            &copy; 2026 DAAS. All rights reserved. | Document Approval &amp; Automation System
          </p>
          <div className="flex items-center justify-center gap-2 text-slate-600 text-[10px] font-medium">
            <span className="hover:text-[#003F29] transition-colors cursor-pointer">
              Privacy Policy
            </span>
            <span>&middot;</span>
            <span className="hover:text-[#003F29] transition-colors cursor-pointer">
              Help &amp; Support
            </span>
          </div>
        </footer>
      </main>

      {/* =============================================================== */}
      {/* ACTIVE SESSION CONFLICT MODAL */}
      {/* =============================================================== */}

      {sessionConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />

              <h3 className="text-base font-bold text-gray-900">
                Session Conflict
              </h3>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              This account is currently active on{" "}
              <span className="font-semibold">
                {sessionConflict.deviceInfo}
              </span>
              . Logging in here will terminate the other
              session.
            </p>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setSessionConflict(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={sessionConflict.onConfirm}
                className="flex-1 py-2 bg-[#003F29] text-white rounded-lg text-xs font-semibold hover:bg-[#002E1E]"
              >
                Sign In Here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}