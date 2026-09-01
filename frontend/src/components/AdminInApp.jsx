import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Bell, BellRing, BellOff, ChevronDown, ChevronUp, Edit3, Sparkles } from 'lucide-react';

const EVENTS = [
  { event: "PENDING_APPROVAL", desc: "Triggered when document is assigned to an approver for decision" },
  { event: "ASSIGNED", desc: "Triggered on stage assignment or delegate handover" },
  { event: "REJECTED", desc: "Triggered when document is rejected during workflow approval" },
  { event: "SENT_BACK", desc: "Triggered when document is returned to previous stage" },
  { event: "COMPLETED", desc: "Triggered when document receives final stage approval" },
  { event: "CLARIFICATION", desc: "Triggered when approver requests audit info or line item details" }
];

export default function AdminInApp() {
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [expandedEvents, setExpandedEvents] = useState({});

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
        const rawData = await res.json();
        const dataList = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.configs) ? rawData.configs : []);
        
        const merged = EVENTS.map(({ event }) => {
          const found = dataList.find(c => c && c.trigger_event === event);
          if (found) return found;
          return {
            trigger_event: event,
            enabled: true,
            title_template: event === "PENDING_APPROVAL" ? "Action Required: {{document_number}}" : `${event.replace('_', ' ')}: {{document_number}}`,
            message_template: `Document {{document_number}} from {{vendor_name}} (₹{{amount}}) is pending your review.`
          };
        });
        setConfigs(merged);
      } else {
        setConfigs(EVENTS.map(({ event }) => ({
          trigger_event: event,
          enabled: true,
          title_template: `${event.replace('_', ' ')}: {{document_number}}`,
          message_template: `Document {{document_number}} from {{vendor_name}} (₹{{amount}}) is pending your review.`
        })));
      }
    } catch (e) {
      console.error(e);
      setConfigs(EVENTS.map(({ event }) => ({
        trigger_event: event,
        enabled: true,
        title_template: `${event.replace('_', ' ')}: {{document_number}}`,
        message_template: `Document {{document_number}} from {{vendor_name}} (₹{{amount}}) is pending your review.`
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

  const toggleExpand = (eventKey) => {
    setExpandedEvents(prev => ({
      ...prev,
      [eventKey]: !prev[eventKey]
    }));
  };

  const insertVariable = (idx, field, varName) => {
    const newConfigs = [...configs];
    const currentVal = newConfigs[idx][field] || '';
    newConfigs[idx][field] = currentVal + ` {{${varName}}}`;
    setConfigs(newConfigs);
  };

  return (
    <div className="p-3 flex flex-col gap-3 font-sans text-xs">
      {/* Header Bar */}
      <div className="flex justify-between items-center bg-white p-2 px-3 rounded-xl shadow-2xs border border-slate-200">
        <div>
          <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <BellRing className="h-3.5 w-3.5 text-amber-500" />
            In-App Notifications Configurator
          </h2>
          <p className="text-[9px] font-medium text-slate-500">
            Configure real-time in-app bell notifications and dynamic message templates.
          </p>
        </div>
        <button 
          onClick={saveConfigs} 
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[9.5px] uppercase tracking-wide rounded-md transition shadow-2xs cursor-pointer active:scale-98 disabled:opacity-50 h-6.5"
        >
          {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save Configuration
        </button>
      </div>

      {/* Accordion Table Card */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[8.5px] font-black text-slate-400 uppercase tracking-wider">
              <th className="py-1.5 px-3 w-48">Trigger Event</th>
              <th className="py-1.5 px-3 w-24 text-center">Status</th>
              <th className="py-1.5 px-3">Title Template Preview</th>
              <th className="py-1.5 px-3 text-right w-36">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[10px]">
            {configs.map((config, idx) => {
              const eventMeta = EVENTS.find(e => e.event === config.trigger_event) || { desc: "Triggered on workflow transitions" };
              const isExpanded = !!expandedEvents[config.trigger_event];

              return (
                <React.Fragment key={config.trigger_event}>
                  <tr className="hover:bg-slate-50/60 transition">
                    {/* Event Name */}
                    <td className="py-2 px-3 align-middle">
                      <div className="font-extrabold text-slate-900 text-[10px]">{config.trigger_event}</div>
                      <div className="text-[8.5px] text-slate-400 truncate">{eventMeta.desc}</div>
                    </td>

                    {/* Status Pill */}
                    <td className="py-2 px-3 align-middle text-center">
                      <button
                        onClick={() => handleChange(idx, 'enabled', !config.enabled)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[8.5px] font-bold tracking-wide uppercase transition cursor-pointer ${
                          config.enabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                        title={config.enabled ? "Disable" : "Enable"}
                      >
                        {config.enabled ? <Bell className="h-2.5 w-2.5" /> : <BellOff className="h-2.5 w-2.5" />}
                        {config.enabled ? 'Active' : 'Disabled'}
                      </button>
                    </td>

                    {/* Title Template Preview */}
                    <td className="py-2 px-3 align-middle">
                      <span className="font-mono text-[9px] text-slate-600 font-medium truncate block max-w-md">
                        {config.title_template || '(No title template set)'}
                      </span>
                    </td>

                    {/* Action Dropdown Toggle Button */}
                    <td className="py-2 px-3 align-middle text-right">
                      <button
                        onClick={() => toggleExpand(config.trigger_event)}
                        className={`px-2 py-0.5 rounded text-[8.5px] font-bold transition inline-flex items-center gap-1 cursor-pointer border ${
                          isExpanded
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300 hover:bg-amber-50/40 shadow-2xs'
                        }`}
                      >
                        <Edit3 className="h-2.5 w-2.5" />
                        {isExpanded ? 'Hide Template' : 'Edit Template'}
                        {isExpanded ? <ChevronUp className="h-2.5 w-2.5 ml-0.5" /> : <ChevronDown className="h-2.5 w-2.5 ml-0.5" />}
                      </button>
                    </td>
                  </tr>

                  {/* Collapsible Dropdown Drawer */}
                  {isExpanded && (
                    <tr className="bg-slate-50/70 border-b border-slate-200">
                      <td colSpan={4} className="p-3">
                        <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs space-y-2 max-w-4xl animate-fadeIn">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                            <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                              Configure Message Template for {config.trigger_event}
                            </span>
                            <span className="text-[8.5px] font-bold text-slate-400">
                              HTML / Variables Enabled
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {/* Title Template Field */}
                            <div>
                              <label className="block text-[8.5px] font-black uppercase text-slate-500 mb-0.5">
                                TITLE TEMPLATE
                              </label>
                              <input 
                                type="text" 
                                className="w-full text-[9.5px] font-mono px-2 py-0.5 bg-slate-50 border border-slate-200 hover:border-slate-300 transition rounded-md outline-hidden focus:border-amber-500 h-6.5 font-bold text-slate-900"
                                placeholder="e.g. Action Required: {{document_number}}"
                                value={config.title_template || ''}
                                onChange={(e) => handleChange(idx, 'title_template', e.target.value)}
                              />
                              <div className="mt-1 flex items-center gap-1 flex-wrap">
                                <span className="text-[8px] font-extrabold text-slate-400">Insert:</span>
                                {['document_number', 'vendor_name', 'amount'].map(v => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => insertVariable(idx, 'title_template', v)}
                                    className="px-1 py-0.2 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 rounded text-[8px] font-mono font-semibold transition cursor-pointer border border-slate-200"
                                  >
                                    + {`{{${v}}}`}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Message Template Field */}
                            <div>
                              <label className="block text-[8.5px] font-black uppercase text-slate-500 mb-0.5">
                                MESSAGE TEMPLATE
                              </label>
                              <textarea 
                                className="w-full text-[9.5px] font-mono p-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 transition rounded-md outline-hidden focus:border-amber-500 min-h-[40px] font-medium text-slate-900"
                                placeholder="e.g. Document {{document_number}} from {{vendor_name}} (₹{{amount}}) is pending your review."
                                value={config.message_template || ''}
                                onChange={(e) => handleChange(idx, 'message_template', e.target.value)}
                              />
                              <div className="mt-1 flex items-center gap-1 flex-wrap">
                                <span className="text-[8px] font-extrabold text-slate-400">Insert:</span>
                                {['document_number', 'vendor_name', 'amount'].map(v => (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => insertVariable(idx, 'message_template', v)}
                                    className="px-1 py-0.2 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 rounded text-[8px] font-mono font-semibold transition cursor-pointer border border-slate-200"
                                  >
                                    + {`{{${v}}}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
