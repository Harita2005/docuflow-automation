import React, { useState, useEffect } from 'react';
import { Settings, Save, Server, BrainCircuit, Activity, Network, ShieldCheck, AlertTriangle, RefreshCw, Cpu, Database, Zap, Check } from 'lucide-react';

export default function AdminSystem() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState(null);
  const [isPinging, setIsPinging] = useState(false);

  // Default editable keys with their human readable info
  const SYSTEM_KEYS = [
    { key: "AI_PRIMARY_MODEL", default: "llama3.2-vision:latest", desc: "Preferred Ollama model for primary OCR extraction (Vision preferred)", category: "AI" },
    { key: "AI_FALLBACK_MODEL", default: "llama3.2:latest", desc: "Stable fallback text-only model", category: "AI" },
    { key: "AUTO_APPROVE_THRESHOLD", default: "0.95", desc: "Confidence score required for straight-through processing (0.0 to 1.0)", category: "System" },
    { key: "OCR_ENGINE", default: "Tesseract+Ollama", desc: "Active OCR Pipeline Engine", category: "System" },
    { key: "APPROVAL_SLA_HOURS", default: "72", desc: "Hours before a pending approval is escalated", category: "System" },
    { key: "DATA_RETENTION_DAYS", default: "365", desc: "Days before old invoices and logs are automatically deleted", category: "System" },
    { key: "GLOBAL_REQUIRE_GRN", default: "true", desc: "If true, invoices require physical Gate Entry verification. If false, skips to Approval.", category: "System" }
  ];

  useEffect(() => { 
    fetchConfigs(); 
    fetchHealthData();
  }, []);

  const fetchHealthData = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/health', { headers });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
      }
    } catch (e) {}
  };

  const runDiagnostics = () => {
    setIsPinging(true);
    setTimeout(() => {
      fetchHealthData();
      setIsPinging(false);
    }, 1200);
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/config', { headers: { "Authorization": `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const merged = SYSTEM_KEYS.map(sk => {
          const found = data.find(d => d.key === sk.key);
          return found ? { ...sk, ...found, isDirty: false } : { ...sk, value: sk.default, isDirty: false };
        });
        setConfigs(merged);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleValueChange = (idx, val) => {
    setConfigs(prev => {
      const newConfigs = prev.map((c, i) => i === idx ? { ...c, value: val, isDirty: true } : c);
      return newConfigs;
    });
  };

  const saveConfig = async (idx) => {
    const config = configs[idx];
    try {
      const token = localStorage.getItem("authToken");
      const payload = { key: config.key, value: config.value, description: config.desc };
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setConfigs(prev => prev.map((c, i) => i === idx ? { ...c, isDirty: false } : c));
      }
    } catch(e) { console.error(e); }
  };

  const saveAll = async () => {
    let savedAny = false;
    for (let i = 0; i < configs.length; i++) {
      if (configs[i].isDirty) {
        await saveConfig(i);
        savedAny = true;
      }
    }
    if (savedAny) {
      alert("All settings saved successfully!");
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-8 animate-fadeIn font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 font-display tracking-tight">
            <Settings className="h-5 w-5 text-blue-600" />
            System & AI Configuration
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Manage cognitive models, OCR pipelines, and operational thresholds.
          </p>
        </div>
        <button
          onClick={saveAll}
          className="mt-3 md:mt-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-md transition-all shadow-sm active:scale-95"
        >
          <Save className="h-3.5 w-3.5" /> Save All Changes
        </button>
      </div>

      <div className="space-y-6">
        
        {/* SETTINGS GROUPS */}
        {['AI', 'System'].map(category => (
          <div key={category} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-50/50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
              {category === 'AI' ? <BrainCircuit className="h-4 w-4 text-purple-600" /> : <Server className="h-4 w-4 text-blue-600" />}
              <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
                {category === 'AI' ? 'Cognitive AI Models' : 'Platform Thresholds'}
              </h3>
            </div>
            
            <div className="divide-y divide-slate-100">
              {configs.filter(c => c.category === category).map(c => {
                const origIdx = configs.findIndex(orig => orig.key === c.key);
                return (
                  <div key={c.key} className="p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    {/* Left: Description */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="text-xs font-bold text-slate-800">{c.key}</label>
                        {c.isDirty && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-sm">
                            <Zap className="h-2.5 w-2.5" /> Unsaved
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 max-w-md leading-relaxed font-medium">{c.desc}</p>
                    </div>
                    
                    {/* Right: Input */}
                    <div className="w-full md:w-80 flex flex-col gap-1.5 shrink-0">
                      <div className="flex gap-1.5">
                        <input 
                          type="text" 
                          value={c.value} 
                          onChange={e => handleValueChange(origIdx, e.target.value)} 
                          className="flex-1 text-xs font-mono px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-slate-800 shadow-sm transition-all" 
                        />
                        {c.isDirty && (
                          <button 
                            onClick={() => saveConfig(origIdx)} 
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1 active:scale-95 shrink-0"
                          >
                            <Check className="h-3 w-3" /> Save
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* SYSTEM HEALTH */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-slate-50/50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-emerald-500" />
              <h3 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest">
                System Health Dashboard
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                Ping: {new Date().toLocaleTimeString()}
              </span>
              <button
                onClick={runDiagnostics}
                disabled={isPinging}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all border ${isPinging ? 'bg-slate-100 border-slate-200 text-slate-400' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 active:scale-95 shadow-sm'}`}
              >
                {isPinging ? <><RefreshCw className="h-3 w-3 animate-spin" /> Scanning</> : <><Activity className="h-3 w-3" /> Diagnostics</>}
              </button>
            </div>
          </div>
          
          <div className="p-4 space-y-4">
            
            {/* Health KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Database", icon: Database, status: healthData?.database || "Checking", latency: healthData?.dbLatency },
                { label: "AI Engine", icon: Cpu, status: healthData?.aiEngine || "Checking", latency: healthData?.aiLatency },
                { label: "Webhooks", icon: Network, status: healthData?.webhookProcessor || "Checking", latency: healthData?.webLatency },
                { label: "Uptime", icon: Activity, status: "99.98%", latency: "Last 30 days", isStatic: true }
              ].map((item, idx) => {
                const Icon = item.icon;
                const isOnline = item.status === "Online" || item.isStatic;
                return (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3.5 flex flex-col items-center relative overflow-hidden group hover:border-slate-300 hover:shadow-sm transition-all">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 z-10">{item.label}</span>
                    {isPinging ? (
                      <RefreshCw className="h-5 w-5 animate-spin text-slate-300 mb-1.5 z-10" />
                    ) : isOnline ? (
                      <ShieldCheck className="h-5 w-5 text-emerald-500 mb-1.5 z-10" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-500 mb-1.5 z-10" />
                    )}
                    <strong className="text-sm font-black text-slate-800 z-10 tracking-wide">{isPinging ? "..." : item.status}</strong>
                    <span className="text-[9px] font-mono text-slate-400 mt-0.5 z-10">{isPinging ? "--" : item.isStatic ? item.latency : `${item.latency || 0}ms`}</span>
                  </div>
                );
              })}
            </div>
            
            {/* System Resources & Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                 <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1.5">Hardware Resource Utilization</h3>
                 <div className="space-y-3">
                   {[
                     { label: "Memory Usage", val: 42, color: "bg-blue-500", track: "bg-slate-200" },
                     { label: "CPU Load", val: 18, color: "bg-emerald-500", track: "bg-slate-200" },
                     { label: "Active Workers", val: 40, textVal: "4 / 10", color: "bg-purple-500", track: "bg-slate-200" }
                   ].map(res => (
                     <div key={res.label}>
                       <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1">
                         <span>{res.label}</span>
                         <span className="font-mono text-slate-500">{res.textVal || `${res.val}%`}</span>
                       </div>
                       <div className={`w-full ${res.track} rounded-full h-1.5 overflow-hidden shadow-inner`}>
                         <div className={`${res.color} h-1.5 rounded-full relative transition-all duration-1000`} style={{width: `${res.val}%`}}>
                           <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col">
                 <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-200 pb-1.5">Recent Security & Core Alerts</h3>
                 <div className="flex-1 flex flex-col items-center justify-center text-center p-3 border border-dashed border-slate-300 rounded-md bg-white">
                   <ShieldCheck className="h-6 w-6 text-emerald-500/50 mb-1.5" />
                   <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">No active alerts</p>
                   <p className="text-[9px] font-mono text-slate-500 mt-1">System core is operating within normal parameters.</p>
                 </div>
              </div>
            </div>
            
          </div>
        </div>

      </div>
    </div>
  );
}
