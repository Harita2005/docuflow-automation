import React, { useState, useEffect, useRef } from "react";
import {
  Layers,
  User,
  Mail,
  ChevronLeft,
  AlertCircle,
  AlertTriangle,
  X,
} from "lucide-react";
import kolamSolidImg from "../assets/kolam_solid_white.png";

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

  // 1 = Employee ID, 2 = OTP verification
  const [step, setStep] = useState<1 | 2>(1);

  // MFA state
  const [mfaTicket, setMfaTicket] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSentNotice, setOtpSentNotice] = useState("");
  const [resendTimer, setResendTimer] = useState(0);
  const [loginMethod, setLoginMethod] = useState<"EMAIL" | "SMS" | "AUTHENTICATOR">("EMAIL");

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
    if (step === 2) {
      const timer = window.setTimeout(() => {
        otpInputRef.current?.focus();
      }, 150);

      return () => window.clearTimeout(timer);
    }
  }, [step]);

  // ---------------------------------------------------------------------------
  // Send Email OTP
  // ---------------------------------------------------------------------------

  const handleSendOtp = async () => {
    const identifier = employeeId.trim();

    if (!identifier) {
      setOtpError("Please enter your Employee ID");
      return;
    }

    setLoading(true);
    setOtpError("");
    setOtpSentNotice("");

    try {
      // Step 1:
      // Backend finds the user using Employee ID / username.
      // Backend should obtain the registered email from the database.
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
          data.detail || "Unable to start authentication"
        );
      }

      // If MFA is required, backend should return an MFA ticket.
      if (data.mfa_required) {
        if (!data.mfa_ticket) {
          throw new Error("Authentication ticket was not returned");
        }

        setMfaTicket(data.mfa_ticket);
        setMaskedEmail(data.masked_email || "your registered email");

        // Step 2:
        // Send OTP to the email associated with this employee.
        const sendRes = await fetch("/api/auth/mfa/send-otp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ticket: data.mfa_ticket,
            method: "EMAIL",
          }),
        });

        const sendData = await sendRes.json().catch(() => ({}));

        if (!sendRes.ok) {
          throw new Error(
            sendData.detail || "Failed to send verification code"
          );
        }

        setOtpSentNotice(
          sendData.message ||
            `A verification code has been sent to ${
              data.masked_email || "your registered email"
            }.`
        );

        setResendTimer(60);
        setOtpCode("");
        setStep(2);
        return;
      }

      // Direct login if backend does not require MFA.
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
  // Resend Email OTP
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
          method: "EMAIL",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.detail || "Failed to resend verification code"
        );
      }

      setOtpSentNotice(
        data.message ||
          "A new verification code has been sent to your registered email."
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
  // Verify Email OTP
  // ---------------------------------------------------------------------------

  const handleVerifyOtp = async (
    e: React.FormEvent,
    forceLogin = false
  ) => {
    e.preventDefault();

    const code = otpCode.trim();

    if (!code) {
      setOtpError("Please enter your 6-digit verification code");
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
          method: "EMAIL",
          code,
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

            // Retry verification with force_login=true.
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
  // Return to Employee ID
  // ---------------------------------------------------------------------------

  const handleBack = () => {
    setStep(1);
    setOtpCode("");
    setOtpError("");
    setOtpSentNotice("");
    setMfaTicket("");
    setMaskedEmail("");
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
          {/* STEP 1 */}
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
                  void handleSendOtp();
                }}
                className="space-y-5 pt-2"
              >
                {/* Employee ID */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-gray-800">
                    Employee ID
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
                      placeholder="Enter your Employee ID"
                      required
                      autoFocus
                      autoComplete="username"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006B3F]/30 focus:border-[#006B3F] transition-colors"
                    />
                  </div>
                </div>

                {/* Email OTP information */}
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
                  <Mail className="h-4 w-4 text-[#006B3F] mt-0.5 shrink-0" />

                  <p className="text-xs text-emerald-800 leading-relaxed">
                    A 6-digit verification code will be sent
                    to the email address registered with your
                    Employee ID.
                  </p>
                </div>

                {/* Send OTP */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#006B3F] hover:bg-[#005A35] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer mt-6"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Sending OTP...</span>
                    </div>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" />
                      <span>Send OTP</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================= */}
          {/* STEP 2 */}
          {/* ============================================================= */}

          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-[#006B3F] cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Change Employee ID
                </button>

                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  EMAIL OTP
                </span>
              </div>

              <div className="text-left space-y-1">
                <h2 className="text-2xl font-bold text-[#006B3F] tracking-tight">
                  Enter Verification Code
                </h2>

                <p className="text-gray-500 text-xs leading-relaxed">
                  Enter the 6-digit passcode sent to{" "}
                  <span className="font-semibold text-gray-700">
                    {maskedEmail || "your registered email"}
                  </span>
                  .
                </p>
              </div>

              {/* OTP sent notice */}
              {otpSentNotice && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                  {otpSentNotice}
                </div>
              )}

              <form
                onSubmit={(e) => void handleVerifyOtp(e)}
                className="space-y-5"
              >
                <div className="space-y-2 text-left">
                  <label className="text-xs font-semibold text-gray-800">
                    6-Digit Code
                  </label>

                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(
                        e.target.value
                          .replace(/[^0-9]/g, "")
                          .slice(0, 6)
                      )
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
                      Verify &amp; Enter Workspace
                    </span>
                  )}
                </button>

                {/* Resend */}
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