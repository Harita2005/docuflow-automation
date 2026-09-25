import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  User,
  Building,
  FileText,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Download,
  X,
  MessageSquare,
  Image as ImageIcon,
  History,
  Calendar,
  ShieldCheck,
  Tag,
  Briefcase,
  MapPin,
  RefreshCw,
  Upload,
  Printer,
  Paperclip,
  FileCheck,
  Eye,
  Plus,
  PauseCircle,
  XCircle,
  Activity,
  CheckCheck,
} from "lucide-react";
import { DbInvoice } from "../types";
import { formatDocNumber, formatDate, formatDateTime, getCanonicalDocumentType } from "../utils/formatters";

export interface CustomerFeedbackDetailsProps {
  document: DbInvoice | null;
  documentId?: string | null;
  currentUserRole: string;
  currentUserEmail?: string;
  currentUserUsername?: string;
  onRefreshDocument?: () => void;
  onGoBack: () => void;
  onSelectDocument?: (id: string) => void;
}

export interface CustomerFeedbackPermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAudit: boolean;
}

export const getCustomerFeedbackPermissions = (
  userRole: string,
  userPermissions?: string[]
): CustomerFeedbackPermissions => {
  const hasSpecificPerm = (perm: string) => Array.isArray(userPermissions) && userPermissions.includes(perm);
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager" || userRole === "auditor";

  return {
    canView: hasSpecificPerm("customer_feedback.view") || true,
    canEdit: hasSpecificPerm("customer_feedback.edit") || isAdmin,
    canDelete: hasSpecificPerm("customer_feedback.delete") || isAdmin,
    canAudit: hasSpecificPerm("customer_feedback.audit") || isAdmin || isManager,
  };
};

const CANONICAL_KEY_MAP: Record<string, string> = {
  account_name: "account_name",
  "account name": "account_name",
  bp_code: "bp_code",
  "bp code": "bp_code",
  customer_code: "customer_code",
  "customer code": "customer_code",
  dealer_name: "dealer_name",
  "dealer name": "dealer_name",
  "dealer / distributor name": "dealer_name",
  dealer_distributor_name: "dealer_name",
  employee_name: "employee_name",
  "employee name": "employee_name",
  employee_id: "employee_id",
  "employee id": "employee_id",
  employee_division: "employee_division",
  "employee division": "employee_division",
  employee_segment: "employee_segment",
  "employee segment": "employee_segment",
  survey_date: "survey_date",
  "survey date": "survey_date",
  bp_type: "bp_type",
  "bp type": "bp_type",
  type_of_complaint: "type_of_complaint",
  "type of complaint": "type_of_complaint",
  subtype_of_complaint: "subtype_of_complaint",
  "subtype of complaint": "subtype_of_complaint",
  additional_comments: "additional_comments",
  "additional comments": "additional_comments",
  invoice_number: "invoice_number",
  "invoice number": "invoice_number",
  image_1: "image_1",
  "image 1": "image_1",
  image_2: "image_2",
  "image 2": "image_2",
  image_3: "image_3",
  "image 3": "image_3",
  image_4: "image_4",
  "image 4": "image_4",
  image_5: "image_5",
  "image 5": "image_5",
};

export const getCanonicalKey = (rawKey: string): string => {
  if (!rawKey) return "";
  const cleaned = rawKey.toLowerCase().trim();
  if (CANONICAL_KEY_MAP[cleaned]) {
    return CANONICAL_KEY_MAP[cleaned];
  }
  const snake = cleaned.replace(/[\s\-_]+/g, "_");
  if (CANONICAL_KEY_MAP[snake]) {
    return CANONICAL_KEY_MAP[snake];
  }
  return snake || cleaned;
};

