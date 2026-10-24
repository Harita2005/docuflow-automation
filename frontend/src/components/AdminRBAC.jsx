import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  Shield, 
  Users, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Plus, 
  Trash2, 
  X, 
  Loader2,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ArrowUpDown,
  Settings,
  Lock,
  MoreVertical,
  Info,
  UserX,
  UserCheck,
  Edit2,
  Eye,
  UserPlus,
  Filter
} from "lucide-react";

// Standard Baseline Roles
export const INITIAL_ROLES = [
  { id: "admin", name: "Administrator", badge: "Admin", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "manager", name: "Approver / Manager", badge: "Manager", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "auditor", name: "Internal Auditor", badge: "Auditor", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "ap_specialist", name: "AP Specialist", badge: "AP Staff", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "employee", name: "General Employee", badge: "Employee", color: "bg-slate-100 text-slate-700 border-slate-200" }
];

// Clean functional page-wise permission list categorized into 7 Main Pages
const INITIAL_PERMISSIONS = [
  {
    id: "cat_pages_ops",
    category: "OPERATIONS PAGES",
    icon: "Folder",
    items: [
      { id: "dashboard", label: "Dashboard Page", desc: "Overview dashboard, analytics counters, pending work alerts & system status", iconName: "BarChart3", iconColor: "bg-blue-50 text-blue-600 border-blue-100" },
      { id: "work-tracker", label: "Work Tracker Page", desc: "Active document work tracker, stage progression & metadata verification", iconName: "Layers", iconColor: "bg-emerald-50 text-emerald-600 border-emerald-100" },
      { id: "approved-documents", label: "Approved Docs Page", desc: "Archived & settled documents, payment readiness & PDF download", iconName: "CheckSquare", iconColor: "bg-amber-50 text-amber-600 border-amber-100" },
      { id: "upload", label: "Upload Document Page", desc: "Single & batch invoice file uploads & drag-and-drop file ingestion", iconName: "FileText", iconColor: "bg-purple-50 text-purple-600 border-purple-100" }
    ]
  },
  {
    id: "cat_pages_feedback",
    category: "FEEDBACK PAGE",
    icon: "Folder",
    items: [
      { id: "customer-feedback", label: "Customer Feedback Page", desc: "Customer complaints work tracker, SLA targets & stage review actions", iconName: "MessageSquare", iconColor: "bg-purple-50 text-purple-600 border-purple-100" }
    ]
  },
  {
    id: "cat_pages_admin",
    category: "ADMINISTRATION PAGES",
    icon: "Folder",
    items: [
      { id: "workflow-rules", label: "Workflow & Rules Page", desc: "Multi-stage workflow profile designer & business routing rules engine", iconName: "Sliders", iconColor: "bg-sky-50 text-sky-600 border-sky-100" },
      { id: "admin", label: "Control Settings Page", desc: "User master, IAM role clearances, RACI matrix & system audit logs", iconName: "Shield", iconColor: "bg-rose-50 text-rose-600 border-rose-100" }
    ]
  }
];

