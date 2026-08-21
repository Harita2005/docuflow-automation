import React, { useState, useEffect } from 'react';
import { CheckSquare, Plus, Edit2, Trash2, Search, Save, X, AlertTriangle, ShieldCheck, CheckCircle2, RefreshCw, Filter, Layers } from 'lucide-react';
import matrixOptions from '../matrix_options.json';

const MASTER_CHECKLIST_LIBRARY = [
  "Documents Attached",
  "Bill Name Verified",
  "Bill Address Verified",
  "Bill Date Verified",
  "FCT Period Verified",
  "Party Name & Total Amount Verified",
  "Bill Amount Verified",
  "Tax portion verified (GST, TDS, etc..)",
  "PO Ref Number, Quantity",
  "GRN Number, Quantity",
  "Gate Inward, GRN, Debit/Credit Note Verified",
  "RO/PO Verified",
  "Bundle Quantity",
  "Invoice Quantity, DC Quantity",
  "SAP Entry ( DR/CR & GL , COST CENTER ) Verified",
  "Vendor GST no, Signaure Verified",
  "Advance, Narration, Supportive Copy (If Any)",
  "Security Checking Slip",
  "Security Seal and Signature",
  "Signatures",
  "Total Value",
  "Gofrugal Entry with narration Verified",
  "Debit/Credit Note Verified"
];

const STAGES_LIST = [
  "Attachment Status",
  "First Approval",
  "Second Approval",
  "3rd APPROVAL",
  "IA Approval",
  "Final Approval"
];

