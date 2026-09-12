import { useState } from "react";
import { 
  Clock, 
  PauseCircle, 
  CheckCircle2, 
  Activity, 
  XCircle, 
  ShieldCheck, 
  CalendarDays, 
  ChevronDown,
  ArrowRight,
  Loader2
} from "lucide-react";
import { DbInvoice } from "../types.ts";
// import REFERENCE_DOCUMENTS removed to avoid mock data

interface DashboardProps {
  documents: DbInvoice[];
  stats: any | null;
  loading: boolean;
  onViewDocument: (docId: string) => void;
  currentUserRole?: string;
  currentUserEmail?: string;
  currentUserUsername?: string;
  setCurrentView?: (view: string) => void;
  onNavigateToWorkTracker?: (statusFilter: string) => void;
  onNavigateToApproved?: () => void;
  requireGRN?: boolean;
}

export default function Dashboard({ 
  documents, 
  stats: _stats,
  loading, 
  onViewDocument,
  currentUserRole = "employee",
  currentUserEmail = "",
  currentUserUsername = "",
  setCurrentView,
  onNavigateToWorkTracker,
  onNavigateToApproved
}: DashboardProps) {
  const [activeDocType, setActiveDocType] = useState<string>("ALL");
  const [kpiFilter, setKpiFilter] = useState<'pending' | 'hold' | 'rejected'>('pending');
  const [timeRangeOpen, setTimeRangeOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<string>("ALL TIME");
  const [customFromDate, setCustomFromDate] = useState<string>("");
  const [customToDate, setCustomToDate] = useState<string>("");
  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 min-h-[300px]">
        <Loader2 className="h-8 w-8 text-[#003F28] animate-spin mb-2" />
        <p className="text-slate-500 font-bold text-[9.5px] uppercase tracking-widest font-display">
          Loading DAAS Dashboard...
        </p>
      </div>
    );
  }

  // Merge real documents with reference documents if real documents list is empty
  const displayDocs = documents && documents.length > 0
    ? documents.map(d => ({
        id: d.id,
        vendor_name: d.vendor_name || "Enterprise Vendor",
        document_type: (d.document_type || "AP INVOICE").toUpperCase().trim(),
        invoice_number: d.invoice_number || `INV-${d.id.slice(0, 5)}`,
        invoice_date: d.invoice_date || d.doc_date || "2026-09-07",
        status: d.status || "UNROUTED (NO RULE MATCHED)",
        status_badge_type: (d.status && d.status.toLowerCase().includes("initiated")
          ? (d.status.toLowerCase().includes("attachment") ? "initiated_attachment" : "initiated_first")
          : "unrouted") as any,
        amount: d.amount || 45000,
        assigned_approver: d.assigned_approver,
        is_current_approver: d.is_current_approver
      }))
    : [];

  // Filter documents strictly by assigned user if not admin
  const isAssignedToUser = (doc: any) => {
    if (currentUserRole === "admin") return true;
    if (doc.is_current_approver) return true;

    const uHandle = (currentUserUsername || "").toLowerCase().trim();
    const eHandle = (currentUserEmail || "").toLowerCase().trim();
    const approverStr = (doc.assigned_approver || "").toLowerCase();
    const pool = approverStr.split(",").map((s: string) => s.trim());

    if (uHandle && (pool.includes(uHandle) || pool.some((p: string) => p.includes(uHandle) || uHandle.includes(p)))) return true;
    if (eHandle && (pool.includes(eHandle) || pool.some((p: string) => p.includes(eHandle)))) return true;

    if (doc.status === "Data Verification Pending" && (currentUserRole === "ap_executive" || currentUserRole === "executive")) return true;
    return false;
  };

  const userAssignedDocs = currentUserRole === "admin"
    ? displayDocs
    : displayDocs.filter(d => isAssignedToUser(d));

  // Dynamic KPI Count Computations
  const isHoldStatus = (st: string) => {
    const s = (st || "").toLowerCase();
    return s.includes("hold") || s.includes("pause") || s.includes("wait") || s.includes("clarif");
  };

  const isRejectedStatus = (st: string) => {
    const s = (st || "").toLowerCase();
    return s.includes("reject") || s.includes("cancel") || s.includes("void") || s.includes("fail") || s.includes("returned");
  };

  const isApprovedStatus = (st: string) => {
    const s = (st || "").toLowerCase();
    return ["approved", "settled", "paid", "completed", "ready for payment"].some(k => s.includes(k));
  };

  const isPendingStatus = (st: string) => {
    const s = (st || "").toLowerCase();
    if (isHoldStatus(s) || isRejectedStatus(s) || isApprovedStatus(s)) return false;
    return s.includes("pending") || s.includes("initiated") || s.includes("progress") || s.includes("unrouted") || s.includes("verification") || s.includes("review");
  };

  const isProgressStatus = (st: string) => {
    const s = (st || "").toLowerCase();
    if (isHoldStatus(s) || isRejectedStatus(s) || isApprovedStatus(s)) return false;
    return s.includes("progress") || s.includes("review") || s.includes("verification") || s.includes("step") || s.includes("stage") || s.includes("approv");
  };

  const allAvailableDocs = (currentUserRole !== "admin" && documents && documents.length > 0)
    ? userAssignedDocs
    : displayDocs;

  // Base dataset strictly excludes approved documents from Dashboard (dedicated page only)
  const baseDocs = allAvailableDocs.filter(d => !isApprovedStatus(d.status));

  const pendingCount = baseDocs.filter(d => isPendingStatus(d.status)).length;
  const holdCount = baseDocs.filter(d => isHoldStatus(d.status)).length;
  const rejectedCount = baseDocs.filter(d => isRejectedStatus(d.status)).length;
  const progressCount = baseDocs.filter(d => isProgressStatus(d.status) || isPendingStatus(d.status)).length;
  const approvedCount = allAvailableDocs.filter(d => isApprovedStatus(d.status)).length;

  const activeTotal = pendingCount + holdCount + rejectedCount;
  const pendingPercent = activeTotal > 0 ? Math.round((pendingCount / activeTotal) * 100) : 0;
  const holdPercent = activeTotal > 0 ? Math.round((holdCount / activeTotal) * 100) : 0;
  const rejectedPercent = activeTotal > 0 ? Math.round((rejectedCount / activeTotal) * 100) : 0;
  const progressPercent = activeTotal > 0 ? Math.round((progressCount / activeTotal) * 100) : 0;
  const approvedPercent = allAvailableDocs.length > 0 ? Math.round((approvedCount / allAvailableDocs.length) * 100) : 0;

  // Documents for the current selected queue in Dashboard (Pending by default, or Hold, or Rejected)
  const currentStatusDocs = kpiFilter === 'hold'
    ? baseDocs.filter(d => isHoldStatus(d.status))
    : kpiFilter === 'rejected'
      ? baseDocs.filter(d => isRejectedStatus(d.status))
      : baseDocs.filter(d => isPendingStatus(d.status));

  // Time range filter helper
  const isInTimeRange = (dateStr: string): boolean => {
    if (timeRange === "ALL TIME") return true;
    if (!dateStr) return false;
    const docDate = new Date(dateStr);
    if (isNaN(docDate.getTime())) return false;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (timeRange === "TODAY") {
      return docDate >= todayStart;
    }
    if (timeRange === "THIS WEEK") {
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - todayStart.getDay());
      return docDate >= weekStart;
    }
    if (timeRange === "THIS MONTH") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return docDate >= monthStart;
    }
    if (timeRange === "CUSTOM") {
      const from = customFromDate ? new Date(customFromDate) : null;
      const to = customToDate ? new Date(customToDate + "T23:59:59") : null;
      if (from && docDate < from) return false;
      if (to && docDate > to) return false;
      return true;
    }
    return true;
  };

  // Dynamic Doc Type Pills Filter list for the current active queue
  const currentQueueLabel = `ALL ${kpiFilter.toUpperCase()}`;
  const docTypeFilters = [
    { label: currentQueueLabel, count: currentStatusDocs.length },
    ...["E-VOUCHER", "UTILITY & RENT", "CASH VOUCHER", "AP INVOICE", "STAFF & HR EXPENSE", "GENERAL RECORDS", "PURCHASE INVOICE", "CAPEX / FIXED ASSET"].map(label => {
      const cnt = currentStatusDocs.filter(d => d.document_type.toUpperCase().trim() === label).length;
      return { label, count: cnt };
    })
  ].filter(item => item.label === currentQueueLabel || item.count > 0 || currentUserRole === "admin");

  // Combine Time Range + Doc Type filter for current queue
  const filteredDocs = currentStatusDocs.filter(d => {
    // 1. Time Range filter
    if (!isInTimeRange(d.invoice_date)) return false;
    // 2. Doc Type filter
    if (activeDocType !== currentQueueLabel && activeDocType !== "ALL" && activeDocType !== "ALL DOCUMENTS") {
      if (d.document_type.toUpperCase().trim() !== activeDocType.toUpperCase().trim()) {
        return false;
      }
    }
    return true;
  });

  // Render Status Badge matching exact reference image design
  const renderStatusBadge = (statusText: string, badgeType?: string) => {
    const sLower = statusText.toLowerCase();

    if (badgeType === "initiated_first" || sLower.includes("first approval") || sLower.includes("initiated (first")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[8.5px] font-extrabold tracking-wide uppercase bg-[#FFF9E6] text-[#E65100] border border-[#FFCC80]">
          <span className="h-1 w-1 rounded-full bg-[#E65100]" />
          INITIATED (FIRST APPROVAL)
        </span>
      );
    }

    if (badgeType === "initiated_attachment" || sLower.includes("attachment status") || sLower.includes("initiated (attachment")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[8.5px] font-extrabold tracking-wide uppercase bg-[#FFF9E6] text-[#E65100] border border-[#FFCC80]">
          <span className="h-1 w-1 rounded-full bg-[#E65100]" />
          INITIATED (ATTACHMENT STATUS)
        </span>
      );
    }

    if (badgeType === "unrouted" || sLower.includes("unrouted") || sLower.includes("no rule")) {
      return (
        <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[8.5px] font-extrabold tracking-wide uppercase bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
          UNROUTED (NO RULE MATCHED)
        </span>
      );
    }

    if (sLower.includes("approved") || sLower.includes("settled") || sLower.includes("paid")) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[8.5px] font-extrabold tracking-wide uppercase bg-[#E7F9F1] text-[#059669] border border-[#A7F3D0]">
          <span className="h-1 w-1 rounded-full bg-[#059669]" />
          {statusText}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[8.5px] font-extrabold tracking-wide uppercase bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
        {statusText}
      </span>
    );
  };

  return (
    <div className="bg-[#F7F8F6] p-2 sm:p-2.5 space-y-2.5 animate-fadeIn font-sans text-slate-800 max-w-[1720px] mx-auto">
      
      {/* 1. FIVE CURVED STATISTIC CARDS ROW (STRICTLY WORKFLOW QUEUES & DESTINATIONS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2">
        
        {/* Card 1: PENDING (Filter in Dashboard) */}
        <div 
          onClick={() => { setKpiFilter('pending'); setActiveDocType('ALL'); }}
          title="Click to show Pending documents in Dashboard"
          className={`bg-white border rounded-xl p-2 min-h-[82px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200 cursor-pointer ${
            kpiFilter === 'pending'
              ? 'border-[#FFBE00] ring-2 ring-[#FFBE00]/40 bg-[#FFFDF5]'
              : 'border-[#E2E7E3] hover:border-[#FFBE00]'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <div className="h-5 w-5 rounded-md bg-[#FFF7E2] text-[#D97706] flex items-center justify-center shrink-0 border border-[#FDE68A]">
                <Clock className="h-3 w-3" />
              </div>
              <span className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider font-display truncate">
                PENDING
              </span>
            </div>
            {kpiFilter === 'pending' ? (
              <span className="text-[7px] font-black bg-[#FFBE00] text-[#002F20] px-1 py-0.2 rounded">
                ACTIVE
              </span>
            ) : (
              <span className="text-[7.5px] font-bold text-slate-400 group-hover:text-[#D97706] transition-colors">
                FILTER ↓
              </span>
            )}
          </div>

          <div className="flex items-baseline justify-between my-auto px-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-display leading-none">
              {pendingCount}
            </span>
            <span className="text-[8px] font-extrabold text-[#D97706] bg-[#FFF7E2] px-1.5 py-0.5 rounded border border-[#FDE68A]/60">
              {pendingPercent}% OF ACTIVE
            </span>
          </div>

          {/* Dynamic Real-time Progress Bar */}
          <div className="w-full space-y-0.5 mt-1">
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div 
                className="h-full rounded-full bg-[#FFBE00] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(pendingCount > 0 ? 5 : 0, pendingPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[7px] font-bold text-slate-400 uppercase tracking-wider">
              <span>IN DASHBOARD</span>
              <span>{pendingCount} OF {activeTotal}</span>
            </div>
          </div>

          {/* Curved Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#FFBE00] rounded-b-xl"></div>
        </div>

        {/* Card 2: HOLD (Filter in Dashboard) */}
        <div 
          onClick={() => { setKpiFilter('hold'); setActiveDocType('ALL'); }}
          title="Click to show Hold documents in Dashboard"
          className={`bg-white border rounded-xl p-2 min-h-[82px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200 cursor-pointer ${
            kpiFilter === 'hold'
              ? 'border-[#A855F7] ring-2 ring-[#A855F7]/40 bg-[#FAF5FF]'
              : 'border-[#E2E7E3] hover:border-purple-400'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <div className="h-5 w-5 rounded-md bg-[#F7E8FF] text-[#9333EA] flex items-center justify-center shrink-0 border border-[#F0ABFC]">
                <PauseCircle className="h-3 w-3" />
              </div>
              <span className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider font-display truncate">
                HOLD
              </span>
            </div>
            {kpiFilter === 'hold' ? (
              <span className="text-[7px] font-black bg-[#A855F7] text-white px-1 py-0.2 rounded">
                ACTIVE
              </span>
            ) : (
              <span className="text-[7.5px] font-bold text-slate-400 group-hover:text-[#9333EA] transition-colors">
                FILTER ↓
              </span>
            )}
          </div>

          <div className="flex items-baseline justify-between my-auto px-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-display leading-none">
              {holdCount}
            </span>
            <span className="text-[8px] font-extrabold text-[#9333EA] bg-[#F7E8FF] px-1.5 py-0.5 rounded border border-[#F0ABFC]/60">
              {holdPercent}% OF ACTIVE
            </span>
          </div>

          {/* Dynamic Real-time Progress Bar */}
          <div className="w-full space-y-0.5 mt-1">
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div 
                className="h-full rounded-full bg-[#A855F7] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(holdCount > 0 ? 5 : 0, holdPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[7px] font-bold text-slate-400 uppercase tracking-wider">
              <span>IN DASHBOARD</span>
              <span>{holdCount} OF {activeTotal}</span>
            </div>
          </div>

          {/* Curved Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#A855F7] rounded-b-xl"></div>
        </div>

        {/* Card 3: REJECTED (Filter in Dashboard) */}
        <div 
          onClick={() => { setKpiFilter('rejected'); setActiveDocType('ALL'); }}
          title="Click to show Rejected documents in Dashboard"
          className={`bg-white border rounded-xl p-2 min-h-[82px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200 cursor-pointer ${
            kpiFilter === 'rejected'
              ? 'border-[#EF4444] ring-2 ring-[#EF4444]/40 bg-[#FFF1F2]'
              : 'border-[#E2E7E3] hover:border-rose-400'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <div className="h-5 w-5 rounded-md bg-[#FFECEF] text-[#DC2626] flex items-center justify-center shrink-0 border border-[#FECDD3]">
                <XCircle className="h-3 w-3" />
              </div>
              <span className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider font-display truncate">
                REJECTED
              </span>
            </div>
            {kpiFilter === 'rejected' ? (
              <span className="text-[7px] font-black bg-[#EF4444] text-white px-1 py-0.2 rounded">
                ACTIVE
              </span>
            ) : (
              <span className="text-[7.5px] font-bold text-slate-400 group-hover:text-[#DC2626] transition-colors">
                FILTER ↓
              </span>
            )}
          </div>

          <div className="flex items-baseline justify-between my-auto px-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-display leading-none">
              {rejectedCount}
            </span>
            <span className="text-[8px] font-extrabold text-[#DC2626] bg-[#FFECEF] px-1.5 py-0.5 rounded border border-[#FECDD3]/60">
              {rejectedPercent}% OF ACTIVE
            </span>
          </div>

          {/* Dynamic Real-time Progress Bar */}
          <div className="w-full space-y-0.5 mt-1">
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div 
                className="h-full rounded-full bg-[#EF4444] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(rejectedCount > 0 ? 5 : 0, rejectedPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[7px] font-bold text-slate-400 uppercase tracking-wider">
              <span>IN DASHBOARD</span>
              <span>{rejectedCount} OF {activeTotal}</span>
            </div>
          </div>

          {/* Curved Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#EF4444] rounded-b-xl"></div>
        </div>

        {/* Card 4: PROGRESS (Navigates to Work Tracker) */}
        <div 
          onClick={() => {
            if (onNavigateToWorkTracker) {
              onNavigateToWorkTracker("all");
            } else if (setCurrentView) {
              localStorage.setItem("workTrackerStatusFilter", "all");
              setCurrentView("work-tracker");
            }
          }}
          title="Click to open Work Tracker"
          className="bg-white border border-[#E2E7E3] hover:border-blue-400 hover:ring-2 hover:ring-blue-400/20 rounded-xl p-2 min-h-[82px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <div className="h-5 w-5 rounded-md bg-[#EAF3FF] text-[#2563EB] flex items-center justify-center shrink-0 border border-[#BFDBFE]">
                <Activity className="h-3 w-3" />
              </div>
              <span className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider font-display truncate">
                PROGRESS
              </span>
            </div>
            <span className="text-[7.5px] font-extrabold text-[#2563EB] bg-[#EAF3FF] px-1 py-0.2 rounded border border-[#BFDBFE]/60 group-hover:bg-[#2563EB] group-hover:text-white transition-all flex items-center gap-0.5">
              <span>TRACKER</span>
              <ArrowRight className="h-2 w-2" />
            </span>
          </div>

          <div className="flex items-baseline justify-between my-auto px-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-display leading-none">
              {progressCount}
            </span>
            <span className="text-[8px] font-extrabold text-[#2563EB] bg-[#EAF3FF] px-1.5 py-0.5 rounded border border-[#BFDBFE]/60">
              {progressPercent}% OF ACTIVE
            </span>
          </div>

          {/* Dynamic Real-time Progress Bar */}
          <div className="w-full space-y-0.5 mt-1">
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div 
                className="h-full rounded-full bg-[#3B82F6] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(progressCount > 0 ? 5 : 0, progressPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[7px] font-bold text-slate-400 uppercase tracking-wider">
              <span>WORK TRACKER</span>
              <span>{progressCount} OF {activeTotal}</span>
            </div>
          </div>

          {/* Curved Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#3B82F6] rounded-b-xl"></div>
        </div>

        {/* Card 5: APPROVED (Navigates to Approved Documents page) */}
        <div 
          onClick={() => {
            if (onNavigateToApproved) {
              onNavigateToApproved();
            } else if (setCurrentView) {
              setCurrentView("approved-documents");
            }
          }}
          title="Click to open dedicated Approved Documents page"
          className="bg-white border border-[#E2E7E3] hover:border-emerald-400 hover:ring-2 hover:ring-emerald-400/20 rounded-xl p-2 min-h-[82px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <div className="h-5 w-5 rounded-md bg-[#E7F9F1] text-[#059669] flex items-center justify-center shrink-0 border border-[#A7F3D0]">
                <CheckCircle2 className="h-3 w-3" />
              </div>
              <span className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider font-display truncate">
                APPROVED
              </span>
            </div>
            <span className="text-[7.5px] font-extrabold text-[#059669] bg-[#E7F9F1] px-1 py-0.2 rounded border border-[#A7F3D0]/60 group-hover:bg-[#059669] group-hover:text-white transition-all flex items-center gap-0.5">
              <span>PAGE</span>
              <ArrowRight className="h-2 w-2" />
            </span>
          </div>

          <div className="flex items-baseline justify-between my-auto px-0.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 font-display leading-none">
              {approvedCount}
            </span>
            <span className="text-[8px] font-extrabold text-[#059669] bg-[#E7F9F1] px-1.5 py-0.5 rounded border border-[#A7F3D0]/60">
              {approvedPercent}% SETTLED
            </span>
          </div>

          {/* Dynamic Real-time Progress Bar */}
          <div className="w-full space-y-0.5 mt-1">
            <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
              <div 
                className="h-full rounded-full bg-[#10B981] transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(approvedCount > 0 ? 5 : 0, approvedPercent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[7px] font-bold text-slate-400 uppercase tracking-wider">
              <span>APPROVED REPOSITORY</span>
              <span>{approvedCount} SETTLED</span>
            </div>
          </div>

          {/* Curved Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#10B981] rounded-b-xl"></div>
        </div>

      </div>

      {/* 2. DOCUMENT LIST CONTAINER */}
      <div className="bg-white border border-[#E3E8E4] rounded-[12px] p-3 sm:p-3.5 shadow-2xs space-y-2.5">
        
        {/* Header & Date Filter */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-150">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#003F28]" />
            <h2 className="text-[11px] font-black text-[#003F28] uppercase tracking-wide font-display flex items-center">
              {kpiFilter === 'pending' && `PENDING DOCUMENTS (${filteredDocs.length})`}
              {kpiFilter === 'hold' && `HOLD DOCUMENTS (${filteredDocs.length})`}
              {kpiFilter === 'rejected' && `REJECTED DOCUMENTS (${filteredDocs.length})`}
            </h2>
          </div>

          {/* Date Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setTimeRangeOpen(!timeRangeOpen)}
              className={`flex items-center gap-1 px-2 py-0.5 border rounded text-[9.5px] font-bold transition-colors cursor-pointer ${
                timeRange !== "ALL TIME"
                  ? "bg-[#003F28] text-white border-[#003F28]"
                  : "bg-[#F7F8F6] border-slate-250 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <CalendarDays className="h-3 w-3" />
              <span className="uppercase">{timeRange}</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-70" />
            </button>

            {timeRangeOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setTimeRangeOpen(false)}></div>
                <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-40 text-[9.5px] font-bold font-sans">
                  {["ALL TIME", "TODAY", "THIS WEEK", "THIS MONTH", "CUSTOM"].map((range) => (
                    <button
                      key={range}
                      onClick={() => {
                        setTimeRange(range);
                        setTimeRangeOpen(false);
                        if (range === "CUSTOM") setCustomPickerOpen(true);
                        else setCustomPickerOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 hover:bg-emerald-50 hover:text-[#003F28] transition-colors cursor-pointer flex items-center justify-between ${
                        timeRange === range ? "bg-emerald-50 text-[#003F28]" : "text-slate-700"
                      }`}
                    >
                      <span>{range}</span>
                      {timeRange === range && <span className="text-[#003F28]">✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* CUSTOM Date Range Picker */}
            {timeRange === "CUSTOM" && customPickerOpen && (
              <div className="absolute right-0 mt-1 w-[220px] bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-40">
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-wider mb-2">Custom Date Range</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[8.5px] font-bold text-slate-500 uppercase block mb-0.5">From</label>
                    <input
                      type="date"
                      value={customFromDate}
                      onChange={e => setCustomFromDate(e.target.value)}
                      className="w-full border border-slate-200 rounded px-2 py-1 text-[9.5px] font-bold text-slate-700 focus:outline-none focus:border-[#003F28]"
                    />
                  </div>
                  <div>
                    <label className="text-[8.5px] font-bold text-slate-500 uppercase block mb-0.5">To</label>
                    <input
                      type="date"
                      value={customToDate}
                      onChange={e => setCustomToDate(e.target.value)}
                      className="w-full border border-slate-200 rounded px-2 py-1 text-[9.5px] font-bold text-slate-700 focus:outline-none focus:border-[#003F28]"
                    />
                  </div>
                  <button
                    onClick={() => setCustomPickerOpen(false)}
                    className="w-full bg-[#003F28] text-white text-[9px] font-bold py-1.5 rounded hover:bg-[#004B32] transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filter By Doc Type Pills */}
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider mr-0.5 font-display">
              FILTER BY DOC TYPE:
            </span>
            
            {docTypeFilters.map((filter) => {
              const isActive = activeDocType.toUpperCase() === filter.label.toUpperCase();
              return (
                <button
                  key={filter.label}
                  onClick={() => setActiveDocType(filter.label)}
                  className={`px-2 py-0.5 rounded-[14px] text-[8.5px] font-extrabold uppercase tracking-wider transition-all duration-200 flex items-center gap-1 cursor-pointer shadow-2xs ${
                    isActive
                      ? "bg-[#003F28] text-white border border-[#003F28]"
                      : "bg-white text-slate-700 border border-[#E2E7E3] hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`px-1 py-0.1 rounded text-[7.5px] font-black font-mono ${
                    isActive ? "bg-[#FFBE00] text-[#003F28]" : "bg-slate-100 text-slate-600"
                  }`}>
                    {filter.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Document List Rows */}
        <div className="space-y-1.5 pt-0.5">
          {filteredDocs.length > 0 ? (
            filteredDocs.map((doc) => (
              <div
                key={doc.id}
                onClick={() => onViewDocument(doc.id)}
                className="bg-white border border-[#E6EAE7] rounded-[7px] px-3 py-1.5 hover:border-[#003F28] hover:shadow-xs transition-all duration-200 flex items-center justify-between gap-2.5 cursor-pointer group"
              >
                {/* Left Side: Icon & Details */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Clock Icon Box */}
                  <div className="h-6 w-6 rounded bg-[#F7F8F6] border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 group-hover:bg-emerald-50 group-hover:text-[#003F28] transition-colors">
                    <Clock className="h-3 w-3" />
                  </div>

                  <div className="flex flex-col min-w-0">
                    {/* Vendor Name */}
                    <span className="font-extrabold text-slate-900 text-[11px] tracking-tight font-display group-hover:text-[#003F28] transition-colors truncate">
                      {doc.vendor_name}
                    </span>

                    {/* Metadata Row */}
                    <div className="flex flex-wrap items-center gap-1 text-[9px] font-semibold text-slate-500 font-sans mt-0.2">
                      {/* Doc Type Badge */}
                      <span className="bg-[#F1F5F2] text-slate-700 px-1 py-0.1 rounded text-[8px] font-bold uppercase tracking-wider border border-slate-200">
                        {doc.document_type}
                      </span>

                      <span className="text-slate-300">|</span>

                      {/* Doc ID */}
                      <span className="font-mono text-slate-600 text-[9px] font-bold">
                        {doc.id}
                      </span>

                      <span className="text-slate-300">|</span>

                      {/* Invoice Number */}
                      <span className="font-mono text-slate-600 text-[9px]">
                        {doc.invoice_number}
                      </span>

                      <span className="text-slate-300">|</span>

                      {/* Date */}
                      <span className="font-mono text-slate-500 text-[9px]">
                        {doc.invoice_date}
                      </span>

                      <span className="text-slate-400">•</span>

                      {/* Status Badge */}
                      {renderStatusBadge(doc.status, doc.status_badge_type)}
                    </div>
                  </div>
                </div>

                {/* Right Side: Amount & Circular Arrow Button */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[7.5px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-0.5">
                      AMOUNT
                    </span>
                    <span className="text-[11px] font-black text-slate-900 tracking-tight font-display leading-none">
                      ₹{doc.amount.toLocaleString("en-IN")}
                    </span>
                  </div>

                  {/* Circular Arrow Button */}
                  <div className="h-6 w-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[#003F28] shadow-2xs group-hover:bg-[#003F28] group-hover:text-white group-hover:border-[#003F28] transition-all duration-200">
                    <ArrowRight className="h-3 w-3 transform group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-slate-400 bg-slate-50 rounded-md border border-dashed border-slate-200">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                No documents found for status: {kpiFilter.toUpperCase()}
              </p>
              <button 
                onClick={() => { setKpiFilter('pending'); setActiveDocType('ALL'); }}
                className="mt-1 text-[8.5px] font-bold text-[#003F28] underline cursor-pointer"
              >
                View Pending Documents
              </button>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
