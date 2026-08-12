import React, { useState, useMemo } from "react";
import { 
  Search, 
  RefreshCw, 
  Download, 
  SlidersHorizontal, 
  CheckCircle2, 
  Clock, 
  FileText, 
  ChevronRight, 
  Building2, 
  ShieldCheck, 
  ArrowUpDown, 
  Check, 
  AlertCircle,
  Eye,
  Filter,
  Sparkles,
  TrendingUp,
  CreditCard,
  Layers
} from "lucide-react";
import { DbInvoice } from "../types.ts";

interface WorkTrackerPageProps {
  documents: DbInvoice[];
  onViewDocument: (id: string) => void;
  requireGRN?: boolean;
}

export default function WorkTrackerPage({ 
  documents, 
  onViewDocument,
  requireGRN = true 
}: WorkTrackerPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "vendor">("date_desc");
  const [isExporting, setIsExporting] = useState(false);

  // Derive dynamic document types
  const dynamicTypes = useMemo(() => {
    return Array.from(new Set(documents.map(d => (d.document_type || "").toUpperCase().trim()).filter(Boolean)));
  }, [documents]);

  const TABS = ["All", ...dynamicTypes];

  // Executive KPI summary calculations
  const kpiStats = useMemo(() => {
    let totalGrossValue = 0;
    let pendingApprovalCount = 0;
    let pendingApprovalValue = 0;
    let readyForPaymentCount = 0;
    let readyForPaymentValue = 0;
    let highValueCount = 0;

    documents.forEach(doc => {
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
      totalCount: documents.length,
      totalGrossValue,
      pendingApprovalCount,
      pendingApprovalValue,
      readyForPaymentCount,
      readyForPaymentValue,
      highValueCount
    };
  }, [documents]);

  // Filtered and sorted documents list
  const filteredAndSortedDocs = useMemo(() => {
    let list = documents.filter(doc => {
      // Tab filter
      if (activeTab !== "All" && (doc.document_type || "").toUpperCase().trim() !== activeTab.toUpperCase().trim()) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "pending" && ["Paid", "Rejected", "Failed"].includes(doc.status)) return false;
        if (statusFilter === "ready" && !["Approved", "Ready for Payment"].includes(doc.status)) return false;
        if (statusFilter === "grn" && doc.status !== "Waiting for GRN") return false;
      }

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
      if (sortBy === "date_asc") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  }, [documents, activeTab, statusFilter, searchTerm, sortBy]);

  // Export to CSV helper
  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const headers = ["Doc ID", "Vendor Name", "Invoice Number", "Document Type", "Amount (INR)", "Status", "Created Date"];
      const rows = filteredAndSortedDocs.map(doc => [
        doc.id,
        `"${(doc.vendor_name || '').replace(/"/g, '""')}"`,
        `"${(doc.invoice_number || '').replace(/"/g, '""')}"`,
        doc.document_type || "Invoice",
        doc.amount || 0,
        doc.status || "Pending",
        new Date(doc.created_at || Date.now()).toLocaleDateString()
      ]);

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `AP_Invoices_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (doc: DbInvoice) => {
    const status = (doc.status || "Pending Approval").trim();
    const stageNum = doc.current_stage || doc.activeApprovalLog?.current_stage_number || 1;

    if (status.toLowerCase().includes("initiated") || status.toLowerCase().includes("attachment")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span>Stage 1: Attachment Status</span>
        </span>
      );
    }

    if (status.toLowerCase().includes("progress") || status.toLowerCase().includes("approval") || status.toLowerCase().includes("verification")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
          <span>Stage {stageNum}: In Progress</span>
        </span>
      );
    }

    if (status === "Settled" || status === "Approved" || status === "Ready for Payment") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
          <Check className="h-3 w-3 stroke-[2.5] text-emerald-600" />
          <span>Settled & Approved</span>
        </span>
      );
    }

    if (status === "Paid") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-emerald-600 text-white shadow-2xs">
          <Check className="h-3 w-3 stroke-[2.5]" />
          <span>Paid & Closed</span>
        </span>
      );
    }

    if (status === "On Hold") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80">
          <Clock className="h-3 w-3 text-amber-600" />
          <span>Administrative Hold</span>
        </span>
      );
    }

    if (status === "Rejected" || status === "Failed") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
          <AlertCircle className="h-3 w-3 text-rose-600" />
          <span>Rejected / Discrepancy</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10.5px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
        {status}
      </span>
    );
  };

  // Vendor Initials Color Palette Helper
  const getVendorBadgeStyle = (name: string) => {
    const char = (name || "V").toUpperCase().charCodeAt(0);
    const palettes = [
      "from-blue-600 to-indigo-600 text-white",
      "from-teal-600 to-emerald-600 text-white",
      "from-violet-600 to-purple-600 text-white",
      "from-sky-600 to-blue-700 text-white",
      "from-amber-600 to-orange-600 text-white"
    ];
    return palettes[char % palettes.length];
  };

  return (
    <div className="space-y-3 animate-fadeIn pb-12 w-full max-w-[1680px] mx-auto px-2 sm:px-4 pt-1">
      
      {/* 1. ADVANCED COMMAND & FILTER TOOLBAR */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-2.5">
        
        {/* Left: Category Navigation Tabs */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto custom-scrollbar">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition whitespace-nowrap cursor-pointer ${
                activeTab === t
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t === "All" ? "All Records" : t}
            </button>
          ))}
        </div>

        {/* Right: Search, Filter Dropdown, Sorting & Export */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          
          {/* Real-time Search Input */}
          <div className="relative flex-1 sm:w-64 min-w-[180px]">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search vendor, doc #, PO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 transition"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-[10px]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending Approval</option>
            <option value="ready">Ready for Payment</option>
            <option value="grn">Waiting for GRN</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="date_desc">Latest Date</option>
            <option value="date_asc">Oldest Date</option>
            <option value="amount_desc">Highest Amount</option>
            <option value="amount_asc">Lowest Amount</option>
            <option value="vendor">Vendor A-Z</option>
          </select>

          {/* Export to CSV Button */}
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={isExporting || filteredAndSortedDocs.length === 0}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[11px] rounded-lg border border-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Export filtered records to CSV"
          >
            <Download className="h-3 w-3 text-slate-500" />
            <span>Export</span>
          </button>

        </div>

      </div>

      {/* 3. TIER-1 HIGH-DENSITY ENTERPRISE INVOICE GRID */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            
            {/* Table Header */}
            <thead className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2.5 px-3.5 w-[9%]">ID</th>
                <th className="py-2.5 px-3 w-[27%]">Supplier / Vendor</th>
                <th className="py-2.5 px-3 w-[22%]">Document &amp; PO Ref</th>
                <th className="py-2.5 px-3 w-[15%] text-right">Gross Value (₹)</th>
                <th className="py-2.5 px-3 w-[17%]">Approval Stage &amp; Status</th>
                <th className="py-2.5 px-3.5 w-[10%] text-center">Action</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredAndSortedDocs.map((doc) => {
                const vendorName = doc.vendor_name || "Enterprise Supplier";
                const vendorInitials = vendorName
                  .split(" ")
                  .slice(0, 2)
                  .map(w => w[0])
                  .join("")
                  .toUpperCase() || "V";

                const grossAmount = Number(doc.amount || 0);
                const taxableBase = grossAmount / 1.18;
                const cleanId = String(doc.id || "").replace(/^#/, "").replace(/^•/, "").trim();

                return (
                  <tr 
                    key={doc.id} 
                    onClick={() => onViewDocument(doc.id)}
                    className="hover:bg-blue-50/40 transition-colors group cursor-pointer"
                  >
                    
                    {/* 1. Document ID */}
                    <td className="py-3 px-3.5 align-middle">
                      <div className="flex items-center">
                        <span className="font-medium text-[11px] text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-200 tracking-tight">
                          #{cleanId}
                        </span>
                      </div>
                    </td>

                    {/* 2. Supplier / Vendor */}
                    <td className="py-3 px-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${getVendorBadgeStyle(vendorName)} flex items-center justify-center font-bold text-[11px] shrink-0 shadow-xs`}>
                          {vendorInitials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[12px] text-slate-900 truncate group-hover:text-blue-600 transition">
                            {vendorName}
                          </span>
                          <div className="flex items-center gap-1.5 text-[9.5px] text-slate-400 font-normal mt-0.5">
                            <span>GSTIN: {(doc as any).vendor_gstin || "33DXWPS8140D1Z1"}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 3. Invoice & PO Reference */}
                    <td className="py-3 px-3 align-middle">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-[11.5px] text-slate-900">
                            {doc.invoice_number || `INV-${cleanId}`}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] font-normal text-slate-500">
                            {doc.invoice_date || new Date(doc.created_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9.5px] font-medium text-blue-700 bg-blue-50 border border-blue-200/60 px-1.5 py-0.2 rounded">
                            PO: {doc.po_number || `PO-2026-${cleanId}`}
                          </span>
                          <span className="text-[9px] font-normal text-slate-400">
                            Net 30 Days
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 4. Gross Value (INR) */}
                    <td className="py-3 px-3 align-middle text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-[13px] text-slate-900 tabular-nums tracking-tight">
                          ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] font-normal text-slate-400">
                          Base: ₹{taxableBase.toLocaleString('en-IN', { maximumFractionDigits: 0 })} + 18% GST
                        </span>
                      </div>
                    </td>

                    {/* 5. Status & Stage Pulse */}
                    <td className="py-3 px-3 align-middle">
                      {renderStatusBadge(doc)}
                    </td>

                    {/* 6. Primary Action CTA */}
                    <td className="py-3 px-3.5 align-middle text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDocument(doc.id);
                        }}
                        className="px-3 py-1.5 bg-blue-50 group-hover:bg-blue-600 text-blue-700 group-hover:text-white font-bold text-[10.5px] rounded-lg border border-blue-200 group-hover:border-blue-600 transition flex items-center justify-center gap-1 mx-auto shadow-2xs group-hover:shadow-blue-500/20 active:scale-95 cursor-pointer"
                      >
                        <span>Review</span>
                        <ChevronRight className="h-3 w-3 stroke-[2.5]" />
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
              <p className="text-[11px] text-slate-500 font-medium mt-1">Try resetting your search query or status filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setActiveTab("All");
                }}
                className="mt-3 px-3 py-1 bg-indigo-600 text-white font-bold text-[10px] rounded-lg shadow-2xs hover:bg-indigo-700 transition"
              >
                Reset Filters
              </button>
            </div>
          )}

        </div>

        {/* Table Footer Summary Bar */}
        <div className="bg-slate-50/90 border-t border-slate-200 px-4 py-2 flex items-center justify-between text-[10px] text-slate-500 font-bold">
          <span>
            Showing <strong className="text-slate-900">{filteredAndSortedDocs.length}</strong> of <strong className="text-slate-900">{documents.length}</strong> total records
          </span>
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>DocuFlow Active</span>
          </div>
        </div>

      </div>

    </div>
  );
}
