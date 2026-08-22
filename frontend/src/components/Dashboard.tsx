import { useState } from "react";
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  IndianRupee, 
  Cpu, 
  Loader2, 
  ArrowRight, 
  Activity, 
  TrendingUp,
  BarChart as BarChartIcon, 
  ShieldCheck, 
  Database,
  Building2,
  Server,
  Zap,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  PauseCircle,
  XCircle
} from "lucide-react";
import { DbInvoice } from "../types.ts";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
interface DashboardProps {
  documents: DbInvoice[];
  stats: any | null;
  loading: boolean;
  onViewDocument: (docId: string) => void;
  currentUserRole?: string;
  currentUserEmail?: string;
  setCurrentView?: (view: string) => void;
  requireGRN?: boolean;
}

export default function Dashboard({ 
  documents, 
  stats, 
  loading, 
  onViewDocument,
  currentUserRole = "ap_executive",
  currentUserEmail = "ap.executive@company.com",
  setCurrentView,
  requireGRN = true
}: DashboardProps) {
  const [listFilter, setListFilter] = useState<'all' | 'pending' | 'inprogress' | 'approved' | 'rejected' | 'onhold'>(
    'all'
  );
  const [docTypeFilter, setDocTypeFilter] = useState<string>('All');
  const [activeChartTab, setActiveChartTab] = useState<'status' | 'vendors'>('status');
  const [currentPage, setCurrentPage] = useState(1);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_month'>('all');
  const itemsPerPage = 8;

  if (loading || !stats) {

  return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[150px]">
        <Loader2 className="h-9 w-9 text-blue-600 animate-spin mb-1" />
        <p className="text-slate-500 font-semibold text-[10px] uppercase tracking-widest font-display">
          Aggregating Relational Ledgers...
        </p>
      </div>
    );
  }

  // Vendor Spend Chart Data
  const vendorMap: { [key: string]: number } = {};
  documents.forEach((i) => {
    const v = i.vendor_name || 'Unknown';
    vendorMap[v] = (vendorMap[v] || 0) + Number(i.amount || 0);
  });
  const topVendorsData = Object.keys(vendorMap)
    .filter(k => k !== 'Unknown')
    .map(name => ({ name: name.length > 15 ? name.substring(0, 15) + '...' : name, value: vendorMap[name] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Formatting currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(val);
  };

  // Timeline activities feed
  const recentInvoices = [...documents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const totalSpentVal = documents.reduce((acc, curr) => acc + curr.amount, 0);

  // Dynamic Dashboard KPI Calculations
  const pendingCount = documents.filter(d => !!d.is_current_approver).length;
  const approvedCount = documents.filter(d => ["Approved", "Paid", "Ready for Payment"].includes(d.status)).length;
  const isRejectedStatus = (st: string) => {
    const s = (st || '').toLowerCase();
    return s.includes('reject') || s.includes('return') || s.includes('cancel') || s.includes('fail');
  };
  const rejectedCount = documents.filter(d => isRejectedStatus(d.status)).length;
  const onHoldCount = documents.filter(d => d.status === "On Hold").length;
  const inProgressCount = documents.filter(d => 
    !["Approved", "Paid", "Ready for Payment", "On Hold"].includes(d.status) &&
    !isRejectedStatus(d.status) &&
    !d.is_current_approver
  ).length;

  const statusChartData = [
    { name: "Approved", value: documents.filter(i => i.status === "Paid" || i.status === "Approved" || i.status === "Ready for Payment").length, color: "#14b8a6" },
    { name: "In Review", value: documents.filter(i => i.status === "In Approval" || i.status === "Ready for Approval").length, color: "#8b5cf6" },
    requireGRN ? { name: "Awaiting GRN", value: documents.filter(i => i.status === "Waiting for GRN" || i.status === "Received").length, color: "#f43f5e" } : null,
  ].filter(Boolean).filter(s => s!.value > 0) as any[];

  // Render role indicator bar
  const roleLabels: { [key: string]: string } = {
    md: "Managing Director (MD) - Overview Dashboard",
    gm: "General Manager (GM) - Operational Status",
    cio: "Chief Info Officer (CIO) - System Health & Verification Logs",
    finance_manager: "Finance Manager - Documents Overview",
    department_manager: "Department Manager - Local Approvals Counter",
    ap_executive: "AP Team Executive - Document Upload Desk",
    admin: "System Administrator - Control Settings",
  };

  return (
    <div className="space-y-1 animate-fadeIn w-full">
      

      {/* RENDER TAILORED KPIS DEPENDING ON ROLE */}
      
      {/* UNIFIED 6-CARD METRICS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
        
        {/* 1. Total Documents */}
        <div 
          onClick={() => { setListFilter('all'); setDocTypeFilter('All'); setCurrentPage(1); }}
          className={`bg-white border p-3.5 rounded-xl flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgb(0,0,0,0.02)] transition-all duration-200 cursor-pointer relative overflow-hidden group min-h-[100px] ${
            listFilter === 'all' ? 'border-blue-500 bg-blue-50/5 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-blue-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center p-1.5 border border-blue-100/50 shadow-2xs">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Documents</span>
          </div>
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className="block text-2.5xl font-black text-slate-800 tracking-tight font-display group-hover:text-blue-600 transition-colors">
              {stats?.totalDocuments ?? documents.length}
            </span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">All time</span>
          </div>
        </div>

        {/* 2. Pending */}
        <div 
          onClick={() => { setListFilter('pending'); setDocTypeFilter('All'); setCurrentPage(1); }}
          className={`bg-white border p-3.5 rounded-xl flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgb(0,0,0,0.02)] transition-all duration-200 cursor-pointer relative overflow-hidden group min-h-[100px] ${
            listFilter === 'pending' ? 'border-amber-500 bg-amber-50/5 ring-1 ring-amber-500/20' : 'border-slate-200 hover:border-amber-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center p-1.5 border border-amber-100/50 shadow-2xs">
              <Clock className="h-4.5 w-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pending</span>
          </div>
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className="block text-2.5xl font-black text-slate-800 tracking-tight font-display group-hover:text-amber-600 transition-colors">
              {pendingCount}
            </span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Requires action</span>
          </div>
        </div>

        {/* 3. In Progress */}
        <div 
          onClick={() => { setListFilter('inprogress'); setDocTypeFilter('All'); setCurrentPage(1); }}
          className={`bg-white border p-3.5 rounded-xl flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgb(0,0,0,0.02)] transition-all duration-200 cursor-pointer relative overflow-hidden group min-h-[100px] ${
            listFilter === 'inprogress' ? 'border-blue-400 bg-blue-50/5 ring-1 ring-blue-400/20' : 'border-slate-200 hover:border-blue-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="bg-blue-50 text-blue-500 rounded-lg flex items-center justify-center p-1.5 border border-blue-100/50 shadow-2xs">
              <Activity className="h-4.5 w-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">In Progress</span>
          </div>
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className="block text-2.5xl font-black text-slate-800 tracking-tight font-display group-hover:text-blue-500 transition-colors">
              {inProgressCount}
            </span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">In workflow</span>
          </div>
        </div>

        {/* 4. Approved */}
        <div 
          onClick={() => { setListFilter('approved'); setDocTypeFilter('All'); setCurrentPage(1); }}
          className={`bg-white border p-3.5 rounded-xl flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgb(0,0,0,0.02)] transition-all duration-200 cursor-pointer relative overflow-hidden group min-h-[100px] ${
            listFilter === 'approved' ? 'border-emerald-500 bg-emerald-50/5 ring-1 ring-emerald-500/20' : 'border-slate-200 hover:border-emerald-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center p-1.5 border border-emerald-100/50 shadow-2xs">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Approved</span>
          </div>
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className="block text-2.5xl font-black text-slate-800 tracking-tight font-display group-hover:text-emerald-600 transition-colors">
              {approvedCount}
            </span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Successfully completed</span>
          </div>
        </div>

        {/* 5. Rejected */}
        <div 
          onClick={() => { setListFilter('rejected'); setDocTypeFilter('All'); setCurrentPage(1); }}
          className={`bg-white border p-3.5 rounded-xl flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgb(0,0,0,0.02)] transition-all duration-200 cursor-pointer relative overflow-hidden group min-h-[100px] ${
            listFilter === 'rejected' ? 'border-rose-500 bg-rose-50/5 ring-1 ring-rose-500/20' : 'border-slate-200 hover:border-rose-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center p-1.5 border border-rose-100/50 shadow-2xs">
              <XCircle className="h-4.5 w-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rejected</span>
          </div>
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className="block text-2.5xl font-black text-slate-800 tracking-tight font-display group-hover:text-rose-600 transition-colors">
              {rejectedCount}
            </span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Not approved</span>
          </div>
        </div>

        {/* 6. On Hold */}
        <div 
          onClick={() => { setListFilter('onhold'); setDocTypeFilter('All'); setCurrentPage(1); }}
          className={`bg-white border p-3.5 rounded-xl flex flex-col items-center justify-center text-center shadow-[0_4px_20px_rgb(0,0,0,0.02)] transition-all duration-200 cursor-pointer relative overflow-hidden group min-h-[100px] ${
            listFilter === 'onhold' ? 'border-purple-500 bg-purple-50/5 ring-1 ring-purple-500/20' : 'border-slate-200 hover:border-purple-300 hover:-translate-y-0.5'
          }`}
        >
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <div className="bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center p-1.5 border border-purple-100/50 shadow-2xs">
              <PauseCircle className="h-4.5 w-4.5" />
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">On Hold</span>
          </div>
          <div className="relative z-10 flex flex-col items-center gap-0.5">
            <span className="block text-2.5xl font-black text-slate-800 tracking-tight font-display group-hover:text-purple-600 transition-colors">
              {onHoldCount}
            </span>
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">On hold</span>
          </div>
        </div>
      </div>





      <div className="grid grid-cols-1 gap-3 mt-4">
        <div className="w-full space-y-2 bg-white/50 backdrop-blur-md rounded-xl p-3 border border-slate-200/60 shadow-sm">
          {/* Filter Bar with Heading */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-2">
            <div className="flex items-center gap-1.5 px-1">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <h3 className="text-[10px] font-bold text-slate-800 uppercase tracking-wide">
                Document List
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <select 
                  value={timeFilter}
                  onChange={(e) => { setTimeFilter(e.target.value as any); setCurrentPage(1); }}
                  className="text-[10px] bg-transparent font-bold text-slate-600 outline-none uppercase tracking-wider cursor-pointer"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="this_week">This Week</option>
                  <option value="this_month">This Month</option>
                </select>
              </div>
            </div>
          </div>

          {/* Document Type Badge Filter */}
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50/70 border border-slate-200/50 rounded-xl">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mr-1">Filter by Doc Type:</span>
            <button
              onClick={() => { setDocTypeFilter('All'); setCurrentPage(1); }}
              className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full border transition-all uppercase tracking-wider flex items-center gap-1.5 shadow-sm ${docTypeFilter === 'All' ? "bg-indigo-600 text-white border-indigo-700" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"}`}
            >
              <span>All Documents</span>
              <span className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded-md ${docTypeFilter === 'All' ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                {documents.length}
              </span>
            </button>
            {Array.from(new Set(documents.map(d => (d.document_type || "").toUpperCase().trim()).filter(Boolean))).map(type => {
              const count = documents.filter(d => (d.document_type || "").toUpperCase().trim() === type).length;
              const isActive = docTypeFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => { setDocTypeFilter(type); setCurrentPage(1); }}
                  className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full border transition-all uppercase tracking-wider flex items-center gap-1.5 shadow-sm ${isActive ? "bg-indigo-600 text-white border-indigo-700" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"}`}
                >
                  <span>{type}</span>
                  <span className={`text-[8px] font-extrabold px-1.5 py-0.2 rounded-md ${isActive ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          
          <div>

            <div className="flex flex-col gap-1 mt-1">
          {(() => {
            let filteredDocs = documents;
            if (listFilter === 'all') {
              if (currentUserRole !== 'admin') {
                filteredDocs = filteredDocs.filter(d => !!d.is_current_approver || !!d.has_approved || !!d.has_rejected || isRejectedStatus(d.status));
              }
            } else if (listFilter === 'pending') {
              filteredDocs = filteredDocs.filter(d => !!d.is_current_approver);
            } else if (listFilter === 'inprogress') {
              filteredDocs = filteredDocs.filter(d => 
                !["Approved", "Paid", "Ready for Payment", "On Hold"].includes(d.status) &&
                !isRejectedStatus(d.status) &&
                !d.is_current_approver
              );
            } else if (listFilter === 'approved') {
              filteredDocs = filteredDocs.filter(d => ["Approved", "Paid", "Ready for Payment"].includes(d.status));
            } else if (listFilter === 'rejected') {
              filteredDocs = filteredDocs.filter(d => isRejectedStatus(d.status));
            } else if (listFilter === 'onhold') {
              filteredDocs = filteredDocs.filter(d => d.status === "On Hold");
            }
            
            if (docTypeFilter !== 'All') {
              filteredDocs = filteredDocs.filter(d => (d.document_type || "").toUpperCase().trim() === docTypeFilter);
            }
            
            if (timeFilter !== 'all') {
              const now = new Date();
              let cutoffDate = new Date(now);
              
              if (timeFilter === 'today') {
                cutoffDate.setHours(0, 0, 0, 0);
              } else if (timeFilter === 'this_week') {
                cutoffDate.setDate(now.getDate() - 7);
              } else if (timeFilter === 'this_month') {
                cutoffDate.setMonth(now.getMonth() - 1);
              }
              
              filteredDocs = filteredDocs.filter(d => new Date(d.created_at) >= cutoffDate);
            }

            const totalPages = Math.ceil(filteredDocs.length / itemsPerPage);
            const paginatedDocs = filteredDocs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

            return (
              <>
                {paginatedDocs.length > 0 ? (
                  paginatedDocs.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => onViewDocument(doc.id)}
                      className="bg-white/90 backdrop-blur-xl border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] py-1 px-2 rounded-lg cursor-pointer hover:border-blue-400 hover:shadow-[0_8px_30px_rgb(59,130,246,0.12)] hover:-translate-y-0.5 group transition-all duration-300 flex items-center justify-between relative overflow-hidden mb-0.5"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-200 group-hover:bg-blue-500 transition-colors duration-300"></div>
                      <div className="space-y-0.5 flex items-center space-x-2 pl-2">
                         <div className="border border-slate-100 p-1.5 bg-slate-50/50 rounded-md text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:scale-110 transition-all duration-300 shrink-0 shadow-sm">
                          <Clock className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className="font-black text-slate-800 text-[11px] block tracking-tight group-hover:text-blue-700 transition-colors leading-none mb-0.5">
                            {doc.vendor_name || "Evaluating details..."}
                          </span>
                          <div className="flex items-center space-x-1.5 mt-0.5 text-[9px] font-medium text-slate-500 font-sans">
                            <span 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (doc.document_type) {
                                  setDocTypeFilter(doc.document_type.toUpperCase().trim());
                                  setCurrentPage(1);
                                }
                              }}
                              className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase tracking-widest border border-slate-200/50 shadow-sm hover:bg-indigo-600 hover:text-white hover:border-indigo-700 cursor-pointer transition-all"
                              title="Click to filter by this type"
                            >
                              {doc.document_type || "Document"}
                            </span>
                            <span className="font-mono font-bold text-slate-400 text-[9px]">{doc.id} {doc.invoice_number ? `| ${doc.invoice_number}` : ""}</span>
                            <span className="text-slate-300">•</span>
                            <span className={`font-bold uppercase tracking-widest px-1.5 py-0.5 text-[8px] rounded-[4px] shadow-sm ${doc.status.includes('Approval') ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                              {doc.status.includes("Approval") && doc.workflowInst?.current_stage_index 
                                ? `In Approval: ${doc.workflowInst.current_stage_index}${
                                    doc.workflowInst.current_stage_index === 1 ? 'st' :
                                    doc.workflowInst.current_stage_index === 2 ? 'nd' :
                                    doc.workflowInst.current_stage_index === 3 ? 'rd' : 'th'
                                  } Stage` 
                                : doc.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex items-center space-x-3 pr-1">
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-none mb-0.5">Amount</span>
                          <span className="text-[11px] font-black text-slate-800 tracking-tight font-display leading-none">
                            ₹{doc.amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="h-5 w-5 bg-slate-50 rounded-full flex items-center justify-center group-hover:bg-blue-600 transition-colors duration-300 shadow-sm border border-slate-100 group-hover:border-blue-600">
                          <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-white transform group-hover:translate-x-0.5 transition-all duration-300" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 bg-blue-50/30 border border-dashed border-blue-300/60 rounded-xl col-span-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600 mb-1" />
                    <p className="text-[10px] font-semibold uppercase text-center text-slate-500 tracking-wider">
                      All clear! No documents found for this view.
                    </p>
                  </div>
                )}

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 bg-slate-50 rounded-xl p-2 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-2">
                      Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredDocs.length)} of {filteredDocs.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button 
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-100 transition"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <div className="flex items-center gap-1 px-2">
                        {Array.from({ length: totalPages }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(i + 1)}
                            className={`h-7 w-7 rounded-md text-[11px] font-bold flex items-center justify-center transition-colors ${
                              currentPage === i + 1 
                                ? 'bg-blue-600 text-white shadow-sm' 
                                : 'bg-transparent text-slate-500 hover:bg-slate-200'
                            }`}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <button 
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-100 transition"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
