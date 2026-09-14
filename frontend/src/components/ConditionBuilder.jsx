import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Edit2, Trash2, Network, X, ArrowRight, CornerDownRight, Search, 
  AlertTriangle, Folder, GitMerge, CheckCircle2, ChevronDown, Check, Sparkles, 
  Filter, HelpCircle, ArrowLeft, Layers, Sliders, ShieldCheck
} from 'lucide-react';
import matrixOptions from '../matrix_options.json';

// Standard synced document fields metadata with types
const DEFAULT_CONDITION_FIELDS = [
  { id: 'Division', label: 'Division / Company', type: 'select', optionsSource: 'divisions' },
  { id: 'Category', label: 'Category / Expense Type', type: 'select', optionsSource: 'categories' },
  { id: 'Cost Center', label: 'Cost Center / Dept', type: 'select', optionsSource: 'cost_centers' },
  { id: 'Branch', label: 'Branch / Plant Location', type: 'select', optionsSource: 'branches' },
  { id: 'Invoice Amount (Total)', label: 'Invoice Amount (Total)', type: 'number', isCurrency: true },
  { id: 'Base Amount', label: 'Base Amount (Taxable / Net)', type: 'number', isCurrency: true },
  { id: 'Document Type', label: 'Document Type', type: 'select', optionsSource: 'document_types' },
  { id: 'Vendor Name', label: 'Vendor Name', type: 'text' },
  { id: 'Tax Amount', label: 'Tax Amount', type: 'number', isCurrency: true },
  { id: 'Payment Mode', label: 'Payment Mode', type: 'select', optionsSource: 'payment_modes' },
  { id: 'GSTIN', label: 'Vendor GSTIN', type: 'text' },
  { id: 'PO Number', label: 'PO / Order Number', type: 'text' },
  { id: 'Invoice Date', label: 'Invoice Date', type: 'date' }
];

const STANDARD_DOC_TYPES = [
  "AP Invoice",
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
  "AP DEBIT NOTE",
  "AR CREDITNOTE",
  "PROJECT BUDGET",
  "NON - RETURNABLE"
];

const STANDARD_PAYMENT_MODES = [
  "NEFT",
  "RTGS",
  "Cheque",
  "Cash",
  "UPI",
  "Bank Transfer",
  "Demand Draft"
];

// Operators categorized by field type
const OPERATORS_BY_TYPE = {
  number: [
    { value: 'equals', label: 'Equals (=)' },
    { value: 'not equals', label: 'Not Equal (≠)' },
    { value: 'greater than', label: 'Greater Than (>)' },
    { value: 'greater than or equal', label: 'Greater Than or Equal (≥)' },
    { value: 'less than', label: 'Less Than (<)' },
    { value: 'less than or equal', label: 'Less Than or Equal (≤)' }
  ],
  text: [
    { value: 'equals', label: 'Equals (=)' },
    { value: 'not equals', label: 'Not Equal (≠)' },
    { value: 'contains', label: 'Contains (⊇)' },
    { value: 'does not contain', label: 'Does Not Contain (⊅)' },
    { value: 'starts with', label: 'Starts With' },
    { value: 'ends with', label: 'Ends With' }
  ],
  select: [
    { value: 'equals', label: 'Equals (=)' },
    { value: 'not equals', label: 'Not Equal (≠)' },
    { value: 'is one of', label: 'Is One Of' },
    { value: 'is not one of', label: 'Is Not One Of' }
  ],
  date: [
    { value: 'equals', label: 'Equals (=)' },
    { value: 'before', label: 'Before (<)' },
    { value: 'after', label: 'After (>)' },
    { value: 'on or before', label: 'On or Before (≤)' },
    { value: 'on or after', label: 'On or After (≥)' }
  ],
  boolean: [
    { value: 'equals', label: 'Equals (=)' }
  ]
};

// Normalizes operator strings loaded from older rules/JSON
const normalizeOperator = (op, fieldType = 'text') => {
  const o = (op || '').toLowerCase().trim();
  if (o === '=' || o === '==' || o === 'eq' || o === 'equals') return 'equals';
  if (o === '!=' || o === '!==' || o === 'neq' || o === 'not equals' || o === 'not equal') return 'not equals';
  if (o === 'gt' || o === '>') return 'greater than';
  if (o === 'gte' || o === '>=') return 'greater than or equal';
  if (o === 'lt' || o === '<') return 'less than';
  if (o === 'lte' || o === '<=') return 'less than or equal';
  if (o === 'contains any of' || o === 'in' || o === 'is one of') return fieldType === 'select' ? 'is one of' : 'contains';
  if (o === 'not in' || o === 'is not one of') return 'is not one of';
  if (o === 'does not contain' || o === 'not contains') return 'does not contain';
  if (o === 'starts_with' || o === 'starts with') return 'starts with';
  if (o === 'ends_with' || o === 'ends with') return 'ends with';
  if (o === 'before') return 'before';
  if (o === 'after') return 'after';
  if (o === 'on or before') return 'on or before';
  if (o === 'on or after') return 'on or after';

  const defaultOp = OPERATORS_BY_TYPE[fieldType]?.[0]?.value || 'equals';
  return defaultOp;
};

