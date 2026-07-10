import React, { useState } from "react";
import { Lock, Layers, ArrowRight, User, Eye, EyeOff } from "lucide-react";

interface LoginPageProps {
  onLoginSuccess: (userId: string, role: string, email: string, username: string) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: username, password })
      });
      const data = await res.json();
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
    <div className="min-h-screen bg-white flex font-sans selection:bg-blue-100 selection:text-blue-800">
      
      {/* Left side: Premium Animated Gradient Panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-slate-900 overflow-hidden isolate">
        {/* Animated Gradient Mesh */}
        <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black animate-pulse opacity-80 mix-blend-screen" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[80%] h-[80%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent animate-pulse mix-blend-screen blur-3xl" style={{ animationDuration: '10s' }}></div>
        <div className="absolute top-[20%] right-[10%] w-[50%] h-[50%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-transparent animate-pulse mix-blend-screen blur-3xl" style={{ animationDuration: '12s', animationDelay: '2s' }}></div>
        
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-50"></div>
        {/* Content overlaid on image */}
        <div className="relative z-10 flex flex-col justify-between h-full p-12 lg:p-16 w-full text-white">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center text-white border border-white/20 shadow-xl">
              <Layers className="h-6 w-6" />
            </div>
            <span className="font-extrabold tracking-tight text-xl font-display">
              DocuFlow <span className="text-blue-400 font-semibold text-xs tracking-widest uppercase ml-1">Enterprise</span>
            </span>
          </div>

          <div className="max-w-md mt-auto mb-12 animate-fadeIn">
            <h1 className="text-4xl font-display font-bold leading-tight mb-6">
              Streamline your<br/>Accounts Payable.
            </h1>
            <p className="text-lg text-slate-300 font-light mb-8 leading-relaxed">
              Experience the next generation of financial workflow automation. Powerful, intuitive, and secure.
            </p>
            
            <div className="flex items-center space-x-4">
              <div className="flex -space-x-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`w-10 h-10 rounded-full border-2 border-slate-900 flex items-center justify-center font-bold text-xs ${i===1?'bg-blue-500':i===2?'bg-purple-500':i===3?'bg-emerald-500':'bg-amber-500'} shadow-md`}>
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-400 font-medium">Joined by 10,000+ teams</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side: Login Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-12 lg:px-24 py-12 bg-white relative">
        
        {/* Mobile Header (Hidden on large screens) */}
        <div className="absolute top-8 left-8 flex lg:hidden items-center space-x-2">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-md">
            <Layers className="h-4.5 w-4.5" />
          </div>
          <span className="font-extrabold text-slate-900 tracking-tight text-sm font-display">
            DocuFlow
          </span>
        </div>
    
        <div className="w-full max-w-md mx-auto animate-fadeIn" style={{ animationDelay: '0.1s' }}>
          
          <div className="space-y-2 mb-10">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight font-display">
              Welcome back
            </h2>
            <p className="text-slate-500 text-sm font-medium">
              Enter your credentials to access your account.
            </p>
          </div>
  
          <form onSubmit={handleSubmit} className="space-y-5">
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Username or Employee ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  placeholder="e.g. sconnor or EMP-1001"
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 text-sm placeholder:text-slate-400 text-slate-800 transition-all font-medium shadow-sm"
                />
              </div>
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


            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-4 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-400 text-white font-semibold text-sm rounded-xl transition-all duration-300 shadow-lg shadow-slate-900/20 hover:shadow-blue-600/30 flex items-center justify-center space-x-2 cursor-pointer focus:outline-none focus:ring-4 focus:ring-blue-500/30 group"
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="font-bold tracking-wider text-xs uppercase">Authenticating...</span>
                </div>
              ) : (
                <>
                  <span>Sign in to account</span>
                  <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500 font-medium">
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
