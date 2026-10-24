import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ShieldCheck,
  Search,
  Download,
  RotateCw,
  Calendar,
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Sliders,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Check,
  Eye,
  FileText,
  Clock,
  Trash2,
  Save,
  Loader2,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Server
} from "lucide-react";

export interface AuditLogItem {
  id: number;
  invoice_id?: string | null;
  document_id?: string | null;
  user: string;
  action: string;
  stage?: string | null;
  notes?: string | null;
  details?: string | null;
  ip_address?: string | null;
  timestamp: string;
  approver_user_id?: number | null;
  stage_id?: number | null;
  previous_status?: string | null;
  new_status?: string | null;
  remarks?: string | null;
  outcome?: string | null;
  category?: string | null;
}

interface SummaryCardData {
  count: number;
  prev_count: number;
  delta_pct: number | null;
}

interface AuditSummaryMetrics {
  date_preset: string;
  start_time: string | null;
  end_time: string | null;
  total_events: SummaryCardData;
  failed_logins: SummaryCardData;
  security_events: SummaryCardData;
  admin_changes: SummaryCardData;
}

interface RetentionInfo {
  retention_days: number;
  default_retention_days: number;
  total_logs: number;
  oldest_log: string | null;
  expired_logs_count: number;
  cutoff_timestamp: string | null;
}

interface AuditLogsPageProps {
  isEmbedded?: boolean;
}

