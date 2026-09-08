import React, { useState, useEffect, useRef } from "react";
import { Upload, FileText, CheckCircle2, ArrowRight, AlertCircle, Loader2, Layers, GitMerge, Plus, ShieldCheck, UserCheck, ArrowUpRight, X, Sliders, ExternalLink, Eye, ChevronDown } from "lucide-react";

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

// Default Workflow Stage Mappings for previewing the flow before upload
const defaultWorkflowFlows: Record<string, { profile_name: string; stages: { name: string; approver: string }[] }> = {
  "AP Invoice": {
    profile_name: "Standard AP Invoice Approval Workflow",
    stages: [
      { name: "Stage 1: Intake & Verification", approver: "Intake Officer / AP Team" },
      { name: "Stage 2: Department Review", approver: "Department Manager" },
      { name: "Stage 3: Internal Audit", approver: "IA Manager" },
      { name: "Stage 4: Final Sign-off", approver: "VP Operations / CFO" }
    ]
  },
  "CAPEX / FIXED ASSET": {
    profile_name: "CAPEX & Fixed Asset Multi-Tier Workflow",
    stages: [
      { name: "Stage 1: Asset Intake", approver: "IT & Asset Manager" },
      { name: "Stage 2: Technical Audit", approver: "Chief Engineer" },
      { name: "Stage 3: Financial Clearance", approver: "CFO" },
      { name: "Stage 4: Final Approval", approver: "Managing Director" }
    ]
  },
  "UTILITY & RENT": {
    profile_name: "Utility & Rent Fast-Track Approval",
    stages: [
      { name: "Stage 1: Facility Check", approver: "Facility Lead" },
      { name: "Stage 2: Branch Manager Sign-off", approver: "Branch Head" },
      { name: "Stage 3: Finance Disbursement", approver: "Finance Controller" }
    ]
  },
  "STAFF & HR EXPENSE": {
    profile_name: "HR & Staff Welfare Approval Stream",
    stages: [
      { name: "Stage 1: HR Officer Review", approver: "HR Officer" },
      { name: "Stage 2: Plant HR Manager", approver: "HR Manager" },
      { name: "Stage 3: Factory GM Approval", approver: "Factory GM" }
    ]
  },
  "E-VOUCHER": {
    profile_name: "E-Voucher Quick Sign-off",
    stages: [
      { name: "Stage 1: Voucher Verification", approver: "Voucher Admin" },
      { name: "Stage 2: Final Sign-off", approver: "Finance Lead" }
    ]
  },
  "CASH VOUCHER": {
    profile_name: "Petty Cash Voucher Review",
    stages: [
      { name: "Stage 1: Petty Cash Audit", approver: "Custodian" },
      { name: "Stage 2: Manager Sign-off", approver: "Finance Manager" }
    ]
  },
  "PURCHASE INVOICE": {
    profile_name: "PO & Purchase Matching Workflow",
    stages: [
      { name: "Stage 1: Goods Inward Verification", approver: "Warehouse Officer" },
      { name: "Stage 2: PO Matching & QC", approver: "Purchase Manager" },
      { name: "Stage 3: Finance Approval", approver: "Finance Head" }
    ]
  }
};

