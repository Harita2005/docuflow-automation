import { useState, useEffect, useRef } from "react";
import { Check, X, HelpCircle, FileText, User, MessageCircle, AlertCircle, Sparkles, Building, Layers, CheckSquare, ShieldCheck, HelpCircle as HelpIcon, FileKey, Loader2, Database } from "lucide-react";

interface ApprovalQueuePageProps {
  currentUserRole: 'accounting' | 'manager' | 'cfo' | string;
  currentUserEmail: string;
  onRefreshDataSignal: () => void;
  setCurrentView?: (view: string) => void;
}

export default function ApprovalQueuePage({ currentUserRole, currentUserEmail, onRefreshDataSignal, setCurrentView }: ApprovalQueuePageProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [activeQueue, setActiveQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Signoff Form states
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/documents");
      if (response.ok) {
        const data = await response.json();
        setInvoices(data);

        // Fetch workflow instances to accurately map stages to roles
        const docsWithWorkflows = await Promise.all(data.map(async (inv: any) => {
          if (inv.activeApprovalLog?.status === 'Pending' || inv.status.includes('Approval')) {
            try {
              const res = await fetch(`/api/documents/${inv.id}`);
              const fullData = await res.json();
              return { ...inv, current_stage: fullData.workflow_instance?.current_stage };
            } catch (e) {
              return inv;
            }
          }
          return inv;
        }));

        const matched = docsWithWorkflows.filter((inv: any) => {
          // Hide already approved and terminal states from the pending queue
          const terminalStates = ["Approved", "Paid", "Ready for Payment", "Rejected", "Failed"];
          if (terminalStates.includes(inv.status)) return false;

          if (currentUserRole === "admin") return true; // Admins can view all pending queue items
          if (inv.status === "AI Processed" && currentUserRole === "ap_executive") return true;
          
          if (inv.activeApprovalLog && inv.activeApprovalLog.status === 'Pending') {
             return !!inv.is_current_approver;
          }
          return false;
        });

        setActiveQueue(matched);
        if (matched.length === 0 && setCurrentView) {
          setCurrentView("work-tracker");
        }
      }
    } catch (err) {
      console.error("Failed to load approval queue ledger:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [currentUserRole]);

  const handleAuditAction = async (action: 'Approve' | 'Reject' | 'Request Clarification' | 'Send Back') => {
    if (!selectedInvoice) return;
    if (!commentText.trim()) {
      alert("Please state your professional evaluation audit comments before filing approval.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/invoices/${selectedInvoice.id}/step-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          comments: commentText,
          approver: `${currentUserEmail} (${currentUserRole.toUpperCase()})`
        })
      });

      if (response.ok) {
        setSuccessToast(`SUCCESSFULLY RECORDED '${action.toUpperCase()}' DISPOSITION SIGN-OFF!`);
        setCommentText("");
        setSelectedInvoice(null);
        fetchQueue();
        onRefreshDataSignal(); 
        setTimeout(() => setSuccessToast(null), 4000);
      } else {
        const errorData = await response.json();
        alert(`Failed to save: ${errorData.error}`);
      }
    } catch (err: any) {
      alert(`API Connection Failure: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn w-full">
      
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-800 tracking-tight">
            Accounts Payable Audit & Sign-off desk
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Audit assigned supplier invoices matching your current workspace clearances: <span className="font-extrabold text-blue-600 font-sans ml-1 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">[{currentUserRole.toUpperCase()}]</span>.
          </p>
        </div>
        <div className="text-right text-xs bg-slate-100 border border-slate-200/60 px-3 py-1.5 rounded-lg text-slate-600 font-semibold font-mono">
          DESK OPERATOR: <span className="font-bold text-slate-805 text-xs">{currentUserEmail}</span>
        </div>
      </div>

      {successToast && (
        <div className="bg-emerald-600 text-white rounded-xl p-4 font-sans font-bold text-xs uppercase shadow-lg shadow-emerald-500/10 tracking-wider flex justify-between items-center animate-pulse">
          <span>★ {successToast}</span>
          <span className="text-[10px] bg-emerald-700 px-2.5 py-0.5 rounded-md">UPDATED SUCCESSFULLY</span>
        </div>
      )}

      {/* Main split dashboard view */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Pending List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-150">
              <CheckSquare className="h-4.5 w-4.5 text-blue-600" />
              <h3 className="font-bold text-xs uppercase text-slate-800 tracking-wide">
                Assigned Desk Items ({activeQueue.length})
              </h3>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Refreshing assigned queues...</span>
              </div>
            ) : activeQueue.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-450 text-xs leading-relaxed font-sans">
                No active billing tasks rest currently on your role inbox desk. 
                <p className="mt-2 text-[11px] text-slate-400">
                  Switch acting operator profiles using the header selector to test distinct departmental compliance paths (Accounting, Dept Manager, or CFO).
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {activeQueue.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setCommentText("");
                      setHasScrolledToBottom(false);
                      setTimeout(() => {
                        if (scrollRef.current && scrollRef.current.scrollHeight <= scrollRef.current.clientHeight) {
                          setHasScrolledToBottom(true);
                        }
                      }, 100);
                    }}
                    className={`p-3.5 rounded-xl border transition-all duration-200 cursor-pointer text-xs ${
                      selectedInvoice?.id === inv.id 
                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/10" 
                        : "bg-white text-slate-705 border-slate-200 hover:border-blue-400 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1.5">
                      <span className="text-sm truncate pr-2">{inv.vendor_name}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        selectedInvoice?.id === inv.id ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600 border border-blue-100'
                      }`}>
                        ₹{inv.amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="space-y-1 text-[10.5px]">
                      <div className="flex justify-between">
                        <span className={selectedInvoice?.id === inv.id ? "text-blue-100" : "text-slate-400"}>Invoice Reference:</span>
                        <strong className="font-mono">{inv.invoice_number}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className={selectedInvoice?.id === inv.id ? "text-blue-100" : "text-slate-400"}>PO number match:</span>
                        <strong className="font-mono">{inv.po_number || "AWAITING"}</strong>
                      </div>
                      <div className="pt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide">
                        <span className={selectedInvoice?.id === inv.id ? "text-blue-200" : "text-amber-600"}>
                          {inv.status.includes("Approval") && inv.workflowInst?.current_stage_index 
                            ? `In Approval: ${inv.workflowInst.current_stage_index}${
                                inv.workflowInst.current_stage_index === 1 ? 'st' :
                                inv.workflowInst.current_stage_index === 2 ? 'nd' :
                                inv.workflowInst.current_stage_index === 3 ? 'rd' : 'th'
                              } Stage` 
                            : inv.status}
                        </span>
                        <span className={selectedInvoice?.id === inv.id ? "text-white/60" : "text-slate-400 font-mono"}>ID: {inv.id}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Middle Pane: Visual Data & Document (MUST SCROLL) */}
        <div className="lg:col-span-2 space-y-6">
          {selectedInvoice ? (
            <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm animate-fadeIn flex flex-col h-[700px]">
              <div className="border-b border-slate-100 pb-3 mb-3 shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">AP Ledger Ingestion Slip (SCROLL TO UNLOCK)</span>
                  <h4 className="text-lg font-display font-extrabold text-slate-800 mt-0.5 truncate">
                    {selectedInvoice.vendor_name} — Invoice Ref: {selectedInvoice.invoice_number}
                  </h4>
              </div>
              <div 
                ref={scrollRef}
                onScroll={(e) => {
                  const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 20;
                  if (bottom) setHasScrolledToBottom(true);
                }}
                className="flex-1 overflow-y-auto pr-2 space-y-5"
              >
                  {/* Data metrics */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-200/60 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider mb-0.5">Gross Amount</span>
                      <strong className="text-slate-800 text-sm font-sans font-black">₹{selectedInvoice.amount.toLocaleString()} <span className="text-[10px] font-normal text-slate-500 font-mono">INR</span></strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider mb-0.5">Scanned Date</span>
                      <strong className="text-slate-700 font-bold">{selectedInvoice.invoice_date}</strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider mb-0.5">Tax Allocation</span>
                      <strong className="text-slate-700 font-sans text-[11px] truncate block">{selectedInvoice.tax_details || "N/A - Standard Match"}</strong>
                    </div>
                  </div>
                  
                  {/* Simulated PDF View */}
                  <div className="space-y-1.5 pb-8">
                    <span className="text-[10px] font-bold text-slate-450 uppercase block tracking-wider">
                      OCR Text Transcription readout
                    </span>
                    <div className="bg-slate-900 p-6 font-mono text-[11px] text-blue-400 min-h-[500px] leading-relaxed border border-slate-800 rounded-xl shadow-inner whitespace-pre-wrap">
                      {selectedInvoice.ocr_text || `Transcription reading...\nNo coordinates available.`}
                      {/* Fake extra padding to force scrolling if content is short */}
                      <div className="h-[200px]"></div>
                      <div className="text-center text-slate-500 border-t border-slate-700 pt-6 mt-6 uppercase tracking-widest font-bold text-[10px]">--- END OF DOCUMENT ---</div>
                    </div>
                  </div>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-slate-300 p-16 text-center text-slate-450 text-xs space-y-3 rounded-2xl bg-white shadow-sm flex flex-col items-center justify-center h-[700px]">
              <ShieldCheck className="h-9 w-9 text-blue-200 shrink-0" />
              <div className="max-w-md space-y-1">
                <p className="font-bold text-slate-700 uppercase tracking-wide">Evaluating active pipeline queues</p>
                <p className="text-slate-400 font-medium leading-relaxed font-sans">
                  Please select an active ledger item from the left inbox lane to begin compliance review.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: Action Form */}
        <div className="lg:col-span-1 space-y-4">
           {selectedInvoice ? (
             <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm sticky top-6">
                <h3 className="font-bold text-xs uppercase text-slate-800 tracking-wide mb-4 pb-2 border-b border-slate-150">
                  Compliance Sign-Off
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider mb-1">
                      Official Audit Comments
                    </label>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="e.g. Validated rates. Cleared."
                      rows={5}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-semibold text-slate-850"
                    />
                  </div>
                  
                  {!hasScrolledToBottom && (
                    <div className="bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-200 text-[10px] font-bold uppercase tracking-wider flex gap-2">
                       <AlertCircle className="w-4 h-4 shrink-0" />
                       Please scroll through the entire document pane to unlock approval.
                    </div>
                  )}

                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={submitting || !hasScrolledToBottom}
                      onClick={() => handleAuditAction("Approve")}
                      className={`w-full py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider font-bold transition shadow-sm ${
                        hasScrolledToBottom 
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20' 
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {submitting ? "Processing..." : "✔ Approve & Pass"}
                    </button>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleAuditAction("Request Clarification")}
                        className="w-full py-2.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[9px] uppercase tracking-wide font-bold transition text-center"
                      >
                        Clarify
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => handleAuditAction("Reject")}
                        className="w-full py-2.5 px-2 bg-red-50 hover:bg-red-100 text-red-750 border border-red-200/60 rounded-xl text-[9px] uppercase tracking-wide font-bold transition text-center"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
             </div>
           ) : null}
        </div>

      </div>

    </div>
  );
}
