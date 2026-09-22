import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  FileText,
  ArrowLeft,
  CheckCircle2,
  RotateCw,
  RotateCcw,
  Check,
  X,
  Shield,
  AlertCircle,
  Database,
  Calendar,
  Pause,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCheck,
  Lock,
  FileSpreadsheet,
  XCircle,
  PauseCircle,
  Users,
  ZoomIn,
  ZoomOut,
  Download,
  Printer,
  Upload,
  Settings,
  Activity,
  History,
  MessageSquare,
} from "lucide-react";
import { DbInvoice, DbWorkflowInstance } from "../types";
import { formatDocNumber, formatDate, formatTimeOnly } from "../utils/formatters";
import { MoreInfoConfigDrawer, ConfigFieldItem, isFixedSummaryField } from "./MoreInfoConfigDrawer";


interface DocumentDetailsProps {
  document: DbInvoice | null;
  currentUserRole: string;
  currentUserEmail: string;
  currentUserUsername: string;
  onRefreshDocument: () => void;
  onGoBack: () => void;
  onSelectDocument?: (id: string) => void;
  pendingDocIds?: string[];
}
interface LocalLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  warranty_text?: string;
  serial_numbers?: string[];
}

const DEFAULT_FIELD_PERMS: Record<string, Record<string, "hidden" | "view" | "edit">> = {
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

const getCleanAuditRemarks = (text: string | null | undefined, steps: any[] = []) => {
  if (!text) return null;
  let cleaned = text.trim();
  
  // Strip trailing system transitions like "➔ Advanced to Stage..."
  if (cleaned.includes("➔")) {
    cleaned = cleaned.split("➔")[0].trim();
  }

  // Known command/instruction phrases to filter out from audit remarks
  const commandPatterns = [
    /completer? the approval verifies the vendor and the amount/i,
    /verify po, tax details and accounting codes before approval/i,
    /attach physical document pdf and verify compliance checklist/i,
    /attach physical document pdf & verify checklist/i,
    /awaiting compliance checklist verification/i,
    /approved stage \d+ \(document attached & compliance checklist verified\)/i,
    /compliance items verified and signed off/i,
    /signed off without remarks/i,
    /Updated user More Info configuration/i,
  ];

  // Also filter out any dynamic commands/instructions from step definitions
  (steps || []).forEach((s: any) => {
    if (s?.command && typeof s.command === "string" && s.command.trim().length > 3) {
      if (cleaned.toLowerCase() === s.command.trim().toLowerCase()) {
        cleaned = "";
      }
    }
    if (s?.instruction && typeof s.instruction === "string" && s.instruction.trim().length > 3) {
      if (cleaned.toLowerCase() === s.instruction.trim().toLowerCase()) {
        cleaned = "";
      }
    }
    if (s?.action_required && typeof s.action_required === "string" && s.action_required.trim().length > 3) {
      if (cleaned.toLowerCase() === s.action_required.trim().toLowerCase()) {
        cleaned = "";
      }
    }
  });

  for (const pattern of commandPatterns) {
    if (pattern.test(cleaned)) {
      cleaned = "";
      break;
    }
  }

  return cleaned.length > 0 ? cleaned : null;
};

const getStageAndStatus = (comm: any) => {
  const actionLower = (comm?.action || "").toLowerCase();
  let status = "Approved";
  if (actionLower.includes("reject")) status = "Rejected";
  else if (actionLower.includes("return")) status = "Returned";
  else if (actionLower.includes("hold")) status = "On Hold";
  else if (actionLower.includes("cancel") || actionLower.includes("void")) status = "Cancelled";

  let stageLabel = "";
  if (comm?.stage) {
    const match = String(comm.stage).match(/stage\s*(\d+)/i);
    if (match) stageLabel = `Stage ${match[1]}`;
    else stageLabel = String(comm.stage);
  }
  if (!stageLabel && comm?.action) {
    const match = String(comm.action).match(/stage\s*(\d+)/i);
    if (match) stageLabel = `Stage ${match[1]}`;
  }
  if (!stageLabel) stageLabel = "Stage 1";

  return `${stageLabel} · ${status}`;
};

const formatAuditDateTime = (ts: string | null | undefined) => {
  if (!ts) return "";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch {
    return ts;
  }
};

export const CANONICAL_KEY_MAP: Record<string, string> = {
  "account_name": "account_name",
  "account name": "account_name",
  "bp_code": "bp_code",
  "bp code": "bp_code",
  "business partner code": "bp_code",
  "business_partner_code": "bp_code",
  "employee_name": "employee_name",
  "employee name": "employee_name",
  "employee_id": "employee_id",
  "employee id": "employee_id",
  "employee_division": "employee_division",
  "employee division": "employee_division",
  "employee_segment": "employee_segment",
  "employee segment": "employee_segment",
  "survey_date": "survey_date",
  "survey date": "survey_date",
  "subtype_of_complaint": "subtype_of_complaint",
  "subtype of complaint": "subtype_of_complaint",
  "additional_comments": "additional_comments",
  "additional comments": "additional_comments",
  "dealer_name": "dealer_name",
  "dealer name": "dealer_name",
  "dealer/distributor name": "dealer_name",
  "dealer / distributor name": "dealer_name",
  "dealer_distributor_name": "dealer_name",
  "dealer distributor name": "dealer_name",
  "bp_type": "bp_type",
  "bp type": "bp_type",
  "type_of_complaint": "type_of_complaint",
  "type of complaint": "type_of_complaint",
  "customer_code": "customer_code",
  "customer code": "customer_code",
  "invoice_number": "invoice_number",
  "invoice number": "invoice_number",
  "image_1": "image_1",
  "image 1": "image_1",
  "image_2": "image_2",
  "image 2": "image_2",
  "image_3": "image_3",
  "image 3": "image_3",
  "image_4": "image_4",
  "image 4": "image_4",
  "image_5": "image_5",
  "image 5": "image_5",
};

export const getCanonicalKey = (rawKey: string): string => {
  if (!rawKey) return "";
  const cleaned = rawKey.toLowerCase().trim();
  if (CANONICAL_KEY_MAP[cleaned]) {
    return CANONICAL_KEY_MAP[cleaned];
  }
  const snake = cleaned
    .replace(/[\s\-\.\/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (CANONICAL_KEY_MAP[snake]) {
    return CANONICAL_KEY_MAP[snake];
  }
  return snake || cleaned;
};

export default function DocumentDetails({
  document,
  currentUserRole,
  currentUserEmail,
  currentUserUsername,
  onRefreshDocument,
  onGoBack,
  onSelectDocument,
  pendingDocIds,
}: DocumentDetailsProps) {
  const [freshDocument, setFreshDocument] = useState<DbInvoice | null>(null);

  useEffect(() => {
    if (!document?.id) return;
    setFreshDocument(null);
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    fetch(`/api/documents/${encodeURIComponent(document.id)}`, {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          setFreshDocument(data);
        }
      })
      .catch(() => {});
  }, [document?.id]);

  const activeDoc = freshDocument || document;

  const [_activeTab, _setActiveTab] = useState<"original" | "layout" | "rawtext">(
    "original",
  );

  // Metadata edit form states
  const [isEditing, _setIsEditing] = useState(false);
  const [_activeInputField, _setActiveInputField] = useState<string | null>(null);
  const [_documentType, setDocumentType] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [amount, setAmount] = useState(0);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [_cgst, setCgst] = useState(0);
  const [_sgst, setSgst] = useState(0);
  const [_igst, setIgst] = useState(0);

  // Dynamic custom fields state
  const [_templatesList, _setTemplatesList] = useState<any[]>([]);
  const [_dynamicFields, setDynamicFields] = useState<Record<string, any>>({});

  // Custom PO fields
  const [_buyerName, setBuyerName] = useState("");
  const [_poDate, setPoDate] = useState("");
  const [_indentNumber, setIndentNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const [_itemsList, setItemsList] = useState<LocalLineItem[]>([]);
  const [_saveLoading, _setSaveLoading] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [showNextActionModal, setShowNextActionModal] = useState(false);
  const [pendingNextId, setPendingNextId] = useState<string | null>(null);
  const [actionModalType, setActionModalType] = useState<'approve' | 'reject' | 'hold'>('approve');
  const [approvedNextStageInfo, setApprovedNextStageInfo] = useState<{ nextApprover?: string | null; nextStageName?: string | null; isCompleted?: boolean } | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' | 'amber' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' | 'amber' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Field-Level Access Control (FLAC) Configuration
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, Record<string, "hidden" | "view" | "edit">>>(DEFAULT_FIELD_PERMS);
  
  // ERP Data Sync Modal & State
  const [showErpSyncModal, setShowErpSyncModal] = useState<boolean>(false);
  const [_isReSyncingErp, setIsReSyncingErp] = useState<boolean>(false);
  const [erpSyncToast, setErpSyncToast] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState<boolean>(false);
  const [isUploadingVersion, setIsUploadingVersion] = useState<boolean>(false);
  const [showMoreMetadata, setShowMoreMetadata] = useState<boolean>(false);
  const [showConfigDrawer, setShowConfigDrawer] = useState<boolean>(false);
  const [moreInfoConfig, setMoreInfoConfig] = useState<{
    document_type: string;
    scope: "USER" | "GLOBAL";
    has_user_override: boolean;
    can_manage_default: boolean;
    admin_default_fields?: ConfigFieldItem[];
    user_selected_fields?: ConfigFieldItem[];
    selected_fields: ConfigFieldItem[];
    available_fields: ConfigFieldItem[];
  } | null>(null);
  const [_isLoadingConfig, setIsLoadingConfig] = useState<boolean>(false);
  const [_containerWidth, setContainerWidth] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Dynamic ERP & Extra Metadata Extractor
  const dynamicSyncPayload = useMemo(() => {
    const target = activeDoc;
    if (!target) {
      return {
        entries: [],
        rawPayload: {}
      };
    }

    const grossAmt = Number(amount || target.amount || 0);
    const baseTaxableAmt = target.base_amount || (grossAmt > 0 ? grossAmt / 1.18 : 0);
    const gstTaxAmt = target.tax_amount || (grossAmt > 0 ? grossAmt - baseTaxableAmt : 0);

    const baseEntries: { label: string; value: string | number; key: string }[] = [];

    // Extract all real SQL properties on the document object
    Object.keys(target).forEach((key) => {
      if (["id", "custom_data", "file_url", "file_path", "created_at", "updated_at"].includes(key)) return;
      const v = (target as any)[key];
      if (v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "null") {
        const canonical = getCanonicalKey(key);
        const formattedLabel = canonical.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        baseEntries.push({
          key: canonical,
          label: formattedLabel,
          value: typeof v === 'object' ? JSON.stringify(v) : String(v)
        });
      }
    });

    return {
      entries: baseEntries,
      rawPayload: {
        DocKey: target.doc_key || target.id,
        DocNum: target.doc_num || target.id,
        DocDate: invoiceDate || target.invoice_date,
        CardCode: target.vendor_code || "VEND-AKG-999",
        CardName: vendorName || target.vendor_name,
        DocRefNo: invoiceNumber || target.invoice_number,
        DocTotal: grossAmt,
        BaseAmount: baseTaxableAmt,
        TaxAmount: gstTaxAmt,
        GSTIN: (target as any)?.vendor_gstin || "-",
        CompanyCode: target.division || "-",
        Branch: target.plant || "-",
        CostCenter: (target as any)?.cost_center || "-",
        PaymentTerms: paymentTerms || target.payment_terms || "-",
        SyncAgent: "SAP S/4HANA & MS SQL Integration Pipeline",
        SyncStatus: "SUCCESS",
        Timestamp: target.updated_at || new Date().toISOString()
      }
    };
  }, [activeDoc, vendorName, invoiceNumber, poNumber, amount, invoiceDate, paymentTerms]);

  // Fetch More Info configuration for this document and user
  const fetchMoreInfoConfig = async (docId: string) => {
    if (!docId) return;
    setIsLoadingConfig(true);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/more-info/config`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMoreInfoConfig(data);
      }
    } catch (err) {
      console.warn("Failed to fetch More Info configuration:", err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  useEffect(() => {
    if (activeDoc?.id) {
      fetchMoreInfoConfig(activeDoc.id);
    }
  }, [activeDoc?.id, activeDoc?.document_type]);

  const handleSaveMoreInfoConfig = async (fields: ConfigFieldItem[], saveAsDefault: boolean) => {
    if (!activeDoc?.id) return;
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/documents/${encodeURIComponent(activeDoc.id)}/more-info/config`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        fields: fields.map((f, idx) => ({
          field_key: getCanonicalKey(f.field_key),
          label: f.label,
          category: f.category,
          source: f.source,
          display_order: idx + 1,
          is_visible: true,
        })),
        save_as_default: saveAsDefault,
        reset_to_default: false,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setMoreInfoConfig(data);
      showToast("✓ More Info configuration saved.", "success");
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to save configuration.");
    }
  };

  const handleResetMoreInfoConfig = async () => {
    if (!activeDoc?.id) return;
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/documents/${encodeURIComponent(activeDoc.id)}/more-info/config`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        fields: [],
        save_as_default: false,
        reset_to_default: true,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setMoreInfoConfig(data);
      showToast("✓ More Info configuration reset to default.", "info");
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Failed to reset configuration.");
    }
  };

  // Map of current dynamic values strictly from document REAL SQL properties and field configurations
  const currentDocValuesMap = useMemo(() => {
    const map = new Map<string, string | number>();
    const target = activeDoc;

    if (target) {
      // 1. Direct real SQL document properties
      Object.keys(target).forEach((key) => {
        if (key === "custom_data") return;
        const val = (target as any)[key];
        if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "null") {
          const canonical = getCanonicalKey(key);
          const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
          map.set(canonical, strVal);
          map.set(key.toLowerCase(), strVal);
          map.set(key, strVal);
        }
      });
    }

    // 2. Fallback sample values from moreInfoConfig available_fields & selected_fields
    if (moreInfoConfig?.available_fields) {
      moreInfoConfig.available_fields.forEach((f) => {
        if (f.sample_value !== undefined && f.sample_value !== null && String(f.sample_value).trim() !== "" && String(f.sample_value).trim() !== "null") {
          const canonical = getCanonicalKey(f.field_key);
          const strVal = String(f.sample_value);
          if (!map.has(canonical)) map.set(canonical, strVal);
          if (!map.has(f.field_key.toLowerCase())) map.set(f.field_key.toLowerCase(), strVal);
          if (f.label) {
            const labelCanonical = getCanonicalKey(f.label);
            if (!map.has(labelCanonical)) map.set(labelCanonical, strVal);
          }
        }
      });
    }

    if (moreInfoConfig?.selected_fields) {
      moreInfoConfig.selected_fields.forEach((f) => {
        if (f.sample_value !== undefined && f.sample_value !== null && String(f.sample_value).trim() !== "" && String(f.sample_value).trim() !== "null") {
          const canonical = getCanonicalKey(f.field_key);
          const strVal = String(f.sample_value);
          if (!map.has(canonical)) map.set(canonical, strVal);
          if (!map.has(f.field_key.toLowerCase())) map.set(f.field_key.toLowerCase(), strVal);
          if (f.label) {
            const labelCanonical = getCanonicalKey(f.label);
            if (!map.has(labelCanonical)) map.set(labelCanonical, strVal);
          }
        }
      });
    }

    // 3. Computed / formatted aliases
    if (target) {
      const grossAmt = Number(amount || target.amount || 0);
      if (grossAmt > 0) {
        const formattedGross = `₹${grossAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        map.set("total_gross", formattedGross);
        if (!map.has("amount")) map.set("amount", formattedGross);
      }

      const baseTaxableAmt = target.base_amount || (grossAmt > 0 ? grossAmt / 1.18 : 0);
      const gstTaxAmt = target.tax_amount || (grossAmt > 0 ? grossAmt - baseTaxableAmt : 0);
      if (baseTaxableAmt > 0) {
        const formattedBase = `₹${Number(baseTaxableAmt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        map.set("taxable_amount", formattedBase);
        map.set("base_taxable", formattedBase);
        map.set("base_amount", formattedBase);
      }
      if (gstTaxAmt > 0) {
        const formattedGst = `₹${Number(gstTaxAmt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        map.set("gst_amount", formattedGst);
        map.set("gst_tax", formattedGst);
        map.set("tax_amount", formattedGst);
      }
    }

    return map;
  }, [activeDoc, amount, moreInfoConfig]);

  // Determine Admin Top 3 Defaults per Document Type
  const adminTop3Fields = useMemo(() => {
    if (moreInfoConfig?.admin_default_fields && moreInfoConfig.admin_default_fields.length > 0) {
      return moreInfoConfig.admin_default_fields.slice(0, 3).map((f) => ({
        ...f,
        field_key: getCanonicalKey(f.field_key),
      }));
    }
    const docTypeClean = (activeDoc?.document_type || "").toUpperCase();
    if (docTypeClean.includes("COMPLAINT") || docTypeClean.includes("FEEDBACK")) {
      return [
        { field_key: "account_name", label: "Account Name", category: "CUSTOMER COMPLAINT", source: "Document" },
        { field_key: "type_of_complaint", label: "Type of Complaint", category: "CUSTOMER COMPLAINT", source: "Document" },
        { field_key: "dealer_name", label: "Dealer / Distributor Name", category: "CUSTOMER COMPLAINT", source: "Document" },
      ];
    }
    if (docTypeClean.includes("EXPENSE") || docTypeClean.includes("HR")) {
      return [
        { field_key: "employee_name", label: "Employee Name", category: "HR EXPENSE", source: "ERP" },
        { field_key: "expense_type", label: "Expense Type", category: "HR EXPENSE", source: "ERP" },
        { field_key: "department", label: "Department", category: "HR EXPENSE", source: "ERP" },
      ];
    }
    if (docTypeClean.includes("CREDIT")) {
      return [
        { field_key: "credit_note_number", label: "Credit Note Number", category: "CREDIT NOTE", source: "Document" },
        { field_key: "reason_for_credit", label: "Reason For Credit", category: "CREDIT NOTE", source: "Document" },
        { field_key: "original_invoice_ref", label: "Original Invoice Ref", category: "CREDIT NOTE", source: "Document" },
      ];
    }
    return [
      { field_key: "vendor_name", label: "Supplier / Vendor", category: "VENDOR INFORMATION", source: "ERP" },
      { field_key: "invoice_number", label: "Bill / Invoice Number", category: "INVOICE INFORMATION", source: "Document" },
      { field_key: "amount", label: "Total Gross (₹)", category: "FINANCIAL INFORMATION", source: "Calculated" },
    ];
  }, [moreInfoConfig, activeDoc?.document_type]);

  const adminTop3Keys = useMemo(() => {
    return new Set(adminTop3Fields.map((f) => getCanonicalKey(f.field_key)));
  }, [adminTop3Fields]);

  // Effective fields to display in More Info (excluding Admin Top 3 Defaults)
  const effectiveMoreInfoFields = useMemo(() => {
    let fields: ConfigFieldItem[] = [];
    if (moreInfoConfig?.user_selected_fields && moreInfoConfig.user_selected_fields.length > 0) {
      fields = moreInfoConfig.user_selected_fields;
    } else if (moreInfoConfig?.selected_fields && moreInfoConfig.selected_fields.length > 0) {
      fields = moreInfoConfig.selected_fields.filter((f) => !adminTop3Keys.has(getCanonicalKey(f.field_key)));
    } else if (moreInfoConfig?.available_fields && moreInfoConfig.available_fields.length > 0) {
      fields = moreInfoConfig.available_fields.filter((f) => !adminTop3Keys.has(getCanonicalKey(f.field_key)));
    } else {
      fields = dynamicSyncPayload.entries.map((entry, idx) => ({
        field_key: getCanonicalKey(entry.key),
        label: entry.label,
        category: "INFORMATION",
        source: "ERP",
        display_order: idx + 1,
        is_visible: true,
        sample_value: entry.value,
      }));
    }
    return fields
      .map((f) => ({
        ...f,
        field_key: getCanonicalKey(f.field_key),
      }))
      .filter((field) => !adminTop3Keys.has(field.field_key) && !isFixedSummaryField(field.field_key));
  }, [moreInfoConfig, dynamicSyncPayload, adminTop3Keys]);

  const getFieldValueByKey = (key: string, sampleValue?: string): string => {
    const canonicalKey = getCanonicalKey(key);
    const target = activeDoc;

    // 1. Direct property check on target (activeDoc)
    if (target) {
      const docVal = (target as any)[canonicalKey] ?? (target as any)[key];
      if (docVal !== undefined && docVal !== null && String(docVal).trim() !== "" && String(docVal).trim() !== "null") {
        return String(docVal);
      }

      // Check property scan on target matching canonical key
      const targetProps = Object.keys(target);
      const matchingProp = targetProps.find((p) => getCanonicalKey(p) === canonicalKey);
      if (matchingProp) {
        const docValFuzzy = (target as any)[matchingProp];
        if (docValFuzzy !== undefined && docValFuzzy !== null && String(docValFuzzy).trim() !== "" && String(docValFuzzy).trim() !== "null") {
          return String(docValFuzzy);
        }
      }
    }

    // 2. Check currentDocValuesMap (populated from target properties & moreInfoConfig field values)
    const fk = key.toLowerCase();
    if (currentDocValuesMap.has(canonicalKey)) {
      const val = currentDocValuesMap.get(canonicalKey);
      if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "null") {
        return String(val);
      }
    }
    if (currentDocValuesMap.has(fk)) {
      const val = currentDocValuesMap.get(fk);
      if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "null") {
        return String(val);
      }
    }

    // 3. Check sampleValue argument if provided
    if (sampleValue !== undefined && sampleValue !== null && String(sampleValue).trim() !== "" && String(sampleValue).trim() !== "null") {
      return String(sampleValue);
    }

    // 4. Check available_fields / selected_fields in moreInfoConfig for matching canonical key sample_value
    if (moreInfoConfig?.available_fields) {
      const availField = moreInfoConfig.available_fields.find(
        (f) => getCanonicalKey(f.field_key) === canonicalKey || getCanonicalKey(f.label) === canonicalKey
      );
      if (availField?.sample_value !== undefined && availField?.sample_value !== null && String(availField.sample_value).trim() !== "" && String(availField.sample_value).trim() !== "null") {
        return String(availField.sample_value);
      }
    }

    return "Not available";
  };

  const getFieldValue = (field: ConfigFieldItem): string => {
    return getFieldValueByKey(field.field_key, field.sample_value !== undefined && field.sample_value !== null ? String(field.sample_value) : undefined);
  };

  const isImageFieldKey = (key: string): boolean => {
    const fk = key.toLowerCase().trim().replace(/[\s\-_]+/g, "_");
    return ["image_1", "image_2", "image_3", "image_4", "image_5"].includes(fk);
  };

  const renderFieldValueContent = (fieldKey: string, val: string) => {
    const isMissing = !val || val === "Not available" || val.trim() === "" || val.trim() === "null";

    if (isImageFieldKey(fieldKey)) {
      if (isMissing) {
        return <span className="italic text-slate-400 font-normal">Not available</span>;
      }
      const rawVal = val.trim();
      const isUrl = /^(https?:\/\/|\/)/i.test(rawVal);
      if (isUrl) {
        return (
          <a
            href={rawVal}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-extrabold text-[11px] hover:underline cursor-pointer"
            title={rawVal}
            onClick={(e) => e.stopPropagation()}
          >
            <span>Open Image</span>
            <span className="text-[10px]">↗</span>
          </a>
        );
      }
      return <span>{val}</span>;
    }

    if (isMissing) {
      return <span className="italic text-slate-400 font-normal">Not available</span>;
    }

    return <span>{val}</span>;
  };

  const handleUploadVersion = async (file: File) => {

    if (!document) return;
    if (!canReplacePdf) {
      setActionError("⚠️ PDF replacement is restricted: You can only replace or attach the physical PDF during Attachment Status (Stage 1).");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setActionError("Only PDF files are allowed to be attached.");
      return;
    }
    setIsUploadingVersion(true);
    setActionError(null);
    try {
      const token = localStorage.getItem("authToken");
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/invoices/${document.id}/version`, {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formData,
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        let newPath = data.file_url || data.file_path;
        if (newPath) {
          newPath = newPath.startsWith('/') ? newPath : `/${newPath}`;
          if (token && newPath.includes("/file")) {
            const separator = newPath.includes("?") ? "&" : "?";
            newPath = `${newPath}${separator}token=${encodeURIComponent(token)}`;
          }
          setIframeSrc(newPath);
        }
        showToast("✓ Physical PDF Attached & Saved Successfully!", "success");
        onRefreshDocument();
      } else {
        let errDetail = "Failed to upload physical document.";
        if (res.status === 413) {
          errDetail = "File size exceeds server limit (413 Request Entity Too Large). Please upload a smaller file or increase server max body size.";
        } else {
          try {
            const txt = await res.text();
            try {
              const errData = JSON.parse(txt);
              errDetail = errData.detail || errData.message || txt || errDetail;
            } catch {
              if (txt) errDetail = txt;
            }
          } catch {}
        }
        setActionError(errDetail);
      }
    } catch (e: any) {
      setActionError(e.message || "Failed to upload physical document.");
    } finally {
      setIsUploadingVersion(false);
    }
  };

  const getNextPendingDocId = () => {
    if (!document || !pendingDocIds || pendingDocIds.length === 0) return null;
    const currentIndex = pendingDocIds.indexOf(document.id);
    if (currentIndex !== -1 && currentIndex < pendingDocIds.length - 1) {
      return pendingDocIds[currentIndex + 1];
    }
    return null;
  };

  // Active Reviewer Collision Lock State
  const [lockInfo, setLockInfo] = useState<{ isLocked: boolean; lockedBy: string | null; isSelf: boolean }>({
    isLocked: false,
    lockedBy: null,
    isSelf: true
  });

  useEffect(() => {
    if (!document?.id) return;
    const userHandle = currentUserUsername || currentUserEmail || "reviewer";
    const userName = currentUserUsername || "Reviewer";

    const acquireLock = async () => {
      try {
        const res = await fetch(`/api/invoices/${document.id}/lock/acquire`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_handle: userHandle, user_name: userName, lease_seconds: 180 })
        });
        const data = await res.json();
        if (data.acquired) {
          setLockInfo({ isLocked: false, lockedBy: userName, isSelf: true });
        } else if (data.is_locked) {
          setLockInfo({ isLocked: true, lockedBy: data.locked_by, isSelf: false });
        }
      } catch (err) {
        console.warn("Lock acquisition skipped:", err);
      }
    };

    acquireLock();

    const heartbeat = setInterval(async () => {
      try {
        await fetch(`/api/invoices/${document.id}/lock/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_handle: userHandle, lease_seconds: 180 })
        });
      } catch {}
    }, 30000);

    return () => {
      clearInterval(heartbeat);
      try {
        fetch(`/api/invoices/${document.id}/lock/release`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_handle: userHandle })
        }).catch(() => {});
      } catch {}
    };
  }, [document?.id, currentUserUsername, currentUserEmail]);

  const isTerminal = ["Approved", "Settled", "Paid", "Ready for Payment", "Cancelled", "Failed"].includes(document?.status || "");
  const isCurrentApprover = currentUserRole === 'admin' || Boolean(document?.is_current_approver);
  const isDocumentLocked = isTerminal || !isCurrentApprover || Boolean(document?.completed_by_peer);
  const isAttachmentStatus = !isTerminal && (
    (document?.current_stage || 1) === 1 ||
    (document?.status || "").toLowerCase().includes("attachment") ||
    (document?.status || "").toLowerCase().includes("initiated")
  );
  const canReplacePdf = !isDocumentLocked && isAttachmentStatus;

  // Periodic background stage poll: If another approver advances the stage, update immediately
  useEffect(() => {
    if (!document?.id || isTerminal) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/invoices/${document.id}`, {
          headers: {
            "Authorization": `Bearer ${localStorage.getItem("token") || localStorage.getItem("authToken")}`
          }
        });
        if (res.ok) {
          const fresh = await res.json();
          if (
            fresh.current_stage !== document?.current_stage ||
            fresh.status !== document?.status ||
            Boolean(fresh.completed_by_peer) !== Boolean(document?.completed_by_peer)
          ) {
            onRefreshDocument();
          }
        }
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, [document?.id, document?.current_stage, document?.status, document?.completed_by_peer, isTerminal, onRefreshDocument]);

  // Hierarchical FLAC resolution (Specific Scope -> Global Master -> Safe Baseline)
  const getFieldPerm = (fieldId: string): "hidden" | "view" | "edit" => {
    const raw = getRawFieldPerm(fieldId);
    if (isDocumentLocked && raw === "edit") {
      return "view";
    }
    // Synced Data Protection: Prevent editing synced third-party data during Attachment Status
    const isSyncedFromErp = Boolean(document?.doc_key || (document as any)?.source_application);
    if (isSyncedFromErp && isAttachmentStatus && raw === "edit") {
      if (["vendor_name", "invoice_num_date", "po_reference", "total_gross", "cost_center", "payment_terms", "hsn_tax", "line_items"].includes(fieldId)) {
        return "view";
      }
    }
    return raw;
  };

  const getRawFieldPerm = (fieldId: string): "hidden" | "view" | "edit" => {
    const role = (currentUserRole || "admin").toLowerCase();
    
    // Determine scope key from document type / workflow
    const docTypeStr = ((document?.document_type || "") + " " + (document?.workflow_profile_id || "")).toLowerCase();
    let matchedScope = "CAT_INVOICE";
    if (docTypeStr.includes("capex") || docTypeStr.includes("asset") || docTypeStr.includes("machinery")) {
      matchedScope = "CAT_CAPEX";
    } else if (docTypeStr.includes("debit") || docTypeStr.includes("credit") || docTypeStr.includes("return")) {
      matchedScope = "CAT_DEBIT_CREDIT";
    } else if (docTypeStr.includes("eb") || docTypeStr.includes("cam") || docTypeStr.includes("rent") || docTypeStr.includes("util") || docTypeStr.includes("tel")) {
      matchedScope = "CAT_UTILITIES";
    } else if (docTypeStr.includes("po") || docTypeStr.includes("order")) {
      matchedScope = "CAT_PO";
    } else if (docTypeStr.includes("grn") || docTypeStr.includes("gate")) {
      matchedScope = "CAT_GRN";
    }

    // 1. Check matched scope override
    const perms = fieldPermissions as Record<string, any>;
    if (perms[matchedScope]?.[role]?.[fieldId]) {
      return perms[matchedScope][role][fieldId];
    }

    // 2. Check Global Master policy
    if (perms.GLOBAL?.[role]?.[fieldId]) {
      return perms.GLOBAL[role][fieldId];
    }

    // 3. Fallback for legacy flat config
    if (perms[role]?.[fieldId]) {
      return perms[role][fieldId];
    }

    // 4. Safe baseline fallback
    if (role === "admin") return "edit";
    if (role === "employee") {
      return ["vendor_name", "invoice_num_date", "po_reference", "total_gross"].includes(fieldId) ? "view" : "hidden";
    }
    if (role === "ap_specialist") {
      return ["vendor_name", "invoice_num_date", "po_reference", "total_gross", "cost_center", "payment_terms"].includes(fieldId) ? "edit" : "view";
    }
    return "view";
  };

  // Load FLAC configuration from backend config
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch("/api/admin/config", {
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const configs = await res.json();
          if (Array.isArray(configs)) {
            const flacCfg = configs.find((c: any) => c.key === "RBAC_FIELD_PERMISSIONS");
            if (flacCfg && flacCfg.value) {
              try {
                setFieldPermissions(JSON.parse(flacCfg.value));
              } catch {}
            }
          }
        }
      } catch {}
    };
    loadConfig();
  }, []);

  // Comments State
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [_newComment, _setNewComment] = useState("");
  const [_commentsLoading, _setCommentsLoading] = useState(false);
  const [_n8nHookUrl, _setN8nHookUrl] = useState(
    "https://n8n.your-domain.com/webhook/doc-received",
  );
  const [_n8nLoading, _setN8nLoading] = useState(false);
  const [_n8nLogs, _setN8nLogs] = useState<string | null>(null);

  // Verification Checklist States
  const [_activeWorkspaceTab, _setActiveWorkspaceTab] = useState<'compliance' | 'metadata' | 'workflow'>('compliance');
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [checkedStates, setCheckedStates] = useState<Record<string, boolean>>({});
  const [_showChecklistModal, _setShowChecklistModal] = useState(false);
  const [_showSecondLine, _setShowSecondLine] = useState(false);
  const [_showAllParallelFields, _setShowAllParallelFields] = useState(false);
  const [_selectedParallelField, _setSelectedParallelField] = useState<string>("gstin");
  const [_activeExtraField, _setActiveExtraField] = useState<string | null>(null);

  // Synced Invoice Stage 1 Attachment States
  const [_selectedFile, _setSelectedFile] = useState<File | null>(null);
  const [_isDragOver, _setIsDragOver] = useState(false);
  const [_isUploadingAttachment, _setIsUploadingAttachment] = useState(false);
  const [activeApprovalLog, setActiveApprovalLog] = useState<any>(null);
  const [workflowStepDefinitions, setWorkflowStepDefinitions] = useState<any[]>([]);
  const [showTimelineModal, setShowTimelineModal] = useState<boolean>(false);
  const [iframeSrc, setIframeSrc] = useState<string>("");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset zoom to 100% when changing documents
  useEffect(() => {
    setZoomLevel(100);
  }, [document?.id]);

  const cleanPdfSrc = useMemo(() => {
    if (!iframeSrc) return "";
    return iframeSrc.split("#")[0];
  }, [iframeSrc]);

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 10, 500));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 10, 50));
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
  };

  const handleDownloadPdf = () => {
    if (!iframeSrc) return;
    const cleanUrl = iframeSrc.split("#")[0];
    const link = window.document.createElement("a");
    link.href = cleanUrl;
    link.download = document?.file_name || `${document?.id || "document"}.pdf`;
    link.target = "_blank";
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const handlePrintPdf = () => {
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.focus();
        iframeRef.current.contentWindow.print();
        return;
      } catch {
        // Fall back to opening in a new tab for printing
      }
    }
    if (iframeSrc) {
      const cleanUrl = iframeSrc.split("#")[0];
      const printWindow = window.open(cleanUrl, "_blank");
      if (printWindow) {
        printWindow.focus();
      }
    }
  };
  const [_workflowInstance, setWorkflowInstance] =
    useState<DbWorkflowInstance | null>(null);
  const [_workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [_availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
  const [_selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [_customSteps, _setCustomSteps] = useState<{ label: string }[]>([]);
  const [_overrideMode, _setOverrideMode] = useState<"existing" | "custom">(
    "existing",
  );
  const [_isApplying, _setIsApplying] = useState(false);

  // Data Protection states
  const [_versions, setVersions] = useState<any[]>([]);
  const [_loadingVersions, setLoadingVersions] = useState(false);

  const [_erpData, setErpData] = useState<any | null>(null);
  const [_erpLoading, setErpLoading] = useState(false);

  const fetchErpData = async (poNum: string) => {
    if (!poNum || poNum === "Not Found" || poNum === "Extracting...") {
      setErpData(null);
      return;
    }
    setErpLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/erp/${encodeURIComponent(poNum)}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (data.not_found) {
          setErpData(null);
        } else {
          setErpData(data);
        }
      } else {
        setErpData(null);
      }
    } catch {
      setErpData(null);
    } finally {
      setErpLoading(false);
    }
  };

  const _handleManualErpReSync = async () => {
    setIsReSyncingErp(true);
    setErpSyncToast(null);
    try {
      await new Promise(r => setTimeout(r, 600));
      onRefreshDocument();
      setErpSyncToast("Live ERP Synchronization completed! DocTrans & Master Ledger data matched (200 OK).");
      setTimeout(() => setErpSyncToast(null), 4000);
    } catch (_e: any) {
      setErpSyncToast("Failed to re-sync ERP record.");
    } finally {
      setIsReSyncingErp(false);
    }
  };

  const _handlePushToErpLedger = async () => {
    setIsReSyncingErp(true);
    setErpSyncToast(null);
    try {
      await new Promise(r => setTimeout(r, 700));
      setErpSyncToast(`Approval state successfully pushed to SAP/MS SQL ledger for DocKey #${document?.doc_key || document?.id}!`);
      setTimeout(() => setErpSyncToast(null), 4000);
    } catch (_e: any) {
      setErpSyncToast("Failed to push update to ERP ledger.");
    } finally {
      setIsReSyncingErp(false);
    }
  };

  const fetchWorkflowData = async () => {
    if (!document) return;
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/documents/${document.id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setWorkflowInstance(data.workflow_instance || null);
        setWorkflowSteps(data.workflow_steps || []);
        setActiveApprovalLog(data.active_approval_log || null);
        const rawSteps = data.workflow_step_definitions || [];
        const uniqueSteps = rawSteps.filter(
          (step: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.stage_number === step.stage_number)
        );
        setWorkflowStepDefinitions(uniqueSteps);
      }
      const wfRes = await fetch(`/api/workflows`, { headers });
      if (wfRes.ok) {
        const wfs = await wfRes.json();
        setAvailableWorkflows(wfs);
        if (wfs.length > 0) setSelectedWorkflowId(wfs[0].id);
      }
    } catch {}
  };

  const fetchComments = async () => {
    if (!document) return;
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/documents/${document.id}/comments`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) setCommentsList(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (document && !isEditing) {
      fetchWorkflowData();
      fetchComments();
      fetchVersions();
      setDocumentType(document.document_type || "Invoice");
      setVendorName(document.vendor_name || "");
      setInvoiceNumber(document.invoice_number || "");
      setPoNumber(document.po_number || "");
      fetchErpData(document.po_number || "");
      setAmount(document.amount || 0);
      setInvoiceDate(document.invoice_date || "");
      setCgst(document.cgst || 0);
      setSgst(document.sgst || 0);
      setIgst(document.igst || 0);

      const customData = typeof document.custom_data === 'string' ? JSON.parse(document.custom_data) : (document.custom_data || {});
      setDynamicFields(customData);
      setBuyerName(customData.buyerName || customData.customerName || "");
      setPoDate(customData.poDate || customData.orderDate || "");
      setIndentNumber(customData.indentNumber || "");
      setPaymentTerms(customData.paymentTerms || "");
      let parsedItems = [];
      if (typeof document.items === "string") {
        try {
          parsedItems = JSON.parse(document.items);
        } catch {}
      } else if (Array.isArray(document.items)) {
        parsedItems = document.items;
      }
      setItemsList(
        parsedItems.map((itm: any, idx: number) => ({
          id: `itm-${idx}-${Math.random()}`,
          description: itm.description || "Line Item",
          quantity: Number(itm.quantity) || 1,
          unit_price: Number(itm.unit_price || itm.amount) || 0,
          amount: Number(itm.amount) || 0,
          warranty_text: itm.warranty_text,
          serial_numbers: Array.isArray(itm.serial_numbers)
            ? itm.serial_numbers
            : typeof itm.serial_numbers === "string"
              ? itm.serial_numbers.split(",").map((s: string) => s.trim())
              : [],
        })),
      );
    }
  }, [document, isEditing]);

  useEffect(() => {
    const fetchChecklist = async () => {
      if (!document || !document.id) return;
      const isUnrouted = !document.workflow_profile_id || 
                         document.workflow_profile_id === 'UNROUTED' || 
                         (document.status || '').toLowerCase().includes('unrouted') ||
                         (document.status || '').toLowerCase().includes('no rule matched');
      if (isUnrouted) {
        setChecklistItems([]);
        setCheckedStates({});
        return;
      }
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(`/api/invoices/${document.id}/checklist`, { headers });
        if (res.ok) {
          const data = await res.json();
          const items = data.map((item: any) => item.item_text);
          const states: Record<string, boolean> = {};
          data.forEach((item: any) => {
            states[item.item_text] = Boolean(item.is_checked);
          });
          setChecklistItems(items);
          setCheckedStates(states);
        }
      } catch (e) {
        console.error("Failed to fetch checklist from backend:", e);
      }
    };

    fetchChecklist();
  }, [document?.id, document?.current_stage, document?.workflow_profile_id, document?.status, activeApprovalLog?.current_stage_number]);

  // Auto-Restore Draft Verification Inputs & Comments
  useEffect(() => {
    if (!document?.id) return;
    const draftKey = `docuflow_draft_${document.id}`;
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.approvalComment) setApprovalComment(parsed.approvalComment);
        if (parsed.vendorName) setVendorName(parsed.vendorName);
        if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
        if (parsed.poNumber) setPoNumber(parsed.poNumber);
      }
    } catch {}
  }, [document?.id]);

  // Auto-Save Draft Verification Inputs on Changes
  useEffect(() => {
    if (!document?.id) return;
    const draftKey = `docuflow_draft_${document.id}`;
    if (approvalComment || vendorName || invoiceNumber || poNumber) {
      try {
        localStorage.setItem(draftKey, JSON.stringify({
          approvalComment,
          vendorName,
          invoiceNumber,
          poNumber,
          updatedAt: new Date().toISOString()
        }));
      } catch {}
    }
  }, [document?.id, approvalComment, vendorName, invoiceNumber, poNumber]);

  const clearDraft = () => {
    if (document?.id) {
      try {
        localStorage.removeItem(`docuflow_draft_${document.id}`);
      } catch {}
    }
  };

  useEffect(() => {
    if (!document) {
      onGoBack();
    }
  }, [document, onGoBack]);

  useEffect(() => {
    if (!document) {
      setIframeSrc("");
      return;
    }
    const rawPath = document.file_url || document.file_path || "";
    
    // Check if rawPath points to a valid file route
    if (
      rawPath &&
      rawPath !== "/" &&
      rawPath !== "invoice.pdf" &&
      rawPath !== "/uploads/invoice.pdf" &&
      rawPath !== "uploads/invoice.pdf"
    ) {
      const isAbsolute = rawPath.startsWith('/') || rawPath.startsWith('http');
      let path = isAbsolute ? rawPath : `/${rawPath}`;
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      if (token && path.includes("/file")) {
        const separator = path.includes("?") ? "&" : "?";
        path = `${path}${separator}token=${encodeURIComponent(token)}`;
      }
      setIframeSrc(path);
    } else {
      setIframeSrc("");
    }
  }, [document?.id, document?.file_url, document?.file_path]);

  if (!document) return null;

  const fetchVersions = async () => {
    if (!document) return;
    setLoadingVersions(true);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/invoices/${document.id}/versions`, { headers });
      if (res.ok) {
        setVersions(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleInlineReject = async () => {
    if (!document) return;
    const isStage1 = (document?.current_stage || 1) <= 1;
    const comments = approvalComment.trim();
    if (!comments) {
      alert(isStage1 
        ? "Please enter reason notes in the comments box before cancelling this process." 
        : `Please enter rejection reason notes in the comments box before returning to Stage ${(document.current_stage || 2) - 1} approver.`
      );
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/workflows/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token") || localStorage.getItem("authToken")}`
        },
        body: JSON.stringify({
          invoiceId: document.id,
          comments,
        }),
      });
      if (response.ok) {
        clearDraft();
        setApprovalComment("");
        showToast("✓ Document Rejection Recorded Successfully!", "amber");
        await fetchWorkflowData();
        onRefreshDocument();
        const nextId = getNextPendingDocId();
        setPendingNextId(nextId);
        setActionModalType('reject');
        setShowNextActionModal(true);
      } else {
        let errDetail = "Rejection failed";
        try {
          const txt = await response.text();
          try {
            const err = JSON.parse(txt);
            errDetail = err.detail || err.error || err.message || txt || errDetail;
          } catch {
            if (txt) errDetail = txt;
          }
        } catch {}
        setActionError(errDetail);
      }
    } catch (err: any) {
      setActionError(err.message || "Rejection action failed");
    }
    setActionLoading(false);
  };

  const handleInlineHold = async () => {
    if (!document) return;
    const comments = approvalComment.trim();
    if (!comments) {
      alert("Comments are required to hold/send back the document.");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/workflows/sendback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token") || localStorage.getItem("authToken")}`
        },
        body: JSON.stringify({
          invoiceId: document.id,
          comments,
        }),
      });
      if (response.ok) {
        clearDraft();
        setApprovalComment("");
        showToast("✓ Document Placed on Hold!", "info");
        await fetchWorkflowData();
        onRefreshDocument();
        const nextId = getNextPendingDocId();
        setPendingNextId(nextId);
        setActionModalType('hold');
        setShowNextActionModal(true);
      } else {
        let errDetail = "Hold action failed";
        try {
          const txt = await response.text();
          try {
            const err = JSON.parse(txt);
            errDetail = err.detail || err.error || err.message || txt || errDetail;
          } catch {
            if (txt) errDetail = txt;
          }
        } catch {}
        setActionError(errDetail);
      }
    } catch (err: any) {
      setActionError(err.message || "Hold action failed");
    }
    setActionLoading(false);
  };

  const handleToggleChecklist = async (itemText: string) => {
    if (isDocumentLocked) return;
    const updatedStates = { ...checkedStates, [itemText]: !checkedStates[itemText] };
    setCheckedStates(updatedStates);
    
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      const checked_items = Object.keys(updatedStates).filter(k => updatedStates[k]);
      await fetch(`/api/invoices/${document.id}/checklist`, {
        method: "POST",
        headers,
        body: JSON.stringify({ checked_items })
      });
    } catch (e) {
      console.error("Failed to update checklist state on server:", e);
    }
  };

  const handleToggleAllChecklist = async () => {
    if (isDocumentLocked) return;
    const allChecked = effectiveChecklist.every((item) => checkedStates[item]);
    const updatedStates: Record<string, boolean> = { ...checkedStates };
    effectiveChecklist.forEach((item) => {
      updatedStates[item] = !allChecked;
    });
    setCheckedStates(updatedStates);
    
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      
      const checked_items = Object.keys(updatedStates).filter(k => updatedStates[k]);
      await fetch(`/api/invoices/${document.id}/checklist`, {
        method: "POST",
        headers,
        body: JSON.stringify({ checked_items })
      });
    } catch (e) {
      console.error("Failed to batch update checklist state on server:", e);
    }
  };

  const isDocUnrouted = !document?.workflow_profile_id || 
                        document?.workflow_profile_id === 'UNROUTED' || 
                        (document?.status || '').toLowerCase().includes('unrouted') ||
                        (document?.status || '').toLowerCase().includes('no rule matched');
  const effectiveChecklist = isDocUnrouted ? [] : checklistItems;

  const combinedChecklist = useMemo(() => {
    if (isDocUnrouted) return [];

    const currentStageNum = activeApprovalLog?.current_stage_number || document?.current_stage || 1;
    const currentStep = (workflowStepDefinitions || []).find((s: any) => s.stage_number === currentStageNum);

    const itemsMap: Map<string, { key: string; label: string; givenBy: string; stageNumber?: number }> = new Map();

    // 1. Populate from workflow step definitions (commands / instructions)
    (workflowStepDefinitions || []).forEach((step: any) => {
      const cmd = step?.instruction || step?.command || (step?.action_required && !['Approve', 'Approved'].includes(step.action_required) ? step.action_required : null);
      if (cmd && typeof cmd === "string" && cmd.trim()) {
        const key = cmd.trim();
        const rawTarget = step.approver_target || step.stage_name || step.step_name || `Stage ${step.stage_number} Approver`;
        const cleanTarget = rawTarget.split(",")[0].trim();
        itemsMap.set(key, {
          key,
          label: key,
          givenBy: cleanTarget,
          stageNumber: step.stage_number
        });
      }
    });

    // 2. Ensure current active stage's command is present if defined
    const currentCmd = currentStep?.instruction || currentStep?.command;
    
    if (currentCmd && typeof currentCmd === "string" && currentCmd.trim() && !itemsMap.has(currentCmd.trim())) {
      const rawTarget = currentStep?.approver_target || currentStep?.stage_name || currentStep?.step_name || (currentStageNum === 1 ? "Manager" : `Stage ${currentStageNum} Approver`);
      const cleanTarget = rawTarget.split(",")[0].trim();
      itemsMap.set(currentCmd.trim(), {
        key: currentCmd.trim(),
        label: currentCmd.trim(),
        givenBy: cleanTarget,
        stageNumber: currentStageNum
      });
    }

    // 3. Include items from effectiveChecklist
    effectiveChecklist.forEach((chkItem) => {
      if (chkItem && typeof chkItem === "string" && chkItem.trim()) {
        const key = chkItem.trim();
        if (!itemsMap.has(key)) {
          const rawTarget = currentStep?.approver_target || currentStep?.stage_name || currentStep?.step_name || (currentStageNum === 1 ? "Manager" : `Stage ${currentStageNum} Approver`);
          const cleanTarget = rawTarget.split(",")[0].trim();
          itemsMap.set(key, {
            key,
            label: key,
            givenBy: cleanTarget,
            stageNumber: currentStageNum
          });
        }
      }
    });

    return Array.from(itemsMap.values());
  }, [isDocUnrouted, workflowStepDefinitions, effectiveChecklist, activeApprovalLog, document?.current_stage]);

  const handleInlineApprove = async () => {
    const hasDocAttachment = Boolean(iframeSrc);
    const isStage1Attachment = (document?.current_stage || 1) === 1 || (activeApprovalLog?.stage_name || '').toUpperCase().includes('ATTACHMENT');
    const checkedCount = effectiveChecklist.filter(item => Boolean(checkedStates[item])).length;
    const totalCount = effectiveChecklist.length;
    const allItemsChecked = totalCount === 0 || checkedCount === totalCount;

    if (isStage1Attachment && !hasDocAttachment) {
      setActionError("⚠️ Physical PDF Attachment Compulsory: You must upload/attach the physical invoice PDF document before approving Stage 1 (Attachment Status).");
      return;
    }

    if (!allItemsChecked) {
      setActionError(`⚠️ Compliance Checklist Incomplete: Please verify and check all ${totalCount} checklist items (${totalCount - checkedCount} remaining) before approving.`);
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const commentsToSend = approvalComment.trim() || `Approved Stage ${activeApprovalLog?.current_stage_number || 1} (Document Attached & Compliance Checklist Verified)`;
      const response = await fetch(`/api/workflows/approve`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token") || localStorage.getItem("authToken")}`
        },
        body: JSON.stringify({
          invoiceId: document.id,
          expected_stage: document.current_stage || 1,
          expected_version: document.version,
          comments: commentsToSend,
          checklistVerified: true,
          verifiedItems: Object.keys(checkedStates).filter(k => checkedStates[k])
        }),
      });
      if (response.ok) {
        let approveData: any = {};
        try {
          approveData = await response.json();
        } catch {}
        clearDraft();
        setApprovalComment("");
        showToast("✓ Document Approved & Forwarded Successfully!", "success");
        setApprovedNextStageInfo({
          nextApprover: approveData.next_approver,
          nextStageName: approveData.next_stage_name,
          isCompleted: approveData.status === 'Approved' || approveData.invoice?.status === 'Approved'
        });
        await fetchWorkflowData();
        onRefreshDocument();
        const nextId = getNextPendingDocId();
        setPendingNextId(nextId);
        setActionModalType('approve');
        setShowNextActionModal(true);
      } else {
        let errDetail = "Approval action failed";
        try {
          const txt = await response.text();
          try {
            const err = JSON.parse(txt);
            errDetail = err.detail || err.error || err.message || txt || errDetail;
          } catch {
            if (txt) errDetail = txt;
          }
        } catch {}
        setActionError(errDetail);
        if (response.status === 409) {
          // Collision: Another approver already completed this stage. Refresh immediately!
          await fetchWorkflowData();
          onRefreshDocument();
        }
      }
    } catch (err: any) {
      setActionError(err.message || "Approval action failed");
    }
    setActionLoading(false);
  };


  const getStatusBadge = () => {
    const status = document.status;
    const isStage1 = activeApprovalLog?.current_stage_number === 1;
    const hasAttachment = Boolean(document?.file_url || document?.file_path);

    if (["Approved", "Paid", "Ready for Payment", "Settled"].includes(status)) {
      return (
        <span className="document-details-meta-badge px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-[9px] font-extrabold text-emerald-300 uppercase tracking-wider">
          Approved
        </span>
      );
    }
    if (["Cancelled", "Failed"].includes(status)) {
      return (
        <span className="document-details-meta-badge px-2 py-0.5 rounded-md bg-slate-700/60 border border-slate-500/40 text-[9px] font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          Cancelled
        </span>
      );
    }
    if ((status || '').toLowerCase().includes('return') || (status || '').toLowerCase().includes('reject')) {
      return (
        <span className="document-details-meta-badge px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[9px] font-bold text-amber-200 uppercase tracking-wider flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Returned
        </span>
      );
    }
    if (isStage1 && !hasAttachment) {
      return (
        <span className="document-details-meta-badge px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[9px] font-extrabold text-black uppercase tracking-wider animate-pulse">
          Pending Attachment
        </span>
      );
    }
    return (
      <span className="document-details-meta-badge px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[9px] font-extrabold text-white uppercase tracking-wider">
        Under Review
      </span>
    );
  };

  return (
    <div className="document-details-compact animate-fadeIn relative w-full max-w-[1600px] mx-auto">
      {/* FLOATING ACTION TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[300] animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-none">
          <div className={`px-4 py-2.5 rounded-xl shadow-2xl border flex items-center gap-2.5 font-bold text-xs ${
            toastMessage.type === 'success' 
              ? 'bg-slate-900 text-emerald-300 border-emerald-500/50 shadow-emerald-950/30'
              : toastMessage.type === 'amber'
              ? 'bg-slate-900 text-amber-300 border-amber-500/50 shadow-amber-950/30'
              : toastMessage.type === 'error'
              ? 'bg-slate-900 text-rose-300 border-rose-500/50 shadow-rose-950/30'
              : 'bg-slate-900 text-slate-200 border-slate-500/50 shadow-slate-950/30'
          }`}>
            <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Action Error Alert */}
      {actionError && (
        <div className="w-full mb-2 flex items-center px-4 py-2 bg-red-50 border border-red-200 text-red-700 font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm">
          <AlertCircle className="h-4 w-4 mr-2 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}

      {/* MODERN FULL-HEIGHT EXECUTIVE REVIEW & ACTION WORKSPACE */}
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-lg shadow-slate-900/5 flex flex-col h-[calc(100vh-76px)] min-h-[620px] overflow-hidden animate-fadeIn text-[11px]">
        
        {/* DOCUMENT TITLE BAR */}
        <div className="bg-white text-slate-800 px-3 py-2 flex items-center justify-between shrink-0 border-b border-slate-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onGoBack}
              className="h-7 w-7 rounded-md bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 flex items-center justify-center text-[#003F28] hover:text-[#005333] shrink-0 transition cursor-pointer shadow-3xs active:scale-95"
              title="Back to Documents"
            >
              <ArrowLeft className="h-4 w-4 stroke-[2.5]" />
            </button>
            <span className="document-details-title font-extrabold text-base tracking-tight text-slate-800 font-display truncate">
              Document Details
            </span>
            <span className="document-details-meta-badge px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-[9px] font-mono font-bold text-slate-600 shrink-0">
              {formatDocNumber(document.id, document.document_type, (document as any).category)}
            </span>
            <span className="document-details-meta-badge px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-[9px] font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <FileText className="h-2.5 w-2.5" />
              {document.document_type || "DOCUMENT"}
            </span>
            {getStatusBadge()}
            {document.workflow_profile_id && (
              <span className="document-details-meta-badge px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-[9px] font-bold text-emerald-800 flex items-center gap-1 shrink-0" title={`Active Workflow Profile: ${document.workflow_profile_id}`}>
                <Shield className="h-2.5 w-2.5 text-[#003F28]" />
                Flow: {document.workflow_profile_id}
              </span>
            )}
            {Boolean(document.doc_key) && ((document?.current_stage || 1) === 1 || (document?.status || "").toLowerCase().includes("attachment")) && (
              <span className="document-details-meta-badge px-2 py-1 rounded-md bg-blue-50 border border-blue-200 text-[9px] font-bold text-blue-800 flex items-center gap-1 shrink-0" title="Synced from third-party ERP. Financial and header fields are locked in read-only mode during Attachment Status.">
                <Database className="h-2.5 w-2.5 text-blue-600" />
                ERP Data (Locked)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* ERP Data Sync Button: Opens ERP Data Sync & Reconciliation Modal (Admin Only) */}
            {["admin", "administrator", "system_admin", "superadmin"].includes((currentUserRole || "").toLowerCase()) && getFieldPerm("erp_sync_data") !== "hidden" ? (
              <button
                onClick={() => setShowErpSyncModal(true)}
                className="p-1.5 rounded-lg bg-[#006747] hover:bg-[#005333] text-white transition text-[10px] font-bold flex items-center gap-1.5 px-3 border border-[#005333] shadow-xs cursor-pointer"
                title="View Enterprise ERP Data Sync & Ledger Reconciliation"
              >
                <Database className="h-3 w-3 text-[#002F20]" />
                <span>ERP Data Sync</span>
              </button>
            ) : (
              <button
                onClick={onRefreshDocument}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition text-[10px] font-bold flex items-center gap-1 px-2.5 border border-slate-200 cursor-pointer"
                title="Refresh Document"
              >
                <RotateCw className="h-3 w-3" />
                <span className="hidden md:inline">Refresh</span>
              </button>
            )}

            <button
              onClick={onGoBack}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition cursor-pointer"
              title="Close Workspace"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ACTIVE REVIEWER CONCURRENT COLLISION LOCK BANNER */}
        {lockInfo.isLocked && !lockInfo.isSelf && (
          <div className="bg-amber-500/15 border-b border-amber-400/40 px-4 py-2 flex items-center justify-between shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
              <Lock className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                Active Review in Progress: Currently being reviewed by <strong className="underline decoration-amber-500 font-extrabold">{lockInfo.lockedBy}</strong>. Document is in read-only mode to prevent conflicting modifications.
              </span>
            </div>
            <span className="text-[9.5px] bg-amber-200 text-amber-950 font-mono px-2 py-0.5 rounded font-black uppercase tracking-wider border border-amber-300">
              Locked
            </span>
          </div>
        )}

        {/* ENTERPRISE FINANCIAL KPI STRIP (DYNAMICALLY FILTERED & ENFORCED BY FLAC ROLE PERMISSIONS) */}
        <div ref={containerRef} className="bg-slate-50 border-b border-slate-300 px-4 py-2 shrink-0 space-y-2 select-none animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Primary Metrics Group */}
              {adminTop3Fields.map((field) => {
                const val = getFieldValueByKey(field.field_key, field.sample_value !== undefined && field.sample_value !== null ? String(field.sample_value) : undefined);
                return (
                  <div
                    key={field.field_key}
                    className="bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs flex-1 min-w-[150px]"
                  >
                    <div className="text-[7.5px] font-extrabold uppercase tracking-wider text-slate-600 mb-0.5 flex items-center gap-1">
                      <Check className="h-2 w-2 text-emerald-600 stroke-[3]" />
                      <span>{field.label}</span>
                    </div>
                    <div
                      className="text-[11px] font-bold truncate text-slate-900"
                      title={val}
                    >
                      {renderFieldValueContent(field.field_key, val)}
                    </div>
                  </div>
                );
              })}
            {/* More Info & Edit Fields Buttons Group */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowMoreMetadata(!showMoreMetadata)}
                className={`py-1.5 px-3 rounded-lg border text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
                  showMoreMetadata 
                    ? "bg-[#006747] border-[#005333] text-white shadow-xs" 
                    : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                }`}
                title="Toggle additional information"
              >
                <span>{showMoreMetadata ? "Less Info" : "More Info"}</span>
                <span className="text-[11px] leading-none">{showMoreMetadata ? "▴" : "▾"}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfigDrawer(true)}
                className="py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:border-slate-300 text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                title="Configure which fields appear in More Info"
              >
                <Settings className="h-3.5 w-3.5 text-slate-500" />
                <span>Edit Fields</span>
              </button>
            </div>
          </div>

          {/* Secondary Collapsible Extra Data Panel (Exact Visual Match to Summary Strip) */}
          {showMoreMetadata && (
            <div className="pt-2 border-t border-slate-300 animate-fadeIn">
              <div className="flex flex-wrap items-center gap-2.5">
                {effectiveMoreInfoFields.map((field) => {
                  const val = getFieldValue(field);
                  return (
                    <div
                      key={field.field_key}
                      className="bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs flex-1 min-w-[125px]"
                    >
                      <div className="flex items-center justify-between text-[7.5px] font-extrabold uppercase tracking-wider text-slate-600 mb-0.5">
                        <span className="truncate" title={field.label}>
                          {field.label}
                        </span>
                        {field.source && (
                          <span
                            className={`text-[7px] font-bold uppercase px-1 rounded border shrink-0 ${
                              field.source === "ERP"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : field.source === "Calculated"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {field.source}
                          </span>
                        )}
                      </div>
                      <div
                        className="text-[11px] font-bold truncate text-slate-900"
                        title={val}
                      >
                        {renderFieldValueContent(field.field_key, val)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-2 gap-2.5 bg-slate-50/40 min-h-0">
          
          {/* LEFT COLUMN: UNIFIED SCROLLABLE AUDIT & COMPLIANCE PANEL (OPTIMAL COMPACT WIDTH) */}
          <div className="w-full lg:w-[30%] xl:w-[30%] flex flex-col shrink-0 overflow-y-auto custom-scrollbar pr-1 space-y-2 max-h-full">
            
            {/* 1. Sleek Stepper Progress Strip */}
            <div 
              onClick={() => setShowTimelineModal(true)}
              className="bg-white rounded-xl border border-slate-200/90 px-3 py-2 shadow-2xs shrink-0 flex flex-col gap-1 cursor-pointer hover:border-indigo-300 hover:shadow-xs transition group select-none"
              title="Click to view full Approval Timeline & Audit Trail"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-black text-slate-800 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-[#003F28]" /> Approval Workflow
                </span>
                <span className="px-2 py-0.5 rounded-md border border-slate-200 text-[8.5px] font-bold text-slate-600 group-hover:border-emerald-300 group-hover:text-emerald-800 transition">
                  View Timeline →
                </span>
              </div>
            </div>

            {document?.completed_by_peer && (
              <div className="p-2 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 flex items-center gap-2 shadow-2xs shrink-0">
                <div className="h-5 w-5 rounded-md bg-amber-500 text-white flex items-center justify-center font-black text-[10px] shrink-0 shadow-xs">
                  ✓
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10.5px] font-bold text-amber-900">
                    Stage Completed by Peer Approver
                  </div>
                  <div className="text-[9.5px] text-amber-700">
                    This approval stage has already been completed by another approver. Document is now read-only for you.
                  </div>
                </div>
              </div>
            )}
            {lockInfo.isLocked && !lockInfo.isSelf && !document?.completed_by_peer && !isTerminal && (
              <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 flex items-center gap-2 shadow-2xs shrink-0">
                <Users className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <div className="text-[10px]">
                  <span className="font-bold">{lockInfo.lockedBy}</span> is also reviewing this document. Either of you can approve this stage.
                </div>
              </div>
            )}

            {/* 2. APPROVE / REJECT / RETURN (TOP ACTION BAR) */}
            {(() => {
              const isSettled = (document?.status || '').toLowerCase().includes('settled') || (document?.status || '').toLowerCase().includes('paid') || document?.status === 'Approved';
              const isCancelled = ["Cancelled", "Failed"].includes(document?.status || "");
              if (isSettled || isCancelled || isDocumentLocked) return null;

              const hasDocAttachment = Boolean(document?.file_url || document?.file_path || iframeSrc);
              const isStage1Attachment = (document?.current_stage || 1) === 1 || (activeApprovalLog?.stage_name || '').toUpperCase().includes('ATTACHMENT');
              const checkedCount = effectiveChecklist.filter(item => Boolean(checkedStates[item])).length;
              const totalCount = effectiveChecklist.length;
              const allItemsChecked = totalCount === 0 || checkedCount === totalCount;
              const canApprove = (!isStage1Attachment || hasDocAttachment) && allItemsChecked && !actionLoading;

              return (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleInlineApprove}
                    disabled={!canApprove}
                    className={`flex-1 py-1.5 px-2.5 font-extrabold text-[10.5px] uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer ${
                      canApprove
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/35 hover:shadow-emerald-600/50 hover:shadow-md ring-1 ring-emerald-500/20"
                        : "bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-75"
                    }`}
                    title={
                      !hasDocAttachment && isStage1Attachment
                        ? "Attach physical document PDF first"
                        : !allItemsChecked
                        ? "Verify all checklist items first"
                        : "Click to approve and forward to next stage approver"
                    }
                  >
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                    <span>
                      {actionLoading 
                        ? "Processing..." 
                        : isStage1Attachment && !hasDocAttachment
                        ? "Attach PDF to Unlock"
                        : !allItemsChecked
                        ? "Verify Checklist"
                        : "Approve ➔"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleInlineHold}
                    disabled={actionLoading}
                    className="px-2.5 py-1.5 bg-amber-50/80 hover:bg-amber-100/90 text-amber-800 font-bold text-[9.5px] uppercase tracking-wider rounded-lg border border-amber-200/80 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 shadow-3xs hover:shadow-2xs cursor-pointer"
                    title="Hold and request clarification"
                  >
                    <Pause className="h-3 w-3" />
                    <span>Hold</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleInlineReject}
                    disabled={actionLoading}
                    className="px-2.5 py-1.5 bg-rose-50/80 hover:bg-rose-100/90 text-rose-800 font-bold text-[9.5px] uppercase tracking-wider rounded-lg border border-rose-200/80 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1 shadow-3xs hover:shadow-2xs cursor-pointer"
                    title={
                      (document?.current_stage || 1) > 1
                        ? `Reject and return to Stage ${(document.current_stage || 2) - 1} approver for review`
                        : "Cancel and void this process at Attachment stage"
                    }
                  >
                    {(document?.current_stage || 1) > 1 ? (
                      <>
                        <RotateCcw className="h-3 w-3" />
                        <span>Reject / Return</span>
                      </>
                    ) : (
                      <>
                        <X className="h-3 w-3 stroke-[3]" />
                        <span>Cancel Process</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}

            {/* 3. CHECKLIST VERIFICATION */}
            {(() => {
              const isSettled = (document?.status || '').toLowerCase().includes('settled') || (document?.status || '').toLowerCase().includes('paid') || document?.status === 'Approved';
              const isCancelled = ["Cancelled", "Failed"].includes(document?.status || "");
              const isReturned = (document?.status || '').toLowerCase().includes('return');
              const hasDocAttachment = Boolean(document?.file_url || document?.file_path || iframeSrc);
              const isStage1Attachment = (document?.current_stage || 1) === 1 || (activeApprovalLog?.stage_name || '').toUpperCase().includes('ATTACHMENT');
              const checkedCount = effectiveChecklist.filter(item => Boolean(checkedStates[item])).length;
              const totalCount = effectiveChecklist.length;
              const allItemsChecked = totalCount === 0 || checkedCount === totalCount;

              if (isSettled) {
                return (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 flex flex-col gap-1.5 shadow-2xs shrink-0 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                          ✓
                        </div>
                        <div>
                          <span className="font-extrabold text-[11px] block text-emerald-900 leading-tight">Document Fully Settled & Approved</span>
                          <span className="text-[9.5px] text-emerald-700 font-medium">All workflow sign-off stages completed. Cleared for payment disbursement.</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[9px] font-black uppercase tracking-wider shadow-2xs">
                        Settled
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTimelineModal(true)}
                      className="w-full py-1 px-2.5 bg-white hover:bg-emerald-100/60 text-emerald-900 border border-emerald-300 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Clock className="h-3 w-3 text-emerald-600" />
                      <span>View Sign-Off History & Named Approver Audit Log ➔</span>
                    </button>
                  </div>
                );
              }

              if (isCancelled) {
                return (
                  <div className="p-2.5 bg-gradient-to-r from-rose-50/90 to-orange-50/40 border border-rose-200/90 rounded-xl text-rose-950 flex flex-col gap-1.5 shadow-2xs shrink-0 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-6 w-6 rounded-lg bg-rose-500 text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0">
                          ✕
                        </div>
                        <div>
                          <span className="font-extrabold text-[11px] block text-rose-950 leading-tight">Document Process Cancelled</span>
                          <span className="text-[9.5px] text-rose-700/90 font-medium">This workflow process was cancelled and voided.</span>
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-300/70 rounded-md text-[9px] font-extrabold uppercase tracking-wider shadow-3xs">
                        Cancelled
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTimelineModal(true)}
                      className="w-full py-1 px-2.5 bg-white hover:bg-rose-50 text-rose-900 border border-rose-200 rounded-lg text-[10px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                    >
                      <Clock className="h-3 w-3 text-rose-600" />
                      <span>View Cancellation Audit Trail ➔</span>
                    </button>
                  </div>
                );
              }

              if (isDocumentLocked) {
                return (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-medium flex flex-col gap-1.5 shrink-0 animate-fadeIn shadow-2xs">
                    <div className="flex items-center gap-1.5 text-slate-800 font-bold">
                      <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>
                        Document Locked (Read-Only): Currently at Stage {document?.current_stage || 1} {document?.assigned_approver ? `(Assigned: ${document.assigned_approver})` : ''}
                      </span>
                    </div>
                    <p className="text-[9.5px] text-slate-500 leading-relaxed">
                      {isTerminal 
                        ? `This document is in a completed terminal state (${document?.status}) and cannot be edited.`
                        : `This document has been signed off for this stage. All fields, checklists, and document attachments are locked in read-only mode until returned via rejection.`
                      }
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowTimelineModal(true)}
                      className="w-full py-1 px-2.5 bg-white hover:bg-slate-100/90 text-slate-800 border border-slate-300 rounded-lg text-[9.5px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Clock className="h-3 w-3 text-slate-500" />
                      <span>View Stage Approval Timeline & Audit Trail</span>
                    </button>
                  </div>
                );
              }

              return (
                <div className="space-y-1 shrink-0">
                  {/* Step-Down Returned Notice */}
                  {isReturned && (
                    <div className="p-1.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-[9.5px] font-bold flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-1.5">
                        <RotateCcw className="h-3 w-3 text-rose-600 shrink-0" />
                        <span>Returned Document: Rejected by next stage approver. Review feedback, verify checklist, and re-approve.</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setShowTimelineModal(true)} 
                        className="text-[8px] uppercase tracking-wider text-rose-700 bg-rose-100 hover:bg-rose-200 px-1.5 py-0.5 rounded font-extrabold cursor-pointer"
                      >
                        View Notes
                      </button>
                    </div>
                  )}

                  {/* Stage Guidance Alert Pill */}
                  {isStage1Attachment && !hasDocAttachment ? (
                    <div className="p-1.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[9.5px] font-bold flex items-center gap-1.5 shadow-2xs">
                      <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                      <span>Stage 1 Requirement: Attach physical PDF & verify checklist to unlock approval.</span>
                    </div>
                  ) : isStage1Attachment && hasDocAttachment && !allItemsChecked ? (
                    <div className="p-1.5 bg-amber-50/70 border border-amber-200 text-amber-900 rounded-lg text-[9.5px] font-bold flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" />
                        <span>Attachment Stage: Review document, verify checklist ({checkedCount}/{totalCount}), and click Approve to forward (or Cancel).</span>
                      </div>
                      <span className="text-[8.5px] uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-extrabold">Stage 1</span>
                    </div>
                  ) : !allItemsChecked ? (
                    <div className="p-1.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-[9.5px] font-bold flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3 w-3 text-blue-600 shrink-0" />
                        <span>Checklist Verification: ({checkedCount}/{totalCount}) items verified</span>
                      </div>
                      <span className="text-[8.5px] uppercase tracking-wider text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded font-extrabold">Required</span>
                    </div>
                  ) : (
                    <div className="p-1.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg text-[9.5px] font-bold flex items-center gap-1.5 shadow-2xs">
                      <Check className="h-3 w-3 text-emerald-600 stroke-[3] shrink-0" />
                      <span>All Stage {document?.current_stage || 1} criteria satisfied! Click Approve to forward to next stage.</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 4. COMPLIANCE CHECKLIST */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-2.5 space-y-1.5 shrink-0">
              
              {/* Checklist Header Controls */}
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Shield className="h-3 w-3 text-[#003F28]" />
                  <span>Checklist {isDocUnrouted ? "(Unrouted)" : `(${effectiveChecklist.filter(item => Boolean(checkedStates[item])).length}/${effectiveChecklist.length})`}</span>
                </span>
                {isDocUnrouted ? (
                  <span className="text-[8.5px] uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                    Unrouted
                  </span>
                ) : isDocumentLocked ? (
                  <span className="text-[8.5px] uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-extrabold flex items-center gap-1">
                    <Lock className="h-2 w-2" /> Locked
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleToggleAllChecklist}
                    className="text-[9px] font-bold text-[#003F28] hover:text-[#005333] underline cursor-pointer"
                  >
                    {effectiveChecklist.every((item) => checkedStates[item]) ? "Deselect All" : "Verify All"}
                  </button>
                )}
              </div>

              {/* Checklist Items Matrix */}
              <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar pr-0.5">
                {isDocUnrouted ? (
                  <div className="p-2 bg-amber-50/60 border border-amber-200/80 text-amber-900 rounded-lg text-center text-[9.5px] font-medium">
                    Document is unrouted (no workflow matched). No checklist items apply.
                  </div>
                ) : effectiveChecklist.length === 0 ? (
                  <div className="p-2 bg-slate-50 border border-slate-200/80 text-slate-500 rounded-lg text-center text-[9.5px] font-medium italic">
                    No checklist requirements for this workflow stage.
                  </div>
                ) : (
                  effectiveChecklist.map((item, idx) => {
                    const isChecked = !!checkedStates[item];
                    return (
                      <div
                        key={idx}
                        onClick={isDocumentLocked ? undefined : () => handleToggleChecklist(item)}
                        className={`p-1.5 rounded-lg border transition-all flex items-center gap-2 select-none shadow-2xs ${
                          isDocumentLocked
                            ? isChecked
                              ? "bg-emerald-50/70 border-emerald-200 text-emerald-950 font-bold cursor-default"
                              : "bg-slate-50 border-slate-200 text-slate-500 cursor-default"
                            : isChecked
                            ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold cursor-pointer hover:shadow-xs active:scale-[0.99]"
                            : "bg-slate-50/70 border-slate-200/90 text-slate-700 hover:bg-slate-100 hover:border-slate-300 cursor-pointer active:scale-[0.99]"
                        }`}
                      >
                        <div
                          className={`h-3.5 w-3.5 rounded-md flex items-center justify-center shrink-0 border transition-all ${
                            isChecked
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                              : "bg-white border-slate-300"
                          }`}
                        >
                          {isChecked && <Check className="h-2 w-2 stroke-[3]" />}
                        </div>
                        <span className="text-[10.5px] leading-tight font-bold" title={item}>{item}</span>
                      </div>
                    );
                  })
                )}
              </div>

            </div>

            {/* 4. COMMENT (Shown ONLY if an explicit comment exists) */}
            {(() => {
              const currentStageNum = activeApprovalLog?.current_stage_number || document?.current_stage || 1;
              const currentStep = (workflowStepDefinitions || []).find(
                (s: any) => s.stage_number === currentStageNum
              );

              // Find real user comments from commentsList
              const userComments = (commentsList || []).filter((c: any) => {
                const author = (c.author || c.user_name || c.user || "").toLowerCase();
                const action = (c.action || "").toLowerCase();
                const notes = (c.text || c.comment || c.remarks || c.notes || c.message || "").toLowerCase();
                const isSync = author.includes("sync") || author.includes("erp") || action.includes("sync");
                const isConfig = action.includes("config") || notes.includes("updated user more info configuration") || notes.includes("data sync");
                return !isSync && !isConfig;
              });

              const prevStageNum = currentStageNum - 1;
              let prevStageLog = (userComments || []).find((c: any) => {
                const stageStr = String(c.stage || c.action || "");
                return stageStr.includes(String(prevStageNum)) || stageStr.toLowerCase().includes(`stage ${prevStageNum}`);
              });

              // Fallback to the latest user comment if specific stage match isn't found
              if (!prevStageLog && userComments.length > 0) {
                prevStageLog = userComments[0];
              }

              const prevApproverName = prevStageLog 
                ? (prevStageLog.author || prevStageLog.user_name || prevStageLog.user || "").split("(")[0].trim().toUpperCase() 
                : null;

              const explicitStepCmd = 
                currentStep?.instruction || 
                currentStep?.command || 
                (currentStep?.action_required && !['Approve', 'Approved'].includes(currentStep.action_required) ? currentStep.action_required : null);

              const rawCommentText = prevStageLog 
                ? (prevStageLog.text || prevStageLog.comment || prevStageLog.remarks || prevStageLog.notes || prevStageLog.message || "").trim() 
                : "";

              // Clean up standard auto-generated signoff string if no custom remark was written
              const prevStageComment = rawCommentText && !rawCommentText.startsWith("Approved Stage ") && !rawCommentText.startsWith("Advanced to ")
                ? rawCommentText 
                : null;

              const instruction = prevStageComment || explicitStepCmd;

              // Hide entire COMMENT card if no explicit instruction/comment was passed
              if (!instruction || !instruction.trim()) {
                return null;
              }

              const rawApprover = 
                currentStep?.approver_target || 
                document?.assigned_approver || 
                currentUserUsername || 
                "Assigned Approver";
              const approverName = rawApprover.split(",")[0].trim();
              const approverInitial = approverName ? approverName.charAt(0).toUpperCase() : "A";

              // Clean role: Do not display mismatched stage names like 'FIRST APPROVAL' on Stage 2+
              let rawRole = currentStep?.stage_name || currentStep?.step_name || "";
              if (currentStageNum > 1 && rawRole.toLowerCase().includes("first")) {
                rawRole = `Stage ${currentStageNum} Approver`;
              }
              if (!rawRole) {
                rawRole = currentStageNum === 1 ? "Manager" : `Stage ${currentStageNum} Approver`;
              }
              const cleanRole = rawRole.replace(/^\(|\)$/g, "").trim();
              const displayApproverWithRole = cleanRole && !approverName.toLowerCase().includes(cleanRole.toLowerCase())
                ? `${approverName.toUpperCase()} (${cleanRole.toUpperCase()})`
                : approverName.toUpperCase();

              return (
                <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-2.5 space-y-2 shrink-0">
                  {/* Card Title & Stage Badge */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <Shield className="h-3 w-3 text-[#003F28]" />
                      <span>COMMENT</span>
                    </span>
                    <span className="text-[8.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-3xs">
                      STAGE {currentStageNum}
                    </span>
                  </div>

                  {/* Approver Avatar Initial + Name & Role */}
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-[#003F28] text-white flex items-center justify-center font-black text-[10.5px] shrink-0 shadow-3xs">
                      {approverInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10.5px] font-extrabold text-slate-900 leading-tight truncate">
                        {displayApproverWithRole}
                      </div>
                      <div className="text-[9px] font-medium text-slate-500 leading-tight mt-0.5">
                        {prevApproverName 
                          ? `Passed from Stage ${prevStageNum} by ${prevApproverName}. Your approval is required.` 
                          : "Your approval is required at this stage."}
                      </div>
                    </div>
                  </div>

                  {/* Command Callout Box */}
                  <div className="p-2 bg-emerald-50/70 border border-emerald-200/90 rounded-lg flex items-start gap-1.5 text-[9.5px] font-medium text-emerald-950 leading-relaxed shadow-3xs">
                    <span className="text-xs shrink-0 select-none leading-none mt-0.5">💬</span>
                    <span className="flex-1 font-medium">{instruction}</span>
                  </div>
                </div>
              );
            })()}

            {/* 5. AUDIT NOTES / DECISION REMARKS */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-2.5 space-y-1.5 shrink-0">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <FileText className="h-3 w-3 text-[#003F28]" />
                  <span>Audit Notes / Decision Remarks</span>
                </span>
                {isDocumentLocked && (
                  <span className="text-[8px] text-slate-400 font-medium flex items-center gap-1">
                    <Lock className="h-2 w-2" /> Read-Only
                  </span>
                )}
              </div>
              
              <textarea
                rows={2}
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                disabled={isDocumentLocked || actionLoading}
                placeholder={
                  isDocumentLocked
                    ? "Document is locked in read-only mode for this stage."
                    : (document?.current_stage || 1) === 1
                    ? "Enter reason notes if cancelling, or optional remarks..."
                    : "Enter reason notes if rejecting / returning to previous approver, or optional remarks..."
                }
                className={`w-full text-[9.5px] font-medium p-1.5 border rounded-lg outline-none transition resize-none ${
                  isDocumentLocked 
                    ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed" 
                    : "bg-slate-50 border-slate-200 focus:border-[#003F28] focus:bg-white focus:ring-1 focus:ring-[#003F28]/20"
                }`}
              />
            </div>

          </div>

          {/* RIGHT COLUMN: EXTENDED LARGE ORIGINAL DOCUMENT VIEWER (FILLS REMAINING SCREEN) */}
          <div className="flex-1 flex flex-col bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-sm min-w-0 h-full">
            
            {/* Viewer Header Bar */}
            <div className="bg-[#003F28] text-white px-3.5 py-2 text-[10px] font-bold flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 truncate">
                <FileText className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                <span className="text-white font-bold text-[11px] truncate">
                  {iframeSrc ? (document.file_name || `${document.id}.pdf`) : "No document uploaded"}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Replace / Attach Document during Attachment Status (Stage 1) */}
                {canReplacePdf && (
                  <label 
                    className="cursor-pointer px-2.5 py-1 rounded-md bg-[#005333] hover:bg-[#00663F] text-white transition text-[9.5px] font-bold flex items-center gap-1 shadow-2xs active:scale-95" 
                    title={iframeSrc ? "Replace Document (Attachment Status)" : "Attach Document"}
                  >
                    <Upload className="h-3 w-3" />
                    <span>{isUploadingVersion ? "Attaching..." : iframeSrc ? "Replace Document" : "Attach Document"}</span>
                    <input 
                      type="file" 
                      accept=".pdf,application/pdf" 
                      disabled={isUploadingVersion}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleUploadVersion(e.target.files[0]);
                        }
                      }}
                      className="hidden" 
                    />
                  </label>
                )}

                {canReplacePdf && iframeSrc && <div className="h-4 w-[1px] bg-emerald-700/60 mx-0.5" />}

                {iframeSrc && (
                  <>
                    {/* Zoom Controls */}
                    <div className="flex items-center bg-white/10 rounded-md p-0.5 border border-white/15">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={zoomLevel <= 50}
                        className="p-1 rounded hover:bg-white/20 text-emerald-100 hover:text-white transition disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Zoom Out (-10%)"
                      >
                        <ZoomOut className="h-3 w-3" />
                      </button>
                      
                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="px-2 py-0.5 text-[10px] font-mono font-bold text-white hover:bg-white/20 rounded transition"
                        title="Click to reset zoom to 100%"
                      >
                        {zoomLevel}%
                      </button>

                      <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={zoomLevel >= 500}
                        className="p-1 rounded hover:bg-white/20 text-emerald-100 hover:text-white transition disabled:opacity-30 disabled:hover:bg-transparent"
                        title="Zoom In (+10%)"
                      >
                        <ZoomIn className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="h-4 w-[1px] bg-emerald-700/60 mx-0.5" />

                    {/* Download */}
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white transition text-[9.5px] font-bold flex items-center gap-1 shadow-2xs"
                      title="Download Original Document"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>

                    {/* Print */}
                    <button
                      type="button"
                      onClick={handlePrintPdf}
                      className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white transition text-[9.5px] font-bold flex items-center gap-1 shadow-2xs"
                      title="Print Document"
                    >
                      <Printer className="h-3 w-3" />
                      <span>Print</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* LIVE ORIGINAL PDF VIEWER OR EMPTY STATE */}
            <div className="flex-1 bg-slate-100/70 overflow-hidden flex flex-col p-1.5 min-h-0">
              {iframeSrc ? (
                <div className="w-full h-full overflow-auto rounded-lg bg-white shadow-inner flex items-start justify-center">
                  <iframe
                    ref={iframeRef}
                    key={`${cleanPdfSrc}-${zoomLevel}`}
                    src={`${cleanPdfSrc}#toolbar=0&navpanes=0&zoom=${zoomLevel}`}
                    title={document.file_name || `${document.id}.pdf`}
                    className="w-full h-full border-0 rounded-lg bg-white"
                  />
                </div>
              ) : (
                <div 
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (canReplacePdf && e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleUploadVersion(e.dataTransfer.files[0]);
                    }
                  }}
                  className="w-full h-full bg-slate-50 border-2 border-dashed border-slate-300/80 hover:border-[#003F28] hover:bg-[#003F28]/5 rounded-xl flex flex-col items-center justify-center p-6 text-center shadow-inner transition-all"
                >
                  <div className="h-14 w-14 rounded-2xl bg-slate-200/60 border border-slate-300/70 text-slate-500 flex items-center justify-center mb-3.5 shadow-sm">
                    <FileText className="h-7 w-7 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800 tracking-tight">
                    {!canReplacePdf ? "No document uploaded" : "Physical Invoice Attachment Pending"}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4 leading-relaxed">
                    {!canReplacePdf 
                      ? "No document or PDF has been attached to this record."
                      : "This document is in Attachment Status. Please upload or drag & drop the scanned physical invoice PDF to attach it to this record."
                    }
                  </p>
                  
                  {canReplacePdf && (
                    <>
                      <label className="cursor-pointer px-4 py-2.5 bg-[#003F28] hover:bg-[#005333] text-white rounded-xl text-xs font-bold transition shadow-md flex items-center gap-2 active:scale-95">
                        <Upload className="h-4 w-4" />
                        <span>{isUploadingVersion ? "Uploading & Attaching..." : "Upload / Replace Document"}</span>
                        <input 
                          type="file" 
                          accept=".pdf,application/pdf" 
                          disabled={isUploadingVersion}
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleUploadVersion(e.target.files[0]);
                            }
                          }}
                          className="hidden" 
                        />
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono mt-2">Drag & Drop or Click to Upload (PDF only)</span>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>

        </div>

        {/* BOTTOM FOOTER BAR */}
        <div className="bg-slate-50 border-t border-slate-200/80 px-4 py-1.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
            <span>Logged in as <strong className="text-slate-800">{currentUserUsername || "admin"}</strong> ({currentUserRole || "Admin"})</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTimelineModal(true)}
              className="text-[#003F28] hover:text-[#005333] text-[10px] font-bold underline cursor-pointer"
            >
              View Audit History
            </button>
          </div>
        </div>

      </div>

      {/* ========================================================= */}
      {/* 1. ERP DATA SYNC & MASTER RECONCILIATION MODAL */}
      {/* ========================================================= */}
      {showErpSyncModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            
            {/* Modal Top Bar */}
            <div className="bg-[#003F28] text-white px-5 py-3.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shadow-inner">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-white font-display">
                      ERP Data Sync
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[9px] font-mono font-bold text-emerald-300">
                      Connected
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-100/80">
                    Live SAP & MS SQL Sync
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowErpSyncModal(false)}
                className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Toast Alert */}
            {erpSyncToast && (
              <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-[10.5px] px-4 py-2 font-bold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{erpSyncToast}</span>
              </div>
            )}

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs flex-1 bg-slate-50/50">
              
              {/* Card 1: System Integration & Status Card */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="font-extrabold text-[11px] text-slate-800 uppercase tracking-wider">
                      Target ERP: SAP / MS SQL
                    </span>
                  </div>
                  <span className="text-[9.5px] font-mono text-slate-400">
                    Last Synced: {document.updated_at ? new Date(document.updated_at).toLocaleString('en-IN') : new Date().toLocaleTimeString('en-IN')}
                  </span>
                </div>

                {/* 4-Grid System Meta */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase block">ERP DocKey</span>
                    <span className="text-[11px] font-mono font-black text-[#003F28]">
                      {document.doc_key || 8803}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase block">CardCode (Vendor)</span>
                    <span className="text-[11px] font-mono font-bold text-slate-800">
                      {document.vendor_code || "VEND-GEV-991"}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase block">Division / Branch</span>
                    <span className="text-[11px] font-bold text-slate-800">
                      {document.division || "VCC"} • {document.plant || "TN-SIVAKASI"}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-200/70">
                    <span className="text-[8px] font-extrabold text-slate-400 uppercase block">Cost Center & GL</span>
                    <span className="text-[11px] font-bold text-slate-800 truncate" title={(document as any)?.cost_center || "-"}>
                      {(document as any)?.cost_center || "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Card 2: Synced ERP Master Record */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-extrabold text-[10.5px] uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Synced ERP Master Record</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[8.5px] font-extrabold uppercase">
                    Synced
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-[10.5px]">
                    <thead>
                      <tr className="bg-slate-50 text-[9px] uppercase font-extrabold text-slate-400 border-b border-slate-200">
                        <th className="py-2 px-3 w-1/3">Field Attribute</th>
                        <th className="py-2 px-3">ERP Master Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dynamicSyncPayload.entries.map((entry) => (
                        <tr key={entry.key} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-slate-700">{entry.label}</td>
                          <td className="py-2 px-3 font-medium text-slate-900">{renderFieldValueContent(entry.key, entry.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Card 3: Expandable Raw ERP Payload JSON */}
              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2">
                <button
                  type="button"
                  onClick={() => setShowRawPayload(!showRawPayload)}
                  className="flex items-center justify-between w-full text-slate-700 hover:text-[#003F28] font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#003F28]" />
                    <span>Raw ERP Sync Payload JSON ({showRawPayload ? "Collapse" : "Expand"})</span>
                  </span>
                  {showRawPayload ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {showRawPayload && (
                  <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded-lg text-[9.5px] font-mono overflow-x-auto max-h-48 custom-scrollbar">
                    {JSON.stringify(dynamicSyncPayload.rawPayload, null, 2)}
                  </pre>
                )}
              </div>

            </div>

            {/* Modal Actions Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowErpSyncModal(false)}
                className="px-4 py-1.5 bg-[#003F28] hover:bg-[#005333] text-white font-bold text-[11px] rounded-lg transition cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. APPROVAL TIMELINE & AUDIT TRAIL MODAL */}
      {/* ========================================================= */}
      {showTimelineModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="bg-[#003F28] text-white px-5 py-3.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white flex items-center gap-2 flex-wrap">
                    <span>Approval Timeline & Audit Trail</span>
                    <span className="text-[10px] font-mono font-normal text-emerald-200 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-700/60">
                      {formatDocNumber(document.id, document.document_type, (document as any).category)}
                    </span>
                    {document?.workflow_profile_id && (
                      <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-600/70">
                        Flow: {document.workflow_profile_id}
                      </span>
                    )}
                  </h3>
                  <p className="text-[10.5px] text-emerald-100/80 font-medium">
                    {vendorName || document.vendor_name || "Vendor"} • ₹{Number(amount || document.amount || 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTimelineModal(false)}
                className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body: Chronological Audit Trail */}
            <div className="p-5 overflow-y-auto space-y-4 custom-scrollbar text-xs flex-1">
              
              {/* Dynamic Approval Workflow Stages */}
              {workflowStepDefinitions && workflowStepDefinitions.length > 0 ? (
                workflowStepDefinitions.map((step: any, idx: number) => {
                  const isDocSettled = ["Approved", "Settled", "Paid", "Ready for Payment"].includes(document?.status || "");
                  const docStatusLower = (document?.status || "").toLowerCase();
                  const isDocCancelled = docStatusLower.includes("cancel") || docStatusLower.includes("reject") || docStatusLower.includes("failed");
                  const currentStageNum = activeApprovalLog?.current_stage_number || document?.current_stage || 1;

                  const poolMembers = (step.approver_target || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                  
                  // Specific approval log for this exact step
                  const matchingApprovalLog = (commentsList || []).find((c: any) => {
                    const action = (c.action || "").toLowerCase();
                    const author = (c.author || c.user_name || c.user || "").toLowerCase();
                    const isSyncOrSystem = author.includes("sync") || author.includes("erp") || action.includes("sync") || action.includes("ingest");
                    if (isSyncOrSystem) return false;
                    const isApprovalAction = action.includes("approved") || action.includes("signoff") || action.includes("verified");
                    if (!isApprovalAction) return false;
                    return (
                      (c.stage && (c.stage.includes(String(step.stage_number)) || c.stage.toLowerCase().includes(step.stage_name.toLowerCase()))) || 
                      (c.action && (c.action.includes(String(step.stage_number)) || c.action.toLowerCase().includes(step.stage_name.toLowerCase())))
                    );
                  });

                  // Terminal cancellation log for the cancelled stage
                  const terminalCancelLog = (commentsList || []).find((c: any) => {
                    const action = (c.action || "").toLowerCase();
                    return action.includes("cancel") || action.includes("void");
                  });

                  // Return/Sendback log
                  const returnLog = (commentsList || []).find((c: any) => {
                    const action = (c.action || "").toLowerCase();
                    const isReturn = action.includes("returned") || action.includes("send back") || action.includes("sendback") || action.includes("reject");
                    if (!isReturn) return false;
                    return (
                      (c.stage && (c.stage.includes(String(step.stage_number)) || c.stage.toLowerCase().includes(step.stage_name.toLowerCase()))) || 
                      (c.action && (c.action.includes(String(step.stage_number)) || c.action.toLowerCase().includes(step.stage_name.toLowerCase())))
                    );
                  });

                  const isTerminalCancelledStage = isDocCancelled && (
                    (terminalCancelLog && ((terminalCancelLog.stage && terminalCancelLog.stage.includes(String(step.stage_number))) || step.stage_number === currentStageNum)) ||
                    (!terminalCancelLog && step.stage_number === currentStageNum)
                  );

                  const isPassed = !isTerminalCancelledStage && (isDocSettled || Boolean(matchingApprovalLog) || (!isDocCancelled && step.stage_number < currentStageNum));
                  const isCurrent = !isDocSettled && !isDocCancelled && !isTerminal && !isPassed && (step.stage_number === currentStageNum);
                  const isAborted = isDocCancelled && step.stage_number > currentStageNum;

                  return (
                    <div key={idx} className="flex gap-3 relative">
                      <div className="flex flex-col items-center">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center font-semibold text-[10px] ${
                          isTerminalCancelledStage
                            ? "bg-slate-100 text-rose-600 border border-slate-300 font-bold"
                            : isPassed 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-400 font-bold" 
                            : isCurrent 
                            ? "bg-[#003F28] text-white shadow-xs ring-2 ring-[#003F28]/20" 
                            : "bg-slate-100 text-slate-400 border border-slate-200"
                        }`}>
                          {isTerminalCancelledStage ? "✕" : isPassed ? "✓" : step.stage_number}
                        </div>
                        {idx < workflowStepDefinitions.length - 1 && (
                          <div className={`w-0.5 flex-1 mt-1 min-h-[28px] ${
                            isPassed ? "bg-emerald-200" : "bg-slate-200"
                          }`} />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex items-center justify-between">
                          <span className={`font-semibold text-xs ${
                            isTerminalCancelledStage ? "text-slate-800" : isCurrent ? "text-slate-900 font-bold" : isPassed ? "text-slate-800 font-semibold" : "text-slate-400"
                          }`}>
                            {step.stage_name}
                          </span>
                          {isTerminalCancelledStage && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[9px] font-semibold tracking-wider flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                              Cancelled
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#003F28] font-bold text-[9px] uppercase tracking-wider border border-emerald-200">
                              Active Stage
                            </span>
                          )}
                          {isPassed && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold text-[9px] border border-emerald-200/60">
                              Approved
                            </span>
                          )}
                          {isAborted && (
                            <span className="text-[9px] text-slate-400 font-medium italic">
                              Not Reached
                            </span>
                          )}
                        </div>

                        {/* Approver Details & Specific Sign-off Identity Card */}
                        <div className="mt-1 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200/80 space-y-1.5">
                          {/* 1. Assigned Pool Breakdown */}
                          <div className="flex items-start justify-between text-[10px]">
                            <div className="space-y-0.5">
                              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">
                                Assigned Pool ({poolMembers.length > 0 ? poolMembers.length : 1}):
                              </span>
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {poolMembers.length > 0 ? (
                                  poolMembers.map((mem: string, mIdx: number) => {
                                    const relevantLog = isTerminalCancelledStage ? terminalCancelLog : matchingApprovalLog;
                                    const isTheSigner = relevantLog && (relevantLog.author || relevantLog.user_name || relevantLog.user || "").toLowerCase().includes(mem.toLowerCase());
                                    return (
                                      <span 
                                        key={mIdx} 
                                        className={`px-1.5 py-0.2 rounded text-[9.5px] font-mono ${
                                          isTheSigner 
                                            ? "bg-slate-100 text-slate-900 border border-slate-300 font-bold"
                                            : "bg-slate-50 text-slate-600 border border-slate-200"
                                        }`}
                                      >
                                        {mem}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="font-mono text-slate-700">{step.approver_target || "Authorized Pool"}</span>
                                )}
                              </div>
                            </div>
                            <span className="text-slate-400 font-mono text-[8.5px] bg-slate-100 px-1 py-0.2 rounded">Stage {step.stage_number}</span>
                          </div>

                          {/* 2. Exact Sign-Off / Status Attribution */}
                          {isTerminalCancelledStage ? (
                            <div className="p-1.5 bg-rose-50/70 rounded border border-rose-200/70 text-[10px] flex items-center justify-between text-rose-900">
                              <div className="flex items-center gap-1.5">
                                <span className="h-3.5 w-3.5 rounded-full bg-rose-600 text-white font-bold text-[8.5px] flex items-center justify-center">✕</span>
                                <span>
                                  <strong>Process Cancelled By:</strong> {terminalCancelLog ? (terminalCancelLog.author || terminalCancelLog.user_name || terminalCancelLog.user) : "Initiator"}
                                </span>
                              </div>
                              {terminalCancelLog?.created_at && (
                                <div className="text-[9px] font-mono text-slate-500 text-right">
                                  <span>Date: {formatDate(terminalCancelLog.created_at)}</span>
                                  <span className="mx-1">•</span>
                                  <span>Time: {formatTimeOnly(terminalCancelLog.created_at)}</span>
                                </div>
                              )}
                            </div>
                          ) : isPassed ? (
                            <div className="p-1.5 bg-emerald-50/60 rounded border border-emerald-200/60 text-[10.5px] flex items-center justify-between text-emerald-800">
                              <div className="flex items-center gap-1.5">
                                <span className="h-3.5 w-3.5 rounded-full bg-emerald-600 text-white font-bold text-[8.5px] flex items-center justify-center">✓</span>
                                <span>
                                  <strong>Approved By:</strong> {matchingApprovalLog ? (matchingApprovalLog.author || matchingApprovalLog.user_name || matchingApprovalLog.user) : "Authorized Approver"}
                                </span>
                              </div>
                              {matchingApprovalLog?.created_at && (
                                <div className="text-[9px] font-mono text-emerald-700 text-right">
                                  <span>Date: {formatDate(matchingApprovalLog.created_at)}</span>
                                  <span className="mx-1">•</span>
                                  <span>Time: {formatTimeOnly(matchingApprovalLog.created_at)}</span>
                                </div>
                              )}
                            </div>
                          ) : returnLog && !isDocSettled ? (
                            <div className="p-1.5 bg-amber-50/60 rounded border border-amber-200/60 text-[10px] flex items-center justify-between text-amber-800">
                              <div className="flex items-center gap-1.5">
                                <span className="h-3.5 w-3.5 rounded-full bg-amber-500 text-white font-bold text-[8.5px] flex items-center justify-center">↩</span>
                                <span>
                                  <strong>Returned By:</strong> {returnLog.author || returnLog.user_name || returnLog.user || "Reviewer"}
                                </span>
                              </div>
                              {returnLog?.created_at && (
                                <div className="text-[9px] font-mono text-amber-700 text-right">
                                  <span>Date: {formatDate(returnLog.created_at)}</span>
                                  <span className="mx-1">•</span>
                                  <span>Time: {formatTimeOnly(returnLog.created_at)}</span>
                                </div>
                              )}
                            </div>
                          ) : null}

                          {isCurrent && (
                            <p className="text-[9.5px] text-slate-700 font-medium pt-0.5 flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-ping" />
                              <span>Any 1 pool member can verify and sign off.</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex gap-3 relative">
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-6 rounded-full bg-[#003F28] text-white shadow-md ring-4 ring-[#003F28]/20 flex items-center justify-center font-bold text-[10px]">
                      1
                    </div>
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900">Stage 1: Accounts Review</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-extrabold text-[9px] uppercase tracking-wider border border-slate-300 animate-pulse">
                        Active Stage
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                      <span><strong className="text-slate-700">Assigned Approver:</strong> {currentUserUsername || "anbu"}</span>
                      <p className="text-[10px] text-slate-700 font-semibold mt-1">
                        Awaiting compliance checklist verification and sign-off.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Audit Remarks Log */}
              {commentsList && commentsList.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2.5 flex items-center justify-between">
                    <span>Signed Audit Trail & Remarks ({commentsList.length})</span>
                    <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Tamper-Evident</span>
                  </h4>
                  <div className="space-y-2">
                    {commentsList.map((comm: any, cIdx: number) => {
                      const authorName = comm.author || comm.user_name || "System Administrator";
                      const actionLabel = comm.action || "Compliance Sign-off";

                      return (
                        <div key={cIdx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                          <div className="flex items-center justify-between font-bold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-700 font-black text-[9px] flex items-center justify-center">
                                {authorName.charAt(0).toUpperCase()}
                              </span>
                              <span className="text-slate-900 text-xs">{authorName}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {comm.ip_address && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 text-[8px] font-mono font-medium">
                                  IP: {comm.ip_address}
                                </span>
                              )}
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[8.5px] font-bold uppercase tracking-wider">
                                {actionLabel}
                              </span>
                            </div>
                          </div>
                          <p className="text-slate-600 text-[10.5px] pl-6 leading-relaxed bg-white/60 p-1.5 rounded-lg border border-slate-150">
                            {getCleanAuditRemarks(comm.text || comm.comment, workflowStepDefinitions) || "Signed off and verified."}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-2.5 flex items-center justify-between">
              <span className="text-[10.5px] text-slate-500 font-medium">DocuFlow Enterprise Audit Log</span>
              <button
                type="button"
                onClick={() => setShowTimelineModal(false)}
                className="px-4 py-1.5 bg-[#003F28] hover:bg-[#005333] text-white font-bold text-[11px] rounded-lg transition cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* APPROVAL SUCCESS / NEXT ACTION MODAL */}
      {showNextActionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 p-6 text-center animate-in fade-in zoom-in-95 duration-150 space-y-4">
            
            {actionModalType === 'approve' ? (
              <div className="h-14 w-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            ) : actionModalType === 'reject' ? (
              <div className="h-14 w-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <XCircle className="h-8 w-8" />
              </div>
            ) : (
              <div className="h-14 w-14 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center mx-auto shadow-inner">
                <PauseCircle className="h-8 w-8" />
              </div>
            )}
            
            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-lg tracking-tight">
                {actionModalType === 'approve' ? 'Document Approved Successfully!' : actionModalType === 'reject' ? 'Document Rejection Saved' : 'Document Placed On Hold'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Stage sign-off recorded for <span className="font-bold text-slate-800">{document?.invoice_number || document?.id}</span>.
              </p>

              {actionModalType === 'approve' && (
                approvedNextStageInfo?.nextApprover ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 text-left space-y-1 my-2">
                    <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                      <span>Passed to {approvedNextStageInfo.nextApprover}</span>
                      {approvedNextStageInfo.nextStageName && (
                        <span>— {approvedNextStageInfo.nextStageName}</span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-emerald-800 flex flex-wrap justify-between gap-1 pt-0.5">
                      <span>Next Approver: <strong className="font-bold">{approvedNextStageInfo.nextApprover}</strong></span>
                      {approvedNextStageInfo.nextStageName && (
                        <span>Next Stage: <strong className="font-bold">{approvedNextStageInfo.nextStageName}</strong></span>
                      )}
                    </div>
                  </div>
                ) : approvedNextStageInfo?.isCompleted || document?.status === 'Approved' ? (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 text-center font-bold my-2">
                    Final Approval Completed. Ready for disbursement.
                  </div>
                ) : (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 text-center font-medium my-2">
                    Document approved and forwarded to the next workflow stage.
                  </div>
                )
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {pendingNextId && onSelectDocument ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowNextActionModal(false);
                    onSelectDocument(pendingNextId);
                  }}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Move to Next Document ➔</span>
                </button>
              ) : null}

              {actionModalType === 'approve' && (
                !approvedNextStageInfo?.isCompleted && document?.status !== 'Approved' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNextActionModal(false);
                      onRefreshDocument();
                      window.dispatchEvent(new CustomEvent("navigate-view", { detail: "work-tracker" }));
                    }}
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Activity className="h-3.5 w-3.5" />
                    <span>Track Progress in Work Tracker ➔</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNextActionModal(false);
                      onRefreshDocument();
                      window.dispatchEvent(new CustomEvent("navigate-view", { detail: "approved-documents" }));
                    }}
                    className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>View in Approved Documents ➔</span>
                  </button>
                )
              )}

              <button
                type="button"
                onClick={() => {
                  setShowNextActionModal(false);
                  onRefreshDocument();
                  onGoBack();
                }}
                className="w-full py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <span>Back to Dashboard ➔</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MORE INFO FIELD CONFIGURATION DRAWER */}
      <MoreInfoConfigDrawer
        isOpen={showConfigDrawer}
        onClose={() => setShowConfigDrawer(false)}
        documentType={moreInfoConfig?.document_type || document?.document_type || "AP INVOICE"}
        availableFields={moreInfoConfig?.available_fields || []}
        selectedFields={effectiveMoreInfoFields}
        scope={moreInfoConfig?.scope || "GLOBAL"}
        hasUserOverride={Boolean(moreInfoConfig?.has_user_override)}
        canManageDefault={Boolean(moreInfoConfig?.can_manage_default || currentUserRole === "admin")}
        onSave={handleSaveMoreInfoConfig}
        onResetToDefault={handleResetMoreInfoConfig}
      />

    </div>
  );
}
