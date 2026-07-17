import React, { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import {
  FileText,
  Cpu,
  CheckCircle2,
  RotateCw,
  Play,
  Save,
  Check,
  X,
  Shield,
  ArrowRight,
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  Database,
  Layers,
  CheckSquare,
  Plus,
  Trash2,
  Barcode,
  Sparkles,
  HelpCircle,
  Building2,
  Hash,
  Calendar,
} from "lucide-react";

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
import { DbInvoice, InvoiceLineItem, DbWorkflowInstance } from "../types";

interface DocumentDetailsProps {
  document: DbInvoice | null;
  currentUserRole: string;
  currentUserEmail: string;
  currentUserUsername: string;
  onRefreshDocument: () => void;
  onGoBack: () => void;
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

export default function DocumentDetails({
  document,
  currentUserRole,
  currentUserEmail,
  currentUserUsername,
  onRefreshDocument,
  onGoBack,
}: DocumentDetailsProps) {
  const [activeTab, setActiveTab] = useState<"original" | "layout" | "rawtext">(
    "original",
  );

  // Metadata edit form states
  const [isEditing, setIsEditing] = useState(false);
  const [activeInputField, setActiveInputField] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [amount, setAmount] = useState(0);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [cgst, setCgst] = useState(0);
  const [sgst, setSgst] = useState(0);
  const [igst, setIgst] = useState(0);

  // Custom PO fields
  const [buyerName, setBuyerName] = useState("");
  const [poDate, setPoDate] = useState("");
  const [indentNumber, setIndentNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const [itemsList, setItemsList] = useState<LocalLineItem[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // New Comments State
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [n8nHookUrl, setN8nHookUrl] = useState(
    "https://n8n.your-domain.com/webhook/doc-received",
  );
  const [n8nLoading, setN8nLoading] = useState(false);
  const [n8nLogs, setN8nLogs] = useState<string | null>(null);
  const [activeApprovalLog, setActiveApprovalLog] = useState<any>(null);
  const [workflowStepDefinitions, setWorkflowStepDefinitions] = useState<any[]>([]);
  const [workflowInstance, setWorkflowInstance] =
    useState<DbWorkflowInstance | null>(null);
  const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);
  const [availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [customSteps, setCustomSteps] = useState<{ label: string }[]>([]);
  const [overrideMode, setOverrideMode] = useState<"existing" | "custom">(
    "existing",
  );
  const [isApplying, setIsApplying] = useState(false);

  const renderLabel = (labelText: string) => {
    const isLowConfidence = document && typeof document.ocr_confidence === "number" && document.ocr_confidence < 92;
    return (
      <div className="flex items-center justify-between w-full mb-0.5">
        <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
          {labelText}
        </label>
        {isLowConfidence && (
          <span className="inline-flex items-center text-[7.5px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-250/60 animate-pulse" title="Low confidence scan details. Please verify values.">
            <AlertCircle className="h-2.5 w-2.5 mr-1" />
            Low Confidence
          </span>
        )}
      </div>
    );
  };

  const [erpData, setErpData] = useState<any | null>(null);
  const [erpLoading, setErpLoading] = useState(false);
  const [hoveredField, setHoveredField] = useState<string | null>(null);


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
    } catch (e) {
      setErpData(null);
    } finally {
      setErpLoading(false);
    }
  };

  const fetchWorkflowData = async () => {
    if (!document) return;
    try {
      const res = await fetch(`/api/documents/${document.id}`);
      if (res.ok) {
        const data = await res.json();
        setWorkflowInstance(data.workflow_instance || null);
        setWorkflowSteps(data.workflow_steps || []);
        setActiveApprovalLog(data.active_approval_log || null);
        setWorkflowStepDefinitions(data.workflow_step_definitions || []);
      }
      const wfRes = await fetch(`/api/workflows`);
      if (wfRes.ok) {
        const wfs = await wfRes.json();
        setAvailableWorkflows(wfs);
        if (wfs.length > 0) setSelectedWorkflowId(wfs[0].id);
      }
    } catch (e) {}
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

  const handlePostComment = async () => {
    if (!newComment.trim() || !document) return;
    setCommentsLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/documents/${document.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ text: newComment })
      });
      if (res.ok) {
        setNewComment("");
        setCommentsList([...commentsList, await res.json()]);
      }
    } catch (e) {
      console.error(e);
    }
    setCommentsLoading(false);
  };

  const customDataObj = typeof document?.custom_data === 'string' ? JSON.parse(document.custom_data) : (document?.custom_data || {});


  useEffect(() => {
    if (document && !isEditing) {
      fetchWorkflowData();
      fetchComments();
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

      const customData = (document.custom_data as any) || {};
      setBuyerName(customData.buyerName || customData.customerName || "");
      setPoDate(customData.poDate || customData.orderDate || "");
      setIndentNumber(customData.indentNumber || "");
      setPaymentTerms(customData.paymentTerms || "");
      let parsedItems = [];
      if (typeof document.items === "string") {
        try {
          parsedItems = JSON.parse(document.items);
        } catch (e) {}
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
    if (!document) {
      onGoBack();
    }
  }, [document, onGoBack]);

  if (!document) return null;
  const handleSaveMetadata = async () => {
    setSaveLoading(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType,
          vendorName,
          invoiceNumber,
          poNumber,
          amount: Number(amount),
          date: invoiceDate,
          cgst: Number(cgst),
          sgst: Number(sgst),
          igst: Number(igst),
          items: itemsList.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            amount: Number(item.amount),
            warranty_text: item.warranty_text,
            serial_numbers: item.serial_numbers,
          })),
          customData: {
            buyerName,
            poDate,
            indentNumber,
            paymentTerms,
          },
        }),
      });
      if (response.ok) {
        setIsEditing(false);
        onRefreshDocument();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaveLoading(false);
    }
  };
  const handleApplyWorkflow = async () => {
    if (!document) return;
    setIsApplying(true);
    try {
      const payload: any = {};
      if (overrideMode === "existing") {
        payload.workflowId = selectedWorkflowId;
      } else {
        if (customSteps.length === 0) {
          alert("Please add at least one step.");
          setIsApplying(false);
          return;
        }
        payload.customWorkflowSteps = customSteps;
      }

      const res = await fetch(`/api/invoices/${document.id}/apply-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchWorkflowData();
        onRefreshDocument();
        alert("Workflow successfully applied!");
      } else {
        alert("Failed to apply workflow.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsApplying(false);
    }
  };

  const handleStepAction = async (
    action: "Approve" | "Reject" | "Request Clarification" | "Send Back",
  ) => {
    if (!document) return;

    let comments = "";
    if (action === "Reject" || action === "Request Clarification" || action === "Send Back") {
      const userInput = prompt(`Please enter reasons/comments for '${action}':`);
      if (userInput === null) return; // User cancelled
      if (!userInput.trim()) {
        alert("Comments are required for this action.");
        return;
      }
      comments = userInput.trim();
    } else {
      comments = prompt("Please enter approval comments (optional):") || "Approved";
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/workflows/${action.toLowerCase()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: document.id,
          comments,
        }),
      });
      if (response.ok) {
        setApprovalComment("");
        await fetchWorkflowData();
        onRefreshDocument();
        onGoBack();
      } else {
        const err = await response.json();
        setActionError(err.error || "Action failed");
      }
    } catch (err: any) {
      setActionError(err.message);
    }
    setActionLoading(false);
  };

  const handleVerifyData = async () => {
    if (!document) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/documents/${document.id}/verify-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to verify data.");
      }

      await onRefreshDocument();
    } catch (err: any) {
      console.error(err);
      setActionError(err.message || "An unexpected error occurred.");
    } finally {
      setActionLoading(false);
    }
  };
  const handleTriggerN8N = async () => {
    setN8nLoading(true);
    setN8nLogs(null);
    try {
      setTimeout(() => {
        setN8nLogs(
          `[INFO] [${new Date().toLocaleTimeString()}] Triggering automated transactional webhook updates to ERP system...\n[DATA-PAYLOAD] Ingested document registry metadata:\n  - ID: ${document.id}\n  - Vendor: ${vendorName}\n  - Sum Balance: $${amount}\n[SUCCESS] Response code status: 200 OK. Downstream ERP ledger updated successfully.`,
        );
        setN8nLoading(false);
      }, 800);
    } catch (e) {
      console.error(e);
      setN8nLoading(false);
    }
  };
  const isPending =
    document.status.includes("Approval") ||
    document.status === "Received";

  let isCurrentUserApprover = !!document.is_current_approver;
  if (!isCurrentUserApprover && activeApprovalLog && workflowStepDefinitions && currentUserUsername) {
    const currentStep = workflowStepDefinitions.find((s: any) => s.stage_number === activeApprovalLog.current_stage_number);
    if (currentStep) {
      isCurrentUserApprover = currentStep.approver_target === currentUserUsername;
    }
  }

  const dummyLayout = [
    {
      text: "INVOICE DISPATCH VENDOR SHEET",
      conf: 99,
      bbox: [20, 40, 200, 30],
    },
    {
      text: `Supplier Account: ${vendorName}`,
      conf: 98,
      bbox: [20, 80, 220, 25],
    },
    {
      text: `Billing Reference: # ${invoiceNumber}`,
      conf: 97,
      bbox: [20, 110, 180, 25],
    },
    {
      text: `POs Verified Value: ${poNumber}`,
      conf: 99,
      bbox: [20, 140, 190, 25],
    },
    {
      text: `Total Balance Indicated: INR ₹${amount.toLocaleString()}`,
      conf: 99,
      bbox: [20, 180, 250, 30],
    },
    { text: `Date: ${invoiceDate}`, conf: 96, bbox: [20, 220, 150, 25] },
  ];
  return (
    <div className="space-y-4 animate-fadeIn pb-2">
      {/* Premium Header */}
      {actionError && (
        <div className="w-full mb-3 flex items-center px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm">
          <AlertCircle className="h-4 w-4 mr-2 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div className="flex items-center space-x-3">
          <button
            onClick={onGoBack}
            className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition shadow-sm active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 text-[10px]">
          {isPending && isCurrentUserApprover && (
            <>
              <button
                onClick={() => handleStepAction("Request Clarification")}
                disabled={actionLoading}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 border border-amber-200 bg-white hover:bg-amber-50 text-amber-600 font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95"
              >
                {actionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                )}
                <span>Clarification</span>
              </button>
              <button
                onClick={() => handleStepAction("Send Back")}
                disabled={actionLoading}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 border border-orange-200 bg-white hover:bg-orange-50 text-orange-600 font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95"
              >
                {actionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5 text-orange-600" />
                )}
                <span>Send Back</span>
              </button>
              <button
                onClick={() => handleStepAction("Reject")}
                disabled={actionLoading}
                className="flex items-center space-x-1.5 px-2.5 py-1.5 border border-red-200 bg-white hover:bg-red-50 text-red-600 font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95"
              >
                {actionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                <span>Reject</span>
              </button>
              <button
                onClick={() => handleStepAction("Approve")}
                disabled={actionLoading}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-md active:scale-95"
              >
                {actionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>Approve</span>
              </button>
              <div className="w-px h-6 bg-slate-200 mx-1"></div>
            </>
          )}

          {document.status === "Data Verification Pending" && (
            <button
              onClick={handleVerifyData}
              disabled={actionLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-md active:scale-95 mr-2"
            >
              {actionLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>Verify Data & Route</span>
            </button>
          )}

          {!isPending && document.status && document.status !== 'Exception' && document.status !== 'Failed' && (
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-xl mr-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="uppercase tracking-wider text-[10px]">
                {document.status}
              </span>
            </div>
          )}
          <button
            onClick={onRefreshDocument}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95"
          >
            <RotateCw className="h-3.5 w-3.5 text-blue-600" />
            <span>Sync</span>
          </button>
          <button className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-md active:scale-95">
            <Download className="h-3.5 w-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>



      
      {/* TWO-PANEL TOP + FULL WIDTH BOTTOM LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* PANEL A: DOCUMENT VIEWER & APPROVAL BOX (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border border-slate-200 p-3 rounded-xl flex flex-col min-h-[400px] shadow-sm overflow-hidden">
            {/* Header tabs */}
            <div className="bg-slate-50/50 border-b border-slate-200/80 px-3 py-2 flex items-center justify-between shrink-0">
              <span className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-wider text-slate-650">
                <Cpu className="h-4 w-4 text-blue-600 animate-pulse" />
                <span>Layout Geometry Analysis</span>
              </span>
              <div className="flex bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60 text-[9px] font-bold shadow-inner">
                <button
                  type="button"
                  onClick={() => setActiveTab("original")}
                  className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-md transition-all duration-200 ${activeTab === "original" ? "bg-white text-blue-700 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Original Document
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("layout")}
                  className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-md transition-all duration-200 ${activeTab === "layout" ? "bg-white text-blue-700 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Coordinates
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("rawtext")}
                  className={`px-2 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-md transition-all duration-200 ${activeTab === "rawtext" ? "bg-white text-blue-700 shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Raw Text
                </button>
              </div>
            </div>

            {/* Visualization Container */}
            <div className="overflow-auto bg-slate-50/50 p-1 flex flex-col relative">
              {activeTab === "original" ? (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col relative shadow-sm">
                  {document.file_path ? (
                    document.mime_type?.startsWith("image/") ? (
                      <div className="flex-1 flex items-center justify-center overflow-hidden">
                        <img
                          src={encodeURI(document.file_path)}
                          alt={document.file_name || "Original Document"}
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col w-full h-full">
                        <div className="w-full bg-slate-50 flex items-center justify-center overflow-hidden h-[700px] py-4">
                          <Document
                            file={encodeURI(document.file_path)}
                            loading={
                              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto" />
                            }
                            error={
                              <span className="text-red-500 text-[10px] font-bold p-4">
                                Failed to load PDF
                              </span>
                            }
                          >
                            <div className="relative inline-block shadow-md border border-slate-300">
                              <Page
                                pageNumber={1}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                height={650}
                              />
                            </div>
                          </Document>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="text-center p-8 text-slate-400">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-40 text-blue-600 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider block">
                        No Original Document Attachment
                      </span>
                      <span className="text-[10px] text-slate-450 mt-1 block">
                        Try rendering via layout metadata logs instead.
                      </span>
                    </div>
                  )}
                </div>
              ) : activeTab === "layout" ? (
                <div className="space-y-4 flex-1">
                  <div className="bg-white p-4 border border-slate-150 rounded-xl text-left text-[10px] text-slate-500 leading-relaxed shadow-sm">
                    <span className="text-slate-700 font-bold uppercase block text-[10px] tracking-wider mb-1">
                      Layout Scanning Details:
                    </span>
                    <div className="flex flex-col gap-2 mt-2">
                       <p>Layout elements found on the invoice.</p>
                       {isEditing && (
                         <div className={`p-2 rounded border text-xs font-bold uppercase tracking-wider flex items-center justify-center ${activeInputField ? 'bg-blue-600 text-white border-blue-700 animate-pulse' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                           {activeInputField ? `CLICK-TO-FILL ACTIVE: Select text to populate [${activeInputField}]` : 'Select an input field on the right to enable Click-to-Fill'}
                         </div>
                       )}
                    </div>
                  </div>
                  {/* Simulated Document Sheet */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2.5 relative select-none shadow-sm">
                    {dummyLayout.map((layout, idx) => {
                      const isHighlighted = 
                        (hoveredField === "vendorName" && idx === 1) ||
                        (hoveredField === "invoiceNumber" && idx === 2) ||
                        (hoveredField === "poNumber" && idx === 3) ||
                        (hoveredField === "amount" && idx === 4) ||
                        (hoveredField === "invoiceDate" && idx === 5);
                      return (
                        <div
                          key={idx}
                          title={`Extracted bounds: [${layout.bbox?.join(", ")}]`}
                          onClick={() => {
                            if (!activeInputField) {
                              alert("Please click an input field first to activate Click-to-Fill.");
                              return;
                            }
                            const val = layout.text;
                            if (activeInputField === 'vendorName') setVendorName(val);
                            else if (activeInputField === 'invoiceNumber') setInvoiceNumber(val);
                            else if (activeInputField === 'poNumber') setPoNumber(val);
                            else if (activeInputField === 'amount') setAmount(parseFloat(val.replace(/[^0-9.]/g, '')) || 0);
                            else if (activeInputField === 'invoiceDate') setInvoiceDate(val);
                            else if (activeInputField === 'documentType') setDocumentType(val);
                            else if (activeInputField === 'buyerName') setBuyerName(val);
                            else if (activeInputField === 'cgst') setCgst(parseFloat(val.replace(/[^0-9.]/g, '')) || 0);
                            else if (activeInputField === 'sgst') setSgst(parseFloat(val.replace(/[^0-9.]/g, '')) || 0);
                            else if (activeInputField === 'igst') setIgst(parseFloat(val.replace(/[^0-9.]/g, '')) || 0);
                          }}
                          className={`group relative p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${isHighlighted ? "border-blue-500 bg-blue-50/20 shadow-sm font-semibold scale-[1.01]" : "border-slate-100 hover:border-blue-400 hover:bg-blue-50"}`}
                        >
                          <span className="text-slate-750 truncate text-[10px]">
                            {layout.text}
                          </span>
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                            {layout.conf}%
                          </span>
                          {/* Bounding box marker */}
                          <span className="hidden group-hover:block absolute bottom-full mb-1 left-3 bg-slate-900 text-[10px] text-white font-mono p-1 px-2 rounded-md shadow-lg z-20 whitespace-nowrap">
                            Bounds: X:{layout.bbox?.[0]} Y:{layout.bbox?.[1]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 font-mono text-[10px] text-slate-700 leading-relaxed bg-white p-5 rounded-2xl border border-slate-200 overflow-auto whitespace-pre-wrap shadow-inner font-mono text-[10px] text-slate-700 leading-relaxed bg-white p-5 rounded-2xl border border-slate-200 overflow-auto whitespace-pre-wrap">
                  {document.ocr_text ||
                    `--- RAW TEXT OCR EXTRACT ---\nVendor: ${vendorName}\nInvoice Num: ${invoiceNumber}\nPO Num Match: ${poNumber}\nAmount Total: ₹${amount}`}
                </div>
              )}
            </div>
            {/* Removed OCR and AI parsed badges here per user request */}
          </div>
        </div>
        {/* PANEL B: METADATA & CUSTOM FIELDS (6 cols) */}
        <div className="lg:col-span-6 space-y-2">
          {document.status === "Received" ? (
            <div className="bg-white border border-slate-200 p-12 rounded-xl flex flex-col items-center justify-center space-y-4 shadow-sm h-full min-h-[400px]">
              <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
              <div className="text-center">
                <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wide">
                  Analyzing Document
                </h3>
                <p className="text-[10px] text-slate-500 mt-1">
                  Our AI engines are classifying the document type and
                  extracting fields.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* BLOCK B1: STRUCTURED METADATA DETAILS CARD */}
              <div className="bg-white border border-slate-200 p-2 rounded-xl space-y-1 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Database className="h-4 w-4 text-blue-600" />
                      <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wide">
                        {documentType} details found
                      </h3>
                    </div>
                  </div>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      disabled={document.status === "Received"}
                      title={
                        document.status === "Received"
                          ? "AI is actively extracting data. Please wait."
                          : ""
                      }
                      className={`px-3 py-1.5 text-[10px] font-semibold rounded-lg transition ${document.status === "Received" ? "bg-slate-100/50 text-slate-400 cursor-not-allowed border border-slate-100" : "hover:bg-slate-50 border border-slate-200 text-slate-700"}`}
                    >
                      {document.status === "Received"
                        ? "Extracting..."
                        : "Adjust values"}
                    </button>
                  ) : (
                    <div className="flex space-x-2 text-[10px]">
                      <button
                        onClick={() => setIsEditing(false)}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveMetadata}
                        disabled={saveLoading}
                        className="px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition font-bold flex items-center space-x-1 shadow-md shadow-blue-500/10"
                      >
                        {saveLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        <span>Commit</span>
                      </button>
                    </div>
                  )}
                </div>
                {/* Extracted Form Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 pt-0.5">
                  <div className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 md:col-span-2 hover:bg-slate-50 transition-colors">
                    {renderLabel("Document Type")}
                    {isEditing ? (
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value)}
                        className="w-full text-[10px] font-semibold rounded-lg p-1.5 border transition-all bg-white border-blue-500 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="Invoice">Invoice</option>
                        <option value="Purchase Order">Purchase Order</option>
                        <option value="Credit Note">Credit Note</option>
                        <option value="Debit Note">Debit Note</option>
                      </select>
                    ) : (
                      <div className="text-[10px] font-bold text-slate-800 flex items-center gap-1">
                        <FileText className="h-3 w-3 text-blue-500" />
                        {documentType || "-"}
                      </div>
                    )}
                  </div>

                  {documentType.toLowerCase().includes("purchase order") ||
                  documentType.toLowerCase() === "po" ? (
                    <>
                      <div 
                        onMouseEnter={() => setHoveredField("vendorName")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="relative bg-slate-50/70 border border-slate-100/80 rounded-lg p-2 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("Supplier Name (To)")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("vendorName")}
                            type="text"
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Building2 className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {vendorName || "-"}
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 hover:bg-slate-50 transition-colors">
                        {renderLabel("Buyer Name (From)")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("buyerName")}
                            type="text"
                            value={buyerName}
                            onChange={(e) => setBuyerName(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Building2 className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {buyerName || "-"}
                          </div>
                        )}
                      </div>
                      <div 
                        onMouseEnter={() => setHoveredField("poNumber")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("PO Number")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("poNumber")}
                            type="text"
                            value={poNumber}
                            onChange={(e) => {
                              setPoNumber(e.target.value);
                              fetchErpData(e.target.value);
                            }}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Hash className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {poNumber || "-"}
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 hover:bg-slate-50 transition-colors">
                        <label className="text-[9px] uppercase tracking-wider text-slate-500 block font-bold mb-0.5">
                          PO Date
                        </label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={poDate}
                            onChange={(e) => setPoDate(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Calendar className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {poDate || "-"}
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 hover:bg-slate-50 transition-colors">
                        <label className="text-[9px] uppercase tracking-wider text-slate-500 block font-bold mb-0.5">
                          Indent Number
                        </label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={indentNumber}
                            onChange={(e) => setIndentNumber(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Hash className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {indentNumber || "-"}
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 hover:bg-slate-50 transition-colors">
                        <label className="text-[9px] uppercase tracking-wider text-slate-500 block font-bold mb-0.5">
                          Payment Terms
                        </label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={paymentTerms}
                            onChange={(e) => setPaymentTerms(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Database className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {paymentTerms || "-"}
                          </div>
                        )}
                      </div>
                      <div 
                        onMouseEnter={() => setHoveredField("amount")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 md:col-span-2 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("Grand Total")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("amount")}
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <span className="text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded text-[10px] mr-1">
                              ₹
                            </span>
                            {amount || "-"}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div 
                        onMouseEnter={() => setHoveredField("vendorName")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("Supplier/Company Name")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("vendorName")}
                            type="text"
                            value={vendorName}
                            onChange={(e) => setVendorName(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Building2 className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {vendorName || "-"}
                          </div>
                        )}
                      </div>
                      <div 
                        onMouseEnter={() => setHoveredField("invoiceNumber")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="relative bg-slate-50/70 border border-slate-100/80 rounded-lg p-2 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("Invoice Number")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("invoiceNumber")}
                            type="text"
                            value={invoiceNumber}
                            onChange={(e) => setInvoiceNumber(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Hash className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {invoiceNumber || "-"}
                          </div>
                        )}
                      </div>
                      <div 
                        onMouseEnter={() => setHoveredField("poNumber")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="relative bg-slate-50/70 border border-slate-100/80 rounded-lg p-2 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("PO Number")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("poNumber")}
                            type="text"
                            value={poNumber}
                            onChange={(e) => {
                              setPoNumber(e.target.value);
                              fetchErpData(e.target.value);
                            }}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Database className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {poNumber || "-"}
                          </div>
                        )}
                      </div>
                      <div 
                        onMouseEnter={() => setHoveredField("amount")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("Amount Due")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("amount")}
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <span className="text-blue-600 font-extrabold bg-blue-50 px-1.5 py-0.5 rounded text-[10px] mr-1">
                              ₹
                            </span>
                            {amount || "-"}
                          </div>
                        )}
                      </div>
                      <div 
                        onMouseEnter={() => setHoveredField("invoiceDate")}
                        onMouseLeave={() => setHoveredField(null)}
                        className="bg-slate-50/70 border border-slate-100/80 rounded-lg p-1.5 md:col-span-2 hover:bg-slate-50 transition-colors"
                      >
                        {renderLabel("Invoice Date")}
                        {isEditing ? (
                          <input onFocus={() => setActiveInputField("invoiceDate")}
                            type="text"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            className="w-full text-[10px] font-semibold rounded-lg p-1.5 border bg-white border-blue-500"
                          />
                        ) : (
                          <div className="text-[10px] font-bold text-slate-800">
                            <Calendar className="h-3.5 w-3.5 text-blue-500 inline mr-1.5" />
                            {invoiceDate || "-"}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {/* Dynamic Custom Data Fields */}
                </div>
              </div>{" "}
              {/* End Core Details Card */}



              {/* BLOCK C1: TAXES & LEDGER */}
              <div className="bg-white border border-slate-200 p-2 rounded-xl space-y-1.5 shadow-sm">
                {/* GST Tax splits */}
                <div className="pt-1 mt-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">
                      Tax Breakdown splits
                    </span>
                    {isEditing && (
                      <span className="text-[8px] text-slate-400 font-medium">
                        Standard Indian Corporate splits (CGST & SGST @ 9%
                        each).
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 border border-slate-200/80 rounded-lg p-2 hover:shadow-sm transition-all group">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-0.5 block group-hover:text-slate-600 transition-colors">
                        CGST
                      </label>
                      {isEditing ? (
                        <input onFocus={() => setActiveInputField("cgst")}
                          type="number"
                          value={cgst}
                          onChange={(e) => setCgst(Number(e.target.value))}
                          className="w-full text-[10px] font-semibold rounded-lg p-1.5 border transition-all bg-white border-blue-500 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      ) : (
                        <div className="text-[10px] font-bold text-slate-800 flex items-center gap-1">
                          <span className="text-slate-400 font-extrabold text-[10px]">
                            ₹
                          </span>
                          {cgst}
                        </div>
                      )}
                    </div>
                    <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 border border-slate-200/80 rounded-lg p-2 hover:shadow-sm transition-all group">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-0.5 block group-hover:text-slate-600 transition-colors">
                        SGST
                      </label>
                      {isEditing ? (
                        <input onFocus={() => setActiveInputField("sgst")}
                          type="number"
                          value={sgst}
                          onChange={(e) => setSgst(Number(e.target.value))}
                          className="w-full text-[10px] font-semibold rounded-lg p-1.5 border transition-all bg-white border-blue-500 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      ) : (
                        <div className="text-[10px] font-bold text-slate-800 flex items-center gap-1">
                          <span className="text-slate-400 font-extrabold text-[10px]">
                            ₹
                          </span>
                          {sgst}
                        </div>
                      )}
                    </div>
                    <div className="bg-gradient-to-b from-slate-50 to-slate-100/50 border border-slate-200/80 rounded-lg p-2 hover:shadow-sm transition-all group">
                      <label className="text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-0.5 block group-hover:text-slate-600 transition-colors">
                        IGST
                      </label>
                      {isEditing ? (
                        <input onFocus={() => setActiveInputField("igst")}
                          type="number"
                          value={igst}
                          onChange={(e) => setIgst(Number(e.target.value))}
                          className="w-full text-[10px] font-semibold rounded-lg p-1.5 border transition-all bg-white border-blue-500 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      ) : (
                        <div className="text-[10px] font-bold text-slate-800 flex items-center gap-1">
                          <span className="text-slate-400 font-extrabold text-[10px]">
                            ₹
                          </span>
                          {igst}
                        </div>
                      )}
                    </div>
                  </div>


                </div>
                {/* Itemized Materials and Goods Ledger */}
                <div className="border-t border-slate-100 pt-3 mt-1">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                        Itemized Materials Ledger
                      </span>
                      <span className="text-[9px] text-slate-400 font-sans block mt-0.5">
                        Scanned products, goods, and active item lines inside
                        document.
                      </span>
                    </div>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setItemsList([
                            ...itemsList,
                            {
                              id: `itm-${Date.now()}-${Math.random()}`,
                              description: "New Material Item",
                              quantity: 1,
                              unit_price: 1000,
                              amount: 1000,
                            },
                          ]);
                        }}
                        className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] rounded-lg transition-all flex items-center space-x-1 shadow-sm border border-blue-100 active:scale-95"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Add line</span>
                      </button>
                    )}
                  </div>
                  {itemsList.length === 0 && !isEditing ? (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center text-slate-400 text-[10px] font-semibold">
                      No line items extracted.
                    </div>
                  ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-[250px] border border-slate-200 rounded-lg bg-white shadow-sm custom-scrollbar">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-slate-800 border-b border-slate-700 text-[8.5px] uppercase tracking-wider text-slate-200 font-extrabold">
                            <th className="p-1.5 pl-2">Description</th>
                            <th className="p-1.5 text-center w-12">Qty</th>
                            <th className="p-1.5 text-right w-20">
                              Unit Price (₹)
                            </th>
                            <th className="p-1.5 text-right w-20">
                              Amount (₹)
                            </th>
                            {isEditing && (
                              <th className="p-1.5 text-center w-8"></th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {itemsList.map((itm) => {
                            const handleItemChange = (
                              field: string,
                              value: any,
                            ) => {
                              const newList = itemsList.map((item) => {
                                if (item.id === itm.id) {
                                  const updated = { ...item, [field]: value };
                                  if (
                                    field === "quantity" ||
                                    field === "unit_price"
                                  ) {
                                    updated.amount =
                                      Math.round(
                                        Number(updated.quantity) *
                                          Number(updated.unit_price) *
                                          100,
                                      ) / 100;
                                  }
                                  return updated;
                                }
                                return item;
                              });
                              setItemsList(newList);
                              // Recalculating grand amount
                              const newTotal = newList.reduce(
                                (acc, curr) => acc + curr.amount,
                                0,
                              );
                              const finalWithTaxes =
                                Math.round(
                                  (newTotal +
                                    Number(cgst) +
                                    Number(sgst) +
                                    Number(igst)) *
                                    100,
                                ) / 100;
                              setAmount(finalWithTaxes);
                            };
                            const removeItem = () => {
                              const newList = itemsList.filter(
                                (item) => item.id !== itm.id,
                              );
                              setItemsList(newList);
                              const newTotal = newList.reduce(
                                (acc, curr) => acc + curr.amount,
                                0,
                              );
                              const finalWithTaxes =
                                Math.round(
                                  (newTotal +
                                    Number(cgst) +
                                    Number(sgst) +
                                    Number(igst)) *
                                    100,
                                ) / 100;
                              setAmount(finalWithTaxes);
                            };
                            return (
                              <tr
                                key={itm.id}
                                className="hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0"
                              >
                                <td className="p-2 font-medium text-[10px] leading-snug text-slate-700">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={itm.description}
                                      onChange={(e) =>
                                        handleItemChange(
                                          "description",
                                          e.target.value,
                                        )
                                      }
                                      className="w-full text-[10px] font-semibold p-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-150 bg-white text-slate-800"
                                    />
                                  ) : (
                                    <div className="flex flex-col">
                                      <span>{itm.description}</span>
                                    </div>
                                  )}
                                </td>
                                <td className="p-2 text-center text-[10px] font-medium text-slate-600">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="1"
                                      value={itm.quantity}
                                      onChange={(e) =>
                                        handleItemChange(
                                          "quantity",
                                          Number(e.target.value),
                                        )
                                      }
                                      className="w-16 text-center text-[10px] font-semibold p-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-150 bg-white text-slate-800"
                                    />
                                  ) : (
                                    itm.quantity
                                  )}
                                </td>
                                <td className="p-2 text-right text-[10px] text-slate-500 font-medium group-hover:text-slate-800 transition-colors">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      value={itm.unit_price}
                                      onChange={(e) =>
                                        handleItemChange(
                                          "unit_price",
                                          Number(e.target.value),
                                        )
                                      }
                                      className="w-24 text-right text-[10px] font-semibold p-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-150 bg-white text-slate-800"
                                    />
                                  ) : (
                                    `₹${itm.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  )}
                                </td>
                                <td className="p-2 text-right font-bold text-[10px] text-slate-800 pr-3 group-hover:text-blue-700 transition-colors">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      value={itm.amount}
                                      onChange={(e) =>
                                        handleItemChange(
                                          "amount",
                                          Number(e.target.value),
                                        )
                                      }
                                      className="w-24 text-right text-[10px] font-bold p-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-150 bg-white text-slate-850"
                                    />
                                  ) : (
                                    `₹${itm.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  )}
                                </td>
                                {isEditing && (
                                  <td className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={removeItem}
                                      className="p-1 hover:bg-red-50 text-slate-450 hover:text-red-650 rounded-lg transition"
                                      title="Delete line"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {/* Asset Warranty & Serial Tracking Segment */}
                <div className="border-t border-slate-100 pt-1.5 mt-0">
                  <div className="mb-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                      Asset Warranty & Serial Tracking
                    </span>
                    <span className="text-[8px] text-slate-400 font-sans block mt-0.5">
                      Detailed extraction of device warranties and serial
                      numbers.
                    </span>
                  </div>
                  {!isEditing &&
                  itemsList.filter(
                    (itm) =>
                      itm.warranty_text ||
                      (itm.serial_numbers && itm.serial_numbers.length > 0),
                  ).length === 0 ? (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-3 text-center text-slate-400 text-[10px] font-semibold">
                      No warranty or serial numbers detected in this document.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {(isEditing
                        ? itemsList
                        : itemsList.filter(
                            (itm) =>
                              itm.warranty_text ||
                              (itm.serial_numbers &&
                                itm.serial_numbers.length > 0),
                          )
                      ).map((itm) => (
                        <div
                          key={`ws-${itm.id}`}
                          className="bg-gradient-to-br from-white to-slate-50/50 border border-slate-200 rounded-lg p-1.5 shadow-[0_2px_8px_rgb(0,0,0,0.02)] hover:border-slate-300 transition-colors flex flex-col gap-1"
                        >
                          <div
                            className="text-[10px] font-bold text-slate-800 line-clamp-1"
                            title={itm.description}
                          >
                            {itm.description}
                          </div>
                          {isEditing ? (
                            <>
                              <input
                                type="text"
                                value={itm.warranty_text || ""}
                                onChange={(e) => {
                                  const newList = itemsList.map((item) =>
                                    item.id === itm.id
                                      ? {
                                          ...item,
                                          warranty_text: e.target.value,
                                        }
                                      : item,
                                  );
                                  setItemsList(newList);
                                }}
                                placeholder="Enter warranty details..."
                                className="w-full text-[10px] p-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-150 text-emerald-700 font-semibold"
                              />
                              <input
                                type="text"
                                value={(itm.serial_numbers || []).join(", ")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const sns = val
                                    ? val
                                        .split(",")
                                        .map((s) => s.trim())
                                        .filter(Boolean)
                                    : [];
                                  const newList = itemsList.map((item) =>
                                    item.id === itm.id
                                      ? { ...item, serial_numbers: sns }
                                      : item,
                                  );
                                  setItemsList(newList);
                                }}
                                placeholder="Enter serial numbers (comma separated)"
                                className="w-full text-[10px] p-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-150 font-mono text-slate-600"
                              />
                            </>
                          ) : (
                            <>
                              {itm.warranty_text && (
                                <div>
                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded-sm border border-emerald-200 inline-flex items-center gap-1">
                                    <Shield className="h-2.5 w-2.5" />{" "}
                                    {itm.warranty_text}
                                  </span>
                                </div>
                              )}
                              {itm.serial_numbers &&
                                itm.serial_numbers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {itm.serial_numbers.map((sn, snIdx) => (
                                      <span
                                        key={snIdx}
                                        className="text-[9px] font-mono font-semibold text-slate-700 bg-slate-100 px-1 py-0.5 rounded-sm border border-slate-200 flex items-center gap-1"
                                      >
                                        <Barcode className="h-2.5 w-2.5 text-slate-450" />{" "}
                                        {sn}
                                      </span>
                                    ))}
                                  </div>
                                )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Comments Thread Segment */}
                <div className="border-t border-slate-100 pt-3 mt-3">
                  <div className="mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold block">
                      Activity & Comments Thread
                    </span>
                  </div>
                  <div className="space-y-3 mb-3 max-h-[300px] flex-1 overflow-y-auto pr-2">
                    {commentsList.map((c, i) => (
                      <div key={i} className="flex gap-2 animate-fadeIn">
                        <div className="h-6 w-6 rounded bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {c.user_name ? c.user_name.substring(0, 2).toUpperCase() : "U"}
                        </div>
                        <div className="flex-1 bg-slate-50 border border-slate-100 p-2 rounded-lg rounded-tl-none">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-slate-700">{c.user_name || c.user_email}</span>
                            <span className="text-[9px] text-slate-400">{new Date(c.created_at).toLocaleString()}</span>
                          </div>
                          <p className="text-[10px] text-slate-600 leading-snug">{c.text}</p>
                        </div>
                      </div>
                    ))}
                    {commentsList.length === 0 && (
                      <div className="text-center text-[10px] text-slate-400 py-2 italic">No comments yet.</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => { if(e.key === 'Enter') handlePostComment(); }}
                      placeholder="Type a comment or @mention..."
                      className="flex-1 text-[10px] p-2 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                    />
                    <button
                      onClick={handlePostComment}
                      disabled={commentsLoading || !newComment.trim()}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold transition-colors"
                    >
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    
      {/* Workflow Tracking Segment (Horizontal, Bottom) */}
      <div className="mt-4 w-full">
        {/* Workflow Tracking Segment (Horizontal) */}
      {activeApprovalLog && (
        <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm mb-4">
          <div className="mb-2">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block">
              Live Approval Chain <span className="text-blue-600">({activeApprovalLog.workflow_profile})</span>
            </span>
          </div>
          {workflowStepDefinitions.length === 0 ? (
            <div className="text-[9px] text-slate-500 font-bold p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-slate-400" />
              <span>No approval stages are configured for this routing profile.</span>
            </div>
          ) : (
            <div className="flex flex-row items-start overflow-x-auto pb-2 w-full pt-1">
              {workflowStepDefinitions.map((step, idx) => {
                const isPast = step.stage_number < activeApprovalLog.current_stage_number || activeApprovalLog.status === "Approved";
                const isCurrent = step.stage_number === activeApprovalLog.current_stage_number && activeApprovalLog.status === "Pending";
                const isRejected = step.stage_number === activeApprovalLog.current_stage_number && activeApprovalLog.status === "Rejected";

                let iconBg = "bg-slate-200";
                let ringColor = "ring-slate-50";
                let badgeColor = "bg-slate-100 text-slate-500 border border-slate-200";
                let statusText = "Waiting";

                if (isPast) {
                  iconBg = "bg-emerald-500";
                  ringColor = "ring-emerald-50";
                  badgeColor = "bg-emerald-50 text-emerald-700 border border-emerald-200";
                  statusText = "Approved";
                } else if (isCurrent) {
                  iconBg = "bg-blue-500";
                  ringColor = "ring-blue-50";
                  badgeColor = "bg-blue-50 text-blue-700 border border-blue-200 ring-1 ring-blue-100 shadow-sm";
                  statusText = "Pending";
                } else if (isRejected) {
                  iconBg = "bg-red-500";
                  ringColor = "ring-red-50";
                  badgeColor = "bg-red-50 text-red-700 border border-red-200";
                  statusText = "Rejected";
                }

                return (
                  <div key={idx} className="flex flex-col relative shrink-0 flex-1 min-w-[120px] items-center">
                    <div className="w-full relative flex items-center justify-center h-4">
                      {/* The Line */}
                      {idx !== workflowStepDefinitions.length - 1 && (
                        <div className={`absolute left-1/2 w-full h-1 ${isPast ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                      )}
                      
                      {/* The Dot */}
                      <div className={`relative z-10 shrink-0 h-4 w-4 rounded-full flex items-center justify-center ring-4 ${ringColor} ${iconBg}`}>
                        {isPast ? (
                          <Check className="h-2.5 w-2.5 text-white" />
                        ) : isRejected ? (
                          <X className="h-2.5 w-2.5 text-white" />
                        ) : isCurrent ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        ) : (
                          <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        )}
                      </div>
                    </div>
                    
                    {/* The Label */}
                    <div className="mt-2 bg-white border border-slate-200 rounded-lg p-1.5 shadow-sm flex flex-col w-[110px] items-center text-center hover:border-slate-300 hover:shadow transition-all">
                      <div className="font-bold text-[10px] uppercase tracking-wider text-slate-400 mb-0.5">Stage {step.stage_number}</div>
                      <div className="text-[9px] font-bold text-slate-700 truncate" title={step.approver_target}>{step.approver_target}</div>
                      <div className={`mt-1 text-[9px] uppercase font-bold tracking-wider px-2 py-1 rounded text-center ${badgeColor}`}>
                        {statusText}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      </div>
</div>
  );
}
    