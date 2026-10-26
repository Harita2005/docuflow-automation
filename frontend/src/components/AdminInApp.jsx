import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Bell, 
  Search, 
  Save, 
  Edit2, 
  MoreVertical, 
  X, 
  Info, 
  CheckCircle2, 
  AlertTriangle, 
  Loader2,
  Check,
  Eye
} from 'lucide-react';

const EVENTS_META = [
  { 
    event: "PENDING_APPROVAL", 
    label: "Pending Approval", 
    desc: "When document is assigned to an approver for decision",
    defaultTitle: "Pending Approval: {{document_number}}",
    defaultMsg: "Document {{document_number}} has been assigned to you for approval. Please review and take the necessary action."
  },
  { 
    event: "ASSIGNED", 
    label: "Assigned", 
    desc: "On stage assignment or delegate handover",
    defaultTitle: "Assigned: {{document_number}}",
    defaultMsg: "Document {{document_number}} has been assigned to you. Please proceed with processing."
  },
  { 
    event: "REJECTED", 
    label: "Rejected", 
    desc: "When document is rejected during workflow approval",
    defaultTitle: "Rejected: {{document_number}}",
    defaultMsg: "Document {{document_number}} was rejected during workflow approval."
  },
  { 
    event: "SENT_BACK", 
    label: "Sent Back", 
    desc: "When document is returned to previous stage",
    defaultTitle: "Sent Back: {{document_number}}",
    defaultMsg: "Document {{document_number}} has been returned to previous stage."
  },
  { 
    event: "COMPLETED", 
    label: "Completed", 
    desc: "When document receives final stage approval",
    defaultTitle: "Completed: {{document_number}}",
    defaultMsg: "Document {{document_number}} has received final stage approval."
  },
  { 
    event: "CLARIFICATION", 
    label: "Clarification", 
    desc: "When approver requests audit info or line item details",
    defaultTitle: "Clarification: {{document_number}}",
    defaultMsg: "When approver requests audit info or line item details."
  }
];

const TEMPLATE_VARS = [
  'document_number',
  'document_type',
  'initiator_name',
  'initiator_email',
  'assigned_to',
  'due_date',
  'approval_stage'
];

