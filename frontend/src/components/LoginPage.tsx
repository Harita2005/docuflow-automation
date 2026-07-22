import React, { useState, useEffect } from "react";
import { Lock, Layers, ArrowRight, User, Eye, EyeOff } from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: (userId: string, role: string, email: string, username: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = Email/ID input, 2 = Password input

  useEffect(() => {
    // Microsoft SSO Login parameter parsing (disabled for now)
    /*
    const params = new URLSearchParams(window.location.search);
    const ssoError = params.get("sso_error");
    const token = params.get("token");
    const id = params.get("id");
    const role = params.get("role");
    const email = params.get("email");
    const uname = params.get("username");

    if (ssoError) {
      alert("SSO Login Failed: " + decodeURIComponent(ssoError));
      // Clean up search parameters from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (token && id && role && email && uname) {
      localStorage.setItem("authToken", token);
      localStorage.setItem("currentUserUsername", uname);
      onLoginSuccess(id, role, email, uname);
      // Clean up search parameters from address bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    */
  }, [onLoginSuccess]);

  const handleIdentifierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;

    /* Commented out Microsoft SSO redirection for email inputs
    if (username.includes("@")) {
      // If it is an email, redirect to Microsoft SSO authorize endpoint
      setLoading(true);
      window.location.href = `/api/auth/microsoft/login?login_hint=${encodeURIComponent(username)}`;
    } else {
      // If it is a local employee ID/username, transition to password input step
      setStep(2);
    }
    */
    
    // Always transition to local password input step
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: username, password })
      });
      
      let data: any = {};
      const contentType = res.headers?.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else if (!res.headers) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(res.ok ? "Invalid JSON response" : `Server error: ${res.status} ${text.substring(0, 50)}`);
      }


      if (!res.ok) throw new Error(data.error || "Login failed");
      
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("currentUserUsername", data.user.username);
      onLoginSuccess(data.user.id, data.user.role, data.user.email, data.user.username);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-white flex font-sans w-full selection:bg-blue-100 selection:text-blue-800">
      
      {/* Left side: Premium Wave Panel (Matching Theme) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#0f172a] overflow-hidden justify-center items-center select-none">
        {/* Layered Waves in Navy / Blue Theme */}
        <div className="absolute -top-[10%] -left-[10%] w-[120%] h-[90%] bg-[#1e293b] rounded-b-[40%_60%] transform rotate-[-5deg]"></div>
        <div className="absolute -top-[20%] -left-[20%] w-[140%] h-[75%] bg-[#1e3a8a] rounded-b-[50%_70%] transform rotate-[-8deg]"></div>
        <div className="absolute -top-[30%] -left-[30%] w-[160%] h-[60%] bg-[#2563eb] rounded-b-[60%_80%] transform rotate-[-12deg]"></div>
        
        {/* Brand Logo centered at the bottom third */}
        <div className="absolute bottom-[20%] flex flex-col items-center text-center space-y-4 z-10 animate-fadeIn">
          <div className="h-14 w-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white border border-white/20 shadow-xl shadow-blue-600/30">
            <Layers className="h-8 w-8" />
          </div>
          <span className="font-extrabold tracking-widest text-2xl text-white font-display uppercase mt-2 drop-shadow-sm">
            DocuFlow
          </span>
        </div>
      </div>

      {/* Right side: Reference Login Form (Restored to Old Design) */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-16 lg:px-24 py-16 bg-white relative">
        {/* Mobile Header (Shown on small screens) */}
        <div className="absolute top-8 left-8 flex lg:hidden items-center space-x-2.5">
          <div className="h-9 w-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Layers className="h-5 w-5" />
          </div>
          <span className="font-extrabold text-slate-900 tracking-tight text-base font-display">
            DocuFlow
          </span>
        </div>

        <div className="w-full max-w-md mx-auto">
          {/* Welcome Text */}
          <div className="space-y-2 mb-10 animate-fadeIn">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-display">
              Welcome back
            </h2>
            <p className="text-slate-500 text-sm font-medium">
              Enter your credentials to access your account.
            </p>
          </div>

          <form onSubmit={step === 1 ? handleIdentifierSubmit : handleSubmit} className="space-y-5 animate-fadeIn" style={{ animationDelay: '0.05s' }}>
            {/* Step 1: Identifier Field */}
            {step === 1 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Email, Username, or Employee ID</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="e.g. alerts@ramrajcotton.net or EMP-1001"
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 text-sm placeholder:text-slate-400 text-slate-800 transition-all font-medium shadow-sm"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Show identifier details + Password Field */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="flex justify-between items-center bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-700">{username}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Change
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full pl-11 pr-12 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 text-sm placeholder:text-slate-400 text-slate-800 transition-all font-medium shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-4 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-400 text-white font-semibold text-sm rounded-xl transition-all duration-300 shadow-lg shadow-slate-900/20 hover:shadow-blue-600/30 flex items-center justify-center space-x-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-500/30 group"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="font-bold tracking-wider text-xs uppercase">Processing...</span>
                </div>
              ) : (
                <>
                  <span>{step === 1 ? "Next" : "Sign in to account"}</span>
                  <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>


          {/* IT Support Link */}
          <p className="mt-8 text-center text-sm text-slate-500 font-medium animate-fadeIn" style={{ animationDelay: '0.1s' }}>
            Don't have an account?{' '}
            <button className="text-blue-600 hover:text-blue-700 font-semibold transition">
              Contact IT Support
            </button>
          </p>
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 left-0 right-0 text-center text-xs text-slate-400 font-medium">
          &copy; 2026 DocuFlow Solutions LLC
        </div>
      </div>
      
    </div>
  );
}