export default function ChecklistConditionBuilder() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStageFilter, setSelectedStageFilter] = useState('ALL');
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState('ALL');

  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [reSyncing, setReSyncing] = useState(false);

  // Modal item input state
  const [newChecklistText, setNewChecklistText] = useState('');

  const fetchChecklistRules = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch('/api/admin/checklist-rules', { headers });
      if (res.ok) {
        const data = await res.json();
        setRules(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to fetch checklist rules:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchChecklistRules();
  }, []);

  const openEditor = (r = null) => {
    if (r) {
      const parsedItems = (r.item_text || '').split(',').map(s => s.trim()).filter(Boolean);
      setEditingRule({
        ...r,
        itemsList: parsedItems.length > 0 ? parsedItems : ['Documents Attached']
      });
    } else {
      setEditingRule({
        id: `tmp-${Date.now()}`,
        rule_name: '',
        division: 'ALL',
        category: 'ALL',
        branch: 'ALL',
        workflow_profile: 'ALL',
        stage_name: 'Attachment Status',
        itemsList: ['Documents Attached', 'Bill Name Verified', 'Bill Date Verified'],
        is_mandatory: true,
        is_active: true,
        sequence_order: rules.length + 1
      });
    }
    setNewChecklistText('');
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    if (!editingRule) return;

    setSaving(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const payload = {
        id: editingRule.id,
        rule_name: editingRule.rule_name || `CHK_${editingRule.division}_${(editingRule.category || '').slice(0, 15)}`,
        division: editingRule.division || 'ALL',
        category: editingRule.category || 'ALL',
        branch: editingRule.branch || 'ALL',
        workflow_profile: editingRule.workflow_profile || 'ALL',
        stage_name: editingRule.stage_name || 'Attachment Status',
        item_text: (editingRule.itemsList || []).join(', '),
        is_mandatory: editingRule.is_mandatory !== false,
        is_active: editingRule.is_active !== false,
        sequence_order: editingRule.sequence_order || 1
      };

      const res = await fetch('/api/admin/checklist-rules', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchChecklistRules();
        setEditingRule(null);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed to save checklist rule: ${err.detail || 'Server error'}`);
      }
    } catch (e) {
      console.error(e);
      alert('Error saving checklist rule');
    }
    setSaving(false);
  };

  const handleDeleteRule = async () => {
    if (!deleteConfirmTarget) return;
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      await fetch(`/api/admin/checklist-rules/${deleteConfirmTarget}`, {
        method: 'DELETE',
        headers
      });
      await fetchChecklistRules();
      setDeleteConfirmTarget(null);
    } catch (e) {
      console.error(e);
    }
  };

  const addChecklistItem = (text) => {
    if (!text || !text.trim()) return;
    const clean = text.trim();
    if (!editingRule.itemsList.includes(clean)) {
      setEditingRule({
        ...editingRule,
        itemsList: [...editingRule.itemsList, clean]
      });
    }
    setNewChecklistText('');
  };

  const removeChecklistItem = (idx) => {
    setEditingRule({
      ...editingRule,
      itemsList: editingRule.itemsList.filter((_, i) => i !== idx)
    });
  };

  // Filtered Rules
  const filteredRules = rules.filter(r => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (
      (r.rule_name || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q) ||
      (r.branch || '').toLowerCase().includes(q) ||
      (r.division || '').toLowerCase().includes(q) ||
      (r.item_text || '').toLowerCase().includes(q)
    );
    const matchesStage = (selectedStageFilter === 'ALL' || r.stage_name === selectedStageFilter);
    const matchesDivision = (selectedDivisionFilter === 'ALL' || r.division === selectedDivisionFilter);
    return matchesSearch && matchesStage && matchesDivision;
  });

  const distinctDivisions = Array.from(new Set(rules.map(r => r.division).filter(Boolean))).sort();

  return (
    <div className="flex flex-col gap-4">
      {/* HEADER CONTROLS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white px-4 py-3 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-3xs">
            <CheckSquare className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <span>Checklist Condition Matrix</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                {rules.length} Rules Active
              </span>
            </h2>
            <p className="text-[10.5px] text-slate-500 font-medium mt-0.5">
              Defines dynamic stage verification requirements: <code className="text-blue-600 font-bold">Company == X AND Doc Type == Y AND Stage == Z → Checklist Items</code> (Cascading Priority over Workflow Defaults)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* SEARCH */}
          <div className="relative w-48 sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search doc type, branch, items..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* STAGE FILTER */}
          <select 
            value={selectedStageFilter}
            onChange={e => setSelectedStageFilter(e.target.value)}
            className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Stages</option>
            {STAGES_LIST.map(stg => (
              <option key={stg} value={stg}>{stg}</option>
            ))}
          </select>

          {/* DIVISION FILTER */}
          <select 
            value={selectedDivisionFilter}
            onChange={e => setSelectedDivisionFilter(e.target.value)}
            className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="ALL">All Divisions</option>
            {distinctDivisions.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* CREATE RULE */}
          <button 
            onClick={() => openEditor(null)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wide rounded-lg transition-colors shadow-sm cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" /> Create Checklist Rule
          </button>
        </div>
      </div>

      {/* CHECKLIST RULES DATA TABLE */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-w-full">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[9.5px] font-bold text-slate-500 uppercase tracking-wider select-none">
                <th className="px-4 py-3 w-[18%]">Rule / Condition Name</th>
                <th className="px-3.5 py-3 w-[12%]">Division</th>
                <th className="px-3.5 py-3 w-[18%]">Doc Type / Category</th>
                <th className="px-3.5 py-3 w-[14%]">Branch / Plant</th>
                <th className="px-3.5 py-3 w-[14%]">Stage Name</th>
                <th className="px-3.5 py-3 w-[18%]">Checklist Items</th>
                <th className="px-3.5 py-3 w-[6%] text-right pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-slate-400 italic">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2 text-emerald-600" />
                    Loading Checklist Conditions...
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-slate-400 italic">
                    No matching checklist condition rules found.
                  </td>
                </tr>
              ) : (
                filteredRules.map((r, idx) => {
                  const items = (r.item_text || '').split(',').map(s => s.trim()).filter(Boolean);
                  return (
                    <tr key={r.id || idx} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Rule Name */}
                      <td className="px-4 py-3 align-top font-bold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[150px]" title={r.rule_name}>{r.rule_name}</span>
                        </div>
                        {r.is_mandatory && (
                          <span className="inline-block mt-1 text-[8px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            MANDATORY
                          </span>
                        )}
                      </td>

                      {/* Division */}
                      <td className="px-3.5 py-3 align-top">
                        <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 text-[10px]">
                          {r.division || 'ALL'}
                        </span>
                      </td>

                      {/* Category / Doc Type */}
                      <td className="px-3.5 py-3 align-top font-semibold text-slate-900">
                        <span className="truncate max-w-[160px] block" title={r.category}>
                          {r.category || 'ALL'}
                        </span>
                      </td>

                      {/* Branch */}
                      <td className="px-3.5 py-3 align-top font-medium text-slate-700">
                        <span className="truncate max-w-[130px] block" title={r.branch}>
                          {r.branch === 'ALL' ? <span className="text-slate-400 italic">All Branches</span> : r.branch}
                        </span>
                      </td>

                      {/* Stage Name */}
                      <td className="px-3.5 py-3 align-top">
                        <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 text-[10px]">
                          {r.stage_name || 'Attachment Status'}
                        </span>
                      </td>

                      {/* Checklist Items */}
                      <td className="px-3.5 py-3 align-top">
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {items.slice(0, 3).map((it, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[9px] font-medium border border-slate-200 truncate max-w-[130px]" title={it}>
                              ✓ {it}
                            </span>
                          ))}
                          {items.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[9px] font-bold border border-emerald-100">
                              +{items.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-3 align-top text-right pr-4">
                        <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEditor(r)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit Rule"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmTarget(r.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete Rule"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* ADD / EDIT CHECKLIST RULE MODAL */}
      {editingRule && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckSquare className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm tracking-wide">
                    {String(editingRule.id).startsWith('tmp-') ? 'Create Checklist Condition Rule' : 'Edit Checklist Condition Rule'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">Attach verification points based on stage and document parameters</p>
                </div>
              </div>
              <button onClick={() => setEditingRule(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveRule} className="p-5 overflow-y-auto space-y-4 flex-1">
              
              {/* SECTION 1: RULE & CONDITIONS */}
              <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block">
                  1. Matching Parameters (Conditions)
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Rule Name <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text"
                      value={editingRule.rule_name}
                      onChange={e => setEditingRule({ ...editingRule, rule_name: e.target.value })}
                      placeholder="e.g. CHK_ACM_GRN_Header"
                      required
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-bold text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Stage Name <span className="text-rose-500">*</span>
                    </label>
                    <select 
                      value={editingRule.stage_name}
                      onChange={e => setEditingRule({ ...editingRule, stage_name: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-bold text-blue-700 outline-none focus:border-emerald-500"
                    >
                      {STAGES_LIST.map(stg => (
                        <option key={stg} value={stg}>{stg}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Division (Company)
                    </label>
                    <input 
                      list="divisions-list"
                      value={editingRule.division}
                      onChange={e => setEditingRule({ ...editingRule, division: e.target.value })}
                      placeholder="e.g. ACC, ACM, VCC, ALL..."
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Doc Type / Category
                    </label>
                    <input 
                      list="categories-list"
                      value={editingRule.category}
                      onChange={e => setEditingRule({ ...editingRule, category: e.target.value })}
                      placeholder="e.g. GRN Header, Freight Charges, ALL..."
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Branch / Plant (Comma separated or ALL)
                    </label>
                    <input 
                      list="branches-list"
                      value={editingRule.branch}
                      onChange={e => setEditingRule({ ...editingRule, branch: e.target.value })}
                      placeholder="e.g. TN-CBE-PROZONE-MALL, TN-OOTY, ALL..."
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium text-slate-800 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: CHECKLIST ITEMS */}
              <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block">
                    2. Verification Checklist Items ({(editingRule.itemsList || []).length})
                  </span>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={editingRule.is_mandatory}
                      onChange={e => setEditingRule({ ...editingRule, is_mandatory: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    Mandatory for Stage Approval
                  </label>
                </div>

                {/* Add Item Input */}
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={newChecklistText}
                    onChange={e => setNewChecklistText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(newChecklistText); } }}
                    placeholder="Type new checklist requirement (e.g. Verify Seal and Signature)..."
                    className="flex-1 text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium outline-none focus:border-emerald-500"
                  />
                  <button 
                    type="button"
                    onClick={() => addChecklistItem(newChecklistText)}
                    disabled={!newChecklistText.trim()}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    + Add Item
                  </button>
                </div>

                {/* Current Items List */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(editingRule.itemsList || []).length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs italic bg-white rounded-lg border border-slate-200">
                      No checklist items added yet.
                    </div>
                  ) : (
                    editingRule.itemsList.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 shadow-3xs group">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-semibold text-slate-800">{item}</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => removeChecklistItem(idx)}
                          className="p-1 text-rose-400 hover:text-rose-600 rounded transition cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Master Library Presets */}
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[8.5px] font-extrabold text-slate-400 uppercase tracking-widest block mb-1.5">
                    Quick Insert from SD Master Library:
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {MASTER_CHECKLIST_LIBRARY.map((libItem, idx) => (
                      <button 
                        key={idx}
                        type="button"
                        onClick={() => addChecklistItem(libItem)}
                        className="text-[8.5px] font-bold text-slate-600 hover:text-emerald-700 bg-white hover:bg-emerald-50 px-2 py-0.5 rounded border border-slate-200 transition-colors shadow-3xs cursor-pointer"
                      >
                        + {libItem}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => setEditingRule(null)} 
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving || (editingRule.itemsList || []).length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Checklist Rule'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs overflow-hidden p-5 text-center">
            <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="font-black text-slate-900 text-base mb-1.5">Delete Checklist Rule</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Are you sure you want to delete this checklist rule?
            </p>
            <div className="flex w-full gap-2.5">
              <button 
                type="button" 
                onClick={() => setDeleteConfirmTarget(null)} 
                className="flex-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleDeleteRule} 
                className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DATALISTS FOR AUTOCOMPLETE */}
      <datalist id="divisions-list">
        {(matrixOptions?.divisions || ['ACC', 'ACM', 'ATC', 'ENES', 'RR', 'RRF', 'RHL', 'AKG', 'VT', 'VG', 'VPM', 'TARA', 'VCC', 'ALL']).map(d => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <datalist id="categories-list">
        {(matrixOptions?.categories || ['GRN Header', 'Freight Charges', 'Interstate GST12% Purchase', 'Interstate GST18% Purchase', 'Asset Purchase', 'AP INVOICE', 'CAPEX', 'OPEX', 'ALL']).map(c => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <datalist id="branches-list">
        {(matrixOptions?.plants || ['TN-CBE-PROZONE-MALL', 'TN-OOTY', 'TN-SIVAKASI', 'TN-NAGERCOIL', 'TN-UDUMALPET', 'ANTS', 'MKT_MDU', 'ALL']).map(b => (
          <option key={b} value={b} />
        ))}
      </datalist>

    </div>
  );
}
