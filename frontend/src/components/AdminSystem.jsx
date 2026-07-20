import React, { useState, useEffect } from 'react';
import { Settings, Save, Server, BrainCircuit, Network, RefreshCw, Zap, Check } from 'lucide-react';

export default function AdminSystem() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Default editable keys with their human readable info
  const SYSTEM_KEYS = [
    { key: "AI_PRIMARY_MODEL", default: "llama3.2-vision:latest", desc: "Preferred Ollama model for primary OCR extraction (Vision preferred)", category: "AI" },
    { key: "AI_FALLBACK_MODEL", default: "llama3.2:latest", desc: "Stable fallback text-only model", category: "AI" },
    { key: "AUTO_APPROVE_THRESHOLD", default: "0.95", desc: "Confidence score required for straight-through processing (0.0 to 1.0)", category: "System" },
    { key: "OCR_ENGINE", default: "Tesseract+Ollama", desc: "Active OCR Pipeline Engine", category: "System" },
    { key: "APPROVAL_SLA_HOURS", default: "72", desc: "Hours before a pending approval is escalated", category: "System" },
    { key: "DATA_RETENTION_DAYS", default: "365", desc: "Days before old invoices and logs are automatically deleted", category: "System" },
    { key: "GLOBAL_REQUIRE_GRN", default: "true", desc: "If true, invoices require physical Gate Entry verification. If false, skips to Approval.", category: "System" },
    { key: "EXTERNAL_DOCS_API_URL", default: "https://api.external-erp.com/v1/debit-notes", desc: "Integration API endpoint to fetch external documents (e.g., Debit Notes, Credit Notes)", category: "Integrations" },
    { key: "EXTERNAL_DOCS_FETCH_INTERVAL", default: "60", desc: "Interval in minutes to automatically poll the external documents API", category: "Integrations" }
  ];

  useEffect(() => { 
    fetchConfigs(); 
  }, []);

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

  const handleSyncIntegrations = async () => {
    setSyncing(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/integrations/fetch-external-docs", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
      } else {
        const err = await res.json();
        alert(`Integration error: ${err.error || "Failed to connect to external endpoint"}`);
      }
    } catch (e) {
      alert(`Connection failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto mb-8 animate-fadeIn font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 font-display tracking-tight">
            <Settings className="h-4.5 w-4.5 text-blue-600" />
            System & AI Configuration
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Manage cognitive models, OCR pipelines, and operational thresholds.
          </p>
        </div>
        <button
          onClick={saveAll}
          className="mt-3 md:mt-0 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[9px] uppercase tracking-wider rounded-md transition-all shadow-sm active:scale-95"
        >
          <Save className="h-3 w-3" /> Save All Changes
        </button>
      </div>

      <div className="space-y-6">
        
        {/* SETTINGS GROUPS */}
        {['AI', 'System', 'Integrations'].map(category => (
          <div key={category} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-50/50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {category === 'AI' ? <BrainCircuit className="h-3.5 w-3.5 text-purple-600" /> : 
                 category === 'System' ? <Server className="h-3.5 w-3.5 text-blue-600" /> : 
                 <Network className="h-3.5 w-3.5 text-emerald-600" />}
                <h3 className="text-[9px] font-bold text-slate-700 uppercase tracking-widest">
                  {category === 'AI' ? 'Cognitive AI Models' : 
                   category === 'System' ? 'Platform Thresholds' : 
                   'External API Integrations'}
                </h3>
              </div>
              {category === 'Integrations' && (
                <button
                  onClick={handleSyncIntegrations}
                  disabled={syncing}
                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[8px] font-bold uppercase tracking-wider transition shadow-sm active:scale-95 disabled:bg-slate-400 cursor-pointer"
                >
                  {syncing ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              )}
            </div>
            
            <div className="divide-y divide-slate-100">
              {configs.filter(c => c.category === category).map(c => {
                const origIdx = configs.findIndex(orig => orig.key === c.key);
                return (
                  <div key={c.key} className="p-3.5 flex flex-col md:flex-row md:items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    {/* Left: Description */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="text-[11px] font-bold text-slate-800">{c.key}</label>
                        {c.isDirty && (
                          <span className="text-[7.5px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded flex items-center gap-1 shadow-sm">
                            <Zap className="h-2 w-2" /> Unsaved
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-500 max-w-md leading-relaxed font-medium">{c.desc}</p>
                    </div>
                    
                    {/* Right: Input */}
                    <div className="w-full md:w-80 flex flex-col gap-1.5 shrink-0">
                      <div className="flex gap-1.5">
                        <input 
                          type="text" 
                          value={c.value} 
                          onChange={e => handleValueChange(origIdx, e.target.value)} 
                          className="flex-1 text-[10px] font-mono px-2 py-1 bg-white border border-slate-300 rounded-md focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none text-slate-800 shadow-sm transition-all" 
                        />
                        {c.isDirty && (
                          <button 
                            onClick={() => saveConfig(origIdx)} 
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1 active:scale-95 shrink-0"
                          >
                            <Check className="h-2.5 w-2.5" /> Save
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

      </div>
    </div>
  );
}
