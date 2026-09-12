import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { 
  CheckCircle2, 
  Search, 
  Calendar, 
  Download, 
  Eye, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  UserCheck, 
  X,
  Filter,
  ArrowUpDown,
  SlidersHorizontal,
  Loader2
} from "lucide-react";
import { DbInvoice } from "../types";

interface ApprovedDocumentsPageProps {
  documents: DbInvoice[];
  onViewDocument: (docId: string | number) => void;
  currentUserRole?: string;
  currentUserEmail?: string;
  currentUserUsername?: string;
  onRefreshDocs?: () => void;
}

const MONTH_NAMES = [
  { value: "all", label: "All Months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export default function ApprovedDocumentsPage({
  documents,
  onViewDocument,
  currentUserRole: _currentUserRole = "employee",
  currentUserEmail: _currentUserEmail = "",
  currentUserUsername: _currentUserUsername = "",
  onRefreshDocs
}: ApprovedDocumentsPageProps) {
  // 1. Toolbar state: Search & Sort
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "vendor" | "name">("date_desc");

  // 2. Filter Popup open/close state & ref for click outside
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPopupRef = useRef<HTMLDivElement>(null);

  // 3. Applied Filters (Actively filtering data)
  const [appliedYear, setAppliedYear] = useState<string>("all");
  const [appliedMonth, setAppliedMonth] = useState<string>("all");
  const [appliedDateMode, setAppliedDateMode] = useState<"specific" | "range">("specific");
  const [appliedDate, setAppliedDate] = useState<string>("");
  const [appliedFromDate, setAppliedFromDate] = useState<string>("");
  const [appliedToDate, setAppliedToDate] = useState<string>("");
  const [appliedDocType, setAppliedDocType] = useState<string>("all");

  // 4. Draft Filters (Inside popup before user clicks "Apply Filters")
  const [draftYear, setDraftYear] = useState<string>("all");
  const [draftMonth, setDraftMonth] = useState<string>("all");
  const [draftDateMode, setDraftDateMode] = useState<"specific" | "range">("specific");
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftFromDate, setDraftFromDate] = useState<string>("");
  const [draftToDate, setDraftToDate] = useState<string>("");
  const [draftDocType, setDraftDocType] = useState<string>("all");

  // 5. Server Data & Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [serverDocs, setServerDocs] = useState<DbInvoice[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isUsingServerData, setIsUsingServerData] = useState<boolean>(true);

  // Debounce search term by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Sync draft filters when popup opens
  const handleOpenFilter = () => {
    if (!isFilterOpen) {
      setDraftYear(appliedYear);
      setDraftMonth(appliedMonth);
      setDraftDateMode(appliedDateMode);
      setDraftDate(appliedDate);
      setDraftFromDate(appliedFromDate);
      setDraftToDate(appliedToDate);
      setDraftDocType(appliedDocType);
    }
    setIsFilterOpen(!isFilterOpen);
  };

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(event.target as Node)) {
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

  // Date helpers
  const getDocDate = (doc: DbInvoice): Date | null => {
    const dateVal = doc.invoice_date || doc.created_at;
    if (!dateVal) return null;
    if (typeof dateVal === "string") {
      const match = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
      }
    }
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  const parseDateInput = (val: string): Date | null => {
    if (!val) return null;
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatDateForInput = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const applyDraftDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setDraftFromDate(formatDateForInput(start));
    setDraftToDate(formatDateForInput(end));
  };

  const applyDraftThisMonthPreset = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setDraftFromDate(formatDateForInput(start));
    setDraftToDate(formatDateForInput(now));
  };

  // Base list helper for in-memory fallback
  const isApproved = (doc: DbInvoice): boolean => {
    const s = (doc.status || "").toLowerCase().trim();
    return s.includes("approved") || s.includes("settled") || s.includes("paid") || s.includes("ready for payment");
  };

  const localApprovedDocs = useMemo(() => {
    return documents.filter(isApproved);
  }, [documents]);

  // Available Years dynamically extracted
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 4; y--) {
      years.add(String(y));
    }
    localApprovedDocs.forEach(d => {
      const dt = getDocDate(d);
      if (dt) years.add(String(dt.getFullYear()));
    });
    return Array.from(years).sort().reverse();
  }, [localApprovedDocs]);

  // Available Document Types dynamically extracted
  const availableDocTypes = useMemo(() => {
    const standardTypes = ["AP INVOICE", "PURCHASE ORDER", "SERVICE & MAINTENANCE", "AGREEMENT", "CONTRACT", "OTHER"];
    const set = new Set<string>(standardTypes);
    localApprovedDocs.forEach(d => {
      const t = (d.document_type || "").toUpperCase().trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [localApprovedDocs]);

  // 6. Server-side API fetching
  const fetchApprovedDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem("authToken") || localStorage.getItem("token");
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("page_size", String(pageSize));
      params.set("sort_by", sortBy);

      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      if (appliedYear !== "all") {
        params.set("year", appliedYear);
      }
      if (appliedMonth !== "all") {
        params.set("month", appliedMonth);
      }
      if (appliedDateMode === "specific" && appliedDate) {
        params.set("date", appliedDate);
      } else if (appliedDateMode === "range") {
        if (appliedFromDate) params.set("from_date", appliedFromDate);
        if (appliedToDate) params.set("to_date", appliedToDate);
      }
      if (appliedDocType !== "all") {
        params.set("doc_type", appliedDocType);
      }

      const res = await fetch(`/api/documents/approved?${params.toString()}`, {
        headers: {
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        const data = await res.json();
        const totalHeader = res.headers.get("X-Total-Count");
        const total = totalHeader !== null ? parseInt(totalHeader, 10) : (Array.isArray(data) ? data.length : 0);
        setServerDocs(data);
        setServerTotalCount(isNaN(total) ? data.length : total);
        setIsUsingServerData(true);
      } else {
        console.warn("Server-side approved fetch failed, using local fallback");
        setIsUsingServerData(false);
      }
    } catch (err) {
      console.warn("Failed to fetch approved documents from API:", err);
      setIsUsingServerData(false);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, sortBy, debouncedSearch, appliedYear, appliedMonth, appliedDateMode, appliedDate, appliedFromDate, appliedToDate, appliedDocType]);

  // Trigger server fetch on dependency change
  useEffect(() => {
    fetchApprovedDocuments();
  }, [fetchApprovedDocuments]);

  // Reset pagination on filter or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, appliedYear, appliedMonth, appliedDateMode, appliedDate, appliedFromDate, appliedToDate, appliedDocType, sortBy, pageSize]);

  // 7. Fallback in-memory filtering for offline / standalone mode
  const fallbackFilteredDocs = useMemo(() => {
    const list = localApprovedDocs.filter(doc => {
      const dt = getDocDate(doc);

      // Year & Month Filter
      if (appliedYear !== "all") {
        if (!dt || String(dt.getFullYear()) !== appliedYear) return false;
      }
      if (appliedMonth !== "all") {
        if (!dt || String(dt.getMonth() + 1) !== appliedMonth) return false;
      }

      // Date Filter
      if (appliedDateMode === "specific" && appliedDate) {
        if (!dt || formatDateForInput(dt) !== appliedDate) return false;
      } else if (appliedDateMode === "range") {
        if (appliedFromDate) {
          const from = parseDateInput(appliedFromDate);
          if (from) {
            from.setHours(0, 0, 0, 0);
            if (!dt || dt.getTime() < from.getTime()) return false;
          }
        }
        if (appliedToDate) {
          const to = parseDateInput(appliedToDate);
          if (to) {
            to.setHours(23, 59, 59, 999);
            if (!dt || dt.getTime() > to.getTime()) return false;
          }
        }
      }

      // Document Type Filter
      if (appliedDocType !== "all") {
        const docType = (doc.document_type || "").toUpperCase().trim();
        if (docType !== appliedDocType.toUpperCase().trim()) return false;
      }

      // Search Filter
      const search = debouncedSearch.toLowerCase().trim();
      if (search) {
        const vendor = (doc.vendor_name || "").toLowerCase();
        const invNum = (doc.invoice_number || "").toLowerCase();
        const trackId = (doc.tracking_id || "").toLowerCase();
        const id = String(doc.id || "").toLowerCase();
        const po = (doc.po_number || "").toLowerCase();
        const approver = (doc.assigned_approver || "").toLowerCase();
        const div = (doc.division || "").toLowerCase();
        const type = (doc.document_type || "").toLowerCase();

        const matches = (
          vendor.includes(search) ||
          invNum.includes(search) ||
          trackId.includes(search) ||
          id.includes(search) ||
          po.includes(search) ||
          approver.includes(search) ||
          div.includes(search) ||
          type.includes(search)
        );
        if (!matches) return false;
      }

      return true;
    });

    // Sort
    list.sort((a, b) => {
      if (sortBy === "date_desc") {
        const da = getDocDate(a)?.getTime() || 0;
        const db = getDocDate(b)?.getTime() || 0;
        return db - da;
      }
      if (sortBy === "date_asc") {
        const da = getDocDate(a)?.getTime() || 0;
        const db = getDocDate(b)?.getTime() || 0;
        return da - db;
      }
      if (sortBy === "amount_desc") {
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      }
      if (sortBy === "amount_asc") {
        return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      }
      if (sortBy === "vendor") {
        return (a.vendor_name || "").localeCompare(b.vendor_name || "");
      }
      if (sortBy === "name") {
        return (a.invoice_number || a.id).localeCompare(b.invoice_number || b.id);
      }
      return 0;
    });

    return list;
  }, [localApprovedDocs, appliedYear, appliedMonth, appliedDateMode, appliedDate, appliedFromDate, appliedToDate, appliedDocType, debouncedSearch, sortBy]);

  // Documents to render
  const displayedDocs = useMemo(() => {
    if (isUsingServerData) {
      return serverDocs;
    }
    const start = (currentPage - 1) * pageSize;
    return fallbackFilteredDocs.slice(start, start + pageSize);
  }, [isUsingServerData, serverDocs, fallbackFilteredDocs, currentPage, pageSize]);

  const totalRecordsCount = isUsingServerData ? serverTotalCount : fallbackFilteredDocs.length;
  const totalPages = Math.ceil(totalRecordsCount / pageSize) || 1;

  // Active filter count (strictly 4 filters: Year, Month, Date, Doc Type)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (appliedYear !== "all") count++;
    if (appliedMonth !== "all") count++;
    if (appliedDateMode === "specific" && appliedDate) count++;
    if (appliedDateMode === "range" && (appliedFromDate || appliedToDate)) count++;
    if (appliedDocType !== "all") count++;
    return count;
  }, [appliedYear, appliedMonth, appliedDateMode, appliedDate, appliedFromDate, appliedToDate, appliedDocType]);

  const hasAnyFilterOrSearch = activeFilterCount > 0 || Boolean(searchTerm);

  // Apply filters from Popup
  const handleApplyFilters = () => {
    setAppliedYear(draftYear);
    setAppliedMonth(draftMonth);
    setAppliedDateMode(draftDateMode);
    setAppliedDate(draftDate);
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
    setAppliedDocType(draftDocType);
    setCurrentPage(1);
    setIsFilterOpen(false);
  };

  // Clear all inside Popup
  const handleClearDraftFilters = () => {
    setDraftYear("all");
    setDraftMonth("all");
    setDraftDateMode("specific");
    setDraftDate("");
    setDraftFromDate("");
    setDraftToDate("");
    setDraftDocType("all");
  };

  // Clear all active filters everywhere
  const handleClearAllFilters = () => {
    setAppliedYear("all");
    setAppliedMonth("all");
    setAppliedDateMode("specific");
    setAppliedDate("");
    setAppliedFromDate("");
    setAppliedToDate("");
    setAppliedDocType("all");
    handleClearDraftFilters();
    setSearchTerm("");
    setDebouncedSearch("");
    setCurrentPage(1);
    setIsFilterOpen(false);
  };

  // Remove individual filter chip
  const handleRemoveFilter = (filterKey: "year" | "month" | "date" | "docType") => {
    if (filterKey === "year") {
      setAppliedYear("all");
      setDraftYear("all");
    } else if (filterKey === "month") {
      setAppliedMonth("all");
      setDraftMonth("all");
    } else if (filterKey === "date") {
      setAppliedDate("");
      setAppliedFromDate("");
      setAppliedToDate("");
      setDraftDate("");
      setDraftFromDate("");
      setDraftToDate("");
    } else if (filterKey === "docType") {
      setAppliedDocType("all");
      setDraftDocType("all");
    }
    setCurrentPage(1);
  };

  // Currency Formatter
  const formatCurrency = (amount: number | string) => {
    const num = Number(amount || 0);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(num);
  };

  // CSV Export
  const handleExportCSV = async () => {
    let exportList: DbInvoice[] = displayedDocs;
    if (isUsingServerData && totalRecordsCount > displayedDocs.length) {
      try {
        const token = localStorage.getItem("authToken") || localStorage.getItem("token");
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("page_size", String(Math.min(totalRecordsCount, 5000)));
        params.set("sort_by", sortBy);
        if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
        if (appliedYear !== "all") params.set("year", appliedYear);
        if (appliedMonth !== "all") params.set("month", appliedMonth);
        if (appliedDateMode === "specific" && appliedDate) params.set("date", appliedDate);
        else if (appliedDateMode === "range") {
          if (appliedFromDate) params.set("from_date", appliedFromDate);
          if (appliedToDate) params.set("to_date", appliedToDate);
        }
        if (appliedDocType !== "all") params.set("doc_type", appliedDocType);

        const res = await fetch(`/api/documents/approved?${params.toString()}`, {
          headers: { ...(token ? { "Authorization": `Bearer ${token}` } : {}) }
        });
        if (res.ok) {
          exportList = await res.json();
        }
      } catch (e) {
        console.error("Failed to export full dataset, exporting current page:", e);
      }
    }

    if (exportList.length === 0) return;
    const headers = ["Document ID", "Invoice Number", "Vendor Name", "Document Type", "Division", "Amount", "Currency", "Status", "Approver", "Approved Date", "PO Number"];
    const rows = exportList.map(d => [
      d.id,
      `"${(d.invoice_number || "").replace(/"/g, '""')}"`,
      `"${(d.vendor_name || "").replace(/"/g, '""')}"`,
      d.document_type || "",
      d.division || "",
      d.amount || 0,
      d.currency || "INR",
      d.status || "Approved",
      `"${(d.assigned_approver || "").replace(/"/g, '""')}"`,
      d.invoice_date || d.created_at || "",
      d.po_number || ""
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Approved_Documents_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedMonthLabel = MONTH_NAMES.find(m => m.value === appliedMonth)?.label || "Month";

  return (
    <div className="space-y-3 pb-8">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 shadow-2xs">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 tracking-tight font-display">
                Approved Documents
              </h1>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
                {totalRecordsCount} Settled
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Enterprise approval archive filtered by Year, Month, Date, and Document Type
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => {
              if (onRefreshDocs) onRefreshDocs();
              fetchApprovedDocuments();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition shadow-2xs cursor-pointer"
            title="Refresh approved documents"
          >
            <RefreshCw className={`h-3 w-3 text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={totalRecordsCount === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#003F28] hover:bg-[#002F1E] text-white text-[11px] font-semibold transition shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Export filtered records to CSV"
          >
            <Download className="h-3 w-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN TOOLBAR: [ Search Documents... ]   [ Filter ]   [ Sort ] */}
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          {/* Main Toolbar Controls */}
          <div className="flex flex-1 items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Documents..."
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-md text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#003F28] transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter Button & Filter Popup Container */}
            <div className="relative" ref={filterPopupRef}>
              <button
                type="button"
                onClick={handleOpenFilter}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-semibold transition cursor-pointer shadow-2xs ${
                  isFilterOpen || activeFilterCount > 0
                    ? "bg-emerald-50 border-emerald-300 text-[#003F28]"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                }`}
                title="Open document filters"
              >
                <Filter className="h-3.5 w-3.5" />
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#003F28] text-white text-[9px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* FILTER POPUP PANEL (Contains ONLY Year, Month, Date, Document Type) */}
              {isFilterOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-40 w-80 sm:w-96 bg-white border border-slate-200 rounded-lg shadow-xl p-3.5 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#003F28]" />
                      <h3 className="text-xs font-bold text-slate-800">Filter Documents</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen(false)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {/* 1. YEAR FILTER */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Year
                      </label>
                      <select
                        value={draftYear}
                        onChange={(e) => setDraftYear(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                      >
                        <option value="all">All Years</option>
                        {availableYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. MONTH FILTER */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Month
                      </label>
                      <select
                        value={draftMonth}
                        onChange={(e) => setDraftMonth(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                      >
                        {MONTH_NAMES.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. DATE FILTER (Supports Specific Date or Date Range) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                          Date
                        </label>
                        <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
                          <button
                            type="button"
                            onClick={() => setDraftDateMode("specific")}
                            className={`px-2 py-0.5 text-[9.5px] font-bold rounded transition cursor-pointer ${
                              draftDateMode === "specific"
                                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Specific Date
                          </button>
                          <button
                            type="button"
                            onClick={() => setDraftDateMode("range")}
                            className={`px-2 py-0.5 text-[9.5px] font-bold rounded transition cursor-pointer ${
                              draftDateMode === "range"
                                ? "bg-white text-[#003F28] shadow-2xs font-extrabold"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            Date Range
                          </button>
                        </div>
                      </div>

                      {draftDateMode === "specific" ? (
                        <input
                          type="date"
                          value={draftDate}
                          onChange={(e) => setDraftDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                        />
                      ) : (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">From</span>
                              <input
                                type="date"
                                value={draftFromDate}
                                onChange={(e) => setDraftFromDate(e.target.value)}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10.5px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                              />
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">To</span>
                              <input
                                type="date"
                                value={draftToDate}
                                onChange={(e) => setDraftToDate(e.target.value)}
                                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10.5px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                              />
                            </div>
                          </div>
                          {/* Quick presets */}
                          <div className="flex items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => applyDraftDatePreset(7)}
                              className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                              7 Days
                            </button>
                            <button
                              type="button"
                              onClick={() => applyDraftDatePreset(30)}
                              className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                              30 Days
                            </button>
                            <button
                              type="button"
                              onClick={applyDraftThisMonthPreset}
                              className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            >
                              This Month
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4. DOCUMENT TYPE FILTER */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Document Type
                      </label>
                      <select
                        value={draftDocType}
                        onChange={(e) => setDraftDocType(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                      >
                        <option value="all">All Document Types</option>
                        {availableDocTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* POPUP ACTION BUTTONS: [ Clear All ] and [ Apply Filters ] */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleClearDraftFilters}
                      className="px-2.5 py-1 text-[10.5px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyFilters}
                      className="px-3.5 py-1.5 bg-[#003F28] hover:bg-[#002F1E] text-white text-[11px] font-semibold rounded-md transition shadow-2xs cursor-pointer"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sort Control */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
              <ArrowUpDown className="h-3 w-3 text-slate-500 shrink-0" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="date_desc">Newest Date</option>
                <option value="date_asc">Oldest Date</option>
                <option value="amount_desc">Amount (High-Low)</option>
                <option value="amount_asc">Amount (Low-High)</option>
                <option value="vendor">Vendor Name</option>
                <option value="name">Document Name</option>
              </select>
            </div>
          </div>
        </div>

        {/* 3. ACTIVE FILTER CHIPS (Shown above table when any filter is active) */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-[10.5px]">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Active Filters:
            </span>

            {/* Year Chip */}
            {appliedYear !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                <span>Year: <strong className="font-bold">{appliedYear}</strong></span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter("year")}
                  className="hover:text-emerald-950 p-0.5 cursor-pointer"
                  title="Remove Year filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Month Chip */}
            {appliedMonth !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                <span>Month: <strong className="font-bold">{selectedMonthLabel}</strong></span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter("month")}
                  className="hover:text-emerald-950 p-0.5 cursor-pointer"
                  title="Remove Month filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Specific Date Chip */}
            {appliedDateMode === "specific" && appliedDate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                <span>Date: <strong className="font-bold">{appliedDate}</strong></span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter("date")}
                  className="hover:text-emerald-950 p-0.5 cursor-pointer"
                  title="Remove Date filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Date Range Chip */}
            {appliedDateMode === "range" && (appliedFromDate || appliedToDate) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                <span>Date: <strong className="font-bold">{appliedFromDate || "..."} to {appliedToDate || "..."}</strong></span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter("date")}
                  className="hover:text-emerald-950 p-0.5 cursor-pointer"
                  title="Remove Date Range filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Document Type Chip */}
            {appliedDocType !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                <span>Type: <strong className="font-bold">{appliedDocType}</strong></span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter("docType")}
                  className="hover:text-emerald-950 p-0.5 cursor-pointer"
                  title="Remove Document Type filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {/* Clear All Chip */}
            <button
              type="button"
              onClick={handleClearAllFilters}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition cursor-pointer ml-1"
            >
              <span>Clear All</span>
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Filter Summary Status */}
        <div className="flex items-center justify-between pt-1 text-[10.5px] text-slate-500">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-800 font-bold">{displayedDocs.length}</strong> of {totalRecordsCount} records
            </span>
            {hasAnyFilterOrSearch && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-semibold">
                <Filter className="h-2.5 w-2.5" /> Filtered View
              </span>
            )}
            {isLoading && (
              <span className="inline-flex items-center gap-1 text-[9.5px] text-slate-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Loading...
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 hidden sm:block">
            Click any row to view complete document details
          </div>
        </div>
      </div>

      {/* 4. COMPACT APPROVED DOCUMENTS TABLE */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[0.5px] z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 border border-slate-200 rounded-md px-3 py-1.5 shadow-sm flex items-center gap-2 text-xs text-slate-700 font-semibold">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#003F28]" />
              <span>Updating results...</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[10.5px]">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold tracking-wider uppercase text-[9.5px]">
                <th className="py-2 px-2.5 w-8 text-center">#</th>
                <th className="py-2 px-2.5">Doc ID</th>
                <th className="py-2 px-2.5">Document / Invoice #</th>
                <th className="py-2 px-2.5">Vendor / Party</th>
                <th className="py-2 px-2.5">Doc Type</th>
                <th className="py-2 px-2.5">Approved Date</th>
                <th className="py-2 px-2.5">Approver</th>
                <th className="py-2 px-2.5 text-right">Amount</th>
                <th className="py-2 px-2.5 text-center">Status</th>
                <th className="py-2 px-2.5 text-center w-14">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedDocs.length > 0 ? (
                displayedDocs.map((doc, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const dt = getDocDate(doc);
                  const formattedDate = dt ? dt.toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                  }) : "-";

                  return (
                    <tr
                      key={doc.id}
                      onClick={() => onViewDocument(doc.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition group"
                    >
                      {/* Row index */}
                      <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[9.5px]">
                        {globalIdx}
                      </td>

                      {/* Document ID */}
                      <td className="py-2 px-2.5 font-mono font-bold text-slate-800 text-[9.5px]">
                        <span className="text-[#003F28] group-hover:underline">
                          {doc.id}
                        </span>
                      </td>

                      {/* Document Name / Invoice # */}
                      <td className="py-2 px-2.5 font-semibold text-slate-900 max-w-[160px] truncate text-[10.5px]">
                        {doc.invoice_number || doc.file_name || doc.id}
                      </td>

                      {/* Vendor / Party */}
                      <td className="py-2 px-2.5 text-slate-700 max-w-[160px] truncate text-[10px]" title={doc.vendor_name}>
                        {doc.vendor_name || "-"}
                      </td>

                      {/* Document Type */}
                      <td className="py-2 px-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {doc.document_type || "AP INVOICE"}
                        </span>
                      </td>

                      {/* Approved Date */}
                      <td className="py-2 px-2.5 text-slate-600 whitespace-nowrap text-[10px]">
                        {formattedDate}
                      </td>

                      {/* Approver */}
                      <td className="py-2 px-2.5 text-slate-700 max-w-[130px] truncate text-[10px]" title={doc.assigned_approver || "Verified"}>
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{doc.assigned_approver || "Verified"}</span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap text-[10px]">
                        {formatCurrency(doc.amount)}
                      </td>

                      {/* Status */}
                      <td className="py-2 px-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase bg-[#E7F9F1] text-[#059669] border border-[#A7F3D0]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#059669]" />
                          {doc.status || "APPROVED"}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-2 px-2.5 text-center" onClick={(e) => { e.stopPropagation(); onViewDocument(doc.id); }}>
                        <button
                          type="button"
                          className="p-1 rounded text-slate-500 hover:text-[#003F28] hover:bg-slate-100 transition"
                          title="View Document Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-10 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                        <FileText className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-bold text-slate-800">
                        No approved documents found
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {hasAnyFilterOrSearch 
                          ? "No documents match the selected Year, Month, Date, Doc Type, or Search term."
                          : "There are currently no approved documents in the repository."}
                      </p>
                      {hasAnyFilterOrSearch && (
                        <button
                          type="button"
                          onClick={handleClearAllFilters}
                          className="mt-2.5 px-2.5 py-1 rounded-md bg-[#003F28] text-white text-[10.5px] font-semibold hover:bg-[#002F1E] transition cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 5. COMPACT PAGINATION FOOTER */}
        {totalRecordsCount > 0 && (
          <div className="bg-slate-50/70 border-t border-slate-200 px-3 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10.5px] text-slate-600">
            <div className="flex items-center gap-1.5">
              <span>Showing</span>
              <span className="font-bold text-slate-900">
                {(currentPage - 1) * pageSize + 1}
              </span>
              <span>to</span>
              <span className="font-bold text-slate-900">
                {Math.min(currentPage * pageSize, totalRecordsCount)}
              </span>
              <span>of</span>
              <span className="font-bold text-slate-900">
                {totalRecordsCount}
              </span>
              <span>records</span>

              <span className="text-slate-300 mx-1">|</span>

              <span className="text-slate-500">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-600 cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && currentPage > 3) {
                    pageNum = Math.min(currentPage - 2 + i, totalPages - 4 + i);
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`h-6 w-6 rounded text-[10px] font-bold transition cursor-pointer ${
                        currentPage === pageNum
                          ? "bg-[#003F28] text-white shadow-2xs"
                          : "border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-600 cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
