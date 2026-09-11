import React, { useState, useMemo } from "react";
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
  Building2, 
  UserCheck, 
  DollarSign, 
  Layers,
  ArrowUpDown,
  X,
  Filter
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

export default function ApprovedDocumentsPage({
  documents,
  onViewDocument,
  currentUserRole = "employee",
  currentUserEmail = "",
  currentUserUsername = "",
  onRefreshDocs
}: ApprovedDocumentsPageProps) {
  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDivision, setSelectedDivision] = useState("all");
  const [selectedDocType, setSelectedDocType] = useState("all");
  const [selectedApprover, setSelectedApprover] = useState("all");
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // Sorting & Pagination states
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "vendor" | "name">("date_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Status check helper: strictly match Approved / Settled / Paid
  const isApproved = (doc: DbInvoice): boolean => {
    const s = (doc.status || "").toLowerCase().trim();
    return s.includes("approved") || s.includes("settled") || s.includes("paid") || s.includes("ready for payment");
  };

  // Base list: strictly approved documents
  const approvedDocs = useMemo(() => {
    return documents.filter(isApproved);
  }, [documents]);

  // Derived filter options
  const divisions = useMemo(() => {
    const set = new Set(approvedDocs.map(d => (d.division || "").toUpperCase().trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [approvedDocs]);

  const docTypes = useMemo(() => {
    const set = new Set(approvedDocs.map(d => (d.document_type || "").toUpperCase().trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [approvedDocs]);

  const approvers = useMemo(() => {
    const set = new Set<string>();
    approvedDocs.forEach(d => {
      if (d.assigned_approver) {
        d.assigned_approver.split(",").forEach(a => {
          const trimmed = a.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    });
    // Ensure the 4 primary approvers are present if in list
    ["YUVASREE", "Nattudurai", "VIGNESH", "VARUNAN"].forEach(a => {
      if (!set.has(a) && approvedDocs.some(d => (d.assigned_approver || "").includes(a))) {
        set.add(a);
      }
    });
    return Array.from(set).sort();
  }, [approvedDocs]);

  // Executive KPI summary calculations
  const kpiStats = useMemo(() => {
    let totalGrossValue = 0;
    let thisMonthCount = 0;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const divisionCounts: Record<string, number> = {};

    approvedDocs.forEach(doc => {
      const amt = Number(doc.amount || 0);
      totalGrossValue += isNaN(amt) ? 0 : amt;

      const dStr = doc.invoice_date || doc.created_at;
      if (dStr) {
        const d = new Date(dStr);
        if (!isNaN(d.getTime()) && d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          thisMonthCount++;
        }
      }

      const div = (doc.division || "OTHER").toUpperCase().trim();
      divisionCounts[div] = (divisionCounts[div] || 0) + 1;
    });

    let topDivision = "N/A";
    let maxDivCount = 0;
    Object.entries(divisionCounts).forEach(([div, count]) => {
      if (count > maxDivCount) {
        maxDivCount = count;
        topDivision = div;
      }
    });

    return {
      totalCount: approvedDocs.length,
      totalGrossValue,
      thisMonthCount,
      topDivision: topDivision !== "N/A" ? `${topDivision} (${maxDivCount})` : "N/A"
    };
  }, [approvedDocs]);

  // Time filter check
  const matchesTimeFilter = (doc: DbInvoice): boolean => {
    if (timeFilter === "all") return true;
    const dateVal = doc.invoice_date || doc.created_at;
    if (!dateVal) return false;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (timeFilter === "today") {
      return d >= todayStart;
    }
    if (timeFilter === "this_week") {
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - todayStart.getDay());
      return d >= weekStart;
    }
    if (timeFilter === "this_month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= monthStart;
    }
    if (timeFilter === "custom") {
      if (customStartDate) {
        const start = new Date(customStartDate);
        if (d < start) return false;
      }
      if (customEndDate) {
        const end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    }
    return true;
  };

  // Filtered and sorted documents list
  const filteredAndSortedDocs = useMemo(() => {
    const list = approvedDocs.filter(doc => {
      // Division filter
      if (selectedDivision !== "all") {
        const div = (doc.division || "").toUpperCase().trim();
        if (div !== selectedDivision.toUpperCase().trim()) return false;
      }

      // Document Type filter
      if (selectedDocType !== "all") {
        const docType = (doc.document_type || "").toUpperCase().trim();
        if (docType !== selectedDocType.toUpperCase().trim()) return false;
      }

      // Approver filter
      if (selectedApprover !== "all") {
        const app = (doc.assigned_approver || "").toLowerCase();
        if (!app.includes(selectedApprover.toLowerCase())) return false;
      }

      // Time filter
      if (!matchesTimeFilter(doc)) return false;

      // Full-text Search filter
      const search = searchTerm.toLowerCase().trim();
      if (!search) return true;

      const vendor = (doc.vendor_name || "").toLowerCase();
      const invNum = (doc.invoice_number || "").toLowerCase();
      const trackId = (doc.tracking_id || "").toLowerCase();
      const id = String(doc.id || "").toLowerCase();
      const po = (doc.po_number || "").toLowerCase();
      const approver = (doc.assigned_approver || "").toLowerCase();
      const div = (doc.division || "").toLowerCase();
      const type = (doc.document_type || "").toLowerCase();

      return (
        vendor.includes(search) ||
        invNum.includes(search) ||
        trackId.includes(search) ||
        id.includes(search) ||
        po.includes(search) ||
        approver.includes(search) ||
        div.includes(search) ||
        type.includes(search)
      );
    });

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "date_desc") {
        const da = new Date(a.invoice_date || a.created_at).getTime() || 0;
        const db = new Date(b.invoice_date || b.created_at).getTime() || 0;
        return db - da;
      }
      if (sortBy === "date_asc") {
        const da = new Date(a.invoice_date || a.created_at).getTime() || 0;
        const db = new Date(b.invoice_date || b.created_at).getTime() || 0;
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
  }, [approvedDocs, selectedDivision, selectedDocType, selectedApprover, timeFilter, customStartDate, customEndDate, searchTerm, sortBy]);

  // Reset page on filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDivision, selectedDocType, selectedApprover, timeFilter, customStartDate, customEndDate, sortBy, pageSize]);

  // Pagination slicing
  const totalPages = Math.ceil(filteredAndSortedDocs.length / pageSize) || 1;
  const paginatedDocs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedDocs.slice(start, start + pageSize);
  }, [filteredAndSortedDocs, currentPage, pageSize]);

  // Format currency in Indian format
  const formatCurrency = (amount: number | string) => {
    const num = Number(amount || 0);
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(num);
  };

  // CSV Export handler
  const handleExportCSV = () => {
    if (filteredAndSortedDocs.length === 0) return;
    const headers = ["Document ID", "Invoice Number", "Vendor Name", "Document Type", "Division", "Amount", "Currency", "Status", "Approver", "Approved Date", "PO Number"];
    const rows = filteredAndSortedDocs.map(d => [
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

  const hasActiveFilters = searchTerm || selectedDivision !== "all" || selectedDocType !== "all" || selectedApprover !== "all" || timeFilter !== "all";

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedDivision("all");
    setSelectedDocType("all");
    setSelectedApprover("all");
    setTimeFilter("all");
    setCustomStartDate("");
    setCustomEndDate("");
  };

  return (
    <div className="space-y-4 pb-12">
      {/* 1. TOP BANNER / HEADER */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 shadow-2xs">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight font-display">
                Approved Documents
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase tracking-wider">
                {kpiStats.totalCount} SETTLED
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Repository of verified, fully authorized, and settled enterprise records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          {onRefreshDocs && (
            <button
              type="button"
              onClick={onRefreshDocs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition shadow-2xs cursor-pointer"
              title="Refresh approved documents"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredAndSortedDocs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#003F28] hover:bg-[#002F1E] text-white text-xs font-semibold transition shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Export filtered records to CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Card 1: Total Approved Documents */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Total Approved
            </span>
            <div className="h-6 w-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-display mt-1">
            {kpiStats.totalCount}
          </div>
          <div className="text-[9px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
            <span>● 100% Authorized & Complete</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500 rounded-b-xl" />
        </div>

        {/* Card 2: Total Gross Value */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Approved Value
            </span>
            <div className="h-6 w-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
              <DollarSign className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-lg md:text-xl font-black text-slate-900 font-display mt-1 truncate">
            {formatCurrency(kpiStats.totalGrossValue)}
          </div>
          <div className="text-[9px] font-semibold text-slate-500 mt-1">
            Total Settled Portfolio
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 rounded-b-xl" />
        </div>

        {/* Card 3: Approved This Month */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              This Month
            </span>
            <div className="h-6 w-6 rounded-md bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200">
              <Calendar className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 font-display mt-1">
            {kpiStats.thisMonthCount}
          </div>
          <div className="text-[9px] font-semibold text-purple-600 mt-1">
            Processed in current cycle
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-purple-500 rounded-b-xl" />
        </div>

        {/* Card 4: Top Division */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Top Division
            </span>
            <div className="h-6 w-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
              <Building2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="text-base md:text-lg font-black text-slate-900 font-display mt-1 truncate">
            {kpiStats.topDivision}
          </div>
          <div className="text-[9px] font-semibold text-amber-700 mt-1">
            Highest settled volume
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-amber-500 rounded-b-xl" />
        </div>
      </div>

      {/* 3. FILTERS & SEARCH CONTROLS */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Document Name, Invoice #, ID, Vendor, PO..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#003F28] focus:ring-1 focus:ring-[#003F28] transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Division Filter */}
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
            >
              <option value="all">All Divisions</option>
              {divisions.map(div => (
                <option key={div} value={div}>{div}</option>
              ))}
            </select>

            {/* Document Type Filter */}
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
            >
              <option value="all">All Doc Types</option>
              {docTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>

            {/* Approver Filter */}
            <select
              value={selectedApprover}
              onChange={(e) => setSelectedApprover(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
            >
              <option value="all">All Approvers</option>
              {approvers.map(app => (
                <option key={app} value={app}>{app}</option>
              ))}
            </select>

            {/* Time Filter */}
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>

            {/* Sort Order */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="amount_desc">Amount (High to Low)</option>
              <option value="amount_asc">Amount (Low to High)</option>
              <option value="vendor">Vendor Name</option>
              <option value="name">Document Name</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-xs font-bold transition cursor-pointer"
                title="Clear all filters"
              >
                <span>Clear Filters</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Range Picker when selected */}
        {timeFilter === "custom" && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
            <span className="font-semibold">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#003F28]"
            />
            <span className="font-semibold ml-2">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#003F28]"
            />
          </div>
        )}
      </div>

      {/* 4. APPROVED DOCUMENTS TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold tracking-wider uppercase text-[10px]">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Document ID</th>
                <th className="py-2.5 px-3">Document / Invoice #</th>
                <th className="py-2.5 px-3">Vendor / Party</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Division</th>
                <th className="py-2.5 px-3">Approved Date</th>
                <th className="py-2.5 px-3">Approver</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center w-20">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedDocs.length > 0 ? (
                paginatedDocs.map((doc, idx) => {
                  const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                  const dateStr = doc.invoice_date || doc.created_at;
                  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString("en-IN", {
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
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[10px]">
                        {globalIdx}
                      </td>

                      {/* Document ID */}
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        <span className="text-[#003F28] group-hover:underline">
                          {doc.id}
                        </span>
                      </td>

                      {/* Document Name / Invoice Number */}
                      <td className="py-2.5 px-3 font-semibold text-slate-900 max-w-[180px] truncate">
                        {doc.invoice_number || doc.file_name || doc.id}
                      </td>

                      {/* Vendor / Party */}
                      <td className="py-2.5 px-3 text-slate-700 max-w-[180px] truncate" title={doc.vendor_name}>
                        {doc.vendor_name || "-"}
                      </td>

                      {/* Document Type */}
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {doc.document_type || "AP INVOICE"}
                        </span>
                      </td>

                      {/* Division */}
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {doc.division || "VCC"}
                        </span>
                      </td>

                      {/* Approved Date */}
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {formattedDate}
                      </td>

                      {/* Approver */}
                      <td className="py-2.5 px-3 text-slate-700 max-w-[140px] truncate" title={doc.assigned_approver || "System Verified"}>
                        <div className="flex items-center gap-1">
                          <UserCheck className="h-3 w-3 text-emerald-600 shrink-0" />
                          <span className="truncate">{doc.assigned_approver || "Verified"}</span>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(doc.amount)}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-[#E7F9F1] text-[#059669] border border-[#A7F3D0]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#059669]" />
                          {doc.status || "APPROVED"}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-center" onClick={(e) => { e.stopPropagation(); onViewDocument(doc.id); }}>
                        <button
                          type="button"
                          className="p-1 rounded-md text-slate-500 hover:text-[#003F28] hover:bg-slate-100 transition"
                          title="View Document Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                        <FileText className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-800">
                        No approved documents found
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {hasActiveFilters 
                          ? "No documents match the specified search or filter criteria."
                          : "There are currently no approved or settled documents in the repository."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearAllFilters}
                          className="mt-3 px-3 py-1.5 rounded-lg bg-[#003F28] text-white text-xs font-semibold hover:bg-[#002F1E] transition cursor-pointer"
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

        {/* 5. PAGINATION FOOTER */}
        {filteredAndSortedDocs.length > 0 && (
          <div className="bg-slate-50/70 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Showing</span>
              <span className="font-bold text-slate-900">
                {(currentPage - 1) * pageSize + 1}
              </span>
              <span>to</span>
              <span className="font-bold text-slate-900">
                {Math.min(currentPage * pageSize, filteredAndSortedDocs.length)}
              </span>
              <span>of</span>
              <span className="font-bold text-slate-900">
                {filteredAndSortedDocs.length}
              </span>
              <span>approved records</span>

              <span className="text-slate-300 mx-1">|</span>

              <span className="text-slate-500">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 focus:outline-none focus:border-[#003F28] cursor-pointer"
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
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-600 cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft className="h-4 w-4" />
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
                      className={`h-7 w-7 rounded-lg text-xs font-bold transition cursor-pointer ${
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
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition text-slate-600 cursor-pointer"
                title="Next Page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
