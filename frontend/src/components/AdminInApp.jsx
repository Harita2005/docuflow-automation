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
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-500" />
            In-App Notifications
          </h2>
          <p className="text-[10px] text-slate-500 mt-1">
            Configure the real-time bell notification messages sent directly to users inside the application.
          </p>
        </div>
        <button 
          onClick={saveConfigs} 
          disabled={loading}
          className="px-3 py-1.5 bg-amber-500 text-white rounded-md hover:bg-amber-600 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider disabled:opacity-50 transition-colors shadow-sm"
        >
          {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Configuration
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/4">Trigger Event</th>
              <th className="p-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-24 text-center">Status</th>
              <th className="p-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notification Content</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((config, idx) => (
              <tr key={config.trigger_event} className="border-t border-slate-200 bg-white hover:bg-slate-50/50 transition-colors">
                <td className="p-3 px-3 align-top">
                  <div className="text-xs font-bold text-slate-800">{config.trigger_event}</div>
                  <div className="text-[9px] text-slate-500 mt-0.5">Triggered during workflow transitions</div>
                </td>
                
                <td className="p-3 px-3 align-top text-center">
                  <button
                    onClick={() => handleChange(idx, 'enabled', !config.enabled)}
                    className={`inline-flex items-center justify-center p-1.5 rounded-full transition-colors ${config.enabled ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                    title={config.enabled ? "Disable" : "Enable"}
                  >
                    {config.enabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </button>
                  <div className={`text-[8px] font-bold mt-1 uppercase ${config.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {config.enabled ? 'Active' : 'Disabled'}
                  </div>
                </td>
                
                <td className="p-3 px-3 align-top">
                  <div className={`flex flex-col gap-2 max-w-4xl transition-opacity ${!config.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Title Template</label>
                      <input 
                        type="text" 
                        className="w-full text-[11px] p-1.5 bg-white border border-slate-200 rounded outline-none focus:border-amber-500"
                        placeholder="e.g. Action Required"
                        value={config.title_template || ''}
                        onChange={(e) => handleChange(idx, 'title_template', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-1">Message Template</label>
                      <textarea 
                        className="w-full text-[11px] p-1.5 bg-white border border-slate-200 rounded outline-none focus:border-amber-500 min-h-[40px]"
                        placeholder="e.g. Invoice {{document_number}} needs your approval."
                        value={config.message_template || ''}
                        onChange={(e) => handleChange(idx, 'message_template', e.target.value)}
                      />
                      <div className="text-[9px] font-normal text-slate-400 mt-1">
                        Available variables: <code className="bg-slate-100 px-1 rounded">{"{{document_number}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{vendor_name}}"}</code> <code className="bg-slate-100 px-1 rounded">{"{{amount}}"}</code>
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