export default function DocumentUpload({ onUploadSuccess, setCurrentView, setSelectedDocId }: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMsgIndex, setProgressMsgIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document Type & Workflow Selection
  const [selectedDocType, setSelectedDocType] = useState<string>("AP Invoice");
  const [selectedWorkflowProfile, setSelectedWorkflowProfile] = useState<string>("auto");
  const [availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
  const [customDocTypes, setCustomDocTypes] = useState<Array<{ name: string; profile_name: string; stages: { name: string; approver: string }[] }>>([]);
  const [showStagesDropdown, setShowStagesDropdown] = useState(false);
  
  // New Document Stream Modal State
  const [showNewTypeModal, setShowNewTypeModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDivision, setNewTypeDivision] = useState("VCC");
  const [newTypeStage1, setNewTypeStage1] = useState("Department Review");
  const [newTypeStage2, setNewTypeStage2] = useState("Internal Audit");
  const [newTypeStage3, setNewTypeStage3] = useState("Executive Approval");

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        const res = await fetch("/api/workflows", {
          headers: token ? { "Authorization": `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setAvailableWorkflows(data);
          }
        }
      } catch (err) {
        console.error("Error loading workflows in upload:", err);
      }
    };
    fetchWorkflows();
  }, []);

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMsg(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const allowedTypes = ["application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        setErrorMsg("Please upload document assets as PDF files only.");
        return;
      }
      if (file.size > 60 * 1024 * 1024) {
        setErrorMsg("File size exceeds the 60MB limit.");
        return;
      }
      setPendingFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setErrorMsg(null);
      const file = e.target.files[0];
      const allowedTypes = ["application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        setErrorMsg("Please upload document assets as PDF files only.");
        return;
      }
      if (file.size > 60 * 1024 * 1024) {
        setErrorMsg("File size exceeds 60MB limit.");
        return;
      }
      setPendingFile(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    setLoading(true);
    setErrorMsg(null);
    const interval = startReassuranceRotation();

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", selectedDocType);
      if (selectedWorkflowProfile && selectedWorkflowProfile !== "auto") {
        formData.append("workflow_profile", selectedWorkflowProfile);
      }
      
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      const fetchUrl = "/api/documents/upload";
      
      const response = await fetch(fetchUrl, {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formData,
      });

      clearInterval(interval);

      if (response.ok) {
        const doc = await response.json();
        const newDoc = doc.invoice || doc;
        onUploadSuccess(newDoc);
        setUploadedDoc(newDoc);
      } else {
        const err = await response.json().catch(() => ({}));
        setErrorMsg(err.detail || "Upload failed. Please check file format and try again.");
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error("Upload failed:", err);
      setErrorMsg(err.message || "Upload failed. Please check network connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomDocType = () => {
    if (!newTypeName.trim()) return;
    const customName = newTypeName.trim();
    const newCustomObj = {
      name: customName,
      profile_name: `${customName} Workflow`,
      stages: [
        { name: `Stage 1: ${newTypeStage1 || 'Review'}`, approver: `${newTypeDivision} Department Lead` },
        { name: `Stage 2: ${newTypeStage2 || 'Audit'}`, approver: "Internal Auditor" },
        { name: `Stage 3: ${newTypeStage3 || 'Final Approval'}`, approver: "Division GM / Executive" }
      ]
    };
    
    setCustomDocTypes(prev => [...prev, newCustomObj]);
    setSelectedDocType(customName);
    setSelectedWorkflowProfile(`${customName} Workflow`);
    setShowNewTypeModal(false);
    setNewTypeName("");
  };

  // Determine current active workflow for live preview card
  const getCurrentWorkflowPreview = () => {
    if (selectedWorkflowProfile !== "auto") {
      const fetchedWf = availableWorkflows.find(w => w.profile_name === selectedWorkflowProfile);
      if (fetchedWf && fetchedWf.steps && fetchedWf.steps.length > 0) {
        return {
          profile_name: fetchedWf.profile_name,
          stages: fetchedWf.steps.map((st: any) => ({
            name: `Stage ${st.stage_number}: ${st.step_name}`,
            approver: st.approver_target || "Stage Approver"
          }))
        };
      }
    }

    const customWf = customDocTypes.find(c => c.name === selectedDocType);
    if (customWf) {
      return { profile_name: customWf.profile_name, stages: customWf.stages };
    }

    const defaultWf = defaultWorkflowFlows[selectedDocType];
    if (defaultWf) {
      return defaultWf;
    }

    return {
      profile_name: `${selectedDocType} Policy Matrix Stream`,
      stages: [
        { name: "Stage 1: Intake & Attachment Review", approver: "Department Manager" },
        { name: "Stage 2: First Approval", approver: "Section Head" },
        { name: "Stage 3: Final Sign-off", approver: "Division GM" }
      ]
    };
  };

  const activeWorkflowPreview = getCurrentWorkflowPreview();

  return (
    <div className="max-w-xl mx-auto space-y-4 py-2 animate-fadeIn">
      {/* Visual Header Banner */}
      <div className="text-center space-y-1.5">
        <h2 className="font-display font-extrabold text-slate-800 text-xl tracking-tight mt-1">
          Upload &amp; Initiate Workflow
        </h2>
        <p className="text-slate-500 font-sans text-xs max-w-sm mx-auto leading-relaxed">
          Upload your document to register and initiate the automated multi-stage approval workflow.
        </p>
      </div>

      {/* Document Type & Explicit Workflow Selectors */}
      {!loading && !uploadedDoc && !pendingFile && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
          
          {/* Document Type Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Document Type
              </label>
              <button
                onClick={() => setShowNewTypeModal(true)}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Document Stream</span>
              </button>
            </div>

            <div className="relative">
              <select
                value={selectedDocType}
                onChange={(e) => {
                  if (e.target.value === "__NEW__") {
                    setShowNewTypeModal(true);
                  } else {
                    setSelectedDocType(e.target.value);
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition appearance-none cursor-pointer"
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
                  <optgroup label="Custom Document Streams">
                    {customDocTypes.map((c, i) => (
                      <option key={i} value={c.name}>{c.name}</option>
                    ))}
                  </optgroup>
                )}

                <option value="__NEW__" className="text-blue-600 font-bold">
                  + Create New Document Type &amp; Workflow...
                </option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <Layers className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* Explicit Workflow Choice Selector & Flow Builder Redirection */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sliders className="h-3 w-3 text-indigo-500" />
                <span>Approval Workflow Profile</span>
              </label>
              <button
                type="button"
                onClick={() => setCurrentView("admin")}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline cursor-pointer"
                title="Open Flow Builder in Admin to design custom workflow canvas"
              >
                <GitMerge className="h-3 w-3 text-indigo-500" />
                <span>Build Flow in Canvas</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            </div>

            <div className="relative">
              <select
                value={selectedWorkflowProfile}
                onChange={(e) => {
                  if (e.target.value === "__FLOW_BUILDER__") {
                    setCurrentView("admin");
                  } else {
                    setSelectedWorkflowProfile(e.target.value);
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition appearance-none cursor-pointer"
              >
                <option value="auto">⚡ Auto-Match via Policy Matrix (Recommended)</option>
                
                {availableWorkflows.length > 0 ? (
                  <optgroup label="Workflows Created in Flow Builder">
                    {availableWorkflows.slice(0, 20).map((w: any) => (
                      <option key={w.id || w.profile_name} value={w.profile_name}>
                        {w.profile_name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <optgroup label="Flow Builder Workflow Profiles">
                    <option value="VCC Standard Approval Workflow">VCC Standard Approval Workflow</option>
                    <option value="SD Standard Approval Workflow">SD Standard Approval Workflow</option>
                    <option value="ACC Prod Asset Workflow">ACC Prod Asset Workflow</option>
                    <option value="VCC IT Capex Approval Workflow">VCC IT Capex Approval Workflow</option>
                    <option value="Express Fast-Track Approval">Express Fast-Track Approval</option>
                  </optgroup>
                )}

                <option value="__FLOW_BUILDER__" className="text-indigo-600 font-bold">
                  + Create New Workflow Profile in Flow Builder Canvas →
                </option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <GitMerge className="h-4 w-4" />
              </div>
            </div>

            {/* Collapsible Stages & Approvers Dropdown */}
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setShowStagesDropdown(!showStagesDropdown)}
                className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-blue-600" />
                  <span>View Workflow Stages &amp; Approvers ({activeWorkflowPreview.stages.length} Stages)</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${showStagesDropdown ? "rotate-180" : ""}`} />
              </button>

              {showStagesDropdown && (
                <div className="mt-2.5 bg-white border border-slate-200/90 rounded-2xl p-3.5 space-y-2.5 shadow-sm animate-fadeIn">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    Workflow Profile: <span className="text-blue-700 font-bold">{activeWorkflowPreview.profile_name}</span>
                  </div>
                  <div className="space-y-2 pt-0.5">
                    {activeWorkflowPreview.stages.map((st, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 px-3 flex items-center justify-between text-xs hover:border-blue-300 transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-6 w-6 rounded-full border-2 border-blue-200 bg-blue-50 text-blue-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </div>
                          <span className="font-bold text-slate-800 text-xs truncate">
                            {st.name}
                          </span>
                        </div>
                        <span className="bg-white border border-slate-200/90 text-slate-600 text-[10px] font-medium px-2.5 py-1 rounded-md shrink-0 ml-2 shadow-2xs">
                          {st.approver}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Loading Ingestion Screen */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-6 shadow-sm">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-10 w-10 bg-blue-100 rounded-full animate-ping opacity-60"></div>
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin relative z-10" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h3 className="font-bold text-slate-800 text-sm">Registering &amp; Routing Document Stream</h3>
            <p className="text-slate-400 font-medium text-[11px]">Evaluating policy matrix rules &amp; routing to initial stage approvers.</p>
          </div>
          <div className="bg-slate-900 px-5 py-3 rounded-xl border border-slate-800 w-full max-w-md font-mono text-[11px] text-blue-400 animate-pulse text-center">
            &gt;&gt; {reassuranceSteps[progressMsgIndex]}
          </div>
        </div>
      ) : uploadedDoc ? (
        /* Upload & Workflow Initiation Success State */
        <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-6 shadow-sm">
          <div className="mx-auto bg-emerald-50 h-12 w-12 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-100">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display font-extrabold text-slate-800 text-lg">Document Uploaded &amp; Workflow Initiated!</h3>
            <p className="text-slate-400 font-mono text-[11px]">FILE REGISTERED: <span className="text-slate-700 font-bold">{uploadedDoc.file_name || (uploadedDoc.file_path ? uploadedDoc.file_path.split('/').pop() : "Uploaded PDF")}</span></p>
          </div>

          <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-200/60 max-w-md mx-auto text-left text-xs space-y-3 font-sans shadow-inner">
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Document Key / Ref:</span> 
              <span className="text-slate-800 font-bold font-mono">{uploadedDoc.invoice_number || uploadedDoc.id}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200/60 pt-3">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Assigned Workflow Profile:</span> 
              <span className="text-blue-700 font-bold">{uploadedDoc.workflow_profile_id || activeWorkflowPreview.profile_name}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200/60 pt-3">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Active Stage:</span> 
              <span className="text-slate-700 font-semibold">{uploadedDoc.status || "Initiated (Stage 1)"}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200/60 pt-3">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Stage Approver:</span> 
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">{uploadedDoc.assigned_approver || "Assigned"}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto pt-2">
            <button
              onClick={() => {
                setCurrentView("work-tracker");
              }}
              className="w-full sm:w-1/2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider transition rounded-xl flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
            >
              <span>Track Workflow</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setSelectedDocId(uploadedDoc.id);
                setCurrentView("details");
              }}
              className="w-full sm:w-1/2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition rounded-xl flex items-center justify-center space-x-2 shadow-md shadow-blue-500/10 cursor-pointer"
            >
              <span>View Document</span>
              <ArrowRight className="h-4 w-4" />
            </button>                        
          </div>
        </div>
      ) : pendingFile ? (
        /* File Pending Upload & Route State */
        <div className="backdrop-blur-xl border border-slate-200 bg-white rounded-[2rem] p-8 text-center relative overflow-hidden flex flex-col items-center justify-center space-y-5 shadow-sm">
          <div className="w-full max-w-sm bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center space-x-3 text-left">
            <div className="h-10 w-10 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="h-5.5 w-5.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-slate-850 truncate">
                {pendingFile.name}
              </div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                {pendingFile.size ? `${(pendingFile.size / (1024 * 1024)).toFixed(2)} MB` : "PDF Document"}
              </div>
            </div>
          </div>

          <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 text-left w-full max-w-sm text-xs space-y-1">
            <div className="font-bold text-blue-900 text-[11px] flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              <span>Ready for Workflow Dispatch</span>
            </div>
            <p className="text-[10px] text-blue-700/80">
              Assigned Workflow Profile: <strong className="text-blue-900">{selectedWorkflowProfile === "auto" ? activeWorkflowPreview.profile_name : selectedWorkflowProfile}</strong> ({activeWorkflowPreview.stages.length} stages).
            </p>
          </div>

          <div className="flex gap-3 w-full max-w-xs justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPendingFile(null);
              }}
              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-250 text-slate-700 font-semibold rounded-xl text-xs transition duration-200 cursor-pointer"
            >
              Clear
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                const file = pendingFile;
                setPendingFile(null);
                uploadFile(file);
              }}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-xs transition-all duration-200 shadow-md shadow-blue-500/10 flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <span>Upload &amp; Route</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Dropzone Component */
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`backdrop-blur-xl border-2 border-dashed rounded-[2rem] p-10 text-center cursor-pointer transition-all duration-500 relative overflow-hidden group flex flex-col items-center justify-center space-y-5 shadow-sm hover:shadow-[0_8px_30px_rgb(59,130,246,0.12)] ${
            dragActive
              ? "border-blue-500 bg-blue-100/50 scale-[0.98] shadow-inner"
              : "bg-slate-50/80 border-slate-300/80 hover:border-blue-400 hover:bg-blue-50/40"
          }`}
        >
          <div className="relative">
            <div className="absolute -inset-4 bg-blue-200 rounded-full opacity-0 group-hover:opacity-60 group-hover:scale-125 transition-all duration-700 blur-xl"></div>
            <div className="bg-gradient-to-br from-white to-blue-50 text-blue-600 h-16 w-16 rounded-full flex items-center justify-center border-4 border-white shadow-[0_4px_20px_rgb(59,130,246,0.15)] group-hover:scale-110 group-hover:-translate-y-2 transition-transform duration-500 relative z-10 mx-auto">
              <Upload className="h-7 w-7 group-hover:animate-bounce" />
            </div>
          </div>

          <div className="space-y-1.5 max-w-sm relative z-10">
            <p className="font-display text-sm font-bold text-slate-800">
              Drag &amp; drop your files here
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              or <span className="text-blue-600 font-semibold hover:text-blue-700 underline decoration-blue-200 underline-offset-4 transition">browse your computer</span>
            </p>
            <div className="pt-2 flex items-center justify-center gap-3 text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3"/> PDF ONLY</span>
              <span className="flex items-center gap-1"><UserCheck className="h-3 w-3"/> Max 60MB</span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleFileChange}
          />
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 p-4.5 rounded-2xl flex items-start space-x-3 text-red-800 text-xs shadow-sm">
          <AlertCircle className="h-4.5 w-4.5 shrink-0 text-red-650" />
          <div className="space-y-1"> 
            <span className="font-extrabold uppercase text-[10px] tracking-wide block">Upload Interrupted</span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}

      {/* New Document Type & Workflow Creation Modal */}
      {showNewTypeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scaleIn">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-800">
                <Plus className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-sm">Create New Document Stream &amp; Workflow</h3>
              </div>
              <button onClick={() => setShowNewTypeModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Document Type Name</label>
                <input
                  type="text"
                  placeholder="e.g. Legal Agreement, Vendor Onboarding, ISO Quality Report..."
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Target Division</label>
                <select
                  value={newTypeDivision}
                  onChange={(e) => setNewTypeDivision(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="VCC">VCC Division</option>
                  <option value="SD">SD Division</option>
                  <option value="ACC">ACC Division</option>
                  <option value="ATC">ATC Division</option>
                </select>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-600">Approval Workflow Stages</label>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Stage 1</span>
                    <input
                      type="text"
                      value={newTypeStage1}
                      onChange={(e) => setNewTypeStage1(e.target.value)}
                      placeholder="Stage 1 Name (e.g. Department Review)"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Stage 2</span>
                    <input
                      type="text"
                      value={newTypeStage2}
                      onChange={(e) => setNewTypeStage2(e.target.value)}
                      placeholder="Stage 2 Name (e.g. Internal Audit)"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">Stage 3</span>
                    <input
                      type="text"
                      value={newTypeStage3}
                      onChange={(e) => setNewTypeStage3(e.target.value)}
                      placeholder="Stage 3 Name (e.g. Executive Sign-off)"
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowNewTypeModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomDocType}
                disabled={!newTypeName.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                Create &amp; Select Stream
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
