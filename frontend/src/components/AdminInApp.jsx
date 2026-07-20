import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Bell, BellRing, BellOff } from 'lucide-react';

const EVENTS = ["PENDING_APPROVAL", "ASSIGNED", "REJECTED", "SENT_BACK", "COMPLETED", "CLARIFICATION"];

export default function AdminInApp() {
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState([]);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const headers = {
    'Content-Type': 'application/json',
    ...(localStorage.getItem("authToken") ? { "Authorization": `Bearer ${localStorage.getItem("authToken")}` } : {})
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/inapp-config', { headers });
      if (res.ok) {
        const data = await res.json();
        // Merge fetched data with our expected EVENTS
        const merged = EVENTS.map(event => {
          const found = data.find(c => c.trigger_event === event);
          if (found) return found;
          return {
            trigger_event: event,
            enabled: true,
            title_template: "",
            message_template: ""
          };
        });
        setConfigs(merged);
      } else {
        // Fallback if API fails
        setConfigs(EVENTS.map(event => ({
          trigger_event: event,
          enabled: true,
          title_template: "",
          message_template: ""
        })));
      }
    } catch (e) {
      console.error(e);
      // Fallback on error
      setConfigs(EVENTS.map(event => ({
        trigger_event: event,
        enabled: true,
        title_template: "",
        message_template: ""
      })));
    }
    setLoading(false);
  };

  const saveConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/inapp-config', {
        method: 'POST',
        headers,
        body: JSON.stringify(configs)
      });
      if (res.ok) {
        alert('In-App Notification Configurations saved successfully!');
        fetchConfigs();
      } else {
        alert('Failed to save configurations.');
      }
    } catch (e) {
      alert('Error saving configurations: ' + e.message);
    }
    setLoading(false);
  };

  const handleChange = (idx, field, value) => {
    const newConfigs = [...configs];
    newConfigs[idx][field] = value;
    setConfigs(newConfigs);
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center bg-white px-4 py-2.5 rounded-lg shadow-sm border border-slate-200/60">
        <div>
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <BellRing className="h-4 w-4 text-amber-500" />
            In-App Notifications
          </h2>
          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
            Configure the real-time bell notification messages sent directly to users inside the application.
          </p>
        </div>
        <button 
          onClick={saveConfigs} 
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] uppercase tracking-wide rounded-md transition-colors shadow-sm disabled:opacity-50"
        >
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Configuration
        </button>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-4 py-2.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest w-1/4">Trigger Event</th>
              <th className="px-4 py-2.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest w-24 text-center">Status</th>
              <th className="px-4 py-2.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Notification Content</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config, idx) => (
              <tr key={config.trigger_event} className="border-t border-slate-100 bg-white hover:bg-blue-50/30 transition-colors">
                <td className="px-4 py-2.5 align-top">
                  <div className="text-xs font-bold text-slate-900">{config.trigger_event}</div>
                  <div className="text-[9px] font-medium text-slate-400 mt-0.5">Triggered during workflow transitions</div>
                </td>
                
                <td className="px-4 py-2.5 align-top text-center">
                  <button
                    onClick={() => handleChange(idx, 'enabled', !config.enabled)}
                    className={`inline-flex items-center justify-center p-1 rounded-full transition-colors ${config.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                    title={config.enabled ? "Disable" : "Enable"}
                  >
                    {config.enabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                  </button>
                  <div className={`text-[8px] font-black mt-0.5 uppercase ${config.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {config.enabled ? 'Active' : 'Disabled'}
                  </div>
                </td>
                
                <td className="px-4 py-2.5 align-top">
                  <div className={`flex flex-col gap-2.5 max-w-4xl transition-opacity ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Title Template</label>
                      <input 
                        type="text" 
                        className="w-full text-xs p-1.5 bg-white border border-slate-200/70 hover:border-slate-300 transition-colors rounded outline-none focus:border-amber-500"
                        placeholder="e.g. Action Required"
                        value={config.title_template || ''}
                        onChange={(e) => handleChange(idx, 'title_template', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Message Template</label>
                      <textarea 
                        className="w-full text-xs p-1.5 bg-white border border-slate-200/70 hover:border-slate-300 transition-colors rounded outline-none focus:border-amber-500 min-h-[45px]"
                        placeholder="e.g. Invoice {{document_number}} needs your approval."
                        value={config.message_template || ''}
                        onChange={(e) => handleChange(idx, 'message_template', e.target.value)}
                      />
                      <div className="text-[8px] font-medium text-slate-400 mt-1 flex items-center gap-1">
                        Available variables: 
                        <code className="bg-slate-50 border border-slate-200/60 px-1 py-0.5 rounded text-slate-600 font-mono">{"{{document_number}}"}</code> 
                        <code className="bg-slate-50 border border-slate-200/60 px-1 py-0.5 rounded text-slate-600 font-mono">{"{{vendor_name}}"}</code> 
                        <code className="bg-slate-50 border border-slate-200/60 px-1 py-0.5 rounded text-slate-600 font-mono">{"{{amount}}"}</code>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
