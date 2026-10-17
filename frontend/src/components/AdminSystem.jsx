import React, { useState, useEffect } from 'react';
import { Settings, Save, Server, BrainCircuit, Zap, Check, Sliders, FolderArchive, Database, Clock, RefreshCw, Play, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';


// Default editable keys with their human readable info
const SYSTEM_KEYS = [
  { key: "AI_PROVIDER", default: "Ollama", desc: "Cognitive AI provider ('Ollama' or 'Gemini'). If set to Gemini, ensure GEMINI_API_KEY is in .env.", category: "AI", type: "select", options: ["Ollama", "Gemini"] },
  { key: "AI_PRIMARY_MODEL", default: "llama3.2-vision:latest", desc: "Preferred Ollama model for primary OCR extraction (Vision preferred)", category: "AI", type: "select", options: ["llama3.2-vision:latest", "llama3.1:latest", "mistral:latest", "gemini-1.5-flash"] },
  { key: "AI_FALLBACK_MODEL", default: "llama3.2:latest", desc: "Stable fallback text-only model", category: "AI", type: "select", options: ["llama3.2:latest", "llama3:latest", "qwen2.5:latest"] },
  { key: "AUTO_APPROVE_THRESHOLD", default: "0.95", desc: "Confidence score required for straight-through processing (0.0 to 1.0)", category: "System", type: "text" },
  { key: "OCR_ENGINE", default: "Tesseract+Ollama", desc: "Active OCR Pipeline Engine", category: "System", type: "select", options: ["Tesseract+Ollama", "Vision API", "Tesseract Only", "Ollama Only"] },
  { key: "APPROVAL_SLA_HOURS", default: "72", desc: "Hours before a pending approval is escalated", category: "System", type: "text" },
  { key: "DATA_RETENTION_DAYS", default: "365", desc: "Days before old invoices and logs are automatically deleted", category: "System", type: "text" },
  { key: "AUDIT_LOG_RETENTION_DAYS", default: "7", desc: "Days to retain audit logs in application (default: 7 days / 1 week). Expired logs are pruned.", category: "System", type: "text" },
  { key: "ORGANIZATION_NAME", default: "Document Approval & Automation System", desc: "Organization / Company display name displayed on top header", category: "System", type: "text" },
  { key: "GLOBAL_REQUIRE_GRN", default: "true", desc: "If true, invoices require physical Gate Entry verification. If false, skips to Approval.", category: "System", type: "select", options: ["true", "false"] },
  { key: "MAX_WORKFLOWS_PER_COMPANY", default: "50", desc: "Maximum active workflows allowed per organization", category: "Limits & Thresholds", type: "text" },
  { key: "MAX_APPROVAL_STEPS", default: "10", desc: "Maximum approval stages allowed per workflow", category: "Limits & Thresholds", type: "text" },
  { key: "MAX_CONDITIONS_PER_RULE", default: "10", desc: "Maximum combination conditions allowed per rule", category: "Limits & Thresholds", type: "text" },
  { key: "MAX_CHECKLIST_ITEMS_PER_STAGE", default: "15", desc: "Maximum checklist verification items allowed per stage", category: "Limits & Thresholds", type: "text" },
  { key: "MAX_ATTACHMENT_SIZE_MB", default: "25", desc: "Maximum file size limit per document/attachment in Megabytes", category: "Limits & Thresholds", type: "text" },
  { key: "MAX_ATTACHMENTS_PER_DOC", default: "10", desc: "Maximum supporting attachments allowed per invoice", category: "Limits & Thresholds", type: "text" },
  { key: "MAX_LINE_ITEMS_PER_DOC", default: "500", desc: "Maximum line items displayed per document table", category: "Limits & Thresholds", type: "text" },
  { key: "STORAGE_ROOT_DIR", default: "stored_pdfs", desc: "Absolute OS path (e.g. 'C:/DocuFlow_Storage' or 'D:/Invoices') or relative web folder name ('stored_pdfs')", category: "Physical Storage & Archival", type: "text" },
  { key: "STORAGE_FOLDER_PATTERN", default: "{YEAR}/{MONTH}/{DOC_TYPE}", desc: "Free-form configurable folder hierarchy. Tokens: {YEAR}, {MONTH}, {DAY}, {DOC_TYPE}, {VENDOR_NAME}, {COMPANY_CODE}, {DOC_NUM}, {ID}", category: "Physical Storage & Archival", type: "text" }
];

export default function AdminSystem() {
  const [configs, setConfigs] = useState(() => 
    SYSTEM_KEYS.map(sk => ({ ...sk, value: sk.default, isDirty: false }))
  );
  const [_loading, _setLoading] = useState(false);

  const [archiveSettings, setArchiveSettings] = useState({
    enabled: false,
    retention_value: 90,
    retention_unit: "Days",
    frequency: "Daily",
    scheduled_time: "02:00",
    last_run_status: "Not run yet",
    last_run_at: null,
    last_run_details: null,
  });
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveTriggering, setArchiveTriggering] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState(null);

  useEffect(() => { 
    fetchConfigs(); 
    fetchArchiveSettings();
  }, []);

  const fetchArchiveSettings = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/archive/settings', { headers });
      if (res.ok) {
        const data = await res.json();
        setArchiveSettings(data);
      }
    } catch (e) {
      console.error("Archive settings fetch error:", e);
    }
  };

  const saveArchiveSettings = async () => {
    setArchiveSaving(true);
    setArchiveMessage(null);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/archive/settings', {
        method: 'POST',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(archiveSettings)
      });
      if (res.ok) {
        const updated = await res.json();
        setArchiveSettings(updated);
        setArchiveMessage({ type: 'success', text: 'Database Archival settings saved successfully!' });
      } else {
        setArchiveMessage({ type: 'error', text: 'Failed to save Database Archival settings.' });
      }
    } catch (e) {
      setArchiveMessage({ type: 'error', text: e.message || 'Error saving archival settings.' });
    } finally {
      setArchiveSaving(false);
    }
  };

  const triggerArchiveNow = async () => {
    setArchiveTriggering(true);
    setArchiveMessage(null);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/archive/trigger', {
        method: 'POST',
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        await fetchArchiveSettings();
        setArchiveMessage({ 
          type: 'success', 
          text: data.details || `Archival executed successfully! (${data.archived_count || 0} archived)` 
        });
      } else {
        setArchiveMessage({ type: 'error', text: 'Archival run failed.' });
      }
    } catch (e) {
      setArchiveMessage({ type: 'error', text: e.message || 'Error triggering archival.' });
    } finally {
      setArchiveTriggering(false);
    }
  };

  const fetchConfigs = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/config', { headers });
      if (res.ok) {
        const data = await res.json();
        setConfigs(prev => prev.map(sk => {
          const found = data.find(d => d.key === sk.key);
          return {
            ...sk,
            value: (found && found.value !== undefined) ? found.value : (sk.value || sk.default),
            isDirty: false
          };
        }));
      }
    } catch (e) {
      console.error("Config fetch error:", e);
    }
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
        {['Physical Storage & Archival', 'Limits & Thresholds', 'System', 'AI'].map(category => (
          <div key={category} className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
            {/* Section Header */}
            <div className="bg-slate-50/80 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {category === 'Physical Storage & Archival' ? <FolderArchive className="h-3 w-3 text-indigo-600" /> : 
                 category === 'Limits & Thresholds' ? <Sliders className="h-3 w-3 text-amber-600" /> : 
                 category === 'System' ? <Server className="h-3 w-3 text-blue-600" /> :
                 <BrainCircuit className="h-3 w-3 text-purple-600" />}
                <h3 className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider">
                  {category === 'Physical Storage & Archival' ? '1. PHYSICAL STORAGE & ARCHIVAL' : 
                   category === 'Limits & Thresholds' ? '2. CONFIGURABLE SAFEGUARDS & LIMITS' : 
                   category === 'System' ? '3. PLATFORM THRESHOLDS & OCR' :
                   '4. COGNITIVE AI MODELS'}
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

      {/* DATABASE ARCHIVAL SECTION */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden mt-3">
        <div className="bg-slate-50/80 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-indigo-600" />
            <h3 className="text-[9px] font-black text-slate-800 uppercase tracking-wider">
              DATABASE ARCHIVAL (DocuFlowArchiveDB)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={triggerArchiveNow}
              disabled={archiveTriggering}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[9px] uppercase tracking-wide rounded-md transition border border-indigo-200 cursor-pointer disabled:opacity-50"
              title="Run archival immediately on eligible completed records"
            >
              {archiveTriggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
              <span>Run Archival Now</span>
            </button>
            <button
              onClick={saveArchiveSettings}
              disabled={archiveSaving}
              className="flex items-center gap-1 px-2.5 py-1 bg-[#003F28] hover:bg-[#002e1d] text-white font-bold text-[9.5px] uppercase tracking-wide rounded-md transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {archiveSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              <span>Save Archival Settings</span>
            </button>
          </div>
        </div>

        {archiveMessage && (
          <div className={`mx-3 mt-2.5 p-2 rounded-lg text-[10px] font-medium flex items-center gap-2 border ${
            archiveMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {archiveMessage.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />}
            <span>{archiveMessage.text}</span>
          </div>
        )}

        <div className="p-3.5 space-y-3.5 text-[10px]">
          {/* Row 1: Enable/Disable Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-slate-50/50 rounded-lg border border-slate-100">
            <div>
              <span className="font-extrabold text-slate-800 text-[10.5px]">Automated Archival Service</span>
              <p className="text-[9px] text-slate-500 mt-0.5">
                Automatically transfers completed records older than the retention threshold to <code className="font-mono text-indigo-600">DocuFlowArchiveDB</code>.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={archiveSettings.enabled}
                onChange={(e) => setArchiveSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#003F28]"></div>
              <span className="ml-2 text-[10px] font-bold text-slate-700">
                {archiveSettings.enabled ? "Enabled" : "Disabled"}
              </span>
            </label>
          </div>

          {/* Row 2: Parameters Grid (Only Retention Threshold & Scheduled Time) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Archive After (Retention Period) */}
            <div className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg flex flex-col justify-between">
              <div>
                <label className="block text-[9px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Database className="h-2.5 w-2.5 text-indigo-600" />
                  <span>Archive Data Older Than (Retention Threshold)</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={archiveSettings.retention_value}
                    onChange={(e) => setArchiveSettings(prev => ({ ...prev, retention_value: parseInt(e.target.value) || 1 }))}
                    className="w-24 px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-[10px] text-slate-900 focus:outline-none focus:border-[#003F28]"
                  />
                  <select
                    value={archiveSettings.retention_unit}
                    onChange={(e) => setArchiveSettings(prev => ({ ...prev, retention_unit: e.target.value }))}
                    className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded font-bold text-[10px] text-slate-800 focus:outline-none focus:border-[#003F28] cursor-pointer"
                  >
                    <option value="Days">Days</option>
                    <option value="Months">Months</option>
                    <option value="Years">Years</option>
                  </select>
                </div>
              </div>
              <p className="text-[8.5px] text-slate-400 mt-2">
                Eligible completed records (Approved, Settled, Paid, Rejected, or Cancelled) older than this will be pushed to archive.
              </p>
            </div>

            {/* Scheduled Execution Time */}
            <div className="p-2.5 bg-slate-50/70 border border-slate-200 rounded-lg flex flex-col justify-between">
              <div>
                <label className="block text-[9px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5 text-slate-500" />
                  <span>Scheduled Archival Time (UTC)</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Scheduled hour selector"
                    value={archiveSettings.scheduled_time ? (archiveSettings.scheduled_time.split(':')[0] || '02') : '02'}
                    onChange={(e) => {
                      const h = e.target.value;
                      const m = archiveSettings.scheduled_time ? (archiveSettings.scheduled_time.split(':')[1] || '00') : '00';
                      const safeM = ['00', '15', '30', '45'].includes(m) ? m : '00';
                      setArchiveSettings(prev => ({ ...prev, scheduled_time: `${h}:${safeM}` }));
                    }}
                    className="w-1/2 px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-[10px] text-slate-900 focus:outline-none focus:border-[#003F28] cursor-pointer"
                  >
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map(h => (
                      <option key={h} value={h}>{h} hr</option>
                    ))}
                  </select>
                  <span className="font-bold text-slate-400">:</span>
                  <select
                    aria-label="Scheduled minute selector"
                    value={['00', '15', '30', '45'].includes(archiveSettings.scheduled_time?.split(':')[1]) ? archiveSettings.scheduled_time.split(':')[1] : '00'}
                    onChange={(e) => {
                      const m = e.target.value;
                      const h = archiveSettings.scheduled_time ? (archiveSettings.scheduled_time.split(':')[0] || '02') : '02';
                      setArchiveSettings(prev => ({ ...prev, scheduled_time: `${h}:${m}` }));
                    }}
                    className="w-1/2 px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-[10px] text-slate-900 focus:outline-none focus:border-[#003F28] cursor-pointer"
                  >
                    {["00", "15", "30", "45"].map(m => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[8.5px] text-slate-400 mt-2">
                Off-peak execution time when the automated background archival service runs.
              </p>
            </div>
          </div>

          {/* Row 3: Last Run Status & Date */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider">Last Run Status:</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${
                archiveSettings.last_run_status === 'SUCCESS' || archiveSettings.last_run_status === 'COMPLETED'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : archiveSettings.last_run_status === 'FAILED'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {archiveSettings.last_run_status || 'Not run yet'}
              </span>
            </div>

            <div className="flex items-center gap-3 text-[9px] text-slate-500">
              <div>
                <span className="font-semibold text-slate-400">Last Executed: </span>
                <span className="font-mono font-bold text-slate-700">
                  {archiveSettings.last_run_at ? new Date(archiveSettings.last_run_at).toLocaleString() : '—'}
                </span>
              </div>
              <button
                type="button"
                onClick={fetchArchiveSettings}
                className="p-1 hover:bg-slate-200 rounded text-slate-600 transition"
                title="Refresh archival status"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          {archiveSettings.last_run_details && (
            <div className="text-[8.5px] font-mono text-slate-500 bg-white p-2 rounded border border-slate-100 break-words">
              <strong>Execution Trace: </strong>{archiveSettings.last_run_details}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

