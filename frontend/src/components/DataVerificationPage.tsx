import { useState, useEffect } from "react";
import { CheckCircle, Search, Clock, FileCheck, RefreshCw, AlertCircle, FileText, Zap, ChevronRight } from "lucide-react";
import { DbInvoice } from "../types";

interface DataVerificationPageProps {
  onViewDocument: (id: string) => void;
}

export default function DataVerificationPage({ onViewDocument }: DataVerificationPageProps) {
  const [invoices, setInvoices] = useState<DbInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<'all' | 'priority'>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const resDocs = await fetch("/api/documents");
      if (resDocs.ok) {
        const invoicesList: DbInvoice[] = await resDocs.json();
        setInvoices(invoicesList.filter(inv => inv.status === "Data Verification Pending"));
      }
    } catch (e) {
      console.error("Failed to fetch documents for verification:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredInvoices = invoices.filter(inv => {
    if (activeFilter === 'priority' && inv.amount && inv.amount < 10000) return false;
    return (
      (inv.vendor_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.tracking_id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inv.invoice_number || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const highPriorityCount = invoices.filter(inv => inv.amount && inv.amount >= 10000).length;

  return (
    <div className="space-y-3 animate-fadeIn pb-8 w-full max-w-[1600px] mx-auto pt-1 px-2 sm:px-4">
      {/* Premium Header Banner (Matching WorkTrackerPage theme exactly) */}
      <div className="bg-slate-900 rounded-xl px-4 py-2.5 shadow-lg bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black relative overflow-hidden flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 border border-slate-700/50 mb-3">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-80"></div>
        <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none">
          <FileCheck className="h-40 w-40 text-blue-400 transform rotate-12" />
        </div>
        
        <div className="relative z-10 flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-blue-400 hidden sm:block" />
          <div>
            <h2 className="text-lg font-black font-display text-white tracking-tight leading-tight">Data Verification Queue</h2>
            <p className="text-blue-400 text-[9px] mt-0.5 font-bold tracking-widest uppercase">
              AI-Extraction Review & Exception Handling
            </p>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <button 
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 border border-slate-700/60 text-slate-200 font-bold text-[9px] uppercase tracking-wider rounded text-slate-400 hover:text-slate-200 transition-all shadow-inner backdrop-blur-md"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            Sync Queue
          </button>
        </div>
      </div>


      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-1">
        <div className="flex-1 w-full max-w-sm bg-white border border-slate-200/80 rounded-xl px-4 py-2 flex items-center space-x-3 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor, tracking ID, or invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-0 outline-none text-[11px] text-slate-800 w-full placeholder-slate-400 focus:ring-0 p-0 font-sans font-bold tracking-wide"
          />
        </div>
      </div>

      {/* Highly Dense Data Table */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[1rem] border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mt-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50/50">
            <RefreshCw className="h-8 w-8 animate-spin mb-3 text-blue-500" />
            <p className="font-bold text-[10px] uppercase tracking-widest">Synchronizing Queue...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-50/50">
            <div className="h-12 w-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-3 border border-slate-100">
              <CheckCircle className="h-6 w-6 text-blue-500" />
            </div>
            <h3 className="text-sm font-black font-display text-slate-800 uppercase tracking-wide mb-1">Queue Empty</h3>
            <p className="text-[11px] text-slate-500 font-medium max-w-sm">
              All extracted documents have been successfully verified.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
              <thead>
                <tr className="bg-blue-950 border-b border-blue-900 text-[10px] uppercase tracking-wider text-slate-300 font-black">
                  <th className="py-3 px-4 w-[15%] rounded-tl-xl">Tracking ID</th>
                  <th className="py-3 px-2 w-[25%]">Vendor Details</th>
                  <th className="py-3 px-2 w-[15%]">Document Type</th>
                  <th className="py-3 px-2 text-right w-[15%]">Amount</th>
                  <th className="py-3 px-4 w-[15%]">Status Pulse</th>
                  <th className="py-3 px-4 w-[15%] rounded-tr-xl text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr 
                    key={inv.id} 
                    className="hover:bg-slate-50/80 group transition-all cursor-pointer relative bg-white" 
                    onClick={() => onViewDocument(inv.id)}
                  >
                    <td className="py-2.5 px-4 whitespace-nowrap relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="font-black text-[10px] text-slate-800">{inv.tracking_id || "N/A"}</div>
                      <div className="text-[9px] font-semibold text-slate-500 mt-0.5 tracking-wide uppercase">{inv.invoice_number}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="font-black text-[11px] text-slate-900 truncate">{inv.vendor_name || "Unknown Vendor"}</div>
                      <div className="text-[9px] font-semibold text-slate-500 mt-0.5 tracking-wide flex items-center gap-1.5">
                        <Clock className="w-2.5 h-2.5 opacity-50" />
                        {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {inv.document_type || "Unknown"}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <div className="font-black text-[12px] text-slate-900 tabular-nums">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inv.amount || 0)}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 text-amber-700 font-bold text-[9px] uppercase tracking-wider bg-amber-50 px-2 py-1 rounded border border-amber-200/50 shadow-sm">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                        </span>
                        Pending
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button 
                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-500 rounded font-bold text-[9px] uppercase tracking-widest transition-all shadow-sm shadow-blue-500/20 group-hover:-translate-y-px"
                      >
                        Verify
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
