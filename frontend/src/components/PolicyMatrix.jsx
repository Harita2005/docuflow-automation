import React, { useState } from 'react';
import { Save, Plus, ArrowRight, Settings2, Trash2, Play, AlertTriangle, CheckCircle, ShieldAlert, Sparkles, X, ChevronRight, RefreshCw, Eye } from 'lucide-react';

export default function PolicyMatrix({ rules, setRules, setHasChanges, steps, setActiveTab }) {
  const [editingId, setEditingId] = useState(null);
  
  // Simulator State
  const [showSimulator, setShowSimulator] = useState(false);
  const [simDivision, setSimDivision] = useState('VCC');
  const [simPlant, setSimPlant] = useState('TN-SIVAKASI');
  const [simCategory, setSimCategory] = useState('PURCHASE');
  const [simDocType, setSimDocType] = useState('AP INVOICE');
  const [simAmount, setSimAmount] = useState('185000');
  const [simVendor, setSimVendor] = useState('Larsen & Toubro Electrical Ltd');
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // Conflict Detector State
  const [showConflicts, setShowConflicts] = useState(false);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictReport, setConflictReport] = useState(null);

  // Run Rule Simulation
  const handleRunSimulation = async () => {
    setSimLoading(true);
    try {
      const res = await fetch('/api/admin/rules/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          division: simDivision,
          plant: simPlant,
          category: simCategory,
          document_type: simDocType,
          amount: parseFloat(simAmount || 0),
          vendor_name: simVendor,
          draft_rules: rules.filter(r => String(r.id).startsWith('tmp-'))
        })
      });
      const data = await res.json();
      setSimResult(data);
    } catch (e) {
      console.error("Simulation failed:", e);
    } finally {
      setSimLoading(false);
    }
  };

  // Run Conflict Detector
  const handleRunConflictDetector = async () => {
    setConflictLoading(true);
    setShowConflicts(true);
    try {
      const res = await fetch('/api/admin/rules/detect-conflicts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules })
      });
      const data = await res.json();
      setConflictReport(data);
    } catch (e) {
      console.error("Conflict check failed:", e);
    } finally {
      setConflictLoading(false);
    }
  };
  
  // Create a new rule
  const handleAddNew = () => {
    const newRule = {
      id: `tmp-${Date.now()}`,
      priority: (rules.length + 1) * 10,
      rule_name: `New Rule ${rules.length + 1}`,
      conditions_json: JSON.stringify([]),
      target_workflow_id: steps.length > 0 ? steps[0].profile_name : '',
      document_type: 'Any'
    };
    setRules([...rules, newRule]);
    setEditingId(newRule.id);
    setHasChanges(true);
  };

  const updateRuleCondition = (ruleId, field, operator, value) => {
    setRules(rules.map(r => {
      if (r.id !== ruleId) return r;
      
      let conditions = [];
      try { conditions = JSON.parse(r.conditions_json); } catch(e) {}
      
      // Update or add condition
      const existingIdx = conditions.findIndex(c => c.field === field);
      if (value) {
        if (existingIdx >= 0) {
          conditions[existingIdx] = { ...conditions[existingIdx], operator, value };
        } else {
          conditions.push({ field, operator, value, logicalOperator: 'AND' });
        }
      } else {
        // Remove condition if value is cleared
        if (existingIdx >= 0) conditions.splice(existingIdx, 1);
      }
      
      return { ...r, conditions_json: JSON.stringify(conditions) };
    }));
    setHasChanges(true);
  };

  const updateRuleName = (ruleId, name) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, rule_name: name } : r));
    setHasChanges(true);
  };

  const updateRuleFlow = (ruleId, flowName) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, target_workflow_id: flowName } : r));
    setHasChanges(true);
  };
  
  const getConditionValue = (rule, field) => {
    try {
      const conditions = JSON.parse(rule.conditions_json);
      const cond = conditions.find(c => c.field === field);
      return cond ? cond.value : '';
    } catch(e) { return ''; }
  };

  // Group workflows by unique profile_name
  const uniqueWorkflows = [...new Set(steps.map(s => s.profile_name))].filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header with Simulator and Conflict Detector Triggers */}
      <div className="flex flex-wrap justify-between items-center mb-4 mt-2 gap-2">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-indigo-600" />
          Condition Policy Matrix ({rules.length} Active Rules)
        </h2>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSimulator(true); handleRunSimulation(); }}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
          >
            <Play className="h-3.5 w-3.5 fill-emerald-600 text-emerald-600" /> Dry-Run Simulator
          </button>

          <button
            onClick={handleRunConflictDetector}
            className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Detect Conflicts
          </button>

          <button 
            onClick={handleAddNew}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add Policy
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. INTERACTIVE DRY-RUN SIMULATOR MODAL */}
      {/* ========================================================================= */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <h3 className="font-bold text-sm">Policy Matrix Dry-Run Simulator</h3>
              </div>
              <button 
                onClick={() => setShowSimulator(false)}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs">
              <p className="text-slate-600 text-xs">
                Test how a hypothetical document will route through your business rules matrix and view stage approver assignments before publishing.
              </p>

              {/* Simulation Input Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Division</label>
                  <select 
                    value={simDivision} 
                    onChange={(e) => setSimDivision(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs outline-none focus:border-emerald-500"
                  >
                    <option value="VCC">VCC (V-Care Stores)</option>
                    <option value="ACC">ACC (Ramraj Cotton)</option>
                    <option value="ENES">ENES Textile Mills</option>
                    <option value="EIC">EIC Garments</option>
                    <option value="RCH">RCH Fabrics</option>
                    <option value="RMPL">RMPL Processing</option>
                    <option value="ACM">ACM Spinning</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Plant / Branch</label>
                  <input 
                    type="text" 
                    value={simPlant}
                    onChange={(e) => setSimPlant(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs outline-none focus:border-emerald-500"
                    placeholder="e.g. TN-SIVAKASI"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Category</label>
                  <input 
                    type="text" 
                    value={simCategory}
                    onChange={(e) => setSimCategory(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs outline-none focus:border-emerald-500"
                    placeholder="e.g. PURCHASE, UTILITY, ASSET"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Document Type</label>
                  <input 
                    type="text" 
                    value={simDocType}
                    onChange={(e) => setSimDocType(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs outline-none focus:border-emerald-500"
                    placeholder="e.g. AP INVOICE"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Invoice Amount (₹)</label>
                  <input 
                    type="number" 
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs outline-none focus:border-emerald-500"
                    placeholder="e.g. 185000"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Vendor Name</label>
                  <input 
                    type="text" 
                    value={simVendor}
                    onChange={(e) => setSimVendor(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-semibold text-xs outline-none focus:border-emerald-500"
                    placeholder="e.g. Larsen & Toubro"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleRunSimulation}
                  disabled={simLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-sm transition"
                >
                  {simLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-white" />}
                  Evaluate Rules Matrix
                </button>
              </div>

              {/* Simulation Result Box */}
              {simResult && (
                <div className="mt-3 space-y-3 pt-3 border-t border-slate-200">
                  {simResult.matched ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-emerald-600" />
                          <span className="font-extrabold text-sm text-emerald-950">
                            Matched Rule: {simResult.matched_rule?.rule_name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded">
                          Priority {simResult.matched_rule?.priority}
                        </span>
                      </div>

                      <p className="text-xs text-emerald-800">
                        <strong>Target Workflow:</strong> <span className="font-mono font-bold text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded">{simResult.target_workflow}</span>
                      </p>

                      {/* Stage Approver Pipeline */}
                      {simResult.stages && simResult.stages.length > 0 && (
                        <div className="mt-3 space-y-1.5 pt-2 border-t border-emerald-200/80">
                          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                            Resolved Multi-Stage Approver Pipeline ({simResult.stages.length} Stages):
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                            {simResult.stages.map((st, sIdx) => (
                              <div key={sIdx} className="bg-white/90 p-2.5 rounded-lg border border-emerald-200 text-slate-700 space-y-1 shadow-2xs">
                                <div className="flex justify-between items-center font-bold text-xs text-emerald-900">
                                  <span>Stage {st.stage_number}: {st.step_name}</span>
                                </div>
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {st.approver_pool && st.approver_pool.map((mem, mIdx) => (
                                    <span key={mIdx} className="text-[9.5px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-semibold border border-emerald-200">
                                      {mem}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                      <p className="font-bold">⚠️ No specific business rule matched this document.</p>
                      <p className="text-xs text-amber-700 mt-1">
                        System will fallback to standard default workflow <code className="bg-amber-100 px-1 rounded">VCC_PURCHASE_SR10</code>.
                      </p>
                    </div>
                  )}

                  {/* Evaluation Trace Details */}
                  {simResult.trace && simResult.trace.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Rule Evaluation Trace (Top {simResult.trace.length} Scanned):
                      </span>
                      <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg p-2 bg-slate-50">
                        {simResult.trace.map((tr, tIdx) => (
                          <div key={tIdx} className={`p-1.5 rounded text-[10.5px] flex items-center justify-between font-mono ${tr.matched ? "bg-emerald-100/70 text-emerald-900 font-bold" : "text-slate-600"}`}>
                            <div className="flex items-center gap-1.5">
                              <span>{tr.matched ? "✅" : "❌"}</span>
                              <span>{tr.rule_name} (Priority {tr.priority})</span>
                            </div>
                            <span className="text-[9px] text-slate-500 font-sans">{tr.matched ? "MATCHED" : "Conditions unmet"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CONFLICT & OVERLAP DETECTOR MODAL */}
      {/* ========================================================================= */}
      {showConflicts && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-amber-600 to-orange-700 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                <h3 className="font-bold text-sm">Policy Matrix Conflict & Overlap Diagnostic</h3>
              </div>
              <button 
                onClick={() => setShowConflicts(false)}
                className="text-white/80 hover:text-white p-1 rounded-md hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-3 custom-scrollbar text-xs">
              {conflictLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
                  <span className="font-semibold text-xs">Analyzing condition signatures & priority graphs...</span>
                </div>
              ) : conflictReport ? (
                <>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Rules Scanned</span>
                      <span className="text-base font-black text-slate-800">{conflictReport.total_rules_scanned}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Conflict Signatures</span>
                      <span className={`text-base font-black ${conflictReport.conflict_count === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                        {conflictReport.conflict_count}
                      </span>
                    </div>
                  </div>

                  {conflictReport.conflict_count === 0 ? (
                    <div className="p-6 text-center text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-600" />
                      <p className="font-bold text-sm">All Policy Matrix Rules Clean & Deterministic!</p>
                      <p className="text-xs text-emerald-600 mt-1">No overlapping conditions or ambiguous priority collisions detected.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                        Detected Conflict Clusters:
                      </span>
                      {conflictReport.conflicts.map((conf, cIdx) => (
                        <div key={cIdx} className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-amber-900 flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                              {conf.conflict_type.replace('_', ' ')}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${conf.severity === 'HIGH' ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>
                              {conf.severity} SEVERITY
                            </span>
                          </div>

                          <p className="text-slate-700 text-[11px]">
                            <strong>Affected Rules:</strong> {conf.affected_rules.join(", ")}
                          </p>

                          <p className="text-slate-500 text-[10px] font-mono bg-white p-1 rounded border border-slate-200">
                            {conf.signature}
                          </p>

                          <p className="text-amber-800 text-[11px] font-medium pt-0.5">
                            💡 <strong>Recommendation:</strong> {conf.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {rules.map((rule, index) => (
          <div key={rule.id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden flex flex-col md:flex-row">
            
            {/* Left side: Rule Name & Number */}
            <div className="bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-3 flex flex-col justify-center items-center w-full md:w-32 shrink-0">
              <span className="text-[10px] font-black text-slate-400 mb-1">POLICY {index + 1}</span>
              <input 
                type="text" 
                value={rule.rule_name}
                onChange={(e) => updateRuleName(rule.id, e.target.value)}
                className="w-full text-center text-xs font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-300 focus:border-indigo-500 outline-none pb-1"
                placeholder="Rule Name"
              />
            </div>

            {/* Middle: Condition Matrix */}
            <div className="p-3 flex-1 grid grid-cols-2 lg:grid-cols-4 gap-2">
              
              {/* Division / Company Slot */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Division (Company)</label>
                <select 
                  value={getConditionValue(rule, 'Division') || getConditionValue(rule, 'division')}
                  onChange={(e) => updateRuleCondition(rule.id, 'Division', 'equals', e.target.value)}
                  className={`p-1.5 text-xs rounded border outline-none font-medium transition-colors ${(getConditionValue(rule, 'Division') || getConditionValue(rule, 'division')) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                >
                  <option value="">Any Division</option>
                  <option value="VCC">VCC (V-Care / Retail Stores)</option>
                  <option value="ACC">ACC (Ramraj Cotton Mills)</option>
                  <option value="ENES">ENES Textile Mills</option>
                  <option value="EIC">EIC Garments</option>
                  <option value="RCH">RCH Fabrics</option>
                  <option value="RMPL">RMPL Processing</option>
                  <option value="RRTC">RRTC Logistics</option>
                </select>
              </div>

              {/* Plant / Branch Slot */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Plant / Branch</label>
                <input 
                  type="text"
                  value={getConditionValue(rule, 'Plant') || getConditionValue(rule, 'plant') || getConditionValue(rule, 'branch')}
                  onChange={(e) => updateRuleCondition(rule.id, 'Plant', 'Contains Any of', e.target.value)}
                  placeholder="e.g. TN-SIVAKASI, Sulur, HQ"
                  className={`p-1.5 text-xs rounded border outline-none font-medium transition-colors ${(getConditionValue(rule, 'Plant') || getConditionValue(rule, 'plant') || getConditionValue(rule, 'branch')) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                />
              </div>

              {/* Category / Cost Center Slot */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Cost Center / Category</label>
                <input 
                  type="text"
                  value={getConditionValue(rule, 'Cost Center') || getConditionValue(rule, 'Category') || getConditionValue(rule, 'cost_center')}
                  onChange={(e) => updateRuleCondition(rule.id, 'Cost Center', 'Contains Any of', e.target.value)}
                  placeholder="e.g. IT-HARDWARE, BATTERY VEHICLE"
                  className={`p-1.5 text-xs rounded border outline-none font-medium transition-colors ${(getConditionValue(rule, 'Cost Center') || getConditionValue(rule, 'Category') || getConditionValue(rule, 'cost_center')) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                />
              </div>

              {/* Amount / Doc Type Slot */}
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Document Type</label>
                <select 
                  value={getConditionValue(rule, 'Document Type') || rule.document_type || 'AP INVOICE'}
                  onChange={(e) => {
                     updateRuleCondition(rule.id, 'Document Type', 'equals', e.target.value);
                     setRules(rules.map(r => r.id === rule.id ? { ...r, document_type: e.target.value } : r));
                  }}
                  className="p-1.5 text-xs rounded border bg-slate-50 border-slate-200 text-slate-700 font-bold outline-none"
                >
                  <option value="AP INVOICE">📄 AP INVOICE</option>
                  <option value="AP DEBIT NOTE">📑 AP DEBIT NOTE</option>
                  <option value="AR CREDITNOTE">📋 AR CREDITNOTE</option>
                  <option value="JOURNAL ENTRY">📓 JOURNAL ENTRY</option>
                  <option value="VCC PURCHASE INVOICE">🛒 VCC PURCHASE INVOICE</option>
                </select>
              </div>

            </div>

            {/* Right side: Target Workflow */}
            <div className="bg-slate-50 border-t md:border-t-0 md:border-l border-slate-200 p-3 flex flex-col justify-center gap-2 min-w-[200px]">
              <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <ArrowRight className="h-3 w-3" /> Target Flow
              </label>
              <div className="flex items-center gap-1">
                <select 
                  value={rule.target_workflow_id || ''}
                  onChange={(e) => updateRuleFlow(rule.id, e.target.value)}
                  className="w-full p-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded focus:border-indigo-500 outline-none"
                >
                  <option value="">-- Select Flow --</option>
                  {uniqueWorkflows.map(wf => (
                    <option key={wf} value={wf}>{wf}</option>
                  ))}
                </select>
                <button 
                  onClick={() => setActiveTab('routing')}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1.5 rounded text-[10px] font-bold transition-colors"
                  title="Edit Flows"
                >
                  Edit
                </button>
              </div>
              
              <div className="flex justify-between items-center mt-2">
                <button 
                  onClick={() => {
                    setRules(rules.filter(r => r.id !== rule.id));
                    setHasChanges(true);
                  }}
                  className="text-[10px] text-red-500 hover:text-red-700 font-bold flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
                <button 
                  onClick={() => {
                    // It auto-saves to local state via onChange, so this is just a visual confirm
                    setEditingId(null);
                  }}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors"
                >
                  <Save className="h-3 w-3" /> Save condition
                </button>
              </div>
            </div>
            
          </div>
        ))}
        {rules.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">
            No condition policies found. Click "Add Policy" to create one.
          </div>
        )}
      </div>
    </div>
  );
}
