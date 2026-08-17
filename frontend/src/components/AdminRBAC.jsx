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
  Tag,
  MoreVertical,
  ExternalLink,
  Info,
  ShieldCheck,
  DollarSign,
  FileText,
  BarChart3,
  UserX,
  UserCheck
} from "lucide-react";

// Standard Baseline Roles
export const INITIAL_ROLES = [
  { id: "admin", name: "Administrator", badge: "Admin", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "manager", name: "Approver / Manager", badge: "Manager", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "auditor", name: "Internal Auditor", badge: "Auditor", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "ap_specialist", name: "AP Specialist", badge: "AP Staff", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "employee", name: "General Employee", badge: "Employee", color: "bg-slate-100 text-slate-700 border-slate-200" }
];

const MOCKUP_USERS_RBAC = [
  { 
    id: "mock-1", 
    user_uid: "USR-200001", 
    employee_id: "EMP-20001", 
    name: "Shane Nguyen", 
    employee_name: "Shane Nguyen",
    username: "shanengu", 
    email: "shanengu@labourlink.com", 
    phone_number: "+91 98401 23001",
    role: "ap_specialist", // Consultant
    dept: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Onboarded",
    is_new: true,
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2023-06-07T09:30:00.000Z",
    created_at: "2023-06-07T09:30:00.000Z" 
  },
  { 
    id: "mock-2", 
    user_uid: "USR-200002", 
    employee_id: "EMP-20002", 
    name: "Arlene McCoy", 
    employee_name: "Arlene McCoy",
    username: "arlenemccoy", 
    email: "arlenemccoy@labourlink.com", 
    phone_number: "+91 98401 23002",
    role: "ap_specialist", // Consultant
    dept: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "AUTHENTICATOR",
    created_by: "System Initializer",
    created_on: "2022-01-24T10:00:00.000Z",
    created_at: "2022-01-24T10:00:00.000Z" 
  },
  { 
    id: "mock-3", 
    user_uid: "USR-200003", 
    employee_id: "EMP-20003", 
    name: "Guy Hawkins", 
    employee_name: "Guy Hawkins",
    username: "guyhawk", 
    email: "guyhawk@labourlink.com", 
    phone_number: "+91 98401 23003",
    role: "admin", // Administrator
    dept: "IT Governance", 
    division: "VCC", 
    is_active: false, 
    status: "Inactive",
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2020-04-18T11:15:00.000Z",
    created_at: "2020-04-18T11:15:00.000Z" 
  },
  { 
    id: "mock-4", 
    user_uid: "USR-200004", 
    employee_id: "EMP-20004", 
    name: "Dianne Russell", 
    employee_name: "Dianne Russell",
    username: "diannerussell", 
    email: "diannerussell@labourlink.com", 
    phone_number: "+91 98401 23004",
    role: "manager", // Manager
    dept: "Operations Management", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "SMS",
    created_by: "System Initializer",
    created_on: "2022-02-02T12:00:00.000Z",
    created_at: "2022-02-02T12:00:00.000Z" 
  },
  { 
    id: "mock-5", 
    user_uid: "USR-200005", 
    employee_id: "EMP-20005", 
    name: "Albert Flores", 
    employee_name: "Albert Flores",
    username: "albertflores", 
    email: "albertflores@labourlink.com", 
    phone_number: "+91 98401 23005",
    role: "ap_specialist", // Consultant
    dept: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Pending",
    mfa_enabled: false,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2022-06-29T14:30:00.000Z",
    created_at: "2022-06-29T14:30:00.000Z" 
  },
  { 
    id: "mock-6", 
    user_uid: "USR-200006", 
    employee_id: "EMP-20006", 
    name: "Jacob Jones", 
    employee_name: "Jacob Jones",
    username: "jacobjones", 
    email: "jacobjones@labourlink.com", 
    phone_number: "+91 98401 23006",
    role: "admin", // Administrator
    dept: "IT Governance", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "AUTHENTICATOR",
    created_by: "System Initializer",
    created_on: "2021-10-30T08:15:00.000Z",
    created_at: "2021-10-30T08:15:00.000Z" 
  },
  { 
    id: "mock-7", 
    user_uid: "USR-200007", 
    employee_id: "EMP-20007", 
    name: "Kathryn Murphy", 
    employee_name: "Kathryn Murphy",
    username: "kathryn", 
    email: "kathryn@labourlink.com", 
    phone_number: "+91 98401 23007",
    role: "manager", // Manager
    dept: "Operations Management", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "SMS",
    created_by: "System Initializer",
    created_on: "2022-12-23T15:20:00.000Z",
    created_at: "2022-12-23T15:20:00.000Z" 
  },
  { 
    id: "mock-8", 
    user_uid: "USR-200008", 
    employee_id: "EMP-20008", 
    name: "Marvin McKinney", 
    employee_name: "Marvin McKinney",
    username: "marvin", 
    email: "marvin@labourlink.com", 
    phone_number: "+91 98401 23008",
    role: "ap_specialist", // Consultant
    dept: "Consultancy Services", 
    division: "VCC", 
    is_active: false, 
    status: "Inactive",
    mfa_enabled: false,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2023-05-17T11:00:00.000Z",
    created_at: "2023-05-17T11:00:00.000Z" 
  },
  { 
    id: "mock-9", 
    user_uid: "USR-200009", 
    employee_id: "EMP-20009", 
    name: "Darlene Robertson", 
    employee_name: "Darlene Robertson",
    username: "darlene", 
    email: "darlenerobert@labourlink.com", 
    phone_number: "+91 98401 23009",
    role: "ap_specialist", // Consultant
    dept: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2022-08-14T09:00:00.000Z",
    created_at: "2022-08-14T09:00:00.000Z" 
  }
];

const ICON_MAP = {
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
  Tag,
  MoreVertical,
  ExternalLink,
  Info,
  ShieldCheck,
  DollarSign,
  FileText,
  BarChart3,
  UserX,
  UserCheck
};