const INITIAL_ROLE_PERMS = {
  admin: {
    "dashboard": { read: true, write: true, admin: true },
    "work-tracker": { read: true, write: true, admin: true },
    "approved-documents": { read: true, write: true, admin: true },
    "upload": { read: true, write: true, admin: true },
    "customer-feedback": { read: true, write: true, admin: true },
    "workflow-rules": { read: true, write: true, admin: true },
    "admin": { read: true, write: true, admin: true }
  },
  manager: {
    "dashboard": { read: true, write: true, admin: false },
    "work-tracker": { read: true, write: true, admin: true },
    "approved-documents": { read: true, write: true, admin: false },
    "upload": { read: true, write: true, admin: false },
    "customer-feedback": { read: true, write: true, admin: true },
    "workflow-rules": { read: true, write: false, admin: false },
    "admin": { read: false, write: false, admin: false }
  },
  auditor: {
    "dashboard": { read: true, write: false, admin: false },
    "work-tracker": { read: true, write: false, admin: false },
    "approved-documents": { read: true, write: true, admin: true },
    "upload": { read: false, write: false, admin: false },
    "customer-feedback": { read: true, write: false, admin: false },
    "workflow-rules": { read: true, write: false, admin: false },
    "admin": { read: false, write: false, admin: false }
  },
  ap_specialist: {
    "dashboard": { read: true, write: true, admin: false },
    "work-tracker": { read: true, write: true, admin: false },
    "approved-documents": { read: true, write: true, admin: false },
    "upload": { read: true, write: true, admin: true },
    "customer-feedback": { read: true, write: true, admin: false },
    "workflow-rules": { read: false, write: false, admin: false },
    "admin": { read: false, write: false, admin: false }
  },
  employee: {
    "dashboard": { read: true, write: false, admin: false },
    "work-tracker": { read: true, write: true, admin: false },
    "approved-documents": { read: true, write: false, admin: false },
    "upload": { read: true, write: true, admin: false },
    "customer-feedback": { read: true, write: true, admin: false },
    "workflow-rules": { read: false, write: false, admin: false },
    "admin": { read: false, write: false, admin: false }
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
    { id: "vendor_name", label: "Supplier / Vendor Name", category: "Header Identification", desc: "Vendor entity name & identity" },
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

export const getDivisionPrefix = (code) => {
  if (!code) return "";
  const clean = String(code).trim().toUpperCase();
  return clean.split('_')[0].split('-')[0].trim();
};

export const isDivisionInGroup = (divCode, mainDivCode) => {
  if (!divCode || !mainDivCode) return false;
  const mainUpper = String(mainDivCode).trim().toUpperCase();
  const targetUpper = String(divCode).trim().toUpperCase();

  if (mainUpper === "GLOBAL" || mainUpper === "ALL") return true;

  const mainPrefix = getDivisionPrefix(mainUpper);
  const targetPrefix = getDivisionPrefix(targetUpper);

  if (targetUpper === mainUpper) return true;
  if (mainPrefix && targetPrefix && mainPrefix === targetPrefix) return true;
  if (mainPrefix && (targetUpper.startsWith(mainPrefix + "_") || targetUpper.startsWith(mainPrefix + "-"))) return true;
  if (targetUpper.startsWith(mainUpper + "_") || targetUpper.startsWith(mainUpper + "-")) return true;

  return false;
};

export default function AdminRBAC({ onRefreshSignal }) {
  const [activeTab, setActiveTab] = useState("roles"); // "roles" | "users" | "flac"
  const [selectedCategoryDropdown, _setSelectedCategoryDropdown] = useState("ALL");
  const [collapsedFolders, setCollapsedFolders] = useState({}); // { [catId]: boolean }

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [roles, setRoles] = useState([]);
  const [permissionsList, setPermissionsList] = useState(INITIAL_PERMISSIONS);
  const [rolePermissions, setRolePermissions] = useState(INITIAL_ROLE_PERMS);
  
  // Hierarchical FLAC state: { [scopeId]: { [roleId]: { [fieldId]: 'hidden'|'view'|'edit' } } }
  const [fieldPermissionsByScope, setFieldPermissionsByScope] = useState({
    GLOBAL: INITIAL_GLOBAL_PERMISSIONS
  });
  const [selectedScope, _setSelectedScope] = useState("GLOBAL");
  const [customFields, setCustomFields] = useState({}); // { [scopeId]: Field[] }
  const [_showAddCustomFieldModal, setShowAddCustomFieldModal] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldCategory, _setNewFieldCategory] = useState("Custom Extended");
  const [newFieldDesc, setNewFieldDesc] = useState("");

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userOverrides, setUserOverrides] = useState({});

  const [search, setSearch] = useState("");
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleCode, setNewRoleCode] = useState("");
  const [savingRolePerms, setSavingRolePerms] = useState(false);
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  // Add User modal states
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserEmpId, setNewUserEmpId] = useState("");
  const [newUserRole, setNewUserRole] = useState("");
  const [newUserDept, setNewUserDept] = useState("Finance");
  const [newUserDivision, setNewUserDivision] = useState("");
  const [newUserApprovalDivisions, setNewUserApprovalDivisions] = useState([]);
  const [availableDivisions, setAvailableDivisions] = useState([]);
  const [divisionsLoading, setDivisionsLoading] = useState(false);
  const [divisionsError, setDivisionsError] = useState("");
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState("");
  const [newUserPlant, setNewUserPlant] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [divSearch, setDivSearch] = useState("");

  // Edit User modal states
  const [editingUserModal, setEditingUserModal] = useState(null);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [editDivSearch, setEditDivSearch] = useState("");
  const [showAllAddDivs, setShowAllAddDivs] = useState(false);
  const [showAllEditDivs, setShowAllEditDivs] = useState(false);

  // States for adding dynamic permissions
  const [showAddPermissionModal, setShowAddPermissionModal] = useState(false);
  const [newPermId, setNewPermId] = useState("");
  const [newPermLabel, setNewPermLabel] = useState("");
  const [newPermDesc, setNewPermDesc] = useState("");
  const [newPermCategory, setNewPermCategory] = useState("Documents & OCR Extraction");
  const [_newPermIcon, setNewPermIcon] = useState("Shield");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [_selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [userStatusFilter, setUserStatusFilter] = useState("ALL"); // "ALL" | "ACTIVE" | "DISABLED"
  const [roleStatusFilter, setRoleStatusFilter] = useState("ALL"); // "ALL" | "ACTIVE" | "DISABLED"
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [menuOpenUserId, setMenuOpenUserId] = useState(null);
  const [menuOpenRoleId, setMenuOpenRoleId] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.name || "").toLowerCase().includes(search.toLowerCase()) || 
      (u.email || "").toLowerCase().includes(search.toLowerCase()) || 
      (u.employee_id || u.username || "").toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    if (roleFilter !== "ALL") {
      const uRole = String(u.role || "").toLowerCase().trim();
      const filterRole = String(roleFilter).toLowerCase().trim();
      if (uRole !== filterRole) return false;
    }

    if (userStatusFilter !== "ALL") {
      const isActive = u.is_active !== false;
      if (userStatusFilter === "ACTIVE" && !isActive) return false;
      if (userStatusFilter === "DISABLED" && isActive) return false;
    }

    return true;
  });

  // Role table state & helpers
  const [selectedRoleIds, setSelectedRoleIds] = useState(new Set());
  const [rolePage, setRolePage] = useState(1);
  const [rolePageSize, setRolePageSize] = useState(10);
  const [roleSortField, setRoleSortField] = useState("");
  const [roleSortDir, setRoleSortDir] = useState("asc");

  const getRoleDescription = (role) => {
    if (role.description) return role.description;
    const key = String(role.code || role.id || role.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (key.includes("admin")) return "Full system access and configuration control.";
    if (key === "gm" || key.includes("general_manager") || key.includes("general manager")) return "Management oversight and approvals.";
    if (key === "jmd" || key.includes("joint_managing") || key.includes("joint managing")) return "Executive level access and document approvals.";
    if (key === "md" || key.includes("managing_director") || key.includes("managing director")) return "Executive access with full approval rights.";
    if (key.includes("operations") || key.includes("manager")) return "Operations and workflow management.";
    if (key.includes("finance_auditor") || key.includes("auditor") || key.includes("audit")) return "Financial review and audit access.";
    if (key.includes("accounts_uploader")) return "Upload accounts documents.";
    if (key.includes("accounts_approver")) return "Approve accounts related documents.";
    if (key.includes("accounts")) return "Access to accounts related documents.";
    if (key.includes("employee")) return "Basic access for document submission.";
    if (key.includes("ap_specialist")) return "Accounts payable processing and invoice management.";
    if (key.includes("hr")) return "Human resources and personnel document management.";
    return "Standard role access and workflow permissions.";
  };

  const getRoleIconStyle = (role) => {
    const key = String(role.code || role.id || role.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (key.includes("admin")) return "bg-blue-50 text-blue-600 border-blue-100";
    if (key === "gm" || key.includes("general_manager") || key.includes("general manager")) return "bg-purple-50 text-purple-600 border-purple-100";
    if (key === "jmd" || key.includes("joint_managing") || key.includes("joint managing")) return "bg-slate-100 text-slate-700 border-slate-200";
    if (key === "md" || key.includes("managing_director") || key.includes("managing director")) return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (key.includes("operations") || key.includes("manager")) return "bg-slate-100 text-slate-700 border-slate-200";
    if (key.includes("finance_auditor") || key.includes("auditor") || key.includes("audit")) return "bg-orange-50 text-orange-600 border-orange-100";
    if (key.includes("accounts_uploader")) return "bg-emerald-50 text-emerald-600 border-emerald-100";
    if (key.includes("accounts_approver")) return "bg-blue-50 text-blue-600 border-blue-100";
    if (key.includes("accounts")) return "bg-sky-50 text-sky-600 border-sky-100";
    if (key.includes("employee")) return "bg-slate-100 text-slate-700 border-slate-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  const getRoleUserCount = (role) => {
    const rIdStr = String(role.id || '').trim().toLowerCase();
    const rCodeStr = String(role.code || '').trim().toLowerCase();
    const rNameStr = String(role.name || '').trim().toLowerCase();
    return users.filter(u => {
      if (!u.role) return false;
      const uRoleStr = String(u.role).trim().toLowerCase();
      return (rCodeStr && uRoleStr === rCodeStr) || 
             (rIdStr && uRoleStr === rIdStr) || 
             (rNameStr && uRoleStr === rNameStr);
    }).length;
  };

  const filteredRoles = roles.filter(r => {
    if (roleStatusFilter !== "ALL") {
      const isActive = r.is_active !== false;
      if (roleStatusFilter === "ACTIVE" && !isActive) return false;
      if (roleStatusFilter === "DISABLED" && isActive) return false;
    }

    if (!search || !search.trim()) return true;
    const term = search.toLowerCase().trim();
    const rName = (r.name || "").toLowerCase();
    const rBadge = (r.badge || "").toLowerCase();
    const rCode = (r.code || "").toLowerCase();
    const rId = (r.id || "").toLowerCase();
    const rDesc = getRoleDescription(r).toLowerCase();
    return rName.includes(term) || rBadge.includes(term) || rCode.includes(term) || rId.includes(term) || rDesc.includes(term);
  });

  const handleSortRole = (field) => {
    if (roleSortField === field) {
      setRoleSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setRoleSortField(field);
      setRoleSortDir("asc");
    }
  };

  const sortedRoles = [...filteredRoles].sort((a, b) => {
    if (!roleSortField) return 0;
    let comp = 0;
    if (roleSortField === "name") {
      comp = (a.name || "").localeCompare(b.name || "");
    } else if (roleSortField === "status") {
      comp = 0;
    } else if (roleSortField === "employees") {
      comp = getRoleUserCount(a) - getRoleUserCount(b);
    } else if (roleSortField === "code") {
      comp = (a.badge || a.code || "").localeCompare(b.badge || b.code || "");
    }
    return roleSortDir === "asc" ? comp : -comp;
  });

  const totalRolePages = Math.max(1, Math.ceil(sortedRoles.length / rolePageSize));
  const validRolePage = Math.min(rolePage, totalRolePages);
  const startRoleIdx = (validRolePage - 1) * rolePageSize;
  const endRoleIdx = Math.min(startRoleIdx + rolePageSize, sortedRoles.length);
  const paginatedRoles = sortedRoles.slice(startRoleIdx, endRoleIdx);

  const allCurrentRolesSelected = paginatedRoles.length > 0 && paginatedRoles.every(r => selectedRoleIds.has(r.id));

  const toggleSelectAllRoles = () => {
    if (allCurrentRolesSelected) {
      setSelectedRoleIds(prev => {
        const next = new Set(prev);
        paginatedRoles.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedRoleIds(prev => {
        const next = new Set(prev);
        paginatedRoles.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  const toggleRoleSelect = (roleId, e) => {
    e.stopPropagation();
    setSelectedRoleIds(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const handleToggleRoleStatus = async (role) => {
    setMenuOpenRoleId(null);
    const newStatus = !(role.is_active !== false);
    const actionName = newStatus ? "enable" : "disable";

    if (String(role.code || role.id || '').toLowerCase() === "admin" && !newStatus) {
      setErrorMsg("Cannot disable the Administrator role.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    setRoles(prev => prev.map(r => r.id === role.id ? { ...r, is_active: newStatus } : r));

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      };

      const res = await fetch(`/api/admin/roles/${role.db_id || role.id}/status`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ is_active: newStatus })
      });

      if (!res.ok) {
        setRoles(prev => prev.map(r => r.id === role.id ? { ...r, is_active: !newStatus } : r));
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.detail || `Failed to ${actionName} role.`);
        setTimeout(() => setErrorMsg(""), 4000);
      } else {
        setSuccessMsg(`Role "${role.name}" ${newStatus ? 'enabled' : 'disabled'} successfully.`);
        setTimeout(() => setSuccessMsg(""), 3000);
      }
    } catch (err) {
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, is_active: !newStatus } : r));
      setErrorMsg(`Network error while trying to ${actionName} role.`);
      setTimeout(() => setErrorMsg(""), 4000);
    }
  };

  const handleDeleteRole = async (role) => {
    setMenuOpenRoleId(null);
    if (String(role.code || role.id || '').toLowerCase() === "admin") {
      setErrorMsg("Cannot delete the Administrator role.");
      setTimeout(() => setErrorMsg(""), 3000);
      return;
    }

    const userCount = getRoleUserCount(role);
    if (userCount > 0) {
      alert(`Cannot delete role "${role.name}" because ${userCount} employee${userCount > 1 ? 's are' : ' is'} currently assigned to it.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to delete role "${role.name}"?`)) {
      return;
    }

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};

      const res = await fetch(`/api/admin/roles/${role.db_id || role.id}`, {
        method: "DELETE",
        headers
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.detail || `Failed to delete role "${role.name}".`);
        setTimeout(() => setErrorMsg(""), 4000);
      } else {
        setRoles(prev => prev.filter(r => r.id !== role.id));
        setSelectedRoleIds(prev => {
          const next = new Set(prev);
          next.delete(role.id);
          return next;
        });
        setSuccessMsg(`Role "${role.name}" deleted successfully.`);
        setTimeout(() => setSuccessMsg(""), 3000);
      }
    } catch (err) {
      setErrorMsg(`Network error while trying to delete role "${role.name}".`);
      setTimeout(() => setErrorMsg(""), 4000);
    }
  };

  // Filter approval divisions by Main Division for Add User modal
  const activeAddMainDiv = newUserDivision || (availableDivisions[0]?.code || "");
  const addGroupDivs = availableDivisions.filter(d => isDivisionInGroup(d.code, activeAddMainDiv));
  const addGroupList = showAllAddDivs 
    ? availableDivisions 
    : (addGroupDivs.length > 0 ? addGroupDivs : (activeAddMainDiv ? availableDivisions.filter(d => d.code === activeAddMainDiv) : availableDivisions));
  const filteredAddDivs = addGroupList.filter(d =>
    !divSearch.trim() ||
    (d.name || "").toLowerCase().includes(divSearch.toLowerCase()) ||
    d.code.toLowerCase().includes(divSearch.toLowerCase())
  );
  const allAddGroupSelected = addGroupList.length > 0 && addGroupList.every(d => newUserApprovalDivisions.includes(d.code));

  // Filter approval divisions by Main Division for Edit User modal
  const activeEditMainDiv = editingUserModal?.division || (availableDivisions[0]?.code || "");
  const editGroupDivs = availableDivisions.filter(d => isDivisionInGroup(d.code, activeEditMainDiv));
  const editGroupList = showAllEditDivs 
    ? availableDivisions 
    : (editGroupDivs.length > 0 ? editGroupDivs : (activeEditMainDiv ? availableDivisions.filter(d => d.code === activeEditMainDiv) : availableDivisions));
  const filteredEditDivs = editGroupList.filter(d =>
    !editDivSearch.trim() ||
    (d.name || "").toLowerCase().includes(editDivSearch.toLowerCase()) ||
    d.code.toLowerCase().includes(editDivSearch.toLowerCase())
  );
  const currentEditApprovals = Array.isArray(editingUserModal?.approval_divisions)
    ? editingUserModal.approval_divisions
    : (editingUserModal?.approval_divisions ? String(editingUserModal.approval_divisions).split(',').map(x => x.trim()).filter(Boolean) : []);
  const allEditGroupSelected = editGroupList.length > 0 && editGroupList.every(d => currentEditApprovals.includes(d.code));

  const getAvatarColor = (name = "") => {
    const colors = [
      "bg-blue-100 text-blue-700 border border-blue-200",
      "bg-emerald-100 text-emerald-700 border border-emerald-200",
      "bg-amber-100 text-amber-700 border border-amber-200",
      "bg-purple-100 text-purple-700 border border-purple-200",
      "bg-rose-100 text-rose-700 border border-rose-200",
      "bg-violet-100 text-violet-700 border border-violet-200",
      "bg-sky-100 text-sky-700 border border-sky-200",
      "bg-teal-100 text-teal-700 border border-teal-200"
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const getRoleDisplayName = (roleId) => {
    if (!roleId) return "—";
    const cleanId = String(roleId).trim().toLowerCase();
    const matched = roles.find(r => 
      String(r.code || '').trim().toLowerCase() === cleanId || 
      String(r.id || '').trim().toLowerCase() === cleanId
    );
    if (matched && matched.name) return matched.name;
    const roleMap = {
      admin: "System Administrator",
      manager: "Operations Manager",
      auditor: "Finance & Internal Auditor",
      employee: "Standard Employee"
    };
    return roleMap[cleanId] || String(roleId).replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const _handleSelectAllUsers = (e) => {
    if (e.target.checked) {
      const ids = filteredUsers.map(u => u.id);
      setSelectedUserIds(new Set(ids));
    } else {
      setSelectedUserIds(new Set());
    }
  };

  const _handleSelectUserCheckbox = (e, userId) => {
    e.stopPropagation();
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleMenu = (e, userId) => {
    e.stopPropagation();
    setMenuOpenUserId(prev => prev === userId ? null : userId);
  };

  const currentUserRole = (localStorage.getItem("currentUserRole") || "admin").toLowerCase();
  const isAdmin = currentUserRole === "admin" || currentUserRole === "settings_editor";

  useEffect(() => {
    loadData();

    const handleOutsideClick = () => {
      setMenuOpenUserId(null);
      setMenuOpenRoleId(null);
      setShowFilterDropdown(false);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};

      setDivisionsLoading(true);
      setRolesLoading(true);
      setDivisionsError("");
      setRolesError("");

      const [configRes, usersRes, rolesRes, divsRes] = await Promise.all([
        fetch("/api/admin/config", { headers }).catch(err => ({ ok: false, error: err })),
        fetch("/api/admin/users", { headers }).catch(err => ({ ok: false, error: err })),
        fetch("/api/admin/roles", { headers }).catch(err => ({ ok: false, error: err })),
        fetch("/api/admin/users/divisions/list", { headers }).catch(err => ({ ok: false, error: err }))
      ]);

      setDivisionsLoading(false);
      setRolesLoading(false);

      if (divsRes.ok) {
        const divsData = await divsRes.json();
        if (Array.isArray(divsData)) {
          setAvailableDivisions(divsData);
          if (divsData.length > 0) {
            setNewUserDivision(prev => prev || divsData[0].code);
            setNewUserApprovalDivisions(prev => (prev && prev.length > 0) ? prev : [divsData[0].code]);
          }
        } else {
          setAvailableDivisions([]);
        }
      } else {
        setAvailableDivisions([]);
        setDivisionsError("Failed to load divisions from database.");
      }

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        if (Array.isArray(rolesData) && rolesData.length > 0) {
          const loadedRoles = rolesData.map(r => ({
            id: String(r.id),
            db_id: r.id,
            code: r.code,
            name: r.name,
            badge: r.code ? r.code.toUpperCase() : r.name.slice(0, 10),
            color: "bg-blue-50 text-blue-700 border-blue-200",
            is_active: r.is_active !== undefined ? r.is_active : true,
            permissions: r.permissions || []
          }));
          setRoles(loadedRoles);
          setNewUserRole(prev => prev || loadedRoles[0].code || loadedRoles[0].id);

          setRolePermissions(prev => {
            const updated = { ...prev };
            rolesData.forEach(r => {
              const rCode = r.code;
              const rId = String(r.id);
              if (!updated[rCode]) updated[rCode] = {};
              (r.permissions || []).forEach(pCode => {
                if (!updated[rCode][pCode]) {
                  updated[rCode][pCode] = { read: true, write: true, admin: false };
                }
              });
              if (rId) updated[rId] = updated[rCode];
            });
            return updated;
          });
        } else {
          setRoles([]);
        }
      } else {
        setRoles([]);
        setRolesError("Failed to load roles from database.");
      }

      if (configRes.ok) {
        const configs = await configRes.json();
        if (Array.isArray(configs)) {
          const matrixCfg = configs.find(c => c.key === "RBAC_GRANULAR_MATRIX");
          if (matrixCfg && matrixCfg.value) {
            try { setRolePermissions(prev => ({ ...JSON.parse(matrixCfg.value), ...prev })); } catch {}
          }
          const flacCfg = configs.find(c => c.key === "RBAC_FIELD_PERMISSIONS");
          if (flacCfg && flacCfg.value) {
            try {
              const parsed = JSON.parse(flacCfg.value);
              if (parsed.admin && !parsed.GLOBAL) {
                setFieldPermissionsByScope({ GLOBAL: parsed });
              } else {
                setFieldPermissionsByScope(parsed);
              }
            } catch {}
          }
          const customFieldsCfg = configs.find(c => c.key === "RBAC_CUSTOM_FIELDS");
          if (customFieldsCfg && customFieldsCfg.value) {
            try { setCustomFields(JSON.parse(customFieldsCfg.value)); } catch {}
          }
          const overridesCfg = configs.find(c => c.key === "UBAC_USER_OVERRIDES");
          if (overridesCfg && overridesCfg.value) {
            try { setUserOverrides(JSON.parse(overridesCfg.value)); } catch {}
          }
          const permsListCfg = configs.find(c => c.key === "RBAC_PERMISSION_DEFINITIONS");
          if (permsListCfg && permsListCfg.value) {
            try {
              const loaded = JSON.parse(permsListCfg.value);
              const merged = INITIAL_PERMISSIONS.map(initCat => {
                const foundCat = Array.isArray(loaded) ? loaded.find(c => c.id === initCat.id || c.category === initCat.category) : null;
                if (!foundCat) return initCat;
                const mergedItems = [...initCat.items];
                (foundCat.items || []).forEach(item => {
                  if (!mergedItems.some(i => i.id === item.id)) {
                    mergedItems.push(item);
                  }
                });
                return { ...foundCat, items: mergedItems };
              });
              setPermissionsList(merged);
            } catch {}
          }
        }
      }

      if (usersRes.ok) {
        const userData = await usersRes.json();
        if (Array.isArray(userData)) {
          const dbUsers = userData.map(u => ({
            id: String(u.id),
            user_uid: u.user_uid || `USR-${u.id}`,
            employee_id: u.employee_id || `EMP-${u.id}`,
            name: u.employee_name || u.name || u.username || "",
            employee_name: u.employee_name || u.name || u.username || "",
            username: u.username || u.employee_id || "",
            email: u.email || "",
            phone_number: u.phone_number || "",
            role: u.role || 'employee',
            dept: u.department || u.dept || '',
            division: u.division || '',
            approval_divisions: u.approval_divisions || u.division || '',
            plant: u.plant || '',
            is_active: u.is_active !== undefined ? u.is_active : true,
            status: u.is_active ? "Active" : "Inactive",
            created_on: u.created_on || u.created_at || null
          }));
          
          setUsers(dbUsers);
          setSelectedUser(null);
        } else {
          setUsers([]);
          setSelectedUser(null);
        }
      } else {
        setUsers([]);
        setSelectedUser(null);
        if (usersRes?.status === 401) {
          setErrorMsg("Session expired. Please log in again.");
        } else if (usersRes?.status === 403) {
          setErrorMsg("Access Denied: Administrator role required to view users.");
        }
      }
    } catch(e) {
      console.error("Failed to load data from API:", e);
      setUsers([]);
      setSelectedUser(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = (catId) => {
    setCollapsedFolders(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const _handleToggleAllFolders = (expand) => {
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
    const matchedRole = roles.find(r => r.id === roleId || r.code === roleId);
    const roleCodeKey = matchedRole?.code || roleId;
    const roleIdKey = matchedRole?.id ? String(matchedRole.id) : roleId;

    setRolePermissions(prev => {
      const currentRole = prev[roleCodeKey] || prev[roleIdKey] || {};
      const currentItem = currentRole[permId] || { read: false, write: false, admin: false };
      const updated = { ...currentItem, [level]: !currentItem[level] };
      
      if ((updated.write || updated.admin) && !updated.read) updated.read = true;
      if (!updated.read) { updated.write = false; updated.admin = false; }

      const next = { ...prev };
      next[roleCodeKey] = { ...(prev[roleCodeKey] || {}), [permId]: updated };
      if (roleIdKey && roleIdKey !== roleCodeKey) {
        next[roleIdKey] = { ...(prev[roleIdKey] || {}), [permId]: updated };
      }

      return next;
    });
  };

  // Set field permission for current scope & role: 'hidden' | 'view' | 'edit'
  const _setFieldScopeRolePerm = (roleId, fieldId, state) => {
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
  const _getEffectiveFieldState = (roleId, fieldId) => {
    if (selectedScope !== "GLOBAL" && fieldPermissionsByScope[selectedScope]?.[roleId]?.[fieldId]) {
      return fieldPermissionsByScope[selectedScope][roleId][fieldId];
    }
    // Inherit from GLOBAL
    const globalState = fieldPermissionsByScope.GLOBAL?.[roleId]?.[fieldId];
    if (globalState) return globalState;
    return roleId === "admin" ? "edit" : roleId === "employee" ? "hidden" : "view";
  };

  // Check if current scope has custom overrides
  const _isCustomizedScope = selectedScope !== "GLOBAL" && !!fieldPermissionsByScope[selectedScope] && Object.keys(fieldPermissionsByScope[selectedScope]).length > 0;

  // Apply current settings to all 50+ workflows
  const _handleApplyToAllFlows = () => {
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
  const _handleResetScopeToGlobal = () => {
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
  const _handleAddCustomField = (e) => {
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

  const _toggleUserPerm = (permId, level) => {
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

  const _resetUserPerm = (permId) => {
    if (!isAdmin || !selectedUser) return;
    const userKey = selectedUser.username || selectedUser.email;
    setUserOverrides(prev => {
      const updated = { ...(prev[userKey] || {}) };
      delete updated[permId];
      return { ...prev, [userKey]: updated };
    });
  };

  const _handleUserRoleChange = async (newRole) => {
    if (!isAdmin || !selectedUser) return;
    setSelectedUser(prev => ({ ...prev, role: newRole }));
    setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: newRole } : u));
    
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          role: newRole,
          employee_id: selectedUser.employee_id,
          employee_name: selectedUser.name,
          name: selectedUser.name,
          email: selectedUser.email,
          username: selectedUser.username,
          department: selectedUser.department || selectedUser.dept,
          division: selectedUser.division || "VCC"
        })
      });
      setSuccessMsg(`✓ Role for "${selectedUser.name}" updated to "${newRole.toUpperCase()}".`);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch(err) {
      console.error(err);
      setErrorMsg("Failed to update user role.");
      setTimeout(() => setErrorMsg(""), 3500);
    }
  };

  const handleToggleStatus = async (user) => {
    if (!isAdmin) return;
    const nextStatus = !user.is_active;
    
    setUsers(prev => prev.map(u => u.id === user.id ? { 
      ...u, 
      is_active: nextStatus,
      status: nextStatus ? 'Active' : 'Inactive' 
    } : u));
    
    if (selectedUser?.id === user.id) {
      setSelectedUser(prev => ({
        ...prev,
        is_active: nextStatus,
        status: nextStatus ? 'Active' : 'Inactive'
      }));
    }

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      await fetch(`/api/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ is_active: nextStatus })
      });
    } catch {}
  };

  const deleteUser = async (id, name, empId) => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to deactivate and remove employee ${name} (${empId})?`)) return;

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      await fetch(`/api/users/${id}`, { method: 'DELETE', headers: token ? { "Authorization": `Bearer ${token}` } : {} });
      setUsers(prev => prev.filter(u => u.id !== id));
      if (selectedUser?.id === id) setSelectedUser(null);
    } catch { 
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  const handleAddRole = async (e) => {
    e.preventDefault();
    if (!isAdmin || !newRoleName.trim()) return;

    const trimmedName = newRoleName.trim();
    // Safe role code generation according to backend regex: ^[a-z0-9_]{2,50}$
    let rawCode = (newRoleCode.trim() || trimmedName).toLowerCase().replace(/[\s\-/\\]+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (rawCode.length < 2) {
      setErrorMsg("Role code must produce a valid identifier at least 2 characters long (letters, numbers, underscores).");
      return;
    }

    // Auto-disambiguate duplicate codes (e.g. manager -> manager_2)
    let finalCode = rawCode;
    let counter = 1;
    while (roles.some(r => (r.code || r.id).toLowerCase() === finalCode.toLowerCase())) {
      counter++;
      finalCode = `${rawCode}_${counter}`;
    }

    setIsCreatingRole(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      };

      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers,
        body: JSON.stringify({
          code: finalCode,
          name: trimmedName,
          description: "",
          permissions: []
        })
      });

      if (res.ok) {
        const createdRole = await res.json();
        setNewRoleName("");
        setNewRoleCode("");
        setShowAddRoleModal(false);
        setSuccessMsg(`Role "${createdRole.name}" (${createdRole.code}) created successfully in database!`);
        await loadData();
        setTimeout(() => setSuccessMsg(""), 3500);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Role creation failed:", errData);
        setErrorMsg(errData.detail || "Failed to create role in backend.");
      }
    } catch (err) {
      console.error("Error calling POST /api/admin/roles:", err);
      setErrorMsg("Network error connecting to backend role API.");
    } finally {
      setIsCreatingRole(false);
    }
  };

  const handleSaveRolePermissions = async (roleToSave) => {
    if (!isAdmin || !roleToSave) return;
    const targetRoleId = roleToSave.db_id || roleToSave.id;
    const roleCodeKey = roleToSave.code || roleToSave.id;
    
    // Collect active permission codes from rolePermissions[roleCodeKey]
    const currentPermMap = rolePermissions[roleCodeKey] || {};
    const activePermCodes = Object.keys(currentPermMap).filter(permCode => {
      const pState = currentPermMap[permCode];
      return pState && (pState.read || pState.write || pState.admin);
    });

    setSavingRolePerms(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      };
      const res = await fetch(`/api/admin/roles/${targetRoleId}/permissions`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          permission_codes: activePermCodes
        })
      });

      if (res.ok) {
        await fetch("/api/admin/config", {
          method: "POST",
          headers,
          body: JSON.stringify({
            key: "RBAC_GRANULAR_MATRIX",
            value: JSON.stringify(rolePermissions),
            description: "Role permissions matrix"
          })
        }).catch(() => {});

        await fetch("/api/admin/config", {
          method: "POST",
          headers,
          body: JSON.stringify({
            key: "ROLE_PERMISSIONS",
            value: JSON.stringify(rolePermissions),
            description: "Role permissions matrix"
          })
        }).catch(() => {});

        window.dispatchEvent(new CustomEvent("role-permissions-updated"));
        setSuccessMsg(`✓ Permissions for role "${roleToSave.name}" updated in database!`);
        await loadData();
        setTimeout(() => setSuccessMsg(""), 3500);
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.detail || "Failed to update role permissions.");
      }
    } catch (err) {
      console.error("Error updating role permissions:", err);
      setErrorMsg("Network error updating role permissions.");
    } finally {
      setSavingRolePerms(false);
    }
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
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };

      // Update backend role permissions for each role
      for (const r of roles) {
        const roleId = r.db_id || r.id;
        const roleCode = r.code || r.id;
        if (roleId && rolePermissions[roleCode]) {
          const activePermCodes = Object.keys(rolePermissions[roleCode]).filter(pCode => {
            const pState = rolePermissions[roleCode][pCode];
            return pState && (pState.read || pState.write || pState.admin);
          });
          await fetch(`/api/admin/roles/${roleId}/permissions`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ permission_codes: activePermCodes })
          }).catch(() => {});
        }
      }

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
          key: "ROLE_PERMISSIONS",
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
          key: "UBAC_USER_OVERRIDES",
          value: JSON.stringify(userOverrides),
          description: "User permission overrides"
        })
      });

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "RBAC_PERMISSION_DEFINITIONS",
          value: JSON.stringify(permissionsList),
          description: "Categorized list of system permission definitions"
        })
      });

      window.dispatchEvent(new CustomEvent("role-permissions-updated"));
      setSuccessMsg("✓ All permissions & 50+ workflow policies saved successfully!");
      if (onRefreshSignal) onRefreshSignal();
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch {
      setErrorMsg("Failed to save permissions.");
    } finally {
      setSaving(false);
    }
  };

  const _handleResetDefaults = () => {
    if (!isAdmin) return;
    if (window.confirm("Reset all roles, FLAC field permissions and matrix to default baseline?")) {
      setRoles(INITIAL_ROLES);
      setRolePermissions(INITIAL_ROLE_PERMS);
      setFieldPermissionsByScope({ GLOBAL: INITIAL_GLOBAL_PERMISSIONS });
      setUserOverrides({});
      setPermissionsList(INITIAL_PERMISSIONS);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserEmpId.trim()) {
      setErrorMsg("Please fill in all required fields (Emp ID, Name, Email).");
      return;
    }
    setIsCreatingUser(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      };
      const primaryDiv = newUserDivision || (availableDivisions.length > 0 ? availableDivisions[0].code : "");
      const selectedDivObj = availableDivisions.find(d => d.code === primaryDiv || d.id === primaryDiv);
      const approvalDivs = (newUserApprovalDivisions && newUserApprovalDivisions.length > 0)
        ? newUserApprovalDivisions.join(",")
        : primaryDiv;
      const primaryRole = newUserRole || (roles.length > 0 ? (roles[0].code || roles[0].id) : "employee");

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          employee_id: newUserEmpId.trim(),
          employee_name: newUserName.trim(),
          username: newUserEmpId.trim(),
          email: newUserEmail.trim(),
          role: primaryRole,
          division: primaryDiv,
          division_id: selectedDivObj?.id || null,
          approval_divisions: approvalDivs,
          department: newUserDept || "Finance",
          plant: newUserPlant || null,
          is_active: true,
          mfa_enabled: false,
          mfa_type: "EMAIL",
          created_by: "System Admin"
        })
      });
      if (res.ok) {
        setSuccessMsg(`User "${newUserName}" created successfully.`);
        await loadData();
        setNewUserName("");
        setNewUserEmail("");
        setNewUserEmpId("");
        const defaultRole = roles.length > 0 ? (roles[0].code || roles[0].id) : "";
        const defaultDiv = availableDivisions.length > 0 ? availableDivisions[0].code : "";
        setNewUserRole(defaultRole);
        setNewUserDept("Finance");
        setNewUserDivision(defaultDiv);
        setNewUserApprovalDivisions(defaultDiv ? [defaultDiv] : []);
        setNewUserPlant("");
        setShowAddUserModal(false);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to create user.");
      }
    } catch {
      setErrorMsg("Network error trying to create user.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleSaveUserEdit = async (e) => {
    e.preventDefault();
    if (!editingUserModal) return;
    setIsUpdatingUser(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };
      
      const approvalDivsStr = Array.isArray(editingUserModal.approval_divisions)
        ? editingUserModal.approval_divisions.join(",")
        : (editingUserModal.approval_divisions || editingUserModal.division || "");

      const selectedDivCode = editingUserModal.division || (availableDivisions.length > 0 ? availableDivisions[0].code : "");
      const selectedDivObj = availableDivisions.find(d => d.code === selectedDivCode || d.id === selectedDivCode);

      const payload = {
        employee_id: editingUserModal.employee_id,
        employee_name: editingUserModal.employee_name || editingUserModal.name,
        name: editingUserModal.employee_name || editingUserModal.name,
        username: editingUserModal.username || editingUserModal.employee_id,
        email: editingUserModal.email,
        phone_number: editingUserModal.phone_number,
        role: editingUserModal.role || (roles.length > 0 ? (roles[0].code || roles[0].id) : "employee"),
        division: selectedDivCode,
        division_id: selectedDivObj?.id || editingUserModal.division_id || null,
        approval_divisions: approvalDivsStr,
        department: editingUserModal.department || editingUserModal.dept,
        plant: editingUserModal.plant
      };
      if (editingUserModal.password && editingUserModal.password.trim()) {
        payload.password = editingUserModal.password.trim();
      }

      const res = await fetch(`/api/users/${editingUserModal.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update employee details");
      }
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === editingUserModal.id ? { ...u, ...updated, name: updated.name || updated.employee_name } : u));

      setSuccessMsg(`✓ Profile for "${editingUserModal.employee_name || editingUserModal.name}" updated successfully!`);
      setEditingUserModal(null);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (err) {
      console.error("Error updating user:", err);
      setErrorMsg(err.message || "Failed to update employee details");
      setTimeout(() => setErrorMsg(""), 4000);
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const handleAddPermission = (e) => {
    e.preventDefault();
    const cleanLabel = newPermLabel.trim();
    if (!cleanLabel) return;

    const rawKey = newPermId.trim() || cleanLabel;
    const formattedId = rawKey.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    
    // Check if duplicate
    const allItems = permissionsList.flatMap(c => c.items);
    if (allItems.some(item => item.id === formattedId)) {
      alert("A permission with this name already exists.");
      return;
    }

    const newPermissionItem = {
      id: formattedId,
      label: cleanLabel,
      desc: newPermDesc.trim() || "Page access and action clearance",
      iconName: "Shield",
      isCustom: true
    };

    // Find or create category
    let categoryTarget = newPermCategory.trim();
    if (categoryTarget === "NEW_CATEGORY") {
      categoryTarget = newCategoryName.trim() || "General Operational Permissions";
    }
    if (!categoryTarget) categoryTarget = "General Operational Permissions";

    setPermissionsList(prev => {
      let categoryExists = false;
      const updated = prev.map(cat => {
        if (cat.category.toLowerCase() === categoryTarget.toLowerCase()) {
          categoryExists = true;
          return {
            ...cat,
            items: [...cat.items, newPermissionItem]
          };
        }
        return cat;
      });

      if (!categoryExists) {
        return [
          ...updated,
          {
            id: `cat_${categoryTarget.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
            category: categoryTarget,
            icon: "Folder",
            items: [newPermissionItem]
          }
        ];
      }
      return updated;
    });

    // Add default clearances for this permission to roles:
    setRolePermissions(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(roleId => {
        updated[roleId] = {
          ...updated[roleId],
          [formattedId]: roleId === "admin" 
            ? { read: true, write: true, admin: true } 
            : { read: false, write: false, admin: false }
        };
      });
      return updated;
    });

    // Reset fields
    setNewPermId("");
    setNewPermLabel("");
    setNewPermDesc("");
    setNewPermCategory("Documents & OCR Extraction");
    setNewPermIcon("Shield");
    setNewCategoryName("");
    setShowAddPermissionModal(false);

    setSuccessMsg(`Permission "${newPermLabel}" added! Click Save Changes to persist.`);
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  const _handleDeletePermission = (permId, permLabel) => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to permanently delete the permission "${permLabel}" (${permId})? This will remove all role clearances and user overrides associated with it.`)) {
      return;
    }

    // Remove from permissions list
    setPermissionsList(prev => {
      return prev.map(cat => ({
        ...cat,
        items: cat.items.filter(item => item.id !== permId)
      })).filter(cat => cat.items.length > 0);
    });

    // Clean up role permissions base
    setRolePermissions(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(roleId => {
        if (updated[roleId]) {
          const { [permId]: _removed, ...rest } = updated[roleId];
          updated[roleId] = rest;
        }
      });
      return updated;
    });

    // Clean up user overrides
    setUserOverrides(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(username => {
        if (updated[username]) {
          const { [permId]: _removed, ...rest } = updated[username];
          updated[username] = rest;
        }
      });
      return updated;
    });

    setSuccessMsg(`Permission "${permLabel}" deleted! Click Save Changes to persist.`);
    setTimeout(() => setSuccessMsg(""), 3500);
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

  const _filteredFields = activeScopeFields.filter(f => 
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.desc.toLowerCase().includes(search.toLowerCase()) ||
    f.category.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden text-[11px]">
      
      {/* 1. COMPACT TOP TOOLBAR */}
      <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        
        {/* Left: View Switcher (By Roles vs By Users) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "roles"
                ? "bg-[#003F28] hover:bg-[#004B32] text-white shadow-sm"
                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>By Roles ({roles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "users"
                ? "bg-[#003F28] hover:bg-[#004B32] text-white shadow-sm"
                : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>By Users ({users.length})</span>
          </button>

          {/* Admin Edit Protection Badge */}
          {!isAdmin && (
            <div className="flex items-center gap-1 px-2.5 h-8 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[9px] font-bold">
              <Lock className="h-2.5 w-2.5" />
              <span>Admin Edit Only</span>
            </div>
          )}
        </div>

        {/* Right: Search & Action Buttons */}
        <div className="flex items-center gap-2">
          <div className="relative w-64 md:w-80">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setRolePage(1); }}
              placeholder="Search role name, code, or description..."
              className="w-full text-xs pl-8 pr-2.5 h-8 bg-white border border-slate-200 rounded-lg focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]/25 outline-none text-slate-800 shadow-2xs transition-all duration-200"
            />
          </div>

          {/* Filter Dropdown Container */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowFilterDropdown(prev => !prev);
              }}
              className={`h-8 flex items-center gap-1.5 px-3 text-xs font-semibold rounded-lg shadow-2xs cursor-pointer transition ${
                (activeTab === "users" ? (roleFilter !== "ALL" || userStatusFilter !== "ALL") : roleStatusFilter !== "ALL")
                  ? "bg-emerald-50 text-[#003F28] border border-emerald-300 font-bold"
                  : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
              }`}
              title="Filter records"
            >
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span>Filter</span>
              {(activeTab === "users" ? (roleFilter !== "ALL" || userStatusFilter !== "ALL") : roleStatusFilter !== "ALL") && (
                <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
              )}
              <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${showFilterDropdown ? "rotate-180" : ""}`} />
            </button>

            {/* Filter Menu Dropdown */}
            {showFilterDropdown && (
              <div 
                className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 text-left"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2.5">
                  <span className="text-xs font-bold text-slate-800">
                    {activeTab === "users" ? "Filter Users" : "Filter Roles"}
                  </span>
                  {((activeTab === "users" && (roleFilter !== "ALL" || userStatusFilter !== "ALL")) ||
                    (activeTab === "roles" && roleStatusFilter !== "ALL")) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTab === "users") {
                          setRoleFilter("ALL");
                          setUserStatusFilter("ALL");
                        } else {
                          setRoleStatusFilter("ALL");
                        }
                      }}
                      className="text-[10px] text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer underline"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {activeTab === "users" && (
                  <div className="space-y-3">
                    {/* Role Filter */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        By Role
                      </label>
                      <select
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-[#003F28] cursor-pointer"
                      >
                        <option value="ALL">All Roles ({users.length})</option>
                        {roles.map(r => {
                          const rCode = r.code || r.id;
                          const count = users.filter(u => String(u.role || '').toLowerCase() === String(rCode).toLowerCase()).length;
                          return (
                            <option key={rCode} value={rCode}>
                              {r.name} ({count})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* User Status Filter */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        By Status
                      </label>
                      <select
                        value={userStatusFilter}
                        onChange={e => setUserStatusFilter(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-[#003F28] cursor-pointer"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="ACTIVE">Active Users ({users.filter(u => u.is_active !== false).length})</option>
                        <option value="DISABLED">Disabled Users ({users.filter(u => u.is_active === false).length})</option>
                      </select>
                    </div>
                  </div>
                )}

                {activeTab === "roles" && (
                  <div className="space-y-3">
                    {/* Role Status Filter */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        By Status
                      </label>
                      <select
                        value={roleStatusFilter}
                        onChange={e => {
                          setRoleStatusFilter(e.target.value);
                          setRolePage(1);
                        }}
                        className="w-full h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-[#003F28] cursor-pointer"
                      >
                        <option value="ALL">All Roles ({roles.length})</option>
                        <option value="ACTIVE">Active Roles ({roles.filter(r => r.is_active !== false).length})</option>
                        <option value="DISABLED">Disabled Roles ({roles.filter(r => r.is_active === false).length})</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowFilterDropdown(false)}
                    className="px-3 py-1 bg-[#003F28] hover:bg-[#004B32] text-white text-[11px] font-bold rounded-md shadow-3xs cursor-pointer transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              {activeTab === "roles" && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAddRoleModal(true)}
                    className="h-8 flex items-center gap-1 px-3 bg-emerald-50/50 hover:bg-emerald-50 text-[#003F28] border border-emerald-300 text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Role</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewPermCategory(permissionsList[0]?.category || "Documents & OCR Extraction");
                      setShowAddPermissionModal(true);
                    }}
                    className="h-8 flex items-center gap-1.5 px-3 bg-emerald-50/50 hover:bg-emerald-50 text-[#003F28] border border-emerald-300 text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Permission</span>
                  </button>
                </>
              )}
              {activeTab === "users" && (
                <button
                  type="button"
                  onClick={() => {
                    const initDiv = newUserDivision || (availableDivisions[0]?.code || "");
                    setDivSearch("");
                    if (initDiv) {
                      const matchingDivs = availableDivisions.filter(d => isDivisionInGroup(d.code, initDiv)).map(d => d.code);
                      setNewUserApprovalDivisions(prev => {
                        const retained = prev.filter(c => matchingDivs.includes(c));
                        return retained.length > 0 ? retained : [initDiv];
                      });
                    }
                    setShowAddUserModal(true);
                  }}
                  className="h-8 flex items-center gap-1 px-2.5 bg-white hover:bg-slate-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>User</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="h-8 flex items-center gap-1.5 px-3.5 bg-[#003F28] hover:bg-[#004B32] text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
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
        <div className="flex-1 flex flex-col overflow-hidden min-h-[500px]">
          {/* Roles Table Grid */}
          <div className="flex-1 flex flex-col overflow-y-auto min-w-0 bg-white">
            
            {/* Roles List Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    <th className="px-3 py-2 w-12 text-center whitespace-nowrap">
                      S.No.
                    </th>
                    <th 
                      className="px-3.5 py-2 cursor-pointer hover:text-slate-800 transition-colors whitespace-nowrap"
                      onClick={() => handleSortRole("name")}
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span>ROLE GROUP</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </th>
                    <th 
                      className="px-3.5 py-2 cursor-pointer hover:text-slate-800 transition-colors whitespace-nowrap"
                      onClick={() => handleSortRole("status")}
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span>STATUS</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </th>
                    <th 
                      className="px-3.5 py-2 cursor-pointer hover:text-slate-800 transition-colors whitespace-nowrap"
                      onClick={() => handleSortRole("employees")}
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span>ASSIGNED EMPLOYEES</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </th>
                    <th 
                      className="px-3.5 py-2 cursor-pointer hover:text-slate-800 transition-colors whitespace-nowrap"
                      onClick={() => handleSortRole("code")}
                    >
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span>ROLE CODE</span>
                        <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="px-3.5 py-2 whitespace-nowrap">
                      DESCRIPTION
                    </th>
                    <th className="px-3.5 py-2 text-center whitespace-nowrap">
                      ACTIONS
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRoles.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-xs text-slate-400 italic">
                        No roles found.
                      </td>
                    </tr>
                  ) : (
                    paginatedRoles.map((r, index) => {
                      const userCount = getRoleUserCount(r);
                      const serialNo = startRoleIdx + index + 1;

                      return (
                        <tr 
                          key={r.id}
                          onClick={() => setSelectedRoleId(r.id)}
                          className="hover:bg-slate-50/80 transition-colors select-none cursor-pointer group"
                        >
                          {/* S.No. */}
                          <td className="px-3 py-2 w-12 text-center align-middle whitespace-nowrap font-medium text-slate-500 text-[11px]">
                            {serialNo}
                          </td>

                          {/* Role Group */}
                          <td className="px-3.5 py-2 align-middle font-semibold text-slate-900 whitespace-nowrap text-xs">
                            {r.name}
                          </td>

                          {/* Status */}
                          <td className="px-3.5 py-2 align-middle whitespace-nowrap">
                            {r.is_active !== false ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                                Disabled
                              </span>
                            )}
                          </td>

                          {/* Assigned Employees */}
                          <td className="px-3.5 py-2 align-middle text-slate-600 font-medium text-[11px] whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <Users className="h-3 w-3 text-slate-400 stroke-[1.75]" />
                              <span>{userCount} employee{userCount !== 1 ? 's' : ''}</span>
                            </div>
                          </td>

                          {/* Role Code / Badge */}
                          <td className="px-3.5 py-2 align-middle whitespace-nowrap">
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 tracking-wide uppercase">
                              {r.badge || r.code || r.id}
                            </span>
                          </td>

                          {/* Description */}
                          <td 
                            className="px-3.5 py-2 align-middle text-slate-500 text-[11px] whitespace-nowrap truncate max-w-sm xl:max-w-md"
                            title={getRoleDescription(r)}
                          >
                            {getRoleDescription(r)}
                          </td>

                          {/* Actions */}
                          <td className="px-3.5 py-2 align-middle text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5 relative">
                              <button 
                                type="button" 
                                onClick={() => setSelectedRoleId(r.id)}
                                className="h-6 w-6 rounded-md border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-500 flex items-center justify-center transition shadow-3xs cursor-pointer"
                                title="Edit Permissions"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>

                              <div className="relative">
                                <button 
                                  type="button" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMenuOpenRoleId(prev => prev === r.id ? null : r.id);
                                  }}
                                  className={`h-6 w-6 rounded-md border transition shadow-3xs cursor-pointer flex items-center justify-center ${
                                    menuOpenRoleId === r.id 
                                      ? "bg-slate-100 border-slate-300 text-slate-700" 
                                      : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-500"
                                  }`}
                                  title="More Options"
                                >
                                  <MoreVertical className="h-3 w-3" />
                                </button>

                                {/* Role Context Menu: Only 2 options (Disable role, Delete role) */}
                                {menuOpenRoleId === r.id && (
                                  <div 
                                    className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 text-left"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRoleStatus(r)}
                                      className="w-full px-3 py-1.5 hover:bg-slate-50 text-[10.5px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                                    >
                                      {r.is_active !== false ? (
                                        <>
                                          <UserX className="h-3.5 w-3.5 text-slate-400" />
                                          <span>Disable role</span>
                                        </>
                                      ) : (
                                        <>
                                          <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                          <span>Enable role</span>
                                        </>
                                      )}
                                    </button>
                                    
                                    <div className="border-t border-slate-100 my-0.5"></div>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRole(r)}
                                      className="w-full px-3 py-1.5 hover:bg-rose-50 text-[10.5px] font-medium text-rose-600 flex items-center gap-2 cursor-pointer transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                      <span>Delete role</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Roles Table Pagination Bar */}
            <div className="px-4 py-2.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 select-none text-xs text-slate-600 shrink-0">
              <div>
                Showing {sortedRoles.length === 0 ? 0 : startRoleIdx + 1} - {endRoleIdx} of {sortedRoles.length} roles
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <button 
                    type="button" 
                    onClick={() => setRolePage(p => Math.max(1, p - 1))} 
                    disabled={validRolePage <= 1} 
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-600 text-xs font-medium cursor-pointer transition"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {Array.from({ length: totalRolePages }, (_, i) => i + 1).map(page => (
                    <button 
                      key={page} 
                      type="button" 
                      onClick={() => setRolePage(page)} 
                      className={`h-7 min-w-[28px] px-2 flex items-center justify-center rounded-lg text-xs font-bold transition cursor-pointer ${
                        validRolePage === page 
                          ? 'bg-[#003F28] text-white shadow-2xs' 
                          : 'border border-slate-200 hover:bg-slate-50 text-slate-700 bg-white'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button 
                    type="button" 
                    onClick={() => setRolePage(p => Math.min(totalRolePages, p + 1))} 
                    disabled={validRolePage >= totalRolePages} 
                    className="h-7 w-7 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-slate-600 text-xs font-medium cursor-pointer transition"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span>Rows per page</span>
                  <div className="relative">
                    <select 
                      value={rolePageSize} 
                      onChange={e => { setRolePageSize(Number(e.target.value)); setRolePage(1); }} 
                      className="appearance-none h-7 pl-2.5 pr-6 border border-slate-200 rounded-lg bg-white text-xs font-medium text-slate-700 cursor-pointer focus:outline-none focus:border-[#003F28]"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1.5 top-2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* DIALOG: Role Permissions / Clearances Modal */}
          {selectedRoleId && typeof document !== "undefined" && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-[540px] w-full max-h-[80vh] flex flex-col overflow-hidden animate-scaleIn">
                
                {/* Panel Header */}
                <div className="p-4 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center border bg-blue-50 text-blue-600 border-blue-100 shadow-3xs">
                      <Shield className="h-4.5 w-4.5" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-bold text-slate-900 text-sm tracking-tight">
                        {roles.find(r => r.id === selectedRoleId)?.name || selectedRoleId} Clearances
                      </h3>
                      <div className="text-xs text-slate-400 mt-0.5 font-medium">
                        Configure baseline permissions for all employees in this role
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      ROLE: <span className="text-blue-600 font-extrabold">{roles.find(r => r.id === selectedRoleId)?.badge || selectedRoleId}</span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setSelectedRoleId("")}
                      className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Alert Info Banner */}
                <div className="px-4 py-2.5 bg-blue-50/70 border-b border-blue-100/70 text-blue-700 text-xs font-semibold flex items-center gap-2 shrink-0 select-none">
                  <Info className="h-4 w-4 text-blue-500 shrink-0" />
                  <span>Modifications apply to all assigned employees immediately. Save top-right to commit.</span>
                </div>

                {/* Permissions list container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-slate-50/30">
                  {filteredPermissions.map(cat => {
                    const catKey = cat.id || cat.category;
                    const isCollapsed = !!collapsedFolders[catKey];

                    return (
                      <div key={catKey} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                        {/* Category Header */}
                        <div
                          onClick={() => toggleFolder(catKey)}
                          className="bg-slate-50/90 hover:bg-slate-100/80 px-3.5 py-2.5 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-slate-150"
                        >
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                            {isCollapsed ? <Folder className="h-3.5 w-3.5 text-slate-400" /> : <FolderOpen className="h-3.5 w-3.5 text-blue-600" />}
                            <span>{cat.category}</span>
                            <span className="text-[9px] text-slate-400 font-bold border border-slate-200 px-1.5 py-0.2 rounded-md bg-white">
                              {cat.items.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                            <span>{isCollapsed ? "Expand" : "Collapse"}</span>
                            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3 text-slate-500" />}
                          </div>
                        </div>

                        {/* Page-Wise Permissions Cards */}
                        {!isCollapsed && (
                          <div className="divide-y divide-slate-100 bg-white">
                            {cat.items.map(item => {
                              const activeRoleObj = roles.find(r => r.id === selectedRoleId || r.code === selectedRoleId);
                              const targetRoleKey = activeRoleObj?.code || selectedRoleId;
                              const targetRoleIdStr = activeRoleObj?.id ? String(activeRoleObj.id) : selectedRoleId;

                              const cell = rolePermissions[targetRoleKey]?.[item.id] || rolePermissions[targetRoleIdStr]?.[item.id] || { read: false, write: false, admin: false };
                              const isPageEnabled = Boolean(cell.read || cell.write || cell.admin);

                              return (
                                <div key={item.id} className="p-3.5 hover:bg-slate-50/60 transition-colors space-y-2.5 text-left group border-b border-slate-100 last:border-b-0">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="space-y-0.5 min-w-0 pr-2">
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5">
                                          <span>{item.label}</span>
                                        </h4>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase border ${
                                          isPageEnabled
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                            : "bg-slate-100 text-slate-500 border-slate-300"
                                        }`}>
                                          {isPageEnabled ? "✓ Page Enabled" : "✕ Access Disabled"}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-sm">{item.desc}</p>
                                    </div>

                                    {/* Page Master Toggle Switch */}
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Page Access:</span>
                                      <button
                                        type="button"
                                        disabled={!isAdmin}
                                        onClick={() => {
                                          if (isPageEnabled) {
                                            // Turn Page Access OFF (clear all sub-permissions)
                                            toggleRolePerm(targetRoleKey, item.id, "read");
                                            if (cell.write) toggleRolePerm(targetRoleKey, item.id, "write");
                                            if (cell.admin) toggleRolePerm(targetRoleKey, item.id, "admin");
                                          } else {
                                            // Turn Page Access ON (enable view & write by default)
                                            toggleRolePerm(targetRoleKey, item.id, "read");
                                            toggleRolePerm(targetRoleKey, item.id, "write");
                                          }
                                        }}
                                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                          isPageEnabled ? "bg-[#003F28]" : "bg-slate-300"
                                        } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      >
                                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                          isPageEnabled ? "translate-x-4" : "translate-x-0"
                                        }`} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Sub-Actions Clearances Toolbar (Active when Page Access is ON) */}
                                  {isPageEnabled && (
                                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/90 flex items-center justify-between text-xs animate-fadeIn">
                                      <span className="text-[10px] uppercase font-black tracking-wider text-slate-500 flex items-center gap-1">
                                        <span>Sub-Action Operations Allowed:</span>
                                      </span>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => toggleRolePerm(targetRoleKey, item.id, "read")}
                                          disabled={!isAdmin}
                                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                                            cell.read 
                                              ? "bg-[#003F28] text-white shadow-xs font-bold" 
                                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                          } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          title="View / Read Page Access"
                                        >
                                          <Eye className="h-3 w-3 shrink-0" />
                                          <span>View</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleRolePerm(targetRoleKey, item.id, "write")}
                                          disabled={!isAdmin}
                                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                                            cell.write 
                                              ? "bg-[#003F28] text-white shadow-xs font-bold" 
                                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                          } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          title="Edit / Action Operations Access (Approve, Hold, Edit Fields)"
                                        >
                                          <Edit2 className="h-3 w-3 shrink-0" />
                                          <span>Edit / Action</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleRolePerm(targetRoleKey, item.id, "admin")}
                                          disabled={!isAdmin}
                                          className={`px-3 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                                            cell.admin 
                                              ? "bg-[#003F28] text-white shadow-xs font-bold" 
                                              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                                          } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          title="Admin Full Control (Delete, Override & System Config)"
                                        >
                                          <Shield className="h-3 w-3 shrink-0" />
                                          <span>Admin Control</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Modal footer */}
                <div className="p-3.5 bg-white border-t border-slate-100 shrink-0 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRoleId("")}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold text-xs uppercase tracking-wider rounded-lg transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const activeRoleObj = roles.find(r => r.id === selectedRoleId || r.code === selectedRoleId);
                      if (activeRoleObj) {
                        await handleSaveRolePermissions(activeRoleObj);
                      }
                      setSelectedRoleId("");
                    }}
                    disabled={savingRolePerms}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition shadow-sm cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingRolePerms ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>Save & Apply Clearances</span>
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: BY USERS (Master-Detail) */}
      {/* ========================================================= */}
      {activeTab === "users" && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-[500px]">
          
          {/* LEFT COMPONENT: Users Table */}
          <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
            
            {/* Top Tabs Filtering Row */}
            <div className="p-3.5 border-b border-slate-200 bg-slate-50/40 flex flex-wrap gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setRoleFilter("ALL")}
                className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition cursor-pointer border ${
                  roleFilter === "ALL" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                All users
              </button>
              {roles.map(r => {
                const rCode = r.code || r.id;
                const isSelected = roleFilter.toLowerCase() === rCode.toLowerCase();
                return (
                  <button
                    key={rCode}
                    type="button"
                    onClick={() => setRoleFilter(rCode)}
                    className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition cursor-pointer border ${
                      isSelected
                        ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {r.name}
                  </button>
                );
              })}
            </div>

            {/* Users List Data Table */}
            <div className="overflow-visible min-w-full">
              <table className="w-full text-left border-collapse min-w-[650px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/40 text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    <th className="px-4 py-2.5 w-[30%]">Name</th>
                    <th className="px-3.5 py-2.5 w-[20%]">Role</th>
                    <th className="px-3.5 py-2.5 w-[14%]">Status</th>
                    <th className="px-3.5 py-2.5 w-[18%]">Date Added</th>
                    <th className="px-3.5 py-2.5 w-[18%] text-right pr-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-xs text-slate-400 italic">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => {
                      return (
                        <tr 
                          key={u.id}
                          className="hover:bg-slate-50/80 transition-colors select-none"
                        >
                          {/* Name + Email + Avatar */}
                          <td className="px-4 py-2.5 w-[30%] align-middle">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-7.5 w-7.5 rounded-full flex items-center justify-center font-bold text-[9px] tracking-wide shrink-0 shadow-3xs ${getAvatarColor(u.name)}`}>
                                {u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-slate-900 truncate max-w-[120px]">{u.name}</span>
                                  {u.is_new && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-600 text-[8px] font-bold border border-blue-100">
                                      New
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] text-slate-400 truncate leading-tight mt-0.5">{u.email}</span>
                              </div>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-3.5 py-2.5 w-[20%] align-middle">
                            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                              {getRoleDisplayName(u.role)}
                            </span>
                          </td>

                          {/* Status badge */}
                          <td className="px-3.5 py-2.5 w-[14%] align-middle">
                            {u.status === "Onboarded" ? (
                              <span className="px-2 py-0.5 rounded-full text-[8.5px] font-semibold bg-blue-50 text-blue-700 border border-blue-100/60 shadow-3xs">
                                Onboarded
                              </span>
                            ) : u.status === "Active" || u.is_active ? (
                              <span className="px-2 py-0.5 rounded-full text-[8.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100/60 shadow-3xs">
                                Active
                              </span>
                            ) : u.status === "Pending" ? (
                              <span className="px-2 py-0.5 rounded-full text-[8.5px] font-semibold bg-amber-50 text-amber-700 border border-amber-100/60 shadow-3xs">
                                Pending
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[8.5px] font-semibold bg-slate-50 text-slate-500 border border-slate-200 shadow-3xs">
                                Inactive
                              </span>
                            )}
                          </td>

                          {/* Date Added */}
                          <td className="px-3.5 py-2.5 w-[18%] text-slate-400 font-medium align-middle">
                            {u.created_on ? new Date(u.created_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : "24 Jan 2022"}
                          </td>

                          {/* Actions */}
                          <td className="px-3.5 py-2.5 w-[18%] text-right pr-4 align-middle relative" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5 relative">
                              <button 
                                type="button" 
                                onClick={() => {
                                  const fallbackDiv = availableDivisions.length > 0 ? availableDivisions[0].code : "";
                                  const rawApproval = u.approval_divisions || u.division || fallbackDiv;
                                  const approvalArray = typeof rawApproval === "string" 
                                    ? rawApproval.split(",").map(d => d.trim()).filter(Boolean)
                                    : (Array.isArray(rawApproval) ? rawApproval : (fallbackDiv ? [fallbackDiv] : []));
                                  setEditDivSearch("");
                                  setShowAllEditDivs(false);
                                  setEditingUserModal({
                                    id: u.id,
                                    employee_id: u.employee_id || u.username || "",
                                    employee_name: u.employee_name || u.name || "",
                                    name: u.name || u.employee_name || "",
                                    username: u.username || "",
                                    email: u.email || "",
                                    phone_number: u.phone_number || "",
                                    division: u.division || fallbackDiv,
                                    approval_divisions: approvalArray,
                                    department: u.department || u.dept || "Finance",
                                    plant: u.plant || "",
                                    role: u.role || (roles.length > 0 ? (roles[0].code || roles[0].id) : "employee"),
                                    password: ""
                                  });
                                }}
                                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 px-2 py-0.5 rounded transition cursor-pointer inline-flex items-center gap-1"
                                title="Edit Employee ID & Profile"
                              >
                                <Edit2 className="h-2.5 w-2.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => toggleMenu(e, u.id)}
                                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition cursor-pointer"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>

                              {/* Context action menu dropdown */}
                              {menuOpenUserId === u.id && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fallbackDiv = availableDivisions.length > 0 ? availableDivisions[0].code : "";
                                    const rawApproval = u.approval_divisions || u.division || fallbackDiv;
                                    const approvalArray = typeof rawApproval === "string" 
                                      ? rawApproval.split(",").map(d => d.trim()).filter(Boolean)
                                      : (Array.isArray(rawApproval) ? rawApproval : (fallbackDiv ? [fallbackDiv] : []));
                                    setEditDivSearch("");
                                  setShowAllEditDivs(false);
                                    setEditingUserModal({
                                      id: u.id,
                                      employee_id: u.employee_id || u.username || "",
                                      employee_name: u.employee_name || u.name || "",
                                      name: u.name || u.employee_name || "",
                                      username: u.username || "",
                                      email: u.email || "",
                                      phone_number: u.phone_number || "",
                                      division: u.division || fallbackDiv,
                                      approval_divisions: approvalArray,
                                      department: u.department || u.dept || "Finance",
                                      plant: u.plant || "",
                                      role: u.role || (roles.length > 0 ? (roles[0].code || roles[0].id) : "employee"),
                                      password: ""
                                    });
                                    setMenuOpenUserId(null);
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 text-[10.5px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-blue-600" />
                                  <span>Edit Profile & ID</span>
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleToggleStatus(u);
                                    setMenuOpenUserId(null);
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 text-[10.5px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  {u.is_active ? <UserX className="h-3.5 w-3.5 text-slate-400" /> : <UserCheck className="h-3.5 w-3.5 text-slate-400" />}
                                  <span>{u.is_active ? 'Disable user' : 'Enable user'}</span>
                                </button>
                                
                                <div className="border-t border-slate-100 my-1"></div>
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteUser(u.id, u.name, u.employee_id);
                                    setMenuOpenUserId(null);
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-rose-50 text-[10.5px] font-medium text-rose-600 flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>Remove user</span>
                                </button>
                              </div>
                            )}
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
        </div>
      )}



      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOM ROLE */}
      {/* ========================================================= */}
      {showAddRoleModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xs w-full p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-black text-slate-900 uppercase">Add Role</h3>
              <button onClick={() => setShowAddRoleModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form onSubmit={handleAddRole} className="space-y-2.5">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Role Title / Display Name</label>
                <input 
                  type="text"
                  required
                  value={newRoleName}
                  onChange={e => {
                    setNewRoleName(e.target.value);
                    if (!newRoleCode || newRoleCode === newRoleName.toLowerCase().replace(/[\s\-/\\]+/g, '_').replace(/[^a-z0-9_]/g, '')) {
                      setNewRoleCode(e.target.value.toLowerCase().replace(/[\s\-/\\]+/g, '_').replace(/[^a-z0-9_]/g, ''));
                    }
                  }}
                  placeholder="e.g. Treasury Officer"
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                  System Role Code <span className="text-slate-400 font-normal">(Auto-generated ID)</span>
                </label>
                <input 
                  type="text"
                  value={newRoleCode}
                  onChange={e => setNewRoleCode(e.target.value.toLowerCase().replace(/[\s\-/\\]+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. treasury_officer"
                  className="w-full text-xs p-2 font-mono bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25 text-slate-700"
                />
                <p className="text-[9px] text-slate-400 mt-1">Unique identifier used in backend DB. Duplicates auto-suffix (_2, _3).</p>
              </div>

              <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newRoleName.trim() || isCreatingRole}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {isCreatingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>{isCreatingRole ? "Creating..." : "Add Role"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOM PERMISSION */}
      {/* ========================================================= */}
      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOM PERMISSION (SIMPLIFIED & PROFESSIONAL) */}
      {/* ========================================================= */}
      {showAddPermissionModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-[#003F28]" />
                <span>Create System Permission</span>
              </h3>
              <button onClick={() => setShowAddPermissionModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddPermission} className="space-y-3">
              <div>
                <label className="block text-[9.5px] font-bold text-slate-700 uppercase mb-1">
                  Permission / Page Name <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  autoFocus
                  value={newPermLabel}
                  onChange={e => {
                    setNewPermLabel(e.target.value);
                    if (!newPermId) {
                      setNewPermId(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                    }
                  }}
                  placeholder="e.g. Customer Complaints Approval Portal"
                  className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-700 uppercase mb-1">
                  Assign to Category Group
                </label>
                <select
                  value={newPermCategory}
                  onChange={e => setNewPermCategory(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white cursor-pointer"
                >
                  <option value="OPERATIONS PAGES">OPERATIONS PAGES</option>
                  <option value="FEEDBACK PAGE">FEEDBACK PAGE</option>
                  <option value="ADMINISTRATION PAGES">ADMINISTRATION PAGES</option>
                  <option value="NEW_CATEGORY">+ Create Custom Category...</option>
                </select>
              </div>

              {newPermCategory === "NEW_CATEGORY" && (
                <div>
                  <label className="block text-[9.5px] font-bold text-slate-700 uppercase mb-1">New Category Title</label>
                  <input 
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Vendor Management & Approvals"
                    className="w-full text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-[9.5px] font-bold text-slate-700 uppercase mb-1">
                  Description & Scope <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea 
                  value={newPermDesc}
                  onChange={e => setNewPermDesc(e.target.value)}
                  placeholder="Describe what action or page this permission clears..."
                  rows={2}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium text-slate-700 focus:border-[#003F28] focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddPermissionModal(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPermLabel.trim()}
                  className="px-4 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Create Permission
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

            {/* ========================================================= */}
      {/* MODAL: ADD NEW USER (Spacious 2-Column Horizontal Layout) */}
      {/* ========================================================= */}
      {showAddUserModal && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-[#003F28] flex items-center justify-center shadow-xs">
                    <UserPlus className="h-4 w-4 text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 leading-tight">Add New Employee / User</h3>
                    <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">Fill in employee details and assign division approval access</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleAddUser} className="flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                    {/* LEFT COLUMN: Employee Identity & Hierarchy (5 Cols) */}
                    <div className="lg:col-span-5 space-y-3.5 border-b lg:border-b-0 lg:border-r border-slate-100 pb-5 lg:pb-0 lg:pr-6">
                      <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                        <Users className="h-3.5 w-3.5 text-[#003F28]" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">User Profile Details</span>
                      </div>

                      {/* Row 1: EMP ID + Full Name */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                            Employee ID <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={newUserEmpId}
                            onChange={e => setNewUserEmpId(e.target.value)}
                            placeholder="e.g. 16220"
                            className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300 font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                            Full Name <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={newUserName}
                            onChange={e => setNewUserName(e.target.value)}
                            placeholder="e.g. Ram Kumar"
                            className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300 font-semibold"
                          />
                        </div>
                      </div>

                      {/* Row 2: Official Email */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                          Official Email <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={newUserEmail}
                          onChange={e => setNewUserEmail(e.target.value)}
                          placeholder="e.g. ram.kumar@company.com"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                        <p className="text-[9.5px] text-slate-400 mt-1">Activation & login OTP will be sent to this email address.</p>
                      </div>

                      {/* Row 3: Role Group */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Role Group</label>
                        {rolesLoading ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#003F28]" />
                            <span>Loading roles...</span>
                          </div>
                        ) : rolesError ? (
                          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{rolesError}</div>
                        ) : roles.length === 0 ? (
                          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No roles configured.</div>
                        ) : (
                          <select
                            value={newUserRole || (roles[0].code || roles[0].id)}
                            onChange={e => setNewUserRole(e.target.value)}
                            className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 font-semibold text-slate-800 cursor-pointer transition-all"
                          >
                            {roles.map(r => (
                              <option key={r.code || r.id} value={r.code || r.id}>{r.name}</option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Row 4: Main Division (Triggers Approval Divisions Filter) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            Main Division <span className="text-rose-500">*</span>
                          </label>
                          <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                            Filters Approvals
                          </span>
                        </div>
                        {divisionsLoading ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#003F28]" />
                            <span>Loading...</span>
                          </div>
                        ) : divisionsError ? (
                          <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{divisionsError}</div>
                        ) : availableDivisions.length === 0 ? (
                          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No divisions available.</div>
                        ) : (
                          <select
                            value={newUserDivision || (availableDivisions[0]?.code || "")}
                            onChange={e => {
                              const newDiv = e.target.value;
                              setNewUserDivision(newDiv);
                              setShowAllAddDivs(false); // Reset to filtered view for selected Main Division
                              const matchingDivs = availableDivisions.filter(d => isDivisionInGroup(d.code, newDiv)).map(d => d.code);
                              setNewUserApprovalDivisions(prev => {
                                const retained = prev.filter(c => matchingDivs.includes(c));
                                if (newDiv && !retained.includes(newDiv) && matchingDivs.includes(newDiv)) {
                                  return [newDiv, ...retained];
                                }
                                return retained.length > 0 ? retained : (newDiv ? [newDiv] : []);
                              });
                            }}
                            className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 font-bold text-slate-800 cursor-pointer transition-all"
                          >
                            {availableDivisions.map(d => (
                              <option key={d.code} value={d.code}>
                                {d.name ? `${d.name} (${d.code})` : d.code}
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="text-[9px] text-slate-400 mt-1">Primary organizational unit assigned to this employee.</p>
                      </div>

                      {/* Row 5: Department + Plant */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Department</label>
                          <input
                            type="text"
                            value={newUserDept}
                            onChange={e => setNewUserDept(e.target.value)}
                            placeholder="e.g. Finance"
                            className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Plant / Branch</label>
                          <input
                            type="text"
                            value={newUserPlant}
                            onChange={e => setNewUserPlant(e.target.value)}
                            placeholder="e.g. TN-SIVAKASI"
                            className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                          />
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Approval Divisions Matrix (7 Cols) */}
                    <div className="lg:col-span-7 flex flex-col space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-[#003F28]" />
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">Approval Divisions</span>
                          {newUserApprovalDivisions.length > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-[#003F28] border border-emerald-200">
                              {newUserApprovalDivisions.length} selected
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {addGroupList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (allAddGroupSelected) {
                                  setNewUserApprovalDivisions(prev => prev.filter(c => !addGroupList.some(d => d.code === c)));
                                } else {
                                  setNewUserApprovalDivisions(prev => Array.from(new Set([...prev, ...addGroupList.map(d => d.code)])));
                                }
                              }}
                              className="text-[10px] text-[#003F28] hover:underline font-bold transition-colors cursor-pointer"
                            >
                              {allAddGroupSelected ? "Deselect all" : "Select all in view"}
                            </button>
                          )}
                          {newUserApprovalDivisions.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setNewUserApprovalDivisions([])}
                              className="text-[10px] text-slate-400 hover:text-rose-500 font-semibold transition-colors cursor-pointer"
                            >
                              Clear all
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Filter Mode Tabs: [ Main Division Group ] / [ All Divisions ] */}
                      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                        <button
                          type="button"
                          onClick={() => setShowAllAddDivs(false)}
                          className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            !showAllAddDivs
                              ? "bg-white text-[#003F28] shadow-xs border border-slate-200"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <Filter className="h-3 w-3 text-emerald-600" />
                          <span>Filtered: {getDivisionPrefix(activeAddMainDiv) || "Main"} Group ({addGroupDivs.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAllAddDivs(true)}
                          className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                            showAllAddDivs
                              ? "bg-white text-[#003F28] shadow-xs border border-slate-200"
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          <span>Show All Divisions ({availableDivisions.length})</span>
                        </button>
                      </div>

                      {/* Division Selector Box */}
                      {divisionsLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-6 border border-slate-200 rounded-lg bg-slate-50 justify-center">
                          <Loader2 className="h-4 w-4 animate-spin text-[#003F28]" />
                          <span>Loading approval divisions...</span>
                        </div>
                      ) : divisionsError ? (
                        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-3">{divisionsError}</div>
                      ) : addGroupList.length === 0 ? (
                        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-4 text-center">
                          No divisions available in {getDivisionPrefix(activeAddMainDiv)} group. Click "Show All Divisions" to assign any division.
                        </div>
                      ) : (
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex flex-col bg-white">
                          {/* Search bar */}
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/70">
                            <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                            <input
                              type="text"
                              value={divSearch}
                              onChange={e => setDivSearch(e.target.value)}
                              placeholder={showAllAddDivs ? "Search all divisions..." : `Search within ${getDivisionPrefix(activeAddMainDiv)} divisions...`}
                              className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400 font-medium"
                            />
                            {divSearch && (
                              <button type="button" onClick={() => setDivSearch("")} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>

                          {/* Grid of checkboxes (2 spacious columns) */}
                          <div className="grid grid-cols-2 gap-2 p-2.5 max-h-[290px] overflow-y-auto custom-scrollbar">
                            {filteredAddDivs.length === 0 ? (
                              <div className="col-span-full text-[11px] text-slate-400 text-center py-6">
                                No divisions found matching "{divSearch}".
                              </div>
                            ) : (
                              filteredAddDivs.map(d => {
                                const isChecked = newUserApprovalDivisions.includes(d.code);
                                const isMain = d.code === activeAddMainDiv;
                                return (
                                  <label
                                    key={d.code}
                                    className={`flex items-start gap-2 p-2 rounded-lg border transition-all cursor-pointer select-none ${
                                      isChecked
                                        ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 font-bold shadow-2xs"
                                        : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 text-slate-700"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setNewUserApprovalDivisions(prev => [...prev, d.code]);
                                        } else {
                                          setNewUserApprovalDivisions(prev => prev.filter(x => x !== d.code));
                                        }
                                      }}
                                      className="rounded border-slate-300 text-[#003F28] focus:ring-[#003F28] h-3.5 w-3.5 mt-0.5 shrink-0 cursor-pointer"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-bold text-slate-900 truncate" title={d.name || d.code}>
                                          {d.name || d.code}
                                        </span>
                                        {isMain && (
                                          <span className="px-1 py-0.2 rounded text-[8px] font-extrabold uppercase bg-[#003F28] text-white">
                                            Main
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[9.5px] text-slate-400 font-mono block">
                                        {d.code}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      <p className="text-[9.5px] text-slate-400 leading-relaxed">
                        Filtered against Main Division (<strong>{activeAddMainDiv}</strong>). Select the business divisions this user is permitted to review and approve documents for.
                      </p>
                    </div>

                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex-shrink-0">
                  <p className="text-[10px] text-slate-400">Fields marked <span className="text-rose-500 font-bold">*</span> are required</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddUserModal(false)}
                      className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingUser}
                      className="px-5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5"
                    >
                      {isCreatingUser && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>{isCreatingUser ? "Creating..." : "Create User"}</span>
                    </button>
                  </div>
                </div>
              </form>

            </div>
          </div>,
          document.body
      )}
{/* ========================================================= */}
      {/* MODAL: EDIT USER PROFILE & EMPLOYEE ID */}
      {/* ========================================================= */}
      {/* ========================================================= */}
      {/* MODAL: EDIT USER PROFILE & EMPLOYEE ID */}
      {/* ========================================================= */}
      {editingUserModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-[#003F28] flex items-center justify-center shadow-xs">
                  <Edit2 className="h-4 w-4 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">Edit Employee Profile & Details</h3>
                  <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">Modify profile credentials, primary organizational division, and approval access permissions</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setEditingUserModal(null)} 
                className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                  {/* LEFT COLUMN: Employee Identity & Hierarchy (5 Cols) */}
                  <div className="lg:col-span-5 space-y-3.5 border-b lg:border-b-0 lg:border-r border-slate-100 pb-5 lg:pb-0 lg:pr-6">
                    <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                      <Users className="h-3.5 w-3.5 text-[#003F28]" />
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">User Profile Details</span>
                    </div>

                    {/* Row 1: EMP ID + Full Name */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                          Emp ID (Editable) <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          type="text"
                          required
                          value={editingUserModal.employee_id || ''}
                          onChange={e => setEditingUserModal({ ...editingUserModal, employee_id: e.target.value })}
                          placeholder="e.g. 16220 or E22-02094"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-900 focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                          Full Name (Editable) <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          type="text"
                          required
                          value={editingUserModal.employee_name || editingUserModal.name || ''}
                          onChange={e => setEditingUserModal({ ...editingUserModal, employee_name: e.target.value, name: e.target.value })}
                          placeholder="e.g. Ram Kumar"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-900 focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>

                    {/* Row 2: Email + Username */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                          Email Address <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          type="email"
                          required
                          value={editingUserModal.email || ''}
                          onChange={e => setEditingUserModal({ ...editingUserModal, email: e.target.value })}
                          placeholder="e.g. ram@company.com"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Username</label>
                        <input 
                          type="text"
                          value={editingUserModal.username || ''}
                          onChange={e => setEditingUserModal({ ...editingUserModal, username: e.target.value })}
                          placeholder="e.g. ramk"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>

                    {/* Row 3: Phone Number + Role Group */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Phone Number</label>
                        <input 
                          type="text"
                          value={editingUserModal.phone_number || ''}
                          onChange={e => setEditingUserModal({ ...editingUserModal, phone_number: e.target.value })}
                          placeholder="e.g. +91 98765 43210"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Role Group</label>
                        <select
                          value={editingUserModal.role || 'employee'}
                          onChange={e => setEditingUserModal({ ...editingUserModal, role: e.target.value })}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 font-semibold text-slate-800 cursor-pointer transition-all"
                        >
                          {roles.map(r => (
                            <option key={r.code || r.id} value={r.code || r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Row 4: Main Division (Triggers Approval Divisions Filter) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                          Main Division <span className="text-rose-500">*</span>
                        </label>
                        <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                          Filters Approvals
                        </span>
                      </div>
                      {divisionsLoading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#003F28]" />
                          <span>Loading...</span>
                        </div>
                      ) : divisionsError ? (
                        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                          {divisionsError}
                        </div>
                      ) : availableDivisions.length === 0 ? (
                        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          No active divisions.
                        </div>
                      ) : (
                        <select
                          value={editingUserModal.division || (availableDivisions[0]?.code || "")}
                          onChange={e => {
                            const newDiv = e.target.value;
                            setShowAllEditDivs(false); // Reset to filtered view for selected Main Division
                            const currApprovals = Array.isArray(editingUserModal.approval_divisions) 
                              ? editingUserModal.approval_divisions 
                              : (editingUserModal.approval_divisions ? String(editingUserModal.approval_divisions).split(',').map(x => x.trim()).filter(Boolean) : []);
                            const matchingDivs = availableDivisions.filter(d => isDivisionInGroup(d.code, newDiv)).map(d => d.code);
                            const retained = currApprovals.filter(code => matchingDivs.includes(code));
                            const nextApprovals = (newDiv && !retained.includes(newDiv) && matchingDivs.includes(newDiv))
                              ? [newDiv, ...retained]
                              : (retained.length > 0 ? retained : (newDiv ? [newDiv] : []));
                            setEditingUserModal({ 
                              ...editingUserModal, 
                              division: newDiv,
                              approval_divisions: nextApprovals
                            });
                          }}
                          className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 font-bold text-slate-800 cursor-pointer transition-all"
                        >
                          {availableDivisions.map(d => (
                            <option key={d.code} value={d.code}>
                              {d.name ? `${d.name} (${d.code})` : d.code}
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="text-[9px] text-slate-400 mt-1">Primary organizational unit assigned to this employee.</p>
                    </div>

                    {/* Row 5: Department + Plant */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Department</label>
                        <input 
                          type="text"
                          value={editingUserModal.department || editingUserModal.dept || ''}
                          onChange={e => setEditingUserModal({ ...editingUserModal, department: e.target.value })}
                          placeholder="e.g. Finance"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Plant / Branch</label>
                        <input 
                          type="text"
                          value={editingUserModal.plant || ''}
                          onChange={e => setEditingUserModal({ ...editingUserModal, plant: e.target.value })}
                          placeholder="e.g. TN-SIVAKASI"
                          className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                        />
                      </div>
                    </div>

                    {/* Row 6: Reset Password */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reset Password (Optional)</label>
                      <input 
                        type="password"
                        value={editingUserModal.password || ''}
                        onChange={e => setEditingUserModal({ ...editingUserModal, password: e.target.value })}
                        placeholder="Leave blank to keep current password"
                        className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                      />
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Approval Divisions Matrix (7 Cols) */}
                  <div className="lg:col-span-7 flex flex-col space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-[#003F28]" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">Approval Divisions</span>
                        {currentEditApprovals.length > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-[#003F28] border border-emerald-200">
                            {currentEditApprovals.length} selected
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {editGroupList.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (allEditGroupSelected) {
                                const nextList = currentEditApprovals.filter(c => !editGroupList.some(d => d.code === c));
                                setEditingUserModal({ ...editingUserModal, approval_divisions: nextList });
                              } else {
                                const nextList = Array.from(new Set([...currentEditApprovals, ...editGroupList.map(d => d.code)]));
                                setEditingUserModal({ ...editingUserModal, approval_divisions: nextList });
                              }
                            }}
                            className="text-[10px] text-[#003F28] hover:underline font-bold transition-colors cursor-pointer"
                          >
                            {allEditGroupSelected ? "Deselect group" : "Select all group"}
                          </button>
                        )}
                        {currentEditApprovals.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEditingUserModal({ ...editingUserModal, approval_divisions: [] })}
                            className="text-[10px] text-slate-400 hover:text-rose-500 font-medium transition-colors cursor-pointer"
                          >
                            Clear all
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Filter Mode Tabs: [ Main Division Group ] / [ All Divisions ] */}
                    <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                      <button
                        type="button"
                        onClick={() => setShowAllEditDivs(false)}
                        className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          !showAllEditDivs
                            ? "bg-white text-[#003F28] shadow-xs border border-slate-200"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Filter className="h-3 w-3 text-emerald-600" />
                        <span>Filtered: {getDivisionPrefix(activeEditMainDiv) || "Main"} Group ({editGroupDivs.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAllEditDivs(true)}
                        className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          showAllEditDivs
                            ? "bg-white text-[#003F28] shadow-xs border border-slate-200"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <span>Show All Divisions ({availableDivisions.length})</span>
                      </button>
                    </div>

                    {/* Division Selector Box */}
                    {divisionsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-6 border border-slate-200 rounded-lg bg-slate-50 justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-[#003F28]" />
                        <span>Loading approval divisions...</span>
                      </div>
                    ) : divisionsError ? (
                      <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-3">
                        {divisionsError}
                      </div>
                    ) : editGroupList.length === 0 ? (
                      <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-4 text-center">
                        No divisions available in {getDivisionPrefix(activeEditMainDiv)} group. Click "Show All Divisions" to assign any division.
                      </div>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex flex-col bg-white">
                        {/* Search bar */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/70">
                          <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          <input
                            type="text"
                            value={editDivSearch}
                            onChange={e => setEditDivSearch(e.target.value)}
                            placeholder={showAllEditDivs ? "Search all divisions..." : `Search within ${getDivisionPrefix(activeEditMainDiv)} divisions...`}
                            className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400 font-medium"
                          />
                          {editDivSearch && (
                            <button type="button" onClick={() => setEditDivSearch("")} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Grid of checkboxes (2 spacious columns) */}
                        <div className="grid grid-cols-2 gap-2 p-2.5 max-h-[290px] overflow-y-auto custom-scrollbar">
                          {filteredEditDivs.length === 0 ? (
                            <div className="col-span-full text-[11px] text-slate-400 text-center py-6">
                              No divisions found matching "{editDivSearch}".
                            </div>
                          ) : (
                            filteredEditDivs.map(d => {
                              const isChecked = currentEditApprovals.includes(d.code);
                              const isMain = d.code === activeEditMainDiv;
                              return (
                                <label
                                  key={d.code}
                                  className={`flex items-start gap-2 p-2 rounded-lg border transition-all cursor-pointer select-none ${
                                    isChecked
                                      ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 font-bold shadow-2xs"
                                      : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 text-slate-700"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={e => {
                                      let nextList;
                                      if (e.target.checked) {
                                        nextList = [...currentEditApprovals, d.code];
                                      } else {
                                        nextList = currentEditApprovals.filter(x => x !== d.code);
                                      }
                                      setEditingUserModal({
                                        ...editingUserModal,
                                        approval_divisions: nextList
                                      });
                                    }}
                                    className="rounded border-slate-300 text-[#003F28] focus:ring-[#003F28] h-3.5 w-3.5 mt-0.5 shrink-0 cursor-pointer"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] font-bold text-slate-900 truncate" title={d.name || d.code}>
                                        {d.name || d.code}
                                      </span>
                                      {isMain && (
                                        <span className="px-1 py-0.2 rounded text-[8px] font-extrabold uppercase bg-[#003F28] text-white">
                                          Main
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[9.5px] text-slate-400 font-mono block">
                                      {d.code}
                                    </span>
                                  </div>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    <p className="text-[9.5px] text-slate-400 leading-relaxed">
                      Filtered against Main Division (<strong>{activeEditMainDiv}</strong>). Select the business divisions this user is permitted to review and approve documents for.
                    </p>
                  </div>

                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex-shrink-0">
                <p className="text-[10px] text-slate-400">Fields marked <span className="text-rose-500 font-bold">*</span> are required</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUserModal(null)}
                    className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingUser}
                    className="px-5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {isUpdatingUser && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{isUpdatingUser ? "Saving..." : "Save Profile"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