export default function AuditLogsPage({ isEmbedded = false }: AuditLogsPageProps) {
  // 1. Data States
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  // 2. Summary & Retention States
  const [summary, setSummary] = useState<AuditSummaryMetrics | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(true);
  const [retentionInfo, setRetentionInfo] = useState<RetentionInfo>({
    retention_days: 7,
    default_retention_days: 7,
    total_logs: 0,
    oldest_log: null,
    expired_logs_count: 0,
    cutoff_timestamp: null
  });
  const [retentionDraft, setRetentionDraft] = useState<string>("7");
  const [customDays, setCustomDays] = useState<string>("");
  const [isCustomRetention, setIsCustomRetention] = useState<boolean>(false);
  const [retentionSaving, setRetentionSaving] = useState<boolean>(false);
  const [pruneModalOpen, setPruneModalOpen] = useState<boolean>(false);
  const [pruning, setPruning] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // 3. Filter States
  const [categoryTab, setCategoryTab] = useState<string>("ALL");
  const [datePreset, setDatePreset] = useState<string>("7d");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [showCustomDateModal, setShowCustomDateModal] = useState<boolean>(false);
  const [userFilter, setUserFilter] = useState<string>("ALL");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [appliedSearch, setAppliedSearch] = useState<string>("");

  // 4. Filter Options (from DB)
  const [filterOptions, setFilterOptions] = useState<{
    users: string[];
    actions: string[];
    stages: string[];
    outcomes: string[];
  }>({
    users: [],
    actions: [],
    stages: [],
    outcomes: ["Success", "Failed", "Warning", "Info"]
  });

  // 5. Pagination & Table States
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set());
  const [activeLog, setActiveLog] = useState<AuditLogItem | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedMetadata, setCopiedMetadata] = useState<boolean>(false);
  const [metadataView, setMetadataView] = useState<"props" | "json">("props");

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeLog) {
        setActiveLog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLog]);

  // Mount controls to Admin header panel if available
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.getElementById("admin-header-actions");
    if (el) {
      setPortalNode(el);
    }
  }, []);

  // Auth token helper
  const getHeaders = useCallback(() => {
    const token = localStorage.getItem("authToken");
    return token
      ? { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" };
  }, []);

  // Fetch Summary Metrics
  const fetchSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const params = new URLSearchParams({
        date_preset: datePreset
      });
      if (datePreset === "custom") {
        if (customStartDate) params.set("start_date", customStartDate);
        if (customEndDate) params.set("end_date", customEndDate);
      }
      const res = await fetch(`/api/admin/audit-logs/summary?${params.toString()}`, {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.error("Failed to fetch audit summary:", err);
    } finally {
      setSummaryLoading(false);
    }
  }, [datePreset, customStartDate, customEndDate, getHeaders]);

  // Fetch Filter Dropdown Options
  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audit-logs/filters", {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setFilterOptions({
          users: data.users || [],
          actions: data.actions || [],
          stages: data.stages || [],
          outcomes: data.outcomes || ["Success", "Failed", "Warning", "Info"]
        });
      }
    } catch (err) {
      console.error("Failed to fetch filter options:", err);
    }
  }, [getHeaders]);

  // Fetch Retention Status
  const fetchRetentionInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audit-logs/retention", {
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setRetentionInfo(data);
        const daysStr = String(data.retention_days);
        if (["7", "14", "30", "90", "180", "365", "0"].includes(daysStr)) {
          setRetentionDraft(daysStr);
          setIsCustomRetention(false);
        } else {
          setRetentionDraft("custom");
          setIsCustomRetention(true);
          setCustomDays(daysStr);
        }
      }
    } catch (err) {
      console.error("Failed to fetch retention info:", err);
    }
  }, [getHeaders]);

  // Fetch Paginated Logs
  const fetchLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        category: categoryTab,
        date_preset: datePreset,
        sort_by: "timestamp",
        sort_dir: "desc"
      });

      if (datePreset === "custom") {
        if (customStartDate) params.set("start_date", customStartDate);
        if (customEndDate) params.set("end_date", customEndDate);
      }

      if (userFilter !== "ALL") params.set("user", userFilter);
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (outcomeFilter !== "ALL") params.set("outcome", outcomeFilter);
      if (appliedSearch.trim()) params.set("search", appliedSearch.trim());

      const res = await fetch(`/api/admin/audit-logs/query?${params.toString()}`, {
        headers: getHeaders()
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.items || []);
        setTotalCount(data.total || 0);
        setTotalPages(data.total_pages || 1);
      } else {
        console.error("Failed to fetch audit logs: HTTP", res.status);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    page,
    pageSize,
    categoryTab,
    datePreset,
    customStartDate,
    customEndDate,
    userFilter,
    actionFilter,
    outcomeFilter,
    appliedSearch,
    getHeaders
  ]);

  // Initial load
  useEffect(() => {
    fetchFilterOptions();
    fetchRetentionInfo();
  }, [fetchFilterOptions, fetchRetentionInfo]);

  // Refetch summary whenever date window changes
  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Refetch logs whenever pagination or filters change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Handle Full Refresh
  const handleFullRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLogs(true), fetchSummary(), fetchRetentionInfo()]);
    setRefreshing(false);
  };

  // Handle Save Retention Policy
  const handleSaveRetention = async () => {
    setRetentionSaving(true);
    try {
      const days = isCustomRetention ? parseInt(customDays, 10) : parseInt(retentionDraft, 10);
      if (isNaN(days) || days < 0) {
        setNotification({ type: "error", message: "Please provide a valid retention duration in days." });
        setRetentionSaving(false);
        return;
      }
      const res = await fetch("/api/admin/audit-logs/retention", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ retention_days: days })
      });
      if (res.ok) {
        const data = await res.json();
        setNotification({ type: "success", message: data.message || "Retention policy saved successfully." });
        await fetchRetentionInfo();
        await fetchSummary();
      } else {
        setNotification({ type: "error", message: "Failed to update retention policy." });
      }
    } catch (err) {
      console.error(err);
      setNotification({ type: "error", message: "Error communicating with server." });
    } finally {
      setRetentionSaving(false);
    }
  };

  // Handle Prune Expired Records
  const handlePruneExpired = async () => {
    setPruning(true);
    try {
      const res = await fetch("/api/admin/audit-logs/cleanup", {
        method: "POST",
        headers: getHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setNotification({
          type: "success",
          message: data.message || `Pruned ${data.deleted_count || 0} expired logs successfully.`
        });
        setPruneModalOpen(false);
        await Promise.all([fetchLogs(), fetchSummary(), fetchRetentionInfo()]);
      } else {
        setNotification({ type: "error", message: "Failed to prune expired logs." });
      }
    } catch (err) {
      console.error(err);
      setNotification({ type: "error", message: "Error during pruning operation." });
    } finally {
      setPruning(false);
    }
  };

  // Handle CSV Export
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        category: categoryTab,
        date_preset: datePreset
      });
      if (datePreset === "custom") {
        if (customStartDate) params.set("start_date", customStartDate);
        if (customEndDate) params.set("end_date", customEndDate);
      }
      if (userFilter !== "ALL") params.set("user", userFilter);
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (outcomeFilter !== "ALL") params.set("outcome", outcomeFilter);
      if (appliedSearch.trim()) params.set("search", appliedSearch.trim());

      const res = await fetch(`/api/admin/audit-logs/export?${params.toString()}`, {
        headers: getHeaders()
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      a.download = `daas_audit_logs_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setNotification({ type: "success", message: "Audit logs exported successfully." });
    } catch (err) {
      console.error("Export error:", err);
      setNotification({ type: "error", message: "Failed to export audit logs." });
    } finally {
      setExporting(false);
    }
  };

  // Keyboard navigation for side drawer (Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeLog) {
        setActiveLog(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeLog]);

  // Drawer Next/Prev Log Navigation
  const activeIndex = useMemo(() => {
    if (!activeLog) return -1;
    return logs.findIndex((l) => l.id === activeLog.id);
  }, [activeLog, logs]);

  const handlePrevRecord = () => {
    if (activeIndex > 0) {
      setActiveLog(logs[activeIndex - 1]);
    }
  };

  const handleNextRecord = () => {
    if (activeIndex >= 0 && activeIndex < logs.length - 1) {
      setActiveLog(logs[activeIndex + 1]);
    }
  };

  // Copy helper
  const handleCopyId = (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(String(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyMetadata = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedMetadata(true);
    setTimeout(() => setCopiedMetadata(false), 2000);
  };

  // Timestamp Formatter
  const formatLocalTimestamp = (ts: string) => {
    if (!ts) return "—";
    try {
      let s = String(ts).trim();
      if (!s.endsWith("Z") && !s.includes("+") && !s.slice(10).includes("-")) {
        s = s.replace(" ", "T") + "Z";
      }
      const d = new Date(s);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      });
    } catch {
      return String(ts);
    }
  };

  // Clean Badge Styling Helper
  const getActionBadgeStyle = (action: string = "", outcome: string = "") => {
    const act = action.toLowerCase();
    const out = outcome.toLowerCase();

    if (out === "failed" || act.includes("fail") || act.includes("reject") || act.includes("locked") || act.includes("cancel")) {
      return "bg-rose-50 text-rose-700 border-rose-200/80";
    }
    if (out === "warning" || act.includes("hold") || act.includes("unrouted") || act.includes("pause")) {
      return "bg-amber-50 text-amber-700 border-amber-200/80";
    }
    if (act.includes("session") || act.includes("login") || act.includes("mfa") || act.includes("auth")) {
      return "bg-blue-50 text-blue-700 border-blue-200/80";
    }
    if (act.includes("config") || act.includes("rule") || act.includes("permission") || act.includes("published")) {
      return "bg-violet-50 text-violet-700 border-violet-200/80";
    }
    if (act.includes("sync") || act.includes("ingest")) {
      return "bg-cyan-50 text-cyan-700 border-cyan-200/80";
    }
    return "bg-emerald-50 text-emerald-700 border-emerald-200/80";
  };

  const getOutcomeBadgeStyle = (outcome: string = "") => {
    const out = outcome.toLowerCase();
    if (out === "failed") return "bg-rose-100 text-rose-800 border-rose-200";
    if (out === "warning") return "bg-amber-100 text-amber-800 border-amber-200";
    if (out === "success") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    return "bg-slate-100 text-slate-700 border-slate-200";
  };

  // Reset all filters
  const handleResetFilters = () => {
    setCategoryTab("ALL");
    setUserFilter("ALL");
    setActionFilter("ALL");
    setOutcomeFilter("ALL");
    setSearchQuery("");
    setAppliedSearch("");
    setDatePreset("7d");
    setCustomStartDate("");
    setCustomEndDate("");
    setPage(1);
  };

  // Apply search
  const handleApplySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedSearch(searchQuery);
    setPage(1);
  };

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return (
      categoryTab !== "ALL" ||
      userFilter !== "ALL" ||
      actionFilter !== "ALL" ||
      outcomeFilter !== "ALL" ||
      appliedSearch.trim() !== "" ||
      datePreset !== "7d"
    );
  }, [categoryTab, userFilter, actionFilter, outcomeFilter, appliedSearch, datePreset]);

  // User Initials helper
  const getUserInitials = (userName: string) => {
    if (!userName) return "SY";
    const parts = userName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Safe Metadata Formatter (masks sensitive fields)
  const getSanitizedMetadata = (log: AuditLogItem) => {
    const metadata: Record<string, any> = {
      event_id: log.id,
      timestamp_utc: log.timestamp,
      user_agent_or_actor: log.user,
      action: log.action,
      stage: log.stage || null,
      outcome: log.outcome || "Success",
      ip_address: log.ip_address || null
    };

    if (log.invoice_id) metadata.document_id = log.invoice_id;
    if (log.previous_status) metadata.previous_status = log.previous_status;
    if (log.new_status) metadata.new_status = log.new_status;
    if (log.approver_user_id) metadata.approver_user_id = log.approver_user_id;
    if (log.stage_id) metadata.stage_id = log.stage_id;
    if (log.remarks) metadata.reviewer_remarks = log.remarks;
    if (log.notes) metadata.details_notes = log.notes;

    return metadata;
  };

  const headerControls = (
    <div className="flex items-center gap-2">
      {/* Search Input in Top Toolbar */}
      <form onSubmit={handleApplySearch} className="relative w-44 sm:w-56">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
          <Search className="h-3.5 w-3.5" />
        </div>
        <input
          type="text"
          placeholder="Search audit logs..."
          value={searchQuery}
          onChange={(e) => {
            const val = e.target.value;
            setSearchQuery(val);
            if (!val.trim() && appliedSearch) {
              setAppliedSearch("");
              setPage(1);
            }
          }}
          className="w-full pl-8 pr-7 py-1 text-[10.5px] font-medium bg-white hover:bg-slate-50 border border-slate-200/90 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#003F28] focus:bg-white shadow-2xs transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setAppliedSearch("");
              setPage(1);
            }}
            className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-400 hover:text-slate-600"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </form>

      {/* Export Logs Button */}
      <button
        type="button"
        onClick={handleExportCSV}
        disabled={exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#003F28] hover:bg-[#004B32] text-white text-[10px] font-bold uppercase tracking-wide rounded-md shadow-sm transition-all disabled:opacity-60 cursor-pointer shrink-0"
      >
        {exporting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3 text-emerald-200" />
        )}
        <span>Export CSV</span>
      </button>

      {/* Refresh Button */}
      <button
        type="button"
        onClick={handleFullRefresh}
        disabled={refreshing}
        title="Refresh logs & statistics"
        className="h-7 w-7 flex items-center justify-center rounded-md bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer shrink-0"
      >
        <RotateCw className={`h-3 w-3 ${refreshing ? "animate-spin text-[#003F28]" : ""}`} />
      </button>
    </div>
  );

  return (
    <div className="w-full font-sans text-slate-800 p-0">
      
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-14 right-6 z-50 px-3 py-2 rounded-lg shadow-md border text-[11px] font-semibold flex items-center gap-2 animate-fadeIn transition-all duration-300 ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-900 border-emerald-300"
              : notification.type === "error"
              ? "bg-rose-50 text-rose-900 border-rose-300"
              : "bg-blue-50 text-blue-900 border-blue-300"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
          )}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 text-slate-400 hover:text-slate-700 text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Top Header Actions (Search, Export CSV, Refresh) mounted into Admin top panel via Portal */}
      {portalNode ? (
        createPortal(headerControls, portalNode)
      ) : (
        <div className="flex items-center justify-end mb-2.5">
          {headerControls}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. REDUCED COMPACT KPI SUMMARY CARDS */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-2.5">
        
        {/* Card 1: Total Events (Green) */}
        <div
          onClick={() => {
            setCategoryTab("ALL");
            setOutcomeFilter("ALL");
            setPage(1);
          }}
          className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-2xs hover:shadow-xs hover:border-emerald-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider">
              Total Events
            </span>
            <div className="h-5 w-5 rounded bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Layers className="h-3 w-3" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {summaryLoading ? "—" : summary?.total_events.count.toLocaleString() ?? "0"}
            </span>
            {summary?.total_events.delta_pct !== null && (
              <span
                className={`text-[8.5px] font-bold flex items-center gap-0.5 px-1 py-0.25 rounded ${
                  (summary?.total_events.delta_pct ?? 0) >= 0
                    ? "text-emerald-700 bg-emerald-50"
                    : "text-slate-600 bg-slate-100"
                }`}
              >
                {(summary?.total_events.delta_pct ?? 0) >= 0 ? (
                  <TrendingUp className="h-2.5 w-2.5" />
                ) : (
                  <TrendingDown className="h-2.5 w-2.5" />
                )}
                {Math.abs(summary?.total_events.delta_pct ?? 0)}%
              </span>
            )}
          </div>
          <p className="text-[9px] text-slate-400 font-medium mt-0.5 truncate leading-tight">
            Recorded in selected {datePreset === "24h" ? "24h" : datePreset === "7d" ? "7 days" : "window"}
          </p>
        </div>

        {/* Card 2: Failed Login Attempts (Red) */}
        <div
          onClick={() => {
            setOutcomeFilter("Failed");
            setActionFilter("ALL");
            setPage(1);
          }}
          className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-2xs hover:shadow-xs hover:border-rose-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider">
              Failed Logins
            </span>
            <div className="h-5 w-5 rounded bg-rose-50 text-rose-700 flex items-center justify-center">
              <ShieldAlert className="h-3 w-3" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-base sm:text-lg font-black text-rose-600 tracking-tight">
              {summaryLoading ? "—" : summary?.failed_logins.count.toLocaleString() ?? "0"}
            </span>
            {summary?.failed_logins.delta_pct !== null && (
              <span
                className={`text-[8.5px] font-bold flex items-center gap-0.5 px-1 py-0.25 rounded ${
                  (summary?.failed_logins.delta_pct ?? 0) > 0
                    ? "text-rose-700 bg-rose-50"
                    : "text-emerald-700 bg-emerald-50"
                }`}
              >
                {(summary?.failed_logins.delta_pct ?? 0) > 0 ? (
                  <TrendingUp className="h-2.5 w-2.5" />
                ) : (
                  <TrendingDown className="h-2.5 w-2.5" />
                )}
                {Math.abs(summary?.failed_logins.delta_pct ?? 0)}%
              </span>
            )}
          </div>
          <p className="text-[9px] text-slate-400 font-medium mt-0.5 truncate leading-tight">
            Auth errors & lockouts
          </p>
        </div>

        {/* Card 3: Security Events (Blue) */}
        <div
          onClick={() => {
            setCategoryTab("SECURITY");
            setOutcomeFilter("ALL");
            setPage(1);
          }}
          className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-2xs hover:shadow-xs hover:border-blue-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider">
              Security Events
            </span>
            <div className="h-5 w-5 rounded bg-blue-50 text-blue-700 flex items-center justify-center">
              <Lock className="h-3 w-3" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {summaryLoading ? "—" : summary?.security_events.count.toLocaleString() ?? "0"}
            </span>
            <span className="text-[8.5px] font-bold text-blue-700 bg-blue-50 px-1 py-0.25 rounded">
              MFA & Sessions
            </span>
          </div>
          <p className="text-[9px] text-slate-400 font-medium mt-0.5 truncate leading-tight">
            MFA verifies & active sessions
          </p>
        </div>

        {/* Card 4: Administrative Changes (Violet) */}
        <div
          onClick={() => {
            setCategoryTab("CONFIG");
            setOutcomeFilter("ALL");
            setPage(1);
          }}
          className="bg-white rounded-lg border border-slate-200/90 p-2.5 shadow-2xs hover:shadow-xs hover:border-violet-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider">
              Admin Changes
            </span>
            <div className="h-5 w-5 rounded bg-violet-50 text-violet-700 flex items-center justify-center">
              <Sliders className="h-3 w-3" />
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              {summaryLoading ? "—" : summary?.admin_changes.count.toLocaleString() ?? "0"}
            </span>
            <span className="text-[8.5px] font-bold text-violet-700 bg-violet-50 px-1 py-0.25 rounded">
              Policy & Rules
            </span>
          </div>
          <p className="text-[9px] text-slate-400 font-medium mt-0.5 truncate leading-tight">
            Matrix, RACI, retention changes
          </p>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. EVENT CATEGORIES TABS */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-1 border-b border-slate-200/80 mb-2.5 overflow-x-auto no-scrollbar">
        {[
          { id: "ALL", label: "All Events", icon: Layers },
          { id: "DATA_SYNC", label: "Data Syncs", icon: Database },
          { id: "APPROVAL", label: "Approvals", icon: CheckCircle2 },
          { id: "SECURITY", label: "Security & Sessions", icon: ShieldCheck },
          { id: "CONFIG", label: "Configuration Changes", icon: Sliders }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = categoryTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCategoryTab(tab.id);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? "border-[#003F28] text-[#003F28] bg-slate-50/60"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50/30"
              }`}
            >
              <Icon className={`h-3 w-3 ${isActive ? "text-[#003F28]" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. COMPACT AUDIT LOGS TABLE */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-lg border border-slate-200/90 shadow-2xs overflow-hidden mb-2.5 w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2 whitespace-nowrap w-[170px]">Timestamp</th>
                <th className="px-4 py-2 whitespace-nowrap w-[180px]">User / Agent</th>
                <th className="px-4 py-2 whitespace-nowrap w-[190px]">Action</th>
                <th className="px-4 py-2 whitespace-nowrap w-[130px]">Stage</th>
                <th className="px-4 py-2 whitespace-nowrap w-[120px]">IP Address</th>
                <th className="px-4 py-2 whitespace-nowrap">Details</th>
                <th className="px-4 py-2 text-right whitespace-nowrap w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10.5px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <div className="inline-flex flex-col items-center justify-center gap-1.5">
                      <Loader2 className="h-5 w-5 text-[#003F28] animate-spin" />
                      <span className="text-[11px] text-slate-500 font-semibold tracking-wide">
                        Loading Audit Records...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <div className="max-w-md mx-auto flex flex-col items-center justify-center">
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center mb-2 text-slate-400">
                        <FileText className="h-4 w-4" />
                      </div>
                      <h3 className="text-xs font-bold text-slate-800">No Audit Events Found</h3>
                      <p className="text-[10.5px] text-slate-500 mt-0.5">
                        No events match the current filter criteria or date range.
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="mt-2.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold rounded transition-colors cursor-pointer"
                        >
                          Clear All Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isDrawerActive = activeLog?.id === log.id;
                  const isSystem = log.user.toLowerCase().includes("system") || log.user.toLowerCase().includes("policy");

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setActiveLog(log)}
                      className={`transition-colors duration-100 cursor-pointer h-10 ${
                        isDrawerActive
                          ? "bg-emerald-50/50"
                          : "hover:bg-slate-50/80"
                      }`}
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-[10.5px] text-slate-600">
                        {formatLocalTimestamp(log.timestamp)}
                      </td>

                      {/* User / Agent */}
                      <td className="px-4 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`h-5 w-5 rounded flex items-center justify-center text-[9px] font-black shrink-0 ${
                              isSystem
                                ? "bg-slate-100 text-slate-600"
                                : "bg-emerald-100 text-[#003F28]"
                            }`}
                          >
                            {isSystem ? <Server className="h-2.5 w-2.5" /> : getUserInitials(log.user)}
                          </div>
                          <span className="font-bold text-slate-800 truncate max-w-[150px] text-[11px]" title={log.user}>
                            {log.user}
                          </span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${getActionBadgeStyle(
                            log.action,
                            log.outcome || ""
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Stage */}
                      <td className="px-4 py-2 whitespace-nowrap text-[10.5px] font-semibold text-slate-600 truncate">
                        {log.stage || "—"}
                      </td>

                      {/* IP Address */}
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-[10px] text-slate-700">
                        {log.ip_address ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {log.ip_address}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Details (Strictly one single line) */}
                      <td className="px-4 py-2 text-slate-700 font-medium text-[11px] whitespace-nowrap truncate" title={log.notes || log.details || ""}>
                        {log.notes || log.details || "—"}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => setActiveLog(log)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-[#003F28] hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Details</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 6. COMPACT PAGINATION TOOLBAR */}
        {/* ------------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-3 py-2 bg-slate-50/60 border-t border-slate-200/80 text-[10px]">
          <div className="text-slate-500 font-medium">
            Showing{" "}
            <span className="font-bold text-slate-800">
              {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-bold text-slate-800">
              {Math.min(page * pageSize, totalCount)}
            </span>{" "}
            of <span className="font-bold text-slate-800">{totalCount.toLocaleString()}</span> records
          </div>

          <div className="flex items-center gap-2.5">
            {/* Rows Per Page */}
            <div className="flex items-center gap-1">
              <span className="text-slate-400 font-medium text-[9.5px]">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value, 10));
                  setPage(1);
                }}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[9.5px] font-bold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Page Navigation Controls */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-20 transition-colors"
                title="First Page"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-20 transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <span className="px-2 py-0.5 font-bold text-[9.5px] bg-white border border-slate-200 rounded shadow-2xs text-slate-800">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-20 transition-colors"
                title="Next Page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-20 transition-colors"
                title="Last Page"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 7. COMPACT AUDIT RETENTION POLICY SECTION */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white rounded-lg border border-slate-200/90 p-3 shadow-2xs mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#003F28]" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Audit Retention Policy
              </h2>
            </div>
            <p className="text-[9.5px] text-slate-500 font-medium mt-0.5">
              Configure how long audit logs are retained in the system before automated cleanup.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-medium">Current:</span>
              <span className="px-1.5 py-0.5 text-[9.5px] font-bold rounded bg-emerald-50 text-[#003F28] border border-emerald-200">
                {retentionInfo.retention_days === 0
                  ? "Indefinite (Keep All)"
                  : `${retentionInfo.retention_days} Days ${
                      retentionInfo.retention_days === 7 ? "(Default: 1 Week)" : ""
                    }`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={retentionDraft}
                onChange={(e) => {
                  const val = e.target.value;
                  setRetentionDraft(val);
                  setIsCustomRetention(val === "custom");
                  if (val !== "custom") setCustomDays("");
                }}
                className="text-[10px] font-bold bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#003F28] cursor-pointer"
              >
                <option value="7">7 Days (1 Week) - Default</option>
                <option value="14">14 Days (2 Weeks)</option>
                <option value="30">30 Days (1 Month)</option>
                <option value="90">90 Days (3 Months)</option>
                <option value="180">180 Days (6 Months)</option>
                <option value="365">365 Days (1 Year)</option>
                <option value="custom">Custom Days...</option>
                <option value="0">Indefinite (Keep All)</option>
              </select>

              {isCustomRetention && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    placeholder="Days"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="w-16 text-[10px] font-medium bg-white border border-slate-300 rounded px-1.5 py-1 text-slate-700 focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-400">days</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveRetention}
                disabled={retentionSaving || (isCustomRetention && (!customDays || parseInt(customDays, 10) <= 0))}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-[#003F28] hover:bg-[#004B32] disabled:opacity-50 rounded shadow-2xs transition-all cursor-pointer"
              >
                {retentionSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                <span>Save Policy</span>
              </button>
            </div>
          </div>
        </div>

        {/* Expired Logs Notice & Prune Button */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            {retentionInfo.expired_logs_count > 0 ? (
              <span className="font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded flex items-center gap-1 text-[9.5px]">
                <AlertTriangle className="h-3 w-3 text-amber-600" />
                <span>
                  {retentionInfo.expired_logs_count.toLocaleString()} expired logs (older than{" "}
                  {retentionInfo.retention_days} days)
                </span>
              </span>
            ) : (
              <span className="text-slate-400 font-medium italic text-[9.5px]">
                All records within retention window ({retentionInfo.total_logs.toLocaleString()} total logs)
              </span>
            )}
          </div>

          {retentionInfo.expired_logs_count > 0 && (
            <button
              type="button"
              onClick={() => setPruneModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded shadow-2xs transition-all cursor-pointer"
            >
              <Trash2 className="h-3 w-3 text-rose-600" />
              <span>Prune Expired</span>
            </button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 8. COMPACT EVENT DETAILS SIDE DRAWER */}
      {/* ------------------------------------------------------------- */}
      {activeLog && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs transition-opacity"
            onClick={() => setActiveLog(null)}
          />

          {/* Drawer Body - fits vertically with 0 scrolling on normal screens */}
          <div className="relative w-full max-w-[380px] sm:max-w-[400px] bg-white h-full shadow-2xl z-10 flex flex-col border-l border-slate-200 animate-slideLeft">
            
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-wider truncate ${getActionBadgeStyle(
                    activeLog.action,
                    activeLog.outcome || ""
                  )}`}
                >
                  {activeLog.action}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${getOutcomeBadgeStyle(
                    activeLog.outcome || "Success"
                  )}`}
                >
                  {activeLog.outcome || "Success"}
                </span>
              </div>

              {/* Prev / Next & Close */}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={handlePrevRecord}
                  disabled={activeIndex <= 0}
                  title="Previous event"
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 disabled:opacity-20 transition-colors"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextRecord}
                  disabled={activeIndex >= logs.length - 1}
                  title="Next event"
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 disabled:opacity-20 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLog(null)}
                  className="h-7 w-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer ml-1"
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 text-[11px]">
              
              {/* Event ID + Timestamp Row */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded px-2.5 py-1.5 text-[10.5px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-semibold uppercase text-[9.5px]">ID</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">#{activeLog.id}</span>
                  <button
                    type="button"
                    onClick={(e) => handleCopyId(activeLog.id, e)}
                    className="text-slate-400 hover:text-slate-700 transition-colors"
                    title="Copy Event ID"
                  >
                    {copiedId === activeLog.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                <div className="font-mono text-slate-600 text-[10.5px]">
                  {formatLocalTimestamp(activeLog.timestamp)}
                </div>
              </div>

              {/* Event Description */}
              <div>
                <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Description
                </div>
                <div className="p-2.5 rounded bg-slate-50/70 border border-slate-200/80 text-slate-700 leading-snug font-medium text-[11px]">
                  {activeLog.notes || activeLog.details || "No narrative details recorded for this event."}
                </div>
              </div>

              {/* Event Attributes 2-col Grid */}
              <div>
                <div className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Attributes
                </div>
                <div className="grid grid-cols-2 gap-2 bg-slate-50/50 border border-slate-200/80 rounded-md p-2.5 text-[10.5px]">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">User / Actor</span>
                    <span className="font-bold text-slate-900 truncate block text-[11px]" title={activeLog.user}>{activeLog.user}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">IP Address</span>
                    <span className="font-mono text-slate-800 block text-[11px]">{activeLog.ip_address || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Stage / Module</span>
                    <span className="font-medium text-slate-800 block text-[11px]">{activeLog.stage || "—"}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase block">Document ID</span>
                    <span className="font-mono font-bold text-emerald-700 block text-[11px]">{activeLog.invoice_id || "—"}</span>
                  </div>
                  {(activeLog.previous_status || activeLog.new_status) && (
                    <div className="col-span-2 pt-1.5 border-t border-slate-200/60 flex items-center gap-1.5">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">Status:</span>
                      <span className="text-slate-600 line-through text-[10px]">{activeLog.previous_status || "—"}</span>
                      <span className="text-slate-400 text-[9px]">→</span>
                      <span className="font-bold text-slate-900 text-[10.5px]">{activeLog.new_status || "—"}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Reviewer Remarks (if present) */}
              {activeLog.remarks && (
                <div className="p-2 bg-amber-50/70 border border-amber-200/80 rounded text-[10.5px] text-slate-800 leading-tight">
                  <span className="font-bold text-amber-900 block text-[9px] uppercase">Reviewer Remarks:</span>
                  {activeLog.remarks}
                </div>
              )}

              {/* Structured Audit Metadata */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                      Metadata
                    </span>
                    <div className="flex items-center bg-slate-100 rounded p-0.5 border border-slate-200 text-[9px]">
                      <button
                        type="button"
                        onClick={() => setMetadataView("props")}
                        className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                          metadataView === "props" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Properties
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetadataView("json")}
                        className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                          metadataView === "json" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        JSON
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyMetadata(getSanitizedMetadata(activeLog))}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#003F28] hover:text-[#004B32] transition-colors cursor-pointer"
                  >
                    {copiedMetadata ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedMetadata ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                {metadataView === "props" ? (
                  <div className="bg-slate-50 border border-slate-200/80 rounded p-2 text-[10px] font-mono divide-y divide-slate-100 max-h-36 overflow-y-auto">
                    {Object.entries(getSanitizedMetadata(activeLog)).map(([k, v]) => (
                      <div key={k} className="py-1 flex items-center justify-between gap-2">
                        <span className="text-slate-500">{k}:</span>
                        <span className="text-slate-900 font-bold truncate max-w-[210px]">{String(v ?? "null")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-900 text-slate-100 rounded p-2.5 font-mono text-[10px] max-h-36 overflow-y-auto shadow-inner">
                    <pre className="whitespace-pre-wrap break-all leading-relaxed">
                      {JSON.stringify(getSanitizedMetadata(activeLog), null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
              <span>DAAS Immutable Ledger</span>
              <button
                type="button"
                onClick={() => setActiveLog(null)}
                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded transition-colors cursor-pointer text-[10px]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 9. PRUNE EXPIRED LOGS CONFIRMATION MODAL */}
      {/* ------------------------------------------------------------- */}
      {pruneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setPruneModalOpen(false)}
          />
          <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl border border-slate-200 p-5 z-10 animate-scaleUp">
            <div className="h-8 w-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-2.5">
              <Trash2 className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Permanently Prune Expired Audit Logs?
            </h3>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
              This action will permanently delete{" "}
              <strong className="text-rose-700 font-bold">
                {retentionInfo.expired_logs_count.toLocaleString()} records
              </strong>{" "}
              older than your retention window of{" "}
              <strong>{retentionInfo.retention_days} days</strong>. Active logs remain untouched.
            </p>
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800 mt-2.5 font-medium">
              ⚠️ This operation is irreversible and will be logged in the audit ledger.
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPruneModalOpen(false)}
                disabled={pruning}
                className="px-3 py-1.5 text-[10.5px] font-bold text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePruneExpired}
                disabled={pruning}
                className="flex items-center gap-1 px-3 py-1.5 text-[10.5px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                {pruning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                <span>Confirm & Prune</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 10. CUSTOM DATE RANGE MODAL */}
      {/* ------------------------------------------------------------- */}
      {showCustomDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setShowCustomDateModal(false)}
          />
          <div className="relative w-full max-w-xs bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-10 animate-scaleUp">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-[#003F28]" />
                Custom Date Window
              </h3>
              <button
                onClick={() => setShowCustomDateModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2.5 my-3 text-[10.5px]">
              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2 py-1 text-[10.5px] font-medium border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                />
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2 py-1 text-[10.5px] font-medium border border-slate-200 rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-[#003F28]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100 text-[10.5px]">
              <button
                type="button"
                onClick={() => {
                  setDatePreset("7d");
                  setShowCustomDateModal(false);
                }}
                className="px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomDateModal(false);
                  setPage(1);
                  fetchLogs();
                  fetchSummary();
                }}
                disabled={!customStartDate && !customEndDate}
                className="px-3 py-1 text-[10px] font-bold text-white bg-[#003F28] hover:bg-[#004B32] disabled:opacity-40 rounded shadow-xs"
              >
                Apply Range
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
