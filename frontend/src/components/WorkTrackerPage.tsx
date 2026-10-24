import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
  Search, 
  FileText, 
  X, 
  Eye,
  Filter,
  SlidersHorizontal,
  Receipt,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown
} from "lucide-react";
import matrixOptions from "../matrix_options.json";
import { DbInvoice } from "../types";
import { formatDocNumber, formatDocumentTypeDisplay, getCanonicalDocumentType, getDynamicTableHeaders, resolvePersonsInRoleForDivision } from "../utils/formatters";

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
  const [divisionFilter, setDivisionFilter] = useState<string>(() => {
    return localStorage.getItem("workTrackerDivisionFilter") || "ALL";
  });
  const [selectedDocIds, _setSelectedDocIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState(() => {
    const saved = initialStatusFilter || localStorage.getItem("workTrackerStatusFilter") || "all";
    return saved === "approved" || saved === "cancelled" ? "all" : saved;
  });
  const [sortColumn, setSortColumn] = useState<"id" | "vendor" | "type" | "amount" | "assigned" | "status">("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Comprehensive Filter Popover States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPopupRef = useRef<HTMLDivElement>(null);
  const [draftDivision, setDraftDivision] = useState(divisionFilter);
  const [draftDocType, setDraftDocType] = useState(activeTab);
  const [draftStatus, setDraftStatus] = useState(statusFilter);
  const [draftTime, setDraftTime] = useState(timeFilter);
  const [draftStartDate, setDraftStartDate] = useState(customStartDate);
  const [draftEndDate, setDraftEndDate] = useState(customEndDate);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFilterOpen]);

  const handleOpenFilter = () => {
    setDraftDivision(divisionFilter);
    setDraftDocType(activeTab);
    setDraftStatus(statusFilter);
    setDraftTime(timeFilter);
    setDraftStartDate(customStartDate);
    setDraftEndDate(customEndDate);
    setIsFilterOpen(true);
  };

  const handleApplyFilters = () => {
    setDivisionFilter(draftDivision);
    localStorage.setItem("workTrackerDivisionFilter", draftDivision);

    setActiveTab(draftDocType);

    setStatusFilter(draftStatus);
    localStorage.setItem("workTrackerStatusFilter", draftStatus);

    setTimeFilter(draftTime);
    setCustomStartDate(draftStartDate);
    setCustomEndDate(draftEndDate);
    setCurrentPage(1);

    setIsFilterOpen(false);
  };

  const handleClearFilters = () => {
    setDraftDivision("ALL");
    setDraftDocType("ALL");
    setDraftStatus("all");
    setDraftTime("all");
    setDraftStartDate("");
    setDraftEndDate("");

    setDivisionFilter("ALL");
    localStorage.setItem("workTrackerDivisionFilter", "ALL");

    setActiveTab("ALL");

    setStatusFilter("all");
    localStorage.setItem("workTrackerStatusFilter", "all");

    setTimeFilter("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setCurrentPage(1);

    setIsFilterOpen(false);
  };

  const handleSort = (col: "id" | "vendor" | "type" | "amount" | "assigned" | "status") => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection(col === "amount" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (divisionFilter !== "ALL") count++;
    if (activeTab !== "ALL") count++;
    if (statusFilter !== "all") count++;
    if (timeFilter !== "all") count++;
    return count;
  }, [divisionFilter, activeTab, statusFilter, timeFilter]);
  const [trackerDocs, setTrackerDocs] = useState<DbInvoice[]>([]);
  const [hasLoadedApi, setHasLoadedApi] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);

  React.useEffect(() => {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    fetch("/api/users", {
      headers: token ? { "Authorization": `Bearer ${token}` } : {}
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data)) setUsersList(data);
      })
      .catch(() => {});
  }, []);

  // Server-side fetching from dedicated /api/documents/work-tracker endpoint
  const fetchTrackerDocs = React.useCallback(async () => {
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("authToken");
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
      if (!val) return;
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
      manager: ["manager", "operations manager", "operations_manager", "finance_manager", "finance manager"],
      gm: ["gm", "general manager", "general_manager"],
      jmd: ["jmd", "joint managing director", "joint_managing_director"],
      md: ["md", "managing director", "managing_director"],
      finance_auditor: ["finance auditor", "auditor", "internal auditor", "finance & internal auditor", "finance and internal auditor"],
      ap_executive: ["ap_executive", "ap executive", "ap_specialist", "ap specialist", "accounts_approver", "accounts approver", "ap", "accounts"],
      accounts_approver: ["accounts_approver", "accounts approver", "ap_executive", "ap executive", "ap_specialist", "ap specialist", "ap", "accounts"],
      ap_specialist: ["ap_specialist", "ap specialist", "ap_executive", "ap executive", "accounts_approver", "accounts approver", "ap", "accounts"],
      finance_manager: ["finance_manager", "finance manager", "manager", "operations_manager"],
      employee: ["employee", "standard employee", "standard_employee"]
    };
    const activeAliases = roleAliases[rHandle] || [rHandle];

    if (uHandle && pool.some(p => p && (p.includes(uHandle) || uHandle.includes(p)))) return true;
    if (eHandle && pool.some(p => p && p.includes(eHandle))) return true;
    if (rHandle && pool.some(p => p && activeAliases.some(a => a && (p.includes(a) || a.includes(p))))) return true;
    return false;
  };

  // Terminal / Approved check: Work Tracker must NEVER display approved or terminal documents
  const isTerminalOrApproved = (doc: DbInvoice) => {
    if (!doc) return true;
    const st = (doc.status || "").toLowerCase().trim();
    const cs = (String(doc.current_stage || "")).toLowerCase().trim();
    return (
      st === "approved" ||
      st.includes("approved") ||
      st.includes("settled") ||
      st.includes("paid") ||
      st.includes("ready for payment") ||
      st.includes("ready_for_payment") ||
      st.includes("cancelled") ||
      st.includes("failed") ||
      st.includes("rejected") ||
      st.includes("completed") ||
      cs.includes("approved")
    );
  };

  const isActionableForUser = (doc: DbInvoice): boolean => {
    // When loaded from authoritative backend API, server has already filtered to authorized documents
    if (hasLoadedApi) return true;
    return Boolean(doc.is_current_approver) || isAssignedToUser(doc) || Boolean(doc.has_approved);
  };

  const sourceDocs = hasLoadedApi ? trackerDocs : (trackerDocs.length > 0 ? trackerDocs : documents.filter(doc => Boolean(doc.is_current_approver) || isAssignedToUser(doc) || Boolean(doc.has_approved)));

  const isCustomerFeedbackDoc = (d: any) => {
    if (!d) return false;
    const rawType = (d.document_type || d.subtype_of_complaint || d.type_of_complaint || d.category || "").toUpperCase();
    const docIdUpper = String(d.id || "").toUpperCase();
    const docNumUpper = String(d.document_number || d.invoice_number || "").toUpperCase();
    const wfProf = String(d.workflow_profile_id || d.workflow_profile || "").toUpperCase();
    return (
      rawType.includes("FEEDBACK") ||
      rawType.includes("COMPLAINT") ||
      docIdUpper.startsWith("CMP") ||
      docIdUpper.startsWith("CF") ||
      docNumUpper.startsWith("CMP") ||
      docNumUpper.startsWith("CF") ||
      Boolean(d.type_of_complaint) ||
      wfProf.includes("FEEDBACK")
    );
  };

  // Work Tracker strictly scopes documents: only active, in-progress documents (non-terminal)
  const visibleDocs = useMemo(() => {
    const activeDocs = sourceDocs.filter(doc => !isTerminalOrApproved(doc) && !isCustomerFeedbackDoc(doc));
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
    const types = Array.from(new Set(visibleDocs.map(d => getCanonicalDocumentType(d)).filter(Boolean)));
    return ["ALL", ...(types.length > 0 ? types : ["AP INVOICE", "GENERAL RECORDS"])];
  }, [visibleDocs]);

  const TABS = dynamicTypes;

  const matchesTab = (doc: DbInvoice, tab: string) => {
    if (tab === "ALL") return true;
    const docType = getCanonicalDocumentType(doc);
    const selectedTab = tab.toUpperCase().trim();
    if (docType === selectedTab) return true;
    const isAPInvoice = selectedTab.includes("INVOICE") && (docType.includes("INVOICE") || !docType);
    const isGeneral = selectedTab.includes("GENERAL") && (docType.includes("GENERAL") || docType.includes("VCC") || docType.includes("EXPENSE"));
    const isPO = selectedTab.includes("PURCHASE") && (docType.includes("PURCHASE") || docType === "PO");
    const isGRN = selectedTab.includes("GOODS") && (docType.includes("GOODS") || docType === "GRN");
    const isCreditNote = selectedTab.includes("CREDIT") && (docType.includes("CREDIT") || docType.startsWith("CN"));
    const isDebitNote = selectedTab.includes("DEBIT") && (docType.includes("DEBIT") || docType.startsWith("DN"));
    return isAPInvoice || isGeneral || isPO || isGRN || isCreditNote || isDebitNote;
  };

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dynamicTypes.forEach(t => {
      counts[t] = visibleDocs.filter(d => matchesTab(d, t)).length;
    });
    return counts;
  }, [dynamicTypes, visibleDocs]);

  // Dynamic available divisions list based on documents & system master
  const availableDivisions = useMemo(() => {
    const set = new Set<string>();
    visibleDocs.forEach((d) => {
      const div = d.division || (d as any).branch || (d as any).plant;
      if (div && typeof div === "string" && div.trim()) {
        set.add(div.trim().toUpperCase());
      }
    });
    if (matrixOptions && Array.isArray((matrixOptions as any).divisions)) {
      (matrixOptions as any).divisions.forEach((div: string) => {
        if (div && typeof div === "string" && div.trim()) {
          set.add(div.trim().toUpperCase());
        }
      });
    }
    return Array.from(set).sort();
  }, [visibleDocs]);

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
      if (!matchesTab(doc, activeTab)) return false;

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

      // Division / Branch filter
      if (divisionFilter !== "ALL") {
        const docDiv = (doc.division || (doc as any).branch || (doc as any).plant || "").toUpperCase().trim();
        const selectedDiv = divisionFilter.toUpperCase().trim();
        if (docDiv !== selectedDiv) {
          return false;
        }
      }

      // Time / Date filter
      if (!matchesTimeFilter(doc)) return false;

      // Comprehensive Search filter across all visible document fields
      const search = searchTerm.toLowerCase().trim();
      if (!search) return true;

      const vendor = (doc.vendor_name || "").toLowerCase();
      const invNum = (doc.invoice_number || "").toLowerCase();
      const trackId = (doc.tracking_id || "").toLowerCase();
      const id = String(doc.id || "").toLowerCase();
      const po = (doc.po_number || "").toLowerCase();
      const cat = (doc.category || "").toLowerCase();
      const cc = (doc.cost_center || "").toLowerCase();
      const plant = (doc.plant || doc.branch || "").toLowerCase();
      const div = (doc.division || "").toLowerCase();
      const dt = (doc.document_type || "").toLowerCase();
      const appr = (doc.assigned_approver || "").toLowerCase();
      const amt = String(doc.amount || "");

      return (
        vendor.includes(search) ||
        invNum.includes(search) ||
        trackId.includes(search) ||
        id.includes(search) ||
        po.includes(search) ||
        cat.includes(search) ||
        cc.includes(search) ||
        plant.includes(search) ||
        div.includes(search) ||
        dt.includes(search) ||
        appr.includes(search) ||
        amt.includes(search)
      );
    });

    // Sorting
    return list.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === "id") {
        const idA = formatDocNumber(a.id, getCanonicalDocumentType(a), (a as any).category).toLowerCase();
        const idB = formatDocNumber(b.id, getCanonicalDocumentType(b), (b as any).category).toLowerCase();
        comparison = idA.localeCompare(idB);
      } else if (sortColumn === "vendor") {
        const vA = (a.vendor_name || (a as any).customer_name || (a as any).party_name || "").toLowerCase();
        const vB = (b.vendor_name || (b as any).customer_name || (b as any).party_name || "").toLowerCase();
        comparison = vA.localeCompare(vB);
      } else if (sortColumn === "type") {
        const tA = formatDocumentTypeDisplay(a).toLowerCase();
        const tB = formatDocumentTypeDisplay(b).toLowerCase();
        comparison = tA.localeCompare(tB);
      } else if (sortColumn === "amount") {
        comparison = (Number(a.amount) || 0) - (Number(b.amount) || 0);
      } else if (sortColumn === "assigned") {
        const rA = resolvePersonsInRoleForDivision(a.assigned_approver || (a as any).assigned_to, a.division || (a as any).branch, usersList).displayName.toLowerCase();
        const rB = resolvePersonsInRoleForDivision(b.assigned_approver || (b as any).assigned_to, b.division || (b as any).branch, usersList).displayName.toLowerCase();
        comparison = rA.localeCompare(rB);
      } else if (sortColumn === "status") {
        const sA = (a.status || "").toLowerCase();
        const sB = (b.status || "").toLowerCase();
        comparison = sA.localeCompare(sB);
      } else {
        const da = getDocumentDates(a)[0] || "";
        const db = getDocumentDates(b)[0] || "";
        comparison = da.localeCompare(db);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [visibleDocs, activeTab, statusFilter, divisionFilter, searchTerm, sortColumn, sortDirection, timeFilter, customStartDate, customEndDate, usersList]);

  // Dynamic Table Headers based on selected document type tab or visible records
  const effectiveDocType = useMemo(() => {
    if (activeTab && activeTab !== "ALL") {
      return activeTab;
    }
    const typesInView = Array.from(new Set(filteredAndSortedDocs.map(d => getCanonicalDocumentType(d)).filter(Boolean)));
    if (typesInView.length === 1) {
      return typesInView[0];
    }
    return "ALL";
  }, [activeTab, filteredAndSortedDocs]);

  const tableHeaders = useMemo(() => getDynamicTableHeaders(effectiveDocType), [effectiveDocType]);

  // Total amount of currently filtered and sorted records
  const totalAmount = useMemo(() => {
    return filteredAndSortedDocs.reduce((acc, doc) => acc + (Number(doc.amount) || 0), 0);
  }, [filteredAndSortedDocs]);

  // Pagination calculations
  const totalItems = filteredAndSortedDocs.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedDocs.slice(start, start + pageSize);
  }, [filteredAndSortedDocs, currentPage, pageSize]);

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
  };

  return (
    <div className="space-y-3 animate-fadeIn pb-8 w-full max-w-[1680px] mx-auto px-2 sm:px-3 pt-0 text-slate-800">
      
      {/* 1. TOP BAR / DOCUMENT TYPE NAVIGATION */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
        
        {/* Left: Category Navigation Tabs & Total Amount */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto custom-scrollbar">
          {TABS.map((t) => {
            const count = tabCounts[t] ?? 0;
            const isActive = activeTab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setActiveTab(t);
                  setCurrentPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-[#003F28] text-white font-bold shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 font-semibold hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span>{t}</span>
                <span className={`text-[11px] ${isActive ? "text-emerald-200 font-medium" : "text-slate-400 font-normal"}`}>
                  ({count})
                </span>
              </button>
            );
          })}

          {/* Total Amount Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-semibold whitespace-nowrap shadow-2xs ml-1">
            <Receipt className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>Total Amount:</span>
            <span className="font-mono font-bold text-emerald-950">
              ₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Right: Search Input & Filters Button */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          {/* Search Box */}
          <div className="relative w-full sm:w-64 min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search document ID, supplier, PO..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28]/20 transition"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Comprehensive Filter Popover Button */}
          <div className="relative" ref={filterPopupRef}>
            <button
              type="button"
              onClick={handleOpenFilter}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer shadow-2xs ${
                isFilterOpen || activeFilterCount > 0
                  ? "bg-emerald-50 border-emerald-300 text-[#003F28]"
                  : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
              }`}
              title="Filter by Division, Document Type, Status, and Date"
            >
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span>Filters</span>
              <ChevronDown className="h-3 w-3 text-slate-400" />
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#003F28] text-white text-[9px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* POPUP FILTER PANEL */}
            {isFilterOpen && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-xl p-3.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#003F28]" />
                    <h3 className="text-xs font-bold text-slate-800">Filter Documents</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                <div className="space-y-2.5 text-left">
                  {/* 1. DIVISION / BRANCH */}
                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Division / Branch
                    </label>
                    <div className="relative">
                      <select
                        value={draftDivision}
                        onChange={(e) => setDraftDivision(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                      >
                        <option value="ALL">All Divisions / Branches</option>
                        {availableDivisions.map((div) => (
                          <option key={div} value={div}>
                            {div}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 2. DOCUMENT TYPE */}
                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Document Type
                    </label>
                    <select
                      value={draftDocType}
                      onChange={(e) => setDraftDocType(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                    >
                      <option value="ALL">All Document Types</option>
                      {dynamicTypes.filter((t) => t !== "ALL").map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 3. WORKFLOW STATUS */}
                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Workflow Status
                    </label>
                    <select
                      value={draftStatus}
                      onChange={(e) => setDraftStatus(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                    >
                      <option value="all">All Active / In Progress</option>
                      <option value="pending">Pending (Action Required)</option>
                      <option value="in_progress">In Progress</option>
                      <option value="hold">On Hold</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>

                  {/* 4. DATE RANGE */}
                  <div>
                    <label className="block text-[9.5px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Time / Date
                    </label>
                    <select
                      value={draftTime}
                      onChange={(e) => setDraftTime(e.target.value as any)}
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="this_week">This Week</option>
                      <option value="this_month">This Month</option>
                      <option value="custom">Custom Range</option>
                    </select>

                    {draftTime === "custom" && (
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                        <div>
                          <span className="block text-[8.5px] font-bold text-slate-400 uppercase mb-0.5">From</span>
                          <input
                            type="date"
                            value={draftStartDate}
                            onChange={(e) => setDraftStartDate(e.target.value)}
                            className="w-full text-[9.5px] px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-slate-700 outline-none"
                          />
                        </div>
                        <div>
                          <span className="block text-[8.5px] font-bold text-slate-400 uppercase mb-0.5">To</span>
                          <input
                            type="date"
                            value={draftEndDate}
                            min={draftStartDate || undefined}
                            onChange={(e) => setDraftEndDate(e.target.value)}
                            className="w-full text-[9.5px] px-1.5 py-1 bg-slate-50 border border-slate-200 rounded text-slate-700 outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* POPUP ACTION BUTTONS */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="px-2 py-0.5 text-[9.5px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                  >
                    Clear All
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFilters}
                    className="px-3 py-1 bg-[#003F28] hover:bg-[#002F1E] text-white text-[10px] font-bold rounded transition shadow-2xs cursor-pointer"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ACTIVE FILTER PILLS */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap px-1">
          {divisionFilter !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
              <span>Div: {divisionFilter}</span>
              <button
                type="button"
                onClick={() => {
                  setDivisionFilter("ALL");
                  localStorage.setItem("workTrackerDivisionFilter", "ALL");
                  setCurrentPage(1);
                }}
                className="hover:text-emerald-950 cursor-pointer ml-0.5"
              >
                ✕
              </button>
            </span>
          )}
          {activeTab !== "ALL" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">
              <span>Type: {activeTab}</span>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("ALL");
                  setCurrentPage(1);
                }}
                className="hover:text-blue-950 cursor-pointer ml-0.5"
              >
                ✕
              </button>
            </span>
          )}
          {statusFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
              <span>Status: {statusFilter.toUpperCase()}</span>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("all");
                  localStorage.setItem("workTrackerStatusFilter", "all");
                  setCurrentPage(1);
                }}
                className="hover:text-amber-950 cursor-pointer ml-0.5"
              >
                ✕
              </button>
            </span>
          )}
          {timeFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 text-[10px] font-bold">
              <span>Date: {timeFilter.toUpperCase()}</span>
              <button
                type="button"
                onClick={() => {
                  setTimeFilter("all");
                  setCurrentPage(1);
                }}
                className="hover:text-purple-950 cursor-pointer ml-0.5"
              >
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      {/* 2. TABLE GRID */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1100px] table-fixed">
            
            {/* Table Header (8 Columns) */}
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold tracking-wider uppercase">
              <tr>
                <th className="py-2.5 px-3 w-12 text-center text-slate-500 font-semibold">#</th>
                <th 
                  onClick={() => handleSort("id")}
                  className="py-2.5 px-3 w-[16%] cursor-pointer select-none hover:text-slate-900 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{tableHeaders.docIdLabel || "DOCUMENT ID"}</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("vendor")}
                  className="py-2.5 px-3 w-[26%] cursor-pointer select-none hover:text-slate-900 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{tableHeaders.partyLabel || "SUPPLIER / VENDOR"}</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("type")}
                  className="py-2.5 px-3 w-[15%] cursor-pointer select-none hover:text-slate-900 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>{tableHeaders.docTypeLabel || "DOCUMENT TYPE"}</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("amount")}
                  className="py-2.5 px-3 w-[14%] text-right cursor-pointer select-none hover:text-slate-900 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>{tableHeaders.amountLabel || "AMOUNT (₹)"}</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("assigned")}
                  className="py-2.5 px-3 w-[12%] text-center cursor-pointer select-none hover:text-slate-900 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{tableHeaders.assignedLabel || "ASSIGNED TO"}</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("status")}
                  className="py-2.5 px-3 w-[10%] text-center cursor-pointer select-none hover:text-slate-900 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{tableHeaders.statusLabel || "STATUS"}</span>
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </div>
                </th>
                <th className="py-2.5 px-3 w-20 text-center">ACTION</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 text-slate-800 bg-white">
              {paginatedDocs.map((doc, idx) => {
                const docCanonicalType = getCanonicalDocumentType(doc);
                const isDocCredit = docCanonicalType.includes("CREDIT") || String(doc.id).toUpperCase().startsWith("CN-");
                const vendorName = doc.vendor_name || (doc as any).customer_name || (doc as any).party_name || (doc as any).account_name || (doc as any).dealer_name || (doc as any).client_name || (isDocCredit ? "Enterprise Customer" : "Enterprise Supplier");
                const grossAmount = Number(doc.amount || 0);
                const displayId = formatDocNumber(doc.id, getCanonicalDocumentType(doc), (doc as any).category);
                const docDate = doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "");
                const rowNumber = (currentPage - 1) * pageSize + idx + 1;

                // Assigned To resolution
                const resolved = resolvePersonsInRoleForDivision(
                  doc.assigned_approver || (doc as any).assigned_user || (doc as any).assigned_to,
                  doc.division || (doc as any).branch,
                  usersList
                );
                const isUnassigned = resolved.isUnassigned || resolved.displayName === "Unassigned";

                // Status calculation
                const isActionRequired = Boolean(doc.is_current_approver) || isAssignedToUser(doc);

                return (
                  <tr 
                    key={doc.id} 
                    onClick={() => onViewDocument(doc.id)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                  >
                    {/* # */}
                    <td className="py-2.5 px-3 align-middle text-center text-xs text-slate-500 font-medium">
                      {rowNumber}
                    </td>

                    {/* DOCUMENT ID */}
                    <td className="py-2.5 px-3 align-middle">
                      <div className="flex flex-col min-w-0 leading-tight">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-[#003F28] transition-colors truncate" title={displayId}>
                          {displayId}
                        </span>
                        {docDate && (
                          <span className="text-[11px] text-slate-400 truncate mt-0.5">
                            {docDate}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* SUPPLIER / VENDOR */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="text-xs font-bold text-slate-900 truncate block" title={vendorName}>
                        {vendorName}
                      </span>
                    </td>

                    {/* DOCUMENT TYPE */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="text-xs text-slate-600 font-medium truncate block">
                        {formatDocumentTypeDisplay(doc)}
                      </span>
                    </td>

                    {/* AMOUNT (₹) */}
                    <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-900">
                        ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* ASSIGNED TO */}
                    <td className="py-2.5 px-3 align-middle text-center">
                      <span 
                        className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-xs font-medium max-w-full truncate ${
                          isUnassigned 
                            ? "bg-slate-100 text-slate-500 border border-slate-200" 
                            : "bg-blue-50 text-blue-700 border border-blue-100"
                        }`}
                        title={resolved.tooltipText}
                      >
                        <span className="truncate">{resolved.displayName}</span>
                      </span>
                    </td>

                    {/* STATUS */}
                    <td className="py-2.5 px-3 align-middle text-center">
                      {isActionRequired ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          <span>Pending</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <span>In Progress</span>
                        </span>
                      )}
                    </td>

                    {/* ACTION */}
                    <td className="py-2.5 px-3 align-middle text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDocument(doc.id);
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors inline-flex items-center justify-center shadow-2xs cursor-pointer"
                        title="View Document"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
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
              <p className="text-xs text-slate-500 font-medium mt-1">Try resetting your search query or status filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setDivisionFilter("ALL");
                  setActiveTab(dynamicTypes[0] || "AP INVOICE");
                  setCurrentPage(1);
                }}
                className="mt-3 px-3.5 py-1.5 bg-[#003F28] text-white font-bold text-xs rounded-lg shadow-xs hover:bg-[#002F1E] transition cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}

        </div>
      </div>

      {/* 3. BOTTOM PAGINATION BAR */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 shadow-2xs">
        {/* Left: Showing entries */}
        <div>
          {totalItems === 0 ? (
            <span>Showing 0 of 0 documents</span>
          ) : (
            <span>
              Showing <strong className="text-slate-900 font-bold">{(currentPage - 1) * pageSize + 1}</strong> –{" "}
              <strong className="text-slate-900 font-bold">{Math.min(currentPage * pageSize, totalItems)}</strong> of{" "}
              <strong className="text-slate-900 font-bold">{totalItems}</strong> documents
            </span>
          )}
        </div>

        {/* Right: Page Buttons & Rows per page */}
        <div className="flex items-center gap-4">
          {/* Page numbers */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              title="Previous Page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            {/* Smart page numbers */}
            {getPageNumbers().map((item, i) => {
              if (item === "...") {
                return (
                  <span key={`ellipsis-${i}`} className="px-2 py-1 text-slate-400 select-none">
                    ...
                  </span>
                );
              }
              const pageNum = item as number;
              const isCurrent = pageNum === currentPage;
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isCurrent
                      ? "bg-[#003F28] text-white font-bold shadow-2xs"
                      : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition"
              title="Next Page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Rows Per Page Dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
            <span>Rows per page</span>
            <div className="relative">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="appearance-none bg-white border border-slate-200 rounded-lg pl-2.5 pr-6 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
