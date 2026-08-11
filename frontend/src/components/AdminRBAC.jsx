import React, { useState, useEffect } from "react";
import { 
  Shield, 
  Users, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  Loader2,
  User,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckSquare,
  Eye,
  Sliders,
  Lock,
  Sparkles,
  Layers,
  Copy,
  CheckCheck,
  FileSpreadsheet,
  Globe,
  Tag
} from "lucide-react";

// Standard Baseline Roles
export const INITIAL_ROLES = [
  { id: "admin", name: "Administrator", badge: "Admin", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { id: "manager", name: "Approver / Manager", badge: "Manager", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "auditor", name: "Internal Auditor", badge: "Auditor", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "ap_specialist", name: "AP Specialist", badge: "AP Staff", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "employee", name: "General Employee", badge: "Employee", color: "bg-slate-100 text-slate-700 border-slate-200" }
];

// Clean functional permission list categorized into Folders
const INITIAL_PERMISSIONS = [
  {
    id: "cat_docs",
    category: "Documents & OCR Extraction",
    icon: "Folder",
    items: [
      { id: "doc:upload", label: "Upload Documents", desc: "Upload and batch ingest vendor invoices" },
      { id: "doc:verify", label: "OCR Verification Desk", desc: "Verify extracted fields & line items" },
      { id: "doc:edit", label: "Edit & Field Overrides", desc: "Modify monetary values, HSN, and tax codes" },
      { id: "doc:delete", label: "Delete / Purge Drafts", desc: "Remove draft records and recalled files" }
    ]
  },
  {
    id: "cat_wf",
    category: "Workflow & Approvals Routing",
    icon: "Folder",
    items: [
      { id: "wf:view", label: "View Task Queue", desc: "Access pending task list and SLA timers" },
      { id: "wf:approve", label: "Approve / Reject Action", desc: "Sign off or return workflow approval stages" },
      { id: "wf:delegate", label: "Delegate Signoff", desc: "Assign approval duties to backup peers" },
      { id: "wf:force", label: "Fast-Track & Emergency Route", desc: "Emergency route bypass & manual escalation" }
    ]
  },
  {
    id: "cat_audit",
    category: "Financial System Audits & Tax",
    icon: "Folder",
    items: [
      { id: "audit:trail", label: "Audit Log Inspection", desc: "View system immutable event trail and IP logs" },
      { id: "audit:signoff", label: "Internal Audit (IA) Signoff", desc: "Final pre-posting audit verification" },
      { id: "audit:export", label: "Export Financial Reports", desc: "Download ledger CSV & tax data schedules" }
    ]
  },
  {
    id: "cat_sys",
    category: "IAM & System Governance",
    icon: "Folder",
    items: [
      { id: "sys:flows", label: "Flow Builder Engine", desc: "Create and edit multi-stage workflow routes" },
      { id: "sys:rules", label: "Routing Rule Matrix", desc: "Configure conditional AND/OR routing rules" },
      { id: "sys:rbac", label: "IAM Role & Access Matrix", desc: "Modify roles and user clearance permissions" }
    ]
  }
];

const INITIAL_ROLE_PERMS = {
  admin: {
    "doc:upload": { read: true, write: true, admin: true },
    "doc:verify": { read: true, write: true, admin: true },
    "doc:edit": { read: true, write: true, admin: true },
    "doc:delete": { read: true, write: true, admin: true },
    "wf:view": { read: true, write: true, admin: true },
    "wf:approve": { read: true, write: true, admin: true },
    "wf:delegate": { read: true, write: true, admin: true },
    "wf:force": { read: true, write: true, admin: true },
    "audit:trail": { read: true, write: true, admin: true },
    "audit:signoff": { read: true, write: true, admin: true },
    "audit:export": { read: true, write: true, admin: true },
    "sys:flows": { read: true, write: true, admin: true },
    "sys:rules": { read: true, write: true, admin: true },
    "sys:rbac": { read: true, write: true, admin: true }
  },
  manager: {
    "doc:upload": { read: true, write: true, admin: false },
    "doc:verify": { read: true, write: true, admin: false },
    "doc:edit": { read: true, write: false, admin: false },
    "doc:delete": { read: false, write: false, admin: false },
    "wf:view": { read: true, write: true, admin: false },
    "wf:approve": { read: true, write: true, admin: true },
    "wf:delegate": { read: true, write: true, admin: false },
    "wf:force": { read: false, write: false, admin: false },
    "audit:trail": { read: true, write: false, admin: false },
    "audit:signoff": { read: false, write: false, admin: false },
    "audit:export": { read: true, write: false, admin: false },
    "sys:flows": { read: false, write: false, admin: false },
    "sys:rules": { read: false, write: false, admin: false },
    "sys:rbac": { read: false, write: false, admin: false }
  },
  auditor: {
    "doc:upload": { read: true, write: false, admin: false },
    "doc:verify": { read: true, write: true, admin: false },
    "doc:edit": { read: true, write: false, admin: false },
    "doc:delete": { read: false, write: false, admin: false },
    "wf:view": { read: true, write: false, admin: false },
    "wf:approve": { read: true, write: false, admin: false },
    "wf:delegate": { read: false, write: false, admin: false },
    "wf:force": { read: false, write: false, admin: false },
    "audit:trail": { read: true, write: true, admin: true },
    "audit:signoff": { read: true, write: true, admin: true },
    "audit:export": { read: true, write: true, admin: false },
    "sys:flows": { read: true, write: false, admin: false },
    "sys:rules": { read: true, write: false, admin: false },
    "sys:rbac": { read: false, write: false, admin: false }
  },
  ap_specialist: {
    "doc:upload": { read: true, write: true, admin: false },
    "doc:verify": { read: true, write: true, admin: true },
    "doc:edit": { read: true, write: true, admin: false },
    "doc:delete": { read: false, write: false, admin: false },
    "wf:view": { read: true, write: true, admin: false },
    "wf:approve": { read: false, write: false, admin: false },
    "wf:delegate": { read: false, write: false, admin: false },
    "wf:force": { read: false, write: false, admin: false },
    "audit:trail": { read: true, write: false, admin: false },
    "audit:signoff": { read: false, write: false, admin: false },
    "audit:export": { read: true, write: true, admin: false },
    "sys:flows": { read: false, write: false, admin: false },
    "sys:rules": { read: false, write: false, admin: false },
    "sys:rbac": { read: false, write: false, admin: false }
  },
  employee: {
    "doc:upload": { read: true, write: true, admin: false },
    "doc:verify": { read: true, write: false, admin: false },
    "doc:edit": { read: false, write: false, admin: false },
    "doc:delete": { read: false, write: false, admin: false },
    "wf:view": { read: true, write: false, admin: false },
    "wf:approve": { read: false, write: false, admin: false },
    "wf:delegate": { read: false, write: false, admin: false },
    "wf:force": { read: false, write: false, admin: false },
    "audit:trail": { read: false, write: false, admin: false },
    "audit:signoff": { read: false, write: false, admin: false },
    "audit:export": { read: false, write: false, admin: false },
    "sys:flows": { read: false, write: false, admin: false },
    "sys:rules": { read: false, write: false, admin: false },
    "sys:rbac": { read: false, write: false, admin: false }
  }
};

// 1. FLAC HIERARCHICAL TARGET SCOPES (GLOBAL + CATEGORIES + FLOWS)
export const FLAC_SCOPES = [
  { id: "GLOBAL", name: "Global Master Baseline (Default for all 50+ flows)", badge: "Global Base", isGlobal: true, desc: "Automatic baseline inherited by all 50+ workflows unless customized" },
  { id: "CAT_INVOICE", name: "AP Invoices (Standard Bills & Services)", badge: "Invoices (25 flows)", desc: "Standard Vendor Invoices, Service Bills & Material Receipts" },
  { id: "CAT_CAPEX", name: "Capex & Machinery Assets", badge: "Capex (10 flows)", desc: "Capital equipment, machinery, hardware, and long-term asset purchasing" },
  { id: "CAT_DEBIT_CREDIT", name: "Debit & Credit Notes", badge: "Notes (8 flows)", desc: "Purchase returns, rate adjustments, damaged goods and discount memos" },
  { id: "CAT_UTILITIES", name: "Utilities, Rent & Facilities (CAM)", badge: "Utilities (12 flows)", desc: "Electricity bills, branch rental leases, telecom, internet & facilities" },
  { id: "CAT_PO", name: "Purchase Orders (PO Requisitions)", badge: "POs (5 flows)", desc: "Internal requisitions and vendor purchasing agreements" },
  { id: "CAT_GRN", name: "Goods Receipts (GRN Inward)", badge: "GRN (6 flows)", desc: "Warehouse gate inward, DC receipt, and quantity verification" }
];

// Baseline Field Schema Definitions
export const SCOPE_FIELDS = {
  GLOBAL: [
    { id: "vendor_name", label: "Supplier / Vendor Name", category: "Header Identification", desc: "Vendor entity name & KYC verification badge" },
    { id: "invoice_num_date", label: "Bill No & Date", category: "Header Identification", desc: "Invoice reference number and document invoice date" },
    { id: "po_reference", label: "PO Reference", category: "Header Identification", desc: "Purchase order mapping reference & verified state" },
    { id: "total_gross", label: "Total Gross (₹)", category: "Financial Breakdown", desc: "Total payable gross invoice value in currency" },
    { id: "base_taxable", label: "Base Taxable Amount", category: "Financial Breakdown", desc: "Net pre-tax taxable component" },
    { id: "gst_tax", label: "GST (18%) Breakdown", category: "Tax & Compliance", desc: "Calculated CGST / SGST / IGST tax split" },
    { id: "vendor_gstin", label: "Vendor GSTIN", category: "Tax & Compliance", desc: "15-digit GST identification number" },
    { id: "cost_center", label: "Cost Center / Division", category: "Enterprise Routing", desc: "Assigned departmental cost center and division" },
    { id: "payment_terms", label: "Payment Terms", category: "Enterprise Routing", desc: "Payment settlement credit terms (e.g. Net 30)" },
    { id: "erp_sync_data", label: "ERP Data Sync & DocKey", category: "ERP Integration", desc: "Live ERP DocKey, sync status pill and sync modal action" }
  ],
  CAT_CAPEX: [
    { id: "vendor_name", label: "Supplier / Vendor Name", category: "Header Identification", desc: "Asset manufacturer/distributor entity" },
    { id: "asset_code", label: "Asset Tag & Equipment Code", category: "Capex Master", desc: "Capital asset inventory tracking number" },
    { id: "po_reference", label: "Capex PO Approval Ref", category: "Capex Master", desc: "Approved capital expenditure budget requisition" },
    { id: "total_gross", label: "Total Asset Value (₹)", category: "Financial Breakdown", desc: "Total capital investment amount" },
    { id: "depreciation_terms", label: "Depreciation & Warranty Period", category: "Capex Master", desc: "Asset capitalization schedule & warranty" },
    { id: "cost_center", label: "Cost Center / Division", category: "Enterprise Routing", desc: "Plant location & department acquiring the asset" },
    { id: "erp_sync_data", label: "ERP Fixed Asset Ledger Sync", category: "ERP Integration", desc: "SAP Asset Accounting (FI-AA) sync key" }
  ],
  CAT_DEBIT_CREDIT: [
    { id: "vendor_name", label: "Supplier / Vendor Name", category: "Header Identification", desc: "Supplier entity for adjustment" },
    { id: "orig_invoice_ref", label: "Original Invoice Ref", category: "Adjustment Details", desc: "Original billed invoice reference" },
    { id: "total_gross", label: "Adjustment Amount (₹)", category: "Financial Breakdown", desc: "Credit/Debit value adjustment" },
    { id: "adjustment_reason", label: "Return / Rejection Reason", category: "Adjustment Details", desc: "Material damage, price variance or rate mismatch" },
    { id: "gst_tax", label: "GST Adjustment Component", category: "Tax & Compliance", desc: "Input tax credit (ITC) adjustment" },
    { id: "erp_sync_data", label: "ERP Credit/Debit Sync", category: "ERP Integration", desc: "Direct ledger credit memo posting" }
  ],
  CAT_UTILITIES: [
    { id: "vendor_name", label: "Utility Provider / Landlord", category: "Header Identification", desc: "Electricity board, landlord or telecommunications" },
    { id: "consumer_number", label: "Consumer / Meter Number", category: "Utility Master", desc: "Service connection ID or lease agreement ref" },
    { id: "billing_period", label: "Billing Cycle Period", category: "Utility Master", desc: "Month and duration of service" },
    { id: "total_gross", label: "Bill Total Payable (₹)", category: "Financial Breakdown", desc: "Gross utility amount payable" },
    { id: "cost_center", label: "Branch / Plant Unit", category: "Enterprise Routing", desc: "Regional branch or office incurring expense" },
    { id: "erp_sync_data", label: "ERP Opex Expense Sync", category: "ERP Integration", desc: "Opex GL posting key" }
  ]
};

export const INITIAL_GLOBAL_PERMISSIONS = {
  admin: {
    vendor_name: "edit",
    invoice_num_date: "edit",
    po_reference: "edit",
    total_gross: "edit",
    base_taxable: "edit",
    gst_tax: "edit",
    vendor_gstin: "edit",
    cost_center: "edit",
    payment_terms: "edit",
    erp_sync_data: "edit"
  },
  manager: {
    vendor_name: "view",
    invoice_num_date: "view",
    po_reference: "view",
    total_gross: "view",
    base_taxable: "view",
    gst_tax: "view",
    vendor_gstin: "view",
    cost_center: "view",
    payment_terms: "view",
    erp_sync_data: "view"
  },
  auditor: {
    vendor_name: "view",
    invoice_num_date: "view",
    po_reference: "view",
    total_gross: "view",
    base_taxable: "view",
    gst_tax: "view",
    vendor_gstin: "view",
    cost_center: "view",
    payment_terms: "view",
    erp_sync_data: "view"
  },
  ap_specialist: {
    vendor_name: "edit",
    invoice_num_date: "edit",
    po_reference: "edit",
    total_gross: "edit",
    base_taxable: "view",
    gst_tax: "view",
    vendor_gstin: "view",
    cost_center: "edit",
    payment_terms: "edit",
    erp_sync_data: "view"
  },
  employee: {
    vendor_name: "view",
    invoice_num_date: "view",
    po_reference: "view",
    total_gross: "view",
    base_taxable: "hidden",
    gst_tax: "hidden",
    vendor_gstin: "hidden",
    cost_center: "hidden",
    payment_terms: "hidden",
    erp_sync_data: "hidden"
  }
};

const DEFAULT_USERS = [
  { id: "1", name: "Anbu Selvan", email: "admin@initech.com", username: "anbu", role: "admin", dept: "IT Governance" },
  { id: "2", name: "Karthik Natarajan", email: "manager@initech.com", username: "karthik", role: "manager", dept: "Operations" },
  { id: "3", name: "Surya Prakash", email: "executive@initech.com", username: "surya", role: "manager", dept: "Corporate Finance" },
  { id: "4", name: "Priya Sundaram", email: "auditor@initech.com", username: "priya", role: "auditor", dept: "Internal Audit" },
  { id: "5", name: "Vijay Kumar", email: "employee@initech.com", username: "vijay", role: "employee", dept: "General Processing" }
];

export default function AdminRBAC({ onRefreshSignal }) {
  const [activeTab, setActiveTab] = useState("roles"); // "roles" | "users" | "flac"
  const [selectedCategoryDropdown, setSelectedCategoryDropdown] = useState("ALL");
  const [collapsedFolders, setCollapsedFolders] = useState({}); // { [catId]: boolean }

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [roles, setRoles] = useState(INITIAL_ROLES);
  const [permissionsList, setPermissionsList] = useState(INITIAL_PERMISSIONS);
  const [rolePermissions, setRolePermissions] = useState(INITIAL_ROLE_PERMS);
  
  // Hierarchical FLAC state: { [scopeId]: { [roleId]: { [fieldId]: 'hidden'|'view'|'edit' } } }
  const [fieldPermissionsByScope, setFieldPermissionsByScope] = useState({
    GLOBAL: INITIAL_GLOBAL_PERMISSIONS
  });
  const [selectedScope, setSelectedScope] = useState("GLOBAL");
  const [customFields, setCustomFields] = useState({}); // { [scopeId]: Field[] }
  const [showAddCustomFieldModal, setShowAddCustomFieldModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldCategory, setNewFieldCategory] = useState("Custom Extended");
  const [newFieldDesc, setNewFieldDesc] = useState("");

  const [users, setUsers] = useState(DEFAULT_USERS);
  const [selectedUser, setSelectedUser] = useState(DEFAULT_USERS[0]);
  const [userOverrides, setUserOverrides] = useState({});

  const [search, setSearch] = useState("");
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const currentUserRole = (localStorage.getItem("currentUserRole") || "admin").toLowerCase();
  const isAdmin = currentUserRole === "admin" || currentUserRole === "settings_editor";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const [configRes, usersRes] = await Promise.all([
        fetch("/api/admin/config", { headers: token ? { "Authorization": `Bearer ${token}` } : {} }),
        fetch("/api/admin/users", { headers: token ? { "Authorization": `Bearer ${token}` } : {} })
      ]);

      if (configRes.ok) {
        const configs = await configRes.json();
        const matrixCfg = configs.find(c => c.key === "RBAC_GRANULAR_MATRIX");
        if (matrixCfg && matrixCfg.value) {
          try { setRolePermissions(JSON.parse(matrixCfg.value)); } catch(e) {}
        }
        const flacCfg = configs.find(c => c.key === "RBAC_FIELD_PERMISSIONS");
        if (flacCfg && flacCfg.value) {
          try {
            const parsed = JSON.parse(flacCfg.value);
            // Backward compatibility if saved as flat role map
            if (parsed.admin && !parsed.GLOBAL) {
              setFieldPermissionsByScope({ GLOBAL: parsed });
            } else {
              setFieldPermissionsByScope(parsed);
            }
          } catch(e) {}
        }
        const customFieldsCfg = configs.find(c => c.key === "RBAC_CUSTOM_FIELDS");
        if (customFieldsCfg && customFieldsCfg.value) {
          try { setCustomFields(JSON.parse(customFieldsCfg.value)); } catch(e) {}
        }
        const rolesCfg = configs.find(c => c.key === "RBAC_CUSTOM_ROLES");
        if (rolesCfg && rolesCfg.value) {
          try { setRoles(JSON.parse(rolesCfg.value)); } catch(e) {}
        }
        const overridesCfg = configs.find(c => c.key === "UBAC_USER_OVERRIDES");
        if (overridesCfg && overridesCfg.value) {
          try { setUserOverrides(JSON.parse(overridesCfg.value)); } catch(e) {}
        }
      }

      if (usersRes.ok) {
        const userData = await usersRes.json();
        if (Array.isArray(userData) && userData.length > 0) {
          const mapped = userData.map(u => ({
            id: String(u.id),
            name: u.name || u.username,
            email: u.email || `${u.username}@initech.com`,
            username: u.username,
            role: u.role || "employee",
            dept: u.department || "General"
          }));
          setUsers(mapped);
          setSelectedUser(mapped[0]);
        }
      }
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (catId) => {
    setCollapsedFolders(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const handleToggleAllFolders = (expand) => {
    const nextState = {};
    permissionsList.forEach(c => {
      nextState[c.id || c.category] = !expand;
    });
    setCollapsedFolders(nextState);
  };

  const toggleRolePerm = (roleId, permId, level) => {
    if (!isAdmin) {
      setErrorMsg("Action Restricted: Only Administrators can modify RBAC permissions.");
      setTimeout(() => setErrorMsg(""), 3500);
      return;
    }
    setRolePermissions(prev => {
      const currentRole = prev[roleId] || {};
      const currentItem = currentRole[permId] || { read: false, write: false, admin: false };
      const updated = { ...currentItem, [level]: !currentItem[level] };
      
      if ((updated.write || updated.admin) && !updated.read) updated.read = true;
      if (!updated.read) { updated.write = false; updated.admin = false; }

      return {
        ...prev,
        [roleId]: { ...currentRole, [permId]: updated }
      };
    });
  };

  // Set field permission for current scope & role: 'hidden' | 'view' | 'edit'
  const setFieldScopeRolePerm = (roleId, fieldId, state) => {
    if (!isAdmin) {
      setErrorMsg("Action Restricted: Only Administrators can modify field permissions.");
      setTimeout(() => setErrorMsg(""), 3500);
      return;
    }
    setFieldPermissionsByScope(prev => {
      const scopeData = prev[selectedScope] || {};
      const roleData = scopeData[roleId] || (prev.GLOBAL?.[roleId] || {});
      return {
        ...prev,
        [selectedScope]: {
          ...scopeData,
          [roleId]: {
            ...roleData,
            [fieldId]: state
          }
        }
      };
    });
  };

  // Helper to get effective field permission for current scope (with inheritance from GLOBAL)
  const getEffectiveFieldState = (roleId, fieldId) => {
    if (selectedScope !== "GLOBAL" && fieldPermissionsByScope[selectedScope]?.[roleId]?.[fieldId]) {
      return fieldPermissionsByScope[selectedScope][roleId][fieldId];
    }
    // Inherit from GLOBAL
    const globalState = fieldPermissionsByScope.GLOBAL?.[roleId]?.[fieldId];
    if (globalState) return globalState;
    return roleId === "admin" ? "edit" : roleId === "employee" ? "hidden" : "view";
  };

  // Check if current scope has custom overrides
  const isCustomizedScope = selectedScope !== "GLOBAL" && !!fieldPermissionsByScope[selectedScope] && Object.keys(fieldPermissionsByScope[selectedScope]).length > 0;

  // Apply current settings to all 50+ workflows
  const handleApplyToAllFlows = () => {
    if (!isAdmin) return;
    const currentScopePerms = fieldPermissionsByScope[selectedScope] || fieldPermissionsByScope.GLOBAL;
    const updated = { ...fieldPermissionsByScope, GLOBAL: JSON.parse(JSON.stringify(currentScopePerms)) };
    // Propagate to all scopes
    FLAC_SCOPES.forEach(s => {
      updated[s.id] = JSON.parse(JSON.stringify(currentScopePerms));
    });
    setFieldPermissionsByScope(updated);
    setSuccessMsg(`✓ Applied policy to all 50+ workflows! All categories now synchronized.`);
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  // Reset selected scope back to inheriting from GLOBAL master
  const handleResetScopeToGlobal = () => {
    if (!isAdmin) return;
    if (selectedScope === "GLOBAL") return;
    setFieldPermissionsByScope(prev => {
      const updated = { ...prev };
      delete updated[selectedScope];
      return updated;
    });
    setSuccessMsg(`Reset ${FLAC_SCOPES.find(s => s.id === selectedScope)?.name} to inherit from Global Master Baseline.`);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // Add Custom Field dynamically
  const handleAddCustomField = (e) => {
    e.preventDefault();
    if (!isAdmin || !newFieldName.trim()) return;
    const fieldId = newFieldName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newFieldObj = {
      id: fieldId,
      label: newFieldName.trim(),
      category: newFieldCategory.trim() || "Custom Extended",
      desc: newFieldDesc.trim() || "Dynamic custom field added by Administrator"
    };

    setCustomFields(prev => ({
      ...prev,
      [selectedScope]: [...(prev[selectedScope] || []), newFieldObj]
    }));

    setNewFieldName("");
    setNewFieldDesc("");
    setShowAddCustomFieldModal(false);
    setSuccessMsg(`Custom field "${newFieldObj.label}" added to ${selectedScope}! Click Save Changes.`);
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  const toggleUserPerm = (permId, level) => {
    if (!isAdmin) return;
    if (!selectedUser) return;
    const userKey = selectedUser.username || selectedUser.email;
    const userRole = selectedUser.role || "employee";
    const basePerm = rolePermissions[userRole]?.[permId] || { read: false, write: false, admin: false };
    const currentOverride = userOverrides[userKey]?.[permId] || {};

    const currentVal = currentOverride[level] !== undefined ? currentOverride[level] : basePerm[level];
    const nextVal = !currentVal;

    setUserOverrides(prev => ({
      ...prev,
      [userKey]: {
        ...(prev[userKey] || {}),
        [permId]: {
          ...(prev[userKey]?.[permId] || {}),
          [level]: nextVal
        }
      }
    }));
  };

  const resetUserPerm = (permId) => {
    if (!isAdmin || !selectedUser) return;
    const userKey = selectedUser.username || selectedUser.email;
    setUserOverrides(prev => {
      const updated = { ...(prev[userKey] || {}) };
      delete updated[permId];
      return { ...prev, [userKey]: updated };
    });
  };

  const handleUserRoleChange = async (newRole) => {
    if (!isAdmin || !selectedUser) return;
    setSelectedUser(prev => ({ ...prev, role: newRole }));
    setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: newRole } : u));
    
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...selectedUser, role: newRole })
      });
    } catch(e) {}
  };

  const handleAddRole = (e) => {
    e.preventDefault();
    if (!isAdmin || !newRoleName.trim()) return;
    const roleId = newRoleName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newRole = {
      id: roleId,
      name: newRoleName.trim(),
      badge: newRoleName.trim().slice(0, 8),
      color: "bg-indigo-50 text-indigo-700 border-indigo-200"
    };

    setRoles(prev => [...prev, newRole]);
    setRolePermissions(prev => ({
      ...prev,
      [roleId]: JSON.parse(JSON.stringify(prev.employee || {}))
    }));

    setNewRoleName("");
    setShowAddRoleModal(false);
    setSuccessMsg(`Role "${newRole.name}" created! Click Save Changes.`);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleSaveAll = async () => {
    if (!isAdmin) {
      setErrorMsg("Action Restricted: Only Administrators can save permissions.");
      setTimeout(() => setErrorMsg(""), 3500);
      return;
    }
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const token = localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "RBAC_GRANULAR_MATRIX",
          value: JSON.stringify(rolePermissions),
          description: "Role permissions matrix"
        })
      });

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "RBAC_FIELD_PERMISSIONS",
          value: JSON.stringify(fieldPermissionsByScope),
          description: "Hierarchical Field-level access control (FLAC) matrix by workflow scope"
        })
      });

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "RBAC_CUSTOM_FIELDS",
          value: JSON.stringify(customFields),
          description: "Dynamic custom fields configured per scope"
        })
      });

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "RBAC_CUSTOM_ROLES",
          value: JSON.stringify(roles),
          description: "System roles list"
        })
      });

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "UBAC_USER_OVERRIDES",
          value: JSON.stringify(userOverrides),
          description: "User permission overrides"
        })
      });

      setSuccessMsg("✓ All permissions & 50+ workflow policies saved successfully!");
      if (onRefreshSignal) onRefreshSignal();
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch(e) {
      setErrorMsg("Failed to save permissions.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (!isAdmin) return;
    if (window.confirm("Reset all roles, FLAC field permissions and matrix to default baseline?")) {
      setRoles(INITIAL_ROLES);
      setRolePermissions(INITIAL_ROLE_PERMS);
      setFieldPermissionsByScope({ GLOBAL: INITIAL_GLOBAL_PERMISSIONS });
      setUserOverrides({});
    }
  };

  const filteredPermissions = permissionsList
    .filter(cat => selectedCategoryDropdown === "ALL" || (cat.id || cat.category) === selectedCategoryDropdown)
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => 
        item.label.toLowerCase().includes(search.toLowerCase()) ||
        item.desc.toLowerCase().includes(search.toLowerCase()) ||
        cat.category.toLowerCase().includes(search.toLowerCase())
      )
    }))
    .filter(cat => cat.items.length > 0);

  // Active fields for currently selected scope (Base + Scope specifics + Custom fields)
  const activeScopeFields = [
    ...(SCOPE_FIELDS[selectedScope] || SCOPE_FIELDS.GLOBAL),
    ...(customFields[selectedScope] || []),
    ...(selectedScope !== "GLOBAL" ? (customFields.GLOBAL || []) : [])
  ];

  const filteredFields = activeScopeFields.filter(f => 
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.desc.toLowerCase().includes(search.toLowerCase()) ||
    f.category.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden text-[11px]">
      
      {/* 1. COMPACT TOP TOOLBAR */}
      <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
        
        {/* Left: View Switcher (By Roles vs By Users vs Field Visibility) */}
        <div className="flex items-center gap-2.5">
          <div className="inline-flex p-0.5 bg-slate-200/80 rounded-md border border-slate-300/60 text-[10px]">
            <button
              type="button"
              onClick={() => setActiveTab("roles")}
              className={`px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === "roles" ? "bg-white text-indigo-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Shield className="h-3 w-3" />
              <span>By Roles ({roles.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === "users" ? "bg-white text-indigo-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-3 w-3" />
              <span>By Users ({users.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("flac")}
              className={`px-2.5 py-0.5 rounded font-bold transition-all cursor-pointer flex items-center gap-1 ${
                activeTab === "flac" ? "bg-white text-indigo-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sliders className="h-3 w-3 text-indigo-600" />
              <span>Field Visibility (FLAC)</span>
            </button>
          </div>

          {/* Scope Selector when on FLAC tab */}
          {activeTab === "flac" && (
            <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded-md border border-indigo-200 shadow-2xs">
              <Layers className="h-3 w-3 text-indigo-600 shrink-0" />
              <span className="text-[9.5px] font-extrabold text-indigo-950 uppercase">Scope:</span>
              <select
                value={selectedScope}
                onChange={e => setSelectedScope(e.target.value)}
                className="text-[10px] font-bold text-indigo-900 bg-transparent border-0 outline-none cursor-pointer pr-1"
              >
                {FLAC_SCOPES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.isGlobal ? `★ ${s.name}` : `📁 ${s.name}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Admin Edit Protection Badge */}
          {!isAdmin && (
            <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-[9px] font-bold">
              <Lock className="h-2.5 w-2.5" />
              <span>Admin Edit Only</span>
            </div>
          )}
        </div>

        {/* Right: Search & Action Buttons */}
        <div className="flex items-center gap-1.5">
          <div className="relative w-36">
            <Search className="absolute left-2 top-1.5 h-2.5 w-2.5 text-slate-400" />
            <input 
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full text-[10px] pl-6 pr-2 py-0.5 bg-white border border-slate-200 rounded focus:border-indigo-500 outline-none text-slate-800"
            />
          </div>

          {activeTab === "roles" && isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddRoleModal(true)}
              className="flex items-center gap-0.5 px-2 py-0.5 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded shadow-2xs cursor-pointer"
            >
              <Plus className="h-2.5 w-2.5" />
              <span>Role</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded border border-slate-200 cursor-pointer"
              title="Reset to baseline"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-1 px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded shadow-2xs transition disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              <span>Save Changes</span>
            </button>
          )}
        </div>

      </div>

      {/* ALERTS */}
      {successMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-700 text-[10px] px-3 py-1 font-bold flex items-center gap-1 shrink-0">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-700 text-[10px] px-3 py-1 font-bold flex items-center gap-1 shrink-0">
          <AlertTriangle className="h-3 w-3 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 1: BY ROLES MATRIX */}
      {/* ========================================================= */}
      {activeTab === "roles" && (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[650px]">
            <thead>
              <tr className="bg-slate-50/95 border-b border-slate-200 sticky top-0 z-20">
                <th className="py-2 px-3 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider w-[240px] bg-slate-50 sticky left-0 z-30 border-r border-slate-200">
                  Feature / Action
                </th>
                {roles.map(r => (
                  <th key={r.id} className="py-1.5 px-2 text-center border-r border-slate-100 last:border-r-0 min-w-[110px]">
                    <div className="flex flex-col items-center">
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider ${r.color} border mb-0.5`}>
                        {r.badge}
                      </span>
                      <span className="text-[10.5px] font-bold text-slate-800 leading-tight">{r.name}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-[10.5px]">
              {filteredPermissions.map(cat => {
                const catKey = cat.id || cat.category;
                const isCollapsed = !!collapsedFolders[catKey];

                return (
                  <React.Fragment key={catKey}>
                    <tr 
                      onClick={() => toggleFolder(catKey)}
                      className="bg-slate-100/90 hover:bg-slate-200/70 cursor-pointer select-none transition-colors border-y border-slate-200"
                    >
                      <td colSpan={roles.length + 1} className="py-1 px-3 sticky left-0 z-10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-[10px] text-slate-800 uppercase tracking-wider">
                            {isCollapsed ? (
                              <Folder className="h-3 w-3 text-slate-500" />
                            ) : (
                              <FolderOpen className="h-3 w-3 text-indigo-600" />
                            )}
                            <span>{cat.category}</span>
                            <span className="text-[8.5px] font-mono text-slate-400 font-normal">
                              ({cat.items.length})
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-0.5 text-[9px] font-bold text-slate-400">
                            <span>{isCollapsed ? "Expand" : "Collapse"}</span>
                            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {!isCollapsed && cat.items.map(item => (
                      <tr key={item.id} className="hover:bg-indigo-50/20 transition-colors">
                        <td className="py-1.5 px-3 bg-white sticky left-0 z-10 border-r border-slate-200/80 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">
                          <div className="flex flex-col pl-2">
                            <span className="font-bold text-slate-900 text-[10.5px] leading-tight">{item.label}</span>
                            <span className="text-[9px] text-slate-400 leading-none mt-0.5">{item.desc}</span>
                          </div>
                        </td>

                        {roles.map(r => {
                          const cell = rolePermissions[r.id]?.[item.id] || { read: false, write: false, admin: false };
                          return (
                            <td key={r.id} className="py-1 px-1.5 text-center border-r border-slate-100 last:border-r-0">
                              <div className="inline-flex items-center gap-0.5 p-0.5 rounded bg-slate-100/90 border border-slate-200 shadow-2xs">
                                <button
                                  type="button"
                                  onClick={() => toggleRolePerm(r.id, item.id, "read")}
                                  className={`px-1 py-0.2 rounded text-[8px] font-bold cursor-pointer transition ${
                                    cell.read ? "bg-emerald-600 text-white font-black shadow-2xs" : "text-slate-400 hover:text-slate-600"
                                  }`}
                                  title="View Clearance"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleRolePerm(r.id, item.id, "write")}
                                  className={`px-1 py-0.2 rounded text-[8px] font-bold cursor-pointer transition ${
                                    cell.write ? "bg-indigo-600 text-white font-black shadow-2xs" : "text-slate-400 hover:text-slate-600"
                                  }`}
                                  title="Edit Clearance"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleRolePerm(r.id, item.id, "admin")}
                                  className={`px-1 py-0.2 rounded text-[8px] font-bold cursor-pointer transition ${
                                    cell.admin ? "bg-amber-500 text-white font-black shadow-2xs" : "text-slate-400 hover:text-slate-600"
                                  }`}
                                  title="Admin Signoff / Delete Clearance"
                                >
                                  Admin
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: BY USERS (Master-Detail) */}
      {/* ========================================================= */}
      {activeTab === "users" && (
        <div className="flex-1 flex overflow-hidden">
          <div className="w-56 border-r border-slate-200 overflow-y-auto custom-scrollbar p-2 space-y-1 shrink-0 bg-slate-50/50">
            <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 px-1 mb-1">
              Select User ({users.length})
            </div>
            {users.map(u => {
              const isSelected = selectedUser?.id === u.id;
              const userKey = u.username || u.email;
              const hasOverride = userOverrides[userKey] && Object.keys(userOverrides[userKey]).length > 0;
              const roleObj = roles.find(r => r.id === u.role) || { name: u.role, badge: u.role, color: "bg-slate-100 text-slate-700" };

              return (
                <div
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={`p-1.5 rounded-lg border cursor-pointer transition flex items-center justify-between gap-1.5 ${
                    isSelected 
                      ? "bg-white border-indigo-500 shadow-2xs ring-1 ring-indigo-500/20" 
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <div className="h-6 w-6 rounded bg-slate-800 text-white flex items-center justify-center font-bold text-[9px] shrink-0">
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="font-bold text-[10.5px] text-slate-900 truncate leading-tight">{u.name}</span>
                      <span className="text-[8.5px] text-slate-400 truncate leading-none">{u.email}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    <span className={`text-[7.5px] font-extrabold px-1 py-0.2 rounded border ${roleObj.color}`}>
                      {roleObj.badge}
                    </span>
                    {hasOverride && (
                      <span className="text-[7.5px] font-bold text-amber-600 mt-0.5">Custom</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedUser ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-slate-900 text-[11px]">{selectedUser.name}</h3>
                      <span className="text-[9px] text-slate-400 font-mono">({selectedUser.email})</span>
                    </div>
                    <div className="text-[9px] text-slate-500 leading-none">
                      Dept: <strong className="text-slate-700">{selectedUser.dept}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-600">Assigned Role:</span>
                  <select
                    value={selectedUser.role}
                    disabled={!isAdmin}
                    onChange={e => handleUserRoleChange(e.target.value)}
                    className="text-[10px] font-bold text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-60"
                  >
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.badge})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-2">
                <div className="text-[10px] text-slate-500 leading-snug">
                  User inherits from <strong className="text-indigo-700">{roles.find(r => r.id === selectedUser.role)?.name || selectedUser.role}</strong>. Expand folders below to customize specific overrides:
                </div>

                {filteredPermissions.map(cat => {
                  const catKey = cat.id || cat.category;
                  const isCollapsed = !!collapsedFolders[catKey];

                  return (
                    <div key={catKey} className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                      <div
                        onClick={() => toggleFolder(catKey)}
                        className="bg-slate-100 hover:bg-slate-200/70 px-2.5 py-1.5 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-slate-200/60"
                      >
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-800">
                          {isCollapsed ? <Folder className="h-3 w-3 text-slate-500" /> : <FolderOpen className="h-3 w-3 text-indigo-600" />}
                          <span>{cat.category}</span>
                          <span className="text-[8.5px] text-slate-400 font-mono font-normal">
                            ({cat.items.length})
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 text-[9px] font-bold text-slate-400">
                          <span>{isCollapsed ? "Expand" : "Collapse"}</span>
                          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 text-indigo-600" />}
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="p-1.5 space-y-1 bg-white">
                          {cat.items.map(item => {
                            const userKey = selectedUser.username || selectedUser.email;
                            const roleBase = rolePermissions[selectedUser.role]?.[item.id] || { read: false, write: false, admin: false };
                            const override = userOverrides[userKey]?.[item.id] || {};
                            const hasCustom = Object.keys(override).length > 0;

                            const effectiveRead = override.read !== undefined ? override.read : roleBase.read;
                            const effectiveWrite = override.write !== undefined ? override.write : roleBase.write;
                            const effectiveAdmin = override.admin !== undefined ? override.admin : roleBase.admin;

                            return (
                              <div key={item.id} className="p-1.5 rounded bg-slate-50/70 border border-slate-200/70 flex items-center justify-between gap-2 hover:bg-slate-100/60 transition">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900 text-[10px] leading-tight">{item.label}</span>
                                  <span className="text-[8.5px] text-slate-400 leading-none mt-0.5">{item.desc}</span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded bg-white border border-slate-200 shadow-2xs">
                                    <button
                                      type="button"
                                      onClick={() => toggleUserPerm(item.id, "read")}
                                      className={`px-1 py-0.2 rounded text-[8px] font-bold cursor-pointer transition ${
                                        effectiveRead ? "bg-emerald-600 text-white font-black" : "text-slate-300 hover:text-slate-500"
                                      }`}
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleUserPerm(item.id, "write")}
                                      className={`px-1 py-0.2 rounded text-[8px] font-bold cursor-pointer transition ${
                                        effectiveWrite ? "bg-indigo-600 text-white font-black" : "text-slate-300 hover:text-slate-500"
                                      }`}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleUserPerm(item.id, "admin")}
                                      className={`px-1 py-0.2 rounded text-[8px] font-bold cursor-pointer transition ${
                                        effectiveAdmin ? "bg-amber-500 text-white font-black" : "text-slate-300 hover:text-slate-500"
                                      }`}
                                    >
                                      Admin
                                    </button>
                                  </div>

                                  {hasCustom && isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => resetUserPerm(item.id)}
                                      className="text-[8px] font-bold text-rose-600 hover:text-rose-800 underline cursor-pointer"
                                      title="Reset to role default"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[10px] text-slate-400">
              Select a user on the left to configure permissions.
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: HIERARCHICAL FLAC MATRIX (50+ WORKFLOW SCALABLE) */}
      {/* ========================================================= */}
      {activeTab === "flac" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* FLAC Scope Information & Inheritance Banner */}
          <div className="px-3.5 py-2 bg-indigo-50/80 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px]">
                {selectedScope === "GLOBAL" ? <Globe className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-900 text-[11px]">
                    {FLAC_SCOPES.find(s => s.id === selectedScope)?.name}
                  </h3>
                  {selectedScope === "GLOBAL" ? (
                    <span className="px-1.5 py-0.2 rounded bg-indigo-200 text-indigo-900 text-[8px] font-extrabold uppercase">
                      ★ Master Policy (Default for 50+ Flows)
                    </span>
                  ) : isCustomizedScope ? (
                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[8px] font-bold">
                      Customized Exception
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 text-[8px] font-bold">
                      ✦ Inheriting from Global Master
                    </span>
                  )}
                </div>
                <p className="text-[9.5px] text-slate-500 leading-tight">
                  {FLAC_SCOPES.find(s => s.id === selectedScope)?.desc}
                </p>
              </div>
            </div>

            {/* Quick Bulk Action Buttons for 50+ Flows */}
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddCustomFieldModal(true)}
                  className="px-2 py-0.5 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-300 rounded text-[9px] font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Plus className="h-2.5 w-2.5" />
                  <span>Add Field</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyToAllFlows}
                  className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[9px] font-bold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Propagate this exact policy to all 50+ workflows and categories"
                >
                  <Copy className="h-2.5 w-2.5" />
                  <span>Apply to All 50+ Flows</span>
                </button>

                {selectedScope !== "GLOBAL" && isCustomizedScope && (
                  <button
                    type="button"
                    onClick={handleResetScopeToGlobal}
                    className="px-2 py-0.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-300 rounded text-[9px] font-bold transition cursor-pointer"
                    title="Remove custom overrides and inherit from Global Master"
                  >
                    Reset to Global
                  </button>
                )}
              </div>
            )}
          </div>

          {/* FLAC Permissions Matrix Table */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50/95 border-b border-slate-200 sticky top-0 z-20">
                  <th className="py-2 px-3 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider w-[260px] bg-slate-50 sticky left-0 z-30 border-r border-slate-200">
                    Field Attribute ({filteredFields.length})
                  </th>
                  {roles.map(r => (
                    <th key={r.id} className="py-1.5 px-2 text-center border-r border-slate-100 last:border-r-0 min-w-[120px]">
                      <div className="flex flex-col items-center">
                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider ${r.color} border mb-0.5`}>
                          {r.badge}
                        </span>
                        <span className="text-[10.5px] font-bold text-slate-800 leading-tight">{r.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-[10.5px]">
                {filteredFields.map(field => (
                  <tr key={field.id} className="hover:bg-indigo-50/20 transition-colors">
                    
                    <td className="py-2 px-3 bg-white sticky left-0 z-10 border-r border-slate-200/80 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">
                      <div className="flex flex-col pl-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-[11px]">{field.label}</span>
                          <span className="text-[7.5px] font-bold uppercase tracking-wider px-1 py-0.2 bg-slate-100 text-slate-600 rounded">
                            {field.category}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 leading-none mt-0.5">{field.desc}</span>
                      </div>
                    </td>

                    {roles.map(r => {
                      const currentVal = getEffectiveFieldState(r.id, field.id);
                      return (
                        <td key={r.id} className="py-1.5 px-2 text-center border-r border-slate-100 last:border-r-0">
                          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100/90 border border-slate-200 shadow-2xs">
                            
                            {/* Hidden */}
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => setFieldScopeRolePerm(r.id, field.id, "hidden")}
                              className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold transition cursor-pointer ${
                                currentVal === "hidden"
                                  ? "bg-rose-600 text-white font-black shadow-2xs"
                                  : "text-slate-400 hover:text-slate-700"
                              }`}
                              title="Field is completely hidden for this role"
                            >
                              🚫 Hidden
                            </button>

                            {/* View */}
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => setFieldScopeRolePerm(r.id, field.id, "view")}
                              className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold transition cursor-pointer ${
                                currentVal === "view"
                                  ? "bg-emerald-600 text-white font-black shadow-2xs"
                                  : "text-slate-400 hover:text-slate-700"
                              }`}
                              title="Field is visible as read-only display text"
                            >
                              👁️ View
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => setFieldScopeRolePerm(r.id, field.id, "edit")}
                              className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold transition cursor-pointer ${
                                currentVal === "edit"
                                  ? "bg-indigo-600 text-white font-black shadow-2xs"
                                  : "text-slate-400 hover:text-slate-700"
                              }`}
                              title="Field can be edited directly by this role"
                            >
                              ✏️ Edit
                            </button>

                          </div>
                        </td>
                      );
                    })}

                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOM FIELD DYNAMICALLY */}
      {/* ========================================================= */}
      {showAddCustomFieldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-indigo-600" />
                <span>Add Dynamic Field ({selectedScope})</span>
              </h3>
              <button onClick={() => setShowAddCustomFieldModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomField} className="space-y-2.5">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Field Name / Label</label>
                <input 
                  type="text"
                  required
                  value={newFieldName}
                  onChange={e => setNewFieldName(e.target.value)}
                  placeholder="e.g. TDS Section Code (194C / 194J)"
                  className="w-full text-[10px] font-bold p-1.5 border border-slate-200 rounded outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Category Group</label>
                <input 
                  type="text"
                  value={newFieldCategory}
                  onChange={e => setNewFieldCategory(e.target.value)}
                  placeholder="e.g. Tax & Compliance, Logistics, Capex"
                  className="w-full text-[10px] font-medium p-1.5 border border-slate-200 rounded outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Description & Purpose</label>
                <input 
                  type="text"
                  value={newFieldDesc}
                  onChange={e => setNewFieldDesc(e.target.value)}
                  placeholder="e.g. Mandatory withholding tax rate code"
                  className="w-full text-[10px] font-medium p-1.5 border border-slate-200 rounded outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCustomFieldModal(false)}
                  className="px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFieldName.trim()}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  Add Field to Matrix
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOM ROLE */}
      {/* ========================================================= */}
      {showAddRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xs w-full p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-black text-slate-900 uppercase">Add Role</h3>
              <button onClick={() => setShowAddRoleModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form onSubmit={handleAddRole} className="space-y-2.5">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Role Title</label>
                <input 
                  type="text"
                  required
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  placeholder="e.g. Treasury Officer"
                  className="w-full text-[10px] font-bold p-1.5 border border-slate-200 rounded outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(false)}
                  className="px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newRoleName.trim()}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  Add Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
