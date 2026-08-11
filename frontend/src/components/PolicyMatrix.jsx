import React, { useState } from 'react';
import { Save, Plus, ArrowRight, Settings2, Trash2 } from 'lucide-react';

export default function PolicyMatrix({ rules, setRules, setHasChanges, steps, setActiveTab }) {
  const [editingId, setEditingId] = useState(null);
  
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
      <div className="flex justify-between items-center mb-4 mt-2">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-indigo-600" />
          Condition Policy Matrix
        </h2>
        <button 
          onClick={handleAddNew}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-xs font-bold transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" /> Add Policy
        </button>
      </div>

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
