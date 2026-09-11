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
  UserCheck, 
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

const MONTH_NAMES = [
  { value: "all", label: "All Months" },
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
];

export default function ApprovedDocumentsPage({
  documents,
  onViewDocument,
  currentUserRole = "employee",
  currentUserEmail = "",
  currentUserUsername = "",
  onRefreshDocs
}: ApprovedDocumentsPageProps) {
  // Primary dedicated filters: Year, Month, Doc Type & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedDocType, setSelectedDocType] = useState<string>("all");

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

  // Date helper
  const getDocDate = (doc: DbInvoice): Date | null => {
    const dateVal = doc.invoice_date || doc.created_at;
    if (!dateVal) return null;
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
  };

  // Available Years dynamically extracted from approved documents
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    approvedDocs.forEach(d => {
      const dt = getDocDate(d);
      if (dt) {
        years.add(String(dt.getFullYear()));
      }
    });
    if (years.size === 0) {
      years.add(String(new Date().getFullYear()));
    }
    return Array.from(years).sort().reverse();
  }, [approvedDocs]);

  // Available Document Types dynamically extracted from approved documents
  const availableDocTypes = useMemo(() => {
    const set = new Set(approvedDocs.map(d => (d.document_type || "").toUpperCase().trim()).filter(Boolean));
    return Array.from(set).sort();
  }, [approvedDocs]);

  // Filtered and sorted documents list
  const filteredAndSortedDocs = useMemo(() => {
    const list = approvedDocs.filter(doc => {
      const dt = getDocDate(doc);

      // 1. Year Filter
      if (selectedYear !== "all") {
        if (!dt || String(dt.getFullYear()) !== selectedYear) return false;
      }

      // 2. Month Filter
      if (selectedMonth !== "all") {
        if (!dt || String(dt.getMonth()) !== selectedMonth) return false;
      }

      // 3. Document Type Filter
      if (selectedDocType !== "all") {
        const docType = (doc.document_type || "").toUpperCase().trim();
        if (docType !== selectedDocType.toUpperCase().trim()) return false;
      }

      // 4. Full-text Search Filter
      const search = searchTerm.toLowerCase().trim();
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

    // Sorting
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
  }, [approvedDocs, selectedYear, selectedMonth, selectedDocType, searchTerm, sortBy]);

  // Reset pagination on filter change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedYear, selectedMonth, selectedDocType, sortBy, pageSize]);

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

  const hasActiveFilters = Boolean(
    searchTerm || 
    selectedYear !== "all" || 
    selectedMonth !== "all" || 
    selectedDocType !== "all"
  );

  const clearAllFilters = () => {
    setSearchTerm("");
    setSelectedYear("all");
    setSelectedMonth("all");
    setSelectedDocType("all");
  };

  return (
    <div className="space-y-3 pb-8">
      {/* 1. TOP HEADER BANNER (Reduced font size, compact & professional) */}
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
                {approvedDocs.length} Settled
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Verified enterprise records filtered by Year, Month, and Document Type
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {onRefreshDocs && (
            <button
              type="button"
              onClick={onRefreshDocs}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold transition shadow-2xs cursor-pointer"
              title="Refresh approved documents"
            >
              <RefreshCw className="h-3 w-3 text-slate-500" />
              <span>Refresh</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredAndSortedDocs.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#003F28] hover:bg-[#002F1E] text-white text-[11px] font-semibold transition shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            title="Export filtered records to CSV"
          >
            <Download className="h-3 w-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* 2. DEDICATED PROFESSIONAL FILTERS: YEAR, MONTH, DOC TYPE & SEARCH */}
      <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Document Name, Invoice #, Vendor, ID..."
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

          {/* Core Dedicated Filters: Year, Month, Doc Type */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Filter 1: Year */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="all">All Years</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Filter 2: Month */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Filter 3: Document Type */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Doc Type:</span>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="bg-transparent text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[140px] truncate"
              >
                <option value="all">All Doc Types</option>
                {availableDocTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Sort Order */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
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

            {/* Clear Filters button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 text-[10px] font-bold transition cursor-pointer"
                title="Clear all active filters"
              >
                <span>Reset</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Summary Bar */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10.5px] text-slate-500">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-slate-800 font-bold">{filteredAndSortedDocs.length}</strong> of {approvedDocs.length} approved documents
            </span>
            {hasActiveFilters && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-semibold">
                <Filter className="h-2.5 w-2.5" /> Filtered View
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400">
            Click any row to view complete document details
          </div>
        </div>
      </div>

      {/* 3. COMPACT APPROVED DOCUMENTS TABLE */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-2xs overflow-hidden">
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
              {paginatedDocs.length > 0 ? (
                paginatedDocs.map((doc, idx) => {
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
                        {hasActiveFilters 
                          ? "No documents match the selected Year, Month, Doc Type, or Search term."
                          : "There are currently no approved documents in the repository."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearAllFilters}
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

        {/* 4. COMPACT PAGINATION FOOTER */}
        {filteredAndSortedDocs.length > 0 && (
          <div className="bg-slate-50/70 border-t border-slate-200 px-3 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10.5px] text-slate-600">
            <div className="flex items-center gap-1.5">
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