export default function AdminInApp() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configs, setConfigs] = useState([]);
  const [search, setSearch] = useState("");
  // Open ONLY when user clicks Edit
  const [selectedEventKey, setSelectedEventKey] = useState(null);
  const [drawerTab, setDrawerTab] = useState("template"); // "template" | "preview"
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [menuOpenEvent, setMenuOpenEvent] = useState(null);
  const [portalNode, setPortalNode] = useState(null);

  useEffect(() => {
    const el = document.getElementById("admin-header-actions");
    if (el) {
      setPortalNode(el);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();

    const handleOutsideClick = () => {
      setMenuOpenEvent(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  const getHeaders = () => {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    return {
      'Content-Type': 'application/json',
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    };
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/inapp-config', { headers: getHeaders() });
      if (res.ok) {
        const rawData = await res.json();
        const dataList = Array.isArray(rawData) ? rawData : (Array.isArray(rawData?.configs) ? rawData.configs : []);
        
        const merged = EVENTS_META.map(meta => {
          const found = dataList.find(c => c && (c.trigger_event === meta.event || c.trigger_event === meta.label));
          if (found) {
            return {
              trigger_event: meta.event,
              enabled: found.enabled !== undefined ? found.enabled : true,
              title_template: found.title_template || meta.defaultTitle,
              message_template: found.message_template || meta.defaultMsg
            };
          }
          return {
            trigger_event: meta.event,
            enabled: true,
            title_template: meta.defaultTitle,
            message_template: meta.defaultMsg
          };
        });
        setConfigs(merged);
      } else {
        setConfigs(EVENTS_META.map(meta => ({
          trigger_event: meta.event,
          enabled: true,
          title_template: meta.defaultTitle,
          message_template: meta.defaultMsg
        })));
      }
    } catch (e) {
      console.error(e);
      setConfigs(EVENTS_META.map(meta => ({
        trigger_event: meta.event,
        enabled: true,
        title_template: meta.defaultTitle,
        message_template: meta.defaultMsg
      })));
    }
    setLoading(false);
  };

  const saveAllConfigs = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/notifications/inapp-config', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(configs)
      });
      if (res.ok) {
        setSuccessMsg('Notification configurations saved successfully!');
        setTimeout(() => setSuccessMsg(""), 3500);
      } else {
        setErrorMsg('Failed to save notification configurations.');
        setTimeout(() => setErrorMsg(""), 4000);
      }
    } catch (e) {
      setErrorMsg('Error saving configurations: ' + e.message);
      setTimeout(() => setErrorMsg(""), 4000);
    }
    setSaving(false);
  };

  const handleUpdateField = (eventKey, field, value) => {
    setConfigs(prev => prev.map(c => c.trigger_event === eventKey ? { ...c, [field]: value } : c));
  };

  const toggleStatus = (eventKey) => {
    setConfigs(prev => prev.map(c => c.trigger_event === eventKey ? { ...c, enabled: !c.enabled } : c));
  };

  const insertVariable = (varName) => {
    if (!selectedEventKey) return;
    setConfigs(prev => prev.map(c => {
      if (c.trigger_event === selectedEventKey) {
        const curMsg = c.message_template || '';
        return { ...c, message_template: curMsg + ` {{${varName}}}` };
      }
      return c;
    }));
  };

  const selectedConfig = selectedEventKey ? configs.find(c => c.trigger_event === selectedEventKey) : null;
  const selectedMeta = selectedConfig ? (EVENTS_META.find(m => m.event === selectedConfig.trigger_event) || EVENTS_META[0]) : null;

  const filteredConfigs = configs.filter(c => {
    const meta = EVENTS_META.find(m => m.event === c.trigger_event);
    const searchLower = search.toLowerCase().trim();
    if (!searchLower) return true;
    const label = (meta?.label || "").toLowerCase();
    const event = (c.trigger_event || "").toLowerCase();
    const title = (c.title_template || "").toLowerCase();
    const desc = (meta?.desc || "").toLowerCase();
    return label.includes(searchLower) || event.includes(searchLower) || title.includes(searchLower) || desc.includes(searchLower);
  });

  const renderTitlePreview = (titleStr) => {
    if (!titleStr) return <span className="text-slate-400 italic text-[11px]">None</span>;
    const parts = titleStr.split(/(\{\{[^}]+\}\})/g);
    return (
      <div className="flex items-center whitespace-nowrap gap-1">
        {parts.map((p, idx) => {
          if (p.startsWith("{{") && p.endsWith("}}")) {
            return (
              <span 
                key={idx} 
                className="inline-block px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono text-[10.5px] font-medium border border-slate-200"
              >
                {p}
              </span>
            );
          }
          return <span key={idx} className="font-semibold text-slate-800 text-xs whitespace-nowrap">{p}</span>;
        })}
      </div>
    );
  };

  const renderSimulatedPreview = (titleTpl, msgTpl) => {
    const sampleData = {
      document_number: "INV-2024-0089",
      document_type: "Tax Invoice",
      initiator_name: "Rahul Sharma",
      initiator_email: "rahul.sharma@company.com",
      assigned_to: "Operations Approver",
      due_date: "28 Oct 2026",
      approval_stage: "Manager Approval"
    };

    let title = titleTpl || "";
    let msg = msgTpl || "";
    Object.entries(sampleData).forEach(([k, v]) => {
      title = title.replaceAll(`{{${k}}}`, v);
      msg = msg.replaceAll(`{{${k}}}`, v);
    });

    return (
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-emerald-600" />
          <span>Real-time In-App Bell Notification Mockup</span>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
            <Bell className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h5 className="font-bold text-xs text-slate-900 truncate">{title}</h5>
              <span className="text-[9.5px] text-slate-400 whitespace-nowrap">Just now</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{msg}</p>
          </div>
        </div>
      </div>
    );
  };

  const headerControls = (
    <div className="flex items-center gap-2">
      <div className="relative w-56 md:w-64">
        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
        <input 
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search event, code, or template..."
          className="w-full text-xs pl-8 pr-2.5 h-7.5 bg-white border border-slate-200 rounded-lg focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]/25 outline-none text-slate-800 shadow-2xs transition"
        />
      </div>

      <button
        type="button"
        onClick={saveAllConfigs}
        disabled={saving || loading}
        className="h-7.5 flex items-center gap-1.5 px-3 bg-[#003F28] hover:bg-[#004B32] text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        <span>Save Configuration</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-3 font-sans text-xs">
      {/* Mount Search and Save Configuration into the top In-App Notifications header panel */}
      {portalNode ? (
        createPortal(headerControls, portalNode)
      ) : (
        <div className="flex items-center justify-end mb-2">
          {headerControls}
        </div>
      )}
      
      {/* FEEDBACK ALERTS */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 animate-fadeIn">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 2. CARD WITH TABLE + OPTIONAL EDIT DRAWER (ONLY WHEN EDIT CLICKED) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        
        {/* LEFT COMPONENT: Templates Table View */}
        <div className="flex-1 flex flex-col min-w-0">
          


          {/* Table Container - Single line per record (whitespace-nowrap) */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[750px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                  <th className="px-3 py-2 w-12 text-center whitespace-nowrap">S.No.</th>
                  <th className="px-3.5 py-2 whitespace-nowrap">TRIGGER EVENT</th>
                  <th className="px-3.5 py-2 whitespace-nowrap">STATUS</th>
                  <th className="px-3.5 py-2 whitespace-nowrap">TITLE TEMPLATE PREVIEW</th>
                  <th className="px-3.5 py-2 text-center whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredConfigs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-xs text-slate-400 italic">
                      No notification templates found.
                    </td>
                  </tr>
                ) : (
                  filteredConfigs.map((cfg, idx) => {
                    const meta = EVENTS_META.find(m => m.event === cfg.trigger_event) || {
                      label: cfg.trigger_event,
                      desc: "Workflow transition event"
                    };
                    const isSelected = selectedEventKey === cfg.trigger_event;

                    return (
                      <tr 
                        key={cfg.trigger_event}
                        onClick={() => setSelectedEventKey(cfg.trigger_event)}
                        className={`transition-colors select-none cursor-pointer group ${
                          isSelected ? "bg-emerald-50/50" : "hover:bg-slate-50/70"
                        }`}
                      >
                        {/* S.No. */}
                        <td className="px-3 py-2 w-12 text-center align-middle whitespace-nowrap font-medium text-slate-500 text-[11px]">
                          {idx + 1}
                        </td>

                        {/* Trigger Event - Strictly ONE line */}
                        <td className="px-3.5 py-2 align-middle whitespace-nowrap">
                          <span className="font-bold text-slate-900 text-xs whitespace-nowrap">{meta.label}</span>
                          <span className="text-[11px] text-slate-400 font-normal ml-2 hidden lg:inline whitespace-nowrap">
                            · {meta.desc}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3.5 py-2 align-middle whitespace-nowrap">
                          {cfg.enabled ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                              Disabled
                            </span>
                          )}
                        </td>

                        {/* Title Template Preview - Strictly ONE line */}
                        <td className="px-3.5 py-2 align-middle whitespace-nowrap">
                          {renderTitlePreview(cfg.title_template)}
                        </td>

                        {/* Actions */}
                        <td className="px-3.5 py-2 align-middle text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5 relative">
                            <button
                              type="button"
                              onClick={() => setSelectedEventKey(cfg.trigger_event)}
                              className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold flex items-center gap-1 transition shadow-3xs cursor-pointer ${
                                isSelected
                                  ? "bg-[#003F28] text-white border-[#003F28]"
                                  : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <Edit2 className="h-3 w-3" />
                              <span>Edit</span>
                            </button>

                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuOpenEvent(prev => prev === cfg.trigger_event ? null : cfg.trigger_event);
                                }}
                                className="h-6 w-6 rounded-md border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-500 flex items-center justify-center transition shadow-3xs cursor-pointer"
                                title="Toggle Status"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>

                              {menuOpenEvent === cfg.trigger_event && (
                                <div 
                                  className="absolute right-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 text-left"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleStatus(cfg.trigger_event);
                                      setMenuOpenEvent(null);
                                    }}
                                    className="w-full px-3 py-1.5 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition"
                                  >
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>{cfg.enabled ? 'Disable' : 'Enable'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      {/* 3. MODAL DIALOG: Edit Notification Template (Centered Popup with Backdrop) */}
      {selectedConfig && selectedMeta && typeof document !== "undefined" && createPortal(
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fadeIn"
          onClick={() => setSelectedEventKey(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-[560px] w-full max-h-[85vh] flex flex-col overflow-hidden animate-scaleIn text-left"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center border bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-3xs">
                  <Bell className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight">Edit Notification Template</h3>
                  <div className="text-xs text-slate-400 mt-0.5 font-medium">
                    Configure in-app notification alerts for workflow transitions
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedEventKey(null)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
                title="Close Modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3.5 custom-scrollbar bg-slate-50/30 flex-1">
              {/* Event Info & Toggle Switch Card */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                <div>
                  <h4 className="font-bold text-xs text-slate-900">{selectedMeta.label}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{selectedMeta.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-semibold ${selectedConfig.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {selectedConfig.enabled ? 'Active' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleStatus(selectedConfig.trigger_event)}
                    className={`w-8 h-4.5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                      selectedConfig.enabled ? 'bg-[#003F28]' : 'bg-slate-200'
                    }`}
                  >
                    <span className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform transition-transform ${
                      selectedConfig.enabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}></span>
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-5 border-b border-slate-200 pt-0.5">
                <button
                  type="button"
                  onClick={() => setDrawerTab("template")}
                  className={`pb-1.5 text-xs font-bold transition cursor-pointer border-b-2 ${
                    drawerTab === "template"
                      ? "border-[#003F28] text-[#003F28]"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  }`}
                >
                  Template
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerTab("preview")}
                  className={`pb-1.5 text-xs font-bold transition cursor-pointer border-b-2 ${
                    drawerTab === "preview"
                      ? "border-[#003F28] text-[#003F28]"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  }`}
                >
                  Preview
                </button>
              </div>

              {/* Tab 1: Template Editor */}
              {drawerTab === "template" && (
                <div className="space-y-3">
                  {/* Notification Title */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Notification Title <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text"
                      value={selectedConfig.title_template || ''}
                      onChange={e => handleUpdateField(selectedConfig.trigger_event, 'title_template', e.target.value)}
                      placeholder="e.g. Pending Approval: {{document_number}}"
                      className="w-full text-xs font-medium px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]/25 outline-none shadow-2xs transition"
                    />
                  </div>

                  {/* Notification Message */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Notification Message <span className="text-rose-500">*</span>
                    </label>
                    <textarea 
                      rows={3}
                      value={selectedConfig.message_template || ''}
                      onChange={e => handleUpdateField(selectedConfig.trigger_event, 'message_template', e.target.value)}
                      placeholder="e.g. Document {{document_number}} has been assigned to you for approval..."
                      className="w-full text-xs font-normal p-2.5 bg-white border border-slate-200 rounded-lg text-slate-900 focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]/25 outline-none shadow-2xs resize-none leading-relaxed transition"
                    />
                  </div>

                  {/* Available Template Variables Helper */}
                  <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800">
                      <Info className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>Available Template Variables</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {TEMPLATE_VARS.map(varName => (
                        <button
                          key={varName}
                          type="button"
                          onClick={() => insertVariable(varName)}
                          className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 hover:border-emerald-300 hover:text-emerald-800 text-slate-700 font-mono text-[10.5px] shadow-3xs transition cursor-pointer"
                          title={`Click to insert {{${varName}}}`}
                        >
                          {`{{${varName}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Live Preview */}
              {drawerTab === "preview" && (
                <div className="py-1">
                  {renderSimulatedPreview(selectedConfig.title_template, selectedConfig.message_template)}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-white border-t border-slate-100 shrink-0 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedEventKey(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold text-xs uppercase tracking-wider rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async () => {
                  await saveAllConfigs();
                  setSelectedEventKey(null);
                }}
                disabled={saving}
                className="px-6 py-2 bg-[#005A36] hover:bg-[#00482B] text-white font-bold text-xs uppercase tracking-wider rounded-lg transition shadow-sm cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Save Template</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
