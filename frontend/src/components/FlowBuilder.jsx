import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, ArrowUp, ArrowDown, Search, AlertTriangle } from 'lucide-react';

const getPrefixCode = (category, subCat) => {
  if (!category || !subCat) return "";
  const cat = category.toUpperCase();
  const sub = subCat.toUpperCase();
  
  if (cat.includes("VENDOR PAYMENT")) {
    if (sub.includes("AP INVOICE")) return "VP11";
    if (sub.includes("CREDITNOTE")) return "VP12";
    if (sub.includes("DEBITNOTE")) return "VP13";
    if (sub.includes("PURCHASE ORDER") || sub.includes("PURCHASE")) return "VP14";
    if (sub.includes("JOURNAL ENTRY") || sub.includes("JOURNAL")) return "VP15";
    return "VP99";
  }
  return "";
};

const getWorkflowPrefixCode = (category, subCat, index) => {
  if (!category || !subCat) return "";
  const cat = category.toUpperCase();
  const sub = subCat.toUpperCase();
  const num = index + 1;
  
  if (cat.includes("VENDOR PAYMENT")) {
    if (sub.includes("AP INVOICE")) return `INV-11${num}`;
    if (sub.includes("CREDITNOTE")) return `CN-12${num}`;
    if (sub.includes("DEBITNOTE")) return `DN-13${num}`;
    if (sub.includes("PURCHASE ORDER") || sub.includes("PURCHASE")) return `PO-14${num}`;
    if (sub.includes("JOURNAL ENTRY") || sub.includes("JOURNAL")) return `JE-15${num}`;
    return `WF-99${num}`;
  }
  return "";
};

