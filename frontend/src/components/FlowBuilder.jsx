import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Network, Save, X, Settings2, GripVertical, CheckCircle2, ArrowRight, ArrowUp, ArrowDown, Search, AlertTriangle, Folder, Users, ListChecks, Sparkles, CheckSquare } from 'lucide-react';

const STAGE_CHECKLIST_LIBRARY = [
  "Verify PO & Line Items Match Invoice",
  "Confirm Unit Rates & Total Price Calculations",
  "Validate HSN/SAC Code & Applicable GST Rates",
  "Verify Delivery / Goods Receipt Confirmation (GRN)",
  "Verify Physical Stamp & Authorized Signatures",
  "Validate Vendor Bank Details & GSTIN against ERP Master",
  "Confirm Cost Center & Department Budget Clearance",
  "Check Advance Adjustment & TDS Withholding",
  "Verify Payment Terms & Credit Period Compliance",
  "Inspect Quality Inspection Certificate & Warranty Terms"
];

const getPrefixCode = (category, subCat) => {
  if (!category && !subCat) return "";
  const n = `${category || ""} ${subCat || ""}`.toUpperCase();
  if (n.includes("CAPEX") || n.includes("ASSET")) return "CPX";
  if (n.includes("PURCHASE")) return "PUR";
  if (n.includes("SERVICE") || n.includes("MAINTENANCE")) return "SRV";
  if (n.includes("FREIGHT") || n.includes("LOGISTICS")) return "FRT";
  if (n.includes("UTILITY") || n.includes("RENT")) return "UTL";
  if (n.includes("STAFF") || n.includes("EXPENSE")) return "EXP";
  if (n.includes("GRN") || n.includes("GOODS")) return "GRN";
  if (n.includes("ADVANCE")) return "ADV";
  if (n.includes("CASH")) return "CSH";
  if (n.includes("EVOUCHER") || n.includes("E-VOUCHER")) return "EV";
  if (n.includes("JOURNAL")) return "JRN";
  return "WF";
};

const getWorkflowPrefixCode = (category, subCat, index) => {
  if (!category && !subCat) return "";
  const n = `${category || ""} ${subCat || ""}`.toUpperCase();
  const num = String(index + 1).padStart(3, '0');
  
  if (n.includes("CAPEX") || n.includes("ASSET")) return `CAPEX-${num}`;
  if (n.includes("PURCHASE")) return `PUR-${num}`;
  if (n.includes("SERVICE") || n.includes("MAINTENANCE")) return `SRV-${num}`;
  if (n.includes("FREIGHT") || n.includes("LOGISTICS")) return `FRT-${num}`;
  if (n.includes("UTILITY") || n.includes("RENT")) return `UTL-${num}`;
  if (n.includes("STAFF") || n.includes("EXPENSE")) return `EXP-${num}`;
  if (n.includes("GRN") || n.includes("GOODS")) return `GRN-${num}`;
  if (n.includes("ADVANCE")) return `ADV-${num}`;
  if (n.includes("CASH")) return `CSH-${num}`;
  if (n.includes("EVOUCHER") || n.includes("E-VOUCHER")) return `EV-${num}`;
  if (n.includes("JOURNAL") || n.includes("JRNL")) return `JRNL-${num}`;
  if (n.includes("CREDITNOTE") || n.includes("CREDIT NOTE")) return `CN-${num}`;
  if (n.includes("DEBITNOTE") || n.includes("DEBIT NOTE")) return `DN-${num}`;
  return `WF-${num}`;
};

