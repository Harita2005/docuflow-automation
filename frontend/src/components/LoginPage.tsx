import React, { useState, useEffect, useRef } from "react";
import { 
  Layers, User, Mail, MessageSquare, ShieldCheck, 
  ChevronLeft, AlertCircle, Copy, Check, AlertTriangle, X
} from "lucide-react";
import kolamSolidImg from "../assets/kolam_solid_white.png";

interface LoginPageProps {
  onLoginSuccess: (userId: string, role: string, email: string, username: string) => void;
  kickedReason?: string | null;
  onClearKickedReason?: () => void;
}

export default function LoginPage({ onLoginSuccess, kickedReason, onClearKickedReason }: LoginPageProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [loginMethod, setLoginMethod] = useState<"EMAIL" | "SMS" | "AUTHENTICATOR">("EMAIL");
  const [loading, setLoading] = useState(false);
  
  // Step: 1 = Main Login Form (as in screenshot), 2 = Enter 6-Digit OTP / TOTP
  const [step, setStep] = useState<1 | 2>(1);
  
  // MFA State
  const [mfaTicket, setMfaTicket] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [maskedPhone, setMaskedPhone] = useState<string>("");
  const [otpCode, setOtpCode] = useState<string>("");
  const [otpError, setOtpError] = useState<string>("");
  const [otpSentNotice, setOtpSentNotice] = useState<string>("");
  const [devOtp, setDevOtp] = useState<string>("");
  const [resendTimer, setResendTimer] = useState<number>(0);
  
  // TOTP QR Setup Modal State
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [totpQrSvg, setTotpQrSvg] = useState<string>("");
  const [totpSecret, setTotpSecret] = useState<string>("");
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Active Session Conflict Modal State
  interface SessionConflictData {
    deviceInfo: string;
    createdAt?: string;
    message?: string;
    onConfirm: () => void;
  }
  const [sessionConflict, setSessionConflict] = useState<SessionConflictData | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);

  const getDeviceLabel = () => {
    const ua = navigator.userAgent;
    let browser = "Browser";
    if (ua.includes("Firefox/")) browser = "Firefox";
    else if (ua.includes("Edg/")) browser = "Edge";
    else if (ua.includes("Chrome/")) browser = "Chrome";
    else if (ua.includes("Safari/")) browser = "Safari";

    let os = "Desktop";
    if (ua.includes("Win")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

    return `${browser} on ${os}`;
  };

  // Resend timer countdown effect
  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Focus OTP input when moving to step 2
  useEffect(() => {
    if (step === 2) {
      setTimeout(() => {
        otpInputRef.current?.focus();
      }, 150);
    }
  }, [step]);

  // Main submission: Initiate Login & Send OTP
  const handleSendOtp = async (overrideMethod?: "EMAIL" | "SMS" | "AUTHENTICATOR") => {
    const methodToUse = overrideMethod || loginMethod;
    if (!employeeId.trim()) {
      setOtpError("Please enter your Employee ID");
      return;
    }
    setLoading(true);
    setOtpError("");
    setOtpSentNotice("");

    try {
      // Step A: Initiate login session with Employee ID
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: employeeId.trim(),
          device_info: getDeviceLabel()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication initiation failed");

      if (data.mfa_required) {
        const ticket = data.mfa_ticket;
        setMfaTicket(ticket);
        setMaskedEmail(data.masked_email || "");
        setMaskedPhone(data.masked_phone || "");

        // Step B: If Email or SMS, trigger OTP dispatch immediately
        if (methodToUse === "EMAIL" || methodToUse === "SMS") {
          const sendRes = await fetch("/api/auth/mfa/send-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticket: ticket,
              method: methodToUse
            })
          });
          const sendData = await sendRes.json();
          if (!sendRes.ok) throw new Error(sendData.detail || "Failed to dispatch verification code");

          if (sendData.preview_otp || sendData.dev_otp) {
            const code = sendData.preview_otp || sendData.dev_otp;
            setDevOtp(code);
            setOtpCode(code); // Pre-fill for instant seamless convenience
          }

          setOtpSentNotice(sendData.message || `Verification code sent via ${methodToUse}`);
          setResendTimer(60);
        }

        setStep(2);
      } else if (data.token) {
        // Direct session created
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("currentUserUsername", data.user.username);
        onLoginSuccess(data.user.id, data.user.role, data.user.email, data.user.username);
      }
    } catch (err: any) {
      setOtpError(err.message || "Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP action
  const handleResendOtp = async () => {
    if (resendTimer > 0 || !mfaTicket) return;
    setLoading(true);
    setOtpError("");
    try {
      const res = await fetch("/api/auth/mfa/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: mfaTicket,
          method: loginMethod
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to resend code");
      if (data.preview_otp || data.dev_otp) {
        const code = data.preview_otp || data.dev_otp;
        setDevOtp(code);
        setOtpCode(code);
      }
      setOtpSentNotice(data.message || `New code sent via ${loginMethod}`);
      setResendTimer(60);
    } catch (err: any) {
      setOtpError(err.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  // Verify Code Submit
  const handleVerifyOtp = async (e: React.FormEvent, forceLogin = false) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setOtpError("Please enter your 6-digit verification code");
      return;
    }
    if (otpCode.trim().length < 6) {
      setOtpError("Please enter all 6 digits of the code");
      return;
    }

    setLoading(true);
    setOtpError("");

    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: mfaTicket,
          method: loginMethod,
          code: otpCode.trim(),
          force_login: forceLogin,
          device_info: getDeviceLabel()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid verification code");

      if (data.active_session_conflict) {
        setSessionConflict({
          deviceInfo: data.active_device_info || "Another device/browser",
          createdAt: data.session_created_at,
          message: data.message,
          onConfirm: () => {
            setSessionConflict(null);
            handleVerifyOtp(e, true);
          }
        });
        return;
      }

      // Success! Store token and enter app
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("currentUserUsername", data.user.username);
      onLoginSuccess(data.user.id, data.user.role, data.user.email, data.user.username);
    } catch (err: any) {
      setOtpError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  // Setup TOTP Authenticator App Modal
  const handleOpenTotpSetup = async () => {
    if (!mfaTicket) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa/setup-totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: mfaTicket })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to initialize Authenticator setup");
      setTotpSecret(data.secret);
      setTotpQrSvg(data.qr_svg_data_url);
      setShowTotpModal(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white flex font-sans w-full overflow-hidden select-none">
      
      {/* ========================================================================= */}
      {/* LEFT PANEL: Compact DAAS brand panel with kolam artwork */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex lg:w-[30%] relative bg-[#006B3F] overflow-hidden rounded-r-[28px] flex-col justify-center items-center p-8 min-h-screen text-white">
        
        {/* Balanced corner kolam artwork replaces the geometric box decorations. */}
        <div className="absolute top-5 left-0 h-40 w-28 overflow-hidden opacity-20 pointer-events-none select-none">
          <img src={kolamSolidImg} alt="" aria-hidden="true" className="absolute top-0 left-0 h-56 w-56 max-w-none" />
        </div>
        <div className="absolute right-0 bottom-24 h-40 w-28 overflow-hidden opacity-20 pointer-events-none select-none">
          <img src={kolamSolidImg} alt="" aria-hidden="true" className="absolute right-0 bottom-0 h-56 w-56 max-w-none" />
        </div>

        {/* Mid-Left Green Dot Matrix (4x4) */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 grid grid-cols-4 gap-2.5 opacity-30 pointer-events-none">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          ))}
        </div>

        {/* Full-width red and yellow footer geometry */}
        <div className="absolute bottom-0 left-0 w-full h-28 pointer-events-none z-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="0,100 0,26 48,100" fill="#D20A16" />
            <polygon points="48,100 100,26 100,100" fill="#F2C000" />
          </svg>
        </div>

        {/* Dot matrix inside the red footer */}
        <div className="absolute bottom-5 left-6 grid grid-cols-4 gap-2 z-20 pointer-events-none">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-yellow-300 opacity-90" />
          ))}
        </div>

        {/* Center DAAS Brand Badge */}
        <div className="relative z-30 -translate-y-10 flex flex-col items-center text-center space-y-3">
          {/* Circular White Logo Badge with 3-Layer Icon */}
          <div className="w-24 h-24 rounded-full bg-[#F4FAF7] flex items-center justify-center shadow-[0_12px_32px_rgba(0,0,0,0.22)] mb-1">
            <Layers className="w-12 h-12 text-[#006B3F]" />
          </div>
          
          <h1 className="text-4xl font-extrabold tracking-wider text-white uppercase font-display drop-shadow-sm">
            DAAS
          </h1>
          
          <p className="text-emerald-100/90 text-[11px] font-semibold tracking-[0.16em] uppercase leading-relaxed max-w-xs">
            Document Approval &<br />Automation System
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT PANEL: Clean White Authentication Form matching user image */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 py-12 bg-white relative min-h-screen">
        
        <div className="w-full max-w-md mx-auto">
          
          {/* Session Kicked Alert Banner */}
          {kickedReason && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-amber-800">
                <span className="font-bold">Session Replaced: </span>{kickedReason}
              </div>
              {onClearKickedReason && (
                <button type="button" onClick={onClearKickedReason} className="text-amber-500 hover:text-amber-800">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Global Error Banner */}
          {otpError && (
            <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="font-medium">{otpError}</span>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 1: Welcome Back Form (EXACT MATCH TO USER SCREENSHOT) */}
          {/* ===================================================================== */}
          {step === 1 && (
            <div className="space-y-6">
              
              {/* Header */}
              <div className="text-left space-y-1">
                <h2 className="text-3xl font-bold text-[#006B3F] tracking-tight">
                  Welcome Back
                </h2>
                <p className="text-gray-500 text-sm font-normal">
                  Login to access your workspace
                </p>
              </div>

              <form onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }} className="space-y-5 pt-2">
                
                {/* Employee ID Field */}
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
                      onChange={(e) => setEmployeeId(e.target.value)}
                      placeholder="Enter your Employee ID"
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006B3F]/30 focus:border-[#006B3F] transition-colors"
                    />
                  </div>
                </div>

                {/* Login Method Selector */}
                <div className="space-y-2 text-left">
                  <label className="text-xs font-semibold text-gray-800">
                    Login Method
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    
                    {/* Option 1: Email OTP */}
                    <button
                      type="button"
                      onClick={() => setLoginMethod("EMAIL")}
                      className={`py-3 px-2 rounded-lg border text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                        loginMethod === "EMAIL"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold shadow-xs"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <Mail className={`h-4 w-4 ${loginMethod === "EMAIL" ? "text-emerald-700" : "text-gray-500"}`} />
                      <span>Email OTP</span>
                    </button>

                    {/* Option 2: SMS OTP */}
                    <button
                      type="button"
                      onClick={() => setLoginMethod("SMS")}
                      className={`py-3 px-2 rounded-lg border text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                        loginMethod === "SMS"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold shadow-xs"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <MessageSquare className={`h-4 w-4 ${loginMethod === "SMS" ? "text-emerald-700" : "text-gray-500"}`} />
                      <span>SMS OTP</span>
                    </button>

                    {/* Single Authenticator option */}
                    <button
                      type="button"
                      onClick={() => setLoginMethod("AUTHENTICATOR")}
                      className={`py-3 px-2 rounded-lg border text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                        loginMethod === "AUTHENTICATOR"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 font-semibold shadow-xs"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <ShieldCheck className={`h-4 w-4 ${loginMethod === "AUTHENTICATOR" ? "text-emerald-700" : "text-gray-500"}`} />
                      <span>Authenticator</span>
                    </button>

                  </div>
                </div>

                {/* Primary CTA: Send OTP */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-[#006B3F] hover:bg-[#005A35] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer mt-6"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Processing...</span>
                    </div>
                  ) : (
                    <span>{loginMethod === "AUTHENTICATOR" ? "Continue with Authenticator" : "Send OTP"}</span>
                  )}
                </button>

              </form>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 2: 6-DIGIT OTP VERIFICATION CARD */}
          {/* ===================================================================== */}
          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setStep(1); setOtpCode(""); setOtpError(""); }}
                  className="inline-flex items-center text-xs font-medium text-gray-500 hover:text-[#006B3F] cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Change Employee ID / Method
                </button>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  {loginMethod === "AUTHENTICATOR" ? "TOTP APP" : `${loginMethod} OTP`}
                </span>
              </div>

              <div className="text-left space-y-1">
                <h2 className="text-2xl font-bold text-[#006B3F] tracking-tight">
                  Enter Verification Code
                </h2>
                <p className="text-gray-500 text-xs leading-relaxed">
                  {loginMethod === "EMAIL" && `Enter the 6-digit passcode sent to ${maskedEmail || "your registered email"}.`}
                  {loginMethod === "SMS" && `Enter the 6-digit passcode sent to ${maskedPhone || "your registered mobile"}.`}
                  {loginMethod === "AUTHENTICATOR" && "Enter the 6-digit code displayed in your Microsoft or Google Authenticator app."}
                </p>
              </div>

              {/* Screen OTP Notice for Testing/Offline Mode as requested */}
              {devOtp && (
                <div className="p-4 bg-emerald-50/90 border-2 border-emerald-300 rounded-xl shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                      </span>
                      <span className="text-xs font-bold text-emerald-900 tracking-wide">
                        Verification Code (Screen Preview):
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtpCode(devOtp)}
                      className="px-2.5 py-1 bg-[#006B3F] hover:bg-[#005A35] text-white text-[11px] font-semibold rounded-md shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      Auto-Fill
                    </button>
                  </div>
                  <div className="text-center py-1">
                    <div className="inline-block px-6 py-2 bg-white border border-emerald-200 rounded-xl shadow-sm">
                      <span className="text-3xl font-extrabold tracking-[0.35em] font-mono text-[#006B3F]">
                        {devOtp}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800 mt-2 font-medium">
                      Code is shown on screen until your company email server is connected.
                    </p>
                  </div>
                </div>
              )}

              {otpSentNotice && !devOtp && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                  {otpSentNotice}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-5">
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
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    placeholder="••••••"
                    className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 px-4 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006B3F]/30 focus:border-[#006B3F] text-gray-900"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otpCode.length < 6}
                  className="w-full py-3.5 px-4 bg-[#006B3F] hover:bg-[#005A35] disabled:bg-gray-300 text-white font-medium text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    <span>Verify & Enter Workspace</span>
                  )}
                </button>

                {/* Resend OTP countdown or Authenticator Help */}
                {loginMethod !== "AUTHENTICATOR" ? (
                  <div className="text-center pt-2">
                    {resendTimer > 0 ? (
                      <p className="text-xs text-gray-400">
                        Resend code in <span className="font-semibold text-gray-600">{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={loading}
                        className="text-xs font-semibold text-[#006B3F] hover:underline cursor-pointer"
                      >
                        Didn't receive code? Resend OTP
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={handleOpenTotpSetup}
                        className="text-xs font-semibold text-[#006B3F] hover:underline cursor-pointer"
                    >
                      First time? Scan QR Code to configure Authenticator
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TOTP Setup Modal */}
      {/* ========================================================================= */}
      {showTotpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-gray-900">Configure Authenticator App</h3>
              <button onClick={() => setShowTotpModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Scan this QR code with Microsoft Authenticator, Google Authenticator, or 1Password.
            </p>
            {totpQrSvg && (
              <div className="flex justify-center p-3 bg-gray-50 border rounded-xl">
                <img src={totpQrSvg} alt="TOTP QR Code" className="w-48 h-48" />
              </div>
            )}
            {totpSecret && (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-gray-500 uppercase">Manual Entry Key</div>
                <div className="flex items-center space-x-2 bg-gray-100 p-2 rounded-lg text-xs font-mono">
                  <span className="flex-1 truncate">{totpSecret}</span>
                  <button onClick={() => copyToClipboard(totpSecret)} className="text-emerald-700 hover:text-emerald-900">
                    {copiedSecret ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowTotpModal(false)}
              className="w-full py-2.5 bg-[#006B3F] text-white text-xs font-bold rounded-lg hover:bg-[#005A35]"
            >
              Done Scanning
            </button>
          </div>
        </div>
      )}

      {/* Active Session Conflict Modal */}
      {sessionConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-bold text-gray-900">Session Conflict</h3>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              This account is currently active on <span className="font-semibold">{sessionConflict.deviceInfo}</span>. Logging in here will terminate the other session.
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
