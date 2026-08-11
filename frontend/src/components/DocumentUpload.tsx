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

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedDocType, setSelectedDocType] = useState<string>("AP Invoice");

  // Synced Staging Upload States
  const [isSyncedUpload, setIsSyncedUpload] = useState(false);
  const [syncedDocs, setSyncedDocs] = useState<any[]>([]);
  const [selectedSyncedDocId, setSelectedSyncedDocId] = useState<string>("");
  const [syncedLoading, setSyncedLoading] = useState(false);
  const [taxData, setTaxData] = useState({
    cgst: "0",
    sgst: "0",
    igst: "0"
  });

  const handleSelectSyncedDoc = (doc: any) => {
    setSelectedSyncedDocId(doc.id);
    setManualData({
      vendorName: doc.vendor_name || "",
      invoiceNumber: doc.invoice_number || "",
      amount: String(doc.amount || ""),
      poNumber: doc.po_number || "",
      invoiceDate: doc.invoice_date ? doc.invoice_date.split("T")[0] : new Date().toISOString().split("T")[0]
    });
    setTaxData({
      cgst: String(doc.cgst || 0),
      sgst: String(doc.sgst || 0),
      igst: String(doc.igst || 0)
    });
    setSelectedDocType(doc.document_type || "AP Invoice");
  };

  React.useEffect(() => {
    if (isSyncedUpload) {
      const fetchSyncedDocs = async () => {
        setSyncedLoading(true);
        try {
          const token = localStorage.getItem("token") || localStorage.getItem("authToken");
          const res = await fetch("/api/documents/synced-pending", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {}
          });
          if (res.ok) {
            const data = await res.json();
            setSyncedDocs(data);
            if (data.length > 0) {
              handleSelectSyncedDoc(data[0]);
            } else {
              setSelectedSyncedDocId("");
            }
          }
        } catch (e) {
          console.error("Failed to load synced records:", e);
        }
        setSyncedLoading(false);
      };
      fetchSyncedDocs();
    }
  }, [isSyncedUpload]);

  React.useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch("/api/templates", {
          headers: token ? { "Authorization": `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setTemplates(data);
          if (data.length > 0) {
            const defaultTemplate = data.find((t: any) => t.name.toLowerCase().includes("invoice")) || data[0];
            setSelectedDocType(defaultTemplate.name);
          }
        }
      } catch (err) {
        console.error("Error loading templates in upload:", err);
      }
    };
    fetchTemplates();
  }, []);

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
      formData.append("document_type", selectedDocType);
      
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
      
      let fetchUrl = "/api/documents/upload";
      if (isSyncedUpload && selectedSyncedDocId) {
        fetchUrl = `/api/documents/upload-and-route/${selectedSyncedDocId}`;
        formData.append("vendorName", manualData.vendorName);
        formData.append("invoiceNumber", manualData.invoiceNumber);
        formData.append("amount", manualData.amount);
        formData.append("invoiceDate", manualData.invoiceDate);
        formData.append("poNumber", manualData.poNumber);
        formData.append("cgst", taxData.cgst);
        formData.append("sgst", taxData.sgst);
        formData.append("igst", taxData.igst);
      }
      
      // Run file upload in background asynchronously
      fetch(fetchUrl, {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        body: formData,
      }).then(async (response) => {
        if (response.ok) {
          const doc = await response.json();
          const newDoc = doc.invoice || doc;
          onUploadSuccess(newDoc);
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

      {/* Ingestion Type Toggles */}
      {!loading && !uploadedDoc && !pendingFile && (
        <div className="flex bg-slate-100 p-1 rounded-xl max-w-sm mx-auto mb-2 border border-slate-200/60">
          <button
            onClick={() => setIsSyncedUpload(false)}
            className={`flex-1 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-lg transition-all cursor-pointer ${
              !isSyncedUpload 
                ? "bg-white text-blue-600 shadow-sm border border-slate-205/30" 
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Direct File Ingest
          </button>
          <button
            onClick={() => setIsSyncedUpload(true)}
            className={`flex-1 text-[10px] font-extrabold uppercase tracking-wider py-2 px-3 rounded-lg transition-all cursor-pointer ${
              isSyncedUpload 
                ? "bg-white text-blue-600 shadow-sm border border-slate-205/30" 
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Attach to Staging
          </button>
        </div>
      )}

      {/* Document Type Selector or Synced Data Selector */}
      {!loading && !uploadedDoc && !pendingFile && (
        !isSyncedUpload ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-505">
              Document Type to Upload
            </label>
            <div className="relative">
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-850 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition appearance-none"
              >
                {templates.length > 0 ? (
                  templates.map((t: any) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="AP Invoice">AP Invoice</option>
                    <option value="AP DEBIT NOTE">AP DEBIT NOTE</option>
                    <option value="NON - RETURNABLE">NON - RETURNABLE</option>
                    <option value="JOURNAL ENTRY">JOURNAL ENTRY</option>
                    <option value="VCC PURCHASE INVOICE">VCC PURCHASE INVOICE</option>
                    <option value="AR CREDITNOTE">AR CREDITNOTE</option>
                    <option value="PROJECT BUDGET">PROJECT BUDGET</option>
                    <option value="OCR AND INHOUSE OCR">OCR AND INHOUSE OCR</option>
                  </>
                )}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              This selects the target metadata schema and approval workflow rules for the uploaded file.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Select Synced Staging Record
              </label>
              {syncedLoading ? (
                <div className="flex items-center space-x-2 text-[10px] text-slate-500 font-semibold p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span>Pulling pending staging data...</span>
                </div>
              ) : syncedDocs.length === 0 ? (
                <div className="text-[10px] text-amber-600 font-semibold p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <span>No pending synced staging records found.</span>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedSyncedDocId}
                    onChange={(e) => {
                      const doc = syncedDocs.find(d => d.id === e.target.value);
                      if (doc) handleSelectSyncedDoc(doc);
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition appearance-none"
                  >
                    {syncedDocs.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.vendor_name || "Staging Ingest"} - #{doc.invoice_number || doc.id} (₹{doc.amount})
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                    <Database className="h-4 w-4" />
                  </div>
                </div>
              )}
            </div>

            {selectedSyncedDocId && (
              <div className="border-t border-slate-100 pt-3 space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-extrabold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500 animate-pulse" /> 
                  <span>Synced Metadata Details</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                      Supplier/Company Name
                    </label>
                    <input
                      type="text"
                      value={manualData.vendorName}
                      onChange={(e) => setManualData({ ...manualData, vendorName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      value={manualData.invoiceNumber}
                      onChange={(e) => setManualData({ ...manualData, invoiceNumber: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                      PO Number
                    </label>
                    <input
                      type="text"
                      value={manualData.poNumber}
                      onChange={(e) => setManualData({ ...manualData, poNumber: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                      Invoice Date
                    </label>
                    <input
                      type="date"
                      value={manualData.invoiceDate}
                      onChange={(e) => setManualData({ ...manualData, invoiceDate: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2 border-t border-slate-100 pt-2 grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                        Amount Due (₹)
                      </label>
                      <input
                        type="number"
                        value={manualData.amount}
                        onChange={(e) => setManualData({ ...manualData, amount: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-extrabold text-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                        CGST (₹)
                      </label>
                      <input
                        type="number"
                        value={taxData.cgst}
                        onChange={(e) => setTaxData({ ...taxData, cgst: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                        SGST (₹)
                      </label>
                      <input
                        type="number"
                        value={taxData.sgst}
                        onChange={(e) => setTaxData({ ...taxData, sgst: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-semibold text-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

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