export default function FlowBuilder({ users = [] }) {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [internalUsers, setInternalUsers] = useState(users || []);
  const [editingWorkflow, setEditingWorkflow] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);
  const [addedCategories, setAddedCategories] = useState(() => {
    try {
      const saved = localStorage.getItem("docuflow_custom_categories");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("docuflow_custom_categories", JSON.stringify(addedCategories));
    } catch {}
  }, [addedCategories]);

  const [saving, setSaving] = useState(false);
  const [draggedStepIdx, setDraggedStepIdx] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState(null);
  const [configuringStepIndex, setConfiguringStepIndex] = useState(null);
  const [memberSearchText, setMemberSearchText] = useState("");
  const [showApproversList, setShowApproversList] = useState(false);
  const [showChecklistSection, setShowChecklistSection] = useState(false);
  const [newStageChecklistText, setNewStageChecklistText] = useState("");

  const addChecklistItemToConfiguringStep = (text) => {
    if (!text || !text.trim() || configuringStepIndex === null || !editingWorkflow) return;
    const clean = text.trim();
    const currentStep = editingWorkflow.steps[configuringStepIndex];
    if (!currentStep) return;
    const currentList = Array.isArray(currentStep.checklist_items) ? currentStep.checklist_items : [];
    if (!currentList.includes(clean)) {
      updateStep(configuringStepIndex, 'checklist_items', [...currentList, clean]);
    }
    setNewStageChecklistText("");
  };

  const removeChecklistItemFromConfiguringStep = (indexToRemove) => {
    if (configuringStepIndex === null || !editingWorkflow) return;
    const currentStep = editingWorkflow.steps[configuringStepIndex];
    if (!currentStep) return;
    const currentList = Array.isArray(currentStep.checklist_items) ? currentStep.checklist_items : [];
    updateStep(configuringStepIndex, 'checklist_items', currentList.filter((_, idx) => idx !== indexToRemove));
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const handleAddCategory = () => {
    setShowAddModal(true);
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/users', {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setInternalUsers(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch users:", e);
    }
  };

  useEffect(() => {
    if (users && users.length > 0) {
      setInternalUsers(users);
    } else {
      fetchUsers();
    }
  }, [users]);

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
        setAddedCategories(prev => [...prev, catName]);
      }
      setSelectedCategory(catName);
      setSelectedSubCategory(null);
      setShowAddModal(false);
      setNewCategoryName("");
    }
  };

  const handleDeleteCategoryModal = async () => {
    if (!deleteCategoryTarget) return;
    const { category, wfs } = deleteCategoryTarget;
    try {
      const token = localStorage.getItem("authToken");
      // 1. Call category deletion endpoint on backend
      await fetch(`/api/admin/categories/${encodeURIComponent(category)}`, {
        method: 'DELETE',
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });

      // 2. Also delete each workflow individually to ensure complete purge
      if (wfs && wfs.length > 0) {
        await Promise.all(wfs.map(wf => 
          fetch(`/api/admin/workflows/${encodeURIComponent(wf.profile_name)}`, {
            method: 'DELETE',
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
          })
        ));
      }

      setAddedCategories(prev => prev.filter(c => c !== category));
      if (selectedCategory === category) {
        setSelectedCategory(null);
        setSelectedSubCategory(null);
      }
      await fetchWorkflows();
      setDeleteCategoryTarget(null);
    } catch (err) {
      console.error(err);
      alert("Error deleting category");
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
      if (Array.isArray(cloned.steps)) {
        cloned.steps = cloned.steps.map((st, idx) => ({
          ...st,
          checklist_items: Array.isArray(st.checklist_items) 
            ? st.checklist_items 
            : (st.checklist_json ? JSON.parse(st.checklist_json) : [
                "Verify PO & Line Items Match Invoice",
                "Validate Tax Calculations & HSN/SAC Code",
                "Verify Goods Receipt (GRN) & Delivery Acceptance"
              ])
        }));
      }
      setEditingWorkflow(cloned);
    } else {
      setEditingWorkflow({
        profile_name: '',
        workflow_code: generatedCode || '',
        workflow_category: selectedCategory || 'Vendor Payment Workflows',
        workflow_type: selectedSubCategory || '',
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
          action_required: 'Approve',
          delegate_approver: '',
          escalation_rule: '',
          target_division: '',
          target_department: '',
          checklist_items: [
            "Verify PO & Line Items Match Invoice",
            "Validate Tax Calculations & HSN/SAC Code",
            "Verify Goods Receipt (GRN) & Delivery Acceptance"
          ]
        }]
      });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const token = localStorage.getItem("authToken");
      
      const category = editingWorkflow.workflow_category || selectedCategory || 'Vendor Payment Workflows';
      const docType = editingWorkflow.workflow_type || selectedSubCategory || 'General Records';

      // Clean and ensure steps schema compliance
      const cleanedSteps = (editingWorkflow.steps || []).map((step, idx) => ({
        stage_number: idx + 1,
        step_name: step.step_name || `Stage ${idx + 1}`,
        approver_type: step.approver_type || 'Role Based',
        approver_target: step.approver_target || '',
        delegate_approver: step.delegate_approver || '',
        document_type: step.document_type || docType || 'RECORD',
        action_required: step.action_required || 'Approve',
        permissions: step.permissions || 'Approve / Reject',
        sla_hours: parseInt(step.sla_hours || 48, 10),
        checklist_items: Array.isArray(step.checklist_items) ? step.checklist_items : []
      }));

      const payload = {
        profile_name: (editingWorkflow.profile_name || '').trim(),
        workflow_code: (editingWorkflow.workflow_code || '').trim() || undefined,
        workflow_category: category,
        workflow_type: docType,
        description: editingWorkflow.description || '',
        status: editingWorkflow.status || 'Active',
        approval_threshold: parseInt(editingWorkflow.approval_threshold || 100, 10),
        rejection_handling: editingWorkflow.rejection_handling || 'Return to Previous Step',
        reminder_interval_hours: parseInt(editingWorkflow.reminder_interval_hours || 24, 10),
        escalation_after_hours: parseInt(editingWorkflow.escalation_after_hours || 72, 10),
        auto_escalation: !!editingWorkflow.auto_escalation,
        steps: cleanedSteps
      };

      const res = await fetch('/api/admin/workflows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchWorkflows();
        setSelectedCategory(category);
        setSelectedSubCategory(docType);
        setEditingWorkflow(null);
      } else {
        const errJson = await res.json().catch(() => ({ detail: "Unknown server error" }));
        alert(`Failed to save workflow: ${errJson.detail || JSON.stringify(errJson)}`);
      }
    } catch (err) {
      console.error(err);
      alert(`Error saving workflow: ${err.message}`);
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
    if (editingWorkflow.steps && editingWorkflow.steps.length >= 10) {
      alert("Maximum limit of 10 approval steps reached per workflow.");
      return;
    }
    const newSteps = [...editingWorkflow.steps, {
      stage_number: editingWorkflow.steps.length + 1,
      step_name: `Stage ${editingWorkflow.steps.length + 1}: Review`,
      role: 'Manager',
      approver_type: 'Role Based',
      approver_target: '',
      permissions: 'Approve Only',
      action_required: 'Approve',
      delegate_approver: '',
      escalation_rule: '',
      target_division: '',
      target_department: '',
      checklist_items: [
        "Verify Line Items & Price Calculations",
        "Confirm Department Approval & Budget Signoff"
      ]
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

  const groupedWorkflows = workflows.reduce((acc, wf) => {
    const category = wf.workflow_category || 'Vendor Payment Workflows';
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
        <div className="flex flex-col gap-4 mt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.keys(groupedWorkflows).map(cat => (
              <div key={cat} onClick={() => setSelectedCategory(cat)} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Network className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs tracking-wide group-hover:text-blue-700 transition-colors">{cat}</h3>
                    <p className="text-[10px] font-bold text-slate-500 mt-0.5">{groupedWorkflows[cat].length} Workflows</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); setDeleteCategoryTarget({ category: cat, wfs: groupedWorkflows[cat] }); }} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-60 group-hover:opacity-100" title="Delete Category">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
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

          {/* DELETE CATEGORY MODAL */}
          {deleteCategoryTarget && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-xs overflow-hidden scale-in">
                <div className="p-5 flex flex-col items-center text-center">
                  <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <h3 className="font-black text-slate-900 text-base mb-1.5">Delete Category</h3>
                  <p className="text-xs text-slate-500 mb-5 leading-relaxed">Are you sure you want to delete <strong className="text-slate-800">{deleteCategoryTarget.category}</strong> and all its {deleteCategoryTarget.wfs?.length || 0} workflows? This action cannot be undone.</p>
                  <div className="flex w-full gap-2.5">
                    <button type="button" onClick={() => setDeleteCategoryTarget(null)} className="flex-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">Cancel</button>
                    <button type="button" onClick={handleDeleteCategoryModal} className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">Delete</button>
                  </div>
                </div>
              </div>
            </div>
          )}</div>
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
                {selectedCategory} {selectedSubCategory && <><span className="text-slate-300">/</span> <span className="text-blue-600">{selectedSubCategory}</span></>}
              </h2>
              <p className="text-[10px] font-bold text-slate-500">
                {selectedSubCategory ? `Managing workflows in ${selectedSubCategory}` : `Select a document folder to view its workflows`}
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
              <Plus className="h-4 w-4" /> Create Workflow
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {(() => {
            const allCatWorkflows = (groupedWorkflows[selectedCategory] || [])
              .filter(wf => wf.profile_name.toLowerCase().includes(searchQuery.toLowerCase()) || (wf.description || '').toLowerCase().includes(searchQuery.toLowerCase()))
              .sort((a, b) => a.profile_name.localeCompare(b.profile_name, undefined, { numeric: true }));

            const byType = allCatWorkflows.reduce((acc, wf) => {
              const type = wf.workflow_type || 'General Records';
              if (!acc[type]) acc[type] = [];
              acc[type].push(wf);
              return acc;
            }, {});

            const typeKeys = Object.keys(byType).sort();
            const activeType = selectedSubCategory && selectedSubCategory !== 'ALL' ? selectedSubCategory : null;
            const displayedWorkflows = activeType ? (byType[activeType] || []) : allCatWorkflows;

            return (
              <div className="flex flex-col gap-4">
                {/* Subcategory Filter Pills */}
                {typeKeys.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => setSelectedSubCategory(null)}
                      className={`px-3 py-1 rounded-lg text-[10.5px] font-bold transition whitespace-nowrap cursor-pointer ${
                        !activeType
                          ? "bg-blue-600 text-white shadow-xs"
                          : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      All Workflows ({allCatWorkflows.length})
                    </button>
                    {typeKeys.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setSelectedSubCategory(type)}
                        className={`px-3 py-1 rounded-lg text-[10.5px] font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                          activeType === type
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span>{type}</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                          activeType === type ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"
                        }`}>
                          {byType[type].length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Direct Workflow Cards Grid */}
                {displayedWorkflows.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center">
                    <Network className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">No workflows in this category yet</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Click "Create Workflow" above to add the first approval flow.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedWorkflows.map((wf, index) => (
                      <div key={wf.profile_name} className="bg-white rounded-lg shadow-sm border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group flex flex-col p-3 relative">
                    <div className="absolute top-3 right-3">
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${wf.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {wf.status}
                      </span>
                    </div>

                    <div className="pr-16 mb-1.5">
                      <h3 className="font-bold text-slate-900 text-xs truncate" title={wf.profile_name}>
                        {wf.profile_name}
                      </h3>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">
                        {wf.workflow_code || 'NO-CODE'} <span className="text-slate-300">•</span> {wf.workflow_type || 'Custom'}
                      </p>
                    </div>
                    
                    <div className="mb-1.5 flex-1">
                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug">
                        {wf.description || 'No description provided.'}
                      </p>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between mt-auto">
                      <div className="text-[10px] font-bold text-slate-700 flex items-center gap-1.5 truncate">
                        <Network className="h-3 w-3 flex-shrink-0" /> {wf.steps?.length || 0} Steps
                      </div>
                      <div className="flex gap-1 flex-shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button type="button" aria-label="Edit Workflow" onClick={() => openEditor(wf, selectedCategory, index)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="Delete Workflow" onClick={() => handleDelete(wf.profile_name)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
</div>
                  </div>
                ))}
              </div>
            )}
            </div>
          );
        })()}
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
    <>
      <form onSubmit={handleSave} className="flex flex-col gap-1.5 bg-slate-50 h-full rounded-xl border border-slate-200/60 shadow-sm p-4 sm:p-5 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col shrink-0 z-10 bg-slate-50 pb-1 -mx-4 -mt-4 px-4 pt-1.5 sm:-mx-5 sm:-mt-5 sm:px-5 sm:pt-2 border-b border-slate-200/60 shadow-sm mb-0">
        <div className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors" onClick={() => setEditingWorkflow(null)}>
          Workflows <span className="text-slate-300">&gt;</span> Configure Workflow
        </div>
        <div className="flex justify-between items-center mt-0">
          <div>
            <h1 className="text-sm font-black text-slate-900 tracking-tight">Configure Workflow</h1>
            <p className="text-[8px] font-semibold text-slate-500 mt-0">Define approval process by adding approval steps, roles and approvers.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditingWorkflow(null)} className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 font-bold text-[8px] uppercase tracking-wide rounded hover:bg-slate-50 transition-colors shadow-sm">Cancel</button>
            <button type="submit" disabled={saving} className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[8px] uppercase tracking-wide rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-sm shadow-blue-500/20">
              {saving ? 'Saving...' : 'Save Workflow'} <CheckCircle2 className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start flex-1 min-h-0 overflow-hidden -mx-4 px-4 sm:-mx-5 sm:px-5">
        {/* LEFT COLUMN: Form Sections */}
        <div className="flex-1 w-full flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar pr-2 pb-6">
          
          {/* Section 1: Workflow Information */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-4">
              <span className="bg-blue-600 text-white h-4 w-4 rounded-full flex items-center justify-center text-[10px]">1</span> Workflow Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label htmlFor="wfName" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Workflow Name <span className="text-rose-500">*</span></label>
                <input id="wfName" required value={editingWorkflow.profile_name} onChange={e => setEditingWorkflow({...editingWorkflow, profile_name: e.target.value})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none font-semibold text-slate-800" placeholder="e.g. Invoice Approval Workflow" />
              </div>
              <div className="md:col-span-1">
                <label htmlFor="wfCode" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Workflow Code</label>
                <input id="wfCode" value={editingWorkflow.workflow_code || ''} onChange={e => setEditingWorkflow({...editingWorkflow, workflow_code: e.target.value})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none font-mono text-slate-800" placeholder="INV-APP-001" />
              </div>
              <div className="md:col-span-1">
                <label htmlFor="wfCategory" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Category</label>
                <select id="wfCategory" value={editingWorkflow.workflow_category || ''} onChange={e => setEditingWorkflow({...editingWorkflow, workflow_category: e.target.value})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none font-semibold text-slate-800">
                  {Array.from(new Set([...Object.keys(groupedWorkflows), 'Vendor Payment Workflows'])).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <label htmlFor="wfType" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Document Type</label>
                <input id="wfType" value={editingWorkflow.workflow_type || ''} onChange={e => setEditingWorkflow({...editingWorkflow, workflow_type: e.target.value})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none font-semibold text-slate-800" placeholder="e.g. AP INVOICE" />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="wfDesc" className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Description</label>
                <input id="wfDesc" value={editingWorkflow.description || ''} onChange={e => setEditingWorkflow({...editingWorkflow, description: e.target.value})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-none text-slate-600" placeholder="Workflow for invoice approval based on roles..." />
              </div>
              <div className="md:col-span-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={editingWorkflow.status === 'Active'} onChange={e => setEditingWorkflow({...editingWorkflow, status: e.target.checked ? 'Active' : 'Inactive'})} />
                  <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-2 text-xs font-bold text-slate-700">{editingWorkflow.status}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section 2: Approval Steps */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <span className="bg-blue-600 text-white h-4 w-4 rounded-full flex items-center justify-center text-[10px]">2</span> Approval Steps
              </h2>
              <button 
                type="button" 
                onClick={addStep} 
                disabled={editingWorkflow.steps && editingWorkflow.steps.length >= 10}
                className="flex items-center gap-1.5 px-2.5 py-1 border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 font-bold text-[10px] uppercase tracking-wide rounded transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                title={editingWorkflow.steps && editingWorkflow.steps.length >= 10 ? "Maximum 10 approval steps reached" : "Add approval step"}
              >
                <Plus className="h-3 w-3" /> Add Step ({editingWorkflow.steps ? editingWorkflow.steps.length : 0}/10)
              </button>
            </div>
            
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-12 text-center">Step</th>
                    <th className="pb-2 px-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-40">Stage Title</th>
                    <th className="pb-2 px-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">Assignment Strategy & Target</th>
                    <th className="pb-2 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest w-16 text-right">Actions</th>
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
                      <td className="py-2.5 align-top text-center cursor-move">
                        <div className="flex items-center justify-center gap-1">
                          <GripVertical className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
                          <span className="h-5 w-5 rounded flex items-center justify-center bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200">
                            {idx + 1}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 align-top">
                        <input value={step.step_name} onChange={e => updateStep(idx, 'step_name', e.target.value)} className="w-full text-xs px-2 py-1.5 bg-slate-50/50 border border-slate-200 rounded focus:bg-white focus:border-blue-500 outline-none font-semibold text-slate-800" placeholder="e.g. Finance Review" />
                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={() => setConfiguringStepIndex(idx)}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold border transition-colors cursor-pointer ${
                              (step.checklist_items || []).length > 0 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' 
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                            }`}
                            title="Click to configure verification checklist for this stage"
                          >
                            <ListChecks className="h-2.5 w-2.5" />
                            <span>{(step.checklist_items || []).length} Checklist Items</span>
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 align-middle">
                        {(() => {
                          const target = step.approver_target || '';
                          const isPool = target.includes(',') || step.approver_type === 'Approval Pool';
                          const members = target ? target.split(',').map(s => s.trim()).filter(Boolean) : [];
                          
                          if (isPool && members.length > 0) {
                            return (
                              <div className="flex flex-col">
                                <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                                  <Users className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                  <span>Approval Pool ({members.length} Members • Any One)</span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {members.map(m => {
                                    const match = internalUsers.find(u => u.username === m || u.email === m);
                                    const displayName = match?.name || m;
                                    return (
                                      <span key={m} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                        {displayName}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }
                          
                          return (
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">{step.approver_type || 'Specific Employee'}</span>
                              <span className="text-[10px] text-slate-500 mt-0.5">
                                {step.approver_target ? (() => {
                                  const match = internalUsers.find(u => u.username === step.approver_target || u.email === step.approver_target);
                                  return match ? `${match.name} (${step.approver_target})` : step.approver_target;
                                })() : 'Not configured'}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 align-top text-right pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" onClick={() => setConfiguringStepIndex(idx)} className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Configure Step">
                            <Settings2 className="h-4 w-4" />
                          </button>
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

          {/* Section 3: Settings */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-4">
              <span className="bg-blue-600 text-white h-4 w-4 rounded-full flex items-center justify-center text-[10px]">3</span> 
              <Settings2 className="h-3 w-3 text-slate-500" /> Additional Settings
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Approval Threshold</label>
                <div className="relative">
                  <input type="number" value={editingWorkflow.approval_threshold} onChange={e=>setEditingWorkflow({...editingWorkflow, approval_threshold: parseInt(e.target.value)||0})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded outline-none font-mono text-slate-800" />
                  <span className="absolute right-2 top-1.5 text-xs font-bold text-slate-400">%</span>
                </div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Rejection Handling</label>
                <select value={editingWorkflow.rejection_handling} onChange={e=>setEditingWorkflow({...editingWorkflow, rejection_handling: e.target.value})} className="w-full text-xs px-2.5 py-1.5 pr-6 truncate bg-slate-50 border border-slate-200 rounded outline-none font-medium text-slate-800">
                  <option value="Return to Previous Step">Return to Previous Step</option>
                  <option value="Terminate Workflow">Terminate Workflow</option>
                  <option value="Return to Submitter">Return to Submitter</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Reminder Interval</label>
                <div className="relative">
                  <input type="number" value={editingWorkflow.reminder_interval_hours} onChange={e=>setEditingWorkflow({...editingWorkflow, reminder_interval_hours: parseInt(e.target.value)||0})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded outline-none font-mono text-slate-800" />
                  <span className="absolute right-2 top-1.5 text-[10px] font-bold text-slate-400">hrs</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Escalation After</label>
                <div className="relative">
                  <input type="number" value={editingWorkflow.escalation_after_hours} onChange={e=>setEditingWorkflow({...editingWorkflow, escalation_after_hours: parseInt(e.target.value)||0})} className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded outline-none font-mono text-slate-800" />
                  <span className="absolute right-2 top-1.5 text-[10px] font-bold text-slate-400">hrs</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Auto Escalation</label>
                <select value={editingWorkflow.auto_escalation ? 'Enabled' : 'Disabled'} onChange={e=>setEditingWorkflow({...editingWorkflow, auto_escalation: e.target.value === 'Enabled'})} className="w-full text-xs px-2.5 py-1.5 pr-6 truncate bg-slate-50 border border-slate-200 rounded outline-none font-medium text-slate-800">
                  <option value="Enabled">Enabled</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Workflow Summary Sidebar */}
        <div className="w-full lg:w-72 flex-shrink-0 bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-6">
          <h2 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-widest">Workflow Summary</h2>
          
          <div className="space-y-2.5 pb-4 border-b border-slate-100">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Workflow Name</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">{editingWorkflow.profile_name || '-'}</div>
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Workflow Code</div>
              <div className="text-[11px] font-bold text-slate-800 mt-0.5 font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-100 inline-block">{editingWorkflow.workflow_code || '-'}</div>
            </div>
            <div className="flex gap-4">
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Type</div>
                <span className="inline-block mt-0.5 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-sm border border-emerald-200">{editingWorkflow.workflow_type || '-'}</span>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status</div>
                <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-sm border ${editingWorkflow.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{editingWorkflow.status}</span>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-800 mb-3">Approval Sequence ({editingWorkflow.steps.length})</h3>
            
            <div className="relative pl-3 border-l-2 border-slate-100 space-y-3">
              {editingWorkflow.steps.length === 0 ? (
                <div className="text-[10px] text-slate-400 italic font-medium -ml-5">No steps added.</div>
              ) : (
                editingWorkflow.steps.map((step, idx) => {
                  const target = step.approver_target || '';
                  const isPool = target.includes(',') || step.approver_type === 'Approval Pool';
                  const members = target ? target.split(',').map(s => s.trim()).filter(Boolean) : [];
                  
                  return (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[23px] top-0 h-4 w-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold ring-4 ring-white shadow-sm">
                        {idx + 1}
                      </div>
                      <div className="pl-1.5">
                        <div className="text-[11px] font-bold text-slate-800 leading-tight">{step.step_name || `Step ${idx+1}`}</div>
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide leading-snug mt-0.5">
                          {isPool && members.length > 0 ? (
                            <span className="text-blue-600 font-extrabold">
                              Pool ({members.length} Approvers • Any One)
                            </span>
                          ) : (
                            <span>{step.approver_target || step.approver_type || 'Unassigned'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
    
    {configuringStepIndex !== null && editingWorkflow.steps[configuringStepIndex] && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setConfiguringStepIndex(null)} />
        <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div>
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>Configure Step {configuringStepIndex + 1}</span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                  {editingWorkflow.steps[configuringStepIndex].step_name || 'Untitled Step'}
                </span>
              </h3>
              <p className="text-[10px] font-medium text-slate-500 mt-0.5">Set stage approver pool, backup delegates, SLA, and verification checklist.</p>
            </div>
            <button type="button" onClick={() => setConfiguringStepIndex(null)} className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer shadow-2xs">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            <div className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Assignment Strategy</label>
                {(() => {
                  const currentTarget = editingWorkflow.steps[configuringStepIndex].approver_target || '';
                  const isCurrentPool = currentTarget.includes(',') || editingWorkflow.steps[configuringStepIndex].approver_type === 'Approval Pool';
                  const effectiveType = isCurrentPool ? 'Approval Pool' : (editingWorkflow.steps[configuringStepIndex].approver_type || 'Specific Employee');

                  return (
                    <select 
                      value={effectiveType} 
                      onChange={e => {
                        updateStep(configuringStepIndex, 'approver_type', e.target.value);
                        if (e.target.value === 'Specific Employee') {
                          // Keep first user if converting from pool
                          const first = currentTarget.split(',')[0]?.trim() || '';
                          updateStep(configuringStepIndex, 'approver_target', first);
                        }
                      }} 
                      className="w-full text-xs p-2 bg-white border border-slate-300 rounded-md shadow-2xs focus:border-blue-500 outline-none text-slate-800 font-semibold"
                    >
                      <option value="Approval Pool">Approval Pool / Multi-User Group (Any One Can Approve)</option>
                      <option value="Specific Employee">Specific Employee (Single Direct Assignment)</option>
                      <option value="Role Based">Role Based (Dynamic Routing)</option>
                    </select>
                  );
                })()}
              </div>
              
              <div>
                {(() => {
                  const currentTarget = editingWorkflow.steps[configuringStepIndex].approver_target || '';
                  const isPool = currentTarget.includes(',') || editingWorkflow.steps[configuringStepIndex].approver_type === 'Approval Pool';

                  if (isPool) {
                    const selectedList = currentTarget ? currentTarget.split(',').map(s => s.trim()).filter(Boolean) : [];
                    
                    const toggleUserInPool = (uKey) => {
                      let newList;
                      if (selectedList.includes(uKey)) {
                        newList = selectedList.filter(k => k !== uKey);
                      } else {
                        newList = [...selectedList, uKey];
                      }
                      updateStep(configuringStepIndex, 'approver_target', newList.join(','));
                      updateStep(configuringStepIndex, 'approver_type', 'Approval Pool');
                    };

                    return (
                      <div className="space-y-3">
                        {/* Approval Rule Banner */}
                        <div className="px-2.5 py-1.5 bg-blue-50/80 border border-blue-200 rounded-md flex items-center justify-between gap-2 text-[10px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                            <span className="font-bold text-blue-900 shrink-0">First Responder Rule:</span>
                            <span className="text-blue-800 font-medium truncate">Any 1 member approval completes this stage.</span>
                          </div>
                          <span className="text-[9px] font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded shrink-0">
                            {selectedList.length} Pool Approvers
                          </span>
                        </div>

                        {/* Selected Members Badges */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Assigned Pool Members ({selectedList.length})</label>
                            {selectedList.length > 0 && (
                              <button 
                                type="button" 
                                onClick={() => updateStep(configuringStepIndex, 'approver_target', '')}
                                className="text-[9px] text-rose-600 hover:underline font-bold"
                              >
                                Clear All
                              </button>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-1 min-h-[32px] p-1.5 bg-slate-50 border border-slate-200 rounded-md">
                            {selectedList.length === 0 ? (
                              <span className="text-[10px] text-slate-400 italic">No members selected. Check users below to add to pool.</span>
                            ) : (
                              selectedList.map(m => {
                                const match = internalUsers.find(u => u.username === m || u.email === m);
                                const label = match?.name ? `${match.name} (${m})` : m;
                                return (
                                  <span key={m} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                    <span>{label}</span>
                                    <button type="button" onClick={() => toggleUserInPool(m)} className="text-blue-600 hover:text-rose-600">
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </div>

                        {/* Search & Quick-Add New Member Input */}
                        <div className="space-y-1">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700">
                            Search or Add New Approver
                          </label>
                          <div className="flex gap-1.5">
                            <input 
                              type="text"
                              value={memberSearchText}
                              onChange={e => setMemberSearchText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && memberSearchText.trim()) {
                                  e.preventDefault();
                                  const val = memberSearchText.trim();
                                  if (!selectedList.includes(val)) {
                                    toggleUserInPool(val);
                                  }
                                  setMemberSearchText("");
                                }
                              }}
                              placeholder="Type name, username or email..."
                              className="flex-1 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:border-blue-500 outline-none font-medium"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (memberSearchText.trim()) {
                                  const val = memberSearchText.trim();
                                  if (!selectedList.includes(val)) {
                                    toggleUserInPool(val);
                                  }
                                  setMemberSearchText("");
                                }
                              }}
                              disabled={!memberSearchText.trim()}
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs rounded-md transition shadow-xs flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>

                        {/* User Checkbox Selection List */}
                        <div>
                          {(() => {
                            const q = memberSearchText.trim().toLowerCase();
                            const filteredUsers = internalUsers.filter(u => {
                              if (!q) return true;
                              const nameMatch = (u.name || '').toLowerCase().includes(q);
                              const userMatch = (u.username || '').toLowerCase().includes(q);
                              const emailMatch = (u.email || '').toLowerCase().includes(q);
                              return nameMatch || userMatch || emailMatch;
                            });

                            const isListVisible = showApproversList || Boolean(q);

                            return (
                              <div className="space-y-1.5">
                                <button 
                                  type="button" 
                                  onClick={() => setShowApproversList(!showApproversList)}
                                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-md text-[10px] font-bold text-slate-700 transition cursor-pointer"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <Users className="h-3 w-3 text-blue-600" />
                                    <span>{isListVisible ? "Hide Approvers List" : `Browse System Approvers (${filteredUsers.length})`}</span>
                                  </div>
                                  <span className="text-[9px] text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                                    {isListVisible ? "▲ Hide" : "▼ View"}
                                  </span>
                                </button>

                                {isListVisible && (
                                  <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100 bg-white custom-scrollbar shadow-inner animate-in fade-in duration-150">
                                    {filteredUsers.length > 0 ? (
                                      filteredUsers.map(u => {
                                        const uKey = u.username || u.email;
                                        const isChecked = selectedList.includes(uKey);
                                        return (
                                          <label key={u.id || uKey} className="flex items-center justify-between p-2 hover:bg-slate-50 cursor-pointer transition">
                                            <div className="flex items-center gap-2">
                                              <input 
                                                type="checkbox" 
                                                checked={isChecked} 
                                                onChange={() => toggleUserInPool(uKey)}
                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                                              />
                                              <div>
                                                <div className="text-[11px] font-bold text-slate-800">{u.name}</div>
                                                <div className="text-[9px] text-slate-400 font-mono">{uKey}</div>
                                              </div>
                                            </div>
                                            <span className="text-[8.5px] font-bold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                              {u.role || 'Employee'}
                                            </span>
                                          </label>
                                        );
                                      })
                                    ) : (
                                      <div className="p-3 text-center text-[10px] text-slate-500">
                                        No existing user matches "<strong>{memberSearchText}</strong>".
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  }

                  if ((editingWorkflow.steps[configuringStepIndex].approver_type || 'Specific Employee') === 'Specific Employee') {
                    return (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">Primary Assignee</label>
                          <div className="space-y-1.5">
                            <select 
                              value={editingWorkflow.steps[configuringStepIndex].approver_target || ''} 
                              onChange={e => updateStep(configuringStepIndex, 'approver_target', e.target.value)} 
                              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium hover:border-slate-300 transition-colors"
                            >
                              <option value="">-- Select Target Employee --</option>
                              {(() => {
                                const current = editingWorkflow.steps[configuringStepIndex].approver_target || '';
                                const existsInList = internalUsers.some(u => u.username === current || u.email === current);
                                return (
                                  <>
                                    {current && !existsInList && (
                                      <option value={current}>{current}</option>
                                    )}
                                    {internalUsers.map(u => (
                                      <option key={u.id || u.username} value={u.username || u.email}>
                                        {u.name ? `${u.name} (${u.username || u.email})` : (u.username || u.email)}
                                      </option>
                                    ))}
                                  </>
                                );
                              })()}
                            </select>

                            <div className="flex gap-1.5 items-center">
                              <input 
                                type="text"
                                value={memberSearchText}
                                onChange={e => setMemberSearchText(e.target.value)}
                                placeholder="Or enter custom username / email..."
                                className="flex-1 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:border-blue-500 outline-none font-medium"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (memberSearchText.trim()) {
                                    updateStep(configuringStepIndex, 'approver_target', memberSearchText.trim());
                                    setMemberSearchText("");
                                  }
                                }}
                                disabled={!memberSearchText.trim()}
                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs rounded-md transition shadow-xs flex items-center gap-1 shrink-0"
                              >
                                <span>Set Assignee</span>
                              </button>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">Delegate / Backup</label>
                          <select 
                            value={editingWorkflow.steps[configuringStepIndex].delegate_approver || ''} 
                            onChange={e => updateStep(configuringStepIndex, 'delegate_approver', e.target.value)} 
                            className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium hover:border-slate-300 transition-colors"
                          >
                            <option value="">-- No Backup Selected --</option>
                            {internalUsers.map(u => (
                              <option key={u.id || u.username} value={u.username || u.email}>
                                {u.name ? `${u.name} (${u.username || u.email})` : (u.username || u.email)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">Escalation Rule</label>
                          <select value={editingWorkflow.steps[configuringStepIndex].escalation_rule || ''} onChange={e => updateStep(configuringStepIndex, 'escalation_rule', e.target.value)} className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium hover:border-slate-300 transition-colors">
                            <option value="">-- No Escalation (Wait Indefinitely) --</option>
                            <option value="Route to Direct Manager">Route to Direct Manager</option>
                            <option value="Route to Delegate">Route to Delegate</option>
                            <option value="Return to Submitter">Return to Submitter</option>
                            <option value="Auto-Approve">Auto-Approve</option>
                          </select>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1">Target Role</label>
                        <select value={editingWorkflow.steps[configuringStepIndex].approver_target} onChange={e => updateStep(configuringStepIndex, 'approver_target', e.target.value)} className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-blue-500 outline-none text-slate-700 font-medium hover:border-slate-300 transition-colors">
                          <option value="">-- Select Target Role --</option>
                          <option value="Finance Manager">Finance Manager</option>
                          <option value="Chief Information Technology Officer">Chief Information Technology Officer</option>
                          <option value="General Manager">General Manager</option>
                          <option value="Department Head">Department Head</option>
                          <option value="Outbound Incharge">Outbound Incharge</option>
                          <option value="Warehouse Ops Manager">Warehouse Ops Manager</option>
                          <option value="Warehouse Lead">Warehouse Lead</option>
                          <option value="Operations Lead">Operations Lead</option>
                          <option value="Unit Head">Unit Head</option>
                          <option value="Logistics Lead">Logistics Lead</option>
                          <option value="Head - WH & Logistics">Head - WH & Logistics</option>
                          <option value="CEO">CEO</option>
                          <option value="JMD">JMD</option>
                        </select>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* SECTION: STAGE-SPECIFIC VERIFICATION CHECKLIST */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <button 
                  type="button" 
                  onClick={() => setShowChecklistSection(!showChecklistSection)}
                  className="w-full flex items-center justify-between px-2.5 py-2 bg-indigo-50/70 hover:bg-indigo-100/70 border border-indigo-200 rounded-lg text-[11px] font-bold text-indigo-900 transition cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 text-indigo-600" />
                    <span>
                      Stage Verification Checklist ({(editingWorkflow.steps[configuringStepIndex].checklist_items || []).length} Points)
                    </span>
                  </div>
                  <span className="text-[9px] text-indigo-700 font-extrabold bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                    {showChecklistSection ? "▲ Hide" : "▼ View / Edit"}
                  </span>
                </button>

                {showChecklistSection && (
                  <div className="space-y-2.5 pt-1 animate-in fade-in duration-150 bg-slate-50/50 p-2.5 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-slate-500 font-medium">
                        Verification points that approvers must review and tick off before approving this stage.
                      </p>
                      {(editingWorkflow.steps[configuringStepIndex].checklist_items || []).length > 0 && (
                        <button
                          type="button"
                          onClick={() => updateStep(configuringStepIndex, 'checklist_items', [])}
                          className="text-[9px] text-rose-600 hover:underline font-bold"
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    {/* Input to add custom checklist item */}
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newStageChecklistText}
                        onChange={e => setNewStageChecklistText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addChecklistItemToConfiguringStep(newStageChecklistText);
                          }
                        }}
                        placeholder="Type custom verification requirement..."
                        className="flex-1 text-xs px-2.5 py-1.5 bg-white border border-slate-300 rounded-md focus:border-indigo-500 outline-none font-medium text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => addChecklistItemToConfiguringStep(newStageChecklistText)}
                        disabled={!newStageChecklistText.trim()}
                        className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-xs rounded-md transition shadow-xs flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add</span>
                      </button>
                    </div>

                    {/* Checklist Items List */}
                    <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                      {(!editingWorkflow.steps[configuringStepIndex].checklist_items || editingWorkflow.steps[configuringStepIndex].checklist_items.length === 0) ? (
                        <div className="p-2 border border-dashed border-slate-200 rounded-md text-center bg-white">
                          <ListChecks className="h-3.5 w-3.5 text-slate-400 mx-auto mb-0.5" />
                          <p className="text-[10px] font-bold text-slate-500">No checklist items added for this stage yet.</p>
                        </div>
                      ) : (
                        editingWorkflow.steps[configuringStepIndex].checklist_items.map((item, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex items-center justify-between p-1.5 bg-white hover:bg-indigo-50/40 border border-slate-200 rounded-md group transition-colors shadow-2xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 pr-1.5">
                              <span className="h-3.5 w-3.5 rounded bg-indigo-100 text-indigo-700 font-black text-[8px] flex items-center justify-center shrink-0">
                                {cIdx + 1}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-800 break-words">
                                {item}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeChecklistItemFromConfiguringStep(cIdx)}
                              className="p-0.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                              title="Remove item"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50 flex justify-end">
            <button type="button" onClick={() => setConfiguringStepIndex(null)} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-md shadow-xs transition-colors">
              Done
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
