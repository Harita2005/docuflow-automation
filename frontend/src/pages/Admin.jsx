import React, { useState, useEffect } from 'react';
import { Network, Plus, Trash2, Edit2, Loader2, Save, X, ShieldCheck, GitMerge, AlertTriangle, Send, ArrowRight, Search, Activity, RefreshCw, Settings2 } from 'lucide-react';
import AdminUsers from '../components/AdminUsers.jsx';
import AdminMasterData from '../components/AdminMasterData.jsx';
import AdminSystem from '../components/AdminSystem.jsx';
import AdminRACI from '../components/AdminRACI.jsx';
import AdminInApp from '../components/AdminInApp.jsx';
import ConditionBuilder from '../components/ConditionBuilder.jsx';
import FlowBuilder from '../components/FlowBuilder.jsx';
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

  const [editingRule, setEditingRule] = useState(null);
  const [ruleConditions, setRuleConditions] = useState([]);
  const [editingFlow, setEditingFlow] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateFields, setTemplateFields] = useState([]);
  const [templateInstructions, setTemplateInstructions] = useState("");

  const openRuleEditor = (rule) => {
    setEditingRule(rule);
    if (rule) {
      try { setRuleConditions(JSON.parse(rule.conditions_json || '[]')); } catch(e) { setRuleConditions([]); }
    } else {
      setRuleConditions([]);
    }
  };

  const [activeTab, setActiveTab] = useState("routing");
  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  
  // New States for Search and Diagnostics
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [templateDeleteConfirmTarget, setTemplateDeleteConfirmTarget] = useState(null);
  const [publishConfirm, setPublishConfirm] = useState(false);

  // Sandbox State
  const [sandboxResult, setSandboxResult] = useState(null);
  const [testingSandbox, setTestingSandbox] = useState(false);

  useEffect(() => {
    fetchData();
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/audit-logs', { headers });
      if (res.ok) setAuditLogs(await res.json());
    } catch (e) {}
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

  const renderConditionChips = (jsonStr) => {
    try {
      const conditions = JSON.parse(jsonStr);
      if (!Array.isArray(conditions) || conditions.length === 0) return <span className="text-[10px] text-slate-400 italic">No conditions</span>;
      
      return (
        <div className="flex flex-wrap gap-1.5">
          {conditions.map((c, i) => {
            let opLabel = c.operator;
            if (opLabel === 'gt') opLabel = '>';
            else if (opLabel === 'lt') opLabel = '<';
            else if (opLabel === 'equals') opLabel = '=';
            else if (opLabel === 'contains') opLabel = '⊇';

            return (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${c.logicalOperator === 'OR' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                    {c.logicalOperator || 'AND'}
                  </span>
                )}
                <div className="flex items-center text-[9px] font-bold tracking-wide rounded-full overflow-hidden shadow-sm border border-slate-200/60">
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 border-r border-slate-200/60 uppercase">{c.field}</span>
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 border-r border-slate-200/60 font-mono">{opLabel}</span>
                  <span className="bg-white text-slate-700 px-2 py-0.5">{c.value}</span>
                </div>
              </div>
            );
          })}
        </div>
      );
    } catch(e) {
      return <span className="text-[9px] font-mono text-slate-500 truncate max-w-[200px]">{jsonStr}</span>;
    }
  };

  const handleSaveRuleLocal = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    
    const rule = {
      id: editingRule.id || `tmp-${Date.now()}`,
      priority: parseInt(fd.get('priority') || '10'),
      rule_name: fd.get('rule_name') || "New Rule",
      conditions_json: JSON.stringify(ruleConditions),
      target_workflow_id: fd.get('target_workflow_id'),
      document_type: editingRule.document_type || 'Any',
      rule_category: editingRule.rule_category || 'Vendor Payment Workflows'
    };
    if (editingRule.id) {
      setRules(rules.map(r => r.id === rule.id ? rule : r));
    } else {
      setRules([...rules, rule]);
    }
    setEditingRule(null);
    setHasChanges(true);
  };

  const handleDeleteRuleLocal = (id) => {
    if (!id.startsWith('tmp-')) setDeletedRuleIds([...deletedRuleIds, id]);
    setRules(rules.filter(r => r.id !== id));
    setHasChanges(true);
  };

  const handleSaveFlowLocal = (e) => {
    e.preventDefault();
    if (!editingFlow || !editingFlow.profile_name) return;
    
    const existingStages = steps.filter(s => s.profile_name === (editingFlow.original_profile_name || editingFlow.profile_name));
    const newStagesIds = editingFlow.stages.map(s => s.id).filter(id => id && !id.startsWith('tmp-'));
    const deletedIds = existingStages.map(s => s.id).filter(id => !newStagesIds.includes(id));
    
    if (deletedIds.length > 0) {
       setDeletedStepIds([...deletedStepIds, ...deletedIds.filter(id => !id.startsWith('tmp-'))]);
    }
    
    const flowSteps = editingFlow.stages.map((stg, idx) => ({
      id: stg.id || `tmp-${Date.now()}-${idx}`,
      profile_name: editingFlow.profile_name,
      stage_number: idx + 1,
      approver_target: stg.approver_target,
      action_required: stg.action_required || 'Approve',
      permissions: stg.permissions || 'Approve Only',
      document_type: 'Any'
    }));
    
    const remainingSteps = steps.filter(s => s.profile_name !== (editingFlow.original_profile_name || editingFlow.profile_name));
    
    setSteps([...remainingSteps, ...flowSteps]);
    setEditingFlow(null);
    setHasChanges(true);
  };

  const handleDeleteFlowLocal = (profile_name) => {
    if (window.confirm(`Are you sure you want to delete the entire flow "${profile_name}"?`)) {
      const idsToDelete = steps.filter(s => s.profile_name === profile_name).map(s => s.id);
      const nonTmpIds = idsToDelete.filter(id => !id.startsWith('tmp-'));
      if (nonTmpIds.length > 0) {
        setDeletedStepIds([...deletedStepIds, ...nonTmpIds]);
      }
      setSteps(steps.filter(s => s.profile_name !== profile_name));
      setHasChanges(true);
    }
  };

  const openEditTemplate = (t) => {
    if (!t) {
      setTemplateFields([{ id: Date.now(), name: '', type: 'string', description: '', required: false }]);
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
    } catch(e) {}
    if (fields.length === 0) fields = [{ id: Date.now(), name: '', type: 'string', description: '', required: false }];
    fields = fields.map((f, i) => ({ ...f, id: f.id || Date.now() + i }));
    setTemplateFields(fields);
    setTemplateInstructions(instrs);
    setEditingTemplate(t);
  };

  const handleSaveTemplateLocal = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const validFields = templateFields.filter(f => f.name.trim() !== '');
    const cleanFields = validFields.map(({id, ...rest}) => rest);
    
    const template = {
      id: editingTemplate.id || `tmp-${Date.now()}`,
      name: fd.get('name'),
      description: fd.get('description') || '',
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

  const handleDeleteTemplateLocal = (id) => {
    setTemplateDeleteConfirmTarget(id);
  };

  const confirmDeleteTemplate = () => {
    if (!templateDeleteConfirmTarget) return;
    const id = templateDeleteConfirmTarget;
    if (!id.startsWith('tmp-')) setDeletedTemplateIds([...deletedTemplateIds, id]);
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
        const payload = { ...rule, id: rule.id.startsWith('tmp-') ? undefined : rule.id };
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
        const payload = { ...step, id: step.id.startsWith('tmp-') ? undefined : step.id };
        await fetch('/api/admin/workflow-steps', { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      // 5. Delete templates
      for (const id of deletedTemplateIds) {
        await fetch(`/api/templates/${id}`, { method: 'DELETE', headers });
      }
      // 6. Upsert templates
      for (const t of templates) {
        const payload = { ...t, id: t.id && t.id.startsWith('tmp-') ? undefined : t.id };
        await fetch('/api/templates', { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      // 7. Audit Log Publish
      const changesCount = deletedRuleIds.length + deletedStepIds.length + deletedTemplateIds.length + rules.filter(r=>r.id.startsWith('tmp-')).length + steps.filter(s=>s.id.startsWith('tmp-')).length + templates.filter(t=>t.id && t.id.startsWith('tmp-')).length;
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

  const groupedSteps = Array.from(new Set(steps.map(s => s.profile_name))).map(profile => ({
    profile_name: profile,
    stages: steps.filter(s => s.profile_name === profile).sort((a, b) => a.stage_number - b.stage_number)
  }));

  return (
    <div className="flex gap-4 min-h-[calc(100vh-6rem)] w-full font-sans">
      
      {/* Secondary Sidebar */}
      <div className="w-48 shrink-0 flex flex-col gap-4 sticky top-6 h-fit">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Settings</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Manage system configuration and policies.</p>
        </div>

        <div className="flex-1 space-y-4">
          {/* WORKFLOW */}
          <div className="space-y-0.5">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">Workflow & Rules</h3>
            <button
              onClick={() => setActiveTab("routing")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "routing" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              Flow Builder
            </button>
            <button
              onClick={() => setActiveTab("matrix")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "matrix" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              Condition Builder
            </button>
            <button
              onClick={() => setActiveTab("templates")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "templates" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              AI Templates
            </button>
          </div>

          {/* WORKSPACE & ACCESS */}
          <div className="space-y-0.5">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">Workspace & Access</h3>
            <button
              onClick={() => setActiveTab("users")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "users" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              IAM & Users
            </button>
          </div>

          {/* SYSTEM ADMINISTRATION */}
          <div className="space-y-0.5">
            <h3 className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">System Administration</h3>
            <button
              onClick={() => setActiveTab("raci")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "raci" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              Email & RACI
            </button>
            <button
              onClick={() => setActiveTab("inapp")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "inapp" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              In-App Notifications
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "audit" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              Audit Logs
            </button>
            <button
              onClick={() => setActiveTab("system")}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === "system" ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shadow-sm" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
            >
              System Core & Health
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col font-sans pb-12">
        
        {/* Settings Header */}
        <div className={`mb-3 border rounded-lg p-2 backdrop-blur-md shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2 transition-colors ${hasChanges ? 'bg-amber-50/90 border-amber-200/60' : 'bg-white/80 border-slate-200/60'}`}>
          <div className="flex items-center gap-2">
            <div className={`h-6 w-6 rounded-md flex items-center justify-center text-white shadow-sm transition-colors ${hasChanges ? 'bg-gradient-to-br from-amber-400 to-amber-600' : 'bg-gradient-to-br from-slate-800 to-slate-900'}`}>
              {hasChanges ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            </div>
            <div>
              <h1 className="text-xs font-display font-bold text-slate-900 tracking-tight leading-none">
                {activeTab === 'matrix' && 'Condition Policy Matrix'}
                {activeTab === 'routing' && 'Flow Builder'}
                {activeTab === 'templates' && 'AI Templates'}
                {activeTab === 'users' && 'IAM & Users'}
                {activeTab === 'masterdata' && 'ERP Master'}
                {activeTab === 'system' && 'System Core & Health'}
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

      <div className="flex flex-col gap-3 items-stretch relative">
        {publishing && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 rounded-xl flex items-center justify-center">
            <div className="bg-white p-4 rounded-xl shadow-xl flex items-center gap-3 font-bold text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> Applying Policies...
            </div>
          </div>
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

        {/* --- ROUTING TAB CONTENT --- */}
        {activeTab === "routing" && (
          <FlowBuilder users={allUsers} />
        )}

    {/* --- TEMPLATES TAB CONTENT --- */}
    {activeTab === "templates" && (
      <div className="w-full bg-white/60 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden flex flex-col transition-all">
        <div className="border-b border-slate-100/80 bg-slate-50/50 p-2.5 px-3 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
              <Network className="h-4 w-4 text-purple-600" />
              Dynamic Data Extraction Templates
            </h2>
          </div>
          <button
            onClick={() => openEditTemplate(null)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-[10px] uppercase tracking-wider rounded transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> New Template
          </button>
        </div>

        <div className="p-0 flex-1">
          {editingTemplate && (
            <div className="bg-purple-50/30 p-3 border-b border-purple-100/50">
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
                <div className="pt-2 border-t border-purple-100">
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
                <div className="pt-2 border-t border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[10px] font-bold text-slate-600 uppercase">Document Fields</label>
                    <button type="button" onClick={() => setTemplateFields([...templateFields, { id: Date.now(), name: '', type: 'string', description: '' }])} className="flex items-center gap-1 text-[9px] font-bold text-purple-600 hover:text-purple-800 bg-purple-100/50 hover:bg-purple-100 px-2 py-1 rounded">
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
                          className="flex-1 text-xs p-1.5 border border-slate-200 rounded focus:border-purple-400 focus:outline-none"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => {
                            const newFields = [...templateFields];
                            newFields[idx].type = e.target.value;
                            setTemplateFields(newFields);
                          }}
                          className="w-24 text-xs p-1.5 border border-slate-200 rounded focus:border-purple-400 focus:outline-none bg-slate-50"
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="boolean">Boolean</option>
                          <option value="date">Date</option>
                        </select>
                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-1.5 rounded" title="Mark as Required Field">
                          <input 
                            type="checkbox" 
                            checked={field.required || false}
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
                          className="flex-1 text-xs p-1.5 border border-slate-200 rounded focus:border-purple-400 focus:outline-none"
                        />
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
                  <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold rounded shadow transition-colors uppercase tracking-wider">
                    <Save className="h-3 w-3" /> Save Draft
                  </button>
                </div>
              </form>
            </div>
          )}

          {!selectedTemplateCategory ? (
            <div className="p-4 bg-slate-50/30">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div onClick={() => setSelectedTemplateCategory('Vendor Payment Workflows')} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-purple-400 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Network className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm tracking-wide">Vendor Payment Workflows</h3>
                      <p className="text-sm font-bold text-slate-500 mt-0.5">{templates.length} Templates</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-purple-500 transition-colors" />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50/30">
              <div className="mb-4 flex flex-col md:flex-row justify-between md:items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
                <div className="flex items-center gap-3">
                  <button aria-label="Back" onClick={() => setSelectedTemplateCategory(null)} className="text-slate-400 hover:text-slate-600 p-1.5 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors border border-slate-200">
                    <ArrowRight className="h-4 w-4 rotate-180" />
                  </button>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <Settings2 className="h-4 w-4 text-purple-600" /> Vendor Payment
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-1">Extraction templates for vendor invoices, debit notes, and related documents.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {templates.length === 0 ? (
                   <div className="p-8 text-center text-slate-400 text-xs font-bold bg-white rounded-xl border border-slate-200">No templates configured yet.</div>
                ) : (
                 templates.map(t => {
                   const isDraft = t.id && String(t.id).startsWith('tmp-');
                   let parsedFields = [];
                   try { 
                     const p = JSON.parse(t.fields_json); 
                     if (Array.isArray(p)) {
                       parsedFields = p;
                     } else if (p && Array.isArray(p.fields)) {
                       parsedFields = p.fields;
                     }
                   } catch(e) {}
                   
                   return (
                     <div key={t.id} className={`bg-white border border-slate-200 rounded-xl p-4 flex flex-col group hover:border-purple-300 hover:shadow-md transition-all ${isDraft ? 'bg-amber-50/20' : ''}`}>
                       <div className="flex items-start justify-between">
                         <div>
                           <div className="flex items-center gap-2 mb-1">
                             <h3 className="font-bold text-slate-800 text-sm">{t.name}</h3>
                             {isDraft && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Draft</span>}
                           </div>
                           <p className="text-xs text-slate-500">{t.description}</p>
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
                            }} className="px-2.5 py-1.5 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 text-[10px] font-bold rounded-md shadow-sm flex items-center gap-1 transition-colors"><Activity className="h-3.5 w-3.5" /> Test Sandbox</button>
                            <button onClick={() => openEditTemplate(t)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-md transition-colors"><Edit2 className="h-4 w-4" /></button>
                            <button onClick={() => handleDeleteTemplateLocal(t.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                         </div>
                       </div>
                       
                       <div className="mt-4 pt-3 border-t border-slate-100">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Extraction Schema ({parsedFields.length} fields)</h4>
                          <div className="flex flex-wrap gap-2">
                             {parsedFields.length === 0 && <span className="text-xs text-slate-400 italic">No fields defined</span>}
                             {parsedFields.map((f, i) => (
                               <div key={i} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-md hover:bg-slate-100 transition-colors">
                                 <span className="text-xs font-bold text-slate-700">{f.name}</span>
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 bg-white border border-slate-200 rounded">{f.type}</span>
                                 {f.required && <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest ml-1" title="Required Field">REQ</span>}
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

          {testingSandbox && (
             <div className="mt-4 p-6 bg-indigo-50 border border-indigo-100 rounded-xl flex flex-col items-center justify-center animate-pulse">
                <Loader2 className="h-6 w-6 text-indigo-500 animate-spin mb-2" />
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Running AI Extraction Sandbox...</span>
             </div>
          )}

          {sandboxResult && !testingSandbox && (
             <div className="mt-4 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden relative animate-fadeIn">
               <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-3 flex items-center justify-between">
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
          <h2 className="text-[10px] font-extrabold text-slate-800 flex items-center gap-2 uppercase tracking-widest">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            Immutable System Audit Ledger
          </h2>
          <div className="relative w-full sm:w-64">
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
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">User / Agent</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 text-[10px]">
              {auditLogs.filter(log => 
                logSearchQuery === "" || 
                log.action.toLowerCase().includes(logSearchQuery.toLowerCase()) || 
                log.details.toLowerCase().includes(logSearchQuery.toLowerCase()) || 
                log.user.toLowerCase().includes(logSearchQuery.toLowerCase())
              ).length === 0 ? (
                <tr><td colSpan="4" className="p-8 text-center text-slate-400 font-medium italic">No audit logs found matching your search.</td></tr>
              ) : (
                auditLogs.filter(log => 
                  logSearchQuery === "" || 
                  log.action.toLowerCase().includes(logSearchQuery.toLowerCase()) || 
                  log.details.toLowerCase().includes(logSearchQuery.toLowerCase()) || 
                  log.user.toLowerCase().includes(logSearchQuery.toLowerCase())
                ).map((log) => {
                  const actionStr = log.action.toLowerCase();
                  let badgeColors = "bg-slate-50 text-slate-600 border-slate-200/80 shadow-[0_0_10px_rgba(148,163,184,0.1)]";
                  if (actionStr.includes("clear") || actionStr.includes("confirm") || actionStr.includes("complete") || actionStr.includes("approve")) 
                    badgeColors = "bg-emerald-50 text-emerald-700 border-emerald-200/60 shadow-[0_0_10px_rgba(16,185,129,0.15)]";
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
                      <td className="px-4 py-2.5 font-bold text-slate-700">{log.user}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className={`px-2 py-0.5 border rounded-md text-[8.5px] font-extrabold uppercase tracking-widest transition-all duration-300 group-hover:-translate-y-px ${badgeColors}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 font-medium leading-relaxed max-w-xl">
                        {log.details}
                      </td>
                    </tr>
                  );
                })
              )}
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

    {activeTab === "users" && (
      <div className="w-full animate-fadeIn transition-all">
        <AdminUsers />
      </div>
    )}

    {activeTab === "masterdata" && (
      <div className="w-full animate-fadeIn transition-all">
        <AdminMasterData />
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

  </div>
  </div>
</div>
);
}