// Clean functional permission list categorized into Folders
const INITIAL_PERMISSIONS = [
  {
    id: "cat_docs",
    category: "Documents & OCR Extraction",
    icon: "Folder",
    items: [
      { id: "doc:upload", label: "Upload Documents", desc: "Upload and batch ingest vendor invoices", iconName: "FileText", iconColor: "bg-purple-50 text-purple-600 border-purple-100" },
      { id: "doc:verify", label: "OCR Verification Desk", desc: "Verify extracted fields & line items", iconName: "BarChart3", iconColor: "bg-blue-50 text-blue-600 border-blue-100" },
      { id: "doc:edit", label: "Edit & Field Overrides", desc: "Modify monetary values, HSN, and tax codes", iconName: "CheckSquare", iconColor: "bg-sky-50 text-sky-600 border-sky-100" },
      { id: "doc:delete", label: "Delete / Purge Drafts", desc: "Remove draft records and recalled files", iconName: "Trash2", iconColor: "bg-rose-50 text-rose-600 border-rose-100" }
    ]
  },
  {
    id: "cat_wf",
    category: "Workflow & Approvals Routing",
    icon: "Folder",
    items: [
      { id: "wf:view", label: "View Task Queue", desc: "Access pending task list and SLA timers", iconName: "Eye", iconColor: "bg-slate-50 text-slate-600 border-slate-200" },
      { id: "wf:approve", label: "Approve / Reject Action", desc: "Sign off or return workflow approval stages", iconName: "ShieldCheck", iconColor: "bg-emerald-50 text-emerald-600 border-emerald-100" },
      { id: "wf:delegate", label: "Delegate Signoff", desc: "Assign approval duties to backup peers", iconName: "Users", iconColor: "bg-blue-50 text-blue-600 border-blue-100" },
      { id: "wf:force", label: "Fast-Track & Emergency Route", desc: "Emergency route bypass & manual escalation", iconName: "AlertTriangle", iconColor: "bg-amber-50 text-amber-600 border-amber-100" }
    ]
  },
  {
    id: "cat_audit",
    category: "Financial System Audits & Tax",
    icon: "Folder",
    items: [
      { id: "audit:trail", label: "Audit Log Inspection", desc: "View system immutable event trail and IP logs", iconName: "Layers", iconColor: "bg-slate-50 text-slate-600 border-slate-200" },
      { id: "audit:signoff", label: "Internal Audit (IA) Signoff", desc: "Final pre-posting audit verification", iconName: "DollarSign", iconColor: "bg-amber-50 text-amber-600 border-amber-100" },
      { id: "audit:export", label: "Export Financial Reports", desc: "Download ledger CSV & tax data schedules", iconName: "FileSpreadsheet", iconColor: "bg-blue-50 text-blue-600 border-blue-100" }
    ]
  },
  {
    id: "cat_sys",
    category: "IAM & System Governance",
    icon: "Folder",
    items: [
      { id: "sys:flows", label: "Flow Builder Engine", desc: "Create and edit multi-stage workflow routes", iconName: "Sliders", iconColor: "bg-blue-50 text-blue-600 border-blue-100" },
      { id: "sys:rules", label: "Routing Rule Matrix", desc: "Configure conditional AND/OR routing rules", iconName: "Filter", iconColor: "bg-slate-50 text-slate-600 border-slate-200" },
      { id: "sys:rbac", label: "IAM Role & Access Matrix", desc: "Modify roles and user clearance permissions", iconName: "Shield", iconColor: "bg-blue-50 text-blue-600 border-blue-100" }
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

  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  // Add User modal states
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserEmpId, setNewUserEmpId] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("employee");
  const [newUserDept, setNewUserDept] = useState("Finance");
  const [newUserDivision, setNewUserDivision] = useState("VCC");
  const [newUserPlant, setNewUserPlant] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // States for adding dynamic permissions
  const [showAddPermissionModal, setShowAddPermissionModal] = useState(false);
  const [newPermId, setNewPermId] = useState("");
  const [newPermLabel, setNewPermLabel] = useState("");
  const [newPermDesc, setNewPermDesc] = useState("");
  const [newPermCategory, setNewPermCategory] = useState("Documents & OCR Extraction");
  const [newPermIcon, setNewPermIcon] = useState("Shield");
  const [newCategoryName, setNewCategoryName] = useState("");

  const flatPermissions = permissionsList.flatMap(c => 
    c.items.map(item => ({
      ...item,
      icon: ICON_MAP[item.iconName] || ShieldCheck,
      iconColor: item.iconColor || "bg-blue-50 text-blue-600 border-blue-100"
    }))
  );

  // Custom permissions UI side panel state
  const [panelUserGroup, setPanelUserGroup] = useState("ap_specialist");
  const [panelPermissions, setPanelPermissions] = useState({});
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [menuOpenUserId, setMenuOpenUserId] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState("ap_specialist");

  // Helper functions for the redesigned Users and Roles lists
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      (u.name || "").toLowerCase().includes(search.toLowerCase()) || 
      (u.email || "").toLowerCase().includes(search.toLowerCase()) || 
      (u.employee_id || u.username || "").toLowerCase().includes(search.toLowerCase());
    
    if (roleFilter === "ALL") return matchesSearch;
    return u.role === roleFilter && matchesSearch;
  });

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
    const roleMap = {
      admin: "Administrator",
      manager: "Manager",
      ap_specialist: "Consultant",
      auditor: "Internal Auditor",
      employee: "Employee"
    };
    return roleMap[roleId] || roleId;
  };

  const handleSelectAllUsers = (e) => {
    if (e.target.checked) {
      const ids = filteredUsers.map(u => u.id);
      setSelectedUserIds(new Set(ids));
    } else {
      setSelectedUserIds(new Set());
    }
  };

  const handleSelectUserCheckbox = (e, userId) => {
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
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Update permissions side-panel toggles when selectedUser changes
  useEffect(() => {
    if (selectedUser && activeTab === "users") {
      setPanelUserGroup(selectedUser.role || "employee");
      
      const userKey = selectedUser.username || selectedUser.email;
      const userRole = selectedUser.role || "employee";
      const roleBase = rolePermissions[userRole] || INITIAL_ROLE_PERMS[userRole] || {};
      const overrides = userOverrides[userKey] || {};
      
      const initialPerms = {};
      flatPermissions.forEach(perm => {
        const baseVal = roleBase[perm.id] ? (roleBase[perm.id].write || roleBase[perm.id].read) : false;
        const overrideVal = overrides[perm.id];
        
        let effectiveVal = baseVal;
        if (overrideVal !== undefined) {
          effectiveVal = overrideVal.write !== undefined ? overrideVal.write : (overrideVal.read !== undefined ? overrideVal.read : baseVal);
        }
        initialPerms[perm.id] = effectiveVal;
      });
      setPanelPermissions(initialPerms);
    }
  }, [selectedUser, userOverrides, rolePermissions, activeTab]);

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
        const permsListCfg = configs.find(c => c.key === "RBAC_PERMISSION_DEFINITIONS");
        if (permsListCfg && permsListCfg.value) {
          try { setPermissionsList(JSON.parse(permsListCfg.value)); } catch(e) {}
        }
      }

      if (usersRes.ok) {
        const userData = await usersRes.json();
        if (Array.isArray(userData) && userData.length > 0) {
          const dbUsers = userData.map(u => ({
            id: String(u.id),
            user_uid: u.user_uid || `USR-${100000 + Number(u.id)}`,
            employee_id: u.employee_id || `EMP-${u.id}`,
            name: u.employee_name || u.name || u.username,
            employee_name: u.employee_name || u.name || u.username,
            username: u.username || u.employee_id,
            email: u.email || `${u.username || 'user'}@labourlink.com`,
            phone_number: u.phone_number || "+91 98400 00000",
            role: u.role || 'employee',
            dept: u.department || u.dept || 'General Operations',
            division: u.division || 'VCC',
            is_active: u.is_active !== undefined ? u.is_active : true,
            status: u.is_active !== false ? "Active" : "Inactive",
            created_on: u.created_on || u.created_at || new Date().toISOString()
          }));
          
          setUsers(dbUsers);
          
          if (dbUsers.length > 0) {
            setSelectedUser(dbUsers[0]);
          }
        } else {
          setUsers([]);
          setSelectedUser(null);
        }
      } else {
        setUsers([]);
        setSelectedUser(null);
      }
    } catch(e) {
      console.error(e);
      setUsers(MOCKUP_USERS_RBAC);
      setSelectedUser(MOCKUP_USERS_RBAC[1]);
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
    
    if (String(selectedUser.id).startsWith("mock")) {
      return;
    }
    
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/users/${selectedUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          employee_id: selectedUser.employee_id || selectedUser.username,
          employee_name: selectedUser.name,
          name: selectedUser.name,
          email: selectedUser.email,
          username: selectedUser.username,
          role: newRole,
          department: selectedUser.department || selectedUser.dept,
          division: selectedUser.division || "VCC"
        })
      });
    } catch(e) {}
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

    if (String(user.id).startsWith("mock")) {
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ is_active: nextStatus })
      });
    } catch(e) {}
  };

  const deleteUser = async (id, name, empId) => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to deactivate and remove employee ${name} (${empId})?`)) return;
    
    if (String(id).startsWith("mock")) {
      setUsers(prev => prev.filter(u => u.id !== id));
      if (selectedUser?.id === id) setSelectedUser(null);
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/users/${id}`, { method: 'DELETE', headers: token ? { "Authorization": `Bearer ${token}` } : {} });
      setUsers(prev => prev.filter(u => u.id !== id));
      if (selectedUser?.id === id) setSelectedUser(null);
    } catch(e) { 
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  const handleTogglePermission = (permId) => {
    if (!isAdmin) return;
    setPanelPermissions(prev => ({
      ...prev,
      [permId]: !prev[permId]
    }));
  };

  const handlePanelGroupChange = (newRole) => {
    if (!isAdmin) return;
    setPanelUserGroup(newRole);
    
    const roleBase = rolePermissions[newRole] || INITIAL_ROLE_PERMS[newRole] || {};
    const newPerms = {};
    flatPermissions.forEach(perm => {
      const baseVal = roleBase[perm.id] ? (roleBase[perm.id].write || roleBase[perm.id].read) : false;
      newPerms[perm.id] = baseVal;
    });
    setPanelPermissions(newPerms);
  };

  const handleSavePermissionChanges = async () => {
    if (!isAdmin || !selectedUser) {
      setErrorMsg("Action Restricted: Only Administrators can modify user permissions.");
      setTimeout(() => setErrorMsg(""), 3500);
      return;
    }

    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const userKey = selectedUser.username || selectedUser.email;
      const updatedOverrides = { ...userOverrides };
      const overridesForUser = {};
      const roleBase = rolePermissions[panelUserGroup] || INITIAL_ROLE_PERMS[panelUserGroup] || {};

      flatPermissions.forEach(perm => {
        const baseVal = roleBase[perm.id] ? (roleBase[perm.id].write || roleBase[perm.id].read) : false;
        const currentVal = panelPermissions[perm.id];

        if (currentVal !== baseVal) {
          overridesForUser[perm.id] = {
            read: currentVal,
            write: currentVal,
            admin: currentVal && !!roleBase[perm.id]?.admin
          };
        }
      });

      if (Object.keys(overridesForUser).length > 0) {
        updatedOverrides[userKey] = overridesForUser;
      } else {
        delete updatedOverrides[userKey];
      }

      const token = localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "UBAC_USER_OVERRIDES",
          value: JSON.stringify(updatedOverrides),
          description: "User permission overrides"
        })
      });

      setUserOverrides(updatedOverrides);

      if (String(selectedUser.id).startsWith("mock")) {
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { 
          ...u, 
          role: panelUserGroup,
          status: u.is_active ? "Active" : "Inactive"
        } : u));
      } else {
        const payload = {
          employee_id: selectedUser.employee_id || selectedUser.username,
          employee_name: selectedUser.name,
          name: selectedUser.name,
          email: selectedUser.email,
          username: selectedUser.username,
          role: panelUserGroup,
          department: selectedUser.department || selectedUser.dept,
          division: selectedUser.division || "VCC"
        };

        await fetch(`/api/users/${selectedUser.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });

        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: panelUserGroup } : u));
      }

      setSuccessMsg(`✓ Permissions for "${selectedUser.name}" saved successfully!`);
      setSelectedUser(null); 
      
      window.dispatchEvent(new CustomEvent("role-permissions-updated"));
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch(e) {
      console.error(e);
      setErrorMsg("Failed to save permission modifications.");
      setTimeout(() => setErrorMsg(""), 3500);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRole = (e) => {
    e.preventDefault();
    if (!isAdmin || !newRoleName.trim()) return;
    const roleId = newRoleName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newRole = {
      id: roleId,
      name: newRoleName.trim(),
      badge: newRoleName.trim().slice(0, 8),
      color: "bg-blue-50 text-blue-700 border-blue-200"
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

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "RBAC_PERMISSION_DEFINITIONS",
          value: JSON.stringify(permissionsList),
          description: "Categorized list of system permission definitions"
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
      setPermissionsList(INITIAL_PERMISSIONS);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserEmpId.trim() || !newUserPassword.trim()) {
      setErrorMsg("Please fill in all required fields (Emp ID, Name, Email, Password).");
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
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers,
        body: JSON.stringify({
          employee_id: newUserEmpId.trim(),
          employee_name: newUserName.trim(),
          username: newUserEmpId.trim(),
          email: newUserEmail.trim(),
          password: newUserPassword,
          role: newUserRole,
          division: newUserDivision || "VCC",
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
        setNewUserPassword("");
        setNewUserRole("employee");
        setNewUserDept("Finance");
        setNewUserDivision("VCC");
        setNewUserPlant("");
        setShowAddUserModal(false);
      } else {
        const errData = await res.json();
        setErrorMsg(errData.detail || "Failed to create user.");
      }
    } catch (err) {
      setErrorMsg("Network error trying to create user.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleAddPermission = (e) => {
    e.preventDefault();
    if (!newPermId.trim() || !newPermLabel.trim()) return;

    const formattedId = newPermId.trim().toLowerCase().replace(/\s+/g, ":");
    
    // Check if duplicate
    const allItems = permissionsList.flatMap(c => c.items);
    if (allItems.some(item => item.id === formattedId)) {
      alert("A permission with this ID already exists.");
      return;
    }

    const newPermissionItem = {
      id: formattedId,
      label: newPermLabel.trim(),
      desc: newPermDesc.trim() || "No description provided",
      iconName: newPermIcon || "Shield",
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

  const handleDeletePermission = (permId, permLabel) => {
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
          const { [permId]: removed, ...rest } = updated[roleId];
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
          const { [permId]: removed, ...rest } = updated[username];
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

  const filteredFields = activeScopeFields.filter(f => 
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
      <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        
        {/* Left: View Switcher (By Roles vs By Users vs Field Visibility) */}
        <div className="flex items-center gap-2.5">
          <div className="inline-flex p-1 bg-slate-200/60 rounded-lg border border-slate-300/40 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("roles")}
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "roles" ? "bg-white text-blue-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>By Roles ({roles.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("users")}
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "users" ? "bg-white text-blue-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>By Users ({users.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("flac")}
              className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "flac" ? "bg-white text-blue-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Sliders className="h-3.5 w-3.5 text-blue-600" />
              <span>Field Visibility (FLAC)</span>
            </button>
          </div>

          {/* Scope Selector when on FLAC tab */}
          {activeTab === "flac" && (
            <div className="flex items-center gap-1.5 bg-white px-2.5 h-8 rounded-lg border border-blue-200 shadow-2xs">
              <Layers className="h-3.5 w-3.5 text-blue-600 shrink-0" />
              <span className="text-[9.5px] font-extrabold text-blue-950 uppercase">Scope:</span>
              <select
                value={selectedScope}
                onChange={e => setSelectedScope(e.target.value)}
                className="text-[11px] font-bold text-blue-900 bg-transparent border-0 outline-none cursor-pointer pr-1"
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
            <div className="flex items-center gap-1 px-2.5 h-8 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[9px] font-bold">
              <Lock className="h-2.5 w-2.5" />
              <span>Admin Edit Only</span>
            </div>
          )}
        </div>

        {/* Right: Search & Action Buttons */}
        <div className="flex items-center gap-1.5">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full text-xs pl-8 pr-2.5 h-8 bg-white border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25 outline-none text-slate-800 shadow-2xs transition-all duration-200"
            />
          </div>

          {isAdmin && (
            <div className="flex items-center gap-1.5">
              {activeTab === "roles" && (
                <button
                  type="button"
                  onClick={() => setShowAddRoleModal(true)}
                  className="h-8 flex items-center gap-1 px-2.5 bg-white hover:bg-slate-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Role</span>
                </button>
              )}
              {activeTab === "users" && (
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  className="h-8 flex items-center gap-1 px-2.5 bg-white hover:bg-slate-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>User</span>
                </button>
              )}
              
              {(activeTab === "roles" || activeTab === "users") && (
                <button
                  type="button"
                  onClick={() => {
                    setNewPermCategory(permissionsList[0]?.category || "Documents & OCR Extraction");
                    setShowAddPermissionModal(true);
                  }}
                  className="h-8 flex items-center gap-1 px-2.5 bg-white hover:bg-slate-50 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Permission</span>
                </button>
              )}
            </div>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleResetDefaults}
              className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-250 cursor-pointer transition-colors"
              title="Reset to baseline"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="h-8 flex items-center gap-1 px-3.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
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
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-[500px]">
          {/* LEFT COMPONENT: Roles Table Grid */}
          <div className={`flex-1 flex flex-col overflow-y-auto min-w-0 bg-white ${selectedRoleId ? 'lg:border-r lg:border-slate-200' : ''}`}>
            
            {/* Roles List Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/40 text-[9.5px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    <th className="px-3.5 py-2.5 w-[35%]">Role Group</th>
                    <th className="px-3.5 py-2.5 w-[20%]">Status</th>
                    <th className="px-3.5 py-2.5 w-[25%]">Assigned Employees</th>
                    <th className="px-3.5 py-2.5 w-[20%]">Role Code</th>
                    <th className="px-3.5 py-2.5 pr-6 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {roles.map(r => {
                    const isSelected = selectedRoleId === r.id;
                    const userCount = users.filter(u => u.role === r.id).length;
                    
                    return (
                      <tr 
                        key={r.id}
                        onClick={() => setSelectedRoleId(r.id)}
                        className={`hover:bg-slate-50/60 transition-colors cursor-pointer select-none ${
                          isSelected ? 'bg-blue-50/25 font-semibold' : ''
                        }`}
                      >
                        {/* Name + Shield Icon */}
                        <td className="px-3.5 py-2.5 w-[35%] align-middle font-bold text-slate-800">
                          <div className="flex items-center gap-2.5">
                            <div className={`h-7.5 w-7.5 rounded-lg flex items-center justify-center shrink-0 border ${
                              r.id === "admin" ? "bg-blue-50 text-blue-600 border-blue-100" :
                              r.id === "manager" ? "bg-blue-50 text-blue-600 border-blue-100" :
                              r.id === "auditor" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              r.id === "ap_specialist" ? "bg-amber-50 text-amber-600 border-amber-100" :
                              "bg-slate-50 text-slate-600 border-slate-200"
                            }`}>
                              <Shield className="h-4 w-4" />
                            </div>
                            <span className="font-semibold text-slate-900">{r.name}</span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-3.5 py-2.5 w-[20%] align-middle">
                          <span className="px-2 py-0.5 rounded-full text-[8.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100/60 shadow-3xs">
                            Active
                          </span>
                        </td>

                        {/* Assigned Employees */}
                        <td className="px-3.5 py-2.5 w-[25%] align-middle text-slate-650 font-medium">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3 text-slate-400" />
                            <span>{userCount} employee{userCount !== 1 ? 's' : ''}</span>
                          </div>
                        </td>

                        {/* Role Code / Badge */}
                        <td className="px-3.5 py-2.5 w-[20%] align-middle">
                          <span className="text-[7.5px] font-bold px-1.5 py-0.2 rounded border bg-slate-100 text-slate-600 border-slate-200 uppercase leading-none">
                            {r.badge}
                          </span>
                        </td>

                        {/* Action Link */}
                        <td className="px-3.5 py-2.5 text-right pr-6 align-middle" onClick={e => e.stopPropagation()}>
                          <span className="text-[10px] font-semibold text-slate-400 hover:text-blue-600 transition cursor-pointer flex items-center justify-end gap-0.5" onClick={() => setSelectedRoleId(r.id)}>
                            <span>View clearances</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT COMPONENT: Role Permissions Matrix Toggles */}
          {selectedRoleId && (
            <div className="w-full lg:w-[480px] bg-slate-50/20 border-t lg:border-t-0 border-slate-200 flex flex-col shrink-0 bg-white">
              {/* Panel Header */}
              <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center border ${
                    selectedRoleId === "admin" ? "bg-blue-50 text-blue-600 border-blue-100" :
                    selectedRoleId === "manager" ? "bg-blue-50 text-blue-600 border-blue-100" :
                    selectedRoleId === "auditor" ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    selectedRoleId === "ap_specialist" ? "bg-amber-50 text-amber-600 border-amber-100" :
                    "bg-slate-50 text-slate-600 border-slate-200"
                  }`}>
                    <Shield className="h-4 w-4" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-extrabold text-slate-900 text-xs tracking-tight">
                      {roles.find(r => r.id === selectedRoleId)?.name || selectedRoleId} permissions
                    </h3>
                    <div className="text-[9px] text-slate-400 leading-none mt-0.5">
                      Configure baseline permissions for all employees in this role
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[9.5px] font-bold text-slate-500 uppercase">
                    Role: <span className="text-blue-600 font-extrabold">{roles.find(r => r.id === selectedRoleId)?.badge || selectedRoleId}</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setSelectedRoleId("")}
                    className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Alert Info Banner */}
              <div className="px-4 py-2.5 bg-blue-50/60 border-b border-blue-100 text-blue-700 text-[9.5px] font-medium flex items-start gap-2 shrink-0 select-none">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span>Modifications to this role matrix will immediately apply to all assigned employees, unless overridden individually.</span>
              </div>

              {/* Permissions list container */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar bg-white">
                {filteredPermissions.map(cat => {
                  const catKey = cat.id || cat.category;
                  const isCollapsed = !!collapsedFolders[catKey];

                  return (
                    <div key={catKey} className="border border-slate-200 rounded-xl overflow-hidden shadow-3xs">
                      {/* Category Header */}
                      <div
                        onClick={() => toggleFolder(catKey)}
                        className="bg-slate-50/95 hover:bg-slate-100/80 px-3.5 py-2 flex items-center justify-between cursor-pointer select-none transition-colors border-b border-slate-200"
                      >
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                          {isCollapsed ? <Folder className="h-3.5 w-3.5 text-slate-400" /> : <FolderOpen className="h-3.5 w-3.5 text-blue-600" />}
                          <span>{cat.category}</span>
                          <span className="text-[8.5px] text-slate-400 font-bold border border-slate-200 px-1.5 py-0.2 rounded-md bg-white">
                            {cat.items.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5 text-[8.5px] font-medium text-slate-400">
                          <span>{isCollapsed ? "Expand" : "Collapse"}</span>
                          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                        </div>
                      </div>

                      {/* Permissions List */}
                      {!isCollapsed && (
                        <div className="divide-y divide-slate-100 bg-white">
                          {cat.items.map(item => {
                            const cell = rolePermissions[selectedRoleId]?.[item.id] || { read: false, write: false, admin: false };
                            return (
                              <div key={item.id} className="p-3 hover:bg-slate-50/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left group">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-slate-800 text-[10.5px]">{item.label}</h4>
                                    {item.isCustom && (
                                      <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 text-[7px] font-extrabold uppercase border border-blue-100 leading-none">
                                        Custom
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9.5px] text-slate-400 font-medium">{item.desc}</p>
                                </div>

                                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                                  {/* Delete Custom Permission */}
                                  {isAdmin && item.isCustom && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeletePermission(item.id, item.label)}
                                      className="p-1.5 text-slate-400 hover:text-rose-650 hover:bg-rose-50 rounded-lg transition opacity-0 group-hover:opacity-100 cursor-pointer"
                                      title={`Delete permission "${item.label}"`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
                                    <button
                                      type="button"
                                      onClick={() => toggleRolePerm(selectedRoleId, item.id, "read")}
                                      disabled={!isAdmin}
                                      className={`px-2 py-1 rounded text-[9px] font-bold cursor-pointer transition ${
                                        cell.read ? "bg-slate-800 text-white shadow-2xs font-extrabold" : "text-slate-500 hover:text-slate-800"
                                      } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      title="Read-Only Clearance"
                                    >
                                      View
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleRolePerm(selectedRoleId, item.id, "write")}
                                      disabled={!isAdmin}
                                      className={`px-2 py-1 rounded text-[9px] font-bold cursor-pointer transition ${
                                        cell.write ? "bg-blue-600 text-white shadow-2xs font-extrabold" : "text-slate-500 hover:text-slate-800"
                                      } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      title="Write / Modify Clearance"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleRolePerm(selectedRoleId, item.id, "admin")}
                                      disabled={!isAdmin}
                                      className={`px-2 py-1 rounded text-[9px] font-bold cursor-pointer transition ${
                                        cell.admin ? "bg-blue-900 text-white shadow-2xs font-extrabold" : "text-slate-500 hover:text-slate-800"
                                      } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                                      title="Admin Signoff / Delete Clearance"
                                    >
                                      Admin
                                    </button>
                                  </div>
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
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 2: BY USERS (Master-Detail) */}
      {/* ========================================================= */}
      {activeTab === "users" && (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-[500px]">
          
          {/* LEFT COMPONENT: Users Table */}
          <div className={`flex-1 flex flex-col overflow-y-auto min-w-0 ${selectedUser ? 'lg:border-r lg:border-slate-200' : ''}`}>
            
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
              <button
                type="button"
                onClick={() => setRoleFilter("admin")}
                className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition cursor-pointer border ${
                  roleFilter === "admin" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Administrator
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("manager")}
                className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition cursor-pointer border ${
                  roleFilter === "manager" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Manager
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("ap_specialist")}
                className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition cursor-pointer border ${
                  roleFilter === "ap_specialist" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Consultant
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("auditor")}
                className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold transition cursor-pointer border ${
                  roleFilter === "auditor" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Auditor
              </button>
            </div>

            {/* Users List Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/40 text-[9.5px] font-bold text-slate-500 uppercase tracking-wider select-none">
                    <th className="px-3.5 py-2.5 w-[6%] text-center">
                      <input 
                        type="checkbox"
                        onChange={handleSelectAllUsers}
                        checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                      />
                    </th>
                    <th className="px-3.5 py-2.5 w-[32%]">Name</th>
                    <th className="px-3.5 py-2.5 w-[14%]">Status</th>
                    <th className="px-3.5 py-2.5 w-[18%]">Permissions</th>
                    <th className="px-3.5 py-2.5 w-[14%]">Date Added</th>
                    <th className="px-3.5 py-2.5 w-[16%] text-right pr-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-xs text-slate-400 italic">
                        <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-blue-600" />
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-xs text-slate-400 italic">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(u => {
                      const isSelected = selectedUser?.id === u.id;
                      const hasOverrides = userOverrides[u.username || u.email] && Object.keys(userOverrides[u.username || u.email]).length > 0;
                      
                      return (
                        <tr 
                          key={u.id}
                          onClick={() => setSelectedUser(u)}
                          className={`hover:bg-slate-50/60 transition-colors cursor-pointer select-none ${
                            isSelected ? 'bg-blue-50/25' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="px-3.5 py-2.5 w-[6%] text-center align-middle" onClick={e => e.stopPropagation()}>
                            <input 
                              type="checkbox"
                              checked={selectedUserIds.has(u.id)}
                              onChange={(e) => handleSelectUserCheckbox(e, u.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                            />
                          </td>

                          {/* Name + Email + Avatar */}
                          <td className="px-3.5 py-2.5 w-[32%] align-middle">
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
                                  {hasOverrides && (
                                    <span className="px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-600 text-[8px] font-bold border border-amber-100" title="User has specific overrides">
                                      Custom
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] text-slate-400 truncate leading-tight mt-0.5">{u.email}</span>
                              </div>
                            </div>
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

                          {/* Permissions */}
                          <td className="px-3.5 py-2.5 w-[18%] text-slate-650 font-medium align-middle">
                            {getRoleDisplayName(u.role)}
                          </td>

                          {/* Date Added */}
                          <td className="px-3.5 py-2.5 w-[14%] text-slate-400 font-medium align-middle">
                            {u.created_on ? new Date(u.created_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : "24 Jan 2022"}
                          </td>

                          {/* Actions */}
                          <td className="px-3.5 py-2.5 w-[16%] text-right pr-6 align-middle relative" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[10px] font-semibold text-slate-400 hover:text-blue-600 mr-1 transition cursor-pointer flex items-center gap-0.5" onClick={() => setSelectedUser(u)}>
                                <span>View profile</span>
                                <ExternalLink className="h-2.5 w-2.5" />
                              </span>
                              <button
                                type="button"
                                onClick={(e) => toggleMenu(e, u.id)}
                                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded transition cursor-pointer"
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>
                            </div>

                            {/* Context action menu dropdown */}
                            {menuOpenUserId === u.id && (
                              <div className="absolute right-3.5 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setMenuOpenUserId(null);
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 text-[10.5px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Shield className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Setup permissions</span>
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setMenuOpenUserId(null);
                                    setTimeout(() => {
                                      document.getElementById("user-group-dropdown")?.focus();
                                    }, 150);
                                  }}
                                  className="w-full px-3 py-1.5 hover:bg-slate-50 text-[10.5px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                                >
                                  <Sliders className="h-3.5 w-3.5 text-slate-400" />
                                  <span>Move to other group</span>
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
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT NESTED PANEL: User Permissions Settings */}
          {selectedUser && (
            <div className="w-full lg:w-[420px] bg-slate-50/20 border-t lg:border-t-0 border-slate-200 flex flex-col shrink-0">
              {/* Panel header */}
              <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wider">
                  User Permissions
                </h3>
                <button 
                  type="button" 
                  onClick={() => setSelectedUser(null)}
                  className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Profile details card */}
              <div className="p-3.5 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-[11px] tracking-wider shadow-2xs ${getAvatarColor(selectedUser.name)}`}>
                      {selectedUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-extrabold text-slate-900 text-xs tracking-tight">{selectedUser.name}</span>
                      <span className="text-[9.5px] text-slate-400 truncate mt-0.5">{selectedUser.email}</span>
                    </div>
                  </div>
                  <span className="text-[9.5px] font-bold text-blue-600 hover:text-blue-700 transition cursor-pointer flex items-center gap-0.5">
                    <span>View profile</span>
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </div>
              </div>

              {/* Info alert banner */}
              <div className="p-2.5 bg-blue-50/60 border-b border-blue-100 text-blue-700 text-[9.5px] font-medium flex items-start gap-2 shrink-0 select-none">
                <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
                <span>Permission list will change when select the user group</span>
              </div>

              {/* Group selection dropdown */}
              <div className="p-3.5 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 text-[10.5px]">
                <span className="font-bold text-slate-700">User Group</span>
                <div className="relative w-44">
                  <select
                    id="user-group-dropdown"
                    value={panelUserGroup}
                    onChange={e => handlePanelGroupChange(e.target.value)}
                    className="w-full text-[10.5px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1.5 pr-7 outline-none appearance-none cursor-pointer focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 shadow-3xs animate-none"
                  >
                    <option value="admin">Administrator</option>
                    <option value="manager">Manager</option>
                    <option value="ap_specialist">Consultant</option>
                    <option value="auditor">Internal Auditor</option>
                    <option value="employee">Employee</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Scrollable list of permissions toggles */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 custom-scrollbar">
                {flatPermissions.map(perm => {
                  const isEnabled = !!panelPermissions[perm.id];
                  const IconComponent = perm.icon || ShieldCheck;
                  
                  return (
                    <div 
                      key={perm.id} 
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-slate-350 hover:shadow-2xs transition-all duration-200 select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`h-7.5 w-7.5 rounded-lg flex items-center justify-center border shrink-0 ${perm.iconColor}`}>
                          <IconComponent className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex flex-col text-left">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10.5px] font-extrabold text-slate-900 leading-snug">{perm.label}</span>
                            {perm.isCustom && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 border border-blue-100 text-[8px] font-bold">
                                Custom
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] text-slate-400 leading-tight mt-0.5">{perm.desc}</span>
                        </div>
                      </div>

                      {/* Toggle Switch */}
                      <button
                        type="button"
                        onClick={() => handleTogglePermission(perm.id)}
                        disabled={!isAdmin}
                        className={`relative inline-flex h-4.5 w-8.5 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none focus:ring-2 focus:ring-blue-500/25 ${
                          isEnabled ? 'bg-blue-600' : 'bg-slate-200'
                        } ${!isAdmin ? 'opacity-65 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            isEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Save changes footer */}
              <div className="p-3.5 bg-white border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={handleSavePermissionChanges}
                  disabled={saving || !isAdmin}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition shadow-2xs hover:shadow-sm cursor-pointer disabled:opacity-60 text-center flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save changes</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* VIEW 3: FIELD LEVEL ACCESS CONTROL (FLAC) MATRIX */}
      {/* ========================================================= */}
      {activeTab === "flac" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* FLAC Scope Information & Inheritance Banner */}
          <div className="px-3.5 py-1.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold text-[10px]">
                {selectedScope === "GLOBAL" ? <Globe className="h-3 w-3" /> : <Layers className="h-3 w-3" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-slate-900 text-[11px]">
                    {FLAC_SCOPES.find(s => s.id === selectedScope)?.name}
                  </h3>
                  {selectedScope === "GLOBAL" ? (
                    <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[8px] font-semibold uppercase">
                      Master Baseline (Default for all flows)
                    </span>
                  ) : isCustomizedScope ? (
                    <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[8px] font-medium">
                      Customized Exception
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[8px] font-medium">
                      Inheriting Global Master
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-slate-400 leading-tight">
                  {FLAC_SCOPES.find(s => s.id === selectedScope)?.desc}
                </p>
              </div>
            </div>

            {/* Quick Bulk Action Buttons */}
            {isAdmin && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowAddCustomFieldModal(true)}
                  className="px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-[9px] font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Plus className="h-2.5 w-2.5" />
                  <span>Add Field</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyToAllFlows}
                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-semibold transition cursor-pointer flex items-center gap-1 shadow-2xs"
                  title="Propagate this exact policy to all workflows and categories"
                >
                  <Copy className="h-2.5 w-2.5" />
                  <span>Apply to All Flows</span>
                </button>

                {selectedScope !== "GLOBAL" && isCustomizedScope && (
                  <button
                    type="button"
                    onClick={handleResetScopeToGlobal}
                    className="px-2 py-0.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-medium transition cursor-pointer"
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
                <tr className="bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                  <th className="py-2 px-3 text-[9.5px] font-bold text-slate-600 uppercase tracking-wider w-[260px] bg-slate-50 sticky left-0 z-30 border-r border-slate-200">
                    Field Attribute ({filteredFields.length})
                  </th>
                  {roles.map(r => (
                    <th key={r.id} className="py-1.5 px-2 text-center border-r border-slate-100 last:border-r-0 min-w-[120px]">
                      <div className="flex flex-col items-center">
                        <span className="px-1.5 py-0.2 rounded text-[8px] font-semibold uppercase tracking-wider text-slate-600 bg-slate-100 border border-slate-200 mb-0.5">
                          {r.badge}
                        </span>
                        <span className="text-[10.5px] font-semibold text-slate-800 leading-tight">{r.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 text-[10.5px]">
                {filteredFields.map(field => (
                  <tr key={field.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    <td className="py-1.5 px-3 bg-white sticky left-0 z-10 border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.02)]">
                      <div className="flex flex-col pl-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 text-[11px]">{field.label}</span>
                          <span className="text-[7.5px] font-medium uppercase tracking-wider px-1 py-0.2 bg-slate-100 text-slate-600 rounded border border-slate-200">
                            {field.category}
                          </span>
                        </div>
                        <span className="text-[8.5px] text-slate-400 leading-none mt-0.5">{field.desc}</span>
                      </div>
                    </td>

                    {roles.map(r => {
                      const currentVal = getEffectiveFieldState(r.id, field.id);
                      return (
                        <td key={r.id} className="py-1.5 px-2 text-center border-r border-slate-100 last:border-r-0">
                          <div className="inline-flex items-center p-0.5 rounded bg-slate-100 border border-slate-200">
                            
                            {/* Hidden */}
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => setFieldScopeRolePerm(r.id, field.id, "hidden")}
                              className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium transition cursor-pointer ${
                                currentVal === "hidden"
                                  ? "bg-slate-800 text-white shadow-2xs"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                              title="Field is hidden for this role"
                            >
                              Hidden
                            </button>

                            {/* View */}
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => setFieldScopeRolePerm(r.id, field.id, "view")}
                              className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium transition cursor-pointer ${
                                currentVal === "view"
                                  ? "bg-white text-blue-700 border border-slate-200/80 shadow-2xs font-semibold"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                              title="Field is visible as read-only"
                            >
                              View
                            </button>

                            {/* Edit */}
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => setFieldScopeRolePerm(r.id, field.id, "edit")}
                              className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium transition cursor-pointer ${
                                currentVal === "edit"
                                  ? "bg-blue-600 text-white shadow-2xs font-semibold"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                              title="Field can be edited by this role"
                            >
                              Edit
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
                <Plus className="h-3.5 w-3.5 text-blue-650" />
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
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Category Group</label>
                <input 
                  type="text"
                  value={newFieldCategory}
                  onChange={e => setNewFieldCategory(e.target.value)}
                  placeholder="e.g. Tax & Compliance, Logistics, Capex"
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Description & Purpose</label>
                <input 
                  type="text"
                  value={newFieldDesc}
                  onChange={e => setNewFieldDesc(e.target.value)}
                  placeholder="e.g. Mandatory withholding tax rate code"
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                />
              </div>

              <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddCustomFieldModal(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFieldName.trim()}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
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
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                />
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
                  disabled={!newRoleName.trim()}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Add Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD CUSTOM PERMISSION */}
      {/* ========================================================= */}
      {showAddPermissionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-blue-650" />
                <span>Add System Permission</span>
              </h3>
              <button onClick={() => setShowAddPermissionModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddPermission} className="space-y-2.5">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Permission Key / ID</label>
                <input 
                  type="text"
                  required
                  value={newPermId}
                  onChange={e => setNewPermId(e.target.value)}
                  placeholder="e.g. wf:escalate"
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                />
                <span className="text-[8px] text-slate-400 block mt-0.5">Format: component:action (lowercase, spaces become colons)</span>
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Display Label</label>
                <input 
                  type="text"
                  required
                  value={newPermLabel}
                  onChange={e => setNewPermLabel(e.target.value)}
                  placeholder="e.g. Fast-Track Escalation"
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Description & Scope</label>
                <textarea 
                  value={newPermDesc}
                  onChange={e => setNewPermDesc(e.target.value)}
                  placeholder="Describe what action this permission clears..."
                  rows={2}
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25 resize-none"
                />
              </div>

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Category Group</label>
                <select
                  value={newPermCategory}
                  onChange={e => setNewPermCategory(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                >
                  <option value="Documents & OCR Extraction">Documents & OCR Extraction</option>
                  <option value="Workflow & Approvals Routing">Workflow & Approvals Routing</option>
                  <option value="Financial System Audits & Tax">Financial System Audits & Tax</option>
                  <option value="IAM & System Governance">IAM & System Governance</option>
                  <option value="NEW_CATEGORY">Create New Category...</option>
                </select>
              </div>

              {newPermCategory === "NEW_CATEGORY" && (
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">New Category Title</label>
                  <input 
                    type="text"
                    required
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="e.g. System Configuration & Integrations"
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
              )}

              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Visual Icon</label>
                <select
                  value={newPermIcon}
                  onChange={e => setNewPermIcon(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                >
                  <option value="Shield">Shield (Security)</option>
                  <option value="Lock">Lock (Access Control)</option>
                  <option value="Eye">Eye (Audit/View)</option>
                  <option value="Users">Users (Team)</option>
                  <option value="DollarSign">Dollar Sign (Finance)</option>
                  <option value="FileText">File (Docs)</option>
                  <option value="Trash2">Trash (Delete)</option>
                  <option value="CheckSquare">Checkmark (Verify)</option>
                  <option value="Layers">Layers (Structure)</option>
                  <option value="Sliders">Sliders (Settings)</option>
                  <option value="AlertTriangle">Alert (Exceptions)</option>
                </select>
              </div>

              <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddPermissionModal(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPermId.trim() || !newPermLabel.trim()}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
                >
                  Create Permission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD NEW USER */}
      {/* ========================================================= */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-sm w-full p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-900 uppercase flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-blue-600" />
                <span>Add New Employee / User</span>
              </h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Emp ID (Required)</label>
                  <input 
                    type="text"
                    required
                    value={newUserEmpId}
                    onChange={e => setNewUserEmpId(e.target.value)}
                    placeholder="e.g. 16220"
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Full Name (Required)</label>
                  <input 
                    type="text"
                    required
                    value={newUserName}
                    onChange={e => setNewUserName(e.target.value)}
                    placeholder="e.g. Ram Kumar"
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Email (Required)</label>
                  <input 
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    placeholder="e.g. ram@company.com"
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Password (Required)</label>
                  <input 
                    type="password"
                    required
                    value={newUserPassword}
                    onChange={e => setNewUserPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Role Group</label>
                  <select
                    value={newUserRole}
                    onChange={e => setNewUserRole(e.target.value)}
                    className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  >
                    <option value="employee">General Employee</option>
                    <option value="ap_specialist">AP Specialist</option>
                    <option value="manager">Approver / Manager</option>
                    <option value="auditor">Internal Auditor</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Division</label>
                  <input 
                    type="text"
                    value={newUserDivision}
                    onChange={e => setNewUserDivision(e.target.value)}
                    placeholder="e.g. VCC"
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Department</label>
                  <input 
                    type="text"
                    value={newUserDept}
                    onChange={e => setNewUserDept(e.target.value)}
                    placeholder="e.g. Finance"
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Plant / Branch</label>
                  <input 
                    type="text"
                    value={newUserPlant}
                    onChange={e => setNewUserPlant(e.target.value)}
                    placeholder="e.g. TN-SIVAKASI"
                    className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-1.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {isCreatingUser && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>Create User</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
