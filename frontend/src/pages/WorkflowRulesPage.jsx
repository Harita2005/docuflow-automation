import React, { useState, useEffect } from 'react';
import { 
  Network, 
  Plus, 
  Trash2, 
  Loader2, 
  Save, 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  Send, 
  ArrowRight, 
  GitFork,
  Sliders,
  CheckSquare,
  Sparkles
} from 'lucide-react';
import ConditionBuilder from '../components/ConditionBuilder.jsx';
import FlowBuilder from '../components/FlowBuilder.jsx';
import ChecklistConditionBuilder from '../components/ChecklistConditionBuilder.jsx';

export default function WorkflowRulesPage() {
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [rules, setRules] = useState([]);
  const [steps, setSteps] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [deletedRuleIds, setDeletedRuleIds] = useState([]);
  const [deletedStepIds, setDeletedStepIds] = useState([]);
  const [deletedTemplateIds, setDeletedTemplateIds] = useState([]);

  const [hasChanges, setHasChanges] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateFields, setTemplateFields] = useState([]);
  const [templateInstructions, setTemplateInstructions] = useState('');

  const [activeTab, setActiveTab] = useState(() => {
    const stored = localStorage.getItem('workflowActiveTab') || localStorage.getItem('adminActiveTab');
    if (stored === 'routing' || stored === 'matrix' || stored === 'checklists' || stored === 'templates') {
      return stored;
    }
    return 'routing';
  });

  const [selectedTemplateCategory, setSelectedTemplateCategory] = useState(null);
  const [isRootView, setIsRootView] = useState(true);
  const [templateDeleteConfirmTarget, setTemplateDeleteConfirmTarget] = useState(null);
  const [_templateCategoryDeleteTarget, setTemplateCategoryDeleteTarget] = useState(null);
  const [publishConfirm, setPublishConfirm] = useState(false);

  useEffect(() => {
    localStorage.setItem('workflowActiveTab', activeTab);
    localStorage.setItem('adminActiveTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleSetTab = (e) => {
      if (e.detail && ['routing', 'matrix', 'checklists', 'templates'].includes(e.detail)) {
        setActiveTab(e.detail);
      }
    };
    window.addEventListener('set-workflow-tab', handleSetTab);
    window.addEventListener('set-admin-tab', handleSetTab);
    return () => {
      window.removeEventListener('set-workflow-tab', handleSetTab);
      window.removeEventListener('set-admin-tab', handleSetTab);
    };
  }, []);

  useEffect(() => {
    fetchData();

    const handleUpdateAddAction = (e) => {
      setIsRootView(e.detail);
    };
    window.addEventListener('update-add-action', handleUpdateAddAction);
    return () => window.removeEventListener('update-add-action', handleUpdateAddAction);
  }, []);

  useEffect(() => {
    setIsRootView(true);
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
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
      console.error('Failed to load workflow studio data:', e);
    }
    setLoading(false);
  };

  const openEditTemplate = (t) => {
    if (!t) {
      setTemplateFields([{ id: Date.now(), name: '', type: 'string', description: '', required: false, rolesVisible: [], rolesEditable: [] }]);
      setTemplateInstructions('');
      setEditingTemplate({ name: '', description: '', fields_json: '' });
      return;
    }
    let fields = [];
    let instrs = '';
    try {
      const parsed = JSON.parse(t.fields_json);
      if (parsed && Array.isArray(parsed.fields)) {
        fields = parsed.fields;
        instrs = parsed.instructions || '';
      } else if (Array.isArray(parsed)) {
        fields = parsed;
      } else if (parsed && parsed.schema) {
        const schemaParsed = typeof parsed.schema === 'string' ? JSON.parse(parsed.schema) : parsed.schema;
        fields = Object.keys(schemaParsed).map((k, i) => ({ id: Date.now() + i, name: k, type: 'string', description: '', required: false }));
        instrs = parsed.instructions || '';
      }
    } catch (err) {
      console.debug('Failed parsing template schema:', err);
    }
    if (fields.length === 0) {
      fields = [{ id: Date.now(), name: '', type: 'string', description: '', required: false, rolesVisible: [], rolesEditable: [] }];
    }
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
    const cleanFields = validFields.map(({ _id, ...rest }) => rest);

    const template = {
      ...editingTemplate,
      id: editingTemplate.id || ('tmp-' + Date.now()),
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
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      };

      for (const id of deletedRuleIds) {
        await fetch('/api/admin/routing-rules/' + id, { method: 'DELETE', headers });
      }
      for (const rule of rules) {
        const payload = { ...rule, id: String(rule.id).startsWith('tmp-') ? undefined : rule.id };
        const res = await fetch('/api/admin/routing-rules', { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!res.ok) {
          const errData = await res.json();
          alert('Error saving rule ' + rule.rule_name + ': ' + (errData.error || res.statusText));
        }
      }

      for (const id of deletedStepIds) {
        await fetch('/api/admin/workflow-steps/' + id, { method: 'DELETE', headers });
      }
      for (const step of steps) {
        const payload = { ...step, id: String(step.id).startsWith('tmp-') ? undefined : step.id };
        await fetch('/api/admin/workflow-steps', { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      for (const id of deletedTemplateIds) {
        await fetch('/api/templates/' + id, { method: 'DELETE', headers });
      }
      for (const t of templates) {
        const payload = { ...t, id: t.id && String(t.id).startsWith('tmp-') ? undefined : t.id };
        await fetch('/api/templates', { method: 'POST', headers, body: JSON.stringify(payload) });
      }

      const changesCount = deletedRuleIds.length + deletedStepIds.length + deletedTemplateIds.length +
        rules.filter(r => String(r.id).startsWith('tmp-')).length +
        steps.filter(s => String(s.id).startsWith('tmp-')).length +
        templates.filter(t => t.id && String(t.id).startsWith('tmp-')).length;
      await fetch('/api/admin/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({ changes: changesCount })
      });

      await fetchData();
    } catch (e) {
      console.error(e);
      alert('Failed to publish changes');
    }
    setPublishing(false);
  };

  const discardChanges = () => {
    if (window.confirm('Are you sure you want to discard all unpublished drafts?')) {
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className='flex h-64 items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin text-slate-400' />
      </div>
    );
  }

  const navItems = [
    { id: 'routing', label: 'Flow Builder', icon: GitFork, desc: 'Visual Workflows & Approval Stages' },
    { id: 'matrix', label: 'Condition Builder', icon: Sliders, desc: 'Business Rules & Routing Matrix' },
    { id: 'checklists', label: 'Checklist Matrix', icon: CheckSquare, desc: 'Document Compliance & Mandatory Items' },
    { id: 'templates', label: 'AI Templates', icon: Sparkles, desc: 'Field Extraction Prompts & Schemas' },
  ];

  return (
    <div className='admin-settings-theme flex flex-col h-[calc(100vh-4.2rem)] w-full font-sans overflow-hidden px-3 py-1.5'>
      
      {/* Unified Workflow & Rules Header Bar */}
      <div className='shrink-0 mb-1.5 border border-slate-200/80 bg-white/95 backdrop-blur-md rounded-lg p-2 px-3 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2'>
        <div className='flex items-center gap-2.5'>
          <div className='h-7 w-7 rounded-md bg-gradient-to-br from-[#003F28] to-[#002B1B] text-white flex items-center justify-center shadow-2xs'>
            <Network className='h-4 w-4 text-[#FFBF00]' />
          </div>
          <div>
            <div className='flex items-center gap-1.5'>
              <h1 className='text-xs font-bold text-slate-900 tracking-tight'>Workflow &amp; Rules Studio</h1>
              <span className='text-[8.5px] px-1.5 py-0.2 rounded-full font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200/60'>
                4 Unified Engines
              </span>
            </div>
            <p className='text-[9.5px] text-slate-500'>
              Configure approval flow pipelines, routing condition matrices, compliance checklists, and AI field templates.
            </p>
          </div>
        </div>

        {/* 4 Engine Switcher Tabs */}
        <div className='flex items-center bg-slate-100/90 p-0.5 rounded-md border border-slate-200/80'>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ' + (
                  isActive
                    ? 'bg-white text-[#003F28] font-bold shadow-2xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                )}
                title={item.desc}
              >
                <Icon className={'h-3 w-3 ' + (isActive ? 'text-[#003F28]' : 'text-slate-400')} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Action Buttons: Add Category, New Template, Discard, Publish */}
        <div className='flex items-center gap-1.5'>
          {(activeTab === 'routing' || activeTab === 'matrix') && isRootView && (
            <button 
              onClick={() => window.dispatchEvent(new Event('open-add-category'))} 
              className='flex items-center gap-1 px-2.5 py-1 bg-[#003F28] text-white hover:bg-[#002f1e] font-bold text-[10px] rounded-md transition shadow-2xs cursor-pointer'
            >
              <Plus className='h-3 w-3' /> Add Category
            </button>
          )}

          {activeTab === 'templates' && (
            <button
              onClick={() => openEditTemplate(null)}
              className='flex items-center gap-1 px-2.5 py-1 bg-[#003F28] text-white hover:bg-[#002f1e] font-bold text-[10px] rounded-md transition shadow-2xs cursor-pointer'
            >
              <Plus className='h-3 w-3' /> New Template
            </button>
          )}

          {hasChanges && (
            <div className='flex items-center gap-1 pl-1.5 border-l border-slate-200'>
              <span className='text-[9.5px] text-amber-700 font-bold flex items-center gap-1'>
                <AlertTriangle className='h-2.5 w-2.5 text-amber-600' /> Draft
              </span>
              <button 
                onClick={discardChanges}
                disabled={publishing}
                className='px-2 py-0.5 text-[9.5px] font-bold text-slate-500 hover:bg-slate-100 rounded transition cursor-pointer'
              >
                Discard
              </button>
              <button 
                onClick={publishChanges}
                disabled={publishing}
                className='flex items-center gap-1 px-2.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[9.5px] rounded transition shadow-2xs cursor-pointer'
              >
                {publishing ? <Loader2 className='h-2.5 w-2.5 animate-spin' /> : <Save className='h-2.5 w-2.5' />}
                Publish
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Workspace Body for the 4 Engines */}
      <div className='flex-1 min-h-0 flex flex-col relative overflow-y-auto custom-scrollbar'>
        {publishing && (
          <div className='absolute inset-0 bg-white/50 backdrop-blur-xs z-50 rounded-xl flex items-center justify-center'>
            <div className='bg-white p-4 rounded-xl shadow-xl flex items-center gap-3 font-bold text-slate-700'>
              <Loader2 className='h-5 w-5 animate-spin text-emerald-600' /> Applying Configurations...
            </div>
          </div>
        )}

        {/* ENGINE 1: FLOW BUILDER */}
        {activeTab === 'routing' && (
          <FlowBuilder users={allUsers} />
        )}

        {/* ENGINE 2: CONDITION MATRIX / BUILDER */}
        {activeTab === 'matrix' && (
          <ConditionBuilder 
            rules={rules} 
            setRules={setRules} 
            setHasChanges={setHasChanges} 
            handleDeleteRuleLocal={handleDeleteRuleLocal}
          />
        )}

        {/* ENGINE 3: CHECKLIST MATRIX */}
        {activeTab === 'checklists' && (
          <ChecklistConditionBuilder />
        )}

        {/* ENGINE 4: AI TEMPLATES */}
        {activeTab === 'templates' && (
          <div className='flex flex-col gap-4 mt-1'>
            {editingTemplate && (
              <div className='bg-white border border-slate-200 rounded-lg p-2'>
                <form onSubmit={handleSaveTemplateLocal} className='space-y-4 relative'>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                    <div>
                  <label className='block text-[11px] font-bold text-slate-600 uppercase mb-1'>Template Name</label>
                      <input 
                        type='text' 
                        name='name' 
                        defaultValue={editingTemplate.name} 
                        required 
                        placeholder='e.g., Commercial Invoice, Transport Bilty'
                        className='w-full text-[13px] p-1.5 border border-slate-200 rounded-lg bg-white font-medium' 
                      />
                    </div>
                    <div>
                      <label className='block text-[11px] font-bold text-slate-600 uppercase mb-1'>Description</label>
                      <input 
                        type='text' 
                        name='description' 
                        defaultValue={editingTemplate.description} 
                        placeholder='Purpose and applicability of template'
                        className='w-full text-[13px] p-1.5 border border-slate-200 rounded-lg bg-white font-medium' 
                      />
                    </div>
                  </div>
                  <div className='pt-2 border-t border-emerald-100'>
                    <label className='block text-[11px] font-bold text-slate-600 uppercase mb-1'>Global AI Extraction Prompt</label>
                    <textarea 
                      name='instructions' 
                      value={templateInstructions} 
                      onChange={e => setTemplateInstructions(e.target.value)} 
                      rows={3} 
                      placeholder='e.g., The document is a purchase invoice. Ensure you extract invoice_number, total_amount, and gst_number accurately.' 
                      className='w-full text-[13px] p-1.5 border border-slate-200 rounded-lg bg-white font-medium resize-none h-20'
                    />
                  </div>
                  <div className='pt-2 border-t border-emerald-100'>
                    <div className='flex items-center justify-between mb-2'>
                      <label className='block text-[11px] font-bold text-slate-700 uppercase'>Document Extraction Fields</label>
                      <button 
                        type='button' 
                        onClick={() => setTemplateFields([...templateFields, { id: Date.now(), name: '', type: 'string', description: '', required: false, rolesVisible: [], rolesEditable: [] }])} 
                        className='flex items-center gap-1 text-[10px] font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-100/70 hover:bg-emerald-100 px-2.5 py-1 rounded-md cursor-pointer'
                      >
                        <Plus className='h-3 w-3' /> Add Field
                      </button>
                    </div>
                    <div className='space-y-2'>
                      {templateFields.map((field, idx) => (
                        <div key={field.id} className='flex gap-2 items-center bg-white p-1 rounded-sm border border-slate-200'>
                          <input
                            type='text'
                            placeholder='Field Name (e.g. invoice_number)'
                            value={field.name}
                            onChange={(e) => {
                              const newFields = [...templateFields];
                              newFields[idx].name = e.target.value;
                              setTemplateFields(newFields);
                            }}
                            required
                            className='flex-1 text-xs p-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#003F28]'
                          />
                          <select
                            value={field.type}
                            onChange={(e) => {
                              const newFields = [...templateFields];
                              newFields[idx].type = e.target.value;
                              setTemplateFields(newFields);
                            }}
                            className='w-24 text-xs p-1.5 border border-slate-200 rounded-md bg-slate-50 cursor-pointer'
                          >
                            <option value='string'>String</option>
                            <option value='number'>Number</option>
                            <option value='boolean'>Boolean</option>
                            <option value='date'>Date</option>
                          </select>
                          <div className='flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md' title='Mark as Required Field'>
                            <input 
                              type='checkbox' 
                              checked={Boolean(field.required)}
                              onChange={(e) => {
                                const newFields = [...templateFields];
                                newFields[idx].required = e.target.checked;
                                setTemplateFields(newFields);
                              }}
                              className='cursor-pointer'
                            />
                            <label className='text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer'>Req</label>
                          </div>
                          <input
                            type='text'
                            placeholder='Description / Hint'
                            value={field.description}
                            onChange={(e) => {
                              const newFields = [...templateFields];
                              newFields[idx].description = e.target.value;
                              setTemplateFields(newFields);
                            }}
                            className='flex-1 text-xs p-1.5 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#003F28]'
                          />
                          <button 
                            type='button' 
                            onClick={() => setTemplateFields(templateFields.filter((_, i) => i !== idx))} 
                            className='p-1.5 text-slate-300 hover:text-rose-600 transition-colors cursor-pointer'
                          >
                            <Trash2 className='h-4 w-4' />
                          </button>
                        </div>
                      ))}
                      {templateFields.length === 0 && (
                        <div className='text-[10px] text-center p-4 border border-dashed border-slate-200 rounded-lg text-slate-400 bg-white'>
                          No extraction fields added. Click "Add Field" to define extraction schema.
                        </div>
                      )}
                    </div>
                  </div>
                    <div className='flex justify-end space-x-2 pt-2'>
                      <button 
                        type='button' 
                        onClick={() => { setEditingTemplate(null); setTemplateFields([]); }}
                        className='px-3 py-1.5 bg-gray-200 text-slate-800 text-[10px] font-medium rounded-lg hover:bg-gray-300 transition-colors cursor-pointer'
                      >
                        Cancel
                      </button>
                      <button 
                        type='submit' 
                        className='flex items-center gap-1.5 px-3.5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-[10px] font-bold rounded-lg shadow-2xs transition-colors uppercase tracking-wider cursor-pointer'
                      >
                        <Save className='h-3 w-3' /> Save Draft
                      </button>
                    </div>
                </form>
              </div>
            )}

            {!selectedTemplateCategory ? (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5'>
                <div 
                  onClick={() => setSelectedTemplateCategory('Vendor Payment Workflows')} 
                  className='bg-white p-3 rounded-lg shadow-2xs border border-slate-200 hover:border-emerald-500 hover:shadow-xs cursor-pointer transition-all flex items-center justify-between group text-left w-full'
                >
                  <div className='flex items-center gap-2.5'>
                    <div className='h-7 w-7 rounded-md bg-emerald-50 text-emerald-800 flex items-center justify-center group-hover:bg-[#003F28] group-hover:text-white transition-colors'>
                      <Sparkles className='h-3.5 w-3.5' />
                    </div>
                    <div>
                      <h3 className='font-bold text-slate-800 text-xs tracking-tight group-hover:text-emerald-900 transition-colors'>
                        Vendor Payment Workflows
                      </h3>
                      <p className='text-[9.5px] font-medium text-slate-500 mt-0.5'>{templates.length} Templates Configured</p>
                    </div>
                  </div>
                  <div className='flex items-center gap-1.5'>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setTemplateCategoryDeleteTarget('Vendor Payment Workflows'); }} 
                      className='p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-60 group-hover:opacity-100' 
                      title='Delete Category'
                    >
                      <Trash2 className='h-3 w-3' />
                    </button>
                    <ArrowRight className='h-3.5 w-3.5 text-slate-300 group-hover:text-emerald-700 transition-colors' />
                  </div>
                </div>
              </div>
            ) : (
              <div className='flex flex-col gap-2.5'>
                <div className='flex flex-col md:flex-row justify-between md:items-center bg-white px-3 py-2 rounded-lg shadow-2xs border border-slate-200 gap-2.5'>
                  <div className='flex items-center gap-2'>
                    <button 
                      aria-label='Back' 
                      onClick={() => setSelectedTemplateCategory(null)} 
                      className='text-slate-400 hover:text-slate-600 p-1 bg-slate-50 rounded-md hover:bg-slate-100 transition-colors border border-slate-200 cursor-pointer'
                    >
                      <ArrowRight className='h-3 w-3 rotate-180' />
                    </button>
                    <div>
                      <h3 className='text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1'>
                        <Sparkles className='h-3 w-3 text-emerald-700' /> {selectedTemplateCategory}
                      </h3>
                      <p className='text-[9.5px] text-slate-500'>
                        Document extraction models, schemas, and AI instructions for this category.
                      </p>
                    </div>
                  </div>
                </div>

                <div className='grid grid-cols-1 gap-3'>
                  {templates.filter(t => t.category === selectedTemplateCategory).length === 0 ? (
                    <div className='text-[10px] text-center p-8 border border-dashed border-slate-200 rounded-xl bg-white text-slate-400'>
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
                      } catch (err) {
                        console.debug('Failed parsing template fields JSON:', err);
                      }

                      return (
                        <div key={t.id} className={'bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col group hover:border-emerald-400 hover:shadow-xs transition-all ' + (isDraft ? 'bg-amber-50/20' : '')}>
                          <div className='flex items-start justify-between'>
                            <div>
                              <div className='flex items-center gap-2'>
                                <h3 className='font-bold text-slate-800 text-xs'>{t.name}</h3>
                                {isDraft && (
                                  <span className='text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider'>
                                    Draft
                                  </span>
                                )}
                              </div>
                              <p className='text-[10px] text-slate-500 mt-0.5'>{t.description}</p>
                            </div>
                            <div className='flex gap-1.5'>
                              <button 
                                onClick={() => openEditTemplate(t)} 
                                className='px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition cursor-pointer'
                              >
                                Edit Schema
                              </button>
                              <button 
                                onClick={() => handleDeleteTemplateLocal(t.id)} 
                                className='p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer'
                                title='Delete Template'
                              >
                                <Trash2 className='h-3.5 w-3.5' />
                              </button>
                            </div>
                          </div>

                          {parsedFields.length > 0 && (
                            <div className='mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5'>
                              {parsedFields.map((f, fi) => (
                                <span key={fi} className='text-[9.5px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium border border-slate-200/60'>
                                  {f.name} <span className='text-[8px] text-slate-400 font-mono'>({f.type})</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template Delete Confirmation Modal */}
      {templateDeleteConfirmTarget && (
        <div className='fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4'>
          <div className='bg-white rounded-xl max-w-sm w-full p-4 space-y-3 shadow-xl border border-slate-200'>
            <h3 className='text-xs font-bold text-slate-900'>Delete AI Template</h3>
            <p className='text-[11px] text-slate-600'>
              Are you sure you want to remove this template? You must publish changes to apply permanently.
            </p>
            <div className='flex justify-end gap-2 pt-2'>
              <button 
                onClick={() => setTemplateDeleteConfirmTarget(null)}
                className='px-3 py-1.5 bg-slate-100 text-slate-700 text-xs rounded-lg font-medium cursor-pointer'
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteTemplate}
                className='px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-lg font-bold cursor-pointer'
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Confirmation Modal */}
      {publishConfirm && (
        <div className='fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4'>
          <div className='bg-white rounded-xl max-w-md w-full p-5 space-y-3.5 shadow-xl border border-slate-200'>
            <div className='flex items-center gap-2.5'>
              <div className='h-8 w-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0'>
                <ShieldCheck className='h-4 w-4' />
              </div>
              <div>
                <h3 className='text-xs font-bold text-slate-900'>Publish Workflow Configurations</h3>
                <p className='text-[10px] text-slate-500'>Apply all draft rules, flows, and templates directly to production</p>
              </div>
            </div>
            <p className='text-xs text-slate-600 leading-relaxed'>
              This will update live routing rules, document evaluation engines, and AI extraction templates for all active documents.
            </p>
            <div className='flex justify-end gap-2 pt-2 border-t border-slate-100'>
              <button 
                onClick={() => setPublishConfirm(false)}
                className='px-3 py-1.5 bg-slate-100 text-slate-700 text-xs rounded-lg font-medium cursor-pointer'
              >
                Cancel
              </button>
              <button 
                onClick={confirmPublish}
                className='px-4 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs rounded-lg font-bold cursor-pointer transition shadow-xs'
              >
                Confirm &amp; Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
