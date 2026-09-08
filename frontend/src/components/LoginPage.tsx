import React, { useState, useEffect, useRef } from "react";
import { 
  Layers, ArrowRight, User, Mail, 
  Smartphone, ShieldCheck, KeyRound, QrCode, RefreshCw, 
  ChevronLeft, CheckCircle2, AlertCircle, Copy, Check,
  Monitor, LogOut, Laptop, AlertTriangle, X
} from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: (userId: string, role: string, email: string, username: string) => void;
  kickedReason?: string | null;
  onClearKickedReason?: () => void;
}

export default function LoginPage({ onLoginSuccess, kickedReason, onClearKickedReason }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Steps: 1 = Identifier Input, 2 = 3-Option MFA Choice, 3 = 6-Digit OTP Verification
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // MFA State
  const [mfaTicket, setMfaTicket] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [maskedPhone, setMaskedPhone] = useState<string>("");
  const [hasAuthenticatorSetup, setHasAuthenticatorSetup] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<"EMAIL" | "AUTHENTICATOR" | "SMS">("EMAIL");
  const [otpCode, setOtpCode] = useState<string>("");
  const [otpError, setOtpError] = useState<string>("");
  const [otpSentNotice, setOtpSentNotice] = useState<string>("");
  const [previewOtp, setPreviewOtp] = useState<string>("");


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

  const inputRef = useRef<HTMLInputElement>(null);

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

  // Countdown timer effect
  useEffect(() => {
    let interval: any;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  // Focus input when moving to step 3
  useEffect(() => {
    if (step === 3) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [step]);

  // Step 1 Submit: Identifier only (MFA required)
  const handleIdentifierSubmit = async (e?: React.FormEvent, forceLogin = false) => {
    if (e) e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setOtpError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username: username.trim(), 
          identifier: username.trim(),
          force_login: forceLogin,
          device_info: getDeviceLabel()
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "User not found");

      if (data.active_session_conflict) {
        setSessionConflict({
          deviceInfo: data.active_device_info || "Another device/browser",
          createdAt: data.session_created_at,
          message: data.message,
          onConfirm: () => {
            setSessionConflict(null);
            handleIdentifierSubmit(undefined, true);
          }
        });
        return;
      }

      // If MFA is required, transition directly to the 3-Option Selection screen
      if (data.mfa_required) {
        setMfaTicket(data.mfa_ticket);
        setMaskedEmail(data.masked_email || "your corporate email");
        setMaskedPhone(data.masked_phone || "your mobile number");
        setHasAuthenticatorSetup(!!data.has_authenticator_setup);
        setStep(2); // 3-Option Screen
      } else {
        // Direct Login
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("currentUserUsername", data.user.username);
        onLoginSuccess(data.user.id, data.user.role, data.user.email, data.user.username);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle 6-Box Segmented OTP Input
  const handleDigitChange = (val: string, index: number) => {
    const cleaned = val.replace(/\D/g, "");
    if (!cleaned && val !== "") return;

    let newCode = otpCode.split("");
    if (cleaned.length > 1) {
      // Pasted full 6-digit code
      newCode = cleaned.slice(0, 6).split("");
      setOtpCode(newCode.join(""));
      const nextIndex = Math.min(newCode.length, 5);
      const nextInput = document.getElementById(`otp-input-${nextIndex}`);
      if (nextInput) nextInput.focus();
      return;
    }

    newCode[index] = cleaned;
    const result = newCode.join("").slice(0, 6);
    setOtpCode(result);

    if (cleaned && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      const prevInput = document.getElementById(`otp-input-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  // Step 2: User picks one of the 3 MFA options
  const handleSelectMfaMethod = async (method: "EMAIL" | "AUTHENTICATOR" | "SMS") => {
    setSelectedMethod(method);
    setOtpCode("");
    setOtpError("");
    setOtpSentNotice("");
    setPreviewOtp("");

    if (method === "EMAIL" || method === "SMS") {
      setLoading(true);
      try {
        const res = await fetch("/api/auth/mfa/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket: mfaTicket, method })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to send verification code");
        
        setResendTimer(60);
        setOtpSentNotice(`6-digit code sent to ${data.destination}`);
        setPreviewOtp(data.preview_otp || "");
        setStep(3); // 6-Digit Code Screen
      } catch (err: any) {
        setOtpError(err.message);
      } finally {
        setLoading(false);
      }
    } else if (method === "AUTHENTICATOR") {
      if (!hasAuthenticatorSetup) {
        // No secret yet — open QR setup modal first, then go to code screen
        setStep(3);
        handleOpenTotpSetup();
      } else {
        setStep(3);
      }
    }
  };

  // Resend OTP for Email / SMS
  const handleResendOtp = async () => {
    if (resendTimer > 0 || loading) return;
    setLoading(true);
    setOtpError("");
    setPreviewOtp("");
    try {
      const res = await fetch("/api/auth/mfa/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: mfaTicket, method: selectedMethod })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to resend code");
      setResendTimer(60);
      setOtpSentNotice(`New verification code sent to ${data.destination}`);
      setPreviewOtp(data.preview_otp || "");
    } catch (err: any) {
      setOtpError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Open Authenticator QR Code Setup
  const handleOpenTotpSetup = async () => {
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

  // Internal Verify Function
  const executeVerification = async (codeToVerify: string, forceLogin = false) => {
    if (!codeToVerify.trim()) {
      setOtpError("Please enter your 6-digit verification code");
      return;
    }
    if (codeToVerify.trim().length < 6) {
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
          method: selectedMethod,
          code: codeToVerify.trim(),
          force_login: forceLogin,
          device_info: getDeviceLabel()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid code. Please check and try again.");

      if (data.active_session_conflict) {
        setSessionConflict({
          deviceInfo: data.active_device_info || "Another device/browser",
          createdAt: data.session_created_at,
          message: data.message,
          onConfirm: () => {
            setSessionConflict(null);
            executeVerification(codeToVerify, true);
          }
        });
        return;
      }

      // Success! Save token and log in
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("currentUserUsername", data.user.username);
      onLoginSuccess(data.user.id, data.user.role, data.user.email, data.user.username);
    } catch (err: any) {
      setOtpError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3 Submit
  const handleVerifyMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    executeVerification(otpCode);
  };

  // Controlled input: update OTP value without auto-submitting
  const handleOtpInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
    setOtpCode(val);
    if (otpError) setOtpError("");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white flex font-sans w-full selection:bg-emerald-100 selection:text-emerald-900 overflow-hidden">
      
      {/* Left side: Ramraj Cotton Heritage Green Brand Panel (Pixel-Perfect Art Matching media_1788783209805.png) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#003d27] overflow-hidden flex-col justify-center items-center select-none p-12 min-h-screen">
        
        {/* Background Dark Green */}
        <div className="absolute inset-0 bg-[#003d27]"></div>

        {/* 1. Straight Diagonal Golden Line from Bottom-Left to Top-Middle */}
        <div className="absolute inset-0 pointer-events-none z-10">
          <svg className="w-full h-full" viewBox="0 0 400 600" preserveAspectRatio="none">
            <line x1="25" y1="445" x2="245" y2="0" stroke="#f59e0b" strokeWidth="4" />
          </svg>
        </div>

        {/* 2. Top-Right Red Corner Triangle */}
        <div className="absolute top-0 right-0 w-[45%] h-[35%] pointer-events-none z-1">
          <svg className="w-full h-full" viewBox="0 0 200 200" preserveAspectRatio="none">
            <path d="M70 0 L200 0 L200 130 Z" fill="#b91c1c" />
          </svg>
        </div>

        {/* 3. Right Smooth Arc Curved Line + Inner Fill Shapes */}
        <div className="absolute top-0 right-0 w-[60%] h-[100%] pointer-events-none z-2">
          <svg className="w-full h-full" viewBox="0 0 300 600" preserveAspectRatio="none">
            {/* Smooth Arc Curve Line */}
            <path 
              d="M240 0 C120 180 120 320 300 450" 
              fill="none" 
              stroke="#f59e0b" 
              strokeWidth="4" 
            />
            {/* Bottom-Right Golden Yellow Fill */}
            <path 
              d="M300 450 C120 320 180 500 300 600 Z" 
              fill="#f59e0b" 
            />
          </svg>
        </div>

        {/* 4. Temple Gopuram Silhouette & Clouds Watermark */}
        <div className="absolute left-6 top-[22%] w-[45%] h-[50%] pointer-events-none opacity-30 z-3">
          <svg className="w-full h-full stroke-emerald-200 fill-none" viewBox="0 0 200 300">
            {/* Birds & Clouds */}
            <path d="M20 25 Q35 15 50 25 Q65 15 80 25" strokeWidth="1" strokeDasharray="3 3" />
            <path d="M40 10 Q55 0 70 10" strokeWidth="1" strokeDasharray="3 3" />
            
            {/* Main Temple Gopuram Tower 1 */}
            <path d="M80 60 L120 60 L124 88 L76 88 Z" strokeWidth="1.2" />
            <path d="M76 88 L124 88 L128 120 L72 120 Z" strokeWidth="1.2" />
            <path d="M72 120 L128 120 L132 160 L68 160 Z" strokeWidth="1.2" />
            <path d="M68 160 L132 160 L136 210 L64 210 Z" strokeWidth="1.2" />
            <path d="M64 210 L136 210 L140 270 L60 270 Z" strokeWidth="1.5" />
            
            {/* Windows & Doors */}
            <path d="M92 70 L108 70 M92 100 L108 100 M92 135 L108 135 M92 180 L108 180 M92 235 L108 235" strokeWidth="1" />
            <circle cx="100" cy="52" r="3" strokeWidth="1" />
            <circle cx="90" cy="55" r="2.5" strokeWidth="1" />
            <circle cx="110" cy="55" r="2.5" strokeWidth="1" />

            {/* Smaller Gopuram Tower 2 */}
            <path d="M30 140 L60 140 L63 170 L27 170 Z" strokeWidth="1" />
            <path d="M27 170 L63 170 L66 210 L24 210 Z" strokeWidth="1" />
            <path d="M24 210 L66 210 L70 270 L20 270 Z" strokeWidth="1.2" />
          </svg>
        </div>

        {/* 5. Top-Left Green Dot Grid Matrix (5x4) */}
        <div className="absolute top-8 left-8 grid grid-cols-5 gap-2.5 opacity-40 z-10">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
          ))}
        </div>

        {/* 6. Bottom-Left Red Shape */}
        <div className="absolute bottom-0 left-0 w-[55%] h-[46%] pointer-events-none z-4">
          <svg className="w-full h-full" viewBox="0 0 200 200" preserveAspectRatio="none">
            <path d="M0 200 L0 80 Q100 130 150 200 Z" fill="#b91c1c" />
          </svg>
        </div>

        {/* 7. Bottom-Left Red Dot Grid Matrix (5x4) */}
        <div className="absolute bottom-8 left-8 grid grid-cols-5 gap-2.5 opacity-50 z-10">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-200" />
          ))}
        </div>

        {/* 8. Bottom-Right Big Yellow Curved Wave */}
        <div className="absolute bottom-0 right-0 w-[72%] h-[40%] pointer-events-none z-5">
          <svg className="w-full h-full" viewBox="0 0 300 200" preserveAspectRatio="none">
            <path d="M0 200 Q150 100 300 140 L300 200 Z" fill="#f59e0b" />
          </svg>
        </div>

        {/* 9. Center DAAS Brand Badge & Typography */}
        <div className="relative z-20 flex flex-col items-center text-center space-y-4 animate-fadeIn">
          <div className="h-20 w-20 bg-white rounded-2xl flex items-center justify-center text-[#003d27] shadow-2xl">
            <Layers className="h-11 w-11 text-[#003d27]" />
          </div>
          
          <h1 className="font-black tracking-wider text-4xl text-white font-display uppercase drop-shadow-md">
            DAAS
          </h1>
          
          <p className="text-emerald-100/90 text-xs font-medium tracking-wide max-w-xs leading-relaxed drop-shadow-xs">
            Document Approval Automation System –<br />Enterprise Engine
          </p>
        </div>
      </div>

      {/* Right side: Login & MFA Form */}
      <div className="flex-1 flex flex-col justify-between px-8 sm:px-16 lg:px-24 py-10 bg-white relative overflow-y-auto min-h-screen">
        
        {/* Top-Right Subtle Dot Grid */}
        <div className="absolute top-6 right-6 grid grid-cols-4 gap-1.5 opacity-25">
          {[...Array(16)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-slate-400" />
          ))}
        </div>

        {/* Mobile Header */}
        <div className="flex lg:hidden items-center space-x-2.5 mb-4">
          <div className="h-9 w-9 bg-[#043b2b] rounded-xl flex items-center justify-center text-white shadow-md">
            <Layers className="h-5 w-5" />
          </div>
          <span className="font-extrabold text-[#043b2b] tracking-tight text-base font-display">
            DAAS
          </span>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-4">
          
          {/* Real-time Session Kicked Notification Banner */}
          {kickedReason && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3 shadow-xs animate-shake">
              <div className="p-1 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-amber-900 tracking-wide uppercase">Session Terminated</h4>
                <p className="text-xs text-amber-700 font-medium mt-0.5 leading-relaxed">{kickedReason}</p>
              </div>
              {onClearKickedReason && (
                <button
                  type="button"
                  onClick={onClearKickedReason}
                  className="text-amber-500 hover:text-amber-800 text-xs shrink-0 p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 1: IDENTIFIER INPUT (USERNAME OR EMPLOYEE ID) */}
          {/* ============================================================ */}
          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-1.5">
                <h2 className="text-3xl font-extrabold text-[#043b2b] tracking-tight font-display">
                  Welcome <span className="text-[#bd1c2b]">back!</span>
                </h2>
                <p className="text-slate-500 text-xs font-medium">
                  Enter your Username, Employee ID, or Email to sign in.
                </p>
              </div>

              <form onSubmit={handleIdentifierSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#043b2b] uppercase tracking-wider">Username / Employee ID / Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoFocus
                      placeholder="Enter your username"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#043b2b]/30 focus:border-[#043b2b] text-sm text-slate-800 transition-all font-medium"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 mt-2 bg-[#043b2b] hover:bg-[#02281d] disabled:bg-slate-300 text-white font-bold text-sm rounded-lg transition-all duration-200 shadow-md flex items-center justify-center space-x-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#043b2b]/40 group"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="font-bold tracking-wider text-xs uppercase">Verifying ID...</span>
                    </div>
                  ) : (
                    <>
                      <span>Continue with MFA</span>
                      <ArrowRight className="h-4 w-4 text-[#f5a623] group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              {/* IT Support Link */}
              <p className="mt-6 text-center text-xs text-slate-500 font-medium">
                Having trouble signing in?{' '}
                <button type="button" className="text-[#043b2b] hover:underline font-bold">
                  Contact IT Support
                </button>
              </p>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 2: 3-OPTION MFA METHOD SELECTION */}
          {/* ============================================================ */}
          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200/80 text-[11px] font-bold uppercase tracking-wider">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Two-Step Verification</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
                  Choose verification method
                </h2>
                <p className="text-slate-500 text-xs font-medium leading-relaxed">
                  Authenticating as <span className="font-bold text-emerald-700">{username}</span>. Select your verification channel:
                </p>
              </div>

              {/* Error Message */}
              {otpError && (
                <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-xl flex items-center space-x-2 text-xs font-medium text-rose-800 animate-fadeIn">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              {/* 3 Interactive Option Cards */}
              <div className="space-y-3 pt-1">
                
                {/* Option 1: Email OTP */}
                <button
                  type="button"
                  onClick={() => handleSelectMfaMethod("EMAIL")}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-500 bg-white hover:bg-emerald-50/30 transition-all duration-200 shadow-xs hover:shadow-md group flex items-start space-x-3.5 cursor-pointer relative"
                >
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-emerald-950">Email OTP</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">Instant</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Send 6-digit passcode to <span className="font-semibold text-slate-700">{maskedEmail}</span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-1 transition-all absolute right-4 top-1/2 -translate-y-1/2" />
                </button>

                {/* Option 2: Authenticator App */}
                <button
                  type="button"
                  onClick={() => handleSelectMfaMethod("AUTHENTICATOR")}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-amber-500 bg-white hover:bg-amber-50/30 transition-all duration-200 shadow-xs hover:shadow-md group flex items-start space-x-3.5 cursor-pointer relative"
                >
                  <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 group-hover:bg-amber-500 group-hover:text-white transition-colors shrink-0">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-amber-950">Authenticator App</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md">TOTP</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Use code from <span className="font-semibold text-slate-700">Google / Microsoft Authenticator</span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-1 transition-all absolute right-4 top-1/2 -translate-y-1/2" />
                </button>

                {/* Option 3: SMS OTP */}
                <button
                  type="button"
                  onClick={() => handleSelectMfaMethod("SMS")}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-rose-500 bg-white hover:bg-rose-50/30 transition-all duration-200 shadow-xs hover:shadow-md group flex items-start space-x-3.5 cursor-pointer relative"
                >
                  <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 group-hover:bg-rose-500 group-hover:text-white transition-colors shrink-0">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-rose-950">Mobile SMS OTP</span>
                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-md">SMS</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Send text message to <span className="font-semibold text-slate-700">{maskedPhone}</span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-emerald-600 group-hover:translate-x-1 transition-all absolute right-4 top-1/2 -translate-y-1/2" />
                </button>

              </div>

              {/* Back to ID */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold text-emerald-700 hover:underline transition inline-flex items-center space-x-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Change Username / ID</span>
                </button>
              </div>

              {/* IT Support Link */}
              <p className="mt-4 text-center text-xs text-slate-500 font-medium">
                Having trouble signing in?{' '}
                <button type="button" className="text-emerald-700 hover:underline font-bold">
                  Contact IT Support
                </button>
              </p>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 3: 6-DIGIT CODE VERIFICATION SCREEN */}
          {/* ============================================================ */}
          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs font-semibold text-emerald-700 hover:underline transition inline-flex items-center space-x-1 mb-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Choose a different method</span>
                </button>

                <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
                  {selectedMethod === "AUTHENTICATOR" ? "Enter Authenticator Code" : "Enter Verification Code"}
                </h2>

                <p className="text-slate-500 text-xs font-medium leading-relaxed">
                  {selectedMethod === "EMAIL" && (
                    <>A 6-digit code has been dispatched to <span className="font-semibold text-slate-800">{maskedEmail}</span>.</>
                  )}
                  {selectedMethod === "SMS" && (
                    <>A 6-digit SMS text code has been dispatched to <span className="font-semibold text-slate-800">{maskedPhone}</span>.</>
                  )}
                  {selectedMethod === "AUTHENTICATOR" && (
                    <>Open the <span className="font-semibold text-slate-800">Google Authenticator</span> or <span className="font-semibold text-slate-800">Microsoft Authenticator</span> app on your phone to view the 6-digit rolling code.</>
                  )}
                </p>
              </div>

              {/* Success Notification if code sent */}
              {otpSentNotice && (
                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl flex items-center space-x-2 text-xs font-medium text-emerald-800 animate-fadeIn">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{otpSentNotice}</span>
                </div>
              )}

              {/* Error Message */}
              {otpError && (
                <div className="p-3 bg-rose-50 border border-rose-200/80 rounded-xl flex items-center space-x-2 text-xs font-medium text-rose-800 animate-fadeIn">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              {/* Sandbox OTP Helper Banner */}
              {previewOtp && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium flex flex-col space-y-1 animate-fadeIn shadow-2xs">
                  <div className="flex items-center space-x-1.5 font-bold text-amber-800">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Sandbox OTP Helper</span>
                  </div>
                  <div className="pt-0.5">
                    Your verification code is: <strong className="font-mono text-slate-900 font-black text-sm ml-1 bg-amber-100/80 px-1.5 py-0.5 rounded">{previewOtp}</strong>
                  </div>
                  <span className="text-[11px] text-amber-700/80">
                    SMTP Delivery may fail in local sandboxes. Use the above code to log in.
                  </span>
                </div>
              )}

              <form onSubmit={handleVerifyMfaSubmit} className="space-y-5">
                {/* 6 Individual Segmented Digit Input Boxes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">6-Digit Code</label>
                  <div className="flex justify-between items-center space-x-2 py-1">
                    {[0, 1, 2, 3, 4, 5].map((index) => {
                      const digit = otpCode[index] || "";
                      const isCurrent = otpCode.length === index || (index === 5 && otpCode.length === 6);
                      return (
                        <input
                          key={index}
                          id={`otp-input-${index}`}
                          type="text"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleDigitChange(e.target.value, index)}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          className={`w-12 h-14 text-center font-mono text-xl font-bold rounded-xl border transition-all ${
                            digit
                              ? "border-emerald-600 bg-white text-slate-900 shadow-xs"
                              : isCurrent
                              ? "border-emerald-600 ring-2 ring-emerald-500/20 bg-white"
                              : "border-slate-200 bg-slate-50 text-slate-400"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Resend OTP / Authenticator Help Row */}
                <div className="flex items-center justify-between text-xs pt-1">
                  {selectedMethod !== "AUTHENTICATOR" ? (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendTimer > 0 || loading}
                      className="font-bold text-emerald-700 hover:underline disabled:text-slate-400 transition inline-flex items-center space-x-1"
                    >
                      <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                      <span>{resendTimer > 0 ? `Resend Code in ${resendTimer}s` : "Resend Code"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenTotpSetup}
                      className="font-bold text-emerald-700 hover:underline transition inline-flex items-center space-x-1"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      <span>First time? Scan QR Code</span>
                    </button>
                  )}
                </div>

                {/* Verify & Proceed Button */}
                <button
                  type="submit"
                  disabled={loading || otpCode.length < 6}
                  className={`w-full py-3.5 mt-2 text-white font-bold text-sm rounded-xl transition-all duration-200 shadow-md flex items-center justify-center space-x-2 cursor-pointer focus:outline-none ${
                    otpCode.length === 6
                      ? "bg-[#043b2b] hover:bg-[#02281d]"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  }`}
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="font-bold tracking-wider text-xs uppercase">Verifying Code...</span>
                    </div>
                  ) : (
                    <span>Proceed to Dashboard</span>
                  )}
                </button>
              </form>

              {/* IT Support Link */}
              <p className="mt-6 text-center text-xs text-slate-500 font-medium">
                Having trouble signing in?{' '}
                <button type="button" className="text-emerald-700 hover:underline font-bold">
                  Contact IT Support
                </button>
              </p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="text-center text-[11px] text-slate-400 font-medium py-4">
          &copy; 2026 DocuFlow Solutions LLC &bull; Enterprise Secure Auth
        </div>
      </div>

      {/* ============================================================ */}
      {/* TOTP AUTHENTICATOR APP QR SETUP MODAL */}
      {/* ============================================================ */}
      {showTotpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <QrCode className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-base text-slate-900">Set Up Authenticator</h3>
              </div>
              <button 
                onClick={() => setShowTotpModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Scan this QR code with <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or your password manager:
            </p>

            {/* QR Code Frame */}
            <div className="flex justify-center p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
              {totpQrSvg ? (
                <img src={totpQrSvg} alt="Authenticator QR Code" className="w-48 h-48 object-contain" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">Loading QR...</div>
              )}
            </div>

            {/* Secret Key Fallback */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase">Or enter key manually:</label>
              <div className="flex items-center justify-between bg-slate-100 px-3 py-2 rounded-lg font-mono text-xs text-slate-800">
                <span className="truncate">{totpSecret}</span>
                <button 
                  type="button" 
                  onClick={() => copyToClipboard(totpSecret)}
                  className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold ml-2 inline-flex items-center space-x-1"
                >
                  {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedSecret ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTotpModal(false)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition"
            >
              Done & Return to Login
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* ACTIVE CONCURRENT SESSION TAKEOVER PROMPT MODAL */}
      {/* ============================================================ */}
      {sessionConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200/80 space-y-5 animate-scaleUp">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 font-display">Active Session Detected</h3>
                <p className="text-xs text-slate-500 font-medium">Single Active Device Policy</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
              <p className="text-xs text-slate-700 leading-relaxed">
                An active session is currently signed in for <strong className="text-slate-900">{username.trim()}</strong> on:
              </p>
              <div className="flex items-center space-x-2.5 py-2 px-3 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs font-semibold">
                <Laptop className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="truncate">{sessionConflict.deviceInfo}</span>
              </div>
              {sessionConflict.createdAt && (
                <p className="text-[11px] text-slate-500">
                  Active since: {(() => {
                    const iso = sessionConflict.createdAt.endsWith("Z") ? sessionConflict.createdAt : `${sessionConflict.createdAt}Z`;
                    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                  })()}
                </p>
              )}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              To protect financial data and audit integrity, only one active device session is permitted. Would you like to terminate the other session and sign in on this device?
            </p>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSessionConflict(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sessionConflict.onConfirm}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition shadow-md shadow-blue-600/20 flex items-center justify-center space-x-1.5"
              >
                <LogOut className="h-3.5 w-3.5 rotate-180" />
                <span>Terminate & Continue</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
