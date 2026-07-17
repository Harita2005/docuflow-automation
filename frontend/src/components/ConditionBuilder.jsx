import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, CornerDownRight, Search, AlertTriangle } from 'lucide-react';

export default function ConditionBuilder({ rules, setRules, setHasChanges, handleDeleteRuleLocal }) {
  const [editingRule, setEditingRule] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);
  const [addedCategories, setAddedCategories] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);

  const handleAddCategory = () => {
    setShowAddModal(true);
  };

  const confirmAddCategory = (e) => {
    e.preventDefault();
    if (newCategoryName && newCategoryName.trim()) {
      const catName = newCategoryName.trim();
      if (!addedCategories.includes(catName)) {
        setAddedCategories([...addedCategories, catName]);
      }
      setSelectedCategory(catName);
      setSelectedSubCategory(null);
      setShowAddModal(false);
      setNewCategoryName("");
    }
  };

  useEffect(() => {
    // Fetch Workflow Profiles for the target dropdown
    const fetchWf = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const res = await fetch('/api/admin/workflows', { headers });
        if (res.ok) {
          setWorkflows(await res.json());
        }
      } catch(e) {}
    };
    fetchWf();
  }, []);

  const openEditor = (r = null, defaultDocType = null) => {
    if (r) {
      setEditingRule(JSON.parse(JSON.stringify(r)));
    } else {
      setEditingRule({
        id: 'tmp-' + Date.now(),
        rule_name: '',
        description: '',
        priority: (rules.length + 1) * 10,
        conditions_json: JSON.stringify({
          condition_type: 'Single Condition',
          evaluate_on: 'Invoice Amount',
          conditions: [{ field: 'Invoice Amount (Total)', operator: 'Greater Than', value: '', logicalOperator: 'AND' }],
          settings: {
            case_sensitive: false,
            null_handling: 'Consider as False',
            date_format: 'dd/mm/yyyy'
          }
        }),
        target_workflow_id: workflows.length > 0 ? workflows[0].profile_name : '',
        rule_category: selectedCategory || 'Vendor Payment Workflows',
        document_type: defaultDocType || 'Invoice'
      });
    }
  };

  const handleDelete = (id) => {
    setDeleteConfirmTarget(id);
  };

  const confirmDelete = () => {
    if (!deleteConfirmTarget) return;
    if (handleDeleteRuleLocal) {
      handleDeleteRuleLocal(deleteConfirmTarget);
    } else {
      setRules(rules.filter(r => r.id !== deleteConfirmTarget));
      setHasChanges(true);
    }
    setDeleteConfirmTarget(null);
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (String(editingRule.id).startsWith('tmp-')) {
      setRules([...rules, editingRule]);
    } else {
      setRules(rules.map(r => r.id === editingRule.id ? editingRule : r));
    }
    setHasChanges(true);
    setEditingRule(null);
  };

  // Group rules by workflow_type (Category)
  const DOC_TYPE_ORDER = [
    "AP INVOICE",
    "AP DEBIT NOTE",
    "AR CREDITNOTE",
    "VCC PURCHASE INVOICE",
    "JOURNAL ENTRY",
    "OCR AND INHOUSE OCR",
    "PROJECT BUDGET",
    "NON - RETURNABLE"
  ];

  const groupedRules = rules.reduce((acc, r) => {
    const category = r.rule_category || 'Vendor Payment Workflows';
    
    if (!acc[category]) acc[category] = [];
    acc[category].push(r);
    return acc;
  }, {});

  if (!editingRule) {
    // LEVEL 1: Render Categories
    if (!selectedCategory) {
      return (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Routing Categories</h2>
              <p className="text-sm font-bold text-slate-500 mt-1">Select a category to manage its routing rules.</p>
            </div>
            <button onClick={handleAddCategory} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs uppercase tracking-wide rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <Plus className="h-4 w-4" /> Add Category
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.keys(groupedRules).map(category => {
              const ruleCount = groupedRules[category] ? groupedRules[category].length : 0;
              return (
                <button key={category} onClick={() => setSelectedCategory(category)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Settings2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm tracking-wide">{category}</h3>
                      <p className="text-sm font-bold text-slate-500 mt-0.5">{ruleCount} Conditions</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </button>
              );
            })}
          </div>

          {/* ADD CATEGORY MODAL */}
          {showAddModal && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-black text-slate-800 text-sm tracking-wide">Add New Category</h3>
                  <button aria-label="Close" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <form onSubmit={confirmAddCategory} className="p-6">
                  <label htmlFor="categoryName" className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Category Name</label>
                  <input 
                    id="categoryName"
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Payroll"
                    autoFocus
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none mb-6"
                  />
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
                    <button type="submit" disabled={!newCategoryName.trim()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors disabled:opacity-50">Add Category</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <button aria-label="Back" onClick={() => selectedSubCategory ? setSelectedSubCategory(null) : setSelectedCategory(null)} className="text-slate-400 hover:text-slate-600 p-1.5 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors border border-slate-200">
              <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                {selectedCategory} {selectedSubCategory ? `> ${selectedSubCategory}` : '> Doc Types'}
              </h2>
              <p className="text-sm font-bold text-slate-500 mt-1">
                {selectedSubCategory ? `Manage routing logic for ${selectedSubCategory}` : `Select a document type to view its conditions.`}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search conditions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
              />
            </div>
            <button onClick={() => openEditor(null, selectedSubCategory || 'Invoice')} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0">
              <Plus className="h-4 w-4" /> Create Condition
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {!selectedSubCategory ? (
            // LEVEL 2: Render SubCategories (Document Types)
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries((groupedRules[selectedCategory] || [])
                .reduce((acc, r) => {
                  const subCat = r.document_type || 'Other Conditions';
                  if (!acc[subCat]) acc[subCat] = [];
                  acc[subCat].push(r);
                  return acc;
                }, {}))
                .sort(([subCatA], [subCatB]) => {
                  let idxA = DOC_TYPE_ORDER.indexOf(subCatA.toUpperCase());
                  let idxB = DOC_TYPE_ORDER.indexOf(subCatB.toUpperCase());
                  if (idxA === -1) idxA = 999;
                  if (idxB === -1) idxB = 999;
                  if (idxA === idxB) return subCatA.localeCompare(subCatB);
                  return idxA - idxB;
                })
                .filter(([subCategoryName]) => subCategoryName.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(([subCategoryName, subCategoryRules]) => (
                  <div key={subCategoryName} onClick={() => { setSelectedSubCategory(subCategoryName); setSearchQuery(''); }} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Settings2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm tracking-wide">{subCategoryName}</h3>
                        <p className="text-sm font-bold text-slate-500 mt-0.5">{subCategoryRules.length} Conditions</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                ))}
                {Object.keys(groupedRules[selectedCategory] || []).length === 0 && (
                  <div className="col-span-full py-16 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 border-dashed">
                    <Settings2 className="h-10 w-10 text-slate-300 mb-4" />
                    <h3 className="text-sm font-bold text-slate-700">No conditions found</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">Get started by creating a new routing condition for {selectedCategory}.</p>
                    <button onClick={() => openEditor(null, 'Invoice')} className="mt-5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-md shadow-sm transition-colors">Create Condition</button>
                  </div>
                )}
            </div>
          ) : (
            // LEVEL 3: Render Conditions
            <div className="grid grid-cols-1 gap-3">
              {(groupedRules[selectedCategory] || [])
                .filter(r => {
                  const subCat = r.document_type || 'Other Conditions';
                  return subCat === selectedSubCategory;
                })
                .filter(r => (r.rule_name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                .sort((a,b)=> {
                   if (a.priority !== b.priority) return a.priority - b.priority;
                   const wfA = workflows.find(w => w.id === a.target_workflow_id || w.profile_name === a.target_workflow_id);
                   const wfB = workflows.find(w => w.id === b.target_workflow_id || w.profile_name === b.target_workflow_id);
                   const targetA = wfA?.profile_name || a.target_workflow_id || '';
                   const targetB = wfB?.profile_name || b.target_workflow_id || '';
                   return targetA.localeCompare(targetB, undefined, { numeric: true });
                }).map((r, index) => {
                  let parsed = { conditions: [] };
                  try { parsed = JSON.parse(r.conditions_json); } catch(e) {}
                  if (Array.isArray(parsed)) parsed = { conditions: parsed };

                  const targetWf = workflows.find(w => w.id === r.target_workflow_id || w.profile_name === r.target_workflow_id);
                  const targetName = targetWf ? targetWf.profile_name : (r.target_workflow_id || 'None');

                  return (
                    <div key={r.id} className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow transition-all group flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Priority and Name */}
                      <div className="flex items-center gap-3 w-full sm:w-1/3">
                        <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-50 text-indigo-700 font-black text-xs border border-indigo-100">
                          {index + 1}
                        </div>
                        <h3 className="font-bold text-slate-800 text-sm truncate" title={r.rule_name || 'Unnamed Rule'}>{r.rule_name || 'Unnamed Rule'}</h3>
                      </div>
                      
                      {/* Conditions Met */}
                      <div className="flex items-center gap-2 w-full sm:w-1/4">
                         <span className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
                           IF {parsed.conditions?.length || 0} Conditions
                         </span>
                      </div>
                      
                      {/* Target Workflow */}
                      <div className="flex items-center gap-2 w-full sm:w-1/3">
                        <ArrowRight className="hidden sm:block h-4 w-4 text-slate-300 flex-shrink-0" />
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-md flex items-center gap-1.5 truncate" title={targetName}>
                          <Network className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{targetName}</span>
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 sm:ml-auto opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity justify-end w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
                        <button type="button" aria-label="Edit Condition" onClick={() => openEditor(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" aria-label="Delete Condition" onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
                {((groupedRules[selectedCategory] || []).filter(r => {
                  const subCat = r.target_workflow_id?.includes(' - ') ? r.target_workflow_id.split(' - ')[0] : (r.document_type || 'Other Conditions');
                  return subCat === selectedSubCategory;
                }).filter(r => (r.rule_name || '').toLowerCase().includes(searchQuery.toLowerCase()))).length === 0 && (
                  <div className="py-16 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 border-dashed">
                    <Settings2 className="h-10 w-10 text-slate-300 mb-4" />
                    <h3 className="text-sm font-bold text-slate-700">No conditions found</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">Get started by creating a new routing condition for {selectedSubCategory}.</p>
                    <button onClick={() => openEditor(null, selectedSubCategory)} className="mt-5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Create Condition</button>
                  </div>
                )}
            </div>
          )}
        </div>

        {deleteConfirmTarget && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden scale-in">
              <div className="p-6 flex flex-col items-center text-center">
                <div className="h-12 w-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h3 className="font-black text-slate-900 text-lg mb-2">Delete Condition</h3>
                <p className="text-sm text-slate-500 mb-6">Are you sure you want to delete this condition? This action cannot be undone.</p>
                <div className="flex w-full gap-3">
                  <button type="button" onClick={() => setDeleteConfirmTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
                  <button type="button" onClick={confirmDelete} className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Delete</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // EDIT VIEW (The Mockup)
  let parsedJson = { conditions: [], settings: {} };
  try {
    parsedJson = JSON.parse(editingRule.conditions_json);
    if (Array.isArray(parsedJson)) {
      parsedJson = { conditions: parsedJson, settings: {} };
    }
  } catch(e) {}
  
  const updateJson = (updates) => {
    const newJson = { ...parsedJson, ...updates };
    setEditingRule({ ...editingRule, conditions_json: JSON.stringify(newJson) });
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 bg-slate-50 min-h-screen rounded-xl border border-slate-200/60 shadow-sm p-4 sm:p-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">Configure Condition</h2>
          <p className="text-xs font-medium text-slate-500 mt-1">Define conditions to determine workflow path based on {selectedSubCategory?.toLowerCase() || 'document'} data.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => setEditingRule(null)} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-bold rounded-md hover:bg-slate-50 transition-colors shadow-sm">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-md hover:bg-blue-700 transition-colors shadow-sm">
            Save & Continue
          </button>
        </div>
      </div>

      <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-lg flex items-center gap-2">
        <div className="h-4 w-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-serif text-sm italic">i</div>
        <p className="text-sm text-blue-800 font-medium">This condition will be evaluated at runtime. Based on the condition result, the selected workflow profile will be triggered.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT COLUMN: Main Form */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* SECTION 1 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-blue-600 mb-4 flex items-center gap-2">1. Condition Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="condName" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Condition Name <span className="text-rose-500">*</span></label>
                <input id="condName" 
                  value={editingRule.rule_name}
                  onChange={e => setEditingRule({...editingRule, rule_name: e.target.value})}
                  required
                  className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="row-span-2">
                <label htmlFor="condDesc" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Description</label>
                <textarea id="condDesc" 
                  value={editingRule.description || ''}
                  onChange={e => setEditingRule({...editingRule, description: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none h-full resize-none"
                />
              </div>
              <div>
                <label htmlFor="ruleCategory" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Category</label>
                <select id="ruleCategory" 
                  value={editingRule.rule_category || ''}
                  onChange={e => setEditingRule({...editingRule, rule_category: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                >
                  {Array.from(new Set([...Object.keys(groupedRules), 'Vendor Payment Workflows'])).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="docType" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Document Type</label>
                <input id="docType" 
                  value={editingRule.document_type || ''}
                  onChange={e => setEditingRule({...editingRule, document_type: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                  placeholder="e.g. AP INVOICE"
                />
              </div>
              <div>
                <label htmlFor="evalOn" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5">Evaluate On <span className="text-rose-500">*</span></label>
                <select id="evalOn" 
                  value={parsedJson.evaluate_on || 'Invoice Amount'}
                  onChange={e => updateJson({ evaluate_on: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200 rounded-md focus:border-blue-500 outline-none bg-white"
                >
                  <option>Invoice Amount</option>
                  <option>Vendor Name</option>
                  <option>Cost Center</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-6">
              <div className="flex flex-col gap-2">
                <label className="block text-sm font-bold text-slate-600 uppercase tracking-wider">Condition Type <span className="text-rose-500">*</span></label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="radio" checked={parsedJson.condition_type !== 'Combination Condition'} onChange={() => updateJson({ condition_type: 'Single Condition' })} className="text-blue-600" />
                  Single Condition
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input type="radio" checked={parsedJson.condition_type === 'Combination Condition'} onChange={() => updateJson({ condition_type: 'Combination Condition' })} className="text-blue-600" />
                  Combination Condition
                </label>
              </div>
            </div>
          </div>

          {/* SECTION 2 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-blue-600 mb-4 flex items-center gap-2">2. Set Condition</h3>
            
            <div className="flex flex-col gap-3">
              {(parsedJson.conditions || []).map((c, idx) => (
                <div key={idx} className="flex flex-col gap-2 relative border border-slate-100 p-3 rounded-lg bg-slate-50/50 group">
                  {idx > 0 && (
                    <div className="absolute -top-3 left-4 bg-white border border-slate-200 px-2 py-0.5 rounded text-xs font-black uppercase flex items-center gap-1 shadow-sm">
                      <select 
                        value={c.logicalOperator || 'AND'}
                        onChange={(e) => {
                          const newC = [...parsedJson.conditions];
                          newC[idx].logicalOperator = e.target.value;
                          updateJson({ conditions: newC });
                        }}
                        className="outline-none bg-transparent text-indigo-600 cursor-pointer"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-4 gap-3 items-end">
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Field <span className="text-rose-500">*</span></label>
                      <select 
                        value={c.field}
                        onChange={(e) => {
                          const newC = [...parsedJson.conditions];
                          newC[idx].field = e.target.value;
                          updateJson({ conditions: newC });
                        }}
                        className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium"
                      >
                                                <option>Invoice Amount (Total)</option>
                        <option>Amount</option>
                        <option>Tax Amount</option>
                        <option>Vendor Type</option>
                        <option>Vendor Name</option>
                        <option>Category</option>
                        <option>Cost Center</option>
                        <option>Department</option>
                        <option>Division</option>
                        <option>Plant</option>
                        <option>Product Line Items</option>
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Operator <span className="text-rose-500">*</span></label>
                      <select 
                        value={c.operator}
                        onChange={(e) => {
                          const newC = [...parsedJson.conditions];
                          newC[idx].operator = e.target.value;
                          updateJson({ conditions: newC });
                        }}
                        className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium"
                      >
                        {c.field && c.field.includes('Amount') ? (
                          <>
                            <option value="Greater Than">Greater Than</option>
                            <option value="Less Than">Less Than</option>
                            <option value="Equals">Equals</option>
                          </>
                        ) : (
                          <>
                            <option value="Equals">Equals</option>
                            <option value="Contains">Contains</option>
                            <option value="Not Equals">Not Equals</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Value <span className="text-rose-500">*</span></label>
                      <input 
                        value={c.value}
                        onChange={(e) => {
                          const newC = [...parsedJson.conditions];
                          newC[idx].value = e.target.value;
                          updateJson({ conditions: newC });
                        }}
                        className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none font-medium"
                      />
                    </div>
                    <div className="col-span-1 flex gap-2">
                      {c.field && c.field.includes('Amount') && (
                        <div className="flex-1">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Currency</label>
                          <select className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium">
                            <option>INR - Indian Rupee</option>
                            <option>USD - US Dollar</option>
                          </select>
                        </div>
                      )}
                      <button 
                        type="button" 
                        onClick={() => {
                          const newC = parsedJson.conditions.filter((_, i) => i !== idx);
                          updateJson({ conditions: newC });
                        }}
                        className="p-2 border border-rose-200 text-rose-500 rounded-md hover:bg-rose-50 mt-4 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 flex items-center justify-between">
              <button 
                type="button" 
                onClick={() => {
                  const newC = [...(parsedJson.conditions || []), { field: 'Invoice Amount (Total)', operator: 'Greater Than', value: '', logicalOperator: 'AND' }];
                  updateJson({ conditions: newC, condition_type: 'Combination Condition' });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-600 font-bold text-sm uppercase tracking-wider rounded-md hover:bg-blue-50 transition-colors"
              >
                <Plus className="h-3 w-3" /> Add Condition
              </button>
              <button 
                type="button" 
                onClick={() => updateJson({ conditions: [] })}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 text-rose-500 font-bold text-sm uppercase tracking-wider rounded-md hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            </div>
          </div>

          {/* SECTION 3 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-blue-600 mb-4 flex items-center gap-2">3. Condition Outcome (Workflow Path)</h3>
            <p className="text-sm text-slate-500 font-medium mb-4">Define the workflow profile to trigger based on the condition result.</p>
            
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                <div className="w-32">
                  <span className="text-sm font-black text-emerald-700 bg-emerald-100 px-2 py-1 rounded">If Condition is True</span>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Trigger Workflow</label>
                  <select 
                    value={editingRule.target_workflow_id}
                    onChange={e => setEditingRule({...editingRule, target_workflow_id: e.target.value})}
                    className="w-full text-xs p-2 border border-slate-200 rounded-md outline-none bg-white font-medium focus:border-emerald-400"
                  >
                    <option value="">-- Select Workflow Profile --</option>
                    {workflows.map(wf => (
                      <option key={wf.profile_name} value={wf.profile_name}>{wf.profile_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex items-center gap-4 bg-rose-50/50 p-3 rounded-lg border border-rose-100 opacity-60">
                <div className="w-32">
                  <span className="text-sm font-black text-rose-700 bg-rose-100 px-2 py-1 rounded">If Condition is False</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-500 italic">Evaluates the next rule in the priority list automatically.</p>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4 */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-blue-600 mb-4 flex items-center gap-2">4. Additional Settings</h3>
            <div className="grid grid-cols-4 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Case Sensitive</label>
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-4 rounded-full p-0.5 cursor-pointer ${parsedJson.settings?.case_sensitive ? 'bg-blue-600' : 'bg-slate-300'}`} onClick={() => updateJson({ settings: { ...parsedJson.settings, case_sensitive: !parsedJson.settings?.case_sensitive } })}>
                    <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-transform ${parsedJson.settings?.case_sensitive ? 'translate-x-4' : ''}`}></div>
                  </div>
                  <span className="text-xs font-bold text-slate-600">{parsedJson.settings?.case_sensitive ? 'Yes' : 'No'}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Null Values Handling</label>
                <select 
                  value={parsedJson.settings?.null_handling || 'Consider as False'}
                  onChange={e => updateJson({ settings: { ...parsedJson.settings, null_handling: e.target.value } })}
                  className="w-full text-xs p-1.5 border border-slate-200 rounded-md outline-none bg-white font-medium"
                >
                  <option>Consider as False</option>
                  <option>Consider as True</option>
                  <option>Skip Evaluation</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Condition Priority</label>
                <input 
                  type="number"
                  value={editingRule.priority}
                  onChange={e => setEditingRule({...editingRule, priority: Number(e.target.value)})}
                  className="w-full text-xs p-1.5 border border-slate-200 rounded-md outline-none font-medium"
                />
                <p className="text-xs text-slate-500 mt-1">Lower number = Higher priority</p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Summary & Preview */}
        <div className="w-full lg:w-80 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm sticky top-6">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Condition Summary</h3>
            <div className="space-y-4 mb-6">
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Condition Name</p>
                <p className="text-xs font-medium text-slate-700">{editingRule.rule_name || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Evaluate On</p>
                <p className="text-xs font-medium text-slate-700">{parsedJson.evaluate_on || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Condition Type</p>
                <p className="text-xs font-medium text-slate-700">{parsedJson.condition_type || '-'}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">Condition Preview</h3>
              
              <div className="flex flex-col items-center">
                {/* Condition Box */}
                <div className="w-full bg-white border border-slate-200 rounded-lg p-3 shadow-sm relative z-10">
                  <div className="absolute -top-2 -left-2 h-5 w-5 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded text-xs font-black flex items-center justify-center">IF</div>
                  <div className="text-center">
                    {(parsedJson.conditions || []).map((c, i) => (
                      <div key={i}>
                        {i > 0 && <div className="text-xs font-black text-blue-600 my-1">{c.logicalOperator}</div>}
                        <p className="text-sm font-medium text-slate-500">{c.field}</p>
                        <p className="text-sm font-bold text-slate-700">{c.operator} {c.value}</p>
                      </div>
                    ))}
                    {(!parsedJson.conditions || parsedJson.conditions.length === 0) && (
                      <p className="text-sm italic text-slate-400">No conditions defined</p>
                    )}
                  </div>
                </div>
                
                <div className="h-6 w-px bg-slate-300"></div>
                <ArrowRight className="h-3 w-3 text-slate-300 rotate-90 -mt-1.5" />
                
                {/* True Path */}
                <div className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-3 shadow-sm relative mt-2">
                  <span className="absolute -top-3 left-3 bg-emerald-100 text-emerald-700 text-xs font-black px-1.5 py-0.5 rounded">THEN (True)</span>
                  <div className="flex items-center gap-2 mt-1">
                    <CornerDownRight className="h-4 w-4 text-emerald-500" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{editingRule.target_workflow_id || 'Unassigned'}</p>
                      <p className="text-xs font-medium text-slate-500">Trigger Workflow Profile</p>
                    </div>
                  </div>
                </div>

                <div className="h-6 w-px bg-slate-300"></div>
                <ArrowRight className="h-3 w-3 text-slate-300 rotate-90 -mt-1.5" />
                
                {/* False Path */}
                <div className="w-full bg-rose-50 border border-rose-200 rounded-lg p-3 shadow-sm relative mt-2">
                  <span className="absolute -top-3 left-3 bg-rose-100 text-rose-700 text-xs font-black px-1.5 py-0.5 rounded">ELSE (False)</span>
                  <div className="flex items-center gap-2 mt-1">
                    <CornerDownRight className="h-4 w-4 text-rose-500" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">Next Priority Rule</p>
                      <p className="text-xs font-medium text-slate-500">Continue evaluation</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
