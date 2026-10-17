import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  ImageIcon,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Activity,
  Kanban,
  ListFilter,
  CheckCheck,
  X,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import { DbInvoice } from "../types";
import { formatDate, getCanonicalDocumentType } from "../utils/formatters";
import CustomerFeedbackDetails from "./CustomerFeedbackDetails";

interface CustomerFeedbackPageProps {
  documents: DbInvoice[];
  selectedDocId: string | null;
  onSelectDocument: (docId: string | null) => void;
  currentUserRole: string;
  currentUserEmail?: string;
  currentUserUsername?: string;
  onRefreshDocs?: () => void;
}

export default function CustomerFeedbackPage({
  documents,
  selectedDocId,
  onSelectDocument,
  currentUserRole,
  currentUserEmail,
  currentUserUsername,
  onRefreshDocs,
}: CustomerFeedbackPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "PROGRESS" | "HOLD" | "REJECTED" | "CLEARED">("PENDING");
  const [viewMode, setViewMode] = useState<"TRACKER" | "REGISTRY">("TRACKER");
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; title?: string } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (!previewImageModal?.url) {
      setPreviewBlobUrl(null);
      return;
    }
    let isMounted = true;
    let createdBlobUrl: string | null = null;
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");

    let raw = previewImageModal.url.trim();
    if (raw.includes("/api/documents/temp-preview/")) {
      raw = raw.substring(raw.indexOf("/api/documents/temp-preview/"));
    } else if (raw.includes("/api/files/")) {
      raw = raw.substring(raw.indexOf("/api/files/"));
    } else if (!raw.startsWith("http") && !raw.startsWith("/") && !raw.startsWith("blob:") && !raw.startsWith("data:")) {
      if (raw.toLowerCase().endsWith(".jpg") || raw.toLowerCase().endsWith(".png") || raw.toLowerCase().endsWith(".jpeg") || raw.startsWith("TEMP_STAGE_")) {
        raw = `/api/documents/temp-preview/${raw}`;
      }
    }

    if (raw.startsWith("blob:") || raw.startsWith("data:")) {
      setPreviewBlobUrl(raw);
    } else {
      const sep = raw.includes("?") ? "&" : "?";
      const directWithToken = token ? `${raw}${sep}token=${encodeURIComponent(token)}` : raw;

      fetch(raw, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.blob();
        })
        .then((blob) => {
          if (isMounted) {
            createdBlobUrl = URL.createObjectURL(blob);
            setPreviewBlobUrl(createdBlobUrl);
          }
        })
        .catch(() => {
          if (isMounted) {
            setPreviewBlobUrl(directWithToken);
          }
        });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewImageModal(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      isMounted = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewImageModal]);

  const handleOpenEvidence = (e: React.MouseEvent, doc: DbInvoice) => {
    e.stopPropagation();
    e.preventDefault();
    const firstImg = doc.image_1 || doc.image_2 || doc.image_3 || doc.image_4 || doc.image_5;
    if (firstImg) {
      setPreviewImageModal({
        url: String(firstImg),
        title: `${doc.document_number || doc.id} - EVIDENCE`,
      });
    }
  };

  // Filter only Customer Feedback documents
  const feedbackDocs = useMemo(() => {
    return documents.filter((doc) => {
      if (!doc) return false;
      const rawType = (
        doc.document_type ||
        doc.subtype_of_complaint ||
        doc.type_of_complaint ||
        ""
      ).toUpperCase();
      const canonicalType = getCanonicalDocumentType(doc);
      const docIdUpper = (doc.id || "").toUpperCase();
      const docNumUpper = (doc.document_number || doc.invoice_number || "").toUpperCase();
      const wfProf = (doc.workflow_profile_id || doc.workflow_profile || "").toUpperCase();

      return (
        canonicalType === "CUSTOMER FEEDBACK" ||
        rawType.includes("FEEDBACK") ||
        rawType.includes("COMPLAINT") ||
        docIdUpper.startsWith("CMP") ||
        docIdUpper.startsWith("CF") ||
        docNumUpper.startsWith("CMP") ||
        docNumUpper.startsWith("CF") ||
        Boolean(doc.type_of_complaint) ||
        wfProf.includes("FEEDBACK")
      );
    });
  }, [documents]);

  // Active selected document
  const activeDocument = useMemo(() => {
    if (!selectedDocId) return null;
    return (
      feedbackDocs.find((d) => String(d.id) === String(selectedDocId)) ||
      documents.find((d) => String(d.id) === String(selectedDocId)) ||
      null
    );
  }, [selectedDocId, feedbackDocs, documents]);

  // Filter Popup open/close state & ref for click outside
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPopupRef = useRef<HTMLDivElement>(null);

  // Applied Filters for Cleared / Resolved feedback
  const [appliedYear, setAppliedYear] = useState<string>("all");
  const [appliedMonth, setAppliedMonth] = useState<string>("all");
  const [appliedDateMode, setAppliedDateMode] = useState<"specific" | "range">("specific");
  const [appliedDate, setAppliedDate] = useState<string>("");
  const [appliedFromDate, setAppliedFromDate] = useState<string>("");
  const [appliedToDate, setAppliedToDate] = useState<string>("");
  const [appliedDocType, setAppliedDocType] = useState<string>("all");

  // Draft Filters (Inside popup before user clicks "Apply Filters")
  const [draftYear, setDraftYear] = useState<string>("all");
  const [draftMonth, setDraftMonth] = useState<string>("all");
  const [draftDateMode, setDraftDateMode] = useState<"specific" | "range">("specific");
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftFromDate, setDraftFromDate] = useState<string>("");
  const [draftToDate, setDraftToDate] = useState<string>("");
  const [draftDocType, setDraftDocType] = useState<string>("all");

  // Sync draft filters when popup opens
  const handleOpenFilter = () => {
    if (!isFilterOpen) {
      setDraftDocType(appliedDocType);
      setDraftYear(appliedYear);
      setDraftMonth(appliedMonth);
      setDraftDateMode(appliedDateMode);
      setDraftDate(appliedDate);
      setDraftFromDate(appliedFromDate);
      setDraftToDate(appliedToDate);
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

  // Date helpers matching ApprovedDocumentsPage
  const getFeedbackDocDate = (doc: DbInvoice): Date | null => {
    const dateVal = doc.survey_date || doc.feedback_date || doc.invoice_date || doc.created_at;
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

  // Helper to categorize document status into Pending, Progress, Hold, Rejected, Cleared
  const getFeedbackCategory = (doc: DbInvoice): "PENDING" | "PROGRESS" | "HOLD" | "REJECTED" | "CLEARED" => {
    const st = (doc.status || "").toLowerCase().trim();
    if (st.includes("hold") || st.includes("pause") || st.includes("wait")) {
      return "HOLD";
    }
    if (st.includes("reject") || st.includes("declin") || st.includes("cancel") || st.includes("refus")) {
      return "REJECTED";
    }
    if (st.includes("approved") || st.includes("cleared") || st.includes("settled") || st.includes("resolved") || st.includes("completed")) {
      return "CLEARED";
    }
    if (st.includes("progress") || st.includes("investigat") || st.includes("routing") || st.includes("processing") || st.includes("initiated") || st.includes("stage")) {
      return "PROGRESS";
    }
    return "PENDING";
  };

  // Cleared documents base list for extracting filter options
  const clearedFeedbackDocs = useMemo(() => {
    return feedbackDocs.filter((d) => getFeedbackCategory(d) === "CLEARED");
  }, [feedbackDocs]);

  // Available Years dynamically extracted from Cleared records
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    clearedFeedbackDocs.forEach((d) => {
      const dt = getFeedbackDocDate(d);
      if (dt) years.add(String(dt.getFullYear()));
    });
    return Array.from(years).sort().reverse();
  }, [clearedFeedbackDocs]);

  // Available Document/Complaint Types dynamically extracted from Cleared records
  const availableDocTypes = useMemo(() => {
    const set = new Set<string>();
    clearedFeedbackDocs.forEach((d) => {
      const t = (d.type_of_complaint || d.subtype_of_complaint || d.category || d.document_type || "").trim();
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [clearedFeedbackDocs]);

  // Available Months dynamically extracted from Cleared records
  const MONTH_LABELS: Record<string, string> = {
    "1": "January", "2": "February", "3": "March", "4": "April",
    "5": "May", "6": "June", "7": "July", "8": "August",
    "9": "September", "10": "October", "11": "November", "12": "December"
  };

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    clearedFeedbackDocs.forEach((d) => {
      const dt = getFeedbackDocDate(d);
      if (dt) months.add(String(dt.getMonth() + 1));
    });
    return Array.from(months)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((m) => ({ value: m, label: MONTH_LABELS[m] || `Month ${m}` }));
  }, [clearedFeedbackDocs]);

  const selectedMonthLabel = useMemo(() => {
    if (appliedMonth === "all") return "";
    return MONTH_LABELS[appliedMonth] || `Month ${appliedMonth}`;
  }, [appliedMonth]);

  // Apply filters from Popup
  const handleApplyFilters = () => {
    setAppliedYear(draftYear);
    setAppliedMonth(draftMonth);
    setAppliedDateMode(draftDateMode);
    setAppliedDate(draftDate);
    setAppliedFromDate(draftFromDate);
    setAppliedToDate(draftToDate);
    setAppliedDocType(draftDocType);
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

  // Clear all active filters
  const handleClearAllFilters = () => {
    setAppliedYear("all");
    setAppliedMonth("all");
    setAppliedDateMode("specific");
    setAppliedDate("");
    setAppliedFromDate("");
    setAppliedToDate("");
    setAppliedDocType("all");
    handleClearDraftFilters();
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
  };

  // Active filter count (Year, Month, Date, Doc/Complaint Type)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (appliedYear !== "all") count++;
    if (appliedMonth !== "all") count++;
    if (appliedDateMode === "specific" && appliedDate) count++;
    if (appliedDateMode === "range" && (appliedFromDate || appliedToDate)) count++;
    if (appliedDocType !== "all") count++;
    return count;
  }, [appliedYear, appliedMonth, appliedDateMode, appliedDate, appliedFromDate, appliedToDate, appliedDocType]);

  // Cascading Filter Change Handlers:
  const handleDraftDocTypeChange = (newType: string) => {
    setDraftDocType(newType);
  };

  const handleDraftYearChange = (newYear: string) => {
    setDraftYear(newYear);
  };

  const handleDraftMonthChange = (newMonth: string) => {
    setDraftMonth(newMonth);
  };

  // Filtered feedback list based on search, status tabs, and CLEARED filters
  const filteredDocs = useMemo(() => {
    return feedbackDocs.filter((doc) => {
      const category = getFeedbackCategory(doc);

      // 1. Status Filter
      if (statusFilter !== "ALL") {
        if (statusFilter !== category) return false;
      }

      // 2. CLEARED / RESOLVED Specific Filters (applies strictly to Cleared / Resolved records)
      if (category === "CLEARED") {
        const dt = getFeedbackDocDate(doc);

        // Year filter
        if (appliedYear !== "all") {
          if (!dt || String(dt.getFullYear()) !== appliedYear) return false;
        }

        // Month filter
        if (appliedMonth !== "all") {
          if (!dt || String(dt.getMonth() + 1) !== appliedMonth) return false;
        }

        // Date filter
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

        // Document / Complaint Type Filter
        if (appliedDocType !== "all") {
          const typeCandidates = [
            (doc.type_of_complaint || "").toLowerCase().trim(),
            (doc.subtype_of_complaint || "").toLowerCase().trim(),
            (doc.category || "").toLowerCase().trim(),
            (doc.document_type || "").toLowerCase().trim(),
          ];
          const target = appliedDocType.toLowerCase().trim();
          if (!typeCandidates.includes(target)) return false;
        }
      } else if (activeFilterCount > 0 && statusFilter === "ALL") {
        // If filters are active while on "ALL" view, non-cleared records pass through unhindered
      }

      // 3. Search Term
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase().trim();
      return (
        (doc.id || "").toLowerCase().includes(term) ||
        (doc.document_number || "").toLowerCase().includes(term) ||
        (doc.account_name || "").toLowerCase().includes(term) ||
        (doc.dealer_name || "").toLowerCase().includes(term) ||
        (doc.type_of_complaint || "").toLowerCase().includes(term) ||
        (doc.subtype_of_complaint || "").toLowerCase().includes(term) ||
        (doc.employee_name || "").toLowerCase().includes(term) ||
        (doc.bp_code || "").toLowerCase().includes(term)
      );
    });
  }, [
    feedbackDocs,
    statusFilter,
    searchTerm,
    appliedYear,
    appliedMonth,
    appliedDateMode,
    appliedDate,
    appliedFromDate,
    appliedToDate,
    appliedDocType,
    activeFilterCount,
  ]);

  // KPI Calculations
  const totalCount = feedbackDocs.length;
  const pendingCount = feedbackDocs.filter((d) => getFeedbackCategory(d) === "PENDING").length;
  const progressCount = feedbackDocs.filter((d) => getFeedbackCategory(d) === "PROGRESS").length;
  const holdCount = feedbackDocs.filter((d) => getFeedbackCategory(d) === "HOLD").length;
  const rejectedCount = feedbackDocs.filter((d) => getFeedbackCategory(d) === "REJECTED").length;
  const clearedCount = filteredDocs.filter((d) => getFeedbackCategory(d) === "CLEARED").length;

  // Render Details view if a record is selected
  if (selectedDocId) {
    return (
      <CustomerFeedbackDetails
        key={selectedDocId}
        document={activeDocument}
        documentId={selectedDocId}
        currentUserRole={currentUserRole}
        currentUserEmail={currentUserEmail}
        currentUserUsername={currentUserUsername}
        onRefreshDocument={onRefreshDocs}
        onGoBack={() => onSelectDocument(null)}
        onSelectDocument={(id) => onSelectDocument(id)}
      />
    );
  }

  return (
    <div className="w-full space-y-3 pb-8 animate-fadeIn font-sans text-slate-800">
      
      {/* 1. TOP HEADER WITH INTEGRATED SEARCH & VIEW MODE SWITCHER */}
      <div className="bg-white rounded-xl border border-slate-200/80 px-3 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[#003F28] text-white flex items-center justify-center shadow-xs shrink-0">
            <MessageSquare className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5 leading-tight">
              <span>Customer Feedback Hub</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-900 font-extrabold px-1.5 py-0.25 rounded-full border border-emerald-200">
                {totalCount} RECORDS
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 font-medium leading-tight">
              Track customer feedback lifecycle, workflow stages, and physical document evidence.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-[240px]">
          {/* Top Search Input */}
          <div className="relative flex-1 max-w-xs min-w-[180px]">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search feedback ID, account, dealer..."
              className="w-full pl-8 pr-7 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                title="Clear Search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* View Mode Toggle: Work Tracker vs Registry */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode("TRACKER")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold transition cursor-pointer ${
                viewMode === "TRACKER"
                  ? "bg-[#003F28] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <Kanban className="h-3 w-3" />
              <span>Work Tracker</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("REGISTRY")}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-extrabold transition cursor-pointer ${
                viewMode === "REGISTRY"
                  ? "bg-[#003F28] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <ListFilter className="h-3 w-3" />
              <span>Registry Table</span>
            </button>
          </div>

          {onRefreshDocs && (
            <button
              type="button"
              onClick={onRefreshDocs}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-extrabold transition cursor-pointer shadow-2xs"
              title="Refresh Records"
            >
              <RefreshCw className="h-3 w-3 text-slate-500" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. FEEDBACK STAT STRIP (5 CARDS: PENDING REVIEW, IN PROGRESS, ON HOLD, REJECTED, CLEARED / RESOLVED) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div 
          onClick={() => setStatusFilter(statusFilter === "PENDING" ? "ALL" : "PENDING")}
          className={`bg-white border rounded-xl p-2.5 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            statusFilter === "PENDING" ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20" : "border-slate-200 hover:border-amber-400"
          }`}
        >
          <div>
            <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-800">PENDING REVIEW</span>
            <div className="text-lg font-black text-slate-900 mt-0.5">{pendingCount}</div>
          </div>
          <div className="h-7 w-7 rounded-md bg-amber-100 text-amber-800 flex items-center justify-center">
            <Clock className="h-3.5 w-3.5" />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === "PROGRESS" ? "ALL" : "PROGRESS")}
          className={`bg-white border rounded-xl p-2.5 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            statusFilter === "PROGRESS" ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20" : "border-slate-200 hover:border-blue-400"
          }`}
        >
          <div>
            <span className="text-[9.5px] font-black uppercase tracking-wider text-blue-800">IN PROGRESS</span>
            <div className="text-lg font-black text-slate-900 mt-0.5">{progressCount}</div>
          </div>
          <div className="h-7 w-7 rounded-md bg-blue-100 text-blue-800 flex items-center justify-center">
            <Activity className="h-3.5 w-3.5" />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === "HOLD" ? "ALL" : "HOLD")}
          className={`bg-white border rounded-xl p-2.5 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            statusFilter === "HOLD" ? "border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/20" : "border-slate-200 hover:border-purple-400"
          }`}
        >
          <div>
            <span className="text-[9.5px] font-black uppercase tracking-wider text-purple-800">ON HOLD</span>
            <div className="text-lg font-black text-slate-900 mt-0.5">{holdCount}</div>
          </div>
          <div className="h-7 w-7 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center">
            <AlertCircle className="h-3.5 w-3.5 text-purple-800" />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === "REJECTED" ? "ALL" : "REJECTED")}
          className={`bg-white border rounded-xl p-2.5 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            statusFilter === "REJECTED" ? "border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20" : "border-slate-200 hover:border-rose-400"
          }`}
        >
          <div>
            <span className="text-[9.5px] font-black uppercase tracking-wider text-rose-800">REJECTED</span>
            <div className="text-lg font-black text-slate-900 mt-0.5">{rejectedCount}</div>
          </div>
          <div className="h-7 w-7 rounded-md bg-rose-100 text-rose-800 flex items-center justify-center">
            <XCircle className="h-3.5 w-3.5 text-rose-800" />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter(statusFilter === "CLEARED" ? "ALL" : "CLEARED")}
          className={`bg-white border rounded-xl p-2.5 shadow-2xs flex items-center justify-between cursor-pointer transition-all relative ${
            statusFilter === "CLEARED" ? "border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/20" : "border-slate-200 hover:border-emerald-400"
          }`}
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-emerald-800">CLEARED / RESOLVED</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#003F28] text-white text-[8px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <div className="text-lg font-black text-slate-900 mt-0.5">{clearedCount}</div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Filter Trigger on CLEARED card */}
            <div className="relative" ref={filterPopupRef} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={handleOpenFilter}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-extrabold transition cursor-pointer shadow-2xs ${
                  isFilterOpen || activeFilterCount > 0
                    ? "bg-emerald-100/80 border-emerald-300 text-[#003F28]"
                    : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700"
                }`}
                title="Filter Cleared / Resolved records"
              >
                <Filter className="h-3 w-3" />
                <span className="hidden sm:inline">Filter</span>
                {activeFilterCount > 0 && (
                  <span className="px-1 py-0.2 rounded-full bg-[#003F28] text-white text-[8px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* FILTER POPUP PANEL (Year, Month, Date, Complaint/Document Type) */}
              {isFilterOpen && (
                <div 
                  className="absolute right-0 top-full mt-1.5 z-50 w-80 sm:w-96 bg-white border border-slate-200 rounded-lg shadow-xl p-3.5 animate-in fade-in slide-in-from-top-1 duration-150 text-left font-sans cursor-default"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#003F28]" />
                      <h3 className="text-xs font-bold text-slate-800">Filter Cleared / Resolved</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen(false)}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {/* 1. COMPLAINT / DOCUMENT TYPE FILTER */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Complaint / Document Type
                      </label>
                      <select
                        value={draftDocType}
                        onChange={(e) => handleDraftDocTypeChange(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                      >
                        <option value="all">All Types</option>
                        {availableDocTypes.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    {/* 2. YEAR FILTER */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Year
                      </label>
                      <select
                        value={draftYear}
                        onChange={(e) => handleDraftYearChange(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                      >
                        <option value="all">All Years</option>
                        {availableYears.map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>

                    {/* 3. MONTH FILTER */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                        Month
                      </label>
                      <select
                        value={draftMonth}
                        onChange={(e) => handleDraftMonthChange(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-800 focus:outline-none focus:border-[#003F28] focus:bg-white cursor-pointer"
                      >
                        <option value="all">All Months</option>
                        {availableMonths.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* 4. DATE FILTER (Supports Specific Date or Date Range) */}
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
                      onClick={() => {
                        handleApplyFilters();
                        setStatusFilter("CLEARED");
                      }}
                      className="px-3.5 py-1.5 bg-[#003F28] hover:bg-[#002F1E] text-white text-[11px] font-semibold rounded-md transition shadow-2xs cursor-pointer"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="h-7 w-7 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <CheckCheck className="h-3.5 w-3.5 text-emerald-800" />
            </div>
          </div>
        </div>
      </div>

      {/* 3. ACTIVE FILTER CHIPS FOR CLEARED / RESOLVED (Matching ApprovedDocumentsPage) */}
      {activeFilterCount > 0 && (
        <div className="bg-white rounded-xl border border-emerald-200/90 px-3 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3 text-emerald-700" />
              <span>Cleared Records Filters:</span>
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

            {/* Document/Complaint Type Chip */}
            {appliedDocType !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                <span>Type: <strong className="font-bold">{appliedDocType}</strong></span>
                <button
                  type="button"
                  onClick={() => handleRemoveFilter("docType")}
                  className="hover:text-emerald-950 p-0.5 cursor-pointer"
                  title="Remove Type filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleClearAllFilters}
            className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
          >
            Clear All
          </button>
        </div>
      )}

      {/* 4. CONTENT VIEW: WORK TRACKER BOARD (Default) OR REGISTRY TABLE */}
      {viewMode === "TRACKER" ? (
        /* WORK TRACKER BOARD VIEW */
        <div className="space-y-3">
          {filteredDocs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-2xs">
              <MessageSquare className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="font-extrabold text-slate-700 text-sm">No feedback records match the selected filter</p>
              <p className="text-xs text-slate-400 mt-1">Try switching status tabs to All, Pending, In Progress, or Cleared.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDocs.map((doc) => {
                const category = getFeedbackCategory(doc);
                const hasImages = Boolean(doc.image_1 || doc.image_2 || doc.image_3 || doc.image_4 || doc.image_5);

                return (
                  <div
                    key={doc.id}
                    onClick={() => onSelectDocument(String(doc.id))}
                    className="bg-white rounded-xl border border-slate-200/90 hover:border-emerald-500 px-3 py-1.5 shadow-2xs hover:shadow-2xs transition-all cursor-pointer flex flex-wrap items-center justify-between gap-2.5 group"
                  >
                    {/* Left: Ref ID & Title */}
                    <div className="flex items-center gap-2 min-w-[200px] max-w-[280px]">
                      <div className="h-6 w-6 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/80 group-hover:bg-emerald-50 group-hover:text-emerald-800 transition">
                        <MessageSquare className="h-3 w-3" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11.5px] font-black text-emerald-950 font-mono group-hover:text-emerald-700">
                            {doc.document_number || doc.id}
                          </span>
                          {hasImages && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenEvidence(e, doc)}
                              className="text-[8.5px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1 cursor-pointer transition shadow-2xs"
                              title="Preview attached image"
                            >
                              <ImageIcon className="h-2.5 w-2.5 text-emerald-700" />
                              <span>Evidence</span>
                            </button>
                          )}
                        </div>
                        <h4 className="text-[11px] font-bold text-slate-900 truncate leading-tight">
                          {doc.type_of_complaint || "Customer Feedback Record"}
                        </h4>
                      </div>
                    </div>

                    {/* Middle: Account & Dealer Info (Inline micro fields) */}
                    <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                      <div className="bg-slate-50/80 px-2 py-0.5 rounded-md border border-slate-200/70 flex-1 min-w-0">
                        <span className="text-[7.5px] font-extrabold uppercase text-slate-400 block">Account</span>
                        <span className="text-[11px] font-bold text-slate-900 truncate block leading-tight">
                          {doc.account_name || doc.party_name || "—"}
                        </span>
                      </div>
                      <div className="bg-slate-50/80 px-2 py-0.5 rounded-md border border-slate-200/70 flex-1 min-w-0">
                        <span className="text-[7.5px] font-extrabold uppercase text-slate-400 block">Dealer / Dist.</span>
                        <span className="text-[11px] font-semibold text-slate-800 truncate block leading-tight">
                          {doc.dealer_name || doc.vendor_name || "—"}
                        </span>
                      </div>
                    </div>

                    {/* Right: Synced Date, Status & Action */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right hidden lg:block">
                        <span className="text-[7.5px] font-extrabold uppercase text-slate-400 block">Date</span>
                        <span className="text-[10.5px] font-mono font-bold text-slate-700 leading-tight block">
                          {formatDate(doc.survey_date || doc.created_at)}
                        </span>
                      </div>

                      <span
                        className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          category === "CLEARED"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : category === "PROGRESS"
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : category === "HOLD"
                            ? "bg-purple-50 text-purple-800 border-purple-200"
                            : category === "REJECTED"
                            ? "bg-rose-50 text-rose-800 border-rose-200"
                            : "bg-amber-50 text-amber-900 border-amber-200"
                        }`}
                      >
                        {category === "CLEARED" ? (
                          <CheckCheck className="h-2.5 w-2.5 text-emerald-700" />
                        ) : category === "PROGRESS" ? (
                          <Activity className="h-2.5 w-2.5 text-blue-700" />
                        ) : category === "HOLD" ? (
                          <AlertCircle className="h-2.5 w-2.5 text-purple-700" />
                        ) : category === "REJECTED" ? (
                          <XCircle className="h-2.5 w-2.5 text-rose-700" />
                        ) : (
                          <Clock className="h-2.5 w-2.5 text-amber-700" />
                        )}
                        <span>{category === "CLEARED" ? "CLEARED" : category === "PROGRESS" ? "IN PROGRESS" : category === "HOLD" ? "ON HOLD" : category === "REJECTED" ? "REJECTED" : "PENDING"}</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDocument(String(doc.id));
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#003F28] hover:bg-[#002e1d] text-white text-[10.5px] font-extrabold rounded-md shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <span>Inspect</span>
                        <ArrowRight className="h-2.5 w-2.5" />
                      </button>
                    </div>

                    {/* Hold Reason & Remark Strip */}
                    {category === "HOLD" && (
                      <div className="w-full bg-purple-50/90 border border-purple-200/90 rounded-lg px-2.5 py-1 text-[10.5px] flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AlertCircle className="h-3 w-3 text-purple-700 shrink-0" />
                          <span className="font-extrabold text-purple-900 shrink-0">HOLD REASON & ACTION:</span>
                          <span className="truncate font-medium text-purple-950">
                            {(doc as any).hold_reason || doc.remarks || (doc as any).additional_comments || "Awaiting customer/internal clarification"}
                          </span>
                        </div>
                        <span className="text-[8.5px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.2 rounded border border-purple-200 shrink-0">
                          ON HOLD
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* REGISTRY TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Complaint ID</th>
                  <th className="py-3 px-4">Type of Complaint</th>
                  <th className="py-3 px-4">Account / Customer</th>
                  <th className="py-3 px-4">Dealer / Distributor</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Survey Date</th>
                  <th className="py-3 px-4 text-center">Work Tracker Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredDocs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <MessageSquare className="h-8 w-8 text-slate-300" />
                        <p className="font-bold text-slate-600">No Customer Feedback records found</p>
                        <p className="text-[11px] text-slate-400">Try clearing filters or adjusting your search phrase.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDocs.map((doc) => {
                    const category = getFeedbackCategory(doc);

                    return (
                      <tr
                        key={doc.id}
                        onClick={() => onSelectDocument(String(doc.id))}
                        className="hover:bg-slate-50/80 transition cursor-pointer group"
                      >
                        {/* ID */}
                        <td className="py-3 px-4 font-black text-emerald-900 group-hover:text-emerald-700 whitespace-nowrap font-mono">
                          <div className="flex items-center gap-1.5">
                            <span>{doc.document_number || doc.id}</span>
                            {Boolean(doc.image_1 || doc.image_2 || doc.image_3 || doc.image_4 || doc.image_5) && (
                              <button
                                type="button"
                                onClick={(e) => handleOpenEvidence(e, doc)}
                                className="text-[8px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-0.5 cursor-pointer transition shadow-2xs font-sans"
                                title="Preview attached image"
                              >
                                <ImageIcon className="h-2 w-2 text-emerald-700" />
                                <span>Evidence</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Complaint Type */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">
                            {doc.type_of_complaint || "General Complaint"}
                          </div>
                          {doc.subtype_of_complaint && (
                            <div className="text-[10.5px] text-slate-500 font-medium">
                              {doc.subtype_of_complaint}
                            </div>
                          )}
                        </td>

                        {/* Account */}
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {doc.account_name || doc.party_name || "—"}
                        </td>

                        {/* Dealer */}
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {doc.dealer_name || doc.vendor_name || "—"}
                        </td>

                        {/* Employee */}
                        <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                          {doc.employee_name || "—"}
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {formatDate(doc.survey_date || doc.feedback_date || doc.invoice_date || doc.created_at)}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                              category === "CLEARED"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : category === "PROGRESS"
                                ? "bg-blue-50 text-blue-800 border-blue-200"
                                : category === "HOLD"
                                ? "bg-purple-50 text-purple-800 border-purple-200"
                                : category === "REJECTED"
                                ? "bg-rose-50 text-rose-800 border-rose-200"
                                : "bg-amber-50 text-amber-900 border-amber-200"
                            }`}
                          >
                            {category === "CLEARED" ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                            ) : category === "PROGRESS" ? (
                              <Activity className="h-3 w-3 text-blue-700" />
                            ) : category === "HOLD" ? (
                              <AlertCircle className="h-3 w-3 text-purple-700" />
                            ) : category === "REJECTED" ? (
                              <XCircle className="h-3 w-3 text-rose-700" />
                            ) : (
                              <Clock className="h-3 w-3 text-amber-700" />
                            )}
                            <span>{category === "CLEARED" ? "CLEARED" : category === "PROGRESS" ? "IN PROGRESS" : category === "HOLD" ? "ON HOLD" : category === "REJECTED" ? "REJECTED" : "PENDING"}</span>
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDocument(String(doc.id));
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#003F28] hover:bg-[#002e1d] text-white font-extrabold text-[11px] transition shadow-2xs cursor-pointer"
                          >
                            <span>Inspect</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. IN-PAGE IMAGE PREVIEW POPUP MODAL */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
          onClick={() => setPreviewImageModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#003F28] text-white px-5 py-3 flex items-center justify-between shadow-sm shrink-0">
              <h3 className="font-extrabold text-sm text-white">
                {previewImageModal.title || "IMAGE PREVIEW"}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewImageModal(null)}
                className="p-1 rounded bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 bg-slate-950 p-4 flex items-center justify-center overflow-auto min-h-[360px]">
              <img
                src={previewBlobUrl || previewImageModal.url}
                alt="Feedback Image"
                className="max-h-[65vh] max-w-full object-contain rounded shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
