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
  Calendar
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
}

export default function Dashboard({ 
  documents, 
  stats, 
  loading, 
  onViewDocument,
  currentUserRole = "ap_executive",
  currentUserEmail = "ap.executive@company.com",
  setCurrentView
}: DashboardProps) {
  const [listFilter, setListFilter] = useState<'all' | 'action' | 'approved' | 'review' | 'grn' | 'action_required' | 'my_approvals'>('all');
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

  // Role details calculations
  const pendingGRNCount = documents.filter(d => d.status === "Waiting for GRN" || d.status === "Received").length;
  const pendingApprovalsCount = documents.filter(d => d.activeApprovalLog?.status === "Pending").length;
  const readyPaymentCount = documents.filter(d => d.status === "Ready for Payment").length;
  const totalPaidInvoicesCount = documents.filter(d => d.status === "Paid").length;
  const bottleneckCount = pendingGRNCount + pendingApprovalsCount;

  const statusChartData = [
    { name: "Approved", value: documents.filter(i => i.status === "Paid" || i.status === "Approved" || i.status === "Ready for Payment").length, color: "#14b8a6" },
    { name: "In Review", value: documents.filter(i => i.status === "In Approval" || i.status === "Ready for Approval").length, color: "#8b5cf6" },
    { name: "Awaiting GRN", value: documents.filter(i => i.status === "Waiting for GRN" || i.status === "Received").length, color: "#f43f5e" },
  ].filter(s => s.value > 0);

  // Render role indicator bar
  const roleLabels: { [key: string]: string } = {
    md: "Managing Director (MD) - Overview Dashboard",
    gm: "General Manager (GM) - Operational Status",
    cio: "Chief Info Officer (CIO) - System Health & Verification Logs",
    finance_manager: "Finance Manager - Bills Overview",
    department_manager: "Department Manager - Local Approvals Counter",
    ap_executive: "AP Team Executive - Invoice Upload Desk",
    admin: "System Administrator - Control Settings",
  };

  return (
    <div className="space-y-1 animate-fadeIn w-full">
      
      {/* Role Banner Badge */}
      <div className="bg-slate-900 border border-slate-700/50 p-2 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-[0_8px_30px_rgb(0,0,0,0.2)] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black overflow-hidden relative backdrop-blur-2xl">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-80"></div>
        <div className="flex items-center space-x-3 text-[10px] text-slate-300 z-10 px-1">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]"></span>
          </span>
          <span className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">Active Desk:</span>
          <span className="font-black text-white text-[11px] tracking-wide">{roleLabels[currentUserRole] || "Enterprise Hub view"}</span>
        </div>
        <div className="flex items-center gap-2 z-10">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 font-extrabold px-3 py-1.5 rounded-lg border border-emerald-500/30 uppercase tracking-widest text-[9px] shadow-[inset_0_0_15px_rgba(16,185,129,0.15)] backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live Polling Active
          </div>
          <div className="text-[10px] bg-blue-500/10 text-blue-400 font-extrabold px-3 py-1.5 rounded-lg border border-blue-500/30 uppercase tracking-widest text-center shadow-[inset_0_0_15px_rgba(59,130,246,0.15)] backdrop-blur-md">
            Verified Access
          </div>
        </div>
      </div>

      {/* RENDER TAILORED KPIS DEPENDING ON ROLE */}
      
      {currentUserRole === "admin" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-3">
          <div 
            onClick={() => { setListFilter('all'); setDocTypeFilter('All'); }}
            className="bg-white/80 backdrop-blur-xl border border-white/60 p-3 rounded-[1rem] flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group min-h-[100px]"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-50/0 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <div className="bg-blue-50 text-blue-600 rounded-md flex items-center justify-center p-1 border border-blue-100/50 shadow-sm">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Ingested</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              <span className="block text-2xl font-black text-slate-800 tracking-tight font-display drop-shadow-sm group-hover:text-blue-600 transition-colors">
                {stats?.totalDocuments ?? documents.length}
              </span>
              <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">Invoices</span>
            </div>
          </div>

          <div 
            onClick={() => { setListFilter('grn'); setDocTypeFilter('All'); }}
            className="bg-white/80 backdrop-blur-xl border border-white/60 p-3 rounded-[1rem] flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(245,158,11,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group min-h-[100px]"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-50/0 to-amber-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <div className="bg-amber-50 text-amber-600 rounded-md flex items-center justify-center p-1 border border-amber-100/50 shadow-sm">
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Awaiting GRN</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              <span className="block text-2xl font-black text-slate-800 tracking-tight font-display drop-shadow-sm group-hover:text-amber-600 transition-colors">
                {pendingGRNCount}
              </span>
              <span className="text-[9px] text-amber-600/80 font-bold tracking-widest uppercase mt-0.5">Waiting receipt</span>
            </div>
          </div>

          <div 
            onClick={() => { setListFilter('approved'); setDocTypeFilter('All'); }}
            className="bg-white/80 backdrop-blur-xl border border-white/60 p-3 rounded-[1rem] flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group min-h-[100px]"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-50/0 to-emerald-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <div className="bg-emerald-50 text-emerald-600 rounded-md flex items-center justify-center p-1 border border-emerald-100/50 shadow-sm">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Approved Bills</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              <span className="block text-2xl font-black text-slate-800 tracking-tight font-display drop-shadow-sm group-hover:text-emerald-600 transition-colors">
                {documents.filter(d => d.status === "Paid" || d.status === "Approved" || d.status === "Ready for Payment").length}
              </span>
              <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">Passed Check</span>
            </div>
          </div>

          <div 
            onClick={() => { setListFilter('review'); setDocTypeFilter('All'); }}
            className="bg-white/80 backdrop-blur-xl border border-white/60 p-3 rounded-[1rem] flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(99,102,241,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group min-h-[100px]"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-50/0 to-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <div className="bg-indigo-50 text-indigo-600 rounded-md flex items-center justify-center p-1 border border-indigo-100/50 shadow-sm">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">In Review</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              <span className="block text-2xl font-black text-slate-800 tracking-tight font-display drop-shadow-sm group-hover:text-indigo-600 transition-colors">
                {pendingApprovalsCount}
              </span>
              <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">Under check</span>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xl border border-white/60 p-3 rounded-[1rem] flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group min-h-[100px]">
            <div className="absolute inset-0 bg-gradient-to-tr from-slate-100/0 to-slate-100/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <div className="bg-slate-100 text-slate-600 rounded-md flex items-center justify-center p-1 border border-slate-200/50 shadow-sm">
                <IndianRupee className="h-4 w-4" />
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Processed Today</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-0.5">
              <span className="block text-2xl font-black text-slate-800 tracking-tight font-display drop-shadow-sm group-hover:text-slate-600 transition-colors">
                {formatCurrency(totalSpentVal)}
              </span>
              <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">Total Bill Amount</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-3 mt-3">
          <div 
            onClick={() => { setListFilter('action_required'); setDocTypeFilter('All'); }}
            className="bg-white/80 backdrop-blur-xl border border-white/60 p-3 rounded-[1rem] flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(245,158,11,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group min-h-[120px]"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-amber-50/0 to-amber-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <div className="bg-amber-50 text-amber-600 rounded-md flex items-center justify-center p-1.5 border border-amber-100/50 shadow-sm">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">Action Required</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-1">
              <span className="block text-3xl font-black text-slate-800 tracking-tight font-display drop-shadow-sm group-hover:text-amber-600 transition-colors">
                {documents.filter(d => !!d.is_current_approver).length}
              </span>
              <span className="text-[10px] text-amber-600/80 font-bold tracking-widest uppercase">Pending Approvals</span>
            </div>
          </div>

          <div 
            onClick={() => { setListFilter('my_approvals'); setDocTypeFilter('All'); }}
            className="bg-white/80 backdrop-blur-xl border border-white/60 p-3 rounded-[1rem] flex flex-col items-center justify-center text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden group min-h-[120px]"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-50/0 to-emerald-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <div className="bg-emerald-50 text-emerald-600 rounded-md flex items-center justify-center p-1.5 border border-emerald-100/50 shadow-sm">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest">My Approvals</span>
            </div>
            <div className="relative z-10 flex flex-col items-center gap-1">
              <span className="block text-3xl font-black text-slate-800 tracking-tight font-display drop-shadow-sm group-hover:text-emerald-600 transition-colors">
                {documents.filter(d => !d.is_current_approver && (d.status === "Approved" || d.status === "Paid" || d.status === "Ready for Payment" || d.status === "In Approval")).length}
              </span>
              <span className="text-[10px] text-emerald-600/80 font-bold tracking-widest uppercase">Documents Approved</span>
            </div>
          </div>
        </div>
      )}





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
              <select 
                value={docTypeFilter} 
                onChange={(e) => { setDocTypeFilter(e.target.value); setCurrentPage(1); }}
                className="text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 font-semibold text-slate-600 outline-none"
              >
                <option value="All">All Types</option>
                {Array.from(new Set(documents.map(d => d.document_type).filter(Boolean))).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div>

            <div className="flex flex-col gap-1 mt-1">
          {(() => {
            let filteredDocs = documents;
            if (listFilter === 'action') {
              filteredDocs = filteredDocs.filter(d => d.status === "In Approval" || d.status === "Waiting for GRN");
            } else if (listFilter === 'approved') {
              filteredDocs = filteredDocs.filter(d => d.status === "Paid" || d.status === "Approved" || d.status === "Ready for Payment");
            } else if (listFilter === 'review') {
              filteredDocs = filteredDocs.filter(d => d.activeApprovalLog?.status === "Pending" || d.status === "Ready for Approval");
            } else if (listFilter === 'action_required') {
              filteredDocs = filteredDocs.filter(d => !!d.is_current_approver);
            } else if (listFilter === 'my_approvals') {
              filteredDocs = filteredDocs.filter(d => !d.is_current_approver && (d.status === "Approved" || d.status === "Paid" || d.status === "Ready for Payment" || d.status === "In Approval" || d.status.includes('Pending Approval')));
            } else if (listFilter === 'grn') {
              filteredDocs = filteredDocs.filter(d => d.status === "Waiting for GRN" || d.status === "Received");
            }
            
            if (docTypeFilter !== 'All') {
              filteredDocs = filteredDocs.filter(d => d.document_type === docTypeFilter);
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
                      className="bg-white/90 backdrop-blur-xl border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] py-1.5 px-2 rounded-lg cursor-pointer hover:border-blue-400 hover:shadow-[0_8px_30px_rgb(59,130,246,0.12)] hover:-translate-y-0.5 group transition-all duration-300 flex items-center justify-between relative overflow-hidden mb-1"
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
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase tracking-widest border border-slate-200/50 shadow-sm">{doc.document_type || "Invoice"}</span>
                            <span className="font-mono font-bold text-slate-400 text-[9px]">{doc.tracking_id ? `${doc.tracking_id} | ${doc.invoice_number}` : (doc.invoice_number || "Checking...")}</span>
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
