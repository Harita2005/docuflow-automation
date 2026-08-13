import React, { useState, useEffect, useRef } from "react";
import { 
  Layers, ArrowRight, User, Mail, 
  Smartphone, ShieldCheck, KeyRound, QrCode, RefreshCw, 
  ChevronLeft, CheckCircle2, AlertCircle, Copy, Check
} from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: (userId: string, role: string, email: string, username: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Steps: 1 = Identifier Input, 2 = 3-Option MFA Choice, 3 = 6-Digit OTP Verification
  const [step, setStep] = useState<1 | 2 | 3>(1);
  
  // MFA State
  const [mfaTicket, setMfaTicket] = useState<string>("");
  const [maskedEmail, setMaskedEmail] = useState<string>("");
  const [maskedPhone, setMaskedPhone] = useState<string>("");
  const [selectedMethod, setSelectedMethod] = useState<"EMAIL" | "AUTHENTICATOR" | "SMS">("EMAIL");
  const [otpCode, setOtpCode] = useState<string>("");
  const [otpError, setOtpError] = useState<string>("");
  const [otpSentNotice, setOtpSentNotice] = useState<string>("");
  
  // Resend Countdown Timer
  const [resendTimer, setResendTimer] = useState<number>(0);
  
  // TOTP QR Setup Modal State
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [totpQrSvg, setTotpQrSvg] = useState<string>("");
  const [totpSecret, setTotpSecret] = useState<string>("");
  const [copiedSecret, setCopiedSecret] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

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

  // Step 1 Submit: Identifier only (No password)
  const handleIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    setOtpError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), identifier: username.trim() })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || "User not found");

      // If MFA is required, transition directly to the 3-Option Selection screen
      if (data.mfa_required) {
        setMfaTicket(data.mfa_ticket);
        setMaskedEmail(data.masked_email || "your corporate email");
        setMaskedPhone(data.masked_phone || "your mobile number");
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

  // Step 2: User picks one of the 3 MFA options
  const handleSelectMfaMethod = async (method: "EMAIL" | "AUTHENTICATOR" | "SMS") => {
    setSelectedMethod(method);
    setOtpCode("");
    setOtpError("");
    setOtpSentNotice("");

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
        setStep(3); // 6-Digit Code Screen
      } catch (err: any) {
        setOtpError(err.message);
      } finally {
        setLoading(false);
      }
    } else if (method === "AUTHENTICATOR") {
      setStep(3); // 6-Digit Code Screen
    }
  };

  // Resend OTP for Email / SMS
  const handleResendOtp = async () => {
    if (resendTimer > 0 || loading) return;
    setLoading(true);
    setOtpError("");
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
  const executeVerification = async (codeToVerify: string) => {
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
          code: codeToVerify.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid code. Please check and try again.");

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

  // Auto-submit when user reaches 6 digits
  const handleOtpInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
    setOtpCode(val);
    if (otpError) setOtpError("");
    if (val.length === 6) {
      executeVerification(val);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="min-h-screen bg-white flex font-sans w-full selection:bg-blue-100 selection:text-blue-800">
      
      {/* Left side: Premium Wave Panel (Matching Theme) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#0f172a] overflow-hidden justify-center items-center select-none">
        <div className="absolute -top-[10%] -left-[10%] w-[120%] h-[90%] bg-[#1e293b] rounded-b-[40%_60%] transform rotate-[-5deg]"></div>
        <div className="absolute -top-[20%] -left-[20%] w-[140%] h-[75%] bg-[#1e3a8a] rounded-b-[50%_70%] transform rotate-[-8deg]"></div>
        <div className="absolute -top-[30%] -left-[30%] w-[160%] h-[60%] bg-[#2563eb] rounded-b-[60%_80%] transform rotate-[-12deg]"></div>
        
        <div className="absolute bottom-[20%] flex flex-col items-center text-center space-y-4 z-10 animate-fadeIn">
          <div className="h-14 w-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white border border-white/20 shadow-xl shadow-blue-600/30">
            <Layers className="h-8 w-8" />
          </div>
          <span className="font-extrabold tracking-widest text-2xl text-white font-display uppercase mt-2 drop-shadow-sm">
            DocuFlow
          </span>
          <p className="text-blue-200/80 text-xs font-medium tracking-wide max-w-xs">
            Enterprise Invoice Lifecycle & Automated Multi-Level Approval Engine
          </p>
        </div>
      </div>

      {/* Right side: Login & MFA Form */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-14 lg:px-20 py-12 bg-white relative overflow-y-auto">
        {/* Mobile Header */}
        <div className="absolute top-8 left-8 flex lg:hidden items-center space-x-2.5">
          <div className="h-9 w-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Layers className="h-5 w-5" />
          </div>
          <span className="font-extrabold text-slate-900 tracking-tight text-base font-display">
            DocuFlow
          </span>
        </div>

        <div className="w-full max-w-md mx-auto">
          
          {/* ============================================================ */}
          {/* STEP 1: IDENTIFIER INPUT (USERNAME OR EMPLOYEE ID) */}
          {/* ============================================================ */}
          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-display">
                  Welcome back
                </h2>
                <p className="text-slate-500 text-sm font-medium">
                  Enter your Username, Employee ID, or Email to sign in.
                </p>
              </div>

              <form onSubmit={handleIdentifierSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Username / Employee ID / Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoFocus
                      placeholder="e.g. admin or ABINAYA_00494 or 00494"
                      className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 text-sm placeholder:text-slate-400 text-slate-800 transition-all font-medium shadow-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 mt-4 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-400 text-white font-semibold text-sm rounded-xl transition-all duration-300 shadow-lg shadow-slate-900/20 hover:shadow-blue-600/30 flex items-center justify-center space-x-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-500/30 group"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="font-bold tracking-wider text-xs uppercase">Verifying ID...</span>
                    </div>
                  ) : (
                    <>
                      <span>Continue with MFA</span>
                      <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 2: 3-OPTION MFA METHOD SELECTION */}
          {/* ============================================================ */}
          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-2">
                <div className="inline-flex items-center space-x-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200/60 text-xs font-bold uppercase tracking-wider">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Two-Step Verification</span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
                  Choose verification method
                </h2>
                <p className="text-slate-500 text-xs font-medium leading-relaxed">
                  Authenticating as <span className="font-bold text-slate-800">{username}</span>. Select your verification channel:
                </p>
              </div>

              {/* 3 Interactive Option Cards */}
              <div className="space-y-3 pt-1">
                
                {/* Option 1: Email OTP */}
                <button
                  type="button"
                  onClick={() => handleSelectMfaMethod("EMAIL")}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 bg-white hover:bg-blue-50/30 transition-all duration-200 shadow-sm hover:shadow-md group flex items-start space-x-3.5 cursor-pointer relative"
                >
                  <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-blue-900">Email OTP</span>
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-md">Instant</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Send 6-digit passcode to <span className="font-semibold text-slate-700">{maskedEmail}</span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all absolute right-4 top-1/2 -translate-y-1/2" />
                </button>

                {/* Option 2: Authenticator App */}
                <button
                  type="button"
                  onClick={() => handleSelectMfaMethod("AUTHENTICATOR")}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-500 bg-white hover:bg-indigo-50/30 transition-all duration-200 shadow-sm hover:shadow-md group flex items-start space-x-3.5 cursor-pointer relative"
                >
                  <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors shrink-0">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-indigo-900">Authenticator App</span>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded-md">TOTP</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Use code from <span className="font-semibold text-slate-700">Google / Microsoft Authenticator</span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all absolute right-4 top-1/2 -translate-y-1/2" />
                </button>

                {/* Option 3: SMS OTP */}
                <button
                  type="button"
                  onClick={() => handleSelectMfaMethod("SMS")}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-amber-500 bg-white hover:bg-amber-50/30 transition-all duration-200 shadow-sm hover:shadow-md group flex items-start space-x-3.5 cursor-pointer relative"
                >
                  <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors shrink-0">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-900 group-hover:text-amber-900">Mobile SMS OTP</span>
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-md">SMS</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      Send text message to <span className="font-semibold text-slate-700">{maskedPhone}</span>
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all absolute right-4 top-1/2 -translate-y-1/2" />
                </button>

              </div>

              {/* Back to ID */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition inline-flex items-center space-x-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Change Username / ID</span>
                </button>
              </div>
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
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 transition inline-flex items-center space-x-1 mb-2"
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

              <form onSubmit={handleVerifyMfaSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">6-Digit Code</label>
                    <span className="text-[11px] font-medium text-slate-400">
                      {otpCode.length > 0 ? `${otpCode.length}/6 digits` : "Enter all 6 digits"}
                    </span>
                  </div>
                  <input
                    ref={inputRef}
                    type="text"
                    maxLength={6}
                    autoFocus
                    value={otpCode}
                    onChange={handleOtpInputChange}
                    placeholder="• • • • • •"
                    className="w-full text-center tracking-[0.5em] text-2xl font-mono py-3.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/15 focus:border-blue-600 text-slate-900 font-bold transition shadow-sm placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:text-slate-400"
                  />
                </div>

                {/* Resend OTP / Authenticator Help Row */}
                <div className="flex items-center justify-between text-xs pt-1">
                  {selectedMethod !== "AUTHENTICATOR" ? (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendTimer > 0 || loading}
                      className="font-bold text-blue-600 hover:text-blue-800 disabled:text-slate-400 transition inline-flex items-center space-x-1"
                    >
                      <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                      <span>{resendTimer > 0 ? `Resend Code in ${resendTimer}s` : "Resend Code"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenTotpSetup}
                      className="font-bold text-indigo-600 hover:text-indigo-800 transition inline-flex items-center space-x-1"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      <span>First time? Scan QR Code</span>
                    </button>
                  )}

                  <span className="text-slate-400 font-mono text-[11px]">Valid for 5 mins</span>
                </div>

                {/* Verify & Login Button (Always clickable if code entered) */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-3.5 mt-2 text-white font-semibold text-sm rounded-xl transition-all duration-300 shadow-lg flex items-center justify-center space-x-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-500/30 ${
                    otpCode.length === 6
                      ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 ring-2 ring-blue-400/50"
                      : "bg-slate-900 hover:bg-slate-800 shadow-slate-900/20"
                  }`}
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="font-bold tracking-wider text-xs uppercase">Verifying Code...</span>
                    </div>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Verify & Continue</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* IT Support Link */}
          <p className="mt-8 text-center text-xs text-slate-500 font-medium animate-fadeIn">
            Having trouble signing in?{' '}
            <button className="text-blue-600 hover:text-blue-700 font-semibold transition">
              Contact IT Support
            </button>
          </p>
        </div>

        {/* Footer */}
        <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-slate-400 font-medium">
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
      
    </div>
  );
}
