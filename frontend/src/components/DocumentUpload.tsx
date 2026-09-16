import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Home,
  FileText,
  Shield,
  Users,
  BarChart2,
  Check,
  ArrowRight,
  ChevronDown,
  X,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Layers,
  Sparkles,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Download,
  Printer
} from "lucide-react";

interface DocumentUploadProps {
  onUploadSuccess: (newDoc: any) => void;
  setCurrentView: (view: string) => void;
  setSelectedDocId: (id: string) => void;
}

const reassuranceSteps = [
  "Initializing document ingestion stream...",
  "Validating document type & policy matrix...",
  "Matching division rules & approval threshold...",
  "Assigning stage approvers & notification triggers...",
  "Generating immutable audit trail record...",
  "Dispatching document to active approval queue..."
];

interface CustomDocType {
  name: string;
  workflow?: string;
  description?: string;
}

export default function DocumentUpload({
  onUploadSuccess,
  setCurrentView,
  setSelectedDocId
}: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMsgIndex, setProgressMsgIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Path A: Staged preview & verification state
  const [extracting, setExtracting] = useState(false);
  const [stagedDoc, setStagedDoc] = useState<{
    tempFileId: string;
    fileName: string;
    fileSize: number;
    previewUrl: string;
    extractedData: any;
  } | null>(null);

  const [verifyForm, setVerifyForm] = useState({
    vendor_name: "",
    invoice_number: "",
    invoice_date: "",
    amount: "",
    base_amount: "",
    tax_amount: "",
    cgst: "",
    sgst: "",
    igst: "",
    vendor_gstin: "",
    po_number: "",
    division: "VCC",
    plant: "MAIN",
    document_type: "AP INVOICE",
    workflow_profile: "auto"
  });

  // PDF Viewer Zoom state for staged preview (Default: 100%, View-only)
  const [previewZoomLevel, setPreviewZoomLevel] = useState(100);

  // Document Type & Workflow Selection
  const [selectedDocType, setSelectedDocType] = useState<string>("AP Invoice");
  const [availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
  const [selectedWorkflowProfile, setSelectedWorkflowProfile] = useState<string>("");
  const [showStagesModal, setShowStagesModal] = useState(false);

  // Custom Document Types state
  const [customDocTypes, setCustomDocTypes] = useState<CustomDocType[]>(() => {
    try {
      const stored = localStorage.getItem("docuflow_custom_doc_types");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Modal: Add New Document Type
  const [showNewDocTypeModal, setShowNewDocTypeModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeWorkflow, setNewTypeWorkflow] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        const res = await fetch("/api/workflows", {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setAvailableWorkflows(data);
            setSelectedWorkflowProfile((prev) => prev || data[0].profile_name);
          }
        }
      } catch (err) {
        console.error("Error loading workflows in upload:", err);
      }
    };
    fetchWorkflows();
  }, []);

  // Direct navigation to Flow Builder canvas in Workflow & Rules Studio
  const handleGoToFlowBuilder = () => {
    localStorage.setItem("workflowActiveTab", "routing");
    localStorage.setItem("adminActiveTab", "routing");
    window.dispatchEvent(new CustomEvent("set-workflow-tab", { detail: "routing" }));
    window.dispatchEvent(new CustomEvent("set-admin-tab", { detail: "routing" }));
    setCurrentView("workflow-rules");
  };

  // Handler for document type change - automatically switches to that type's default workflow
  const handleDocTypeChange = (newType: string) => {
    setSelectedDocType(newType);

    // Check custom doc types first
    const customMatch = customDocTypes.find((c) => c.name.toLowerCase() === newType.toLowerCase());
    if (customMatch?.workflow) {
      setSelectedWorkflowProfile(customMatch.workflow);
      return;
    }

    // Check database workflows
    const matchedFromDb = availableWorkflows.find((w) => {
      const pName = (w.profile_name || "").toLowerCase();
      const target = newType.toLowerCase();
      return pName.includes(target) || (target === "ap invoice" && pName.includes("vcc_purchase"));
    });
    if (matchedFromDb?.profile_name) {
      setSelectedWorkflowProfile(matchedFromDb.profile_name);
      return;
    }

    if (availableWorkflows.length > 0) {
      setSelectedWorkflowProfile(availableWorkflows[0].profile_name);
    }
  };

  // Handler for adding a new document type
  const handleCreateDocType = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTypeName.trim();
    if (!trimmed) return;

    const exists = customDocTypes.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      const newEntry: CustomDocType = {
        name: trimmed,
        workflow: newTypeWorkflow || undefined,
        description: newTypeDesc.trim() || undefined
      };
      const updated = [...customDocTypes, newEntry];
      setCustomDocTypes(updated);
      try {
        localStorage.setItem("docuflow_custom_doc_types", JSON.stringify(updated));
      } catch (err) {
        console.error("Failed to persist custom document types:", err);
      }
    }

    setSelectedDocType(trimmed);
    if (newTypeWorkflow) {
      setSelectedWorkflowProfile(newTypeWorkflow);
    }
    setShowNewDocTypeModal(false);
    setNewTypeName("");
    setNewTypeDesc("");
    setNewTypeWorkflow("");
  };

  // Dynamically resolve the active workflow & its stages based on user selection
  const activeWorkflowData = useMemo(() => {
    let found = null;
    if (selectedWorkflowProfile) {
      found = availableWorkflows.find(
        (w) => w.profile_name === selectedWorkflowProfile || String(w.id) === selectedWorkflowProfile
      );
    }
    if (!found && selectedDocType) {
      const custom = customDocTypes.find((c) => c.name.toLowerCase() === selectedDocType.toLowerCase());
      if (custom && custom.workflow) {
        found = availableWorkflows.find(
          (w) => w.profile_name === custom.workflow || String(w.id) === custom.workflow
        );
      }
    }

    if (found && Array.isArray(found.steps) && found.steps.length > 0) {
      const sorted = [...found.steps].sort((a, b) => (a.stage_number || 0) - (b.stage_number || 0));
      return {
        profile_name: found.profile_name,
        stages: sorted.map((st, idx) => ({
          stageNum: st.stage_number || idx + 1,
          name: st.step_name || `Stage ${st.stage_number || idx + 1}`,
          subtitle: st.approver_target ? `Approver: ${st.approver_target}` : (st.approver_type || "Review & approve"),
          approver: st.approver_target || st.approver_type || "Stage Approver",
          isFinal: idx === sorted.length - 1
        }))
      };
    }

    return {
      profile_name: found ? found.profile_name : (selectedWorkflowProfile || "Dynamic Workflow Engine"),
      stages: []
    };
  }, [selectedWorkflowProfile, selectedDocType, availableWorkflows, customDocTypes]);

  const startReassuranceRotation = () => {
    setProgressMsgIndex(0);
    const interval = setInterval(() => {
      setProgressMsgIndex((prev) => {
        if (prev < reassuranceSteps.length - 1) {
          return prev + 1;
        } else {
          clearInterval(interval);
          return prev;
        }
      });
    }, 1800);
    return interval;
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMsg(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const allowedTypes = ["application/pdf"];
      if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
        setErrorMsg("Please upload document assets as PDF files only.");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setErrorMsg("File size exceeds the 15MB limit.");
        return;
      }
      setPendingFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setErrorMsg(null);
      const file = e.target.files[0];
      const allowedTypes = ["application/pdf"];
      if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
        setErrorMsg("Please upload document assets as PDF files only.");
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setErrorMsg("File size exceeds the 15MB limit.");
        return;
      }
      setPendingFile(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleAmountChange = (val: string) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const base = (num / 1.18).toFixed(2);
      const tax = (num - parseFloat(base)).toFixed(2);
      setVerifyForm((prev) => ({
        ...prev,
        amount: val,
        base_amount: base,
        tax_amount: tax
      }));
    } else {
      setVerifyForm((prev) => ({ ...prev, amount: val }));
    }
  };

  const handleZoomIn = () => {
    setPreviewZoomLevel((prev) => Math.min(500, prev + 10));
  };

  const handleZoomOut = () => {
    setPreviewZoomLevel((prev) => Math.max(50, prev - 10));
  };

  const handleResetZoom = () => {
    setPreviewZoomLevel(100);
  };

  const handleDownloadStagedPdf = () => {
    if (!stagedDoc) return;
    const link = document.createElement("a");
    link.href = stagedDoc.previewUrl;
    link.download = stagedDoc.fileName || "uploaded_document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintStagedPdf = () => {
    if (!stagedDoc) return;
    const printWindow = window.open(stagedDoc.previewUrl, "_blank");
    if (printWindow) {
      printWindow.focus();
    }
  };

  const handleExtractPreview = async (fileToProcess?: File) => {
    const file = fileToProcess || pendingFile;
    if (!file) {
      triggerFileInput();
      return;
    }

    setExtracting(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const response = await fetch("/api/documents/extract-preview", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const ext = data.extracted_data || {};
        setPreviewZoomLevel(100);
        setStagedDoc({
          tempFileId: data.temp_file_id,
          fileName: data.file_name || file.name,
          fileSize: data.file_size || file.size,
          previewUrl: data.preview_url,
          extractedData: ext
        });

        // Initialize verification form with extracted fields
        setVerifyForm({
          vendor_name: ext.vendor_name || "",
          invoice_number: ext.invoice_number || "",
          invoice_date: ext.invoice_date || new Date().toISOString().split("T")[0],
          amount: ext.amount != null && ext.amount > 0 ? String(ext.amount) : "",
          base_amount: ext.base_amount != null && ext.base_amount > 0 ? String(ext.base_amount) : "",
          tax_amount: ext.tax_amount != null && ext.tax_amount > 0 ? String(ext.tax_amount) : "",
          cgst: ext.cgst != null && ext.cgst > 0 ? String(ext.cgst) : "",
          sgst: ext.sgst != null && ext.sgst > 0 ? String(ext.sgst) : "",
          igst: ext.igst != null && ext.igst > 0 ? String(ext.igst) : "",
          vendor_gstin: ext.gstin || "",
          po_number: ext.po_number || "",
          division: ext.division || "VCC",
          plant: "MAIN",
          document_type: ext.document_type || selectedDocType || "AP INVOICE",
          workflow_profile: selectedWorkflowProfile || "auto"
        });
      } else {
        const err = await response.json().catch(() => ({}));
        setErrorMsg(err.detail || "Document extraction failed. Please try again.");
      }
    } catch (err: any) {
      console.error("Extraction failed:", err);
      setErrorMsg(err.message || "Failed to connect to extraction service.");
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmIngest = async () => {
    if (!stagedDoc) return;

    setLoading(true);
    setErrorMsg(null);
    const interval = startReassuranceRotation();

    try {
      const formData = new FormData();
      formData.append("temp_file_id", stagedDoc.tempFileId);
      formData.append("vendor_name", verifyForm.vendor_name);
      formData.append("invoice_number", verifyForm.invoice_number);
      formData.append("invoice_date", verifyForm.invoice_date);
      formData.append("amount", verifyForm.amount || "0");
      if (verifyForm.base_amount) formData.append("base_amount", verifyForm.base_amount);
      if (verifyForm.tax_amount) formData.append("tax_amount", verifyForm.tax_amount);
      if (verifyForm.cgst) formData.append("cgst", verifyForm.cgst);
      if (verifyForm.sgst) formData.append("sgst", verifyForm.sgst);
      if (verifyForm.igst) formData.append("igst", verifyForm.igst);
      if (verifyForm.vendor_gstin) formData.append("vendor_gstin", verifyForm.vendor_gstin);
      if (verifyForm.po_number) formData.append("po_number", verifyForm.po_number);
      formData.append("division", verifyForm.division);
      formData.append("plant", verifyForm.plant);
      formData.append("document_type", verifyForm.document_type);
      if (verifyForm.workflow_profile && verifyForm.workflow_profile !== "auto") {
        formData.append("workflow_profile", verifyForm.workflow_profile);
      }

      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const response = await fetch("/api/documents/confirm-ingest", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      clearInterval(interval);

      if (response.ok) {
        const doc = await response.json();
        const newDoc = doc.invoice || doc;
        onUploadSuccess(newDoc);
        setUploadedDoc(newDoc);
        setStagedDoc(null);
        setPendingFile(null);
      } else {
        const err = await response.json().catch(() => ({}));
        setErrorMsg(err.detail || "Document confirmation failed. Please check fields and try again.");
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error("Confirmation failed:", err);
      setErrorMsg(err.message || "Failed to confirm document. Check network connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col justify-start py-1 px-3 sm:px-6 animate-fadeIn">
      {/* Breadcrumb Navigation - Compact */}
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1.5">
        <button
          type="button"
          onClick={() => setCurrentView("dashboard")}
          className="flex items-center gap-1 hover:text-slate-800 transition cursor-pointer"
        >
          <Home className="w-3 h-3 text-slate-400" />
          <span>Home</span>
        </button>
        <span className="text-slate-400">&gt;</span>
        <span className="text-slate-800 font-semibold">Upload Document</span>
      </div>

      {/* Page Title & Icon Banner - Space Efficient */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-[#003F28] shrink-0 shadow-2xs">
          <div className="relative">
            <FileText className="w-4 h-4" />
            <Shield className="w-2 h-2 text-[#003F28] absolute -bottom-0.5 -right-0.5 fill-[#003F28]" />
          </div>
        </div>
        <div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight leading-tight">
            Upload &amp; Initiate Workflow
          </h1>
          <p className="text-[11px] text-slate-500 font-normal">
            Upload your document to start the automated approval process.
          </p>
        </div>
      </div>

      {/* Main Card Container - Tightened to fit cleanly on one screen */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4 sm:p-5 space-y-3.5">
        {/* Loading State */}
        {loading ? (
          <div className="py-8 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-3 border-emerald-200 border-t-[#003F28] rounded-full animate-spin" />
            <div className="space-y-0.5 max-w-sm">
              <h3 className="font-bold text-slate-800 text-xs">
                Registering &amp; Routing Document Stream
              </h3>
              <p className="text-slate-500 text-[11px]">
                Evaluating policy matrix rules &amp; routing to initial stage approvers.
              </p>
            </div>
            <div className="bg-slate-900 px-3 py-1.5 rounded-md border border-slate-800 w-full max-w-md font-mono text-[11px] text-emerald-400 animate-pulse text-center">
              &gt;&gt; {reassuranceSteps[progressMsgIndex]}
            </div>
          </div>
        ) : extracting ? (
          /* OCR & AI Extraction In Progress Screen */
          <div className="py-12 text-center flex flex-col items-center justify-center space-y-4 animate-fadeIn">
            <div className="w-12 h-12 border-3 border-emerald-200 border-t-[#003F28] rounded-full animate-spin" />
            <div className="space-y-1 max-w-md">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full w-fit mx-auto border border-emerald-200 shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>Document AI &amp; OCR Engine Active</span>
              </div>
              <h3 className="font-bold text-slate-800 text-sm">
                Extracting Document Metadata
              </h3>
              <p className="text-slate-500 text-xs">
                Running text recognition and LLM parsing for vendor, invoice #, amounts, and tax breakdown.
              </p>
            </div>
            <div className="bg-slate-900 px-4 py-2 rounded-lg border border-slate-800 w-full max-w-md font-mono text-[11px] text-emerald-400 animate-pulse text-center">
              &gt;&gt; Parsing structured data for Human-in-the-Loop verification...
            </div>
          </div>
        ) : uploadedDoc ? (
          /* Upload Success State */
          <div className="py-4 text-center space-y-3.5">
            <div className="mx-auto bg-emerald-50 h-10 w-10 text-[#003F28] rounded-full flex items-center justify-center border border-emerald-200 shadow-2xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Document Uploaded &amp; Workflow Initiated!
              </h3>
              <p className="text-slate-500 text-[11px] font-mono">
                FILE:{" "}
                <span className="text-slate-800 font-bold">
                  {uploadedDoc.file_name ||
                    (uploadedDoc.file_path ? uploadedDoc.file_path.split("/").pop() : "Uploaded PDF")}
                </span>
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 max-w-md mx-auto text-left text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 uppercase text-[10px] font-semibold">Document Key:</span>
                <span className="text-slate-800 font-bold font-mono">
                  {uploadedDoc.invoice_number || uploadedDoc.id}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-200/80 pt-1.5">
                <span className="text-slate-500 uppercase text-[10px] font-semibold">Workflow Profile:</span>
                <span className="text-emerald-800 font-bold">
                  {uploadedDoc.workflow_profile_id || activeWorkflowData.profile_name}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-slate-200/80 pt-1.5">
                <span className="text-slate-500 uppercase text-[10px] font-semibold">Current Stage:</span>
                <span className="text-slate-700 font-medium">
                  {uploadedDoc.status || (activeWorkflowData.stages[0]?.name ?? "Initiated")}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setCurrentView("work-tracker")}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg transition cursor-pointer"
              >
                Track Workflow
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedDocId(uploadedDoc.id);
                  setCurrentView("details");
                }}
                className="px-3.5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white font-medium text-xs rounded-lg transition cursor-pointer"
              >
                View Document
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadedDoc(null);
                  setPendingFile(null);
                  setStagedDoc(null);
                }}
                className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 font-medium text-xs rounded-lg hover:bg-slate-50 transition cursor-pointer"
              >
                Upload Another
              </button>
            </div>
          </div>
        ) : stagedDoc ? (
          /* Human Verification Screen (Path A HITL) */
          <div className="space-y-4 animate-fadeIn">
            {/* Header Banner */}
            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#003F28] text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Sparkles className="w-4 h-4 text-emerald-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900">
                      Verify Extracted Document Data
                    </h2>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded-full shadow-2xs">
                      <Shield className="w-2.5 h-2.5 text-[#003F28]" />
                      Human-in-the-Loop Verification
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    Review and edit extracted values against the uploaded PDF. The Condition Engine routes upon confirmation.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto text-[10.5px]">
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-[#003F28] border border-emerald-300 font-mono font-bold flex items-center gap-1.5 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-emerald-700" />
                  <span>Local AI: PaddleOCR + Ollama (Qwen3:8b)</span>
                </span>
              </div>
            </div>

            {/* Split Screen Grid: PDF Preview on Left, Editable Form on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Column: Read-Only PDF Viewer with Custom Toolbar */}
              <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
                {/* PDF Viewer Compact Header Toolbar */}
                <div className="bg-[#003F28] text-white px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                    <span className="text-[11px] font-bold text-white truncate max-w-[180px]" title={stagedDoc.fileName}>
                      {stagedDoc.fileName}
                    </span>
                    <span className="text-[9.5px] text-emerald-200/80 font-mono shrink-0">
                      ({(stagedDoc.fileSize / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Zoom Controls (Default: 100%) */}
                    <div className="flex items-center bg-black/20 rounded-md p-0.5 border border-white/10">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={previewZoomLevel <= 50}
                        className="p-1 rounded hover:bg-white/20 text-emerald-100 hover:text-white transition disabled:opacity-30 cursor-pointer"
                        title="Zoom Out (-10%)"
                      >
                        <ZoomOut className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="px-1.5 py-0.5 text-[10px] font-mono font-bold text-white hover:bg-white/20 rounded transition cursor-pointer"
                        title="Click to reset zoom to 100%"
                      >
                        {previewZoomLevel}%
                      </button>

                      <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={previewZoomLevel >= 500}
                        className="p-1 rounded hover:bg-white/20 text-emerald-100 hover:text-white transition disabled:opacity-30 cursor-pointer"
                        title="Zoom In (+10%)"
                      >
                        <ZoomIn className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="h-3.5 w-[1px] bg-emerald-700/60 mx-0.5" />

                    {/* Download Original PDF */}
                    <button
                      type="button"
                      onClick={handleDownloadStagedPdf}
                      className="px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-white transition text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="Download uploaded PDF"
                    >
                      <Download className="h-3 w-3" />
                      <span>Download</span>
                    </button>

                    {/* Print Original PDF */}
                    <button
                      type="button"
                      onClick={handlePrintStagedPdf}
                      className="px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-white transition text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                      title="Print uploaded PDF"
                    >
                      <Printer className="h-3 w-3" />
                      <span>Print</span>
                    </button>

                    {/* Open in new tab */}
                    <a
                      href={stagedDoc.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-white/20 text-emerald-100 hover:text-white transition"
                      title="Open full view in new tab"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* Read-Only Embedded PDF Viewer (View-Only, No Edit/Annotation) */}
                <div className="w-full h-[540px] bg-white rounded-lg overflow-hidden border border-slate-300 relative shadow-inner">
                  <iframe
                    key={`${stagedDoc.tempFileId}-${previewZoomLevel}`}
                    src={`${stagedDoc.previewUrl}#toolbar=0&navpanes=0&zoom=${previewZoomLevel}`}
                    className="w-full h-full border-0 bg-white"
                    title="Read-Only Document Preview"
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 px-1">
                  <span>View-only mode &bull; Default zoom: 100%</span>
                  <span>Use zoom controls or open in new tab for expanded view</span>
                </div>
              </div>


              {/* Right Column: Editable Verification Form */}
              <div className="lg:col-span-6 space-y-3">
                {/* Card 1: Invoice & Reference Identifiers */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                      1. Document &amp; Reference Info
                    </span>
                    <span className="text-[10px] text-slate-400">Required for routing</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Document / Invoice Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={verifyForm.invoice_number}
                        onChange={(e) => setVerifyForm({ ...verifyForm, invoice_number: e.target.value })}
                        placeholder="e.g. INV-2026-001"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Invoice Date
                      </label>
                      <input
                        type="date"
                        value={verifyForm.invoice_date}
                        onChange={(e) => setVerifyForm({ ...verifyForm, invoice_date: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        PO / Reference Number
                      </label>
                      <input
                        type="text"
                        value={verifyForm.po_number}
                        onChange={(e) => setVerifyForm({ ...verifyForm, po_number: e.target.value })}
                        placeholder="Optional PO number"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Document Type / Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={verifyForm.document_type}
                        onChange={(e) => setVerifyForm({ ...verifyForm, document_type: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      >
                        <option value="AP INVOICE">AP INVOICE</option>
                        <option value="PURCHASE INVOICE">PURCHASE INVOICE</option>
                        <option value="CAPEX / FIXED ASSET">CAPEX / FIXED ASSET</option>
                        <option value="UTILITY & RENT">UTILITY & RENT</option>
                        <option value="STAFF & HR EXPENSE">STAFF & HR EXPENSE</option>
                        <option value="E-VOUCHER">E-VOUCHER</option>
                        <option value="CASH VOUCHER">CASH VOUCHER</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Card 2: Vendor & Tax Identifiers */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                      2. Supplier / Party Details
                    </span>
                    <span className="text-[10px] text-slate-400">Entity Details</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Vendor / Supplier Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={verifyForm.vendor_name}
                        onChange={(e) => setVerifyForm({ ...verifyForm, vendor_name: e.target.value })}
                        placeholder="Supplier Name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Supplier GSTIN
                      </label>
                      <input
                        type="text"
                        value={verifyForm.vendor_gstin}
                        onChange={(e) => setVerifyForm({ ...verifyForm, vendor_gstin: e.target.value.toUpperCase() })}
                        placeholder="15-digit GSTIN"
                        maxLength={15}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                  </div>
                </div>

                {/* Card 3: Financials & Tax Breakdown */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                      3. Financials &amp; Taxes
                    </span>
                    <span className="text-[10px] text-emerald-700 font-semibold">Auto-calculated or custom</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Total Amount (₹) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={verifyForm.amount}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-emerald-50/50 border border-emerald-300 rounded-md px-2.5 py-1.5 text-xs font-bold text-emerald-950 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Base Amount (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={verifyForm.base_amount}
                        onChange={(e) => setVerifyForm({ ...verifyForm, base_amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Tax Amount (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={verifyForm.tax_amount}
                        onChange={(e) => setVerifyForm({ ...verifyForm, tax_amount: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                  </div>

                  {/* CGST / SGST / IGST breakdown */}
                  <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">CGST (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={verifyForm.cgst}
                        onChange={(e) => setVerifyForm({ ...verifyForm, cgst: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">SGST (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={verifyForm.sgst}
                        onChange={(e) => setVerifyForm({ ...verifyForm, sgst: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">IGST (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={verifyForm.igst}
                        onChange={(e) => setVerifyForm({ ...verifyForm, igst: e.target.value })}
                        placeholder="0.00"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                {/* Card 4: Routing & Business Rule Scope */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                      4. Scope &amp; Routing Engine
                    </span>
                    <span className="text-[10px] text-emerald-800 font-semibold">Condition Engine convergence</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Division <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={verifyForm.division}
                        onChange={(e) => setVerifyForm({ ...verifyForm, division: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      >
                        <option value="VCC">VCC - Spinning &amp; Textiles</option>
                        <option value="VCT">VCT - Garments &amp; Processing</option>
                        <option value="SPINNING">SPINNING</option>
                        <option value="PROCESSING">PROCESSING</option>
                        <option value="FABRIC">FABRIC</option>
                        <option value="GARMENTS">GARMENTS</option>
                        <option value="RETAIL">RETAIL</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                        Plant / Unit
                      </label>
                      <input
                        type="text"
                        value={verifyForm.plant}
                        onChange={(e) => setVerifyForm({ ...verifyForm, plant: e.target.value })}
                        placeholder="e.g. MAIN or PLANT-01"
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                      Workflow Profile
                    </label>
                    <select
                      value={verifyForm.workflow_profile}
                      onChange={(e) => setVerifyForm({ ...verifyForm, workflow_profile: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                    >
                      <option value="auto">Auto-Match (Condition Engine Decision)</option>
                      {availableWorkflows.map((wf) => (
                        <option key={wf.id || wf.profile_name} value={wf.profile_name}>
                          {wf.profile_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Error Banner */}
                {errorMsg && (
                  <div className="bg-red-50 border border-red-200 p-2 rounded-lg flex items-start gap-1.5 text-red-800 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Confirm & Ingest Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStagedDoc(null);
                      setPendingFile(null);
                      setErrorMsg(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                  >
                    Discard &amp; Change PDF
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmIngest}
                    className="px-6 py-2 text-xs font-bold text-white bg-[#003F28] hover:bg-[#002f1e] rounded-lg shadow-sm hover:shadow transition flex items-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>Confirm &amp; Ingest Document</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (

          <>
            {/* Row 1: Document Type & Workflow Selection */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              {/* Document Type Dropdown */}
              <div className="md:col-span-6 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-800">
                    Document Type <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewDocTypeModal(true)}
                    className="text-[10.5px] font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer hover:underline"
                    title="Add a custom document stream"
                  >
                    + Add New Type
                  </button>
                </div>

                <div className="relative">
                  <select
                    value={selectedDocType}
                    onChange={(e) => {
                      if (e.target.value === "__NEW_TYPE__") {
                        setShowNewDocTypeModal(true);
                      } else {
                        handleDocTypeChange(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-50/60 border border-slate-200 text-slate-800 rounded-lg px-3 pr-8 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#003F28] focus:border-[#003F28] transition appearance-none cursor-pointer"
                  >
                    <optgroup label="Standard Document Types">
                      <option value="AP Invoice">AP Invoice</option>
                      <option value="CAPEX / FIXED ASSET">CAPEX / FIXED ASSET</option>
                      <option value="UTILITY & RENT">UTILITY & RENT</option>
                      <option value="STAFF & HR EXPENSE">STAFF & HR EXPENSE</option>
                      <option value="PURCHASE INVOICE">PURCHASE INVOICE</option>
                      <option value="E-VOUCHER">E-VOUCHER</option>
                      <option value="CASH VOUCHER">CASH VOUCHER</option>
                    </optgroup>

                    {customDocTypes.length > 0 && (
                      <optgroup label="Custom Document Types">
                        {customDocTypes.map((c, idx) => (
                          <option key={idx} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    <option value="__NEW_TYPE__" className="text-emerald-700 font-bold">
                      Add New Document Type...
                    </option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Approval Workflow Dropdown */}
              <div className="md:col-span-6 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-800">
                    Approval Workflow <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGoToFlowBuilder}
                    className="text-[10.5px] font-semibold text-emerald-800 hover:text-emerald-950 cursor-pointer hover:underline"
                    title="Open Flow Builder in Admin to design custom multi-stage approval flow"
                  >
                    Build Flow &rarr;
                  </button>
                </div>

                <div className="relative">
                  <select
                    value={selectedWorkflowProfile}
                    onChange={(e) => {
                      if (e.target.value === "__FLOW_BUILDER__") {
                        handleGoToFlowBuilder();
                      } else {
                        setSelectedWorkflowProfile(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-50/60 border border-slate-200 text-slate-800 rounded-lg px-3 pr-8 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#003F28] focus:border-[#003F28] transition appearance-none cursor-pointer truncate"
                  >
                    {availableWorkflows.length > 0 ? (
                      <optgroup label="Available Workflows">
                        {availableWorkflows.map((w: any) => (
                          <option key={w.id || w.profile_name} value={w.profile_name}>
                            {w.profile_name}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <optgroup label="Standard Workflows">
                        <option value="Standard AP Invoice Approval Workflow">Standard AP Invoice Approval Workflow</option>
                        <option value="CAPEX & Fixed Asset Multi-Tier Workflow">CAPEX & Fixed Asset Multi-Tier Workflow</option>
                        <option value="Utility & Rent Fast-Track Approval">Utility & Rent Fast-Track Approval</option>
                        <option value="HR & Staff Welfare Approval Stream">HR & Staff Welfare Approval Stream</option>
                        <option value="PO & Purchase Matching Workflow">PO & Purchase Matching Workflow</option>
                      </optgroup>
                    )}
                    <option value="__FLOW_BUILDER__" className="text-emerald-700 font-bold">
                      Build Flow in Flow Builder
                    </option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 2: Dynamic Approval Route Stepper */}
            <div className="space-y-2 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-[11px] font-bold text-slate-800">
                    Approval Route ({activeWorkflowData.stages.length} Stages)
                  </h3>
                  <span className="text-[10px] text-slate-400 font-medium truncate max-w-xs">
                    &bull; {activeWorkflowData.profile_name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStagesModal(true)}
                  className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 transition cursor-pointer"
                >
                  <span>View All Stages &amp; Approvers</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* Dynamic Connecting Stepper Pipeline */}
              {activeWorkflowData.stages.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                  No approval stages configured for this workflow profile. Open Flow Builder to configure stages.
                </div>
              ) : (
                <div className="relative py-1 px-3 sm:px-6">
                  {/* Connecting Horizontal Line */}
                  <div className="absolute top-5 left-10 right-10 h-[1.5px] bg-slate-200 -z-0" />

                  <div
                    className="grid gap-2 relative z-10"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(activeWorkflowData.stages.length, 1)}, minmax(0, 1fr))`
                    }}
                  >
                    {activeWorkflowData.stages.map((stage, idx) => {
                      const isFirst = idx === 0;
                      const isFinal = stage.isFinal || idx === activeWorkflowData.stages.length - 1;

                      return (
                        <div key={idx} className="flex flex-col items-center text-center">
                          {/* Stepper Node Circle */}
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              isFirst
                                ? "bg-[#003F28] text-white shadow-2xs ring-3 ring-emerald-100"
                                : isFinal
                                ? "bg-slate-100 border border-slate-300 text-slate-600"
                                : "bg-slate-100 border border-slate-200 text-slate-500"
                            }`}
                          >
                            {isFirst ? (
                              <FileText className="w-3.5 h-3.5" />
                            ) : isFinal ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : idx % 2 === 1 ? (
                              <Users className="w-3.5 h-3.5" />
                            ) : (
                              <BarChart2 className="w-3.5 h-3.5" />
                            )}
                          </div>

                          {/* Stage Name */}
                          <span
                            className="text-[11px] font-bold text-slate-800 mt-1 tracking-tight leading-snug line-clamp-1 max-w-[120px]"
                            title={stage.name}
                          >
                            {stage.name}
                          </span>

                          {/* Stage Subtitle / Approver */}
                          <span
                            className="text-[10px] text-slate-400 font-normal leading-tight line-clamp-1 max-w-[120px]"
                            title={stage.subtitle}
                          >
                            {stage.subtitle}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Upload Document Dropzone */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold text-slate-800">
                  Upload Document <span className="text-red-500">*</span>
                </h3>
                <p className="text-[10px] text-slate-400">
                  Attach your document (PDF only, maximum size 15 MB)
                </p>
              </div>

              {/* Compact Drag & Drop Area */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-1.5 ${
                  dragActive
                    ? "border-emerald-600 bg-emerald-50/40"
                    : "border-slate-200 bg-slate-50/30 hover:border-emerald-600/70 hover:bg-emerald-50/10"
                }`}
              >
                {/* Up Arrow with Circle Around It */}
                <div className="relative flex items-center justify-center mb-0.5">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-[#003F28] shadow-2xs">
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </div>
                </div>

                {pendingFile ? (
                  <div className="space-y-1 py-0.5">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50/90 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-900 shadow-2xs">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-sm">{pendingFile.name}</span>
                      <span className="text-[10px] text-emerald-700 font-normal">
                        ({(pendingFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Document ready for submission &bull;{" "}
                      <span className="text-[#005333] font-semibold underline hover:text-[#003F28]">
                        Click to change file
                      </span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">
                      Drag &amp; drop your PDF here
                    </p>
                    <p className="text-[11px] text-slate-500">
                      or{" "}
                      <span className="text-[#005333] font-semibold hover:underline">
                        browse from your computer
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      PDF only &nbsp;|&nbsp; Max 15 MB
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,application/pdf"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 p-2 rounded-lg flex items-start gap-1.5 text-red-800 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Row 4: Action Buttons (Cancel & Upload) */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (pendingFile) {
                    setPendingFile(null);
                  } else {
                    setCurrentView("dashboard");
                  }
                }}
                className="px-6 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition-all duration-150 shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-200"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleExtractPreview()}
                disabled={!pendingFile || extracting}
                className="px-6 py-2 text-xs font-semibold text-white bg-[#003F28] hover:bg-[#002f1e] active:bg-[#002416] rounded-lg shadow-sm hover:shadow transition-all duration-150 flex items-center gap-2 group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-[#003F28]/30 focus:ring-offset-1"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                <span>Analyze &amp; Verify Document</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer Branding Subtext - Compact */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between text-[10px] text-slate-400 pt-2 pb-1">
        <span>Documents to Decisions Faster</span>
        <span>Secure &nbsp;|&nbsp; Transparent &nbsp;|&nbsp; Efficient</span>
      </div>

      {/* Modal: View All Stages & Approvers */}
      {showStagesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3.5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  {activeWorkflowData.profile_name}
                </h3>
                <p className="text-[10px] text-slate-500">
                  Stages &amp; approvers assigned for this workflow
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStagesModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {activeWorkflowData.stages.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400">
                  No stages configured for this workflow yet.
                </div>
              ) : (
                activeWorkflowData.stages.map((stage, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-[#003F28] text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                        {stage.stageNum || idx + 1}
                      </div>
                      <div>
                        <div className="font-bold text-slate-800 text-[11px]">{stage.name}</div>
                        <div className="text-[10px] text-slate-400">{stage.subtitle}</div>
                      </div>
                    </div>
                    <span className="bg-white border border-slate-200 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded shadow-2xs">
                      {stage.approver}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-end pt-1.5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowStagesModal(false)}
                className="px-3.5 py-1.5 bg-[#003F28] text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-[#002f1e] transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add New Document Type */}
      {showNewDocTypeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-5 space-y-3.5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Add New Document Type
                </h3>
                <p className="text-[10px] text-slate-500">
                  Create a new document category and link its approval stream
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewDocTypeModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateDocType} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-800">
                  Document Type Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Legal Agreement, Transportation Bill, Audit Report..."
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-[#003F28] focus:border-[#003F28]"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-slate-800">
                    Associated Workflow
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewDocTypeModal(false);
                      handleGoToFlowBuilder();
                    }}
                    className="text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-0.5 cursor-pointer hover:underline"
                  >
                    <span>Build in Canvas</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                </div>
                <select
                  value={newTypeWorkflow}
                  onChange={(e) => setNewTypeWorkflow(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-[#003F28] focus:border-[#003F28] cursor-pointer"
                >
                  <option value="">-- Select Approval Workflow --</option>
                  {availableWorkflows.map((w: any) => (
                    <option key={w.id || w.profile_name} value={w.profile_name}>
                      {w.profile_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-800">
                  Description / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Short description of this document stream..."
                  value={newTypeDesc}
                  onChange={(e) => setNewTypeDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#003F28] focus:border-[#003F28]"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewDocTypeModal(false);
                    handleGoToFlowBuilder();
                  }}
                  className="text-[11px] font-medium text-slate-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <Layers className="w-3 h-3 text-slate-400" />
                  <span>Open Flow Builder</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewDocTypeModal(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTypeName.trim()}
                    className="px-3.5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white rounded-lg text-xs font-medium transition shadow-2xs disabled:opacity-50 cursor-pointer"
                  >
                    Add &amp; Select
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