export default function ConditionBuilder({ rules = [], setRules, setHasChanges, handleDeleteRuleLocal }) {
  // Navigation / Editor Mode state
  const [editingRule, setEditingRule] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);

  // Editor Form States
  const [ruleName, setRuleName] = useState('');
  const [docType, setDocType] = useState('AP Invoice');
  const [description, setDescription] = useState('');
  const [ruleCategory, setRuleCategory] = useState('Vendor Payment Workflows');
  const [targetWorkflowId, setTargetWorkflowId] = useState('');
  const [wfCategoryFilter, setWfCategoryFilter] = useState('ALL');
  const [matchType, setMatchType] = useState('ALL'); // 'ALL' or 'ANY'
  const [conditions, setConditions] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedConditionSuccessModal, setSavedConditionSuccessModal] = useState(null);

  // Custom Fields System
  const [availableFields, setAvailableFields] = useState(() => {
    try {
      const saved = localStorage.getItem("docuflow_custom_condition_fields");
      if (saved) {
        const parsed = JSON.parse(saved);
        const existingIds = new Set(DEFAULT_CONDITION_FIELDS.map(f => f.id));
        const extra = parsed.filter(p => !existingIds.has(p.id));
        return [...DEFAULT_CONDITION_FIELDS, ...extra];
      }
    } catch {}
    return DEFAULT_CONDITION_FIELDS;
  });
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [newFieldNameInput, setNewFieldNameInput] = useState('');
  const [newFieldTypeInput, setNewFieldTypeInput] = useState('text');
  const [addFieldTargetIdx, setAddFieldTargetIdx] = useState(null);

  // Value multi-select / picker modal for dropdowns
  const [activeMultiSelectIdx, setActiveMultiSelectIdx] = useState(null);
  const [multiSelectSearch, setMultiSelectSearch] = useState('');
  const [customTagInput, setCustomTagInput] = useState('');

  // Fetch Workflow Profiles on Mount
  useEffect(() => {
    const fetchWf = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const headers = token ? { "Authorization": `Bearer ${token}` } : {};
        const res = await fetch('/api/admin/workflows', { headers });
        if (res.ok) {
          const data = await res.json();
          setWorkflows(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load workflows:", err);
      }
    };
    fetchWf();
  }, []);

  // Listen for open-condition-editor external events (e.g. from FlowBuilder)
  useEffect(() => {
    const handleOpenCondition = (e) => {
      const targetWf = e?.detail?.target_workflow_id || localStorage.getItem("docuflow_target_condition_wf");
      const dt = e?.detail?.document_type || localStorage.getItem("docuflow_target_condition_doctype");
      if (targetWf) {
        localStorage.removeItem("docuflow_target_condition_wf");
        localStorage.removeItem("docuflow_target_condition_doctype");

        // Inspect existing rules to find if this workflow ALREADY has a condition policy
        const targetWfObj = workflows.find(w => w.profile_name === targetWf || w.workflow_code === targetWf || String(w.id) === String(targetWf));
        const existingRule = rules.find(r => 
          (r.target_workflow_id && (
            r.target_workflow_id === targetWf ||
            (targetWfObj && (r.target_workflow_id === targetWfObj.profile_name || r.target_workflow_id === targetWfObj.workflow_code))
          )) ||
          (r.workflow_code && (
            r.workflow_code === targetWf ||
            (targetWfObj && (r.workflow_code === targetWfObj.workflow_code || r.workflow_code === targetWfObj.profile_name))
          )) ||
          (r.rule_name && targetWfObj && r.rule_name.toLowerCase().includes(targetWfObj.profile_name.toLowerCase()))
        );

        if (existingRule) {
          // Open existing condition policy in edit mode - NEVER duplicate
          openEditor(existingRule);
        } else {
          // No condition exists yet, open new condition pre-associated with target workflow
          openEditor(null, dt || targetWfObj?.workflow_type || 'AP Invoice', targetWf);
        }
      }
    };
    window.addEventListener('open-condition-editor', handleOpenCondition);

    const savedTarget = localStorage.getItem("docuflow_target_condition_wf");
    if (savedTarget) {
      const savedDoc = localStorage.getItem("docuflow_target_condition_doctype");
      localStorage.removeItem("docuflow_target_condition_wf");
      localStorage.removeItem("docuflow_target_condition_doctype");
      setTimeout(() => {
        const targetWfObj = workflows.find(w => w.profile_name === savedTarget || w.workflow_code === savedTarget || String(w.id) === String(savedTarget));
        const existingRule = rules.find(r => 
          (r.target_workflow_id && (
            r.target_workflow_id === savedTarget ||
            (targetWfObj && (r.target_workflow_id === targetWfObj.profile_name || r.target_workflow_id === targetWfObj.workflow_code))
          )) ||
          (r.workflow_code && (
            r.workflow_code === savedTarget ||
            (targetWfObj && (r.workflow_code === targetWfObj.workflow_code || r.workflow_code === targetWfObj.profile_name))
          )) ||
          (r.rule_name && targetWfObj && r.rule_name.toLowerCase().includes(targetWfObj.profile_name.toLowerCase()))
        );

        if (existingRule) {
          openEditor(existingRule);
        } else {
          openEditor(null, savedDoc || targetWfObj?.workflow_type || 'AP Invoice', savedTarget);
        }
      }, 250);
    }

    return () => window.removeEventListener('open-condition-editor', handleOpenCondition);
  }, [workflows, rules]);

  // Master options helper
  const getFieldMasterOptions = (fieldName) => {
    if (fieldName === 'Cost Center') return matrixOptions?.cost_centers || [];
    if (fieldName === 'Category') return matrixOptions?.categories || [];
    if (fieldName === 'Branch' || fieldName === 'Plant') return matrixOptions?.branches || [];
    if (fieldName === 'Division') return matrixOptions?.divisions || [];
    if (fieldName === 'Document Type') return STANDARD_DOC_TYPES;
    if (fieldName === 'Payment Mode') return STANDARD_PAYMENT_MODES;
    return [];
  };

  const getFieldMeta = (fieldId) => {
    const found = availableFields.find(f => f.id === fieldId || f.id.toLowerCase() === (fieldId || '').toLowerCase());
    if (found) return found;
    if (fieldId?.toLowerCase().includes('amount')) return { id: fieldId, label: fieldId, type: 'number', isCurrency: true };
    if (fieldId?.toLowerCase().includes('date')) return { id: fieldId, label: fieldId, type: 'date' };
    return { id: fieldId, label: fieldId, type: 'text' };
  };

  // Derive workflow code from target workflow
  const selectedWorkflowObj = useMemo(() => {
    if (!targetWorkflowId) return null;
    return workflows.find(w => w.profile_name === targetWorkflowId || w.workflow_code === targetWorkflowId || String(w.id) === String(targetWorkflowId));
  }, [targetWorkflowId, workflows]);

  const workflowCode = useMemo(() => {
    if (selectedWorkflowObj) {
      return selectedWorkflowObj.workflow_code || 'WF-' + (selectedWorkflowObj.id || '001');
    }
    return '';
  }, [selectedWorkflowObj]);

  // Open the One-Page Condition Builder for Create or Edit
  const openEditor = (r = null, defaultDocType = null, defaultTargetWf = null) => {
    setValidationErrors({});
    if (r) {
      setEditingRule(r);
      setRuleName(r.rule_name || '');
      setDocType(r.document_type || 'AP Invoice');
      setDescription(r.description || '');
      setRuleCategory(r.rule_category || selectedCategory || 'Vendor Payment Workflows');
      setTargetWorkflowId(r.target_workflow_id || '');

      const matchedWf = workflows.find(w => w.profile_name === r.target_workflow_id || w.workflow_code === r.target_workflow_id);
      setWfCategoryFilter(matchedWf?.workflow_category || 'ALL');

      let parsedConds = [];
      let detectedMatchType = 'ALL';
      try {
        const parsed = JSON.parse(r.conditions_json);
        if (Array.isArray(parsed)) {
          parsedConds = parsed;
        } else if (parsed && typeof parsed === 'object') {
          parsedConds = Array.isArray(parsed.conditions) ? parsed.conditions : [];
          if (parsed.match_type) {
            detectedMatchType = parsed.match_type.toUpperCase() === 'ANY' ? 'ANY' : 'ALL';
          } else if (parsedConds.some(c => (c.logicalOperator || '').toUpperCase() === 'OR')) {
            detectedMatchType = 'ANY';
          }
        }
      } catch {
        parsedConds = [];
      }

      if (parsedConds.length === 0) {
        parsedConds = [{ field: 'Invoice Amount (Total)', operator: 'greater than', value: '' }];
      }

      const formatted = parsedConds.map(c => {
        const meta = getFieldMeta(c.field);
        return {
          field: c.field,
          operator: normalizeOperator(c.operator, meta.type),
          value: c.value !== undefined && c.value !== null ? String(c.value) : ''
        };
      });

      setMatchType(detectedMatchType);
      setConditions(formatted);
    } else {
      const initialTarget = defaultTargetWf || (workflows.length > 0 ? workflows[0].profile_name : '');
      const matchedWf = workflows.find(w => w.profile_name === initialTarget || w.workflow_code === initialTarget);
      const initialDocType = defaultDocType || selectedSubCategory || 'AP Invoice';

      setEditingRule({
        id: 'tmp-' + Date.now(),
        is_new: true
      });
      setRuleName(matchedWf ? `${matchedWf.profile_name} Rule` : '');
      setDocType(initialDocType);
      setDescription('');
      setRuleCategory(selectedCategory || 'Vendor Payment Workflows');
      setTargetWorkflowId(initialTarget);
      setWfCategoryFilter(matchedWf?.workflow_category || 'ALL');
      setMatchType('ALL');
      setConditions([
        { field: 'Invoice Amount (Total)', operator: 'greater than', value: '100000' }
      ]);
    }
  };

  // Condition rows manipulation
  const handleFieldChange = (index, newField) => {
    if (newField === '__ADD_NEW_FIELD__') {
      setAddFieldTargetIdx(index);
      setNewFieldNameInput('');
      setNewFieldTypeInput('text');
      setShowAddFieldModal(true);
      return;
    }
    const meta = getFieldMeta(newField);
    const validOps = OPERATORS_BY_TYPE[meta.type] || OPERATORS_BY_TYPE.text;
    const defaultOp = validOps[0].value;

    let initialVal = '';
    if (meta.type === 'number') initialVal = '50000';
    else if (newField === 'Division') initialVal = 'VCC';
    else if (newField === 'Category') initialVal = 'CAPEX / FIXED ASSET';
    else if (newField === 'Branch') initialVal = 'TN-SIVAKASI';
    else if (newField === 'Document Type') initialVal = docType || 'AP Invoice';
    else if (newField === 'Payment Mode') initialVal = 'NEFT';

    const updated = [...conditions];
    updated[index] = {
      field: newField,
      operator: defaultOp,
      value: initialVal
    };
    setConditions(updated);

    if (validationErrors[`row_${index}`]) {
      const errs = { ...validationErrors };
      delete errs[`row_${index}`];
      setValidationErrors(errs);
    }
  };

  const handleOperatorChange = (index, newOp) => {
    const updated = [...conditions];
    const prevOp = updated[index].operator;
    updated[index].operator = newOp;

    const isNowMulti = newOp === 'is one of' || newOp === 'is not one of';
    const wasMulti = prevOp === 'is one of' || prevOp === 'is not one of';
    if (isNowMulti && !wasMulti && updated[index].value && !updated[index].value.includes(',')) {
      // keep single value
    } else if (!isNowMulti && wasMulti && updated[index].value.includes(',')) {
      updated[index].value = updated[index].value.split(',')[0].trim();
    }

    setConditions(updated);
  };

  const handleValueChange = (index, newVal) => {
    const updated = [...conditions];
    updated[index].value = newVal;
    setConditions(updated);

    if (validationErrors[`row_${index}`]) {
      const errs = { ...validationErrors };
      delete errs[`row_${index}`];
      setValidationErrors(errs);
    }
  };

  const handleAddCondition = () => {
    if (conditions.length >= 10) return;
    const defaultField = 'Category';
    setConditions([
      ...conditions,
      { field: defaultField, operator: 'equals', value: '' }
    ]);
  };

  const handleDeleteCondition = (index) => {
    if (conditions.length <= 1) {
      setConditions([{ field: 'Invoice Amount (Total)', operator: 'greater than', value: '' }]);
      return;
    }
    const updated = conditions.filter((_, i) => i !== index);
    setConditions(updated);
  };

  const handleClearAll = () => {
    if (conditions.length > 1) {
      setShowClearConfirm(true);
    } else {
      setConditions([{ field: 'Invoice Amount (Total)', operator: 'greater than', value: '' }]);
    }
  };

  const confirmClearAll = () => {
    setConditions([{ field: 'Invoice Amount (Total)', operator: 'greater than', value: '' }]);
    setShowClearConfirm(false);
  };

  // Dynamic Rule Preview Generator
  const previewData = useMemo(() => {
    const issues = [];
    if (!ruleName.trim()) issues.push('Condition Name');
    if (!docType.trim()) issues.push('Document Type');
    if (!targetWorkflowId) issues.push('Target Workflow');

    if (conditions.length === 0) {
      issues.push('At least one condition');
    } else {
      conditions.forEach((c, idx) => {
        if (!c.field) issues.push(`Row ${idx + 1} field`);
        if (!c.operator) issues.push(`Row ${idx + 1} operator`);
        if (c.value === undefined || c.value === null || String(c.value).trim() === '') {
          issues.push(`Row ${idx + 1} value`);
        }
      });
    }

    const isComplete = issues.length === 0;

    const formattedConditions = conditions.map((c) => {
      const meta = getFieldMeta(c.field);
      let opDisplay = c.operator;
      const opObj = (OPERATORS_BY_TYPE[meta.type] || []).find(o => o.value === c.operator);
      if (opObj) opDisplay = opObj.label.toLowerCase();

      let valDisplay = c.value || '...';
      if (meta.isCurrency && c.value && !isNaN(Number(c.value))) {
        valDisplay = `₹${Number(c.value).toLocaleString('en-IN')}`;
      } else if (c.operator === 'is one of' || c.operator === 'is not one of') {
        valDisplay = `(${c.value})`;
      }

      return {
        fieldLabel: meta.label || c.field,
        operatorLabel: opDisplay,
        valueLabel: valDisplay
      };
    });

    return {
      isComplete,
      issues,
      formattedConditions,
      targetWorkflowName: selectedWorkflowObj?.profile_name || targetWorkflowId || 'Selected Workflow',
      workflowCode: workflowCode || 'WF-001'
    };
  }, [ruleName, docType, targetWorkflowId, conditions, selectedWorkflowObj, workflowCode]);

  // Validation
  const validateForm = () => {
    const errors = {};
    if (!ruleName.trim()) errors.ruleName = 'Condition Name is required.';
    if (!docType.trim()) errors.docType = 'Document Type is required.';
    if (!targetWorkflowId) errors.targetWorkflowId = 'Target Workflow is required.';

    if (conditions.length === 0) {
      errors.conditions = 'At least one condition rule row is required.';
    } else {
      conditions.forEach((c, idx) => {
        if (!c.field) errors[`row_${idx}`] = 'Field selection is required.';
        else if (!c.operator) errors[`row_${idx}`] = 'Operator selection is required.';
        else if (c.value === undefined || c.value === null || String(c.value).trim() === '') {
          errors[`row_${idx}`] = 'Value cannot be empty.';
        } else {
          const meta = getFieldMeta(c.field);
          if (meta.type === 'number') {
            const cleanNum = String(c.value).replace(/,/g, '').trim();
            if (isNaN(Number(cleanNum)) || cleanNum === '') {
              errors[`row_${idx}`] = 'Value must be a valid number.';
            }
          }
        }
      });
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Condition Handler
  const handleSaveCondition = async (e) => {
    e?.preventDefault();
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      const logicalOp = matchType === 'ANY' ? 'OR' : 'AND';
      const formattedConditions = conditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        logicalOperator: logicalOp
      }));

      const conditionsPayload = {
        match_type: matchType,
        condition_type: 'Combination Condition',
        conditions: formattedConditions,
        settings: {
          case_sensitive: false,
          null_handling: 'Consider as False'
        }
      };

      const isNew = String(editingRule.id).startsWith('tmp-') || editingRule.is_new;
      const rulePayload = {
        id: isNew ? undefined : editingRule.id,
        rule_name: ruleName.trim(),
        rule_category: ruleCategory || 'Vendor Payment Workflows',
        document_type: docType || 'AP Invoice',
        priority: editingRule.priority || (rules.length + 1) * 10,
        target_workflow_id: targetWorkflowId,
        workflow_code: workflowCode,
        description: description.trim(),
        rule_action: editingRule.rule_action || 'WORKFLOW_ROUTE',
        cancel_reason: editingRule.cancel_reason || null,
        is_active: editingRule.is_active !== undefined ? editingRule.is_active : true,
        conditions_json: JSON.stringify(conditionsPayload)
      };

      const token = localStorage.getItem("authToken");
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      };

      const res = await fetch('/api/admin/routing-rules', {
        method: 'POST',
        headers,
        body: JSON.stringify(rulePayload)
      });

      if (res.ok) {
        const savedData = await res.json();
        if (isNew) {
          setRules([...rules.filter(r => r.id !== editingRule.id), savedData]);
        } else {
          setRules(rules.map(r => r.id === editingRule.id ? savedData : r));
        }
      } else {
        const fallbackObj = {
          ...editingRule,
          ...rulePayload,
          id: editingRule.id || `tmp-${Date.now()}`
        };
        if (isNew) {
          setRules([...rules.filter(r => r.id !== editingRule.id), fallbackObj]);
        } else {
          setRules(rules.map(r => r.id === editingRule.id ? fallbackObj : r));
        }
      }

      setHasChanges(true);
      const savedName = ruleName.trim();
      const savedTarget = targetWorkflowId;
      setEditingRule(null);
      setSavedConditionSuccessModal({
        rule_name: savedName,
        target_workflow_id: savedTarget
      });
    } catch (err) {
      console.error("Save error:", err);
      const fallbackObj = {
        ...editingRule,
        rule_name: ruleName.trim(),
        rule_category: ruleCategory,
        document_type: docType,
        target_workflow_id: targetWorkflowId,
        description: description.trim(),
        conditions_json: JSON.stringify({
          match_type: matchType,
          conditions: conditions.map(c => ({ ...c, logicalOperator: matchType === 'ANY' ? 'OR' : 'AND' }))
        })
      };
      setRules(rules.map(r => r.id === editingRule.id ? fallbackObj : r));
      setHasChanges(true);
      const savedName = ruleName.trim();
      const savedTarget = targetWorkflowId;
      setEditingRule(null);
      setSavedConditionSuccessModal({
        rule_name: savedName,
        target_workflow_id: savedTarget
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingRule(null);
  };

  const workflowCategories = useMemo(() => {
    const set = new Set(workflows.map(w => w.workflow_category).filter(Boolean));
    return Array.from(set).sort();
  }, [workflows]);

  // =========================================================================
  // VIEW 1: ONE-PAGE WORKFLOW CONDITION BUILDER (COMPACT TYPOGRAPHY & SIZING)
  // =========================================================================
  if (editingRule) {
    return (
      <div className="flex flex-col gap-3.5 max-w-4xl mx-auto w-full pb-10 animate-in fade-in duration-150">
        
        {/* 1. HEADER (Compact) */}
        <div className="bg-white border border-slate-200/80 rounded-lg p-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <div 
                onClick={handleCancel}
                className="flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-widest text-[#003F28] hover:text-emerald-900 cursor-pointer transition-colors mb-0.5 group"
              >
                <ArrowLeft className="h-2.5 w-2.5 group-hover:-translate-x-0.5 transition-transform" />
                <span>POLICY MATRIX</span>
                <span className="text-slate-300 font-normal">&gt;</span>
                <span className="text-slate-500">CONFIGURE CONDITION</span>
              </div>
              <h1 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Configure Condition</span>
                {editingRule.is_new ? (
                  <span className="text-[8.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded uppercase tracking-wider">
                    New
                  </span>
                ) : (
                  <span className="text-[8.5px] font-bold bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded uppercase tracking-wider">
                    Editing
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-slate-500 font-medium">
                Define conditions to determine the workflow assigned to matching synced documents.
              </p>
              {targetWorkflowId && (
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 mt-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[9.5px] font-bold">
                  <GitMerge className="h-3 w-3 text-emerald-700 shrink-0" />
                  <span>Workflow: <strong className="text-slate-900">{workflowCode || targetWorkflowId}</strong> ({selectedWorkflowObj?.profile_name || targetWorkflowId})</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleCancel();
                  window.dispatchEvent(new CustomEvent("set-admin-tab", { detail: "routing" }));
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-md transition-colors cursor-pointer flex items-center gap-1"
                title="Return to Flow Builder"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Back to Flow</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] rounded-md transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCondition}
                disabled={isSaving}
                className="px-3 py-1.5 bg-[#003F28] hover:bg-[#002f1e] disabled:opacity-50 text-white font-bold text-[11px] rounded-md transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="h-3 w-3" />
                <span>{isSaving ? 'Saving...' : 'Save Condition'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. CONDITION DETAILS (Compact) */}
        <section className="bg-white border border-slate-200/80 rounded-lg p-3.5 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="h-4.5 w-4.5 rounded bg-emerald-50 text-[#003F28] flex items-center justify-center font-black text-[10px]">
                1
              </div>
              <h2 className="text-[10.5px] font-black uppercase tracking-wider text-slate-800">
                Condition Details
              </h2>
            </div>
            <span className="text-[9px] font-bold text-slate-400 uppercase">Core Information</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* Condition Name */}
            <div>
              <label htmlFor="condNameInput" className="block text-[9.5px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Condition Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="condNameInput"
                type="text"
                value={ruleName}
                onChange={e => {
                  setRuleName(e.target.value);
                  if (validationErrors.ruleName) {
                    const errs = { ...validationErrors };
                    delete errs.ruleName;
                    setValidationErrors(errs);
                  }
                }}
                placeholder="e.g. High Value Machinery Purchase Approval"
                className={`w-full text-[11px] px-2.5 py-1.5 bg-slate-50/50 border rounded-md outline-none font-semibold text-slate-800 transition-colors ${
                  validationErrors.ruleName 
                    ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30' 
                    : 'border-slate-200 focus:border-[#003F28] focus:bg-white'
                }`}
              />
              {validationErrors.ruleName && (
                <p className="text-[9.5px] font-bold text-rose-600 mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> {validationErrors.ruleName}
                </p>
              )}
            </div>

            {/* Document Type */}
            <div>
              <label htmlFor="docTypeSelect" className="block text-[9.5px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Document Type <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  id="docTypeSelect"
                  value={docType}
                  onChange={e => {
                    setDocType(e.target.value);
                    if (validationErrors.docType) {
                      const errs = { ...validationErrors };
                      delete errs.docType;
                      setValidationErrors(errs);
                    }
                  }}
                  className={`w-full text-[11px] px-2.5 py-1.5 bg-slate-50/50 border rounded-md outline-none font-semibold text-slate-800 appearance-none transition-colors cursor-pointer ${
                    validationErrors.docType 
                      ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30' 
                      : 'border-slate-200 focus:border-[#003F28] focus:bg-white'
                  }`}
                >
                  <option value="">-- Select Document Type --</option>
                  {STANDARD_DOC_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
              {validationErrors.docType && (
                <p className="text-[9.5px] font-bold text-rose-600 mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> {validationErrors.docType}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label htmlFor="condDescInput" className="block text-[9.5px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Description <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                id="condDescInput"
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief summary of when this condition triggers and business justification..."
                className="w-full text-[11px] px-2.5 py-1.5 bg-slate-50/50 border border-slate-200 rounded-md outline-none font-medium text-slate-700 focus:border-[#003F28] focus:bg-white transition-colors"
              />
            </div>
          </div>
        </section>

        {/* 3. WORKFLOW ASSIGNMENT (Compact) */}
        <section className="bg-white border border-slate-200/80 rounded-lg p-3.5 shadow-2xs space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="h-4.5 w-4.5 rounded bg-emerald-50 text-[#003F28] flex items-center justify-center font-black text-[10px]">
                2
              </div>
              <h2 className="text-[10.5px] font-black uppercase tracking-wider text-slate-800">
                Workflow Assignment
              </h2>
            </div>
            <span className="text-[9px] font-bold text-slate-400 uppercase">Routing Destination</span>
          </div>

          <p className="text-[10px] text-slate-500 font-medium">
            This section determines which workflow receives a document when this condition matches.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 bg-slate-50/60 border border-slate-200/70 p-2.5 rounded-lg">
            {/* Document Category Filter */}
            <div>
              <label htmlFor="wfCategorySelect" className="block text-[9px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Document Category
              </label>
              <div className="relative">
                <select
                  id="wfCategorySelect"
                  value={wfCategoryFilter}
                  onChange={e => setWfCategoryFilter(e.target.value)}
                  className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] appearance-none cursor-pointer shadow-2xs"
                >
                  <option value="ALL">All Categories ({workflows.length})</option>
                  {workflowCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Target Workflow */}
            <div>
              <label htmlFor="targetWfSelect" className="block text-[9px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Target Workflow <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  id="targetWfSelect"
                  value={targetWorkflowId}
                  onChange={e => {
                    const newWf = e.target.value;
                    setTargetWorkflowId(newWf);
                    const matched = workflows.find(w => w.profile_name === newWf || w.workflow_code === newWf);
                    if (matched && !ruleName.trim()) {
                      setRuleName(matched.profile_name);
                    }
                    if (validationErrors.targetWorkflowId) {
                      const errs = { ...validationErrors };
                      delete errs.targetWorkflowId;
                      setValidationErrors(errs);
                    }
                  }}
                  className={`w-full text-[11px] px-2.5 py-1.5 bg-white border rounded-md outline-none font-bold appearance-none cursor-pointer shadow-2xs transition-colors ${
                    validationErrors.targetWorkflowId
                      ? 'border-rose-400 text-rose-900 focus:border-rose-500'
                      : 'border-slate-200 text-slate-900 focus:border-[#003F28]'
                  }`}
                >
                  <option value="">-- Select Workflow --</option>
                  {workflows
                    .filter(w => wfCategoryFilter === 'ALL' || w.workflow_category === wfCategoryFilter)
                    .map(w => (
                      <option key={w.profile_name} value={w.profile_name}>
                        [{w.workflow_code || 'WF-001'}] {w.profile_name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
              {validationErrors.targetWorkflowId && (
                <p className="text-[9.5px] font-bold text-rose-600 mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" /> {validationErrors.targetWorkflowId}
                </p>
              )}
            </div>

            {/* Workflow Code (Read-only / Auto-populated) */}
            <div>
              <label className="block text-[9px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Workflow Code
              </label>
              <div className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md font-mono font-bold flex items-center justify-between shadow-2xs">
                <span className={workflowCode ? 'text-[#003F28] font-black' : 'text-slate-400 italic'}>
                  {workflowCode || 'Derived'}
                </span>
                {workflowCode && (
                  <span className="text-[8.5px] font-sans font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                    <CheckCircle2 className="h-2 w-2" /> Linked
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 4. MATCH CONDITIONS (Compact) */}
        <section className="bg-white border border-slate-200/80 rounded-lg p-3.5 shadow-2xs space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="h-4.5 w-4.5 rounded bg-emerald-50 text-[#003F28] flex items-center justify-center font-black text-[10px]">
                3
              </div>
              <div>
                <h2 className="text-[10.5px] font-black uppercase tracking-wider text-slate-800">
                  Match Conditions
                </h2>
                <p className="text-[10px] text-slate-500 font-medium">
                  Define the synced document data that must match before this workflow is assigned.
                </p>
              </div>
            </div>

            {/* Match Logic Selector: ALL vs ANY */}
            <div className="flex items-center gap-2 bg-slate-100/80 p-0.5 rounded-md border border-slate-200 self-start sm:self-auto">
              <span className="text-[9px] font-bold text-slate-500 uppercase px-1">Match:</span>
              <label className={`flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                matchType === 'ALL' ? 'bg-white text-[#003F28] shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}>
                <input
                  type="radio"
                  name="matchType"
                  checked={matchType === 'ALL'}
                  onChange={() => setMatchType('ALL')}
                  className="accent-[#003F28] h-3 w-3"
                />
                <span>ALL conditions</span>
              </label>
              <label className={`flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded cursor-pointer transition-colors ${
                matchType === 'ANY' ? 'bg-white text-[#003F28] shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}>
                <input
                  type="radio"
                  name="matchType"
                  checked={matchType === 'ANY'}
                  onChange={() => setMatchType('ANY')}
                  className="accent-[#003F28] h-3 w-3"
                />
                <span>ANY condition</span>
              </label>
            </div>
          </div>

          {validationErrors.conditions && (
            <div className="p-2 bg-rose-50 border border-rose-200 rounded-md text-[10.5px] font-bold text-rose-700 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{validationErrors.conditions}</span>
            </div>
          )}

          {/* Condition Rows List */}
          <div className="space-y-2 pt-0.5">
            {conditions.map((cond, idx) => {
              const fieldMeta = getFieldMeta(cond.field);
              const fieldType = fieldMeta.type || 'text';
              const validOperators = OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.text;
              const masterOptions = getFieldMasterOptions(cond.field);
              const isMultiSelect = cond.operator === 'is one of' || cond.operator === 'is not one of';
              const rowError = validationErrors[`row_${idx}`];

              const selectedItems = cond.value 
                ? cond.value.split(',').map(s => s.trim()).filter(Boolean) 
                : [];

              return (
                <div 
                  key={idx} 
                  className={`flex flex-col gap-1.5 p-2.5 rounded-lg border transition-all ${
                    rowError 
                      ? 'bg-rose-50/20 border-rose-300' 
                      : 'bg-slate-50/70 border-slate-200/80 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  {/* Logical Operator Badge */}
                  {idx > 0 && (
                    <div className="self-start -mt-1 mb-0.5">
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded border tracking-wider ${
                        matchType === 'ANY' 
                          ? 'bg-amber-50 text-amber-800 border-amber-200' 
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}>
                        {matchType === 'ANY' ? 'OR' : 'AND'}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 w-full">
                    {/* 1. Field Dropdown */}
                    <div className="w-full md:w-52 shrink-0">
                      <label className="block text-[8.5px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5 md:hidden">
                        Field
                      </label>
                      <div className="relative">
                        <select
                          value={cond.field}
                          onChange={e => handleFieldChange(idx, e.target.value)}
                          className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] appearance-none cursor-pointer shadow-2xs"
                        >
                          <optgroup label="SYNCED DOCUMENT FIELDS">
                            {DEFAULT_CONDITION_FIELDS.map(f => (
                              <option key={f.id} value={f.id}>{f.label}</option>
                            ))}
                          </optgroup>
                          {availableFields.length > DEFAULT_CONDITION_FIELDS.length && (
                            <optgroup label="CUSTOM FIELDS">
                              {availableFields.slice(DEFAULT_CONDITION_FIELDS.length).map(f => (
                                <option key={f.id} value={f.id}>{f.label || f.id}</option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="ACTIONS">
                            <option value="__ADD_NEW_FIELD__">+ Add Custom Field...</option>
                          </optgroup>
                        </select>
                        <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    {/* 2. Operator Dropdown */}
                    <div className="w-full md:w-44 shrink-0">
                      <label className="block text-[8.5px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5 md:hidden">
                        Operator
                      </label>
                      <div className="relative">
                        <select
                          value={cond.operator}
                          onChange={e => handleOperatorChange(idx, e.target.value)}
                          className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] appearance-none cursor-pointer shadow-2xs"
                        >
                          {validOperators.map(op => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    {/* 3. Value Control */}
                    <div className="flex-1 min-w-0">
                      <label className="block text-[8.5px] font-extrabold text-slate-500 uppercase tracking-wider mb-0.5 md:hidden">
                        Value / Target
                      </label>
                      
                      {/* NUMBER INPUT */}
                      {fieldType === 'number' && (
                        <div className="relative">
                          {fieldMeta.isCurrency && (
                            <span className="absolute left-2.5 top-1.5 text-[11px] font-bold text-slate-400 pointer-events-none">
                              ₹
                            </span>
                          )}
                          <input
                            type="number"
                            step="any"
                            value={cond.value}
                            onChange={e => handleValueChange(idx, e.target.value)}
                            placeholder={fieldMeta.isCurrency ? "100000" : "0"}
                            className={`w-full text-[11px] py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] shadow-2xs ${
                              fieldMeta.isCurrency ? 'pl-6 pr-2.5' : 'px-2.5'
                            }`}
                          />
                        </div>
                      )}

                      {/* DATE INPUT */}
                      {fieldType === 'date' && (
                        <input
                          type="date"
                          value={cond.value}
                          onChange={e => handleValueChange(idx, e.target.value)}
                          className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] shadow-2xs"
                        />
                      )}

                      {/* BOOLEAN SELECT */}
                      {fieldType === 'boolean' && (
                        <div className="relative">
                          <select
                            value={cond.value}
                            onChange={e => handleValueChange(idx, e.target.value)}
                            className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] appearance-none cursor-pointer shadow-2xs"
                          >
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                          <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                        </div>
                      )}

                      {/* SELECT DROPDOWN / MULTI-SELECT */}
                      {fieldType === 'select' && (
                        <div>
                          {isMultiSelect ? (
                            <div className="relative">
                              <div
                                onClick={() => {
                                  setActiveMultiSelectIdx(activeMultiSelectIdx === idx ? null : idx);
                                  setMultiSelectSearch('');
                                  setCustomTagInput('');
                                }}
                                className="w-full min-h-[32px] p-1 bg-white border border-slate-200 hover:border-[#003F28] rounded-md cursor-pointer flex items-center justify-between gap-1.5 shadow-2xs transition-colors"
                              >
                                <div className="flex flex-wrap gap-1 flex-1 min-w-0">
                                  {selectedItems.length > 0 ? (
                                    selectedItems.map((item, itIdx) => (
                                      <span
                                        key={itIdx}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-bold rounded"
                                      >
                                        <span>{item}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const updated = selectedItems.filter((_, i) => i !== itIdx);
                                            handleValueChange(idx, updated.join(', '));
                                          }}
                                          className="text-emerald-500 hover:text-rose-600 font-black cursor-pointer ml-0.5"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-slate-400 font-medium px-1 italic">
                                      Select {cond.field}...
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] font-bold text-[#003F28] shrink-0 bg-emerald-50/70 px-1.5 py-0.2 rounded border border-emerald-100">
                                  {selectedItems.length} ▼
                                </span>
                              </div>

                              {activeMultiSelectIdx === idx && (
                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 p-2 space-y-2 animate-in fade-in duration-100 max-h-60 overflow-y-auto">
                                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                    <span className="text-[9px] font-extrabold uppercase text-slate-600">
                                      Select {cond.field}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveMultiSelectIdx(null)}
                                      className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>

                                  <div className="relative">
                                    <Search className="h-3 w-3 text-slate-400 absolute left-2 top-2" />
                                    <input
                                      type="text"
                                      value={multiSelectSearch}
                                      onChange={e => setMultiSelectSearch(e.target.value)}
                                      placeholder={`Filter...`}
                                      className="w-full text-[10.5px] pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded outline-none focus:bg-white focus:border-[#003F28]"
                                    />
                                  </div>

                                  <div className="flex gap-1">
                                    <input
                                      type="text"
                                      value={customTagInput}
                                      onChange={e => setCustomTagInput(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const val = customTagInput.trim();
                                          if (val && !selectedItems.includes(val)) {
                                            const updated = [...selectedItems, val];
                                            handleValueChange(idx, updated.join(', '));
                                            setCustomTagInput('');
                                          }
                                        }
                                      }}
                                      placeholder="Custom value..."
                                      className="flex-1 text-[10.5px] px-2 py-1 border border-slate-200 rounded outline-none focus:border-[#003F28]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const val = customTagInput.trim();
                                        if (val && !selectedItems.includes(val)) {
                                          const updated = [...selectedItems, val];
                                          handleValueChange(idx, updated.join(', '));
                                          setCustomTagInput('');
                                        }
                                      }}
                                      className="px-2 py-1 bg-[#003F28] text-white text-[9px] font-bold rounded hover:bg-[#003220]"
                                    >
                                      Add
                                    </button>
                                  </div>

                                  <div className="max-h-36 overflow-y-auto space-y-0.5 border border-slate-100 rounded p-1">
                                    {masterOptions
                                      .filter(opt => !multiSelectSearch || opt.toLowerCase().includes(multiSelectSearch.toLowerCase()))
                                      .map(opt => {
                                        const isChecked = selectedItems.includes(opt);
                                        return (
                                          <label
                                            key={opt}
                                            className={`flex items-center justify-between px-1.5 py-1 text-[10.5px] rounded cursor-pointer transition-colors ${
                                              isChecked ? 'bg-emerald-50 text-emerald-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                                            }`}
                                          >
                                            <span className="truncate mr-2">{opt}</span>
                                            <input
                                              type="checkbox"
                                              checked={isChecked}
                                              onChange={() => {
                                                let updated;
                                                if (isChecked) {
                                                  updated = selectedItems.filter(x => x !== opt);
                                                } else {
                                                  updated = [...selectedItems, opt];
                                                }
                                                handleValueChange(idx, updated.join(', '));
                                              }}
                                              className="rounded text-[#003F28] focus:ring-[#003F28] h-3 w-3 cursor-pointer"
                                            />
                                          </label>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="text"
                                list={`list-${idx}-${cond.field}`}
                                value={cond.value}
                                onChange={e => handleValueChange(idx, e.target.value)}
                                placeholder={`Select or type ${cond.field}...`}
                                className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] shadow-2xs"
                              />
                              <datalist id={`list-${idx}-${cond.field}`}>
                                {masterOptions.map((opt, oIdx) => (
                                  <option key={oIdx} value={opt} />
                                ))}
                              </datalist>
                            </div>
                          )}
                        </div>
                      )}

                      {/* GENERIC TEXT INPUT */}
                      {fieldType === 'text' && (
                        <input
                          type="text"
                          value={cond.value}
                          onChange={e => handleValueChange(idx, e.target.value)}
                          placeholder={`Enter ${cond.field}...`}
                          className="w-full text-[11px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] shadow-2xs"
                        />
                      )}
                    </div>

                    {/* 4. Delete Row Button */}
                    <div className="shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteCondition(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-md transition-colors cursor-pointer shadow-2xs"
                        title="Delete this condition row"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {rowError && (
                    <p className="text-[9.5px] font-bold text-rose-600 pl-1 flex items-center gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> {rowError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Condition & Clear Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleAddCondition}
              disabled={conditions.length >= 10}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 text-[#003F28] font-bold text-[10.5px] rounded-md transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span>Add Condition ({conditions.length}/10)</span>
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 font-bold text-[10.5px] rounded-md transition-colors shadow-2xs cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear All</span>
            </button>
          </div>
        </section>

        {/* 5. RULE PREVIEW (Compact) */}
        <section className="bg-white border border-slate-200/80 rounded-lg p-3.5 shadow-2xs space-y-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="h-4.5 w-4.5 rounded bg-emerald-50 text-[#003F28] flex items-center justify-center font-black text-[10px]">
                4
              </div>
              <h2 className="text-[10.5px] font-black uppercase tracking-wider text-slate-800">
                Rule Preview
              </h2>
            </div>
            <span className="text-[9px] font-bold text-slate-400 uppercase">Live Evaluation</span>
          </div>

          {previewData.isComplete ? (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 font-mono text-[10.5px]">
              {/* IF BLOCK */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="bg-[#003F28] text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider">
                    IF
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 font-sans">
                    Synced document matches ({matchType === 'ANY' ? 'any condition' : 'all conditions'}):
                  </span>
                </div>

                <div className="pl-5 space-y-0.5">
                  {previewData.formattedConditions.map((fc, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1 text-slate-800">
                      {i > 0 && (
                        <span className={`text-[8.5px] font-black uppercase px-1 py-0.2 rounded ${
                          matchType === 'ANY' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                        }`}>
                          {matchType === 'ANY' ? 'OR' : 'AND'}
                        </span>
                      )}
                      <span className="font-bold text-slate-900 font-sans">{fc.fieldLabel}</span>
                      <span className="text-slate-500 font-sans italic">{fc.operatorLabel}</span>
                      <span className="font-black text-[#003F28] font-mono bg-emerald-50 px-1 py-0.2 rounded border border-emerald-100">
                        {fc.valueLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* THEN BLOCK */}
              <div className="pt-1.5 border-t border-slate-200/80 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider">
                    THEN
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 font-sans">
                    Workflow Routing Action:
                  </span>
                </div>

                <div className="pl-5 space-y-0.5 font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium text-[10.5px]">Route to:</span>
                    <span className="font-black text-slate-900 text-[11px] bg-white border border-slate-200 px-1.5 py-0.2 rounded shadow-2xs">
                      {previewData.targetWorkflowName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-medium text-[10.5px]">Workflow Code:</span>
                    <span className="font-mono font-bold text-[#003F28] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[10.5px]">
                      {previewData.workflowCode}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center">
              <p className="text-[10.5px] font-bold text-slate-500">
                Complete all conditions to preview this rule.
              </p>
              <p className="text-[9.5px] text-slate-400 mt-0.5 font-medium">
                Missing required items: {previewData.issues.join(', ')}
              </p>
            </div>
          )}
        </section>

        {/* 6. SAVE / CANCEL (Compact) */}
        <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-lg p-3 shadow-2xs">
          <button
            type="button"
            onClick={handleCancel}
            className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-[11px] rounded-md transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2.5">
            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
              Changes route matching synced documents automatically.
            </span>
            <button
              type="button"
              onClick={handleSaveCondition}
              disabled={isSaving}
              className="px-4 py-1.5 bg-[#003F28] hover:bg-[#003220] disabled:opacity-50 text-white font-bold text-[11px] rounded-md transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="h-3 w-3" />
              <span>{isSaving ? 'Saving...' : 'Save Condition'}</span>
            </button>
          </div>
        </div>

        {/* MODAL: CLEAR ALL CONFIRMATION */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-100">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xs overflow-hidden p-4 text-center space-y-3">
              <div className="h-9 w-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Clear All Conditions?</h3>
                <p className="text-[10.5px] text-slate-500 mt-0.5 font-medium">
                  This will reset configured conditions on this rule.
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-md transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmClearAll}
                  className="flex-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-md transition shadow-2xs"
                >
                  Yes, Clear All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD CUSTOM FIELD */}
        {showAddFieldModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-100">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <h3 className="text-xs font-black text-slate-900">Add Custom Condition Field</h3>
                <button
                  type="button"
                  onClick={() => setShowAddFieldModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[9.5px] font-bold text-slate-700 uppercase tracking-wider mb-0.5">
                    Field Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={newFieldNameInput}
                    onChange={e => setNewFieldNameInput(e.target.value)}
                    placeholder="e.g. Project Code, Region"
                    className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28]"
                  />
                </div>

                <div>
                  <label className="block text-[9.5px] font-bold text-slate-700 uppercase tracking-wider mb-0.5">
                    Field Data Type
                  </label>
                  <select
                    value={newFieldTypeInput}
                    onChange={e => setNewFieldTypeInput(e.target.value)}
                    className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28]"
                  >
                    <option value="text">Text / String</option>
                    <option value="number">Number / Amount</option>
                    <option value="select">Dropdown / Select</option>
                    <option value="date">Date</option>
                    <option value="boolean">Boolean (Yes/No)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-1.5 pt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddFieldModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-md transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newFieldNameInput.trim()}
                  onClick={() => {
                    const cleanName = newFieldNameInput.trim();
                    if (!cleanName) return;
                    const newFieldObj = {
                      id: cleanName,
                      label: cleanName,
                      type: newFieldTypeInput
                    };
                    const updated = [...availableFields, newFieldObj];
                    setAvailableFields(updated);
                    try {
                      localStorage.setItem("docuflow_custom_condition_fields", JSON.stringify(updated));
                    } catch {}

                    if (addFieldTargetIdx !== null && conditions[addFieldTargetIdx]) {
                      const updatedConds = [...conditions];
                      const validOps = OPERATORS_BY_TYPE[newFieldTypeInput] || OPERATORS_BY_TYPE.text;
                      updatedConds[addFieldTargetIdx] = {
                        field: cleanName,
                        operator: validOps[0].value,
                        value: ''
                      };
                      setConditions(updatedConds);
                    }
                    setShowAddFieldModal(false);
                    setNewFieldNameInput('');
                  }}
                  className="px-3 py-1.5 bg-[#003F28] hover:bg-[#003220] disabled:opacity-50 text-white font-bold text-[11px] rounded-md transition shadow-2xs"
                >
                  Add Field
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // =========================================================================
  // VIEW 2: DIRECTORY / LIST VIEW (FULL-WIDTH RESPONSIVE ENTERPRISE GRID)
  // =========================================================================
  const filteredRules = rules.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.rule_name || '').toLowerCase().includes(q) ||
      (r.target_workflow_id || '').toLowerCase().includes(q) ||
      (r.document_type || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4 w-full pb-10">
      {/* Top Header Bar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {selectedCategory && (
            <button
              onClick={() => {
                if (selectedSubCategory) setSelectedSubCategory(null);
                else setSelectedCategory(null);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                Condition Policy Matrix
              </h1>
              <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                {rules.length} Rules Active
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {selectedCategory 
                ? `Showing rules under ${selectedCategory}`
                : "Manage workflow routing condition policies for synced documents."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search condition rules..."
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28] font-medium transition"
            />
          </div>

          <button
            onClick={() => openEditor(null)}
            className="px-3.5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white font-bold text-xs rounded-lg transition shadow-2xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Condition</span>
          </button>
        </div>
      </div>

      {/* Rules Grid (Responsive: 3 cols desktop, 2 cols tablet, 1 col mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 w-full items-stretch">
        {filteredRules.map((r, idx) => {
          let parsed = { conditions: [] };
          try { parsed = JSON.parse(r.conditions_json); } catch {}
          const condList = Array.isArray(parsed) ? parsed : (parsed?.conditions || []);
          const targetWf = workflows.find(w => w.profile_name === r.target_workflow_id || w.workflow_code === r.target_workflow_id);

          return (
            <div 
              key={r.id} 
              className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-sm hover:border-emerald-300 transition-all flex flex-col justify-between h-full group"
            >
              {/* Card Top / Header */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9.5px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded uppercase tracking-wider border border-slate-200/60">
                    Priority {idx + 1}
                  </span>
                  <span className="text-[9.5px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 uppercase tracking-wider">
                    {condList.length} Condition{condList.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Rule Title & Doc Type */}
                <div className="mt-2.5">
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight leading-snug line-clamp-1" title={r.rule_name}>
                    {r.rule_name || 'Unnamed Condition'}
                  </h3>
                  <span className="inline-block text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5">
                    {r.document_type || 'AP Invoice'}
                  </span>
                </div>

                {/* Compact Condition Rows/Chips */}
                <div className="space-y-1.5 mt-3">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 block">
                    Conditions
                  </span>
                  <div className="space-y-1.5">
                    {condList.slice(0, 4).map((c, ci) => (
                      <div 
                        key={ci} 
                        className="flex items-center justify-between text-xs bg-slate-50/90 border border-slate-200/80 rounded-lg px-2.5 py-1.5 gap-2"
                      >
                        <span className="font-semibold text-slate-800 truncate max-w-[45%]" title={c.field}>
                          {c.field}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-500 px-1.5 py-0.5 rounded bg-white border border-slate-200 shrink-0">
                          {c.operator === 'greater_than_or_equal' || c.operator === '>=' ? '≥' :
                           c.operator === 'less_than_or_equal' || c.operator === '<=' ? '≤' :
                           c.operator === 'equals' || c.operator === '==' ? '=' :
                           c.operator === 'not_equals' || c.operator === '!=' ? '≠' :
                           c.operator === 'greater_than' || c.operator === '>' ? '>' :
                           c.operator === 'less_than' || c.operator === '<' ? '<' :
                           c.operator}
                        </span>
                        <span className="font-bold text-slate-900 truncate max-w-[40%] text-right font-mono" title={String(c.value)}>
                          {String(c.value)}
                        </span>
                      </div>
                    ))}
                    {condList.length > 4 && (
                      <div className="text-[10px] font-bold text-slate-400 text-center py-0.5">
                        +{condList.length - 4} more condition{condList.length - 4 !== 1 ? 's' : ''}
                      </div>
                    )}
                    {condList.length === 0 && (
                      <div className="text-[11px] text-slate-400 italic py-1">
                        No specific conditions configured (Matches all {r.document_type || 'documents'})
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer: Target Workflow & Actions */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div 
                  onClick={() => {
                    localStorage.setItem("adminActiveTab", "routing");
                    if (targetWf) {
                      localStorage.setItem("docuflow_target_workflow_open", targetWf.profile_name);
                    }
                    window.dispatchEvent(new CustomEvent("set-admin-tab", { detail: "routing" }));
                    if (targetWf) {
                      window.dispatchEvent(new CustomEvent("open-workflow-editor", { detail: { profile_name: targetWf.profile_name } }));
                    }
                  }}
                  className="flex items-center gap-1.5 truncate min-w-0 flex-1 hover:text-emerald-700 cursor-pointer transition-colors group/wf" 
                  title={targetWf ? `Click to view workflow: ${targetWf.workflow_code || 'WF'} - ${targetWf.profile_name}` : (r.target_workflow_id || 'Unassigned')}
                >
                  <GitMerge className="h-3.5 w-3.5 text-[#003F28] shrink-0 group-hover/wf:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-slate-700 truncate group-hover/wf:text-emerald-800">
                    {targetWf ? (
                      <>
                        <span className="font-bold text-slate-900">{targetWf.workflow_code || 'WF'}</span>
                        <span className="text-slate-400 mx-1">&bull;</span>
                        <span>{targetWf.profile_name}</span>
                      </>
                    ) : (
                      <span className="font-bold text-slate-800">{r.target_workflow_id || 'Unassigned Flow'}</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditor(r)}
                    className="p-1.5 text-slate-400 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition cursor-pointer"
                    title="Edit Condition Policy"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTarget(r.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                    title="Delete Condition Policy"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty Search State */}
      {filteredRules.length === 0 && rules.length > 0 && (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center space-y-2">
          <p className="text-xs font-bold text-slate-700">No condition policies matched "{searchQuery}"</p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-xs font-semibold text-emerald-800 hover:underline cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      )}

      {/* Global Empty State */}
      {rules.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2.5 w-full">
          <div className="h-9 w-9 rounded-full bg-emerald-50 text-[#003F28] flex items-center justify-center mx-auto">
            <Sliders className="h-5 w-5" />
          </div>
          <h3 className="text-xs font-black text-slate-800">No Routing Conditions Configured</h3>
          <p className="text-[10.5px] text-slate-500 max-w-xs mx-auto">
            Create your first condition rule to route synced documents to their matching workflow approval processes.
          </p>
          <button
            onClick={() => openEditor(null)}
            className="px-3.5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white font-bold text-xs rounded-lg transition shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Condition</span>
          </button>
        </div>
      )}

      {/* Delete Rule Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-100">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs overflow-hidden p-4 text-center space-y-3">
            <div className="h-9 w-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Delete Condition Rule?</h3>
              <p className="text-[10.5px] text-slate-500 mt-0.5 font-medium">
                Are you sure you want to delete this routing condition? Synced documents matching this rule will no longer be routed to this workflow.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-md transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (handleDeleteRuleLocal) {
                    handleDeleteRuleLocal(deleteConfirmTarget);
                  } else {
                    setRules(rules.filter(r => r.id !== deleteConfirmTarget));
                    setHasChanges(true);
                  }
                  setDeleteConfirmTarget(null);
                }}
                className="flex-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] rounded-md transition shadow-2xs"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Condition Saved Success Modal */}
      {savedConditionSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-900 text-sm">
                  Condition Rule Saved Successfully!
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Rule <strong>"{savedConditionSuccessModal.rule_name}"</strong> has been saved and linked to workflow <strong>"{savedConditionSuccessModal.target_workflow_id}"</strong>.
                </p>
                <div className="mt-3 bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-3 text-xs text-emerald-950 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-xs text-emerald-900">
                    <GitMerge className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Routing Rule Active</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-snug">
                    Documents matching this condition will now automatically route through this workflow. Would you like to return to Flow Builder?
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSavedConditionSuccessModal(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              >
                Stay in Condition Matrix
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavedConditionSuccessModal(null);
                  localStorage.setItem("adminActiveTab", "routing");
                  window.dispatchEvent(new CustomEvent("set-admin-tab", { detail: "routing" }));
                }}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#003F28] hover:bg-[#002f1e] rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>Back to Flow Builder</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
