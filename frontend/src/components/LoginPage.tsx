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
} from "lucide-react";
import kolamSolidImg from "../assets/kolam_solid_white.png";

type MFAMethod = "EMAIL" | "SMS" | "AUTHENTICATOR";

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
  const [availableMethods, setAvailableMethods] = useState<MFAMethod[]>(["EMAIL"]);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [hasAuthenticatorSetup, setHasAuthenticatorSetup] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<MFAMethod>("EMAIL");

  // Code entry and feedback
  const [otpCode, setOtpCode] = useState("");
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

  const otpInputRef = useRef<HTMLInputElement>(null);

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
    if (step === 3) {
      const timer = window.setTimeout(() => {
        otpInputRef.current?.focus();
      }, 150);

      return () => window.clearTimeout(timer);
    }
  }, [step]);

  // ---------------------------------------------------------------------------
  // Step 1: Identification (Employee ID or Username)
  // ---------------------------------------------------------------------------

  const handleIdentifyUser = async () => {
    const identifier = employeeId.trim();

    if (!identifier) {
      setOtpError("Please enter your Employee ID or Username");
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
          : ["EMAIL", "AUTHENTICATOR"];
        setAvailableMethods(methods);
        setMaskedEmail(data.masked_email || "");
        setMaskedPhone(data.masked_phone || "");
        setHasAuthenticatorSetup(Boolean(data.has_authenticator_setup));

        // Advance to Step 2: Choose Verification Method
        setStep(2);
        return;
      }

      // Direct login if MFA not required
      if (data.token && data.user) {
        localStorage.setItem("authToken", data.token);
        localStorage.setItem(
          "currentUserUsername",
          data.user.username
        );

        onLoginSuccess(
          data.user.id,
          data.user.role,
          data.user.email,
          data.user.username
        );
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
    setOtpError("");
    setOtpSentNotice("");

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

    const code = otpCode.trim();

    if (!code) {
      setOtpError("Please enter your 6-digit code");
      return;
    }

    if (code.length !== 6) {
      setOtpError("Please enter all 6 digits of the code");
      return;
    }

    if (!mfaTicket) {
      setOtpError(
        "Your authentication session has expired. Please request a new OTP."
      );
      setStep(1);
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

      // Store existing JWT
      localStorage.setItem("authToken", data.token);
      localStorage.setItem(
        "currentUserUsername",
        data.user.username
      );

      onLoginSuccess(
        data.user.id,
        data.user.role,
        data.user.email,
        data.user.username
      );
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
    setOtpError("");
    setOtpSentNotice("");
    setResendTimer(0);
  };

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-white flex font-sans w-full overflow-hidden select-none">
      {/* LEFT BRAND PANEL */}
      <div className="hidden lg:flex lg:w-[30%] relative bg-[#006B3F] overflow-hidden rounded-r-[28px] flex-col justify-center items-center p-8 min-h-screen text-white">
        {/* Dot matrix */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 grid grid-cols-4 gap-2.5 opacity-30 pointer-events-none">
          {[...Array(16)].map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
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
            <Layers className="w-12 h-12 text-[#006B3F]" />
          </div>

          <h1 className="text-4xl font-extrabold tracking-wider text-white uppercase font-display drop-shadow-sm">
            DAAS
          </h1>

          <p className="text-emerald-100/90 text-[11px] font-semibold tracking-[0.16em] uppercase leading-relaxed max-w-xs">
            Document Approval &amp;
            <br />
            Automation System
          </p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 py-12 bg-white relative min-h-screen">
        <div className="w-full max-w-md mx-auto">
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
          {/* STEP 1: Employee ID / Username */}
          {/* ============================================================= */}

          {step === 1 && (
            <div className="space-y-6">
              <div className="text-left space-y-1">
                <h2 className="text-3xl font-bold text-[#006B3F] tracking-tight">
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
                {/* Employee ID / Username */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-gray-800">
                    Employee ID or Username
                  </label>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-gray-400" />
                    </div>

                    <input
                      type="text"
                      value={employeeId}
                      onChange={(e) =>
                        setEmployeeId(e.target.value)
                      }
                      placeholder="e.g. EMP001 or username"
                      required
                      autoFocus
                      autoComplete="username"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006B3F]/30 focus:border-[#006B3F] transition-colors"
                    />
                  </div>
                </div>

                {/* 2FA info badge */}
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                  <ShieldCheck className="h-4 w-4 text-[#006B3F] mt-0.5 shrink-0" />

                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Secure 2-Factor Authentication via <strong>Email OTP</strong>,{" "}
                    <strong>SMS OTP</strong>, or <strong>Authenticator App</strong>.
                  </p>
                </div>

                {/* Continue button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#006B3F] hover:bg-[#005A35] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer mt-6"
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
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-[#006B3F] cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Change User ({employeeId})
                </button>
              </div>

              <div className="text-left space-y-1">
                <h2 className="text-2xl font-bold text-[#006B3F] tracking-tight">
                  Choose Verification Method
                </h2>

                <p className="text-gray-500 text-xs leading-relaxed">
                  Select your preferred two-factor authentication method.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {/* 1. EMAIL OTP */}
                <button
                  type="button"
                  disabled={loading || !availableMethods.includes("EMAIL")}
                  onClick={() => void handleSelectMethod("EMAIL")}
                  className="w-full p-4 border rounded-xl flex items-center justify-between transition-all duration-200 text-left cursor-pointer border-gray-200 hover:border-[#006B3F] hover:bg-emerald-50/50 bg-white shadow-xs"
                >
                  <div className="flex items-center space-x-3.5">
                    <div className="w-10 h-10 rounded-lg bg-emerald-100/80 text-[#006B3F] flex items-center justify-center shrink-0">
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

                {/* 2. SMS OTP */}
                {availableMethods.includes("SMS") ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleSelectMethod("SMS")}
                    className="w-full p-4 border rounded-xl flex items-center justify-between transition-all duration-200 text-left cursor-pointer border-gray-200 hover:border-[#006B3F] hover:bg-emerald-50/50 bg-white shadow-xs"
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
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSelectMethod("AUTHENTICATOR")}
                  className="w-full p-4 border rounded-xl flex items-center justify-between transition-all duration-200 text-left cursor-pointer border-gray-200 hover:border-[#006B3F] hover:bg-emerald-50/50 bg-white shadow-xs"
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
              </div>
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
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-[#006B3F] cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Choose another method
                </button>

                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 uppercase">
                  {selectedMethod === "AUTHENTICATOR"
                    ? isEnrollingTotp
                      ? "First-Time Setup"
                      : "Authenticator"
                    : `${selectedMethod} OTP`}
                </span>
              </div>

              {/* Title & Description */}
              <div className="text-left space-y-1">
                <h2 className="text-2xl font-bold text-[#006B3F] tracking-tight">
                  {selectedMethod === "AUTHENTICATOR"
                    ? isEnrollingTotp
                      ? "Set Up Authenticator"
                      : "Enter Authenticator Code"
                    : "Enter Verification Code"}
                </h2>

                <p className="text-gray-500 text-xs leading-relaxed">
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
              {otpSentNotice && selectedMethod !== "AUTHENTICATOR" && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                  {otpSentNotice}
                </div>
              )}

              {/* QR Code display for First-Time Authenticator Setup */}
              {selectedMethod === "AUTHENTICATOR" && isEnrollingTotp && totpQrSvg && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-white rounded-xl shadow-xs border border-gray-200">
                    <img
                      src={totpQrSvg}
                      alt="Authenticator QR Code"
                      className="w-44 h-44 object-contain"
                    />
                  </div>

                  <div className="text-center space-y-1">
                    <button
                      type="button"
                      onClick={() => setShowManualKey((prev) => !prev)}
                      className="text-xs font-semibold text-[#006B3F] hover:underline inline-flex items-center space-x-1 cursor-pointer"
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

              {/* Code entry form */}
              <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-5">
                <div className="space-y-2 text-left">
                  <label className="text-xs font-semibold text-gray-800">
                    {selectedMethod === "AUTHENTICATOR"
                      ? "6-Digit Authenticator Code"
                      : "6-Digit Passcode"}
                  </label>

                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                    }
                    placeholder="••••••"
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 px-4 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006B3F]/30 focus:border-[#006B3F] text-gray-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full py-3.5 px-4 bg-[#006B3F] hover:bg-[#005A35] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
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
                        className="text-xs font-semibold text-[#006B3F] hover:underline cursor-pointer"
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
                    ← Switch to {selectedMethod === "EMAIL" ? "SMS OTP or Authenticator App" : "Email OTP"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

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
                className="flex-1 py-2 bg-[#006B3F] text-white rounded-lg text-xs font-semibold hover:bg-[#005A35]"
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