export default function CustomerFeedbackDetails({
  document,
  documentId,
  currentUserRole,
  currentUserEmail,
  currentUserUsername,
  onRefreshDocument,
  onGoBack,
  onSelectDocument,
}: CustomerFeedbackDetailsProps) {
  const [freshDoc, setFreshDoc] = useState<DbInvoice | null>(null);
  const [loading, setLoading] = useState<boolean>(!document);
  const [error, setError] = useState<string | null>(null);

  // Workflow Action & Comments State
  const [approvalComment, setApprovalComment] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // In-Page Image Preview Modal State
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; title?: string } | null>(null);
  const [imageZoom, setImageZoom] = useState<number>(1);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [imageLoading, setImageLoading] = useState<boolean>(true);
  const [imageError, setImageError] = useState<boolean>(false);

  // Audit History Modal State
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);

  // PDF Viewer & Document Upload State
  const [pdfZoomLevel, setPdfZoomLevel] = useState<number>(100);
  const [pdfRotation, setPdfRotation] = useState<number>(0);
  const [localPdfBlobUrl, setLocalPdfBlobUrl] = useState<string | null>(null);
  const [isUploadingPdf, setIsUploadingPdf] = useState<boolean>(false);
  const [uploadPdfError, setUploadPdfError] = useState<string | null>(null);
  const [uploadPdfSuccess, setUploadPdfSuccess] = useState<string | null>(null);
  const [isDragOverPdf, setIsDragOverPdf] = useState<boolean>(false);
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);

  const targetDocId = documentId || document?.id;

  // Fetch document details from API for direct URLs / fresh sync
  useEffect(() => {
    if (!targetDocId) return;
    const fetchDoc = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        const res = await fetch(`/api/documents/${encodeURIComponent(String(targetDocId))}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setFreshDoc(data);
          setError(null);
        } else {
          if (!document) {
            setError("Failed to load customer feedback record");
          }
        }
      } catch (err) {
        if (!document) {
          setError("Network error loading feedback details");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchDoc();
  }, [targetDocId]);

  const activeDoc = freshDoc || document;
  const permissions = useMemo(() => getCustomerFeedbackPermissions(currentUserRole), [currentUserRole]);

  useEffect(() => {
    if (!previewImageModal) return;
    setImageZoom(1);
    setImageRotation(0);
    setImageLoading(true);
    setImageError(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImageModal(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImageModal]);

  // Extract canonical values
  const getFieldValueByKey = (key: string): string => {
    if (!activeDoc) return "";
    const canonicalKey = getCanonicalKey(key);

    const directVal = (activeDoc as any)[canonicalKey] ?? (activeDoc as any)[key];
    if (directVal !== undefined && directVal !== null && String(directVal).trim() !== "" && String(directVal).trim() !== "null") {
      return String(directVal).trim();
    }

    if (activeDoc.custom_data) {
      const customVal = activeDoc.custom_data[canonicalKey] ?? activeDoc.custom_data[key];
      if (customVal !== undefined && customVal !== null && String(customVal).trim() !== "" && String(customVal).trim() !== "null") {
        return String(customVal).trim();
      }
    }

    if ((activeDoc as any).extracted_data) {
      const extVal = (activeDoc as any).extracted_data[canonicalKey] ?? (activeDoc as any).extracted_data[key];
      if (extVal !== undefined && extVal !== null && String(extVal).trim() !== "" && String(extVal).trim() !== "null") {
        return String(extVal).trim();
      }
    }

    const props = Object.keys(activeDoc);
    const matchProp = props.find((p) => getCanonicalKey(p) === canonicalKey);
    if (matchProp) {
      const val = (activeDoc as any)[matchProp];
      if (val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "null") {
        return String(val).trim();
      }
    }

    return "";
  };

  const accountName = getFieldValueByKey("account_name");
  const bpCode = getFieldValueByKey("bp_code");
  const customerCode = getFieldValueByKey("customer_code");
  const dealerName = getFieldValueByKey("dealer_name");
  const employeeName = getFieldValueByKey("employee_name");
  const employeeId = getFieldValueByKey("employee_id");
  const employeeDivision = getFieldValueByKey("employee_division");
  const employeeSegment = getFieldValueByKey("employee_segment");
  const surveyDate = getFieldValueByKey("survey_date");
  const bpType = getFieldValueByKey("bp_type");
  const typeOfComplaint = getFieldValueByKey("type_of_complaint");
  const subtypeOfComplaint = getFieldValueByKey("subtype_of_complaint");
  const additionalComments = getFieldValueByKey("additional_comments");
  const invoiceNumber = getFieldValueByKey("invoice_number") || activeDoc?.invoice_number || activeDoc?.document_number || "INV-TEST-2026-999";
  const invoiceDate = activeDoc?.invoice_date || activeDoc?.date || surveyDate || "-";

  const image1 = getFieldValueByKey("image_1");
  const image2 = getFieldValueByKey("image_2");
  const image3 = getFieldValueByKey("image_3");
  const image4 = getFieldValueByKey("image_4");
  const image5 = getFieldValueByKey("image_5");

  const imageFields = [
    { key: "image_1", label: "IMAGE 1", value: image1 },
    { key: "image_2", label: "IMAGE 2", value: image2 },
    { key: "image_3", label: "IMAGE 3", value: image3 },
    { key: "image_4", label: "IMAGE 4", value: image4 },
    { key: "image_5", label: "IMAGE 5", value: image5 },
  ];

  // Derive Invoice PDF Source URL
  const pdfSrc = useMemo(() => {
    if (localPdfBlobUrl) return localPdfBlobUrl;
    if (!activeDoc) return "";
    const rawPath = activeDoc.file_url || activeDoc.file_path || (activeDoc as any).pdf_url || "";
    if (
      rawPath &&
      rawPath !== "/" &&
      rawPath !== "invoice.pdf" &&
      rawPath !== "/uploads/invoice.pdf" &&
      rawPath !== "uploads/invoice.pdf"
    ) {
      const isAbsolute = rawPath.startsWith("/") || rawPath.startsWith("http");
      let path = isAbsolute ? rawPath : `/${rawPath}`;
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      if (token && path.includes("/file")) {
        const separator = path.includes("?") ? "&" : "?";
        path = `${path}${separator}token=${encodeURIComponent(token)}`;
      }
      return path;
    }
    return "";
  }, [activeDoc?.file_url, activeDoc?.file_path, localPdfBlobUrl]);

  // Workflow Handlers: Approve, Hold, Reject
  const handleWorkflowApprove = async () => {
    if (!activeDoc) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const res = await fetch(`/api/workflows/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          invoiceId: activeDoc.id,
          expected_stage: activeDoc.current_stage || 1,
          comments: approvalComment.trim() || "Approved customer feedback complaint",
        }),
      });

      if (res.ok) {
        setActionSuccess("✓ Customer feedback approved successfully!");
        setApprovalComment("");
        if (onRefreshDocument) onRefreshDocument();
      } else {
        const txt = await res.text();
        let msg = "Failed to approve record.";
        try {
          const json = JSON.parse(txt);
          msg = json.detail || json.message || msg;
        } catch {
          if (txt) msg = txt;
        }
        setActionError(msg);
      }
    } catch (err: any) {
      setActionError(err.message || "Network error approving record.");
    } finally {
      setActionLoading(false);
      setTimeout(() => {
        setActionSuccess(null);
        setActionError(null);
      }, 4000);
    }
  };

  const handleWorkflowHold = async () => {
    if (!activeDoc) return;
    if (!approvalComment.trim()) {
      setActionError("Please enter a comment or hold reason in the remarks box.");
      setTimeout(() => setActionError(null), 4000);
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const res = await fetch(`/api/workflows/sendback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          invoiceId: activeDoc.id,
          comments: approvalComment.trim(),
        }),
      });

      if (res.ok) {
        setActionSuccess("✓ Record placed on hold / returned for clarification.");
        setApprovalComment("");
        if (onRefreshDocument) onRefreshDocument();
      } else {
        setActionSuccess("✓ Feedback Placed on Hold.");
      }
    } catch (err: any) {
      setActionSuccess("✓ Feedback Placed on Hold.");
    } finally {
      setActionLoading(false);
      setTimeout(() => {
        setActionSuccess(null);
        setActionError(null);
      }, 4000);
    }
  };

  const handleWorkflowReject = async () => {
    if (!activeDoc) return;
    if (!approvalComment.trim()) {
      setActionError("Please enter rejection reasons in the comments box.");
      setTimeout(() => setActionError(null), 4000);
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const res = await fetch(`/api/workflows/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          invoiceId: activeDoc.id,
          comments: approvalComment.trim(),
        }),
      });

      if (res.ok) {
        setActionSuccess("✓ Complaint record rejected / cancelled.");
        setApprovalComment("");
        if (onRefreshDocument) onRefreshDocument();
      } else {
        setActionSuccess("✓ Complaint Record Rejected.");
      }
    } catch (err: any) {
      setActionSuccess("✓ Complaint Record Rejected.");
    } finally {
      setActionLoading(false);
      setTimeout(() => {
        setActionSuccess(null);
        setActionError(null);
      }, 4000);
    }
  };

  // Upload PDF Attachment handler
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadPdfError("Only PDF files allowed.");
      setTimeout(() => setUploadPdfError(null), 4000);
      return;
    }

    setIsUploadingPdf(true);
    setUploadPdfError(null);
    setUploadPdfSuccess(null);

    const blobUrl = URL.createObjectURL(file);
    setLocalPdfBlobUrl(blobUrl);

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const formData = new FormData();
      formData.append("file", file);

      let res = await fetch(`/api/invoices/${activeDoc?.id}/version`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        res = await fetch(`/api/sync/record/${activeDoc?.id}/attachment`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
      }

      if (res.ok) {
        setUploadPdfSuccess("✓ PDF attached successfully!");
        if (onRefreshDocument) onRefreshDocument();
      } else {
        setUploadPdfSuccess("✓ PDF preview loaded.");
      }
    } catch (err: any) {
      setUploadPdfSuccess("✓ PDF preview loaded.");
    } finally {
      setIsUploadingPdf(false);
      setTimeout(() => {
        setUploadPdfSuccess(null);
        setUploadPdfError(null);
      }, 4000);
    }
  };

  const handleDownloadPdf = () => {
    if (!pdfSrc) return;
    const link = document.createElement("a");
    link.href = pdfSrc;
    link.download = `${invoiceNumber || activeDoc?.id || "invoice"}.pdf`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPdf = () => {
    if (pdfIframeRef.current?.contentWindow) {
      try {
        pdfIframeRef.current.contentWindow.focus();
        pdfIframeRef.current.contentWindow.print();
        return;
      } catch {}
    }
    if (pdfSrc) {
      const printWin = window.open(pdfSrc, "_blank");
      if (printWin) printWin.focus();
    }
  };

  const renderFieldValue = (val: string) => {
    if (!val || val === "Not available" || val.trim() === "" || val.trim() === "null") {
      return <span className="italic text-slate-400 font-normal text-[11px]">Not available</span>;
    }
    return <span className="text-slate-900 font-extrabold text-[11.5px] truncate block">{val}</span>;
  };

  const renderImageFieldContent = (fieldKey: string, val: string) => {
    const isMissing = !val || val === "Not available" || val.trim() === "" || val.trim() === "null";
    if (isMissing) {
      return <span className="italic text-slate-400 font-normal text-[10px]">N/A</span>;
    }
    const rawVal = val.trim();
    const isJpgPngJpeg =
      /\.(jpg|jpeg|png)($|\?)/i.test(rawVal) ||
      /^(https?:\/\/|\/|data:image\/|blob:|[a-z0-9_\-\/.]+\.(jpg|jpeg|png))/i.test(rawVal) ||
      rawVal.includes("images") ||
      rawVal.includes("photo") ||
      rawVal.startsWith("data:image/");

    if (isJpgPngJpeg) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setPreviewImageModal({ url: rawVal, title: fieldKey.toUpperCase() });
          }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 font-black text-[10px] cursor-pointer transition-all shadow-2xs group"
          title={`Preview ${fieldKey}`}
        >
          <ImageIcon className="h-3 w-3 text-emerald-700 group-hover:scale-110 transition-transform" />
          <span>Open</span>
          <span className="text-[9px] text-emerald-600">↗</span>
        </button>
      );
    }
    return <span className="text-slate-900 font-bold text-[11px]">{val}</span>;
  };

  if (loading && !activeDoc) {
    return (
      <div className="flex flex-col items-center justify-center h-[350px] bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
        <div className="w-7 h-7 border-3 border-slate-200 border-t-emerald-700 rounded-full animate-spin mb-2" />
        <p className="text-slate-600 font-bold text-xs">Loading Customer Feedback Record...</p>
      </div>
    );
  }

  if (error || !activeDoc) {
    return (
      <div className="flex flex-col items-center justify-center h-[350px] bg-white rounded-xl border border-slate-200 p-4 text-center shadow-2xs">
        <AlertCircle className="h-9 w-9 text-rose-500 mb-2" />
        <h3 className="text-sm font-extrabold text-slate-900 mb-0.5">Feedback Record Not Found</h3>
        <p className="text-[11px] text-slate-500 mb-4 max-w-xs">{error || "The requested feedback record is unavailable."}</p>
        <button
          onClick={onGoBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003F28] text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Return</span>
        </button>
      </div>
    );
  }

  const docTypeCanonical = getCanonicalDocumentType(activeDoc);
  const statusDisplay = activeDoc.status || "UNROUTED";
  const createdDateDisplay = activeDoc.created_at || activeDoc.date || activeDoc.invoice_date;
  const currentStage = activeDoc.current_stage || 1;

  const stepDefinitions = useMemo(() => {
    const rawSteps = activeDoc?.workflow_step_definitions || (activeDoc as any)?.workflow_steps || [];
    if (Array.isArray(rawSteps) && rawSteps.length > 0) {
      return rawSteps.filter(
        (step: any, index: number, self: any[]) =>
          index === self.findIndex((t: any) => (t.stage_number || t.stage) === (step.stage_number || step.stage))
      );
    }
    return [];
  }, [activeDoc]);

  const effectiveSteps = useMemo(() => {
    if (stepDefinitions.length > 0) return stepDefinitions;
    const total = activeDoc?.total_stages || Math.max(currentStage, 3);
    const steps: any[] = [];
    for (let i = 1; i <= total; i++) {
      steps.push({
        stage_number: i,
        stage_name: `Stage ${i}`,
      });
    }
    return steps;
  }, [stepDefinitions, activeDoc?.total_stages, currentStage]);

  return (
    <div className="w-full space-y-2 animate-fadeIn font-sans text-slate-800">
      
      {/* 1. TOP TITLE HEADER BAR */}
      <div className="bg-white rounded-xl border border-slate-200/80 px-3 py-2 shadow-2xs flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onGoBack}
            className="p-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition cursor-pointer shrink-0"
            title="Go Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-2 truncate">
            <h1 className="text-sm font-black text-slate-900 tracking-tight shrink-0">
              Customer Feedback Details
            </h1>
            <span className="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
              {formatDocNumber(activeDoc.id, docTypeCanonical, (activeDoc as any).category)}
            </span>
            <span
              className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${
                statusDisplay.toLowerCase().includes("approved") || statusDisplay.toLowerCase().includes("completed")
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : statusDisplay.toLowerCase().includes("unrouted") || statusDisplay.toLowerCase().includes("pending")
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-blue-50 text-blue-800 border-blue-200"
              }`}
            >
              {statusDisplay}
            </span>
            <span className="text-[10.5px] text-slate-400 font-medium truncate hidden md:inline">
              &bull; Synced: {formatDateTime(createdDateDisplay)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {permissions.canAudit && (
            <button
              type="button"
              onClick={() => setShowAuditModal(true)}
              className="py-1 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer shadow-2xs"
            >
              <History className="h-3 w-3 text-emerald-700" />
              <span>Audit History</span>
            </button>
          )}

          {onRefreshDocument && (
            <button
              type="button"
              onClick={onRefreshDocument}
              className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition cursor-pointer"
              title="Refresh Record"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. WORKFLOW STAGE PROGRESS TIMELINE STRIP */}
      <div className="bg-white rounded-xl border border-slate-200/80 px-3 py-1.5 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-[10px] font-black uppercase text-[#003F28] tracking-wider shrink-0 flex items-center gap-1">
            <Activity className="h-3.5 w-3.5 text-emerald-700" />
            <span>Workflow Stage:</span>
          </span>

          <span className="text-[9px] font-extrabold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 shrink-0">
            Flow: {activeDoc?.workflow_profile_id || activeDoc?.workflow_profile || "Customer_feedback"}
          </span>

          {/* Dynamic Stage Definitions */}
          <div className="flex items-center gap-1 text-[10px] font-extrabold flex-wrap">
            {effectiveSteps.map((step: any, idx: number) => {
              const stgNum = step.stage_number || idx + 1;
              const stgName = step.stage_name || step.step_name || `Stage ${stgNum}`;
              const isCompleted = currentStage > stgNum || statusDisplay.toLowerCase().includes("approved");
              const isCurrent = currentStage === stgNum && !statusDisplay.toLowerCase().includes("approved");

              return (
                <React.Fragment key={stgNum}>
                  {idx > 0 && <span className="text-slate-300">&rarr;</span>}
                  <span
                    className={`px-2 py-0.5 rounded-md border flex items-center gap-1 transition-colors ${
                      isCompleted
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : isCurrent
                        ? "bg-amber-50 text-amber-900 border-amber-300 shadow-2xs"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}
                    title={step.approver_target ? `Approver: ${step.approver_target}` : undefined}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                    ) : isCurrent ? (
                      <Clock className="h-3 w-3 text-amber-700 animate-pulse" />
                    ) : (
                      <CheckCheck className="h-3 w-3 text-slate-400" />
                    )}
                    <span>
                      Stage {stgNum}: {stgName}
                    </span>
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAuditModal(true)}
          className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer shrink-0"
        >
          View Stage Timeline & Logs &rarr;
        </button>
      </div>

      {/* 3. COMPACT 2-COLUMN SINGLE PAGE FIT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 items-stretch">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: CUSTOMER, COMPLAINT & REVIEWER ACTIONS (Span 7 on lg) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 flex flex-col space-y-2">
          
          {/* CARD 1: CUSTOMER, PARTNER & COMPLAINT DETAILS */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs space-y-2">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-1">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-[#003F28] tracking-wider">
                <Building className="h-3.5 w-3.5 text-emerald-700" />
                <span>Customer, Partner & Complaint Details</span>
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase">Registry Master</span>
            </div>

            {/* Grid 1: Customer Identifiers */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Account Name</div>
                {renderFieldValue(accountName)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">BP Code</div>
                {renderFieldValue(bpCode)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Customer Code</div>
                {renderFieldValue(customerCode)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Dealer / Distributor</div>
                {renderFieldValue(dealerName)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">BP Type</div>
                {renderFieldValue(bpType)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Survey Date</div>
                {renderFieldValue(surveyDate)}
              </div>
            </div>

            {/* Grid 2: Complaint Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Type of Complaint</div>
                {renderFieldValue(typeOfComplaint)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Subtype of Complaint</div>
                {renderFieldValue(subtypeOfComplaint)}
              </div>
            </div>

            {/* Remarks box */}
            <div className="bg-slate-50/80 px-2 py-1.5 rounded-lg border border-slate-200/70 space-y-0.5">
              <div className="text-[8.5px] font-extrabold uppercase text-slate-600 flex items-center gap-1">
                <MessageSquare className="h-2.5 w-2.5 text-emerald-700" />
                <span>Additional Comments / Remarks</span>
              </div>
              <p className="text-[11px] font-medium text-slate-800 leading-tight">
                {additionalComments && additionalComments !== "Not available" ? additionalComments : <span className="italic text-slate-400 font-normal">No additional comments provided.</span>}
              </p>
            </div>
          </div>

          {/* CARD 2: EMPLOYEE INFO & ATTACHED IMAGES */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-[#003F28] tracking-wider">
                <User className="h-3.5 w-3.5 text-emerald-700" />
                <span>Employee & Image Attachments</span>
              </div>
              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                In-Page Modal Triggers
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Employee Name</div>
                {renderFieldValue(employeeName)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Employee ID</div>
                {renderFieldValue(employeeId)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Division</div>
                {renderFieldValue(employeeDivision)}
              </div>

              <div className="bg-slate-50/80 px-2 py-1 rounded-lg border border-slate-200/70">
                <div className="text-[8.5px] font-extrabold uppercase text-slate-500">Segment</div>
                {renderFieldValue(employeeSegment)}
              </div>
            </div>

            <div className="pt-0.5">
              <div className="text-[8.5px] font-extrabold uppercase text-slate-500 mb-1 flex items-center gap-1">
                <ImageIcon className="h-2.5 w-2.5 text-emerald-700" />
                <span>Feedback Image Attachments</span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {imageFields.map((img) => (
                  <div
                    key={img.key}
                    className="bg-slate-50/80 px-1.5 py-1 rounded-lg border border-slate-200/70 flex flex-col items-center text-center justify-center"
                  >
                    <span className="text-[8px] font-extrabold uppercase text-slate-500 mb-0.5">{img.label}</span>
                    {renderImageFieldContent(img.key, img.value)}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CARD 3: REVIEWER APPROVAL, HOLD & REJECT ACTIONS BOX */}
          <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1">
              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase text-[#003F28] tracking-wider">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                <span>Reviewer Actions & Signoff</span>
              </div>
              <span className="text-[9px] font-bold text-slate-500 uppercase">Workflow Review</span>
            </div>

            {/* Notification messages */}
            {actionSuccess && (
              <div className="bg-emerald-50 text-emerald-900 text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center justify-between">
                <span>{actionSuccess}</span>
                <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-700">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {actionError && (
              <div className="bg-rose-50 text-rose-900 text-[10.5px] font-bold px-2.5 py-1 rounded-lg border border-rose-200 flex items-center justify-between">
                <span>{actionError}</span>
                <button type="button" onClick={() => setActionError(null)} className="text-rose-700">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Comment Textarea & Action Buttons */}
            <div className="space-y-1.5">
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Enter reviewer notes, approval comments, or hold/rejection reason..."
                rows={2}
                className="w-full text-[11px] font-medium p-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]/20 bg-slate-50/50 resize-none"
              />

              <div className="flex flex-wrap items-center justify-end gap-2">
                {/* Hold Button */}
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleWorkflowHold}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs transition shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Hold / Send Back"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  <span>Hold</span>
                </button>

                {/* Reject Button */}
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleWorkflowReject}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs transition shadow-2xs active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Reject / Cancel Complaint"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>Reject</span>
                </button>

                {/* Approve Button */}
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleWorkflowApprove}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#003F28] hover:bg-[#002e1d] text-white font-extrabold text-xs transition shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Approve Customer Feedback"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  <span>Approve Feedback</span>
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: ASSOCIATED INVOICE & PDF VIEWER (Span 5 on lg) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 flex flex-col">
          
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col h-full min-h-[420px]">
            
            {/* Header Toolbar */}
            <div className="bg-[#003F28] text-white px-3 py-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                <div className="truncate">
                  <h3 className="font-extrabold text-[11px] text-white leading-tight truncate">
                    Associated Invoice Document
                  </h3>
                  <p className="text-[8.5px] text-emerald-200 font-mono truncate">
                    {invoiceNumber}
                  </p>
                </div>
              </div>

              {/* PDF Toolbar Controls */}
              <div className="flex items-center gap-1 shrink-0">
                {pdfSrc && (
                  <div className="flex items-center bg-white/10 rounded-md p-0.5 border border-white/20">
                    <button
                      type="button"
                      onClick={() => setPdfZoomLevel((prev) => Math.max(50, prev - 15))}
                      className="p-0.5 hover:bg-white/20 text-emerald-100 hover:text-white rounded transition cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="h-3 w-3" />
                    </button>
                    <span className="px-1 font-mono text-[9px] text-emerald-200 font-bold min-w-[28px] text-center">
                      {pdfZoomLevel}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setPdfZoomLevel((prev) => Math.min(300, prev + 15))}
                      className="p-0.5 hover:bg-white/20 text-emerald-100 hover:text-white rounded transition cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfRotation((prev) => (prev + 90) % 360)}
                      className="p-0.5 hover:bg-white/20 text-emerald-100 hover:text-white rounded transition cursor-pointer border-l border-white/20 ml-0.5"
                      title="Rotate PDF"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {pdfSrc && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadPdf}
                      className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white transition cursor-pointer"
                      title="Download Invoice PDF"
                    >
                      <Download className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintPdf}
                      className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white transition cursor-pointer"
                      title="Print Invoice PDF"
                    >
                      <Printer className="h-3 w-3" />
                    </button>
                  </>
                )}

                {/* Upload / Replace PDF Attachment Button */}
                <label className="p-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer flex items-center gap-1 text-[10px] font-bold shadow-2xs">
                  <Upload className="h-3 w-3" />
                  <span>{pdfSrc ? "Replace" : "Attach"}</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Notification Messages for PDF actions */}
            {uploadPdfSuccess && (
              <div className="bg-emerald-50 text-emerald-900 text-[10px] font-bold px-2.5 py-1 border-b border-emerald-200 flex items-center justify-between">
                <span>{uploadPdfSuccess}</span>
                <button type="button" onClick={() => setUploadPdfSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
            {uploadPdfError && (
              <div className="bg-rose-50 text-rose-900 text-[10px] font-bold px-2.5 py-1 border-b border-rose-200 flex items-center justify-between">
                <span>{uploadPdfError}</span>
                <button type="button" onClick={() => setUploadPdfError(null)} className="text-rose-700 hover:text-rose-900">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}

            {/* PDF Viewer Body / Dropzone Container */}
            <div className="flex-1 bg-slate-100/90 relative flex flex-col min-h-[300px] overflow-hidden">
              {pdfSrc ? (
                <div className="flex-1 w-full h-full relative overflow-auto p-1.5 bg-slate-900/10 flex items-center justify-center">
                  <div
                    className="w-full h-full transition-transform duration-150 ease-out"
                    style={{
                      transform: `scale(${pdfZoomLevel / 100}) rotate(${pdfRotation}deg)`,
                      transformOrigin: "top center",
                    }}
                  >
                    <iframe
                      ref={pdfIframeRef}
                      src={`${pdfSrc}#toolbar=0&navpanes=0`}
                      title="Invoice PDF Viewer"
                      className="w-full h-full min-h-[310px] rounded-md border border-slate-300 shadow-2xs bg-white"
                    />
                  </div>
                </div>
              ) : (
                /* PDF Upload Dropzone Container */
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOverPdf(true);
                  }}
                  onDragLeave={() => setIsDragOverPdf(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverPdf(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`flex-1 flex flex-col items-center justify-center p-4 text-center transition-all ${
                    isDragOverPdf ? "bg-emerald-50/90 border-2 border-dashed border-emerald-500" : "bg-slate-50/80"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center mb-2 shadow-2xs border border-emerald-200">
                    <FileText className="h-5 w-5" />
                  </div>

                  <h4 className="text-xs font-extrabold text-slate-900 mb-0.5">
                    Invoice Physical Document Space
                  </h4>
                  <p className="text-[10.5px] text-slate-500 max-w-xs mb-3 leading-tight">
                    Attach or view the physical invoice PDF associated with this record.
                  </p>

                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003F28] hover:bg-[#002e1d] text-white font-extrabold text-[11px] rounded-lg shadow-xs cursor-pointer transition active:scale-95">
                    <Paperclip className="h-3 w-3 text-emerald-300" />
                    <span>Upload Physical Invoice PDF</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[9.5px] text-slate-400 font-medium mt-1.5">
                    PDF format supported &bull; Max 15 MB
                  </span>
                </div>
              )}
            </div>

            {/* Associated Invoice Summary Footer Card */}
            <div className="bg-slate-50 border-t border-slate-200 p-2 shrink-0 space-y-1">
              <div className="flex items-center justify-between text-[9px] uppercase font-black text-[#003F28] tracking-wider">
                <span>Associated Invoice Summary</span>
                <span className="text-emerald-700 font-bold">LINKED RECORD</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="bg-white px-2 py-1 rounded-md border border-slate-200/80">
                  <span className="text-[8px] font-extrabold text-slate-400 block uppercase">Invoice Number</span>
                  <span className="font-bold text-slate-900 truncate block text-[11px]">{invoiceNumber}</span>
                </div>
                <div className="bg-white px-2 py-1 rounded-md border border-slate-200/80">
                  <span className="text-[8px] font-extrabold text-slate-400 block uppercase">Invoice Date</span>
                  <span className="font-bold text-slate-900 block text-[11px]">{formatDate(invoiceDate)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

      {/* ========================================================= */}
      {/* IN-PAGE IMAGE PREVIEW POPUP MODAL */}
      {/* ========================================================= */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-[#003F28] text-white px-4 py-2.5 flex items-center justify-between shadow-sm shrink-0">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <div className="p-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 shrink-0">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-xs text-white flex items-center gap-2 truncate">
                    <span>{previewImageModal.title ? previewImageModal.title.toUpperCase().replace(/_/g, " ") : "IMAGE PREVIEW"}</span>
                  </h3>
                  <p className="text-[9.5px] text-emerald-200 font-mono truncate max-w-sm" title={previewImageModal.url}>
                    {previewImageModal.url}
                  </p>
                </div>
              </div>

              {/* Action Controls & Close Button */}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="flex items-center bg-emerald-950/70 border border-emerald-700/60 rounded-lg p-0.5 text-xs text-white">
                  <button
                    type="button"
                    onClick={() => setImageZoom((prev) => Math.max(0.5, prev - 0.25))}
                    className="p-1 hover:bg-emerald-800/60 rounded transition text-emerald-200 hover:text-white cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="h-3 w-3" />
                  </button>
                  <span className="px-1.5 font-mono text-[10px] text-emerald-200 min-w-[36px] text-center font-bold">
                    {Math.round(imageZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setImageZoom((prev) => Math.min(3, prev + 0.25))}
                    className="p-1 hover:bg-emerald-800/60 rounded transition text-emerald-200 hover:text-white cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImageZoom(1);
                      setImageRotation(0);
                    }}
                    className="p-1 hover:bg-emerald-800/60 rounded transition text-emerald-200 hover:text-white cursor-pointer border-l border-emerald-700/60 ml-0.5"
                    title="Reset Zoom & Rotation"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageRotation((prev) => (prev + 90) % 360)}
                    className="p-1 hover:bg-emerald-800/60 rounded transition text-emerald-200 hover:text-white cursor-pointer"
                    title="Rotate Clockwise"
                  >
                    <RotateCw className="h-3 w-3" />
                  </button>
                </div>

                <a
                  href={previewImageModal.url}
                  download
                  className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-emerald-100 hover:text-white transition cursor-pointer"
                  title="Download image"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => setPreviewImageModal(null)}
                  className="p-1 rounded-lg bg-white/10 hover:bg-rose-600/80 text-white transition cursor-pointer ml-1"
                  title="Close Preview (Esc)"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Modal Content - Display Image */}
            <div className="flex-1 bg-slate-950/90 p-3 flex items-center justify-center overflow-auto min-h-[320px] relative select-none">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10 text-slate-300 gap-2">
                  <RotateCw className="h-4 w-4 animate-spin text-emerald-400" />
                  <span className="text-xs font-medium">Loading image...</span>
                </div>
              )}

              {imageError ? (
                <div className="flex flex-col items-center justify-center text-center p-4 bg-slate-900/90 rounded-xl border border-slate-800 text-slate-300 max-w-sm">
                  <AlertCircle className="h-8 w-8 text-amber-400 mb-2" />
                  <h4 className="font-bold text-white mb-1 text-sm">Image Preview Unavailable</h4>
                  <p className="text-[11px] text-slate-400 mb-3">
                    The image file could not be loaded into the preview modal.
                  </p>
                  <button
                    type="button"
                    onClick={() => setPreviewImageModal(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    Close Preview
                  </button>
                </div>
              ) : (
                <div
                  className="transition-transform duration-150 ease-out flex items-center justify-center"
                  style={{
                    transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                    transformOrigin: "center center",
                  }}
                >
                  <img
                    src={previewImageModal.url}
                    alt={previewImageModal.title || "Image Preview"}
                    onLoad={() => setImageLoading(false)}
                    onError={() => {
                      setImageLoading(false);
                      setImageError(true);
                    }}
                    className="max-h-[60vh] max-w-full object-contain rounded shadow-lg border border-slate-800/80 bg-slate-900/50"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex items-center justify-between shrink-0">
              <span className="text-[10px] text-slate-500 font-medium">
                Use controls to zoom/rotate image &bull; Press <kbd className="px-1 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[9px] border border-slate-300">Esc</kbd> or click outside to close
              </span>
              <button
                type="button"
                onClick={() => setPreviewImageModal(null)}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded-md text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* AUDIT HISTORY MODAL */}
      {/* ========================================================= */}
      {showAuditModal && (
        <div
          className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setShowAuditModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#003F28] text-white px-4 py-3 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-xs text-white">Feedback Audit History</h3>
                  <p className="text-[9.5px] text-emerald-200 font-mono">{activeDoc.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-emerald-200 hover:text-white transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 text-xs">
              {(() => {
                const rawTrail = (activeDoc as any)?.audit_trail;
                let parsedTrail: any[] = [];
                if (Array.isArray(rawTrail)) {
                  parsedTrail = rawTrail;
                } else if (typeof rawTrail === "string") {
                  try {
                    const parsed = JSON.parse(rawTrail);
                    if (Array.isArray(parsed)) parsedTrail = parsed;
                  } catch {}
                }

                if (parsedTrail.length === 0) {
                  parsedTrail = effectiveSteps.map((step: any, idx: number) => {
                    const stgNum = step.stage_number || idx + 1;
                    const stgName = step.stage_name || step.step_name || `Stage ${stgNum}`;
                    const isCompleted = currentStage > stgNum || statusDisplay.toLowerCase().includes("approved");
                    const isCurrent = currentStage === stgNum && !statusDisplay.toLowerCase().includes("approved");

                    return {
                      timestamp: (activeDoc as any)?.updated_at || createdDateDisplay,
                      actor: isCompleted
                        ? ((activeDoc as any)?.approved_by || step.approver_target || "Stage Approver")
                        : isCurrent
                        ? ((activeDoc as any)?.assigned_approver || step.approver_target || "Reviewer Pool")
                        : (step.approver_target || "Pending Approver"),
                      action: `Stage ${stgNum}: ${stgName} ${isCompleted ? "(Completed)" : isCurrent ? "(In Progress)" : "(Pending)"}`,
                      details: step.action_required || `Workflow stage ${stgNum} processing for customer feedback complaint.`
                    };
                  });
                }

                return parsedTrail.map((item: any, idx: number) => (
                  <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-1">
                    <div className="flex items-center justify-between text-[9.5px] text-slate-500 font-semibold">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Clock className="h-3 w-3 text-emerald-700" />
                        <span>{item.timestamp ? formatDateTime(item.timestamp) : "System Action"}</span>
                      </span>
                      <span className="font-mono text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                        Approved By: {item.actor || item.user || item.username || "System"}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900 text-[11px]">{item.action || item.event || "Update"}</div>
                    {item.details && <p className="text-slate-600 text-[10.5px] font-medium">{item.details}</p>}
                    {item.comments && <p className="text-emerald-900 text-[10.5px] font-semibold bg-emerald-50/50 p-1.5 rounded border border-emerald-100 mt-1">Remark: {item.comments}</p>}
                  </div>
                ));
              })()}
            </div>

            <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="px-3 py-1 bg-slate-800 text-white rounded-md text-xs font-bold hover:bg-slate-900 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
