import React, { useState, useMemo } from "react";
import { 
  Search, 
  FileText, 
  Calendar, 
  X, 
  Eye 
} from "lucide-react";
import { DbInvoice } from "../types";
import { formatDocNumber } from "../utils/formatters";

interface WorkTrackerPageProps {
  documents: DbInvoice[];
  onViewDocument: (id: string) => void;
  currentUserRole?: string;
  currentUserEmail?: string;
  currentUserUsername?: string;
  initialStatusFilter?: string;
}

export default function WorkTrackerPage({ 
  documents, 
  onViewDocument,
  currentUserRole = "employee",
  currentUserEmail = "",
  currentUserUsername = "",
  initialStatusFilter
}: WorkTrackerPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [selectedDocIds, _setSelectedDocIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = initialStatusFilter || localStorage.getItem("workTrackerStatusFilter") || "all";
    return saved === "approved" || saved === "cancelled" ? "all" : saved;
  });
  const [sortBy, _setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "vendor">("date_desc");
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [trackerDocs, setTrackerDocs] = useState<DbInvoice[]>([]);
  const [hasLoadedApi, setHasLoadedApi] = useState(false);

  // Server-side fetching from dedicated /api/documents/work-tracker endpoint
  const fetchTrackerDocs = React.useCallback(async () => {
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/documents/work-tracker", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setTrackerDocs(data);
        setHasLoadedApi(true);
      }
    } catch (err) {
      console.error("Failed to fetch work-tracker docs:", err);
    }
  }, []);

  React.useEffect(() => {
    fetchTrackerDocs();
  }, [fetchTrackerDocs, documents]);

  React.useEffect(() => {
    const handleFocus = () => fetchTrackerDocs();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchTrackerDocs]);

  // Robust date extraction and filter matching
  const getDocumentDates = (d: DbInvoice): string[] => {
    const dates: string[] = [];
    const parseCandidate = (val?: string | null) => {
      if (!val || typeof val !== 'string') return;
      const str = val.trim();
      if (!str) return;
      const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (ymd) {
        dates.push(`${ymd[1]}-${ymd[2]}-${ymd[3]}`);
        return;
      }
      const dmy = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
      if (dmy) {
        dates.push(`${dmy[3]}-${dmy[2]}-${dmy[1]}`);
        return;
      }
      const parsed = new Date(str.replace(' ', 'T'));
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${day}`);
      }
    };

    parseCandidate(d.invoice_date);
    parseCandidate(d.doc_date);
    parseCandidate(d.created_at);

    return dates;
  };

  const matchesTimeFilter = (d: DbInvoice): boolean => {
    if (timeFilter === 'all') return true;
    const docDates = getDocumentDates(d);
    if (docDates.length === 0) return true;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (timeFilter === 'today') {
      return docDates.some(dt => dt === todayStr);
    }

    if (timeFilter === 'this_week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekAgoStr = `${weekAgo.getFullYear()}-${pad(weekAgo.getMonth() + 1)}-${pad(weekAgo.getDate())}`;
      return docDates.some(dt => dt >= weekAgoStr && dt <= todayStr);
    }

    if (timeFilter === 'this_month') {
      const monthStartStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      return docDates.some(dt => dt >= monthStartStr);
    }

    if (timeFilter === 'custom') {
      if (customStartDate && customEndDate) {
        return docDates.some(dt => dt >= customStartDate && dt <= customEndDate);
      } else if (customStartDate) {
        return docDates.some(dt => dt >= customStartDate);
      } else if (customEndDate) {
        return docDates.some(dt => dt <= customEndDate);
      }
      return true;
    }

    return true;
  };

  const isAssignedToUser = (doc: DbInvoice): boolean => {
    if (doc.is_current_approver) return true;
    if (!currentUserUsername && !currentUserEmail && !currentUserRole) return false;
    const uHandle = (currentUserUsername || '').toLowerCase().trim();
    const eHandle = (currentUserEmail || '').toLowerCase().trim();
    const rHandle = (currentUserRole || '').toLowerCase().trim();
    const approverStr = (doc.assigned_approver || '').toLowerCase();
    const pool = approverStr.split(',').map(s => s.trim());

    // Role mapping for common designations
    const roleAliases: Record<string, string[]> = {
      admin: ["admin", "administrator", "system administrator", "superadmin", "system_admin"],
      manager: ["manager", "operations manager", "operations_manager"],
      gm: ["gm", "general manager", "general_manager"],
      jmd: ["jmd", "joint managing director", "joint_managing_director"],
      md: ["md", "managing director", "managing_director"],
      finance_auditor: ["finance auditor", "auditor", "internal auditor", "finance & internal auditor", "finance and internal auditor"],
      employee: ["employee", "standard employee", "standard_employee"]
    };
    const activeAliases = roleAliases[rHandle] || [rHandle];

    if (uHandle && (pool.includes(uHandle) || pool.some(p => p.includes(uHandle) || uHandle.includes(p)))) return true;
    if (eHandle && (pool.includes(eHandle) || pool.some(p => p.includes(eHandle)))) return true;
    if (rHandle && pool.some(p => activeAliases.includes(p) || activeAliases.some(a => p.includes(a) || a.includes(p)))) return true;
    return false;
  };

  // Terminal / Approved check: Work Tracker must NEVER display approved or terminal documents
  const isTerminalOrApproved = (doc: DbInvoice) => {
    const st = (doc.status || "").toLowerCase().trim();
    const cs = (String(doc.current_stage || "")).toLowerCase().trim();
    return (
      st === "approved" ||
      st.includes("approved") ||
      st.includes("settled") ||
      st.includes("paid") ||
      st.includes("ready for payment") ||
      st.includes("cancelled") ||
      st.includes("failed") ||
      cs.includes("approved")
    );
  };

  const isActionableForUser = (doc: DbInvoice): boolean => {
    // When loaded from authoritative backend API, server has already filtered to authorized documents
    if (hasLoadedApi) return true;
    return Boolean(doc.is_current_approver) || isAssignedToUser(doc) || Boolean(doc.has_approved);
  };

  const sourceDocs = hasLoadedApi ? trackerDocs : documents;

  // Work Tracker strictly scopes documents: only active, in-progress documents (non-terminal)
  const visibleDocs = useMemo(() => {
    const activeDocs = sourceDocs.filter(doc => !isTerminalOrApproved(doc));
    const isAdmin = currentUserRole === "admin" || currentUserRole === "system_admin" || currentUserRole === "superadmin";
    if (isAdmin) return activeDocs;
    if (hasLoadedApi) return activeDocs;

    return activeDocs.filter(doc => {
      // Visible in Work Tracker if user is the current approver or has approved a prior stage (tracking progress)
      return isActionableForUser(doc);
    });
  }, [sourceDocs, currentUserRole, currentUserUsername, currentUserEmail, hasLoadedApi]);

  // Derive dynamic document types (includes 'ALL' for cross-category views)
  const dynamicTypes = useMemo(() => {
    const types = Array.from(new Set(visibleDocs.map(d => (d.document_type || "").toUpperCase().trim()).filter(Boolean)));
    return ["ALL", ...(types.length > 0 ? types : ["AP INVOICE", "GENERAL RECORDS"])];
  }, [visibleDocs]);

  const TABS = dynamicTypes;

  // Auto-select first tab if current activeTab is not present
  React.useEffect(() => {
    if (dynamicTypes.length > 0 && !dynamicTypes.includes(activeTab)) {
      setActiveTab(dynamicTypes[0]);
    }
  }, [dynamicTypes, activeTab]);

  // Sync initialStatusFilter if provided
  React.useEffect(() => {
    if (initialStatusFilter) {
      setStatusFilter(initialStatusFilter);
      setActiveTab("ALL");
    }
  }, [initialStatusFilter]);

  // Executive KPI summary calculations
  const _kpiStats = useMemo(() => {
    let totalGrossValue = 0;
    let pendingApprovalCount = 0;
    let pendingApprovalValue = 0;
    let readyForPaymentCount = 0;
    let readyForPaymentValue = 0;
    let highValueCount = 0;

    visibleDocs.forEach(doc => {
      const amt = Number(doc.amount || 0);
      totalGrossValue += amt;

      if (amt >= 100000) {
        highValueCount++;
      }

      if (doc.status === "Ready for Payment" || doc.status === "Approved") {
        readyForPaymentCount++;
        readyForPaymentValue += amt;
      } else if (!["Paid", "Rejected", "Failed"].includes(doc.status)) {
        pendingApprovalCount++;
        pendingApprovalValue += amt;
      }
    });

    return {
      totalCount: visibleDocs.length,
      totalGrossValue,
      pendingApprovalCount,
      pendingApprovalValue,
      readyForPaymentCount,
      readyForPaymentValue,
      highValueCount
    };
  }, [visibleDocs]);

  // Filtered and sorted documents list
  const filteredAndSortedDocs = useMemo(() => {
    const list = visibleDocs.filter(doc => {
      // Document-wise Tab filter
      const docType = (doc.document_type || "").toUpperCase().trim();
      const selectedTab = activeTab.toUpperCase().trim();
      if (selectedTab !== "ALL" && docType !== selectedTab) {
        // Fallback matching for similar doc type labels
        const isAPInvoice = selectedTab.includes("INVOICE") && (docType.includes("INVOICE") || !docType);
        const isGeneral = selectedTab.includes("GENERAL") && (docType.includes("GENERAL") || docType.includes("VCC") || docType.includes("EXPENSE"));
        const isPO = selectedTab.includes("PURCHASE") && (docType.includes("PURCHASE") || docType === "PO");
        const isGRN = selectedTab.includes("GOODS") && (docType.includes("GOODS") || docType === "GRN");

        if (!isAPInvoice && !isGeneral && !isPO && !isGRN) {
          return false;
        }
      }

      // Status filter (strictly handles: pending, in_progress, hold, rejected)
      if (statusFilter !== "all" && statusFilter !== "approved" && statusFilter !== "cancelled") {
        const st = (doc.status || "").toLowerCase();
        const isActionRequired = (Boolean(doc.is_current_approver) || isAssignedToUser(doc)) && !doc.has_approved;
        const isInProgress = Boolean(doc.has_approved) || st.includes("in progress") || st.includes("stage") || !isActionRequired;

        if (statusFilter === "pending") {
          if (!isActionRequired) return false;
        } else if (statusFilter === "in_progress") {
          if (!isInProgress) return false;
        } else if (statusFilter === "hold") {
          if (!st.includes("hold") && !st.includes("pause") && !st.includes("wait") && !st.includes("clarif")) return false;
        } else if (statusFilter === "rejected") {
          if (!st.includes("reject") && !st.includes("fail") && !st.includes("void") && !st.includes("returned")) return false;
        }
      }

      // Time / Date filter
      if (!matchesTimeFilter(doc)) return false;

      // Search filter
      const search = searchTerm.toLowerCase().trim();
      if (!search) return true;

      const vendor = (doc.vendor_name || "").toLowerCase();
      const invNum = (doc.invoice_number || "").toLowerCase();
      const trackId = (doc.tracking_id || "").toLowerCase();
      const id = String(doc.id || "").toLowerCase();
      const po = (doc.po_number || "").toLowerCase();

      return vendor.includes(search) || invNum.includes(search) || trackId.includes(search) || id.includes(search) || po.includes(search);
    });

    // Sorting
    return list.sort((a, b) => {
      if (sortBy === "amount_desc") return (b.amount || 0) - (a.amount || 0);
      if (sortBy === "amount_asc") return (a.amount || 0) - (b.amount || 0);
      if (sortBy === "vendor") return (a.vendor_name || "").localeCompare(b.vendor_name || "");
      if (sortBy === "date_asc") {
        const da = getDocumentDates(a)[0] || "";
        const db = getDocumentDates(b)[0] || "";
        return da.localeCompare(db);
      }
      const da = getDocumentDates(a)[0] || "";
      const db = getDocumentDates(b)[0] || "";
      return db.localeCompare(da);
    });
  }, [visibleDocs, activeTab, statusFilter, searchTerm, sortBy, timeFilter, customStartDate, customEndDate]);

  return (
    <div className="space-y-2 animate-fadeIn pb-8 w-full max-w-[1680px] mx-auto px-2 sm:px-3 pt-0 text-slate-800">
      
      {/* 1. COMPACT COMMAND & FILTER TOOLBAR */}
      <div className="bg-white rounded-lg border border-slate-200 p-1.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-1.5">
        
        {/* Left: Category Navigation Tabs */}
        <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto custom-scrollbar">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition whitespace-nowrap cursor-pointer ${
                activeTab === t
                  ? 'bg-[#003F28] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Right: Search, Filter Dropdown, Sorting & Export */}
        <div className="flex items-center gap-1.5 w-full md:w-auto justify-end flex-wrap">
          
          {/* Real-time Search Input */}
          <div className="relative flex-1 sm:w-52 min-w-[150px]">
            <Search className="h-3 w-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vendor, doc #, PO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-6.5 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#003F28] transition"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[9px]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-1">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                localStorage.setItem("workTrackerStatusFilter", e.target.value);
              }}
              className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
            >
              <option value="all">All Active / In Progress</option>
              <option value="pending">Pending (Action Required)</option>
              <option value="in_progress">In Progress</option>
              <option value="hold">On Hold</option>
              <option value="rejected">Rejected</option>
            </select>

            {statusFilter !== "all" && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  localStorage.setItem("workTrackerStatusFilter", "all");
                }}
                className="flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition cursor-pointer"
                title="Clear status filter"
              >
                <span>{statusFilter.toUpperCase()}</span>
                <span>✕</span>
              </button>
            )}
          </div>

          {/* Time / Date Filter */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-1">
            <Calendar className="h-3 w-3 text-slate-500" />
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="bg-transparent text-[10px] font-medium text-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Inputs if custom range is active */}
          {timeFilter === 'custom' && (
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                <span className="text-[9px] font-bold text-slate-400">From:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="text-[10px] bg-transparent text-slate-700 outline-none cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                <span className="text-[9px] font-bold text-slate-400">To:</span>
                <input
                  type="date"
                  value={customEndDate}
                  min={customStartDate || undefined}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="text-[10px] bg-transparent text-slate-700 outline-none cursor-pointer"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                  title="Clear custom dates"
                  className="p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-slate-100 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

        </div>

      </div>

      {/* 3. COMPACT ENTERPRISE INVOICE GRID */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1100px] table-fixed">
            
            {/* Enterprise Compact Table Header (8 Columns) */}
            <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-medium tracking-wider text-slate-500 uppercase">
               <tr>
                 <th className="py-1.5 px-2.5 w-10 text-center">#</th>
                 <th className="py-1.5 px-2.5 w-[15%]">Document ID</th>
                 <th className="py-1.5 px-2.5 w-[26%]">Supplier / Vendor</th>
                 <th className="py-1.5 px-2.5 w-[14%]">Document Type</th>
                 <th className="py-1.5 px-2.5 w-[15%] text-right">Amount (₹)</th>
                 <th className="py-1.5 px-2.5 w-[11%] text-center">Current Stage</th>
                 <th className="py-1.5 px-2.5 w-[10%] text-center">Status</th>
                 <th className="py-1.5 px-2.5 w-[9%] text-center">Action</th>
               </tr>
            </thead>

            {/* Enterprise Compact Table Body */}
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredAndSortedDocs.map((doc, idx) => {
                const vendorName = doc.vendor_name || "Enterprise Supplier";
                const grossAmount = Number(doc.amount || 0);
                const displayId = formatDocNumber(doc.id, doc.document_type, (doc as any).category);
                const docDate = doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "");
                const isSelected = selectedDocIds.includes(doc.id);

                // Helper for Stage Pill
                const renderStageBadge = () => {
                  const status = (doc.status || "Pending Approval").trim();
                  const stageNum = doc.current_stage || doc.activeApprovalLog?.current_stage_number || 1;

                  if (status === "Settled" || status === "Approved" || status === "Paid" || status === "Ready for Payment") {
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Approved
                      </span>
                    );
                  }
                  if (status === "On Hold") {
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        Stage {stageNum}
                      </span>
                    );
                  }
                  if (status === "Rejected" || status === "Failed") {
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                        Stage {stageNum}
                      </span>
                    );
                  }
                  
                  const isStage2 = stageNum === 2;
                  const badgeClass = isStage2
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200";

                  return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${badgeClass}`}>
                      Stage {stageNum}
                    </span>
                  );
                };

                // Helper for Status Pill
                const renderStatusBadge = () => {
                  const status = (doc.status || "Pending Approval").trim();
                  const isCompleted = ["Settled", "Approved", "Paid", "Ready for Payment"].includes(status);

                  if (isCompleted) {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>Approved</span>
                      </span>
                    );
                  }
                  if (status === "On Hold") {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                        <span>On Hold</span>
                      </span>
                    );
                  }
                  if (status === "Rejected" || status === "Failed" || status === "Cancelled") {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        <span>{status === "Cancelled" ? "Cancelled" : "Rejected"}</span>
                      </span>
                    );
                  }
                  
                  const isActionRequired = Boolean(doc.is_current_approver) || isAssignedToUser(doc);
                  const hasApprovedByUser = Boolean(doc.has_approved);

                  if (isActionRequired) {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        <span>Pending</span>
                      </span>
                    );
                  }

                  if (hasApprovedByUser) {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        <span>In Progress</span>
                      </span>
                    );
                  }

                  return (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-medium bg-slate-50 text-slate-700 border border-slate-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span>In Progress</span>
                    </span>
                  );
                };

                // Helper for Review / Action Eye Button (~17-18px icon)
                const renderActionButton = () => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDocument(doc.id);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-[#003F28] hover:bg-emerald-50/60 transition cursor-pointer inline-flex items-center justify-center mx-auto"
                    title="View Document Details"
                  >
                    <Eye className="h-[17.5px] w-[17.5px]" />
                  </button>
                );

                const docTypeLabel = doc.document_type || "AP Invoice";

                return (
                  <tr 
                    key={doc.id} 
                    onClick={() => onViewDocument(doc.id)}
                    className={`hover:bg-slate-50/70 transition-colors group cursor-pointer ${isSelected ? 'bg-indigo-50/40' : ''}`}
                  >
                    <td className="py-1.5 px-2.5 align-middle text-center w-10 text-[12px] text-slate-500">{idx + 1}</td>

                    {/* 2. Document ID */}
                    <td className="py-1.5 px-2.5 align-middle w-[15%] min-w-0">
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="text-[12px] font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors truncate" title={displayId}>
                          {displayId}
                        </span>
                        {docDate && (
                          <span className="text-[11px] text-slate-400 truncate mt-0.5">
                            {docDate}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Supplier / Vendor */}
                    <td className="py-1.5 px-2.5 align-middle w-[26%] min-w-0">
                      <span className="text-[12px] font-semibold text-slate-900 truncate block" title={vendorName}>
                        {vendorName}
                      </span>
                    </td>

                    {/* 4. Document Type */}
                    <td className="py-1.5 px-2.5 align-middle w-[14%] min-w-0">
                      <span className="text-[11px] text-slate-600 truncate block">
                        {docTypeLabel}
                      </span>
                    </td>

                    {/* 5. Amount (₹) */}
                    <td className="py-1.5 px-2.5 align-middle text-right w-[15%] whitespace-nowrap">
                      <span className="text-[12px] font-semibold text-slate-900">
                        ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* 6. Current Stage */}
                    <td className="py-1.5 px-2.5 align-middle text-center w-[11%]">
                      {renderStageBadge()}
                    </td>

                    {/* 7. Status */}
                    <td className="py-1.5 px-2.5 align-middle text-center w-[10%]">
                      {renderStatusBadge()}
                    </td>

                    {/* 8. Action */}
                    <td className="py-1.5 px-2.5 align-middle text-center w-[9%]">
                      {renderActionButton()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Empty State */}
          {filteredAndSortedDocs.length === 0 && (
            <div className="text-center py-16 bg-slate-50/50">
              <FileText className="h-10 w-10 mx-auto mb-2.5 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-800">No records match the filter</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Try resetting your search query or status filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setActiveTab(dynamicTypes[0] || "AP INVOICE");
                }}
                className="mt-3 px-3 py-1 bg-indigo-600 text-white font-bold text-[10px] rounded-lg shadow-2xs hover:bg-indigo-700 transition"
              >
                Reset Filters
              </button>
            </div>
          )}

        </div>

        {/* Table Footer Summary Bar */}
        <div className="bg-slate-50/90 border-t border-slate-200 px-4 py-2 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>
            {filteredAndSortedDocs.length === 0 ? (
              "No actionable documents"
            ) : filteredAndSortedDocs.length === 1 ? (
              <>Showing <strong className="text-slate-900 font-semibold">1</strong> of <strong className="text-slate-900 font-semibold">1</strong> actionable record</>
            ) : (
              <>Showing <strong className="text-slate-900 font-semibold">{filteredAndSortedDocs.length}</strong> actionable records</>
            )}
          </span>
          <div className="flex items-center gap-1.5 text-slate-500 text-[10.5px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>DocuFlow Active</span>
          </div>
        </div>

      </div>

    </div>
  );
}
