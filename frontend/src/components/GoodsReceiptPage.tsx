import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  CheckCircle, 
  Search,
  Plus,
  Download,
  Calendar,
  AlertCircle,
  Cpu,
  Package,
  X,
  MessageSquare,
  Clock,
  Filter,
  RefreshCw,
  PackageCheck
} from "lucide-react";

interface GoodsReceiptPageProps {
  onWorkflowTriggered: () => void;
  currentUserEmail: string;
}

export default function GoodsReceiptPage({ onWorkflowTriggered, currentUserEmail }: GoodsReceiptPageProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'All' | 'Not Completed' | 'Completed'>('All');
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  // Modal state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [boxCount, setBoxCount] = useState<number>(1);
  const [qtyReceived, setQtyReceived] = useState<number>(0);

  // Auto-fill expected values when opening details modal
  useEffect(() => {
    if (selectedInvoiceId) {
      const inv = invoices.find(i => i.id === selectedInvoiceId);
      if (inv && Array.isArray(inv.items)) {
        const expectedQty = inv.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 1), 0);
        setQtyReceived(expectedQty);
        setBoxCount(Math.ceil(expectedQty / 10) || 1);
      } else {
        setQtyReceived(0);
        setBoxCount(1);
      }
    }
  }, [selectedInvoiceId, invoices]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resDocs = await fetch("/api/documents");
      if (resDocs.ok) {
        const invoicesList = await resDocs.json();
        setInvoices(invoicesList);
      }
    } catch (e) {
      console.error("Failed to fetch GRN data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConfirmReceipt = async (grnId: string, status: 'Received' | 'Not Received') => {
    if (!remarks.trim() && status === 'Not Received') {
      alert("Please enter comments detailing why physical goods reception failed.");
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch(`/api/goods-receipt/${grnId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          remarks: remarks || `Goods reception confirmed by ${currentUserEmail}. Box Count: ${boxCount}, Qty: ${qtyReceived}`,
          confirmedBy: currentUserEmail,
          boxCount,
          qtyReceived
        })
      });

      if (response.ok) {
        setToastMessage(`SUCCESSFULLY RECORDED GOODS AS '${status.toUpperCase()}'!`);
        setRemarks("");
        setSelectedInvoiceId(null);
        fetchData();
        onWorkflowTriggered(); 
        setTimeout(() => setToastMessage(null), 4000);
      } else {
        const err = await response.json();
        alert(`Failed to save: ${err.error || "Server state mismatch"}`);
      }
    } catch (err: any) {
      alert(`API Connection Error: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Enhance data to match the mockup structure and generate mock values for missing fields
  const enhancedInvoices = invoices.map((inv, idx) => {
    const isCompleted = inv.status !== 'Waiting for GRN';
    return {
      ...inv,
      mockGrnNumber: `GRN${String(idx + 1).padStart(6, '0')}`,
      accountNumber: (inv.custom_data?.accountNumber) || "12345",
      poStatus: "In Progress",
      grnStatus: isCompleted ? "Completed" : "Not Completed",
      invoiceStatus: inv.activeApprovalLog?.workflow_profile ? `${inv.status} - ${inv.activeApprovalLog.workflow_profile}` : inv.status || "Unknown",
      invoiceValueExVat: 0.00
    };
  });

  const filteredInvoices = enhancedInvoices.filter(inv => {
    if (activeTab === 'Not Completed' && inv.grnStatus !== 'Not Completed') return false;
    if (activeTab === 'Completed' && inv.grnStatus !== 'Completed') return false;
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (inv.tracking_id || "").toLowerCase().includes(q) ||
        (inv.po_number || "").toLowerCase().includes(q) ||
        (inv.invoice_number || "").toLowerCase().includes(q) ||
        (inv.vendor_name || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeTab]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE) || 1;
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const counts = {
    all: enhancedInvoices.length,
    notCompleted: enhancedInvoices.filter(i => i.grnStatus === 'Not Completed').length,
    completed: enhancedInvoices.filter(i => i.grnStatus === 'Completed').length,
  };

  const activeInvoice = invoices.find(i => i.id === selectedInvoiceId);

  return (
    <div className="flex flex-col max-h-[calc(100vh-2rem)] animate-fadeIn w-full pt-0 px-2 pb-2 sm:pt-0 sm:px-4 sm:pb-4 overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-12 right-4 z-50 bg-emerald-600 text-white rounded-lg p-3 font-sans shadow-lg flex items-center justify-between animate-in slide-in-from-top-4 fade-in min-w-[250px]">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-100" />
            <span className="font-semibold text-xs tracking-wide">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4 mt-2 flex-none">
        <div className="flex-1 w-full max-w-md bg-white border border-slate-200/80 rounded-xl px-4 py-2.5 flex items-center space-x-3 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all shadow-sm">
          <Search className="h-4.5 w-4.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Document Number, PO Number, Supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-0 outline-none text-[12px] text-slate-800 w-full placeholder-slate-400 focus:ring-0 p-0 font-sans font-bold tracking-wide"
          />
        </div>

        <button 
          onClick={fetchData}
          className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-[11px] uppercase tracking-wider rounded-xl transition-all shadow-sm group"
        >
          <RefreshCw className={`h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors ${loading ? 'animate-spin text-blue-500' : ''}`} />
          Sync Records
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col shrink min-h-0 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-[1rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        
        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/50 px-3">
          {(['All', 'Not Completed', 'Completed'] as const).map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-bold transition-all relative ${
                activeTab === tab 
                  ? 'text-blue-600' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
              }`}
            >
              {tab} 
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] ${
                activeTab === tab ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {tab === 'All' ? counts.all : tab === 'Not Completed' ? counts.notCompleted : counts.completed}
              </span>
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t-full"></div>
              )}
            </button>
          ))}
        </div>

        {/* Table Container */}
        <div className="shrink min-h-0 overflow-auto custom-scrollbar">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-black sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 w-[15%]">Document Number</th>
                <th className="px-4 py-3 w-[15%]">Invoice Number</th>
                <th className="px-4 py-3 w-[15%]">PO Number</th>
                <th className="px-4 py-3 w-[35%]">Supplier Name</th>
                <th className="px-4 py-3 w-[10%] text-center">Status</th>
                <th className="px-4 py-3 w-[10%] text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mb-2" />
                      <span className="text-xs text-slate-500 font-medium">Loading records...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <div className="bg-slate-50 text-slate-400 h-10 w-10 rounded-lg flex items-center justify-center mx-auto mb-2 border border-slate-100">
                      <Search className="h-5 w-5" />
                    </div>
                    <p className="text-slate-600 font-bold text-xs">No records found</p>
                    <p className="text-slate-400 text-[10px] mt-0.5">Try adjusting your search or filters.</p>
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((inv, idx) => (
                  <tr key={inv.id || idx} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => setSelectedInvoiceId(inv.id)}>
                    <td className="px-4 py-2">
                      <span className="text-blue-600 font-bold text-[11px] group-hover:underline cursor-pointer">
                        {inv.tracking_id || "N/A"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-800 text-[11px] font-semibold">{inv.invoice_number}</td>
                    <td className="px-4 py-2 text-slate-800 text-[11px] font-semibold">{inv.po_number || "-"}</td>
                    <td className="px-4 py-2 text-slate-800 text-[11px] font-medium">{inv.vendor_name}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                        inv.grnStatus === 'Completed' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
                          : 'bg-amber-50 text-amber-700 border-amber-200/50'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${inv.grnStatus === 'Completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        {inv.grnStatus}
                      </span>
                    </td>

                    <td className="px-4 py-2 text-right text-slate-900 font-bold text-[11px]">
                      ₹{inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex-none flex items-center justify-between border-t border-slate-100 bg-white p-3">
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-slate-500 font-medium">
              Showing <strong className="text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong className="text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, filteredInvoices.length)}</strong> of <strong className="text-slate-800">{filteredInvoices.length}</strong> records
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${currentPage === 1 ? 'text-slate-400 border border-slate-200 cursor-not-allowed' : 'text-slate-700 border border-slate-300 hover:bg-slate-50 cursor-pointer'}`}
            >
              Previous
            </button>
            <button className="px-2.5 py-1 bg-blue-600 text-white font-bold rounded text-[11px] shadow-sm">
              {currentPage}
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${currentPage === totalPages ? 'text-slate-400 border border-slate-200 cursor-not-allowed' : 'text-slate-700 border border-slate-300 hover:bg-slate-50 cursor-pointer'}`}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal Overlay for Receipt Confirmation */}
      {selectedInvoiceId && activeInvoice && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200/80">
            {/* Modal Header */}
            <div className="bg-slate-900 p-4 relative shrink-0">
              <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <PackageCheck className="h-16 w-16 text-white transform rotate-12" />
              </div>
              <div className="relative z-10 flex justify-between items-start">
                <div>
                  <span className="text-blue-400 font-bold text-[9px] uppercase tracking-widest mb-0.5 block">Shipment Verification</span>
                  <h4 className="text-lg font-display font-bold text-white leading-tight">
                    {activeInvoice.vendor_name}
                  </h4>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="bg-white/10 text-white border border-white/20 px-1.5 py-0.5 rounded text-[9px] font-mono">
                      Inv: {activeInvoice.invoice_number}
                    </span>
                    <span className="bg-blue-500/20 text-blue-200 border border-blue-500/30 px-1.5 py-0.5 rounded text-[9px] font-mono">
                      PO: {activeInvoice.po_number}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedInvoiceId(null)}
                  className="bg-white/10 hover:bg-white/20 text-white p-1 rounded-full transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Expected Amount</span>
                  <span className="text-base font-bold text-slate-800">₹{activeInvoice.amount.toLocaleString()}</span>
                </div>
                <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 flex items-center">
                  <div>
                    <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest block mb-0.5">AI Status</span>
                    <span className="text-xs font-bold text-blue-700 flex items-center gap-1">
                      <Cpu className="h-3 w-3" /> VERIFIED
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table in Modal */}
              <div className="mb-4">
                <h5 className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5 mb-1.5">
                  <Package className="h-3 w-3 text-slate-400" /> Expected Line Items
                </h5>
                <div className="bg-slate-50 rounded-lg border border-slate-100 overflow-hidden">
                  <div className="max-h-[100px] overflow-y-auto custom-scrollbar">
                    {Array.isArray(activeInvoice.items) && activeInvoice.items.length > 0 ? (
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-100/50 sticky top-0 backdrop-blur-md">
                          <tr>
                            <th className="py-1 px-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="py-1 px-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider text-right w-16">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activeInvoice.items.map((item: any, idx: number) => (
                            <tr key={idx} className="bg-white hover:bg-slate-50/50 transition-colors">
                              <td className="py-1.5 px-2 text-[10px] text-slate-700 font-medium">
                                {item.exactItem || item.description || "Unknown Item"}
                              </td>
                              <td className="py-1.5 px-2 text-right text-[10px] font-bold text-slate-900">
                                <span className="inline-flex items-center justify-center bg-slate-50 border border-slate-200 text-slate-600 font-bold text-[9px] h-4 px-1.5 rounded">
                                  {item.quantity || 1}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div className="p-4 text-center text-slate-400 flex flex-col items-center">
                        <AlertCircle className="h-5 w-5 mb-1 opacity-50" />
                        <span className="text-[10px] font-medium">No line items extracted</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Box and Quantity Received inputs / display */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-700 mb-1 block">
                    Boxes Received {activeInvoice.grnStatus !== 'Completed' && <span className="text-red-500">*</span>}
                  </label>
                  {activeInvoice.grnStatus === 'Completed' ? (
                    <div className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-bold text-slate-800">
                      {activeInvoice.goodsReceipt?.box_count ?? 1} Boxes
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={boxCount}
                      onChange={(e) => setBoxCount(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-slate-800 shadow-sm"
                    />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-700 mb-1 block">
                    Quantity Received {activeInvoice.grnStatus !== 'Completed' && <span className="text-red-500">*</span>}
                  </label>
                  {activeInvoice.grnStatus === 'Completed' ? (
                    <div className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-bold text-slate-800">
                      {activeInvoice.goodsReceipt?.quantity_received ?? 0} Units
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={qtyReceived}
                      onChange={(e) => setQtyReceived(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-bold text-slate-800 shadow-sm"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 text-slate-400" />
                  Reception Comments
                  <span className="text-slate-400 font-normal text-[9px]">(Optional)</span>
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g., Deliveries received in good condition. All quantities match."
                  rows={2}
                  className="w-full text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-white p-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={actionLoading}
                onClick={async () => {
                  const res = await fetch(`/api/documents/${activeInvoice.id}`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.goods_receipt) {
                      handleConfirmReceipt(data.goods_receipt.id, "Not Received");
                    } else {
                      alert("No Gate Entry ID found for this invoice.");
                    }
                  }
                }}
                className="px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-md font-bold text-[10px] transition-all focus:outline-none focus:ring-2 focus:ring-rose-50"
              >
                Flag Undelivered
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={async () => {
                  const res = await fetch(`/api/documents/${activeInvoice.id}`);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.goods_receipt) {
                      handleConfirmReceipt(data.goods_receipt.id, "Received");
                    } else {
                      alert("No Gate Entry ID found for this invoice.");
                    }
                  }
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-[0_2px_8px_0_rgba(37,99,235,0.3)] hover:shadow-[0_4px_12px_rgba(37,99,235,0.2)] hover:-translate-y-px rounded-md font-bold text-[10px] transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 flex items-center gap-1.5"
              >
                {actionLoading ? <Clock className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                {actionLoading ? "SAVING..." : "CONFIRM RECEIVED"}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

