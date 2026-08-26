import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckSquare, Plus, Edit2, Trash2, Search, Save, X, AlertTriangle, 
  ShieldCheck, CheckCircle2, RefreshCw, Filter, Layers, ChevronLeft, 
  ChevronRight, Sparkles, Copy, SlidersHorizontal, Eye, Tag, Building2, 
  MapPin, Check, ListChecks, ArrowRight, ShieldAlert
} from 'lucide-react';
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

export const getStageBadgeStyle = (stageName) => {
  const s = (stageName || '').toUpperCase();
  if (s.includes("ATTACHMENT")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (s.includes("FIRST")) return "bg-purple-50 text-purple-700 border-purple-200";
  if (s.includes("SECOND")) return "bg-indigo-50 text-indigo-700 border-indigo-200";
  if (s.includes("3RD") || s.includes("THIRD")) return "bg-amber-50 text-amber-800 border-amber-200";
  if (s.includes("IA")) return "bg-rose-50 text-rose-700 border-rose-200";
  if (s.includes("FINAL")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

export default function ChecklistConditionBuilder() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStageFilter, setSelectedStageFilter] = useState('ALL');
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [previewRule, setPreviewRule] = useState(null);

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

  const openEditor = (r = null, isDuplicate = false) => {
    if (r) {
      let parsedItems = [];
      const txt = (r.item_text || '').trim();
      if (txt.includes(' || ')) {
        parsedItems = txt.split(' || ').map(s => s.trim()).filter(Boolean);
      } else if (txt.includes('\n')) {
        parsedItems = txt.split('\n').map(s => s.trim()).filter(Boolean);
      } else if (txt.includes(',') && !(txt.includes('(') && txt.includes(')'))) {
        parsedItems = txt.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        parsedItems = txt ? [txt] : [];
      }
      setEditingRule({
        ...r,
        id: isDuplicate ? `tmp-${Date.now()}` : r.id,
        rule_name: isDuplicate ? `${r.rule_name} (Copy)` : r.rule_name,
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
        id: String(editingRule.id).startsWith('tmp-') ? null : editingRule.id,
        rule_name: editingRule.rule_name || `CHK_${editingRule.division}_${(editingRule.category || '').slice(0, 15)}`,
        division: editingRule.division || 'ALL',
        category: editingRule.category || 'ALL',
        branch: editingRule.branch || 'ALL',
        workflow_profile: editingRule.workflow_profile || 'ALL',
        stage_name: editingRule.stage_name || 'Attachment Status',
        item_text: (editingRule.itemsList || []).join(' || '),
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

  // Compute distinct filter options
  const distinctDivisions = useMemo(() => {
    return Array.from(new Set(rules.map(r => r.division).filter(Boolean))).sort();
  }, [rules]);

  const distinctCategories = useMemo(() => {
    return Array.from(new Set(rules.map(r => r.category).filter(Boolean))).sort();
  }, [rules]);

  const distinctBranches = useMemo(() => {
    return Array.from(new Set(rules.map(r => r.branch).filter(Boolean))).sort();
  }, [rules]);

  const stageCounts = useMemo(() => {
    const counts = { ALL: rules.length };
    STAGES_LIST.forEach(stg => { counts[stg] = 0; });
    rules.forEach(r => {
      if (r.stage_name && counts[r.stage_name] !== undefined) {
        counts[r.stage_name] += 1;
      }
    });
    return counts;
  }, [rules]);

  const mandatoryCount = useMemo(() => {
    return rules.filter(r => r.is_mandatory !== false).length;
  }, [rules]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || (
        (r.rule_name || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        (r.branch || '').toLowerCase().includes(q) ||
        (r.division || '').toLowerCase().includes(q) ||
        (r.item_text || '').toLowerCase().includes(q)
      );
      const matchesStage = (selectedStageFilter === 'ALL' || r.stage_name === selectedStageFilter);
      const matchesDivision = (selectedDivisionFilter === 'ALL' || r.division === selectedDivisionFilter);
      const matchesCategory = (selectedCategoryFilter === 'ALL' || r.category === selectedCategoryFilter);
      const matchesBranch = (selectedBranchFilter === 'ALL' || r.branch === selectedBranchFilter);
      return matchesSearch && matchesStage && matchesDivision && matchesCategory && matchesBranch;
    });
  }, [rules, searchQuery, selectedStageFilter, selectedDivisionFilter, selectedCategoryFilter, selectedBranchFilter]);

  const hasActiveFilters = searchQuery !== '' || selectedStageFilter !== 'ALL' || selectedDivisionFilter !== 'ALL' || selectedCategoryFilter !== 'ALL' || selectedBranchFilter !== 'ALL';

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedStageFilter('ALL');
    setSelectedDivisionFilter('ALL');
    setSelectedCategoryFilter('ALL');
    setSelectedBranchFilter('ALL');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedStageFilter, selectedDivisionFilter, selectedCategoryFilter, selectedBranchFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRules.length / itemsPerPage));
  const paginatedRules = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRules.slice(start, start + itemsPerPage);
  }, [filteredRules, currentPage]);

  const parseItems = (item_text) => {
    const txt = (item_text || '').trim();
    if (txt.includes(' || ')) return txt.split(' || ').map(s => s.trim()).filter(Boolean);
    if (txt.includes('\n')) return txt.split('\n').map(s => s.trim()).filter(Boolean);
    if (txt.includes(',') && !(txt.includes('(') && txt.includes(')'))) return txt.split(',').map(s => s.trim()).filter(Boolean);
    return txt ? [txt] : [];
  };

  return (
    <div className="flex flex-col gap-2.5 font-sans max-w-full">

      {/* COMPACT TOOLBAR & FILTERS */}
      <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-xs space-y-2.5">
        
        {/* Row 1: Title, Search, and Primary Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200/60 shrink-0">
              <CheckSquare className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs font-bold text-slate-800 tracking-tight leading-none">
                  Checklist Condition Matrix
                </h2>
                <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 text-[9px] font-semibold rounded border border-emerald-200/60 leading-none">
                  {filteredRules.length} of {rules.length} Rules
                </span>
              </div>
              <p className="text-[9.5px] text-slate-400 font-normal mt-0.5 leading-none">
                Stage verification requirements based on Division, Category, and Branch parameters.
              </p>
            </div>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Search Input */}
            <div className="relative w-44 sm:w-56">
              <Search className="absolute left-2 top-2 h-3 w-3 text-slate-400" />
              <input 
                type="text"
                placeholder="Search rule, category, item..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full text-[10.5px] pl-6.5 pr-5 py-1 h-7 bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-all font-normal placeholder:text-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-1.5 top-1.5 text-slate-400 hover:text-slate-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchChecklistRules}
              disabled={loading}
              className="p-1 h-7 w-7 flex items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-md transition shadow-3xs cursor-pointer"
              title="Refresh Rules"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>

            {/* Create Rule */}
            <button 
              onClick={() => openEditor(null)}
              className="flex items-center gap-1 px-2.5 py-1 h-7 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10.5px] rounded-md shadow-3xs transition-all cursor-pointer shrink-0"
            >
              <Plus className="h-3 w-3" /> New Rule
            </button>
          </div>
        </div>

        {/* Row 2: Stage Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 custom-scrollbar border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={() => setSelectedStageFilter('ALL')}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
              selectedStageFilter === 'ALL'
                ? "bg-slate-800 text-white shadow-3xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60"
            }`}
          >
            <span>All Stages</span>
            <span className={`px-1 py-0.2 rounded text-[8.5px] font-bold ${
              selectedStageFilter === 'ALL' ? "bg-slate-700 text-white" : "bg-slate-200 text-slate-700"
            }`}>
              {stageCounts.ALL || 0}
            </span>
          </button>
          {STAGES_LIST.map(stg => {
            const active = selectedStageFilter === stg;
            return (
              <button
                key={stg}
                type="button"
                onClick={() => setSelectedStageFilter(stg)}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                  active
                    ? "bg-blue-600 text-white font-semibold shadow-3xs"
                    : "bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{stg}</span>
                <span className={`px-1 py-0.2 rounded text-[8.5px] font-bold ${
                  active ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-700 border border-blue-100"
                }`}>
                  {stageCounts[stg] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 3: Compact Dropdown Filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1.5 border-t border-slate-100 text-[10px]">
          <div>
            <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Stage
            </label>
            <select 
              value={selectedStageFilter}
              onChange={e => setSelectedStageFilter(e.target.value)}
              className="w-full text-[10.5px] py-1 px-1.5 h-7 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition"
            >
              <option value="ALL">All Stages ({rules.length})</option>
              {STAGES_LIST.map(stg => (
                <option key={stg} value={stg}>{stg} ({stageCounts[stg] || 0})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Category / Doc Type
            </label>
            <select 
              value={selectedCategoryFilter}
              onChange={e => setSelectedCategoryFilter(e.target.value)}
              className="w-full text-[10.5px] py-1 px-1.5 h-7 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition truncate"
            >
              <option value="ALL">All Categories ({distinctCategories.length})</option>
              {distinctCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Branch / Plant
            </label>
            <select 
              value={selectedBranchFilter}
              onChange={e => setSelectedBranchFilter(e.target.value)}
              className="w-full text-[10.5px] py-1 px-1.5 h-7 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition truncate"
            >
              <option value="ALL">All Branches ({distinctBranches.length})</option>
              {distinctBranches.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Company / Division
            </label>
            <select 
              value={selectedDivisionFilter}
              onChange={e => setSelectedDivisionFilter(e.target.value)}
              className="w-full text-[10.5px] py-1 px-1.5 h-7 bg-slate-50 border border-slate-200 rounded-md font-medium text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition"
            >
              <option value="ALL">All Divisions ({distinctDivisions.length})</option>
              {distinctDivisions.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100 text-slate-500">
            <span>Showing {filteredRules.length} of {rules.length} filtered rules.</span>
            <button 
              onClick={resetAllFilters}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 text-[10px] cursor-pointer"
            >
              <X className="h-3 w-3" /> Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* COMPACT DATA TABLE */}
      <div className="bg-white border border-slate-200/80 rounded-lg shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-x-auto min-w-full">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[9px] font-bold text-slate-500 uppercase tracking-wider select-none">
                <th className="px-3.5 py-2 w-[22%]">Rule Name</th>
                <th className="px-2.5 py-2 w-[9%]">Division</th>
                <th className="px-2.5 py-2 w-[20%]">Category</th>
                <th className="px-2.5 py-2 w-[14%]">Branch</th>
                <th className="px-2.5 py-2 w-[14%]">Stage</th>
                <th className="px-2.5 py-2 w-[15%]">Checklist Items</th>
                <th className="px-2.5 py-2 w-[6%] text-right pr-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10.5px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                    <RefreshCw className="h-3.5 w-3.5 animate-spin inline mr-1.5 text-emerald-600" />
                    Loading rules...
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <div className="max-w-xs mx-auto flex flex-col items-center">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-1.5">
                        <Search className="h-4 w-4" />
                      </div>
                      <p className="font-semibold text-slate-700 text-xs">No matching rules</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Try clearing filters or search terms.</p>
                      {hasActiveFilters && (
                        <button 
                          onClick={resetAllFilters} 
                          className="mt-2 px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-[10px] rounded transition"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedRules.map((r, idx) => {
                  const items = parseItems(r.item_text);
                  return (
                    <tr key={r.id || idx} className="hover:bg-slate-50/70 transition-colors group">
                      
                      {/* Rule Name */}
                      <td className="px-3.5 py-2 align-middle font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[170px]" title={r.rule_name}>{r.rule_name}</span>
                          {r.is_mandatory !== false ? (
                            <span className="text-[7.5px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/60 shrink-0">
                              REQ
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Division */}
                      <td className="px-2.5 py-2 align-middle">
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 text-[9.5px]">
                          {r.division || 'ALL'}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="px-2.5 py-2 align-middle font-medium text-slate-700">
                        <span className="truncate max-w-[180px] block" title={r.category}>
                          {r.category || 'ALL'}
                        </span>
                      </td>

                      {/* Branch */}
                      <td className="px-2.5 py-2 align-middle text-slate-600">
                        <span className="truncate max-w-[130px] block" title={r.branch}>
                          {r.branch === 'ALL' || !r.branch ? (
                            <span className="text-slate-400 italic">All</span>
                          ) : (
                            r.branch
                          )}
                        </span>
                      </td>

                      {/* Stage Name */}
                      <td className="px-2.5 py-2 align-middle">
                        <span className={`font-medium px-2 py-0.5 rounded border text-[9.5px] whitespace-nowrap shadow-3xs ${getStageBadgeStyle(r.stage_name)}`}>
                          {r.stage_name || 'Attachment Status'}
                        </span>
                      </td>

                      {/* Checklist Items Preview */}
                      <td className="px-2.5 py-2 align-middle">
                        <div className="flex items-center gap-1 max-w-[200px]">
                          {items.slice(0, 1).map((it, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-normal border border-slate-200/70 truncate max-w-[110px]" title={it}>
                              ✓ {it}
                            </span>
                          ))}
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setPreviewRule(r)}
                              className="px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[9px] font-semibold border border-emerald-200/60 transition cursor-pointer shrink-0"
                              title="Click to view all checklist items"
                            >
                              +{items.length - 1} more
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-2.5 py-2 align-middle text-right pr-3.5">
                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openEditor(r, false)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button 
                            onClick={() => openEditor(r, true)}
                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition cursor-pointer"
                            title="Duplicate"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button 
                            onClick={() => setDeleteConfirmTarget(r.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
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

        {/* COMPACT PAGINATION */}
        {filteredRules.length > 0 && (
          <div className="p-2.5 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px]">
            <div className="text-slate-500">
              Showing <strong className="text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</strong>–<strong className="text-slate-700">{Math.min(currentPage * itemsPerPage, filteredRules.length)}</strong> of <strong className="text-slate-700">{filteredRules.length}</strong> rules
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600 font-medium hover:bg-slate-100 disabled:opacity-40 transition flex items-center gap-0.5 cursor-pointer"
              >
                <ChevronLeft className="h-3 w-3" />
                <span>Prev</span>
              </button>

              <div className="flex items-center gap-1 px-2">
                <span className="font-semibold text-slate-700">{currentPage}</span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-400">{totalPages}</span>
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-0.5 rounded border border-slate-200 bg-white text-slate-600 font-medium hover:bg-slate-100 disabled:opacity-40 transition flex items-center gap-0.5 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QUICK PREVIEW CHECKLIST MODAL */}
      {previewRule && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60">
                  <CheckSquare className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{previewRule.rule_name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`px-2 py-0.2 rounded border text-[10px] font-bold ${getStageBadgeStyle(previewRule.stage_name)}`}>
                      {previewRule.stage_name}
                    </span>
                    <span className="text-[10.5px] text-slate-500 font-medium">({previewRule.division} • {previewRule.category})</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setPreviewRule(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2 max-h-[60vh]">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Mandatory Verification Items ({parseItems(previewRule.item_text).length})
              </span>
              {parseItems(previewRule.item_text).map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-slate-800">{item}</span>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button 
                onClick={() => {
                  const target = previewRule;
                  setPreviewRule(null);
                  openEditor(target);
                }}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit This Rule
              </button>
              <button 
                onClick={() => setPreviewRule(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT CHECKLIST RULE MODAL */}
      {editingRule && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckSquare className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {String(editingRule.id).startsWith('tmp-') ? 'Create Checklist Condition Rule' : 'Edit Checklist Condition Rule'}
                  </h3>
                  <p className="text-[10.5px] text-slate-500">Configure stage-specific verification checkpoints</p>
                </div>
              </div>
              <button onClick={() => setEditingRule(null)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveRule} className="p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              
              {/* SECTION 1: MATCHING CRITERIA */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                  1. Matching Criteria (Conditions)
                </span>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Rule Name <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text"
                      value={editingRule.rule_name}
                      onChange={e => setEditingRule({ ...editingRule, rule_name: e.target.value })}
                      placeholder="e.g. CHK_ACM_GRN_Header"
                      required
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Stage Name <span className="text-rose-500">*</span>
                    </label>
                    <select 
                      value={editingRule.stage_name}
                      onChange={e => setEditingRule({ ...editingRule, stage_name: e.target.value })}
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-bold text-blue-700 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      {STAGES_LIST.map(stg => (
                        <option key={stg} value={stg}>{stg}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Company / Division
                    </label>
                    <input 
                      list="divisions-list"
                      value={editingRule.division}
                      onChange={e => setEditingRule({ ...editingRule, division: e.target.value })}
                      placeholder="e.g. ACC, ACM, VCC, ALL..."
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Category / Document Type
                    </label>
                    <input 
                      list="categories-list"
                      value={editingRule.category}
                      onChange={e => setEditingRule({ ...editingRule, category: e.target.value })}
                      placeholder="e.g. GRN Header, Freight Charges, ALL..."
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Branch / Plant Location (Comma separated or ALL)
                    </label>
                    <input 
                      list="branches-list"
                      value={editingRule.branch}
                      onChange={e => setEditingRule({ ...editingRule, branch: e.target.value })}
                      placeholder="e.g. TN-CBE-PROZONE-MALL, TN-OOTY, ALL..."
                      className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: CHECKLIST ITEMS */}
              <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                    2. Verification Checklist Items ({(editingRule.itemsList || []).length})
                  </span>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={editingRule.is_mandatory !== false}
                      onChange={e => setEditingRule({ ...editingRule, is_mandatory: e.target.checked })}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    Mandatory for Approval
                  </label>
                </div>

                {/* Add Item Input */}
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={newChecklistText}
                    onChange={e => setNewChecklistText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(newChecklistText); } }}
                    placeholder="Type new verification requirement (e.g. Verify Seal and Signature)..."
                    className="flex-1 text-xs p-2 border border-slate-200 rounded-lg bg-white font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <button 
                    type="button"
                    onClick={() => addChecklistItem(newChecklistText)}
                    disabled={!newChecklistText.trim()}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs disabled:opacity-50 cursor-pointer shrink-0 transition"
                  >
                    + Add Item
                  </button>
                </div>

                {/* Current Items List */}
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                  {(editingRule.itemsList || []).length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs italic bg-white rounded-lg border border-slate-200">
                      No checklist items added yet. Pick from the presets below or type above.
                    </div>
                  ) : (
                    editingRule.itemsList.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-3xs group">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="text-xs font-medium text-slate-800">{item}</span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => removeChecklistItem(idx)}
                          className="p-1 text-rose-400 hover:text-rose-600 rounded transition cursor-pointer"
                          title="Remove Item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Quick Insert from Master Library */}
                <div className="pt-2.5 border-t border-slate-200/80">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">
                    Quick Pick from Master Checklist Library:
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                    {MASTER_CHECKLIST_LIBRARY.map((libItem, idx) => (
                      <button 
                        key={idx}
                        type="button"
                        onClick={() => addChecklistItem(libItem)}
                        className="text-[9px] font-bold text-slate-700 hover:text-emerald-700 bg-white hover:bg-emerald-50 px-2 py-1 rounded-md border border-slate-200/80 transition-colors shadow-3xs cursor-pointer"
                      >
                        + {libItem}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-2.5 pt-2">
                <button 
                  type="button" 
                  onClick={() => setEditingRule(null)} 
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving || (editingRule.itemsList || []).length === 0}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs overflow-hidden p-5 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="h-10 w-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm mb-1">Delete Checklist Rule</h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Are you sure you want to delete this checklist rule? This cannot be undone.
            </p>
            <div className="flex w-full gap-2">
              <button 
                type="button" 
                onClick={() => setDeleteConfirmTarget(null)} 
                className="flex-1 px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                type="button" 
                onClick={handleDeleteRule} 
                className="flex-1 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
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
