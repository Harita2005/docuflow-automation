import React, { useState, useEffect } from 'react';
import { Settings, Save, Server, BrainCircuit, RefreshCw, Zap, Check, Shield, Sliders } from 'lucide-react';

export default function AdminSystem() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Default editable keys with their human readable info
  const SYSTEM_KEYS = [
    { key: "AI_PROVIDER", default: "Ollama", desc: "Cognitive AI provider ('Ollama' or 'Gemini'). If set to Gemini, ensure GEMINI_API_KEY is in .env.", category: "AI", type: "select", options: ["Ollama", "Gemini"] },
    { key: "AI_PRIMARY_MODEL", default: "llama3.2-vision:latest", desc: "Preferred Ollama model for primary OCR extraction (Vision preferred)", category: "AI", type: "select", options: ["llama3.2-vision:latest", "llama3.1:latest", "mistral:latest", "gemini-1.5-flash"] },
    { key: "AI_FALLBACK_MODEL", default: "llama3.2:latest", desc: "Stable fallback text-only model", category: "AI", type: "select", options: ["llama3.2:latest", "llama3:latest", "qwen2.5:latest"] },
    { key: "AUTO_APPROVE_THRESHOLD", default: "0.95", desc: "Confidence score required for straight-through processing (0.0 to 1.0)", category: "System", type: "text" },
    { key: "OCR_ENGINE", default: "Tesseract+Ollama", desc: "Active OCR Pipeline Engine", category: "System", type: "select", options: ["Tesseract+Ollama", "Vision API", "Tesseract Only", "Ollama Only"] },
    { key: "APPROVAL_SLA_HOURS", default: "72", desc: "Hours before a pending approval is escalated", category: "System", type: "text" },
    { key: "DATA_RETENTION_DAYS", default: "365", desc: "Days before old invoices and logs are automatically deleted", category: "System", type: "text" },
    { key: "ORGANIZATION_NAME", default: "DocuFlow Automation", desc: "Organization / Company display name displayed on top header", category: "System", type: "text" },
    { key: "GLOBAL_REQUIRE_GRN", default: "true", desc: "If true, invoices require physical Gate Entry verification. If false, skips to Approval.", category: "System", type: "select", options: ["true", "false"] },
    { key: "MAX_WORKFLOWS_PER_COMPANY", default: "50", desc: "Maximum active workflows allowed per organization", category: "Limits & Thresholds", type: "text" },
    { key: "MAX_APPROVAL_STEPS", default: "10", desc: "Maximum approval stages allowed per workflow", category: "Limits & Thresholds", type: "text" },
    { key: "MAX_CONDITIONS_PER_RULE", default: "10", desc: "Maximum combination conditions allowed per rule", category: "Limits & Thresholds", type: "text" },
    { key: "MAX_CHECKLIST_ITEMS_PER_STAGE", default: "15", desc: "Maximum checklist verification items allowed per stage", category: "Limits & Thresholds", type: "text" },
    { key: "MAX_ATTACHMENT_SIZE_MB", default: "25", desc: "Maximum file size limit per document/attachment in Megabytes", category: "Limits & Thresholds", type: "text" },
    { key: "MAX_ATTACHMENTS_PER_DOC", default: "10", desc: "Maximum supporting attachments allowed per invoice", category: "Limits & Thresholds", type: "text" },
    { key: "MAX_LINE_ITEMS_PER_DOC", default: "500", desc: "Maximum line items displayed per document table", category: "Limits & Thresholds", type: "text" }
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
      alert("All system settings saved successfully!");
    } else {
      alert("No changes detected to save.");
    }
  };

  return (
    <div className="w-full space-y-3 font-sans text-xs">
      
      {/* HEADER BAR */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-blue-50 text-blue-600 rounded-md flex items-center justify-center font-bold shrink-0 border border-blue-100">
            <Settings className="h-3 w-3" />
          </div>
          <div>
            <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
              System & AI Configuration Engine
            </h2>
            <p className="text-[9px] font-medium text-slate-500">
              Manage cognitive models, OCR pipelines, SLA thresholds, and system limits.
            </p>
          </div>
        </div>

        <button
          onClick={saveAll}
          className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[9.5px] uppercase tracking-wide rounded-md transition shadow-2xs cursor-pointer active:scale-98 h-6.5 shrink-0"
        >
          <Save className="h-3 w-3" /> Save All Changes
        </button>
      </div>

      {/* SETTINGS CARDS GROUPS */}
      <div className="space-y-3">
        {['AI', 'System', 'Limits & Thresholds'].map(category => (
          <div key={category} className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            {/* Section Header */}
            <div className="bg-slate-50/80 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {category === 'AI' ? <BrainCircuit className="h-3 w-3 text-purple-600" /> : 
                 category === 'System' ? <Server className="h-3 w-3 text-blue-600" /> : 
                 <Sliders className="h-3 w-3 text-amber-600" />}
                <h3 className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider">
                  {category === 'AI' ? '1. COGNITIVE AI MODELS' : 
                   category === 'System' ? '2. PLATFORM THRESHOLDS & OCR' : 
                   '3. CONFIGURABLE SAFEGUARDS & LIMITS'}
                </h3>
              </div>
              <span className="text-[8px] font-bold text-slate-400">
                {configs.filter(c => c.category === category).length} Parameters
              </span>
            </div>
            
            {/* Settings Parameter Items */}
            <div className="divide-y divide-slate-100 text-[10px]">
              {configs.filter(c => c.category === category).map(c => {
                const origIdx = configs.findIndex(orig => orig.key === c.key);
                return (
                  <div key={c.key} className="p-2 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 transition">
                    {/* Left: Key & Description */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-900 text-[10px] font-mono">{c.key}</span>
                        {c.isDirty && (
                          <span className="text-[8px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.2 rounded flex items-center gap-0.5">
                            <Zap className="h-2 w-2" /> Unsaved
                          </span>
                        )}
                      </div>
                      <p className="text-[8.5px] text-slate-500 font-medium truncate mt-0.2 max-w-xl">{c.desc}</p>
                    </div>
                    
                    {/* Right: Input / Select Dropdown */}
                    <div className="w-full sm:w-64 flex items-center gap-1.5 shrink-0 justify-end">
                      {c.type === 'select' ? (
                        <select
                          value={c.value}
                          onChange={e => handleValueChange(origIdx, e.target.value)}
                          className="flex-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md font-mono font-bold text-slate-900 text-[9.5px] h-6.5 cursor-pointer focus:outline-hidden focus:border-blue-500"
                        >
                          {c.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input 
                          type="text" 
                          value={c.value} 
                          onChange={e => handleValueChange(origIdx, e.target.value)} 
                          className="flex-1 text-[9.5px] font-mono font-bold px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 focus:outline-hidden text-slate-900 h-6.5" 
                        />
                      )}

                      {c.isDirty && (
                        <button 
                          onClick={() => saveConfig(origIdx)} 
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-[8.5px] font-bold uppercase tracking-wider transition shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95 h-6.5 shrink-0"
                        >
                          <Check className="h-2.5 w-2.5" /> Save
                        </button>
                      )}
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

