import React, { useState, useEffect } from 'react';
import { Network, Plus, Trash2, Edit2, Loader2, Save, X, ShieldCheck, AlertTriangle, Send, ArrowRight, Search, Activity, Settings2, Database, Clock, CheckCircle2, RotateCw } from 'lucide-react';
import AdminSystem from '../components/AdminSystem.jsx';
import AdminRACI from '../components/AdminRACI.jsx';
import AdminInApp from '../components/AdminInApp.jsx';
import ConditionBuilder from '../components/ConditionBuilder.jsx';
import FlowBuilder from '../components/FlowBuilder.jsx';
import AdminRBAC from '../components/AdminRBAC.jsx';
import AdminBackups from '../components/AdminBackups.jsx';
import ChecklistConditionBuilder from '../components/ChecklistConditionBuilder.jsx';
import DapiSyncBackHub from '../components/dapi-sync-back/DapiSyncBackHub.tsx';
export default function Admin() {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [rules, setRules] = useState([]);
  const [steps, setSteps] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [deletedRuleIds, setDeletedRuleIds] = useState([]);
  const [deletedStepIds, setDeletedStepIds] = useState([]);
  const [deletedTemplateIds, setDeletedTemplateIds] = useState([]);

  const [hasChanges, setHasChanges] = useState(false);

  const [_editingRule, _setEditingRule] = useState(null);
  const [_ruleConditions, _setRuleConditions] = useState([]);
  const [_editingFlow, _setEditingFlow] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateFields, setTemplateFields] = useState([]);
  const [templateInstructions, setTemplateInstructions] = useState("");

  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem("adminActiveTab");
    return (stored === "masterdata" || stored === "recycle" || stored === "backups" || !stored) ? "routing" : stored;
  });
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isRootView, setIsRootView] = useState(true);

  useEffect(() => {
    localStorage.setItem("adminActiveTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleSetTab = (e) => {
      if (e.detail) setActiveTab(e.detail);
    };
    window.addEventListener('set-admin-tab', handleSetTab);
    return () => window.removeEventListener('set-admin-tab', handleSetTab);
  }, []);
  
  // New States for Search and Diagnostics
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [auditCategoryFilter, setAuditCategoryFilter] = useState("ALL");
  const [_syncingData, _setSyncingData] = useState(false);
  const [templateDeleteConfirmTarget, setTemplateDeleteConfirmTarget] = useState(null);
  const [templateCategoryDeleteTarget, setTemplateCategoryDeleteTarget] = useState(null);
  const [publishConfirm, setPublishConfirm] = useState(false);

  // Sandbox State
  const [sandboxResult, setSandboxResult] = useState(null);
  const [testingSandbox, setTestingSandbox] = useState(false);

  // Audit Log Retention Policy State
  const [retentionInfo, setRetentionInfo] = useState({
    retention_days: 7,
    default_retention_days: 7,
    total_logs: 0,
    oldest_log: null,
    expired_logs_count: 0,
    cutoff_timestamp: null,
  });
  const [retentionDraft, setRetentionDraft] = useState("7");
  const [customDays, setCustomDays] = useState("");
  const [isCustomRetention, setIsCustomRetention] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [cleanupModalOpen, setCleanupModalOpen] = useState(false);
  const [cleaningUpLogs, setCleaningUpLogs] = useState(false);
  const [retentionNotice, setRetentionNotice] = useState(null);

  useEffect(() => {
    fetchData();
    fetchAuditLogs();
    fetchRetentionInfo();

    const handleUpdateAddAction = (e) => {
      setIsRootView(e.detail);
    };
    window.addEventListener('update-add-action', handleUpdateAddAction);
    return () => window.removeEventListener('update-add-action', handleUpdateAddAction);
  }, []);

  useEffect(() => {
    setIsRootView(true);
    if (activeTab === "audit") {
      fetchAuditLogs();
      fetchRetentionInfo();
    }
  }, [activeTab]);

  const fetchAuditLogs = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/audit-logs', { headers });
      if (res.ok) setAuditLogs(await res.json());
    } catch {}
  };

  const fetchRetentionInfo = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/audit-logs/retention', { headers });
      if (res.ok) {
        const data = await res.json();
        setRetentionInfo(data);
        const daysStr = String(data.retention_days);
        if (["7", "14", "30", "90", "180", "365", "0"].includes(daysStr)) {
          setRetentionDraft(daysStr);
          setIsCustomRetention(false);
        } else {
          setRetentionDraft("custom");
          setCustomDays(daysStr);
          setIsCustomRetention(true);
        }
      }
    } catch (err) {
      console.error("Failed to load audit retention policy:", err);
    }
  };

  const handleSaveRetention = async () => {
    setRetentionSaving(true);
    setRetentionNotice(null);
    try {
      const token = localStorage.getItem("authToken");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      };
      let days = 7;
      if (isCustomRetention) {
        days = parseInt(customDays, 10);
        if (isNaN(days) || days < 0) days = 7;
      } else {
        days = parseInt(retentionDraft, 10);
        if (isNaN(days) || days < 0) days = 7;
      }

      const res = await fetch('/api/admin/audit-logs/retention', {
        method: 'POST',
        headers,
        body: JSON.stringify({ retention_days: days, prune_immediately: false })
      });
      if (res.ok) {
        await res.json();
        setRetentionNotice({
          type: 'success',
          text: days === 0 
            ? 'Policy saved: Logs retained indefinitely (no automatic expiry).' 
            : `Policy saved: Logs retained for ${days} days (${days === 7 ? '1 week default' : 'extended policy'}).`
        });
        await fetchRetentionInfo();
        await fetchAuditLogs();
      } else {
        const err = await res.json();
        setRetentionNotice({ type: 'error', text: err.detail || 'Failed to update retention policy' });
      }
    } catch (e) {
      setRetentionNotice({ type: 'error', text: e.message || 'Error saving retention' });
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleCleanupNow = async () => {
    setCleaningUpLogs(true);
    setRetentionNotice(null);
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/audit-logs/cleanup', {
        method: 'POST',
        headers
      });
      if (res.ok) {
        const data = await res.json();
        setRetentionNotice({
          type: 'success',
          text: `Purged ${data.pruned} expired log(s) older than ${data.retention_days} days.`
        });
        setCleanupModalOpen(false);
        await fetchRetentionInfo();
        await fetchAuditLogs();
      } else {
        const err = await res.json();
        setRetentionNotice({ type: 'error', text: err.detail || 'Cleanup failed' });
      }
    } catch (e) {
      setRetentionNotice({ type: 'error', text: e.message || 'Cleanup error' });
    } finally {
      setCleaningUpLogs(false);
    }
  };

  const _handleTriggerSync = async () => {
    _setSyncingData(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/sync/seed-demo', { method: 'POST', headers });
      if (res.ok) {
        await fetchAuditLogs();
      }
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      _setSyncingData(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const [rulesRes, stepsRes, templatesRes, usersRes] = await Promise.all([
        fetch('/api/admin/routing-rules', { headers }),
        fetch('/api/admin/workflow-steps', { headers }),
        fetch('/api/templates', { headers }),
        fetch('/api/admin/users', { headers })
      ]);
      const rulesData = rulesRes.ok ? await rulesRes.json() : [];
      const stepsData = stepsRes.ok ? await stepsRes.json() : [];
      const templatesData = templatesRes.ok ? await templatesRes.json() : [];
      const usersData = usersRes.ok ? await usersRes.json() : [];
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setSteps(Array.isArray(stepsData) ? stepsData : []);
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
      setAllUsers(Array.isArray(usersData) ? usersData : []);
      setDeletedRuleIds([]);
      setDeletedStepIds([]);
      setDeletedTemplateIds([]);
      setHasChanges(false);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const openEditTemplate = (t) => {
    if (!t) {
      setTemplateFields([{ id: Date.now(), name: '', type: 'string', description: '', required: false, rolesVisible: [], rolesEditable: [] }]);
      setTemplateInstructions("");
      setEditingTemplate({ name: '', description: '', fields_json: '' });
      return;
    }
    let fields = [];
    let instrs = "";
    try {
      const parsed = JSON.parse(t.fields_json);
      if (parsed && Array.isArray(parsed.fields)) {
         fields = parsed.fields;
         instrs = parsed.instructions || "";
      } else if (Array.isArray(parsed)) {
         fields = parsed;
      } else if (parsed && parsed.schema) {
         // Legacy raw schema handling
         const schemaParsed = typeof parsed.schema === 'string' ? JSON.parse(parsed.schema) : parsed.schema;
         fields = Object.keys(schemaParsed).map((k, i) => ({ id: Date.now()+i, name: k, type: 'string', description: '', required: false }));
         instrs = parsed.instructions || "";
      }
    } catch {}
    if (fields.length === 0) fields = [{ id: Date.now(), name: '', type: 'string', description: '', required: false, rolesVisible: [], rolesEditable: [] }];
    fields = fields.map((f, i) => ({ 
      ...f, 
      id: f.id || Date.now() + i,
      rolesVisible: f.rolesVisible || [],
      rolesEditable: f.rolesEditable || []
    }));
    setTemplateFields(fields);
    setTemplateInstructions(instrs);
    setEditingTemplate(t);
  };

  const handleSaveTemplateLocal = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const validFields = templateFields.filter(f => f.name.trim() !== '');
    const cleanFields = validFields.map(({_id, ...rest}) => rest);
    
    const template = {
      ...editingTemplate,
      id: editingTemplate.id || `tmp-${Date.now()}`,
      name: fd.get('name'),
      description: fd.get('description') || '',
      category: editingTemplate.category || selectedTemplateCategory || 'Vendor Payment Workflows',
      document_type: editingTemplate.document_type || fd.get('name'),
      fields_json: JSON.stringify({ fields: cleanFields, instructions: templateInstructions }, null, 2)
    };

    if (editingTemplate.id) {
      setTemplates(templates.map(t => t.id === template.id ? template : t));
    } else {
      setTemplates([...templates, template]);
    }
    setEditingTemplate(null);
    setHasChanges(true);
  };

  const handleDeleteRuleLocal = (id) => {
    if (!id) return;
    if (!String(id).startsWith('tmp-')) {
      setDeletedRuleIds(prev => [...prev, id]);
    }
    setRules(prev => prev.filter(r => r.id !== id));
    setHasChanges(true);
  };

  const handleDeleteTemplateLocal = (id) => {
    setTemplateDeleteConfirmTarget(id);
  };

  const confirmDeleteTemplate = () => {
    if (!templateDeleteConfirmTarget) return;
    const id = templateDeleteConfirmTarget;
    if (!String(id).startsWith('tmp-')) setDeletedTemplateIds([...deletedTemplateIds, id]);
    setTemplates(templates.filter(t => t.id !== id));
    setHasChanges(true);
    setTemplateDeleteConfirmTarget(null);
  };

  const publishChanges = () => {
    setPublishConfirm(true);
  };

  const confirmPublish = async () => {
    setPublishConfirm(false);
    
    setPublishing(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = { 
        'Content-Type': 'application/json',
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      };

      // 1. Delete rules
      for (const id of deletedRuleIds) {
        await fetch(`/api/admin/routing-rules/${id}`, { method: 'DELETE', headers });
      }
      // 2. Upsert rules
      for (const rule of rules) {
        const payload = { ...rule, id: String(rule.id).startsWith('tmp-') ? undefined : rule.id };
        const res = await fetch('/api/admin/routing-rules', { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!res.ok) {
          const errData = await res.json();
          alert(`Error saving rule ${rule.rule_name}: ` + (errData.error || res.statusText));
        }
      }

      // 3. Delete steps
      for (const id of deletedStepIds) {
        await fetch(`/api/admin/workflow-steps/${id}`, { method: 'DELETE', headers });
      }
      // 4. Upsert steps
      for (const step of steps) {
        const payload = { ...step, id: String(step.id).startsWith('tmp-') ? undefined : step.id };
        await fetch('/api/admin/workflow-steps', { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      // 5. Delete templates
      for (const id of deletedTemplateIds) {
        await fetch(`/api/templates/${id}`, { method: 'DELETE', headers });
      }
      // 6. Upsert templates
      for (const t of templates) {
        const payload = { ...t, id: t.id && String(t.id).startsWith('tmp-') ? undefined : t.id };
        await fetch('/api/templates', { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      // 7. Audit Log Publish
      const changesCount = deletedRuleIds.length + deletedStepIds.length + deletedTemplateIds.length + rules.filter(r=>String(r.id).startsWith('tmp-')).length + steps.filter(s=>String(s.id).startsWith('tmp-')).length + templates.filter(t=>t.id && String(t.id).startsWith('tmp-')).length;
      await fetch('/api/admin/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({ changes: changesCount })
      });

      await fetchData(); // Reload clean state
    } catch (e) {
      console.error(e);
      alert('Failed to publish changes');
    }
    setPublishing(false);
  };

  const discardChanges = () => {
    if (window.confirm("Are you sure you want to discard all unpublished drafts?")) {
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const _groupedSteps = Array.from(new Set(steps.map(s => s.profile_name))).map(profile => ({
    profile_name: profile,
    stages: steps.filter(s => s.profile_name === profile).sort((a, b) => a.stage_number - b.stage_number)
  }));

  return (
    <div className="admin-settings-theme flex gap-8 h-[calc(100vh-4.5rem)] w-full font-sans overflow-hidden">
      
      {/* Secondary Sidebar */}
      <div className="relative w-56 shrink-0 flex flex-col gap-4 h-full overflow-hidden rounded-r-xl bg-gradient-to-b from-[#004B32] via-[#003F29] to-[#002E1E] px-3 pt-5 pb-4 text-white shadow-lg custom-scrollbar">
        <div className="relative z-10 px-2">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-white" />
            <h2 className="text-sm font-bold text-white tracking-tight">Control Settings</h2>
          </div>
          <p className="text-[9px] text-emerald-100/70 mt-1">System configuration and policies</p>
        </div>

        <div className="relative z-10 flex-1 space-y-4 overflow-y-auto custom-scrollbar">
          {/* WORKFLOW */}
          <div className="space-y-0.5">
            <h3 className="text-[9px] font-bold text-emerald-100/55 uppercase tracking-widest px-2 mb-1.5">Workflow & Rules</h3>
            <button
              onClick={() => setActiveTab("routing")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "routing" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              Flow Builder
            </button>
            <button
              onClick={() => setActiveTab("matrix")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "matrix" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              Condition Builder
            </button>
            <button
              onClick={() => setActiveTab("checklists")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "checklists" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              Checklist Matrix
            </button>
            <button
              onClick={() => setActiveTab("templates")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "templates" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              AI Templates
            </button>
          </div>

          {/* WORKSPACE & ACCESS */}
          <div className="space-y-0.5">
            <h3 className="text-[9px] font-bold text-emerald-100/55 uppercase tracking-widest px-2 mb-1.5">Workspace & Access</h3>

            <button
              onClick={() => setActiveTab("rbac")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "rbac" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              Role Matrix (RBAC)
            </button>
          </div>

          {/* SYSTEM ADMINISTRATION */}
          <div className="space-y-0.5">
            <h3 className="text-[9px] font-bold text-emerald-100/55 uppercase tracking-widest px-2 mb-1.5">System Administration</h3>
            <button
              onClick={() => setActiveTab("raci")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "raci" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              Email & RACI
            </button>
            <button
              onClick={() => setActiveTab("inapp")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "inapp" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              In-App Notifications
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "audit" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              Audit Logs
            </button>
            <button
              onClick={() => setActiveTab("system")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "system" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              System Settings
            </button>
            <button
              onClick={() => setActiveTab("callbacks")}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "callbacks" ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-sm" : "text-emerald-50/85 hover:bg-white/10 hover:text-white border border-transparent"}`}
            >
              Third-Party App Sync
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col font-sans pt-2 h-full">
        
        {/* Settings Header */}
        {activeTab !== 'callbacks' && (
          <div className={`mb-1.5 border rounded-lg p-2 backdrop-blur-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2 transition-colors ${hasChanges ? 'bg-amber-50/90 border-amber-200/60' : 'bg-white/80 border-slate-200/60'}`}>
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-md flex items-center justify-center text-white shadow-sm transition-colors ${hasChanges ? 'bg-gradient-to-br from-amber-400 to-amber-600' : 'bg-gradient-to-br from-[#003F28] to-[#00452B]'}`}>
                {hasChanges ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
              </div>
              <div>
                <h1 className="text-xs font-display font-bold text-slate-900 tracking-tight leading-none">
                  {activeTab === 'matrix' && 'Condition Policy Matrix'}
                  {activeTab === 'routing' && 'Flow Builder'}
                  {activeTab === 'checklists' && 'Checklist Condition Matrix'}
                  {activeTab === 'templates' && 'AI Templates'}
                  {activeTab === 'rbac' && 'Role Access Configuration'}
                  {activeTab === 'system' && 'System Settings'}
                  {activeTab === 'raci' && 'Email & RACI'}
                  {activeTab === 'inapp' && 'In-App Notifications'}
                  {activeTab === 'audit' && 'Audit Logs'}
                </h1>
                <p className="text-[9px] text-slate-500 mt-0.5 leading-none">
                  {hasChanges 
                    ? <span className="text-amber-700 font-bold">You have unpublished draft modifications.</span> 
                    : <span>Live Configuration. All system settings are active.</span>}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              {(activeTab === 'routing' || activeTab === 'matrix') && isRootView && (
                <button 
                  onClick={() => window.dispatchEvent(new Event('open-add-category'))} 
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003F28] text-white hover:bg-[#005333] font-bold text-[10px] uppercase tracking-wide rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003F28] shadow-sm mr-2 cursor-pointer"
                >
                  <Plus className="h-3 w-3" /> Add Category
                </button>
              )}
              {activeTab === 'templates' && (
                <button
                  onClick={() => openEditTemplate(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003F28] text-white hover:bg-[#005333] font-bold text-[10px] uppercase tracking-wide rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003F28] shadow-sm mr-2 cursor-pointer"
                >
                  <Plus className="h-3 w-3" /> New Template
                </button>
              )}

              {hasChanges && (
                <>
                  <button 
                    onClick={discardChanges}
                    disabled={publishing}
                    className="px-3 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 rounded-md transition"
                  >
                    Discard Draft
                  </button>
                  <button 
                    onClick={publishChanges}
                    disabled={publishing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[10px] font-bold rounded-md shadow-md transition disabled:opacity-50"
                  >
                    {publishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                    Publish Configuration
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      <div className="flex-1 min-h-0 flex flex-col gap-3 items-stretch relative overflow-y-auto custom-scrollbar pr-2">
        {publishing && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 rounded-xl flex items-center justify-center">
            <div className="bg-white p-4 rounded-xl shadow-xl flex items-center gap-3 font-bold text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Applying Policies...
            </div>
          </div>
        )}

        {/* --- ROUTING TAB CONTENT --- */}
        {activeTab === "routing" && (
          <FlowBuilder users={allUsers} />
        )}

        {/* --- POLICY MATRIX TAB CONTENT --- */}
        {activeTab === "matrix" && (
          <ConditionBuilder 
            rules={rules} 
            setRules={setRules} 
            setHasChanges={setHasChanges} 
            handleDeleteRuleLocal={handleDeleteRuleLocal}
          />
        )}

        {/* --- CHECKLIST MATRIX TAB CONTENT --- */}
        {activeTab === "checklists" && (
          <ChecklistConditionBuilder />
        )}

    {/* --- TEMPLATES TAB CONTENT --- */}
    {activeTab === "templates" && (
      <div className="flex flex-col gap-4 mt-2">

        <div className="flex flex-col gap-4">
          {editingTemplate && (
            <div className="bg-blue-50/30 p-3 border-b border-blue-100/50">
              <form onSubmit={handleSaveTemplateLocal} className="space-y-4 relative">
                <button type="button" onClick={() => { setEditingTemplate(null); setTemplateFields([]); }} className="absolute -top-1 -right-1 text-slate-400 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Template Name (e.g., Contract)</label>
                    <input type="text" name="name" defaultValue={editingTemplate.name} required className="w-full text-xs p-1.5 border border-slate-200 rounded font-mono shadow-inner" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Description</label>
                    <input type="text" name="description" defaultValue={editingTemplate.description} className="w-full text-xs p-1.5 border border-slate-200 rounded font-mono shadow-inner" />
                  </div>
                </div>
                <div className="pt-2 border-t border-blue-100">
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Global AI Instructions</label>
                  <textarea 
                    name="instructions" 
                    value={templateInstructions} 
                    onChange={e => setTemplateInstructions(e.target.value)} 
                    rows="2" 
                    placeholder="e.g., The document is an Invoice. Ensure you correctly align unitPrice and amount." 
                    className="w-full text-xs p-1.5 border border-slate-200 rounded font-mono shadow-inner resize-none"
                  ></textarea>
                </div>
                <div className="pt-2 border-t border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase">Document Fields</label>
                    <button type="button" onClick={() => setTemplateFields([...templateFields, { id: Date.now(), name: '', type: 'string', description: '', required: false, rolesVisible: [], rolesEditable: [] }])} className="flex items-center gap-1 text-[9px] font-bold text-blue-600 hover:text-blue-800 bg-blue-100/50 hover:bg-blue-100 px-2 py-1 rounded">
                      <Plus className="h-3 w-3" /> Add Field
                    </button>
                  </div>
                  <div className="space-y-2">
                    {templateFields.map((field, idx) => (
                      <div key={field.id} className="flex gap-2 items-center bg-white p-1.5 rounded border border-slate-100 shadow-sm">
                        <input
                          type="text"
                          placeholder="Field Name (e.g. amount)"
                          value={field.name}
                          onChange={(e) => {
                            const newFields = [...templateFields];
                            newFields[idx].name = e.target.value;
                            setTemplateFields(newFields);
                          }}
                          required
                          className="flex-1 text-xs p-1.5 border border-slate-200 rounded focus:border-blue-400 focus:outline-none"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const newFields = [...templateFields];
                            newFields[idx].type = e.target.value;
                            setTemplateFields(newFields);
                          }}
                          className="w-24 text-xs p-1.5 border border-slate-200 rounded focus:border-blue-400 focus:outline-none bg-slate-50"
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="date">Date</option>
                        </select>
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1.5 rounded" title="Mark as Required Field">
                          <input 
                            type="checkbox" 
                            checked={Boolean(field.required)}
                            onChange={(e) => {
                              const newFields = [...templateFields];
                              newFields[idx].required = e.target.checked;
                              setTemplateFields(newFields);
                            }}
                            className="cursor-pointer"
                          />
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer">Req</label>
                        </div>
                        <input
                          type="text"
                          placeholder="Description / Hint"
                          value={field.description}
                          onChange={(e) => {
                            const newFields = [...templateFields];
                            newFields[idx].description = e.target.value;
                            setTemplateFields(newFields);
                          }}
                          className="flex-1 text-xs p-1.5 border border-slate-200 rounded focus:border-blue-400 focus:outline-none"
                        />
                        <div className="flex flex-col gap-1 border border-slate-100 p-1 rounded bg-slate-50 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest min-w-[24px]">View:</span>
                            {["employee", "settings_editor", "admin"].map(r => {
                               const hasRole = (field.rolesVisible || []).includes(r);
                               return (
                                 <button
                                   key={r}
                                   type="button"
                                   onClick={() => {
                                     const newFields = [...templateFields];
                                     const roles = newFields[idx].rolesVisible || [];
                                     newFields[idx].rolesVisible = roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r];
                                     setTemplateFields(newFields);
                                   }}
                                   className={`text-[8px] px-1 py-0.5 rounded font-black border transition-all uppercase tracking-tighter ${hasRole ? "bg-indigo-600 text-white border-indigo-700 font-bold" : "bg-white text-slate-400 border-slate-200 hover:text-slate-600"}`}
                                 >
                                   {r === "employee" ? "Emp" : r === "settings_editor" ? "Set" : "Adm"}
                                 </button>
                               );
                            })}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest min-w-[24px]">Edit:</span>
                            {["employee", "settings_editor", "admin"].map(r => {
                               const hasRole = (field.rolesEditable || []).includes(r);
                               return (
                                 <button
                                   key={r}
                                   type="button"
                                   onClick={() => {
                                     const newFields = [...templateFields];
                                     const roles = newFields[idx].rolesEditable || [];
                                     newFields[idx].rolesEditable = roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r];
                                     setTemplateFields(newFields);
                                   }}
                                   className={`text-[8px] px-1 py-0.5 rounded font-black border transition-all uppercase tracking-tighter ${hasRole ? "bg-emerald-600 text-white border-emerald-700 font-bold" : "bg-white text-slate-400 border-slate-200 hover:text-slate-600"}`}
                                 >
                                   {r === "employee" ? "Emp" : r === "settings_editor" ? "Set" : "Adm"}
                                 </button>
                               );
                            })}
                          </div>
                        </div>
                        <button type="button" onClick={() => setTemplateFields(templateFields.filter((_, i) => i !== idx))} className="p-1 text-slate-300 hover:text-rose-500 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {templateFields.length === 0 && (
                      <div className="text-[10px] text-center p-4 border border-dashed border-slate-200 rounded text-slate-400">No fields added. Click "Add Field" to define extraction schema.</div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded shadow transition-colors uppercase tracking-wider">
                    <Save className="h-3 w-3" /> Save Draft
                  </button>
                </div>
              </form>
            </div>
          )}

          {!selectedTemplateCategory ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div onClick={() => setSelectedTemplateCategory('Vendor Payment Workflows')} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Network className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs tracking-wide group-hover:text-blue-700 transition-colors">Vendor Payment Workflows</h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">{templates.length} Templates</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); setTemplateCategoryDeleteTarget('Vendor Payment Workflows'); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-60 group-hover:opacity-100" title="Delete Category">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row justify-between md:items-center bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 gap-4">
                <div className="flex items-center gap-4">
                  <button aria-label="Back" onClick={() => setSelectedTemplateCategory(null)} className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors border border-slate-200">
                    <ArrowRight className="h-3 w-3 rotate-180" />
                  </button>
                  <div>
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                      <Settings2 className="h-3 w-3 text-blue-600" /> {selectedTemplateCategory}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">Extraction templates for vendor invoices, debit notes, and related documents.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {templates.filter(t => t.category === selectedTemplateCategory).length === 0 ? (
                  <div className="text-[10px] text-center p-6 border border-dashed border-slate-200 rounded bg-white text-slate-400">
                    No templates configured in this category yet. Click "New Template" to add one.
                  </div>
                ) : (
                  templates.filter(t => t.category === selectedTemplateCategory).map(t => {
                   const isDraft = t.id && String(t.id).startsWith('tmp-');
                   let parsedFields = [];
                   try { 
                     const p = JSON.parse(t.fields_json); 
                     if (Array.isArray(p)) {
                       parsedFields = p;
                     } else if (p && Array.isArray(p.fields)) {
                       parsedFields = p.fields;
                     }
                   } catch {}
                   
                   return (
                      <div key={t.id} className={`bg-white border border-slate-200 rounded-lg p-3 flex flex-col group hover:border-blue-300 hover:shadow transition-all ${isDraft ? 'bg-amber-50/20' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-slate-800 text-xs">{t.name}</h3>
                              {isDraft && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Draft</span>}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">{t.description}</p>
                          </div>
                          <div className="flex gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => {
                               const fileInput = document.createElement('input');
                               fileInput.type = 'file';
                               fileInput.accept = 'application/pdf,image/*';
                               fileInput.onchange = async (e) => {
                                  const file = e.target.files[0];
                                  if(!file) return;
                                  setTestingSandbox(true);
                                  const token = localStorage.getItem("authToken");
                                  const formData = new FormData();
                                  formData.append("file", file);
                                  formData.append("template", JSON.stringify(t));
                                  try {
                                    const res = await fetch("/api/admin/test-template", {
                                      method: "POST",
                                      headers: token ? { "Authorization": `Bearer ${token}` } : {},
                                      body: formData
                                    });
                                    const data = await res.json();
                                    setSandboxResult({ ...data, templateName: t.name });
                                  } catch (err) {
                                    alert("Sandbox testing failed: " + err.message);
                                  } finally {
                                    setTestingSandbox(false);
                                  }
                               };
                               fileInput.click();
                             }} className="px-2 py-1 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 text-[10px] font-bold rounded shadow-sm flex items-center gap-1 transition-colors"><Activity className="h-3 w-3" /> Test Sandbox</button>
                             <button onClick={() => openEditTemplate(t)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                             <button onClick={() => handleDeleteTemplateLocal(t.id)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                        
                        <div className="mt-2 pt-2 border-t border-slate-100">
                           <h4 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Extraction Schema ({parsedFields.length} fields)</h4>
                           <div className="flex flex-wrap gap-1.5">
                              {parsedFields.length === 0 && <span className="text-[10px] text-slate-400 italic">No fields defined</span>}
                              {parsedFields.map((f, i) => (
                                <div key={i} className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded hover:bg-slate-100 transition-colors">
                                  <span className="text-[10px] font-bold text-slate-700">{f.name}</span>
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest px-1 bg-white border border-slate-200 rounded">{f.type}</span>
                                  {f.required && <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest ml-0.5" title="Required Field">REQ</span>}
                                </div>
                              ))}
                           </div>
                        </div>
                      </div>
                   );
                 })
              )}
              </div>
            </div>
          )}

          {templateCategoryDeleteTarget && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-xs overflow-hidden scale-in">
                <div className="p-5 flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <h3 className="font-black text-slate-900 text-base mb-1.5">Delete Category</h3>
                  <p className="text-xs text-slate-500 mb-5 leading-relaxed">Are you sure you want to delete <strong className="text-slate-800">{templateCategoryDeleteTarget}</strong> and all its templates? This action cannot be undone.</p>
                  <div className="flex w-full gap-2.5">
                    <button type="button" onClick={() => setTemplateCategoryDeleteTarget(null)} className="flex-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
                    <button type="button" onClick={() => {
                      const ids = templates.map(t => t.id);
                      setDeletedTemplateIds([...deletedTemplateIds, ...ids.filter(id => !String(id).startsWith('tmp-'))]);
                      setTemplates([]);
                      setHasChanges(true);
                      setTemplateCategoryDeleteTarget(null);
                    }} className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {testingSandbox && (
             <div className="mt-4 p-6 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col items-center justify-center animate-pulse">
                <Loader2 className="h-6 w-6 text-indigo-500 animate-spin mb-2" />
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Running AI Extraction Sandbox...</span>
             </div>
          )}

          {sandboxResult && !testingSandbox && (
             <div className="mt-4 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden relative animate-fadeIn">
               <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-3 flex items-center justify-between">
                 <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                   <Activity className="h-4 w-4" /> Live Extraction Results: {sandboxResult.templateName}
                 </h3>
                 <button onClick={() => setSandboxResult(null)} className="text-white/80 hover:text-white p-1 bg-white/10 hover:bg-white/20 rounded transition-colors"><X className="h-4 w-4" /></button>
               </div>
               <div className="p-4 grid grid-cols-2 gap-4">
                 <div>
                   <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">JSON Output</h4>
                   <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-[10px] font-mono h-64 overflow-auto shadow-inner">
                     {JSON.stringify(sandboxResult.extractedData, null, 2)}
                   </pre>
                 </div>
                 <div>
                   <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">OCR Text Detected</h4>
                   <pre className="bg-slate-50 border border-slate-100 text-slate-600 p-3 rounded-lg text-[9px] font-mono h-64 overflow-auto shadow-inner whitespace-pre-wrap">
                     {sandboxResult.rawOcr}
                   </pre>
                 </div>
               </div>
               {sandboxResult.error && (
                  <div className="p-3 bg-red-50 border-t border-red-100 text-red-700 text-xs font-bold font-mono">Error: {sandboxResult.error}</div>
               )}
             </div>
          )}
        </div>
      </div>
    )}

  {/* --- AUDIT LOGS TAB CONTENT --- */}
    {activeTab === "audit" && (
      <div className="lg:col-span-12 bg-white/80 backdrop-blur-xl border border-slate-200/80 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col min-h-[500px] transition-all duration-300">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] font-extrabold text-slate-800 flex items-center gap-2 uppercase tracking-widest">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              Immutable System Audit Ledger
            </h2>
            <div className="flex items-center space-x-1 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60">
              <button
                type="button"
                onClick={() => setAuditCategoryFilter("ALL")}
                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${
                  auditCategoryFilter === "ALL"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => setAuditCategoryFilter("SYNC")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${
                  auditCategoryFilter === "SYNC"
                    ? "bg-cyan-500 text-white shadow-sm shadow-cyan-500/20"
                    : "text-slate-500 hover:text-cyan-700"
                }`}
              >
                <Database className="h-3 w-3" />
                Data Syncs
              </button>
              <button
                type="button"
                onClick={() => setAuditCategoryFilter("APPROVAL")}
                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${
                  auditCategoryFilter === "APPROVAL"
                    ? "bg-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                    : "text-slate-500 hover:text-emerald-700"
                }`}
              >
                Approvals
              </button>
              <button
                type="button"
                onClick={() => setAuditCategoryFilter("SECURITY")}
                className={`px-2.5 py-1 rounded-md text-[9px] font-bold transition-all ${
                  auditCategoryFilter === "SECURITY"
                    ? "bg-violet-600 text-white shadow-sm shadow-violet-500/20"
                    : "text-slate-500 hover:text-violet-700"
                }`}
              >
                Security & Sessions
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-60">
              <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Search ID, action, or user..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-[10px] font-medium bg-white border border-slate-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700"
              />
            </div>
          </div>
        </div>

        {/* Retention Policy Control Bar */}
        <div className="bg-slate-50/90 border-b border-slate-200/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-[11px]">
              <Clock className="h-3.5 w-3.5 text-indigo-600" />
              <span>Retention Policy:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                retentionInfo.retention_days === 7 
                  ? "bg-blue-50 text-blue-700 border-blue-200" 
                  : retentionInfo.retention_days === 0
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}>
                {retentionInfo.retention_days === 0 
                  ? "Indefinite (Keep All)" 
                  : `${retentionInfo.retention_days} Days ${retentionInfo.retention_days === 7 ? "(Default: 1 Week)" : "(Extended)"}`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-slate-500 font-medium">Keep logs for:</label>
              <select
                value={retentionDraft}
                onChange={(e) => {
                  const val = e.target.value;
                  setRetentionDraft(val);
                  setIsCustomRetention(val === "custom");
                  if (val !== "custom") setCustomDays("");
                }}
                className="text-[11px] font-medium bg-white border border-slate-300 rounded px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
              >
                <option value="7">1 Week (7 Days) - Default</option>
                <option value="14">2 Weeks (14 Days)</option>
                <option value="30">1 Month (30 Days)</option>
                <option value="90">3 Months (90 Days)</option>
                <option value="180">6 Months (180 Days)</option>
                <option value="365">1 Year (365 Days)</option>
                <option value="custom">Custom Days...</option>
                <option value="0">Indefinite (No Auto-Deletion)</option>
              </select>

              {isCustomRetention && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    placeholder="Days"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="w-20 text-[11px] font-medium bg-white border border-slate-300 rounded px-2 py-1 shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                  />
                  <span className="text-[10px] text-slate-500 font-medium">days</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveRetention}
                disabled={retentionSaving || (isCustomRetention && (!customDays || parseInt(customDays, 10) <= 0))}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded shadow-sm transition-all"
              >
                {retentionSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Policy
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {retentionInfo.expired_logs_count > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  {retentionInfo.expired_logs_count} expired logs (&gt;{retentionInfo.retention_days}d)
                </span>
                <button
                  type="button"
                  onClick={() => setCleanupModalOpen(true)}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded shadow-sm transition-all"
                >
                  <Trash2 className="h-3 w-3 text-rose-600" />
                  Prune Expired
                </button>
              </div>
            ) : (
              <span className="text-[10px] text-slate-400 italic">
                All logs within retention window ({retentionInfo.total_logs} total)
              </span>
            )}

            <button
              type="button"
              onClick={() => { fetchRetentionInfo(); fetchAuditLogs(); }}
              title="Refresh ledger and retention stats"
              className="p-1 text-slate-400 hover:text-slate-600 transition-colors rounded"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {retentionNotice && (
          <div className={`px-4 py-1.5 text-[10px] font-medium border-b flex items-center justify-between ${
            retentionNotice.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            <span className="flex items-center gap-1.5">
              {retentionNotice.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
              {retentionNotice.text}
            </span>
            <button onClick={() => setRetentionNotice(null)} className="text-slate-400 hover:text-slate-700 font-bold ml-2">×</button>
          </div>
        )}

        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">User / Agent</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Stage</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 text-[10px]">
              {(() => {
                const filtered = auditLogs.filter(log => {
                  const act = (log.action || "").toLowerCase();
                  const stg = (log.stage || "").toLowerCase();
                  const usr = (log.user || "").toLowerCase();
                  const det = (log.details || log.notes || "").toLowerCase();
                  const q = logSearchQuery.toLowerCase();
                  const matchesSearch = q === "" || act.includes(q) || det.includes(q) || usr.includes(q) || stg.includes(q);

                  if (!matchesSearch) return false;

                  if (auditCategoryFilter === "SYNC") {
                    return act.includes("sync") || act.includes("ingest") || stg.includes("sync") || usr.includes("sync") || det.includes("sync");
                  } else if (auditCategoryFilter === "APPROVAL") {
                    return act.includes("approve") || act.includes("reject") || act.includes("send back") || act.includes("review") || stg.includes("stage") || act.includes("checklist");
                  } else if (auditCategoryFilter === "SECURITY") {
                    return act.includes("session") || act.includes("mfa") || act.includes("login") || act.includes("auth") || act.includes("logout");
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-400 font-medium italic">
                        No audit logs found matching your filter or search.
                      </td>
                    </tr>
                  );
                }

                return filtered.map((log) => {
                  const actionStr = (log.action || "").toLowerCase();
                  let badgeColors = "bg-slate-50 text-slate-600 border-slate-200/80 shadow-[0_0_10px_rgba(148,163,184,0.1)]";
                  if (actionStr.includes("sync") || actionStr.includes("ingest"))
                    badgeColors = "bg-cyan-50 text-cyan-700 border-cyan-200/80 shadow-[0_0_10px_rgba(6,182,212,0.15)]";
                  else if (actionStr.includes("clear") || actionStr.includes("confirm") || actionStr.includes("complete") || actionStr.includes("approve")) 
                    badgeColors = "bg-emerald-50 text-emerald-700 border-emerald-200/60 shadow-[0_0_10px_rgba(16,185,129,0.15)]";
                  else if (actionStr.includes("session") || actionStr.includes("mfa") || actionStr.includes("auth"))
                    badgeColors = "bg-violet-50 text-violet-700 border-violet-200/80 shadow-[0_0_10px_rgba(139,92,246,0.15)]";
                  else if (actionStr.includes("pause") || actionStr.includes("wait")) 
                    badgeColors = "bg-amber-50 text-amber-700 border-amber-200/60 shadow-[0_0_10px_rgba(245,158,11,0.15)]";
                  else if (actionStr.includes("ai ") || actionStr.includes("parse") || actionStr.includes("classif") || actionStr.includes("extract")) 
                    badgeColors = "bg-indigo-50 text-indigo-700 border-indigo-200/60 shadow-[0_0_10px_rgba(99,102,241,0.15)]";
                  else if (actionStr.includes("reject") || actionStr.includes("fail") || actionStr.includes("error")) 
                    badgeColors = "bg-rose-50 text-rose-700 border-rose-200/60 shadow-[0_0_10px_rgba(244,63,94,0.15)]";

                  return (
                    <tr key={log.id} className="hover:bg-blue-50/30 transition-colors duration-200 group">
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-[9px] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-slate-700 flex items-center gap-1.5">
                        {actionStr.includes("sync") && <Database className="h-3 w-3 text-cyan-600 shrink-0" />}
                        <span>{log.user}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 border rounded-md text-[8.5px] font-extrabold uppercase tracking-widest transition-all duration-300 group-hover:-translate-y-px ${badgeColors}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 font-medium text-[9px]">
                        {log.stage || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 font-medium leading-relaxed max-w-xl">
                        {log.details || log.notes}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {activeTab === "raci" && (
      <div className="w-full animate-fadeIn transition-all">
        <AdminRACI />
      </div>
    )}

    {activeTab === "inapp" && (
      <div className="w-full animate-fadeIn transition-all">
        <AdminInApp />
      </div>
    )}



    {activeTab === "rbac" && (
      <div className="w-full h-full flex flex-col min-h-0 animate-fadeIn transition-all">
        <AdminRBAC />
      </div>
    )}

    {activeTab === "backups" && (
      <div className="w-full animate-fadeIn transition-all">
        <AdminBackups />
      </div>
    )}

    {activeTab === "callbacks" && (
      <div className="w-full animate-fadeIn transition-all">
        <DapiSyncBackHub />
      </div>
    )}

    {activeTab === "system" && (
      <div className="w-full animate-fadeIn transition-all">
        <AdminSystem />
      </div>
    )}

    {/* Publish Confirm Modal */}
    {publishConfirm && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full animate-slideUp">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Publish Configuration</h3>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to publish all draft modifications? This action will overwrite the live system configuration.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setPublishConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmPublish}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition"
            >
              Publish Now
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Template Delete Confirm Modal */}
    {templateDeleteConfirmTarget && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full animate-slideUp">
          <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Template</h3>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to delete this AI extraction template? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setTemplateDeleteConfirmTarget(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={confirmDeleteTemplate}
              className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md transition"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Audit Log Cleanup Confirmation Modal */}
    {cleanupModalOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full animate-slideUp">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-rose-100 rounded-full text-rose-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Prune Expired Audit Logs</h3>
          </div>
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            Are you sure you want to permanently prune expired audit logs? Active logs within the retention window will remain untouched.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-5 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Configured Retention:</span>
              <span className="font-bold text-slate-800">{retentionInfo.retention_days} Days ({retentionInfo.retention_days === 7 ? 'Default 1 Week' : 'Custom'})</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Expired logs to delete:</span>
              <span className="font-bold text-rose-600">{retentionInfo.expired_logs_count} entries</span>
            </div>
            {retentionInfo.cutoff_timestamp && (
              <div className="flex justify-between text-slate-600">
                <span>Cutoff date:</span>
                <span className="font-mono text-[10px] text-slate-700">{new Date(retentionInfo.cutoff_timestamp).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Logs retained (within window):</span>
              <span className="font-bold text-emerald-600">{Math.max(0, retentionInfo.total_logs - retentionInfo.expired_logs_count)} entries</span>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setCleanupModalOpen(false)}
              disabled={cleaningUpLogs}
              className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              onClick={handleCleanupNow}
              disabled={cleaningUpLogs}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-md transition"
            >
              {cleaningUpLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {cleaningUpLogs ? "Purging..." : "Confirm & Prune"}
            </button>
          </div>
        </div>
      </div>
    )}

  </div>
  </div>
</div>
);
}
