import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Edit2, Trash2, X, ArrowRight, Search, 
  AlertTriangle, GitMerge, CheckCircle2, ChevronDown, Check, 
  ArrowLeft, Layers, Sliders, Clipboard, Copy, GripVertical, Link2
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
    { value: 'less than or equal', label: 'Less Than or Equal (≤)' },
    { value: 'between', label: 'Between' }
  ],
  text: [
    { value: 'equals', label: 'Equals (=)' },
    { value: 'not equals', label: 'Not Equal (≠)' },
    { value: 'contains', label: 'Contains' },
    { value: 'does not contain', label: 'Does Not Contain' },
    { value: 'is empty', label: 'Is Empty' },
    { value: 'is not empty', label: 'Is Not Empty' }
  ],
  select: [
    { value: 'equals', label: 'Equals (=)' },
    { value: 'not equals', label: 'Not Equal (≠)' },
    { value: 'contains', label: 'Contains' },
    { value: 'does not contain', label: 'Does Not Contain' },
    { value: 'is empty', label: 'Is Empty' },
    { value: 'is not empty', label: 'Is Not Empty' }
  ],
  date: [
    { value: 'equals', label: 'Equals (=)' },
    { value: 'not equals', label: 'Not Equal (≠)' },
    { value: 'before', label: 'Before' },
    { value: 'on or before', label: 'On or Before' },
    { value: 'after', label: 'After' },
    { value: 'on or after', label: 'On or After' },
    { value: 'between', label: 'Between' }
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
  if (o === 'between') return 'between';
  if (o === 'is empty' || o === 'empty' || o === 'is_empty' || o === 'null') return 'is empty';
  if (o === 'is not empty' || o === 'not empty' || o === 'is_not_empty' || o === 'not null') return 'is not empty';
  if (o === 'contains any of' || o === 'in' || o === 'is one of' || o === 'contains') return 'contains';
  if (o === 'not in' || o === 'is not one of' || o === 'does not contain' || o === 'not contains') return 'does not contain';
  if (o === 'starts_with' || o === 'starts with') return 'contains';
  if (o === 'ends_with' || o === 'ends with') return 'contains';
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
  const [isWorkflowLinkedContext, setIsWorkflowLinkedContext] = useState(false);
  const [linkedWorkflowContext, setLinkedWorkflowContext] = useState(null);

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
  const [valueListModalIdx, setValueListModalIdx] = useState(null);
  const [valueListSearch, setValueListSearch] = useState('');
  const [valueListBulkInput, setValueListBulkInput] = useState('');
  const [workflowNotice, setWorkflowNotice] = useState(null);

  // Detect active rules that share the exact same priority and potential overlapping conditions
  const overlappingWarnings = useMemo(() => {
    const warnings = [];
    const activeRules = (rules || []).filter(r => r.is_active !== false && !r.is_deleted);
    for (let i = 0; i < activeRules.length; i++) {
      for (let j = i + 1; j < activeRules.length; j++) {
        const r1 = activeRules[i];
        const r2 = activeRules[j];
        if (Number(r1.priority || 10) === Number(r2.priority || 10)) {
          // Check if document_type overlaps
          const dt1 = (r1.document_type || 'AP INVOICE').toUpperCase().trim();
          const dt2 = (r2.document_type || 'AP INVOICE').toUpperCase().trim();
          if (dt1 === dt2 || !dt1 || !dt2) {
            warnings.push({
              r1Name: r1.rule_name,
              r2Name: r2.rule_name,
              priority: r1.priority || 10,
              docType: dt1 || dt2
            });
          }
        }
      }
    }
    return warnings;
  }, [rules]);

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
        } else if (res.status === 403) {
          setWorkflowNotice("Notice: You lack 'workflow:read' permission to view target workflow profiles.");
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
      const wfId = e?.detail?.workflow_id || localStorage.getItem("docuflow_target_condition_wf_id");
      const wfCode = e?.detail?.workflow_code || localStorage.getItem("docuflow_target_condition_wf_code");
      const isLinked = e?.detail?.is_linked_context || localStorage.getItem("docuflow_target_condition_is_linked") === "true";

      if (targetWf) {
        localStorage.removeItem("docuflow_target_condition_wf");
        localStorage.removeItem("docuflow_target_condition_doctype");
        localStorage.removeItem("docuflow_target_condition_wf_id");
        localStorage.removeItem("docuflow_target_condition_wf_code");
        localStorage.removeItem("docuflow_target_condition_is_linked");

        // Inspect existing workflows to find workflow object
        const targetWfObj = workflows.find(w => 
          (wfId && String(w.id) === String(wfId)) ||
          w.profile_name === targetWf || 
          w.workflow_code === targetWf || 
          (wfCode && w.workflow_code === wfCode)
        );

        const linkedMeta = {
          id: wfId || targetWfObj?.id,
          profile_name: targetWfObj?.profile_name || targetWf,
          workflow_code: wfCode || targetWfObj?.workflow_code,
          workflow_type: dt || targetWfObj?.workflow_type,
          workflow_category: targetWfObj?.workflow_category
        };

        // Inspect existing rules to find if this workflow ALREADY has a condition policy
        const existingRule = rules.find(r => 
          (r.target_workflow_id && (
            r.target_workflow_id === targetWf ||
            (targetWfObj && (r.target_workflow_id === targetWfObj.profile_name || r.target_workflow_id === targetWfObj.workflow_code))
          )) ||
          (r.workflow_code && (
            r.workflow_code === targetWf ||
            (targetWfObj && (r.workflow_code === targetWfObj.workflow_code || r.workflow_code === targetWfObj.profile_name))
          )) ||
          (r.rule_name && targetWfObj && r.rule_name.toLowerCase().trim() === targetWfObj.profile_name.toLowerCase().trim()) ||
          (r.rule_name && r.rule_name.toLowerCase().trim() === targetWf.toLowerCase().trim())
        );

        if (existingRule) {
          // Open existing condition policy in edit mode - NEVER duplicate
          openEditor(existingRule, dt || targetWfObj?.workflow_type || existingRule.document_type, targetWfObj?.profile_name || targetWf, isLinked, linkedMeta);
        } else {
          // No condition exists yet, open new condition pre-associated with target workflow
          openEditor(null, dt || targetWfObj?.workflow_type || 'AP Invoice', targetWfObj?.profile_name || targetWf, isLinked, linkedMeta);
        }
      }
    };
    window.addEventListener('open-condition-editor', handleOpenCondition);

    const savedTarget = localStorage.getItem("docuflow_target_condition_wf");
    if (savedTarget) {
      const savedDoc = localStorage.getItem("docuflow_target_condition_doctype");
      const savedWfId = localStorage.getItem("docuflow_target_condition_wf_id");
      const savedWfCode = localStorage.getItem("docuflow_target_condition_wf_code");
      const savedIsLinked = localStorage.getItem("docuflow_target_condition_is_linked") === "true";
      localStorage.removeItem("docuflow_target_condition_wf");
      localStorage.removeItem("docuflow_target_condition_doctype");
      localStorage.removeItem("docuflow_target_condition_wf_id");
      localStorage.removeItem("docuflow_target_condition_wf_code");
      localStorage.removeItem("docuflow_target_condition_is_linked");

      setTimeout(() => {
        const targetWfObj = workflows.find(w => 
          (savedWfId && String(w.id) === String(savedWfId)) ||
          w.profile_name === savedTarget || 
          w.workflow_code === savedTarget || 
          (savedWfCode && w.workflow_code === savedWfCode)
        );

        const linkedMeta = {
          id: savedWfId || targetWfObj?.id,
          profile_name: targetWfObj?.profile_name || savedTarget,
          workflow_code: savedWfCode || targetWfObj?.workflow_code,
          workflow_type: savedDoc || targetWfObj?.workflow_type,
          workflow_category: targetWfObj?.workflow_category
        };

        const existingRule = rules.find(r => 
          (r.target_workflow_id && (
            r.target_workflow_id === savedTarget ||
            (targetWfObj && (r.target_workflow_id === targetWfObj.profile_name || r.target_workflow_id === targetWfObj.workflow_code))
          )) ||
          (r.workflow_code && (
            r.workflow_code === savedTarget ||
            (targetWfObj && (r.workflow_code === targetWfObj.workflow_code || r.workflow_code === targetWfObj.profile_name))
          )) ||
          (r.rule_name && targetWfObj && r.rule_name.toLowerCase().trim() === targetWfObj.profile_name.toLowerCase().trim()) ||
          (r.rule_name && r.rule_name.toLowerCase().trim() === savedTarget.toLowerCase().trim())
        );

        if (existingRule) {
          openEditor(existingRule, savedDoc || targetWfObj?.workflow_type || existingRule.document_type, targetWfObj?.profile_name || savedTarget, savedIsLinked, linkedMeta);
        } else {
          openEditor(null, savedDoc || targetWfObj?.workflow_type || 'AP Invoice', targetWfObj?.profile_name || savedTarget, savedIsLinked, linkedMeta);
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
    if (linkedWorkflowContext) return linkedWorkflowContext;
    if (!targetWorkflowId) return null;
    return workflows.find(w => w.profile_name === targetWorkflowId || w.workflow_code === targetWorkflowId || String(w.id) === String(targetWorkflowId));
  }, [linkedWorkflowContext, targetWorkflowId, workflows]);

  const workflowCode = useMemo(() => {
    if (selectedWorkflowObj) {
      return selectedWorkflowObj.workflow_code || (selectedWorkflowObj.id ? 'WF-' + String(selectedWorkflowObj.id).padStart(3, '0') : 'WF-001');
    }
    return '';
  }, [selectedWorkflowObj]);

  // Open the One-Page Condition Builder for Create or Edit
  const openEditor = (r = null, defaultDocType = null, defaultTargetWf = null, isLinkedContext = false, linkedWfMeta = null) => {
    setValidationErrors({});
    setIsWorkflowLinkedContext(!!isLinkedContext);
    setLinkedWorkflowContext(linkedWfMeta || null);

    if (r) {
      setEditingRule(r);
      const wfTarget = linkedWfMeta?.profile_name || r.target_workflow_id || defaultTargetWf || '';
      const derivedRuleName = isLinkedContext ? (r.rule_name || linkedWfMeta?.profile_name || wfTarget) : (r.rule_name || '');
      setRuleName(derivedRuleName);
      setDocType(r.document_type || defaultDocType || linkedWfMeta?.workflow_type || 'AP Invoice');
      setDescription(r.description || '');
      setRuleCategory(r.rule_category || linkedWfMeta?.workflow_category || selectedCategory || 'Vendor Payment Workflows');
      setTargetWorkflowId(wfTarget);

      const matchedWf = linkedWfMeta || workflows.find(w => w.profile_name === wfTarget || w.workflow_code === wfTarget);
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
      const initialTarget = linkedWfMeta?.profile_name || defaultTargetWf || (workflows.length > 0 ? workflows[0].profile_name : '');
      const matchedWf = linkedWfMeta || workflows.find(w => w.profile_name === initialTarget || w.workflow_code === initialTarget);
      const initialDocType = defaultDocType || linkedWfMeta?.workflow_type || selectedSubCategory || 'AP Invoice';

      setEditingRule({
        id: 'tmp-' + Date.now(),
        is_new: true
      });
      setRuleName(isLinkedContext ? (linkedWfMeta?.profile_name || initialTarget) : (matchedWf ? `${matchedWf.profile_name} Rule` : ''));
      setDocType(initialDocType);
      setDescription('');
      setRuleCategory(linkedWfMeta?.workflow_category || selectedCategory || 'Vendor Payment Workflows');
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

    setConditions(prev => prev.map((c, i) => i === index ? {
      field: newField,
      operator: defaultOp,
      value: initialVal
    } : c));

    if (validationErrors[`row_${index}`]) {
      setValidationErrors(prev => {
        const errs = { ...prev };
        delete errs[`row_${index}`];
        return errs;
      });
    }
  };

  const handleOperatorChange = (index, newOp) => {
    setConditions(prev => prev.map((c, i) => {
      if (i !== index) return c;
      let val = c.value;
      if (newOp === 'is empty' || newOp === 'is not empty') {
        val = '';
      } else if (newOp === 'between') {
        const meta = getFieldMeta(c.field);
        const curVal = String(c.value || '');
        if (!curVal.includes(' - ')) {
          if (meta.type === 'number') {
            const v = curVal && !isNaN(Number(curVal)) ? curVal : '10000';
            val = `${v} - ${Number(v) * 2 || 50000}`;
          } else if (meta.type === 'date') {
            const today = new Date().toISOString().split('T')[0];
            val = `${today} - ${today}`;
          }
        }
      }
      return { ...c, operator: newOp, value: val };
    }));

    if (validationErrors[`row_${index}`]) {
      setValidationErrors(prev => {
        const errs = { ...prev };
        delete errs[`row_${index}`];
        return errs;
      });
    }
  };

  const handleValueChange = (index, newVal) => {
    setConditions(prev => prev.map((c, i) => i === index ? { ...c, value: newVal } : c));

    if (validationErrors[`row_${index}`]) {
      setValidationErrors(prev => {
        const errs = { ...prev };
        delete errs[`row_${index}`];
        return errs;
      });
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

  const handleRemoveCondition = handleDeleteCondition;

  const handleDuplicateCondition = (idx) => {
    if (conditions.length >= 10) return;
    const toCopy = conditions[idx];
    if (!toCopy) return;
    const newConds = [...conditions];
    newConds.splice(idx + 1, 0, { ...toCopy });
    setConditions(newConds);
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
        if (c.operator !== 'is empty' && c.operator !== 'is not empty') {
          if (c.value === undefined || c.value === null || String(c.value).trim() === '') {
            issues.push(`Row ${idx + 1} value`);
          }
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
      if (c.operator === 'is empty') {
        valDisplay = '(is empty)';
      } else if (c.operator === 'is not empty') {
        valDisplay = '(is not empty)';
      } else if (c.operator === 'between') {
        const parts = String(c.value || '').split(' - ');
        if (meta.type === 'number') {
          valDisplay = `${parts[0] ? (meta.isCurrency ? '₹' + Number(parts[0]).toLocaleString('en-IN') : parts[0]) : '0'} to ${parts[1] ? (meta.isCurrency ? '₹' + Number(parts[1]).toLocaleString('en-IN') : parts[1]) : '∞'}`;
        } else {
          valDisplay = `${parts[0] || 'Start'} to ${parts[1] || 'End'}`;
        }
      } else if (meta.isCurrency && c.value && !isNaN(Number(c.value))) {
        valDisplay = `₹${Number(c.value).toLocaleString('en-IN')}`;
      } else if (c.value && c.value.includes(',')) {
        const items = c.value.split(',').map(s => s.trim()).filter(Boolean);
        if (items.length > 3) {
          valDisplay = `${items.slice(0, 3).join(', ')} (+${items.length - 3} more)`;
        } else {
          valDisplay = items.join(', ');
        }
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
        if (!c.field) {
          errors[`row_${idx}`] = 'Field selection is required.';
          return;
        }
        if (!c.operator) {
          errors[`row_${idx}`] = 'Operator selection is required.';
          return;
        }

        const meta = getFieldMeta(c.field);

        // 'is empty' / 'is not empty' do not require a value
        if (c.operator === 'is empty' || c.operator === 'is not empty') {
          return;
        }

        if (c.value === undefined || c.value === null || String(c.value).trim() === '') {
          errors[`row_${idx}`] = 'Value cannot be empty.';
          return;
        }

        if (c.operator === 'between') {
          const parts = String(c.value).split(' - ');
          if (parts.length < 2 || !parts[0].trim() || !parts[1].trim()) {
            errors[`row_${idx}`] = 'Both range values (minimum and maximum) are required.';
            return;
          }
          if (meta.type === 'number') {
            const minNum = Number(parts[0].replace(/,/g, '').trim());
            const maxNum = Number(parts[1].replace(/,/g, '').trim());
            if (isNaN(minNum) || isNaN(maxNum)) {
              errors[`row_${idx}`] = 'Both range values must be valid numbers.';
            } else if (minNum > maxNum) {
              errors[`row_${idx}`] = 'Minimum value cannot be greater than maximum value.';
            }
          } else if (meta.type === 'date') {
            const d1 = new Date(parts[0].trim());
            const d2 = new Date(parts[1].trim());
            if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
              errors[`row_${idx}`] = 'Both range values must be valid dates.';
            } else if (d1 > d2) {
              errors[`row_${idx}`] = 'Start date cannot be after end date.';
            }
          }
        } else if (meta.type === 'number') {
          const cleanNum = String(c.value).replace(/,/g, '').trim();
          if (isNaN(Number(cleanNum)) || cleanNum === '') {
            errors[`row_${idx}`] = 'Value must be a valid number.';
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
        workflow_id: linkedWorkflowContext?.id || selectedWorkflowObj?.id,
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
        const existingIdx = rules.findIndex(r => 
          r.id === savedData.id || 
          r.id === editingRule.id ||
          (r.target_workflow_id && savedData.target_workflow_id && r.target_workflow_id === savedData.target_workflow_id) ||
          (r.rule_name && savedData.rule_name && r.rule_name.toLowerCase().trim() === savedData.rule_name.toLowerCase().trim())
        );
        if (existingIdx !== -1) {
          const updated = [...rules];
          updated[existingIdx] = savedData;
          setRules(updated);
        } else {
          setRules([...rules.filter(r => r.id !== editingRule.id), savedData]);
        }
      } else {
        const fallbackObj = {
          ...editingRule,
          ...rulePayload,
          id: editingRule.id || `tmp-${Date.now()}`
        };
        const existingIdx = rules.findIndex(r => 
          r.id === fallbackObj.id || 
          r.id === editingRule.id ||
          (r.target_workflow_id && fallbackObj.target_workflow_id && r.target_workflow_id === fallbackObj.target_workflow_id) ||
          (r.rule_name && fallbackObj.rule_name && r.rule_name.toLowerCase().trim() === fallbackObj.rule_name.toLowerCase().trim())
        );
        if (existingIdx !== -1) {
          const updated = [...rules];
          updated[existingIdx] = fallbackObj;
          setRules(updated);
        } else {
          setRules([...rules.filter(r => r.id !== editingRule.id), fallbackObj]);
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
  // VIEW 1: ONE-PAGE WORKFLOW CONDITION BUILDER (COMPACT ENTERPRISE SIZING)
  // =========================================================================
  if (editingRule) {
    const selectedWorkflowObj = workflows.find(w => 
      w.profile_name === targetWorkflowId || 
      w.workflow_code === targetWorkflowId ||
      (w.id && String(w.id) === String(targetWorkflowId))
    );
    const derivedWfCode = selectedWorkflowObj?.workflow_code || (targetWorkflowId && targetWorkflowId.startsWith('WF-') ? targetWorkflowId : (workflowCode || 'WF-360'));

    return (
      <div className="flex flex-col gap-3 w-full pb-6 animate-in fade-in duration-150 font-sans">
        {workflowNotice && (
          <div className="px-3 py-1.5 bg-amber-50 border border-amber-300 text-amber-800 text-[11px] rounded-lg flex items-center justify-between">
            <span>⚠️ {workflowNotice}</span>
            <button onClick={() => setWorkflowNotice(null)} className="text-amber-600 hover:text-amber-800 font-bold ml-2">×</button>
          </div>
        )}
        
        {/* Header Bar */}
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-[8.5px] font-extrabold uppercase tracking-widest text-slate-500 mb-0.5">
            <button 
              type="button" 
              onClick={handleCancel}
              className="flex items-center gap-1 text-[#003F28] hover:underline cursor-pointer"
            >
              <span>←Policy Matrix</span>
            </button>
            <span className="text-slate-300">&gt;</span>
            <span className="text-slate-600 font-bold">Configure Condition</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">Configure Condition</h1>
                {editingRule.is_new ? (
                  <span className="text-[8px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded uppercase tracking-wider">
                    New
                  </span>
                ) : (
                  <span className="text-[8px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded uppercase tracking-wider">
                    Editing
                  </span>
                )}
              </div>
              {targetWorkflowId && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 mt-0.5 bg-emerald-50 text-emerald-900 border border-emerald-200/80 rounded text-[9.5px] font-semibold">
                  <GitMerge className="h-3 w-3 text-emerald-700 shrink-0" />
                  <span>Workflow: <strong className="font-bold">{derivedWfCode}</strong> ({selectedWorkflowObj?.profile_name || targetWorkflowId})</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  handleCancel();
                  window.dispatchEvent(new CustomEvent("set-admin-tab", { detail: "routing" }));
                }}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[9px] uppercase tracking-wider rounded transition shadow-2xs flex items-center gap-1 cursor-pointer"
                title="Return to Flow Builder"
              >
                <ArrowLeft className="h-3 w-3" />
                <span>Back to Flow</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[8.5px] uppercase tracking-wide rounded transition shadow-2xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCondition}
                disabled={isSaving}
                className="px-3 py-1 bg-[#003F28] hover:bg-[#002f1e] disabled:opacity-50 text-white font-bold text-[8.5px] uppercase tracking-wide rounded transition shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Condition'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          
          {/* LEFT COLUMN: Section 1 & Section 2 (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            
            {/* 1. CONDITION & TARGET WORKFLOW */}
            <section className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#003F28] text-white flex items-center justify-center text-[9px] font-bold shrink-0">1</span>
                  <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                    Condition &amp; Target Workflow
                  </h2>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Routing Destination</span>
              </div>

              <div className="space-y-3">
                {/* Row 1: Condition Name (2 cols) & Document Type (1 col) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label htmlFor="condNameInput" className="block text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
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
                      placeholder="RULE_RAMRAJ_DEMO_WORKFLOW"
                      className={`w-full text-[10.5px] px-2 py-1 bg-white border rounded font-semibold text-slate-900 outline-none transition-colors shadow-2xs ${
                        validationErrors.ruleName 
                          ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30' 
                          : 'border-slate-200 focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]'
                      }`}
                    />
                    {validationErrors.ruleName && (
                      <p className="text-[9px] font-bold text-rose-600 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> {validationErrors.ruleName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="docTypeSelect" className="block text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
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
                        className={`w-full text-[10.5px] px-2 py-1 pr-6 bg-white border rounded font-medium text-slate-700 outline-none appearance-none cursor-pointer shadow-2xs transition-colors ${
                          validationErrors.docType 
                            ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30' 
                            : 'border-slate-200 focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]'
                        }`}
                      >
                        <option value="">-- Select Type --</option>
                        {STANDARD_DOC_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 2: Category Filter, Target Workflow, Workflow Code */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="wfCategorySelect" className="block text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
                      Category Filter
                    </label>
                    <div className="relative">
                      <select
                        id="wfCategorySelect"
                        value={wfCategoryFilter}
                        onChange={e => setWfCategoryFilter(e.target.value)}
                        className="w-full text-[10.5px] px-2 py-1 pr-6 bg-white border border-slate-200 rounded font-medium text-slate-800 outline-none focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28] appearance-none cursor-pointer shadow-2xs transition-colors"
                      >
                        <option value="ALL">All Categories ({workflows.length})</option>
                        {workflowCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="targetWfSelect" className="block text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
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
                        className={`w-full text-[10.5px] px-2 py-1 pr-6 bg-white border rounded font-semibold text-slate-800 outline-none appearance-none cursor-pointer shadow-2xs transition-colors truncate ${
                          validationErrors.targetWorkflowId
                            ? 'border-rose-400 text-rose-900 focus:border-rose-500'
                            : 'border-slate-200 focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]'
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
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                    </div>
                    {validationErrors.targetWorkflowId && (
                      <p className="text-[9px] font-bold text-rose-600 mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" /> {validationErrors.targetWorkflowId}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
                      Workflow Code
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-[11px] text-slate-900 inline-block shadow-2xs">
                        {derivedWfCode}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded text-[9.5px] font-bold shadow-2xs">
                        <Link2 className="h-3 w-3" />
                        <span>Linked</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Row 3: Description */}
                <div>
                  <label htmlFor="condDescInput" className="block text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
                    Description <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="condDescInput"
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Routes invoices from Ramraj Demo Mills to DEMO_ENTERPRISE_WORKFLOW"
                    className="w-full text-[10.5px] px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 outline-none focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28] shadow-2xs transition-colors"
                  />
                </div>
              </div>
            </section>

            {/* 2. MATCH CONDITIONS */}
            <section className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#003F28] text-white flex items-center justify-center text-[9px] font-bold shrink-0">2</span>
                  <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                    Match Conditions
                  </h2>
                </div>

                {/* Match Logic Selector: ALL vs ANY */}
                <div className="flex items-center gap-1.5 bg-emerald-50/70 border border-emerald-200/80 px-2 py-0.5 rounded-lg">
                  <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500">MATCH:</span>
                  <label className={`flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    matchType === 'ALL' ? 'bg-[#003F28] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}>
                    <input
                      type="radio"
                      name="matchType"
                      checked={matchType === 'ALL'}
                      onChange={() => setMatchType('ALL')}
                      className="sr-only"
                    />
                    <span className={`w-2 h-2 rounded-full border flex items-center justify-center ${
                      matchType === 'ALL' ? 'bg-white border-white' : 'border-slate-400'
                    }`}></span>
                    <span>ALL conditions</span>
                  </label>
                  <label className={`flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    matchType === 'ANY' ? 'bg-[#003F28] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}>
                    <input
                      type="radio"
                      name="matchType"
                      checked={matchType === 'ANY'}
                      onChange={() => setMatchType('ANY')}
                      className="sr-only"
                    />
                    <span className={`w-2 h-2 rounded-full border flex items-center justify-center ${
                      matchType === 'ANY' ? 'bg-white border-white' : 'border-slate-400'
                    }`}></span>
                    <span>ANY condition</span>
                  </label>
                </div>
              </div>

              {validationErrors.conditions && (
                <div className="p-1.5 mb-2 bg-rose-50 border border-rose-200 rounded text-[9.5px] font-bold text-rose-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>{validationErrors.conditions}</span>
                </div>
              )}

              {/* Condition Rows List */}
              <div className="relative pl-5 space-y-2 pt-0.5">
                {/* Connecting vertical line on left when multiple conditions */}
                {conditions.length > 1 && (
                  <div className="absolute left-[9px] top-5 bottom-5 w-[2px] bg-slate-200 -translate-x-1/2" aria-hidden="true" />
                )}

                {conditions.map((cond, idx) => {
                  const fieldMeta = getFieldMeta(cond.field);
                  const fieldType = fieldMeta.type || 'text';
                  const validOperators = OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.text;
                  const rowError = validationErrors[`row_${idx}`];

                  return (
                    <div key={idx} className="relative">
                      {/* Operator Badge between conditions */}
                      {idx > 0 && (
                        <div className="relative -ml-5 flex items-center gap-1.5 py-0.5">
                          <div className="w-4 h-[2px] bg-slate-200" />
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[8.5px] font-bold px-1.5 py-0.2 rounded shadow-2xs">
                            {matchType === 'ANY' ? 'OR' : 'AND'}
                          </span>
                        </div>
                      )}

                      <div className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-all ${
                        rowError 
                          ? 'bg-rose-50/20 border-rose-300' 
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}>
                        {/* Drag grip handle */}
                        <div className="cursor-move p-0.5 text-slate-400 hover:text-slate-600">
                          <GripVertical className="h-3.5 w-3.5" />
                        </div>

                        {/* 1. Field Dropdown */}
                        <div className="w-44 sm:w-48 shrink-0">
                          <div className="relative">
                            <select
                              value={cond.field}
                              onChange={e => handleFieldChange(idx, e.target.value)}
                              className="w-full text-xs font-bold text-slate-800 px-2.5 py-1.5 pr-6 bg-white border border-slate-200 rounded outline-none focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28] appearance-none cursor-pointer shadow-2xs transition-colors"
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
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                          </div>
                        </div>

                        {/* 2. Operator Dropdown */}
                        <div className="w-32 sm:w-36 shrink-0">
                          <div className="relative">
                            <select
                              value={cond.operator}
                              onChange={e => handleOperatorChange(idx, e.target.value)}
                              className="w-full text-xs font-bold text-slate-800 px-2.5 py-1.5 pr-6 bg-white border border-slate-200 rounded outline-none focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28] appearance-none cursor-pointer shadow-2xs transition-colors"
                            >
                              {validOperators.map(op => (
                                <option key={op.value} value={op.value}>{op.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2 top-2 pointer-events-none" />
                          </div>
                        </div>

                        {/* 3. Value Control (Chips & Multi-input) */}
                        <div className="flex-1 min-w-[180px]">
                          {(cond.operator === 'is empty' || cond.operator === 'is not empty') ? (
                            <div className="w-full text-[10px] py-1 px-2 bg-slate-100/80 border border-dashed border-slate-300 rounded text-slate-400 font-semibold italic flex items-center justify-between select-none">
                              <span>No value required ({cond.operator === 'is empty' ? 'empty' : 'non-empty'})</span>
                            </div>
                          ) : (
                            (() => {
                              const selectedItems = cond.value 
                                ? String(cond.value).split(',').map(s => s.trim()).filter(Boolean) 
                                : [];

                              const removeItem = (itemToRemove) => {
                                const next = selectedItems.filter(item => item !== itemToRemove);
                                handleValueChange(idx, next.join(', '));
                              };

                              return (
                                <div 
                                  className="w-full min-h-[30px] px-2 py-1 bg-white border border-slate-200 rounded flex flex-wrap items-center gap-1 focus-within:border-[#003F28] focus-within:ring-1 focus-within:ring-[#003F28] shadow-2xs transition-colors"
                                  onClick={(e) => {
                                    const inputEl = e.currentTarget.querySelector('input');
                                    if (inputEl) inputEl.focus();
                                  }}
                                >
                                  {selectedItems.map((item, itemIdx) => (
                                    <span 
                                      key={itemIdx} 
                                      className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-200 rounded px-1.5 py-0.2 text-[9.5px] font-bold shrink-0 shadow-2xs"
                                    >
                                      <span className="truncate max-w-[120px]" title={item}>{item}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeItem(item);
                                        }}
                                        className="text-emerald-700 hover:text-rose-600 ml-0.5 cursor-pointer"
                                        title="Remove"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </span>
                                  ))}

                                  <input
                                    type="text"
                                    placeholder={selectedItems.length === 0 ? "Search / Add..." : "Add..."}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ',') {
                                        e.preventDefault();
                                        const val = e.currentTarget.value.trim();
                                        if (val) {
                                          const combined = Array.from(new Set([...selectedItems, val]));
                                          handleValueChange(idx, combined.join(', '));
                                          e.currentTarget.value = '';
                                        }
                                      } else if (e.key === 'Backspace' && !e.currentTarget.value && selectedItems.length > 0) {
                                        const next = selectedItems.slice(0, -1);
                                        handleValueChange(idx, next.join(', '));
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const val = e.target.value.trim();
                                      if (val) {
                                        const combined = Array.from(new Set([...selectedItems, val]));
                                        handleValueChange(idx, combined.join(', '));
                                        e.target.value = '';
                                      }
                                    }}
                                    className="flex-1 min-w-[70px] text-xs font-medium text-slate-800 outline-none bg-transparent placeholder-slate-400 py-0"
                                  />
                                </div>
                              );
                            })()
                          )}
                        </div>

                        {/* Actions: Duplicate & Delete */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleDuplicateCondition(idx)}
                            disabled={conditions.length >= 10}
                            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer disabled:opacity-30"
                            title="Duplicate condition"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCondition(idx)}
                            disabled={conditions.length === 1}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer disabled:opacity-30"
                            title="Delete condition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Actions Bar */}
              <div className="flex items-center justify-between pt-3 mt-1.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleAddCondition}
                  disabled={conditions.length >= 10}
                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50/70 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-50 text-[#003F28] font-bold text-[8.5px] uppercase tracking-wide rounded transition shadow-2xs cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Condition ({conditions.length}/10)</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearAll}
                  className="flex items-center gap-1 text-slate-500 hover:text-rose-600 font-bold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded transition cursor-pointer"
                  title="Clear all conditions"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear All</span>
                </button>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: 3 LIVE EVALUATION (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-3 sticky top-2">
            <section className="bg-white rounded-xl border border-slate-200/80 p-3.5 shadow-xs flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-[#003F28] text-white flex items-center justify-center text-[9px] font-bold shrink-0">3</span>
                  <h2 className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                    Live Evaluation
                  </h2>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Routing Preview</span>
              </div>

              {/* IF Section */}
              <div className="bg-slate-50/90 rounded-lg p-3 border border-slate-200/60 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="bg-[#003F28] text-white font-black text-[8px] px-1.5 py-0.2 rounded shadow-2xs uppercase">
                    IF
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">
                    Matches ({matchType === 'ANY' ? 'ANY' : 'ALL'}):
                  </span>
                </div>

                <div className="space-y-1.5 pt-0.5">
                  {conditions.map((cond, cIdx) => {
                    const fMeta = getFieldMeta(cond.field);
                    const validOps = OPERATORS_BY_TYPE[fMeta.type || 'text'] || OPERATORS_BY_TYPE.text;
                    const opObj = validOps.find(o => o.value === cond.operator);
                    const opLabel = opObj ? opObj.label.toLowerCase() : (cond.operator || 'equals');
                    const items = cond.value ? String(cond.value).split(',').map(s => s.trim()).filter(Boolean) : [];

                    return (
                      <React.Fragment key={cIdx}>
                        {cIdx > 0 && (
                          <div className="ml-5 my-0.5">
                            <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[8px] font-bold px-1.5 py-0.2 rounded shadow-2xs">
                              {matchType === 'ANY' ? 'OR' : 'AND'}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="w-4 h-4 rounded bg-white border border-slate-200 text-slate-700 text-[9px] font-bold flex items-center justify-center shadow-2xs shrink-0">
                            {cIdx + 1}
                          </span>
                          <span className="font-bold text-[11px] text-slate-900">
                            {fMeta.label || cond.field}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {opLabel}
                          </span>
                          {items.length > 0 ? (
                            items.map((val, vIdx) => (
                              <span key={vIdx} className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-1.5 py-0.2 rounded shadow-2xs">
                                {val}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              {cond.operator === 'is empty' ? '(Empty)' : cond.operator === 'is not empty' ? '(Not Empty)' : '—'}
                            </span>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* THEN Section */}
              <div className="bg-slate-50/90 rounded-lg p-3 border border-slate-200/60 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="bg-[#003F28] text-white font-black text-[8px] px-1.5 py-0.2 rounded shadow-2xs uppercase">
                    THEN
                  </span>
                  <span className="text-[11px] font-bold text-slate-700">
                    Routing Action:
                  </span>
                </div>

                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-500 min-w-[50px]">Route to:</span>
                    <span className="bg-white border border-slate-200 text-slate-900 font-bold text-[10px] px-2 py-0.5 rounded shadow-2xs inline-block truncate max-w-[200px]">
                      {targetWorkflowId || 'DEMO_ENTERPRISE_WORKFLOW'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-slate-500 min-w-[50px]">Code:</span>
                    <span className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-mono font-bold text-[10px] px-1.5 py-0.2 rounded inline-block">
                      {derivedWfCode}
                    </span>
                  </div>
                </div>
              </div>
            </section>
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

        {/* MODAL: LARGE VALUE LIST MANAGER */}
        {valueListModalIdx !== null && conditions[valueListModalIdx] && (() => {
          const cond = conditions[valueListModalIdx];
          const allItems = cond.value 
            ? cond.value.split(/[\r\n\t,;]+/).map(s => s.trim()).filter(Boolean) 
            : [];
          const filtered = valueListSearch 
            ? allItems.filter(item => item.toLowerCase().includes(valueListSearch.toLowerCase()))
            : allItems;

          return (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-100">
              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
                {/* Modal Header */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md bg-emerald-100 text-[#003F28] flex items-center justify-center font-bold text-xs">
                      <Layers className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900">
                        Manage Values — {cond.field}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-medium">
                        {allItems.length} {allItems.length === 1 ? 'value' : 'values'} configured for rule matching
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setValueListModalIdx(null)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  {/* Search and Filter */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                      <input
                        type="text"
                        value={valueListSearch}
                        onChange={e => setValueListSearch(e.target.value)}
                        placeholder="Filter configured values..."
                        className="w-full pl-8 pr-2.5 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-md outline-none font-bold text-slate-800 focus:border-[#003F28] focus:bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleValueChange(valueListModalIdx, '');
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition cursor-pointer shrink-0"
                    >
                      Clear All
                    </button>
                  </div>

                  {/* Bulk Paste / Quick Add Box */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                      Bulk Paste or Add Values
                    </span>
                    <div className="flex gap-1.5">
                      <textarea
                        rows={2}
                        value={valueListBulkInput}
                        onChange={e => setValueListBulkInput(e.target.value)}
                        placeholder="Paste from Excel, CSV, or type values separated by commas, tabs, or newlines..."
                        className="flex-1 text-[10px] p-1.5 bg-white border border-slate-200 rounded outline-none font-mono text-slate-800 focus:border-[#003F28] resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!valueListBulkInput.trim()) return;
                          const pasted = valueListBulkInput.split(/[\r\n\t,;]+/).map(s => s.trim()).filter(Boolean);
                          const combined = Array.from(new Set([...allItems, ...pasted]));
                          handleValueChange(valueListModalIdx, combined.join(', '));
                          setValueListBulkInput('');
                        }}
                        className="px-3 py-1 bg-[#003F28] hover:bg-[#002f1e] text-white text-[10.5px] font-bold rounded transition cursor-pointer self-stretch flex items-center justify-center shrink-0"
                      >
                        Add Values
                      </button>
                    </div>
                    <p className="text-[8.5px] text-slate-400 font-medium">
                      Automatically splits by newlines, commas, semicolons, tabs, and trims &amp; deduplicates values.
                    </p>
                  </div>

                  {/* Chips Grid */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
                        Configured Values ({filtered.length} shown)
                      </span>
                    </div>

                    {allItems.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded border border-dashed border-slate-200">
                        No values configured yet. Paste or add values above.
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="py-4 text-center text-slate-400 text-[10px] italic">
                        No values match "{valueListSearch}".
                      </div>
                    ) : (
                      <div className="max-h-56 overflow-y-auto p-1 border border-slate-200 rounded-lg bg-slate-50/50 flex flex-wrap gap-1 content-start">
                        {filtered.map((val, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 bg-white text-slate-800 border border-slate-200/90 rounded px-2 py-0.5 text-[10px] font-bold shadow-2xs group"
                          >
                            <span className="truncate max-w-[200px]" title={val}>{val}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const remaining = allItems.filter(item => item !== val);
                                handleValueChange(valueListModalIdx, remaining.join(', '));
                              }}
                              className="text-slate-400 hover:text-rose-600 ml-0.5 transition cursor-pointer"
                              title={`Remove ${val}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-bold">
                    {allItems.length} total items in this condition
                  </span>
                  <button
                    type="button"
                    onClick={() => setValueListModalIdx(null)}
                    className="px-4 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white font-bold text-[11px] rounded-lg transition shadow-2xs cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

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
    <div className="flex flex-col gap-2.5 w-full pb-6">
      {overlappingWarnings.length > 0 && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-300 text-amber-900 text-xs rounded-md flex flex-col gap-1 shadow-2xs">
          <div className="flex items-center gap-1.5 font-bold text-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Rule Conflict Warning: Same Priority &amp; Overlapping Conditions Detected</span>
          </div>
          <div className="text-[11px] text-amber-800/90 pl-5">
            {overlappingWarnings.slice(0, 3).map((w, idx) => (
              <p key={idx}>
                • Rules <strong>&quot;{w.r1Name}&quot;</strong> and <strong>&quot;{w.r2Name}&quot;</strong> share Priority <strong>{w.priority}</strong> for {w.docType}. Deterministic resolution will prioritize the earlier ID.
              </p>
            ))}
            {overlappingWarnings.length > 3 && (
              <p className="text-[10px] text-amber-700 italic mt-0.5">
                + {overlappingWarnings.length - 3} more overlapping rules with identical priority.
              </p>
            )}
          </div>
        </div>
      )}
      {workflowNotice && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 text-xs rounded-md flex items-center justify-between">
          <span>⚠️ {workflowNotice}</span>
          <button onClick={() => setWorkflowNotice(null)} className="text-amber-600 hover:text-amber-800 font-bold ml-2">×</button>
        </div>
      )}
      {/* Top Header Bar */}
      <div className="bg-white border border-slate-200/80 rounded-lg p-2.5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          {selectedCategory && (
            <button
              onClick={() => {
                if (selectedSubCategory) setSelectedSubCategory(null);
                else setSelectedCategory(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-bold text-slate-900 tracking-tight">
                Condition Policy Matrix
              </h1>
              <span className="text-[9.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                {rules.length} Active
              </span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium">
              {selectedCategory 
                ? `Showing rules under ${selectedCategory}`
                : "Manage workflow routing condition policies for synced documents."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="h-3 w-3 text-slate-400 absolute left-2 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search condition rules..."
              className="w-full text-[11px] pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md outline-none focus:bg-white focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28] font-medium transition"
            />
          </div>

          <button
            onClick={() => openEditor(null)}
            className="px-2.5 py-1 bg-[#003F28] hover:bg-[#002f1e] text-white font-bold text-[11px] rounded-md transition shadow-2xs flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Plus className="h-3 w-3" />
            <span>Create Condition</span>
          </button>
        </div>
      </div>

      {/* Rules Grid (Compact Enterprise Grid: 5 cols 2xl, 4 cols xl, 3 cols lg, 2 cols sm) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 w-full items-stretch">
        {filteredRules.map((r, idx) => {
          let parsed = { conditions: [] };
          try { parsed = JSON.parse(r.conditions_json); } catch {}
          const condList = Array.isArray(parsed) ? parsed : (parsed?.conditions || []);
          const targetWf = workflows.find(w => w.profile_name === r.target_workflow_id || w.workflow_code === r.target_workflow_id);

          return (
            <div 
              key={r.id} 
              className="bg-white border border-slate-200/90 rounded-lg p-2.5 shadow-2xs hover:shadow-xs hover:border-emerald-400 transition-all flex flex-col justify-between group"
            >
              {/* Card Top / Header */}
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[8.5px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider border border-slate-200/60">
                    Priority {idx + 1}
                  </span>
                  <span className="text-[8.5px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200/70 uppercase tracking-wider">
                    {condList.length} Criteria
                  </span>
                </div>

                {/* Rule Title & Doc Type */}
                <div className="mt-1.5">
                  <h3 className="font-bold text-slate-900 text-xs tracking-tight leading-snug truncate" title={r.rule_name}>
                    {r.rule_name || 'Unnamed Condition'}
                  </h3>
                  <span className="inline-block text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                    {r.document_type || 'AP Invoice'}
                  </span>
                </div>

                {/* Criteria Identification Tags (Only criteria names for identification) */}
                <div className="mt-2 flex flex-wrap items-center gap-1 min-h-[22px]">
                  {condList.slice(0, 3).map((c, ci) => (
                    <span 
                      key={ci} 
                      className="inline-flex items-center text-[9.5px] font-medium bg-slate-50 text-slate-700 border border-slate-200/70 px-1.5 py-0.5 rounded truncate max-w-[120px]" 
                      title={`${c.field} (${c.operator} ${c.value})`}
                    >
                      {c.field}
                    </span>
                  ))}
                  {condList.length > 3 && (
                    <span className="text-[9px] font-bold text-slate-400 px-1">
                      +{condList.length - 3}
                    </span>
                  )}
                  {condList.length === 0 && (
                    <span className="text-[9.5px] text-slate-400 italic">
                      All {r.document_type || 'Documents'}
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer: Target Workflow & Actions */}
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1">
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
                  className="flex items-center gap-1 truncate min-w-0 flex-1 hover:text-emerald-700 cursor-pointer transition-colors group/wf" 
                  title={targetWf ? `Click to view workflow: ${targetWf.workflow_code || 'WF'} - ${targetWf.profile_name}` : (r.target_workflow_id || 'Unassigned')}
                >
                  <GitMerge className="h-3 w-3 text-[#003F28] shrink-0 group-hover/wf:scale-110 transition-transform" />
                  <span className="text-[10.5px] font-semibold text-slate-700 truncate group-hover/wf:text-emerald-800">
                    {targetWf ? (
                      <>
                        <span className="font-bold text-slate-900">{targetWf.workflow_code || 'WF'}</span>
                        <span className="text-slate-400 mx-0.5">&bull;</span>
                        <span>{targetWf.profile_name}</span>
                      </>
                    ) : (
                      <span className="font-bold text-slate-800">{r.target_workflow_id || 'Unassigned Flow'}</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditor(r)}
                    className="p-1 text-slate-400 hover:text-emerald-800 hover:bg-emerald-50 rounded transition cursor-pointer"
                    title="Edit Condition Policy"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTarget(r.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                    title="Delete Condition Policy"
                  >
                    <Trash2 className="h-3 w-3" />
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
