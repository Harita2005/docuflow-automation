import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, CornerDownRight, Search, AlertTriangle, Folder, GitMerge } from 'lucide-react';
import matrixOptions from '../matrix_options.json';

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
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [valuePickerModal, setValuePickerModal] = useState(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [customValInput, setCustomValInput] = useState('');
  const [showMasterOptions, setShowMasterOptions] = useState(false);

  const DEFAULT_CONDITION_FIELDS = [
    { id: 'Division', label: 'Division / Company' },
    { id: 'Category', label: 'Category / Expense Type' },
    { id: 'Cost Center', label: 'Cost Center / Dept' },
    { id: 'Branch', label: 'Branch / Plant Location' },
    { id: 'Invoice Amount (Total)', label: 'Invoice Amount (Total)' },
    { id: 'Document Type', label: 'Document Type' },
    { id: 'Vendor Name', label: 'Vendor Name' },
    { id: 'Tax Amount', label: 'Tax Amount' },
    { id: 'Payment Mode', label: 'Payment Mode' },
    { id: 'GSTIN', label: 'Vendor GSTIN' },
    { id: 'PO Number', label: 'PO / Order Number' }
  ];

  const [availableFields, setAvailableFields] = useState(() => {
    try {
      const saved = localStorage.getItem("docuflow_custom_condition_fields");
      if (saved) {
        const parsed = JSON.parse(saved);
        const existingIds = new Set(DEFAULT_CONDITION_FIELDS.map(f => f.id));
        const extra = parsed.filter(p => !existingIds.has(p.id));
        return [...DEFAULT_CONDITION_FIELDS, ...extra];
      }
    } catch(e) {}
    return DEFAULT_CONDITION_FIELDS;
  });
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [newFieldNameInput, setNewFieldNameInput] = useState('');
  const [addFieldTargetIdx, setAddFieldTargetIdx] = useState(null);

  const getFieldMasterOptions = (fieldName) => {
    if (fieldName === 'Cost Center') return ['ALL', ...(matrixOptions?.cost_centers || [])];
    if (fieldName === 'Category') return ['ALL', ...(matrixOptions?.categories || [])];
    if (fieldName === 'Branch' || fieldName === 'Plant') return ['ALL', ...(matrixOptions?.branches || [])];
    if (fieldName === 'Division') return ['ALL', ...(matrixOptions?.divisions || [])];
    return [];
  };

  const handleAddCategory = () => {
    setShowAddModal(true);
  };

  useEffect(() => {
    const handleOpenAddCategory = () => handleAddCategory();
    window.addEventListener('open-add-category', handleOpenAddCategory);
    return () => window.removeEventListener('open-add-category', handleOpenAddCategory);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('update-add-action', { detail: !selectedCategory }));
  }, [selectedCategory]);

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

  const [wfCategoryFilter, setWfCategoryFilter] = useState('ALL');

  const openEditor = (r = null, defaultDocType = null) => {
    let targetRule = null;
    if (r) {
      targetRule = JSON.parse(JSON.stringify(r));
    } else {
      targetRule = {
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
      };
    }
    const matchedWf = workflows.find(w => w.profile_name === targetRule.target_workflow_id || w.workflow_code === targetRule.target_workflow_id);
    setWfCategoryFilter(matchedWf?.workflow_category || 'ALL');
    setEditingRule(targetRule);
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
    "CAPEX / FIXED ASSET",
    "PURCHASE INVOICE",
    "SERVICE & MAINTENANCE",
    "FREIGHT & LOGISTICS",
    "UTILITY & RENT",
    "STAFF & HR EXPENSE",
    "GRN / GOODS RECEIPT",
    "ADVANCE VOUCHER",
    "CASH VOUCHER",
    "E-VOUCHER",
    "JOURNAL VOUCHER",
    "ACCOUNTS PAYABLE (AP)",
    "AP INVOICE",
    "AP DEBIT NOTE",
    "AR CREDITNOTE",
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
        <div className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...new Set([...Object.keys(groupedRules), ...addedCategories])].map(category => {
              const ruleCount = groupedRules[category] ? groupedRules[category].length : 0;
              return (
                <div key={category} onClick={() => setSelectedCategory(category)} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Network className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-xs tracking-wide group-hover:text-blue-700 transition-colors">{category}</h3>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">{ruleCount} Conditions</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); setDeleteCategoryTarget(category); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-60 group-hover:opacity-100" title="Delete Category">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>
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
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none mb-6"
                  />
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
                    <button type="submit" disabled={!newCategoryName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors disabled:opacity-50">Add Category</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          
          {/* DELETE CATEGORY MODAL */}
          {deleteCategoryTarget && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-xs overflow-hidden scale-in">
                <div className="p-5 flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <h3 className="font-black text-slate-900 text-base mb-1.5">Delete Category</h3>
                  <p className="text-xs text-slate-500 mb-5 leading-relaxed">Are you sure you want to delete <strong className="text-slate-800">{deleteCategoryTarget}</strong> and all its conditions? This action cannot be undone.</p>
                  <div className="flex w-full gap-2.5">
                    <button type="button" onClick={() => setDeleteCategoryTarget(null)} className="flex-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
                    <button type="button" onClick={() => {
                      const rulesToDelete = rules.filter(r => r.rule_category === deleteCategoryTarget);
                      rulesToDelete.forEach(r => handleDeleteRuleLocal(r.id));
                      
                      setAddedCategories(addedCategories.filter(c => c !== deleteCategoryTarget));
                      setHasChanges(true);
                      setDeleteCategoryTarget(null);
                    }} className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4 mt-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <button aria-label="Back" onClick={() => selectedSubCategory ? setSelectedSubCategory(null) : setSelectedCategory(null)} className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors border border-slate-200">
              <ArrowRight className="h-3 w-3 rotate-180" />
            </button>
            <div>
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                {selectedCategory} {selectedSubCategory ? <><span className="text-slate-300">/</span> <span className="text-blue-600">{selectedSubCategory}</span></> : <><span className="text-slate-300">/</span> <span className="text-blue-600">Doc Types</span></>}
              </h2>
              <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                {selectedSubCategory ? `Manage routing logic for ${selectedSubCategory}` : `Select a document type folder to view its conditions.`}
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
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>
            <button onClick={() => openEditor(null, selectedSubCategory || 'Invoice')} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0">
              <Plus className="h-3 w-3" /> Create Condition
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {!selectedSubCategory ? (
            // LEVEL 2: Render SubCategories (Document Types)
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                  <button key={subCategoryName} onClick={() => { setSelectedSubCategory(subCategoryName); setSearchQuery(''); }} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-blue-50/80 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Network className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-700 text-xs tracking-wide group-hover:text-blue-700 transition-colors">{subCategoryName}</h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold group-hover:bg-blue-100 group-hover:text-blue-700 transition-colors">{subCategoryRules.length}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </button>
                ))}

            </div>
          ) : (
            // LEVEL 3: Render Conditions
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                    <div key={r.id} className="bg-white rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col p-3 relative">
                      <div className="absolute top-3 right-3">
                        <span className="text-[8px] font-black bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                          Priority {index + 1}
                        </span>
                      </div>

                      <div className="pr-16 mb-1.5">
                        <h3 className="font-bold text-slate-900 text-xs truncate" title={r.rule_name || 'Unnamed Rule'}>{r.rule_name || 'Unnamed Rule'}</h3>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 flex items-center gap-1.5 truncate">
                          IF {parsed.conditions?.length || 0} CONDITION(S) <span className="text-slate-300">•</span> {r.document_type || 'Other'}
                        </p>
                      </div>
                      
                      <div className="mb-2 flex-1 flex flex-wrap gap-1">
                        {(parsed.conditions || []).map((cond, ci) => {
                          const opDisplay = (cond.operator || '').toLowerCase() === 'equals' ? '=' : 
                                            (cond.operator || '').toLowerCase() === 'contains any of' ? '⊇ any' : 
                                            (cond.operator || '').toLowerCase() === 'contains' ? '⊇' : 
                                            (cond.operator || '').toLowerCase() === 'not equals' ? '≠' : cond.operator;
                          return (
                            <div key={ci} className="inline-flex items-center text-[8.5px] font-bold rounded-md overflow-hidden border border-slate-200 shadow-3xs bg-slate-50">
                              <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 border-r border-slate-200 uppercase font-extrabold">{cond.field}</span>
                              <span className="bg-slate-100 text-slate-500 px-1 py-0.5 border-r border-slate-200 font-mono text-[8px]">{opDisplay}</span>
                              <span className="bg-white text-slate-700 px-1.5 py-0.5 truncate max-w-[130px]" title={cond.value}>{cond.value}</span>
                            </div>
                          );
                        })}
                        {r.description && (
                          <p className="text-[9.5px] text-slate-400 mt-1 line-clamp-1 w-full italic">{r.description}</p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-1.5 text-slate-700 truncate pr-2">
                          {r.rule_action === 'AUTO_APPROVE' ? (
                            <span className="text-[9px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                              ⚡ STP AUTO-APPROVE
                            </span>
                          ) : r.rule_action === 'AUTO_CANCEL' ? (
                            <span className="text-[9px] font-black bg-rose-600 text-white px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                              🚫 AUTO-CANCEL
                            </span>
                          ) : (
                            <>
                              <Network className="h-3 w-3 flex-shrink-0 text-blue-600" />
                              <span className="text-[9.5px] font-mono font-black bg-blue-50 text-blue-700 border border-blue-200/80 px-1.5 py-0.2 rounded shrink-0">
                                {targetWf?.workflow_code || 'WF-837'}
                              </span>
                              <span className="text-[10px] font-bold truncate" title={targetName}>
                                {targetName}
                              </span>
                            </>
                          )}
                        </div>
                        
                        <div className="flex gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                          <button type="button" aria-label="Edit Condition" onClick={() => openEditor(r)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                          <button type="button" aria-label="Delete Condition" onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}


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

  const getNormalizedOp = (op) => {
    const o = (op || '').toLowerCase().trim();
    if (o === 'equals' || o === '=') return 'equals';
    if (o === 'contains any of' || o === 'in' || o === 'any') return 'contains any of';
    if (o === 'contains') return 'contains';
    if (o === 'not equals' || o === '!=') return 'not equals';
    if (o === 'greater than' || o === 'gt' || o === '>') return 'gt';
    if (o === 'less than' || o === 'lt' || o === '<') return 'lt';
    return op || 'equals';
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-1.5 bg-slate-50 h-full rounded-xl border border-slate-200/60 shadow-sm p-4 sm:p-5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col shrink-0 z-10 bg-slate-50 pb-1 -mx-4 -mt-4 px-4 pt-1.5 sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-2 border-b border-slate-200/60 shadow-sm mb-0">
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => setEditingRule(null)}>
          Policy Matrix <span className="text-slate-300">&gt;</span> Configure Condition
        </div>
        <div className="flex justify-between items-center mt-0">
          <div>
            <h1 className="text-sm font-black text-slate-900 tracking-tight">Configure Condition</h1>
            <p className="text-[8px] font-semibold text-slate-500 mt-0">Define conditions to determine workflow path based on {selectedSubCategory?.toLowerCase() || 'document'} data.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditingRule(null)} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 font-bold text-[8px] uppercase tracking-wide rounded hover:bg-slate-50 transition-colors shadow-sm">Cancel</button>
            <button type="submit" className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[8px] uppercase tracking-wide rounded transition-colors flex items-center gap-1.5 shadow-sm shadow-blue-500/20">
              Save & Continue
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start flex-1 min-h-0 overflow-hidden -mx-4 px-4 sm:-mx-5 sm:px-5">
        {/* LEFT COLUMN: Main Form */}
        <div className="flex-1 w-full flex flex-col gap-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pr-2 pb-6">
          
          {/* SECTION 1 */}
          <div className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)]">
            <h3 className="text-xs font-black text-blue-600 mb-3 flex items-center gap-2">1. Condition Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="condName" className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Condition Name <span className="text-rose-500">*</span></label>
                <input id="condName" 
                  value={editingRule.rule_name}
                  onChange={e => setEditingRule({...editingRule, rule_name: e.target.value})}
                  required
                  className="w-full text-xs p-2 border border-slate-200/70 rounded-md hover:border-slate-300 transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="ruleCategory" className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Rule Policy Group (Matrix Folder)
                </label>
                <select id="ruleCategory" 
                  value={editingRule.rule_category || ''}
                  onChange={e => setEditingRule({...editingRule, rule_category: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-200/70 rounded-md hover:border-slate-300 transition-colors focus:border-blue-500 outline-none bg-white font-medium"
                >
                  {Array.from(new Set([...Object.keys(groupedRules), 'Vendor Payment Workflows'])).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="docType" className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Document Type</label>
                <input id="docType" 
                  value={editingRule.document_type || ''}
                  onChange={e => setEditingRule({...editingRule, document_type: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-200/70 rounded-md hover:border-slate-300 transition-colors focus:border-blue-500 outline-none bg-white"
                  placeholder="e.g. AP INVOICE"
                />
              </div>
              <div>
                <label htmlFor="evalOn" className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Evaluate On <span className="text-rose-500">*</span></label>
                <select id="evalOn" 
                  value={parsedJson.evaluate_on || 'Invoice Amount'}
                  onChange={e => updateJson({ evaluate_on: e.target.value })}
                  className="w-full text-xs p-2 border border-slate-200/70 rounded-md hover:border-slate-300 transition-colors focus:border-blue-500 outline-none bg-white"
                >
                  <option>Invoice Amount</option>
                  <option>Vendor Name</option>
                  <option>Cost Center</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="condDesc" className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                <input id="condDesc" 
                  value={editingRule.description || ''}
                  onChange={e => setEditingRule({...editingRule, description: e.target.value})}
                  className="w-full text-xs p-2 border border-slate-200/70 rounded-md hover:border-slate-300 transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-600"
                  placeholder="Rule for invoice approval based on condition..."
                />
              </div>

              {/* TARGET WORKFLOW 3-WAY MAPPING BLOCK */}
              {(() => {
                const targetWfObj = workflows.find(w => w.profile_name === editingRule.target_workflow_id || w.workflow_code === editingRule.target_workflow_id);
                const categories = Array.from(new Set(workflows.map(w => w.workflow_category).filter(Boolean)));
                return (
                  <div className="md:col-span-2 bg-blue-50/60 border border-blue-200/80 rounded-xl p-3.5 mt-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <GitMerge className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-[10px] font-black text-blue-950 uppercase tracking-wider">
                          Target Workflow 3-Way Mapping (Category ➔ Workflow ➔ Code)
                        </span>
                      </div>
                      {targetWfObj && (
                        <span className="text-[9.5px] font-mono font-black bg-blue-600 text-white px-2 py-0.5 rounded shadow-2xs">
                          Code: {targetWfObj.workflow_code || 'WF-837'}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 1. WORKFLOW CATEGORY */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          1. Target Workflow Category (Filter)
                        </label>
                        <select
                          value={wfCategoryFilter}
                          onChange={e => setWfCategoryFilter(e.target.value)}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-bold text-slate-800 focus:border-blue-500 outline-none shadow-2xs"
                        >
                          <option value="ALL">All Categories ({workflows.length})</option>
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      {/* 2. TARGET WORKFLOW PROFILE */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          2. Target Workflow Profile <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={editingRule.target_workflow_id || ''}
                          onChange={e => setEditingRule({ ...editingRule, target_workflow_id: e.target.value })}
                          className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-bold text-blue-900 focus:border-blue-500 outline-none shadow-2xs"
                        >
                          <option value="">-- Select Target Workflow --</option>
                          {workflows
                            .filter(w => wfCategoryFilter === 'ALL' || w.workflow_category === wfCategoryFilter)
                            .map(w => (
                              <option key={w.profile_name} value={w.profile_name}>
                                [{w.workflow_code || 'WF-837'}] {w.profile_name}
                              </option>
                            ))}
                        </select>
                      </div>

                      {/* 3. WORKFLOW CODE */}
                      <div>
                        <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          3. Workflow Code (Mapped)
                        </label>
                        <div className="w-full text-xs p-2 border border-blue-200/80 rounded-lg bg-white font-mono font-black text-blue-700 flex items-center justify-between shadow-2xs">
                          <span>{targetWfObj ? (targetWfObj.workflow_code || 'WF-837') : 'Unmapped'}</span>
                          <span className="text-[8px] font-sans text-emerald-600 font-bold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">Linked</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="mt-3">
              <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Condition Type <span className="text-rose-500">*</span></label>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 cursor-pointer">
                  <input type="radio" checked={parsedJson.condition_type !== 'Combination Condition'} onChange={() => updateJson({ condition_type: 'Single Condition' })} className="text-blue-600 h-3 w-3" />
                  Single Condition
                </label>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 cursor-pointer">
                  <input type="radio" checked={parsedJson.condition_type === 'Combination Condition'} onChange={() => updateJson({ condition_type: 'Combination Condition' })} className="text-blue-600 h-3 w-3" />
                  Combination Condition
                </label>
              </div>
            </div>
          </div>

          {/* SECTION 2 */}
          <div className="bg-white border border-slate-200/60 rounded-xl p-4 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)]">
            <h3 className="text-xs font-black text-blue-600 mb-3 flex items-center gap-2">2. Set Condition</h3>
            
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
                        className="outline-none bg-transparent text-blue-600 cursor-pointer"
                      >
                        <option value="AND">AND</option>
                        <option value="OR">OR</option>
                      </select>
                    </div>
                  )}
                  
                  <div className="flex flex-col md:flex-row md:items-start gap-3 w-full">
                    {/* Field Selector */}
                    <div className="w-full md:w-52 shrink-0">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider">Field <span className="text-rose-500">*</span></label>
                        <button 
                          type="button" 
                          onClick={() => {
                            setAddFieldTargetIdx(idx);
                            setNewFieldNameInput('');
                            setShowAddFieldModal(true);
                          }}
                          className="text-[9px] font-bold text-blue-600 hover:underline cursor-pointer"
                          title="Add a custom field"
                        >
                          + New Field
                        </button>
                      </div>
                      <select 
                        value={c.field === 'Plant' ? 'Branch' : c.field}
                        onChange={(e) => {
                          if (e.target.value === '__ADD_NEW_FIELD__') {
                            setAddFieldTargetIdx(idx);
                            setNewFieldNameInput('');
                            setShowAddFieldModal(true);
                            return;
                          }
                          const newC = [...parsedJson.conditions];
                          newC[idx].field = e.target.value;
                          if (e.target.value === 'Division') {
                            newC[idx].operator = 'equals';
                            newC[idx].value = 'VCC';
                          } else if (e.target.value === 'Category') {
                            newC[idx].operator = 'equals';
                            newC[idx].value = 'ASSET WITH COST CENTER';
                          } else if (e.target.value === 'Branch' || e.target.value === 'Plant') {
                            newC[idx].operator = 'contains any of';
                            newC[idx].value = 'TN-SIVAKASI';
                          } else if (e.target.value === 'Cost Center') {
                            newC[idx].operator = 'contains any of';
                            newC[idx].value = 'BATTERY VEHICLE, CANTEEN MAINTENANCE';
                          }
                          updateJson({ conditions: newC });
                        }}
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none bg-white font-semibold text-slate-800 focus:border-blue-500 shadow-2xs cursor-pointer"
                      >
                        <optgroup label="Available Fields">
                          {availableFields.map(f => (
                            <option key={f.id} value={f.id}>{f.label || f.id}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Custom Actions">
                          <option value="__ADD_NEW_FIELD__">➕ + Add Custom Field...</option>
                        </optgroup>
                      </select>
                    </div>

                    {/* Operator Selector */}
                    <div className="w-full md:w-44 shrink-0">
                      <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">Operator <span className="text-rose-500">*</span></label>
                      <select 
                        value={getNormalizedOp(c.operator)}
                        onChange={(e) => {
                          const newC = [...parsedJson.conditions];
                          newC[idx].operator = e.target.value;
                          updateJson({ conditions: newC });
                        }}
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none bg-white font-semibold text-slate-800 focus:border-blue-500 shadow-2xs"
                      >
                        <option value="equals">Equals (=)</option>
                        <option value="contains any of">Contains Any of (OR)</option>
                        <option value="contains">Contains (⊇)</option>
                        <option value="not equals">Not Equals (≠)</option>
                        <option value="gt">Greater Than (&gt;)</option>
                        <option value="lt">Less Than (&lt;)</option>
                      </select>
                    </div>

                    {/* Value Field with Popup Trigger */}
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider">
                          Value / Target Match <span className="text-rose-500">*</span>
                        </label>
                        {['Cost Center', 'Category', 'Branch', 'Plant', 'Division'].includes(c.field) && (
                          <button 
                            type="button" 
                            onClick={() => {
                              const items = c.value ? c.value.split(',').map(s => s.trim()).filter(Boolean) : [];
                              setValuePickerModal({
                                conditionIndex: idx,
                                field: c.field,
                                selectedItems: items
                              });
                              setPickerSearch('');
                              setCustomValInput('');
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 transition-colors cursor-pointer"
                            title={`Open Selection Popup for ${c.field}`}
                          >
                            <Edit2 className="h-2.5 w-2.5" /> Select / Edit Popup
                          </button>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {['Cost Center', 'Category', 'Branch', 'Plant', 'Division'].includes(c.field) ? (
                          <div 
                            onClick={() => {
                              const items = c.value ? c.value.split(',').map(s => s.trim()).filter(Boolean) : [];
                              setValuePickerModal({
                                conditionIndex: idx,
                                field: c.field,
                                selectedItems: items
                              });
                              setPickerSearch('');
                              setCustomValInput('');
                            }}
                            className="w-full text-xs p-2.5 border border-slate-200 hover:border-blue-400 bg-slate-50/70 hover:bg-white rounded-lg cursor-pointer transition-all flex items-center justify-between gap-2 shadow-2xs group/box"
                          >
                            <div className="flex-1 truncate">
                              {c.value ? (
                                <span className="font-bold text-slate-900">
                                  {c.value.includes(',') ? (
                                    <span className="flex items-center gap-1.5">
                                      <span className="bg-blue-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                                        {c.value.split(',').length} Selected
                                      </span>
                                      <span className="truncate">{c.value}</span>
                                    </span>
                                  ) : (
                                    c.value
                                  )}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium italic">Click to select {c.field}...</span>
                              )}
                            </div>
                            <span className="shrink-0 text-[10px] font-bold text-blue-600 group-hover/box:underline">
                              Edit ➔
                            </span>
                          </div>
                        ) : (
                          <input 
                            value={c.value}
                            onChange={(e) => {
                              const newC = [...parsedJson.conditions];
                              newC[idx].value = e.target.value;
                              updateJson({ conditions: newC });
                            }}
                            placeholder="Enter target value..."
                            className="w-full text-xs p-2.5 border border-slate-200 rounded-lg outline-none font-bold text-slate-900 bg-white focus:border-blue-500 shadow-2xs"
                          />
                        )}
                      </div>
                    </div>

                    {/* Delete Condition Button */}
                    <div className="shrink-0 self-end md:self-center pt-2">
                      <button 
                        type="button" 
                        onClick={() => {
                          const newC = parsedJson.conditions.filter((_, i) => i !== idx);
                          updateJson({ conditions: newC });
                        }}
                        className="p-2.5 border border-rose-200 text-rose-500 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shadow-2xs"
                        title="Delete this condition"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => {
                    const currentConditions = parsedJson.conditions || [];
                    if (currentConditions.length >= 10) {
                      alert("Maximum limit of 10 conditions reached per rule.");
                      return;
                    }
                    const newC = [...currentConditions, { field: 'Category', operator: 'Equals', value: '', logicalOperator: 'AND' }];
                    updateJson({ conditions: newC, condition_type: 'Combination Condition' });
                  }}
                  disabled={(parsedJson.conditions || []).length >= 10}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-blue-200 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors shadow-2xs hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title={(parsedJson.conditions || []).length >= 10 ? "Maximum 10 conditions reached" : "Add Condition"}
                >
                  <Plus className="h-3 w-3" /> Add Condition ({(parsedJson.conditions || []).length}/10)
                </button>
              </div>

              <button 
                type="button" 
                onClick={() => updateJson({ conditions: [] })}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-rose-200 text-rose-500 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors shadow-2xs hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" /> Clear All
              </button>
            </div>
          </div>


        </div>

        {/* RIGHT COLUMN: Summary & Preview */}
        <div className="w-full lg:w-72 flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Condition Summary</h3>
          <div className="space-y-3 mb-4">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Condition Name</p>
              <p className="text-xs font-bold text-slate-800">{editingRule.rule_name || '-'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Evaluate On</p>
              <p className="text-xs font-bold text-slate-800">{parsedJson.evaluate_on || '-'}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Condition Type</p>
              <p className="text-xs font-bold text-slate-800">{parsedJson.condition_type || '-'}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Condition Preview</h3>
            
            <div className="flex flex-col items-center">
              {/* Condition Box */}
              <div className="w-full bg-white border border-slate-200/60 rounded-lg p-2 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.02)] relative z-10">
                <div className="absolute -top-2 -left-2 h-4 w-4 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded text-[9px] font-black flex items-center justify-center">IF</div>
                <div className="text-center">
                  {(parsedJson.conditions || []).map((c, i) => (
                    <div key={i}>
                      {i > 0 && <div className="text-[9px] font-black text-blue-600 my-1">{c.logicalOperator}</div>}
                      <p className="text-xs font-medium text-slate-500">{c.field}</p>
                      <p className="text-xs font-bold text-slate-700">{c.operator} {c.value}</p>
                    </div>
                  ))}
                  {(!parsedJson.conditions || parsedJson.conditions.length === 0) && (
                    <p className="text-xs italic text-slate-400">No conditions defined</p>
                  )}
                </div>
              </div>
              
              <div className="h-3 w-px bg-slate-300"></div>
              <ArrowRight className="h-3 w-3 text-slate-300 rotate-90 -mt-1.5" />
              
              {/* True Path */}
              <div className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-2 shadow-sm relative mt-1.5">
                <span className="absolute -top-2.5 left-2 bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded">THEN (True)</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <CornerDownRight className="h-3 w-3 text-emerald-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{editingRule.target_workflow_id || 'Unassigned'}</p>
                    <p className="text-[9px] font-medium text-slate-500">Trigger Workflow Profile</p>
                  </div>
                </div>
              </div>

              <div className="h-3 w-px bg-slate-300"></div>
              <ArrowRight className="h-3 w-3 text-slate-300 rotate-90 -mt-1.5" />
              
              {/* False Path */}
              <div className="w-full bg-rose-50 border border-rose-200 rounded-lg p-2 shadow-sm relative mt-1.5">
                <span className="absolute -top-2.5 left-2 bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded">ELSE (False)</span>
                <div className="flex items-center gap-1.5 mt-1">
                  <CornerDownRight className="h-3 w-3 text-rose-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">Next Priority Rule</p>
                    <p className="text-[9px] font-medium text-slate-500">Continue evaluation</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Datalists for Excel Matrix Auto-completion */}
        <datalist id="divisions-list">
          <option value="ALL">ALL (Global Enterprise)</option>
          {matrixOptions?.divisions?.map((div, i) => (
            <option key={i} value={div} />
          ))}
        </datalist>

        <datalist id="categories-list">
          <option value="ALL">ALL Categories</option>
          {matrixOptions?.categories?.map((cat, i) => (
            <option key={i} value={cat} />
          ))}
        </datalist>

        <datalist id="cost-centers-list">
          <option value="ALL">ALL Cost Centers</option>
          {matrixOptions?.cost_centers?.map((cc, i) => (
            <option key={i} value={cc} />
          ))}
        </datalist>

        <datalist id="branches-list">
          <option value="ALL">ALL Branches</option>
          {matrixOptions?.branches?.map((br, i) => (
            <option key={i} value={br} />
          ))}
        </datalist>

        {/* MODAL POPUP FOR SELECTING / EDITING VALUES */}
        {valuePickerModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <span>Select & Edit {valuePickerModal.field}</span>
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {valuePickerModal.selectedItems.length} Selected
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Check existing master options or type below to add custom values.</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setValuePickerModal(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                  <input 
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder={`Search ${valuePickerModal.field} master options...`}
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none bg-slate-50 focus:bg-white focus:border-blue-500 font-medium shadow-2xs"
                  />
                </div>

                {/* Add Custom Value Input */}
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={customValInput}
                    onChange={(e) => setCustomValInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = customValInput.trim();
                        if (clean && !valuePickerModal.selectedItems.includes(clean)) {
                          setValuePickerModal({
                            ...valuePickerModal,
                            selectedItems: [...valuePickerModal.selectedItems, clean]
                          });
                          setCustomValInput('');
                        }
                      }
                    }}
                    placeholder={`Type custom ${valuePickerModal.field} name and click Add...`}
                    className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium"
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      const clean = customValInput.trim();
                      if (clean && !valuePickerModal.selectedItems.includes(clean)) {
                        setValuePickerModal({
                          ...valuePickerModal,
                          selectedItems: [...valuePickerModal.selectedItems, clean]
                        });
                        setCustomValInput('');
                      }
                    }}
                    className="px-3.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer"
                  >
                    + Add
                  </button>
                </div>

                {/* Currently Selected Badges */}
                {valuePickerModal.selectedItems.length > 0 && (
                  <div className="space-y-1.5 p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl">
                    <div className="flex items-center justify-between text-[10px] font-bold text-blue-900">
                      <span>Selected Items ({valuePickerModal.selectedItems.length})</span>
                      <button 
                        type="button" 
                        onClick={() => setValuePickerModal({ ...valuePickerModal, selectedItems: [] })}
                        className="text-rose-500 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {valuePickerModal.selectedItems.map((item, itIdx) => (
                        <span 
                          key={itIdx}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-blue-200 text-blue-900 text-[11px] font-bold rounded-md shadow-2xs"
                        >
                          <span>{item}</span>
                          <button 
                            type="button" 
                            onClick={() => {
                              setValuePickerModal({
                                ...valuePickerModal,
                                selectedItems: valuePickerModal.selectedItems.filter((_, i) => i !== itIdx)
                              });
                            }}
                            className="text-blue-400 hover:text-rose-600 font-black cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Master Options Checklist (Collapsible & Hidden by Default) */}
                {(() => {
                  const masterList = getFieldMasterOptions(valuePickerModal.field);
                  const filteredMaster = masterList.filter(opt => !pickerSearch || opt.toLowerCase().includes(pickerSearch.toLowerCase()));
                  const isVisible = showMasterOptions || Boolean(pickerSearch.trim());

                  return (
                    <div className="space-y-2">
                      <button 
                        type="button" 
                        onClick={() => setShowMasterOptions(!showMasterOptions)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer shadow-2xs"
                      >
                        <div className="flex items-center gap-2">
                          <Folder className="h-3.5 w-3.5 text-blue-600" />
                          <span>{isVisible ? `Hide Master ${valuePickerModal.field} Options` : `Browse Master ${valuePickerModal.field} Options (${filteredMaster.length})`}</span>
                        </div>
                        <span className="text-[10px] text-blue-600 font-extrabold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {isVisible ? "▲ Hide Options" : "▼ Click to View / Check"}
                        </span>
                      </button>

                      {isVisible && (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto bg-white custom-scrollbar shadow-inner animate-in fade-in duration-150">
                          {filteredMaster.length > 0 ? (
                            filteredMaster.map((opt, oIdx) => {
                              const isSelected = valuePickerModal.selectedItems.includes(opt);
                              return (
                                <label 
                                  key={oIdx}
                                  className={`flex items-center justify-between px-3 py-2 text-xs font-medium cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/80 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                  <span className="truncate mr-2">{opt}</span>
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      if (isSelected) {
                                        setValuePickerModal({
                                          ...valuePickerModal,
                                          selectedItems: valuePickerModal.selectedItems.filter(x => x !== opt)
                                        });
                                      } else {
                                        setValuePickerModal({
                                          ...valuePickerModal,
                                          selectedItems: [...valuePickerModal.selectedItems, opt]
                                        });
                                      }
                                    }}
                                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                                  />
                                </label>
                              );
                            })
                          ) : (
                            <div className="p-4 text-center text-xs text-slate-500">
                              No master option matches "<strong>{pickerSearch}</strong>".
                              <div className="mt-1 font-bold text-blue-600">
                                Type above and click "+ Add" to add it!
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setValuePickerModal(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    const newC = [...parsedJson.conditions];
                    const selectedStr = valuePickerModal.selectedItems.join(', ');
                    newC[valuePickerModal.conditionIndex].value = selectedStr;
                    if (valuePickerModal.selectedItems.length > 1 && newC[valuePickerModal.conditionIndex].operator === 'equals') {
                      newC[valuePickerModal.conditionIndex].operator = 'contains any of';
                    }
                    updateJson({ conditions: newC });
                    setValuePickerModal(null);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer"
                >
                  Apply ({valuePickerModal.selectedItems.length} Selected)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ADD CUSTOM FIELD MODAL POPUP */}
        {showAddFieldModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-sm font-black text-slate-800">Add Custom Condition Field</h3>
                <button 
                  type="button" 
                  onClick={() => setShowAddFieldModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Field Name / Property <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    type="text"
                    autoFocus
                    value={newFieldNameInput}
                    onChange={e => setNewFieldNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const clean = newFieldNameInput.trim();
                        if (!clean) return;
                        const newFieldObj = { id: clean, label: clean };
                        if (!availableFields.some(f => f.id.toLowerCase() === clean.toLowerCase())) {
                          const updated = [...availableFields, newFieldObj];
                          setAvailableFields(updated);
                          try {
                            localStorage.setItem("docuflow_custom_condition_fields", JSON.stringify(updated));
                          } catch(err) {}
                        }
                        if (addFieldTargetIdx !== null && parsedJson.conditions[addFieldTargetIdx]) {
                          const newC = [...parsedJson.conditions];
                          newC[addFieldTargetIdx].field = clean;
                          newC[addFieldTargetIdx].value = '';
                          updateJson({ conditions: newC });
                        }
                        setShowAddFieldModal(false);
                        setNewFieldNameInput('');
                      }
                    }}
                    placeholder="e.g. Project Code, Sub-Category, GSTIN, Approval Level..."
                    className="w-full text-xs px-3 py-2.5 border border-slate-300 rounded-lg outline-none focus:border-blue-500 font-semibold text-slate-800"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">This field will be available across all condition rules.</p>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button 
                    type="button" 
                    onClick={() => setShowAddFieldModal(false)}
                    className="px-3.5 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    disabled={!newFieldNameInput.trim()}
                    onClick={() => {
                      const clean = newFieldNameInput.trim();
                      if (!clean) return;
                      const newFieldObj = { id: clean, label: clean };
                      if (!availableFields.some(f => f.id.toLowerCase() === clean.toLowerCase())) {
                        const updated = [...availableFields, newFieldObj];
                        setAvailableFields(updated);
                        try {
                          localStorage.setItem("docuflow_custom_condition_fields", JSON.stringify(updated));
                        } catch(err) {}
                      }
                      if (addFieldTargetIdx !== null && parsedJson.conditions[addFieldTargetIdx]) {
                        const newC = [...parsedJson.conditions];
                        newC[addFieldTargetIdx].field = clean;
                        newC[addFieldTargetIdx].value = '';
                        updateJson({ conditions: newC });
                      }
                      setShowAddFieldModal(false);
                      setNewFieldNameInput('');
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
                  >
                    Add Field
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </form>
  );
}
