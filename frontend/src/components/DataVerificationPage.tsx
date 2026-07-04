import { useState, useEffect } from "react";
import { CheckCircle, Search, Clock, FileCheck, RefreshCw } from "lucide-react";
import { DbInvoice } from "../types";

interface DataVerificationPageProps {
  onViewDocument: (id: string) => void;
}

export default function DataVerificationPage({ onViewDocument }: DataVerificationPageProps) {
  const [invoices, setInvoices] = useState<DbInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const resDocs = await fetch("/api/documents");
      if (resDocs.ok) {
        const invoicesList: DbInvoice[] = await resDocs.json();
        // Filter specifically for the Data Verification state
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

  const filteredInvoices = invoices.filter(inv => 
    (inv.vendor_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (inv.tracking_id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (inv.invoice_number || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-slate-50/50 p-4 md:p-6 space-y-4 overflow-auto">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-emerald-600" />
            Data Verification Queue
          </h1>
          <p className="text-slate-500 mt-1 text-xs font-medium max-w-2xl">
            Review and adjust AI-extracted document details before allowing the system to route them into the main business flow.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchData}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-50 hover:text-blue-600 transition shadow-sm"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* Search Bar */}
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search by vendor, tracking ID, or invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
            />
          </div>
          
          <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold border border-emerald-100 flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            {filteredInvoices.length} Pending Verifications
          </div>
        </div>

        {/* List area */}
        <div className="p-0 overflow-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin mb-4 text-emerald-500" />
              <p className="font-medium">Loading verification queue...</p>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center mb-3 border border-emerald-100">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-700 mb-1.5">Queue Empty</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                There are currently no documents waiting for data verification. AI extraction is either complete or none are pending.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <th className="px-3 py-2 pl-4 font-semibold">Tracking ID</th>
                  <th className="px-3 py-2 font-semibold">Vendor</th>
                  <th className="px-3 py-2 font-semibold">Document Type</th>
                  <th className="px-3 py-2 font-semibold text-right">Amount</th>
                  <th className="px-3 py-2 font-semibold">Wait Time</th>
                  <th className="px-3 py-2 pr-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr 
                    key={inv.id} 
                    className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                    onClick={() => onViewDocument(inv.id)}
                  >
                    <td className="px-3 py-2 pl-4">
                      <div className="font-medium text-sm text-slate-800">{inv.tracking_id || "N/A"}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{inv.invoice_number}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-sm text-slate-700">{inv.vendor_name || "Unknown"}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{new Date(inv.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {inv.document_type || "Unknown"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="font-medium text-sm text-slate-800">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(inv.amount || 0)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 text-orange-600 font-medium text-[10px] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100 w-fit">
                        <Clock className="h-3 w-3" />
                        <span>Pending</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 pr-4 text-right">
                      <button 
                        className="px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-all shadow-md shadow-emerald-500/20 group-hover:scale-105"
                      >
                        Verify Data
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
