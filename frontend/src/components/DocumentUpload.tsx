import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, ArrowRight, AlertCircle, Loader2, Sparkles, ShieldCheck, Database, Layers } from "lucide-react";

interface DocumentUploadProps {
  onUploadSuccess: (newDoc: any) => void;
  setCurrentView: (view: string) => void;
  setSelectedDocId: (id: string) => void;
}

const reassuranceSteps = [
  "Initializing physical binary stream transfer...",
  "Loading spatial coordinate model buffers...",
  "Executing spatial document layout scanning...",
  "Synthesizing vendor horizontal segment nodes...",
  "Mapping coordinates into structural transaction fields...",
  "Querying purchase orders (PO) against corporate AP directory...",
  "Validating tax rates and unit parameters dynamically...",
  "Registering transaction stream for downstream approvals..."
];

export default function DocumentUpload({ onUploadSuccess, setCurrentView, setSelectedDocId }: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMsgIndex, setProgressMsgIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<any>(null);
  const [useAIExtraction, setUseAIExtraction] = useState(true);
  const [manualData, setManualData] = useState({
    vendorName: "",
    invoiceNumber: "",
    amount: "",
    poNumber: "",
    invoiceDate: new Date().toISOString().split("T")[0]
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showExtractConfirmModal, setShowExtractConfirmModal] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Rotate reassurance loading messages to keep user engaged
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
    }, 2000);
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
        setErrorMsg("Forbidden format. Please upload invoice assets as PDF files only.");
        return;
      }
      if (file.size > 60 * 1024 * 1024) {
        setErrorMsg("File size exceeds the 60MB limit. Please upload a smaller file.");
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
        setErrorMsg("Forbidden format. Please upload invoice assets as PDF files only.");
        return;
      }
      if (file.size > 60 * 1024 * 1024) {
        setErrorMsg("File size exceeds the 60MB limit. Please upload a smaller file.");
        return;
      }
      setPendingFile(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    const allowedTypes = ["application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setErrorMsg("Forbidden format. Please upload invoice assets as PDF files only.");
      return;
    }

    if (file.size > 60 * 1024 * 1024) {
      setErrorMsg("File size exceeds the 60MB limit. Please upload a smaller file.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const token = localStorage.getItem("authToken");
      
      // Run file upload in background asynchronously
      fetch("/api/documents/upload", {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formData,
      }).then(async (response) => {
        if (response.ok) {
          const doc = await response.json();
          onUploadSuccess(doc);
        }
      }).catch(err => {
        console.error("Background upload failed:", err);
      });

      // Redirect immediately to dashboard
      setCurrentView("dashboard");
    } catch (err: any) {
      console.error("Upload initialization failed:", err);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 py-2 animate-fadeIn">
      {/* Visual Header Banner */}
      <div className="text-center space-y-1.5">

        <h2 className="font-display font-extrabold text-slate-800 text-xl tracking-tight mt-1">
          Upload Document
        </h2>
        <p className="text-slate-500 font-sans text-xs max-w-sm mx-auto leading-relaxed">
          Simply drop your document below. Our extraction engine will instantly read the layout and pull the transaction data for you.
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-6 shadow-sm">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-10 w-10 bg-blue-100 rounded-full animate-ping opacity-60"></div>
            <Loader2 className="h-10 w-10 text-blue-600 animate-spin relative z-10" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h3 className="font-bold text-slate-800 text-sm">Orchestrating Ingestion Engine</h3>
            <p className="text-slate-400 font-medium text-[11px]">Executing spatial parsing sequences. Est: 3-5 seconds.</p>
          </div>
          <div className="bg-slate-900 px-5 py-3 rounded-xl border border-slate-800 w-full max-w-md font-mono text-[11px] text-blue-400 animate-pulse text-center">
            &gt;&gt; {reassuranceSteps[progressMsgIndex]}
          </div>
        </div>
      ) : uploadedDoc ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-6 shadow-sm">
          <div className="mx-auto bg-green-50 h-12 w-12 text-green-600 rounded-full flex items-center justify-center border border-green-100">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display font-extrabold text-slate-800 text-lg">Parsing Sequence Complete!</h3>
            <p className="text-slate-405 font-mono text-[11px]">IDENTIFIERS BOUND: <span className="text-slate-700 font-bold">{uploadedDoc.file_name || (uploadedDoc.file_path ? uploadedDoc.file_path.split('/').pop() : "Unknown")}</span></p>
          </div>

          <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-200/60 max-w-md mx-auto text-left text-xs space-y-3 font-sans shadow-inner">
            <div className="flex justify-between">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Tracking ID:</span> 
              <span className="text-slate-800 font-bold font-mono">{uploadedDoc.invoice_number}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200/60 pt-3">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Registry Ref:</span> 
              <span className="text-slate-600 font-mono text-[10px]">{uploadedDoc.id}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200/60 pt-3">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Vendor Name:</span> 
              <span className="text-slate-850 font-extrabold">{uploadedDoc.vendor_name || "Extracted"}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200/60 pt-3">
              <span className="text-slate-400 font-medium uppercase text-[10px]">Status:</span> 
              <span className="text-blue-600 font-bold uppercase text-[10px] bg-blue-50/50 px-2 py-0.5 rounded-md border border-blue-100/50">DISPATCHED ✔</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto pt-2">
            <button
              onClick={() => {
                setSelectedDocId(uploadedDoc.id);
                setCurrentView("dashboard");
              }}
              className="w-full sm:w-1/2 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-650 font-bold text-xs uppercase tracking-wider transition"
            >
              Ledger Repository
            </button>
            <button
              onClick={() => {
                setSelectedDocId(uploadedDoc.id);
                setCurrentView("details");
              }}
              className="w-full sm:w-1/2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition rounded-xl flex items-center justify-center space-x-2 shadow-md shadow-blue-500/10"
            >
              <span>Verify extracted data</span>
              <ArrowRight className="h-4 w-4" />
            </button>                        
          </div>
        </div>
      ) : pendingFile ? (
        <div className="backdrop-blur-xl border border-slate-200 bg-white rounded-[2rem] p-10 text-center relative overflow-hidden flex flex-col items-center justify-center space-y-5 shadow-sm min-h-[200px]">
          {/* File Info Card */}
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

          <div className="flex gap-3 w-full max-w-xs justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPendingFile(null);
              }}
              className="px-5 py-2 bg-slate-100 hover:bg-slate-200 active:bg-slate-250 text-slate-700 font-semibold rounded-xl text-xs transition duration-200"
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
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 text-white font-semibold rounded-xl text-xs transition-all duration-200 shadow-md shadow-blue-500/10 hover:shadow-lg hover:shadow-blue-500/20 flex items-center justify-center space-x-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Extract</span>
            </button>
          </div>
        </div>
      ) : (
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
          {/* Animated Glow Background on Hover */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-400/0 via-blue-400/0 to-blue-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

          <div className="relative">
            <div className="absolute -inset-4 bg-blue-200 rounded-full opacity-0 group-hover:opacity-60 group-hover:scale-125 transition-all duration-700 blur-xl"></div>
            <div className="bg-gradient-to-br from-white to-blue-50 text-blue-600 h-16 w-16 rounded-full flex items-center justify-center border-4 border-white shadow-[0_4px_20px_rgb(59,130,246,0.15)] group-hover:scale-110 group-hover:-translate-y-2 transition-transform duration-500 relative z-10 mx-auto">
              <Upload className="h-7 w-7 group-hover:animate-bounce" />
            </div>
          </div>

          <div className="space-y-1.5 max-w-sm relative z-10">
            <p className="font-display text-sm font-bold text-slate-800">
              Drag & drop your files here
            </p>
            <p className="text-[11px] text-slate-500 font-medium">
              or <span className="text-blue-600 font-semibold hover:text-blue-700 underline decoration-blue-200 underline-offset-4 transition">browse your computer</span>
            </p>
            <div className="pt-2 flex items-center justify-center gap-3 text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3"/> PDF ONLY</span>
              <span className="flex items-center gap-1"><Database className="h-3 w-3"/> Max 60MB</span>
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
            <span className="font-extrabold uppercase text-[10px] tracking-wide block">Extraction sequence interrupted</span>
            <span>{errorMsg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