export default function FlowBuilder({ users = [] }) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);
  const [addedCategories, setAddedCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [draggedStepIdx, setDraggedStepIdx] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

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

  const confirmDeleteDocType = async (docType, wfs, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete Document Type "${docType}" and all its ${wfs.length} workflows? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem("authToken");
      await Promise.all(wfs.map(wf => 
        fetch(`/api/admin/workflows/${encodeURIComponent(wf.profile_name)}`, {
          method: 'DELETE',
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        })
      ));
      fetchWorkflows();
    } catch (err) {
      console.error(err);
      alert("Error deleting document type workflows");
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/workflows', {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data);
      }
    } catch (e) {
      console.error("Failed to fetch workflows:", e);
    }
    setLoading(false);
  };

  const openEditor = (wf, category = null, index = 0) => {
    let generatedCode = "";
    if (selectedCategory && selectedSubCategory) {
       generatedCode = getWorkflowPrefixCode(selectedCategory, selectedSubCategory, index);
    } else if (category && selectedSubCategory) {
       generatedCode = getWorkflowPrefixCode(category, selectedSubCategory, index);
    }

    if (wf) {
      const cloned = JSON.parse(JSON.stringify(wf));
      if (!cloned.workflow_code || cloned.workflow_code === 'INV-APP-001') {
        cloned.workflow_code = generatedCode || cloned.workflow_code;
      }
      setEditingWorkflow(cloned);
    } else {
      setEditingWorkflow({
        profile_name: '',
        workflow_code: generatedCode || '',
        workflow_type: category || selectedCategory || 'Vendor Payment',
        description: '',
        status: 'Active',
        approval_threshold: 100,
        rejection_handling: 'Return to Previous Step',
        reminder_interval_hours: 24,
        escalation_after_hours: 72,
        auto_escalation: true,
        steps: [{
          stage_number: 1,
          step_name: 'Initial Review',
          role: 'Employee',
          approver_type: 'Specific Employee',
          approver_target: '',
          permissions: 'Approve Only',
          action_required: 'Approve'
        }]
      });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem("authToken");
      
      // Enforce stage_number sequence
      editingWorkflow.steps.forEach((step, idx) => {
        step.stage_number = idx + 1;
      });

      const res = await fetch('/api/admin/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(editingWorkflow)
      });
      if (res.ok) {
        await fetchWorkflows();
        setEditingWorkflow(null);
      } else {
        alert("Failed to save workflow");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving workflow");
    }
    setSaving(false);
  };

  const handleDelete = (profile_name) => {
    setDeleteConfirmTarget(profile_name);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/admin/workflows/${encodeURIComponent(deleteConfirmTarget)}`, {
        method: 'DELETE',
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      fetchWorkflows();
    } catch (err) {
      console.error(err);
    }
    setDeleteConfirmTarget(null);
  };

  const addStep = () => {
    const newSteps = [...editingWorkflow.steps, {
      stage_number: editingWorkflow.steps.length + 1,
      step_name: `Stage ${editingWorkflow.steps.length + 1}: Review`,
      role: 'Manager',
      approver_type: 'Role Based',
      approver_target: '',
      permissions: 'Approve Only',
      action_required: 'Approve'
    }];
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };

  const updateStep = (idx, field, value) => {
    const newSteps = [...editingWorkflow.steps];
    newSteps[idx][field] = value;
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };

  const deleteStep = (idx) => {
    const newSteps = editingWorkflow.steps.filter((_, i) => i !== idx);
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };

  const moveStepUp = (idx) => {
    if (idx === 0) return;
    const newSteps = [...editingWorkflow.steps];
    const temp = newSteps[idx - 1];
    newSteps[idx - 1] = newSteps[idx];
    newSteps[idx] = temp;
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };

  const moveStepDown = (idx) => {
    if (idx === editingWorkflow.steps.length - 1) return;
    const newSteps = [...editingWorkflow.steps];
    const temp = newSteps[idx + 1];
    newSteps[idx + 1] = newSteps[idx];
    newSteps[idx] = temp;
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };


  // Drag and drop sorting
  const onDragStart = (e, idx) => {
    setDraggedStepIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (idx) => {
    if (draggedStepIdx === null || draggedStepIdx === idx) return;
    const newSteps = [...editingWorkflow.steps];
    const draggedItem = newSteps[draggedStepIdx];
    newSteps.splice(draggedStepIdx, 1);
    newSteps.splice(idx, 0, draggedItem);
    setDraggedStepIdx(idx);
    setEditingWorkflow({ ...editingWorkflow, steps: newSteps });
  };
  const onDragEnd = () => {
    setDraggedStepIdx(null);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-bold">Loading Workflows...</div>;
  }

  const groupedWorkflows = workflows.reduce((acc, wf) => {
    const category = wf.workflow_type || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(wf);
    return acc;
  }, {});
  
  addedCategories.forEach(cat => {
    if (!groupedWorkflows[cat]) groupedWorkflows[cat] = [];
  });

  // LIST VIEW
  if (!editingWorkflow) {

    if (!selectedCategory) {
      return (
        <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Workflow Categories</h2>
                <p className="text-sm font-bold text-slate-500 mt-1">Select a category to view and manage its workflows.</p>
              </div>
              <button onClick={handleAddCategory} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold text-xs uppercase tracking-wide rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Plus className="h-4 w-4" /> Add Category
              </button>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.keys(groupedWorkflows).map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Network className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm tracking-wide">{cat}</h3>
                    <p className="text-sm font-bold text-slate-500 mt-0.5">{groupedWorkflows[cat].length} Workflows</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </button>
            ))}
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
                    placeholder="e.g. Expense Report"
                    autoFocus
                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none mb-6"
                  />
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-md transition-colors">Cancel</button>
                    <button type="submit" disabled={!newCategoryName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-md shadow-sm transition-colors disabled:opacity-50">Add Category</button>
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
            <button aria-label="Back to Categories" onClick={() => selectedSubCategory ? setSelectedSubCategory(null) : setSelectedCategory(null)} className="text-slate-400 hover:text-slate-600 p-1.5 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors border border-slate-200">
              <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                {selectedCategory} {selectedSubCategory ? `> ${selectedSubCategory}` : 'Workflows'}
              </h2>
              <p className="text-sm font-bold text-slate-500 mt-1">
                {selectedSubCategory ? `Managing workflows in ${selectedSubCategory}` : 'Select a screen to view its workflows.'}
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>
            <button onClick={() => openEditor(null, selectedCategory, 0)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wide rounded-md transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0">
              <Plus className="h-4 w-4" /> {selectedSubCategory ? 'Create Workflow' : 'Create Doc Type'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {!selectedSubCategory ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries((groupedWorkflows[selectedCategory] || [])
                .reduce((acc, wf) => {
                  const subCategory = wf.profile_name.includes(' - ') ? wf.profile_name.split(' - ')[0] : 'Other Workflows';
                  if (!acc[subCategory]) acc[subCategory] = [];
                  acc[subCategory].push(wf);
                  return acc;
                }, {}))
                .filter(([subCat]) => subCat.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(([subCat, wfs]) => (
                  <button key={subCat} onClick={() => setSelectedSubCategory(subCat)} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-500 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Network className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm tracking-wide">
                          {subCat}
                        </h3>
                        <p className="text-sm font-bold text-slate-500 mt-0.5">{wfs.length} Workflows</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={(e) => confirmDeleteDocType(subCat, wfs, e)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors" aria-label="Delete Doc Type">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                  </button>
                ))
              }
              {Object.keys((groupedWorkflows[selectedCategory] || [])
                .reduce((acc, wf) => {
                  const subCategory = wf.profile_name.includes(' - ') ? wf.profile_name.split(' - ')[0] : 'Other Workflows';
                  if (!acc[subCategory]) acc[subCategory] = [];
                  acc[subCategory].push(wf);
                  return acc;
                }, {})).filter(subCat => subCat.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <div className="col-span-full py-16 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 border-dashed">
                  <Network className="h-10 w-10 text-slate-300 mb-4" />
                  <h3 className="text-sm font-bold text-slate-700">No screens found</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">No screens matching your search were found.</p>
                </div>
              )}
            </div>
          ) : (
            <div key={selectedSubCategory}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {((groupedWorkflows[selectedCategory] || [])
                  .filter(wf => (wf.profile_name.includes(' - ') ? wf.profile_name.split(' - ')[0] : 'Other Workflows') === selectedSubCategory)
                  .filter(wf => wf.profile_name.toLowerCase().includes(searchQuery.toLowerCase()) || (wf.description || '').toLowerCase().includes(searchQuery.toLowerCase()))
                ).map((wf, index) => (
                  <div key={wf.profile_name} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:border-blue-300 transition-colors group flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm tracking-wide">
                          {wf.profile_name}
                        </h3>
                        <p className="text-sm font-bold text-slate-500 mt-0.5">{wf.workflow_code || 'NO-CODE'} • {wf.workflow_type || 'Custom'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-black uppercase ${wf.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {wf.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4 flex-1">{wf.description || 'No description provided.'}</p>
                    
                    <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
                      <div className="text-sm font-bold text-slate-600 flex items-center gap-1">
                        <Network className="h-3 w-3" /> {wf.steps?.length || 0} Steps
                      </div>
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button aria-label="Edit Workflow" onClick={() => openEditor(wf, selectedCategory, index)} className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button aria-label="Delete Workflow" onClick={() => handleDelete(wf.profile_name)} className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {((groupedWorkflows[selectedCategory] || [])
                .filter(wf => (wf.profile_name.includes(' - ') ? wf.profile_name.split(' - ')[0] : 'Other Workflows') === selectedSubCategory)
                .filter(wf => wf.profile_name.toLowerCase().includes(searchQuery.toLowerCase()) || (wf.description || '').toLowerCase().includes(searchQuery.toLowerCase()))
              ).length === 0 && (
                <div className="col-span-full py-16 flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 border-dashed">
                  <Network className="h-10 w-10 text-slate-300 mb-4" />
                  <h3 className="text-sm font-bold text-slate-700">No workflows found</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm text-center">Get started by creating a new workflow for {selectedSubCategory}.</p>
                  <button onClick={() => openEditor(null, selectedCategory, 0)} className="mt-5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Create Workflow</button>
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
                <h3 className="font-black text-slate-900 text-lg mb-2">Delete Workflow</h3>
                <p className="text-sm text-slate-500 mb-6">Are you sure you want to delete <strong className="text-slate-800">{deleteConfirmTarget}</strong>? This action cannot be undone.</p>
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

  // EDIT VIEW (The requested Redesign)
  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 bg-slate-50 min-h-screen rounded-xl border border-slate-200/60 shadow-sm p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-600" onClick={() => setEditingWorkflow(null)}>
          Workflows <span className="text-slate-300">&gt;</span> Configure Workflow
        </div>
        <div className="flex justify-between items-center mt-2">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Configure Workflow</h1>
            <p className="text-xs font-semibold text-slate-500 mt-1">Define approval process by adding approval steps, roles and approvers.</p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditingWorkflow(null)} className="px-5 py-2 bg-white border border-slate-300 text-slate-700 font-bold text-xs rounded shadow-sm hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Workflow'} <CheckCircle2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* LEFT COLUMN: Form Sections */}
        <div className="flex-1 w-full flex flex-col gap-6">
          
          {/* Section 1: Workflow Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-5">
              <span className="bg-blue-600 text-white h-5 w-5 rounded-full flex items-center justify-center text-sm">1</span> Workflow Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-1">
                <label htmlFor="wfName" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Workflow Name <span className="text-rose-500">*</span></label>
                <input id="wfName" required value={editingWorkflow.profile_name} onChange={e => setEditingWorkflow({...editingWorkflow, profile_name: e.target.value})} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none font-semibold text-slate-800" placeholder="e.g. Invoice Approval Workflow" />
              </div>
              <div className="md:col-span-1">
                <label htmlFor="wfCode" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Workflow Code</label>
                <input id="wfCode" value={editingWorkflow.workflow_code || ''} onChange={e => setEditingWorkflow({...editingWorkflow, workflow_code: e.target.value})} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none font-mono text-slate-800" placeholder="INV-APP-001" />
              </div>
              <div className="md:col-span-1">
                <label htmlFor="wfType" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Workflow Type</label>
                <select id="wfType" value={editingWorkflow.workflow_type || ''} onChange={e => setEditingWorkflow({...editingWorkflow, workflow_type: e.target.value})} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none font-semibold text-slate-800">
                  {Array.from(new Set([...Object.keys(groupedWorkflows), 'Vendor Payment'])).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="wfDesc" className="block text-xs font-bold uppercase tracking-wide text-slate-600 mb-1">Description</label>
                <input id="wfDesc" value={editingWorkflow.description || ''} onChange={e => setEditingWorkflow({...editingWorkflow, description: e.target.value})} className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none text-slate-600" placeholder="Workflow for invoice approval based on roles..." />
              </div>
              <div className="md:col-span-1 flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-500">Status</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={editingWorkflow.status === 'Active'} onChange={e => setEditingWorkflow({...editingWorkflow, status: e.target.checked ? 'Active' : 'Inactive'})} />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-xs font-bold text-slate-700">{editingWorkflow.status}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Approval Steps */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <span className="bg-blue-600 text-white h-5 w-5 rounded-full flex items-center justify-center text-sm">2</span> Approval Steps
              </h2>
              <button type="button" onClick={addStep} className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-bold text-sm uppercase tracking-wider rounded transition-colors shadow-sm">
                <Plus className="h-3.5 w-3.5" /> Add Step
              </button>
            </div>
            
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-12 text-center">Step</th>
                    <th className="pb-3 px-2 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-40">Stage Title</th>
                    <th className="pb-3 px-2 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-32">Authorization Level</th>
                    <th className="pb-3 px-2 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Assignment Strategy & Target</th>
                    <th className="pb-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-16 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {editingWorkflow.steps.map((step, idx) => (
                    <tr 
                      key={idx} 
                      draggable 
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={() => onDragOver(idx)}
                      onDragEnd={onDragEnd}
                      className="group bg-white hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 align-top text-center cursor-move">
                        <div className="flex items-center justify-center gap-1">
                          <GripVertical className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
                          <span className="h-6 w-6 rounded flex items-center justify-center bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200">
                            {idx + 1}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 align-top">
                        <input value={step.step_name} onChange={e => updateStep(idx, 'step_name', e.target.value)} className="w-full text-xs p-2 bg-slate-50/50 border border-slate-200 rounded focus:bg-white focus:border-blue-500 outline-none font-semibold text-slate-800" placeholder="e.g. Finance Review" />
                      </td>
                      <td className="py-3 px-2 align-top">
                        <select value={step.role || 'Employee'} onChange={e => updateStep(idx, 'role', e.target.value)} className="w-full text-xs p-2 pr-8 truncate bg-slate-50/50 border border-slate-200 rounded focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium">
                          <option value="Employee">Employee</option>
                          <option value="Manager">Manager</option>
                          <option value="Director">Director</option>
                          <option value="VP">VP</option>
                          <option value="CITO">CITO</option>
                          <option value="GM">GM</option>
                        </select>
                      </td>
                      <td className="py-3 px-2 align-top">
                        <div className="flex gap-2">
                          <select value={step.approver_type || 'Specific Employee'} onChange={e => {
                            updateStep(idx, 'approver_type', e.target.value);
                            updateStep(idx, 'approver_target', ''); // reset target on change
                          }} className="w-1/3 text-xs p-2 pr-8 truncate bg-slate-50/50 border border-slate-200 rounded focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium">
                            <option value="Specific Employee">Specific Employee</option>
                            <option value="Role Based">Role Based</option>
                          </select>
                          
                          <div className="w-2/3">
                            {step.approver_type === 'Specific Employee' ? (
                              <select value={step.approver_target} onChange={e => updateStep(idx, 'approver_target', e.target.value)} className="w-full text-xs p-2 pr-8 truncate bg-slate-50/50 border border-slate-200 rounded focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium">
                                <option value="">-- Select Employee --</option>
                                {users.map(u => <option key={u.id} value={u.username}>{u.name || (u.first_name + ' ' + u.last_name)} ({u.employee_id || u.emp_id})</option>)}
                              </select>
                            ) : (
                              <select value={step.approver_target} onChange={e => updateStep(idx, 'approver_target', e.target.value)} className="w-full text-xs p-2 pr-8 truncate bg-slate-50/50 border border-slate-200 rounded focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium">
                                <option value="">-- Select Role Target --</option>
                                <option value="Finance Manager">Finance Manager</option>
                                <option value="Chief Information Technology Officer">Chief Information Technology Officer</option>
                                <option value="General Manager">General Manager</option>
                                <option value="Department Head">Department Head</option>
                              </select>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 align-top text-right pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => moveStepUp(idx)} disabled={idx === 0} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Move Step Up">
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => moveStepDown(idx)} disabled={idx === editingWorkflow.steps.length - 1} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Move Step Down">
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => deleteStep(idx)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Remove Step">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {editingWorkflow.steps.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-xs font-bold text-slate-400">No steps defined. Add a step to begin.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 text-xs font-bold text-blue-600 bg-blue-50/50 p-2 rounded flex gap-1.5 items-center">
              <span className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center">i</span>
              Steps will be executed sequentially in the order specified above. Drag steps to reorder.
            </div>
          </div>

          {/* Section 3: Additional Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-10">
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2 mb-4">
              <Settings2 className="h-4 w-4 text-slate-500" /> Additional Settings
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Approval Threshold</label>
                <div className="relative">
                  <input type="number" value={editingWorkflow.approval_threshold} onChange={e=>setEditingWorkflow({...editingWorkflow, approval_threshold: parseInt(e.target.value)||0})} className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded outline-none font-mono" />
                  <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">%</span>
                </div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Rejection Handling</label>
                <select value={editingWorkflow.rejection_handling} onChange={e=>setEditingWorkflow({...editingWorkflow, rejection_handling: e.target.value})} className="w-full text-xs p-2 pr-8 truncate bg-slate-50 border border-slate-200 rounded outline-none font-medium text-slate-700">
                  <option value="Return to Previous Step">Return to Previous Step</option>
                  <option value="Terminate Workflow">Terminate Workflow</option>
                  <option value="Return to Submitter">Return to Submitter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Reminder Interval</label>
                <div className="relative">
                  <input type="number" value={editingWorkflow.reminder_interval_hours} onChange={e=>setEditingWorkflow({...editingWorkflow, reminder_interval_hours: parseInt(e.target.value)||0})} className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded outline-none font-mono" />
                  <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">hrs</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Escalation After</label>
                <div className="relative">
                  <input type="number" value={editingWorkflow.escalation_after_hours} onChange={e=>setEditingWorkflow({...editingWorkflow, escalation_after_hours: parseInt(e.target.value)||0})} className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded outline-none font-mono" />
                  <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">hrs</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Auto Escalation</label>
                <select value={editingWorkflow.auto_escalation ? 'Enabled' : 'Disabled'} onChange={e=>setEditingWorkflow({...editingWorkflow, auto_escalation: e.target.value === 'Enabled'})} className="w-full text-xs p-2 pr-8 truncate bg-slate-50 border border-slate-200 rounded outline-none font-medium text-slate-700">
                  <option value="Enabled">Enabled</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Workflow Summary Sidebar */}
        <div className="w-full lg:w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 p-5 sticky top-8">
          <h2 className="text-sm font-black text-slate-800 mb-4 uppercase tracking-wide">Workflow Summary</h2>
          
          <div className="space-y-3 pb-4 border-b border-slate-100">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Workflow Name</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">{editingWorkflow.profile_name || '-'}</div>
            </div>
            <div>
              <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Workflow Code</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5 font-mono">{editingWorkflow.workflow_code || '-'}</div>
            </div>
            <div className="flex gap-4">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Type</div>
                <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-sm border border-emerald-200">{editingWorkflow.workflow_type || '-'}</span>
              </div>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Status</div>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-bold rounded-sm border ${editingWorkflow.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{editingWorkflow.status}</span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-4">Approval Sequence ({editingWorkflow.steps.length})</h3>
            
            <div className="relative pl-3 border-l-2 border-slate-200/60 ml-2 space-y-5">
              {editingWorkflow.steps.length === 0 ? (
                <div className="text-xs text-slate-400 italic font-medium -ml-5">No steps added.</div>
              ) : (
                editingWorkflow.steps.map((step, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-[23px] top-0 h-5 w-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold ring-4 ring-white shadow-sm">
                      {idx + 1}
                    </div>
                    <div className="pl-2">
                      <div className="text-sm font-bold text-slate-800">{step.step_name || `Step ${idx+1}`}</div>
                      <div className="text-xs font-medium text-slate-500 leading-snug mt-0.5">
                        <span className="font-bold text-slate-600">{step.role}</span> • {step.approver_target || 'Target Unassigned'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
