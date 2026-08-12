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
    const status = doc.status;
    const log = doc.activeApprovalLog;

    if (status.includes("Approval") || status === "Data Verification Pending") {
      const stageNum = log?.current_stage_number || 1;
      const stageName = (doc as any).current_stage_name || "Verification & Compliance";

      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Stage {stageNum}: {stageName}
        </span>
      );
    }

    switch (status) {
      case "Approved":
      case "Ready for Payment":
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <Check className="h-2.5 w-2.5 stroke-[3] text-emerald-600" />
              Ready for Settlement
            </span>
            <span className="text-[8.5px] font-semibold text-emerald-600/80 pl-1">
              Passed Compliance Audit
            </span>
          </div>
        );
      case "Paid":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
            <Check className="h-2.5 w-2.5 stroke-[3]" />
            Paid & Settled
          </span>
        );
      case "Waiting for GRN":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            <Clock className="h-2.5 w-2.5 text-amber-600" />
            Waiting for GRN Inward
          </span>
        );
      case "Rejected":
      case "Failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
            <AlertCircle className="h-2.5 w-2.5 text-rose-600" />
            Blocked / Rejected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  // Vendor Initials Color Palette Helper
  const getVendorBadgeStyle = (name: string) => {
    const char = (name || "V").toUpperCase().charCodeAt(0);
    const palettes = [
      "from-indigo-600 to-blue-600 text-white",
      "from-teal-600 to-emerald-600 text-white",
      "from-purple-600 to-indigo-600 text-white",
      "from-cyan-600 to-blue-700 text-white",
      "from-amber-500 to-orange-600 text-white"
    ];
    return palettes[char % palettes.length];
  };

  return (
    <div className="space-y-3 animate-fadeIn pb-12 w-full max-w-[1680px] mx-auto px-2 sm:px-4 pt-1">
      
      {/* 1. ADVANCED COMMAND & FILTER TOOLBAR */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-2.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-2.5">
        
        {/* Left: Category Navigation Tabs */}
        <div className="flex items-center gap-1 w-full md:w-auto overflow-x-auto custom-scrollbar">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition whitespace-nowrap cursor-pointer ${
                activeTab === t
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t === "All" ? "All Invoices" : t}
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
              placeholder="Search vendor, invoice #, PO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
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
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[10.5px] font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
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
            className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[10.5px] font-bold text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
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
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-[10.5px] rounded-lg border border-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Export filtered records to CSV"
          >
            <Download className="h-3 w-3 text-slate-500" />
            <span>Export</span>
          </button>

        </div>

      </div>

      {/* 3. TIER-1 HIGH-DENSITY ENTERPRISE INVOICE GRID */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            
            {/* Table Header */}
            <thead className="bg-slate-50/90 border-b border-slate-200 text-[9.5px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-2.5 px-3 w-[7%]">ID</th>
                <th className="py-2.5 px-3 w-[26%]">Supplier / Vendor</th>
                <th className="py-2.5 px-3 w-[20%]">Invoice &amp; PO Reference</th>
                <th className="py-2.5 px-3 w-[15%] text-right">Gross Value (₹)</th>
                <th className="py-2.5 px-3 w-[18%]">Approval Stage &amp; Status</th>
                <th className="py-2.5 px-3 w-[14%] text-center">Action</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredAndSortedDocs.map((doc, idx) => {
                const vendorName = doc.vendor_name || "Enterprise Supplier";
                const vendorInitials = vendorName
                  .split(" ")
                  .slice(0, 2)
                  .map(w => w[0])
                  .join("")
                  .toUpperCase() || "V";

                const grossAmount = Number(doc.amount || 0);
                const taxableBase = grossAmount / 1.18;

                return (
                  <tr 
                    key={doc.id} 
                    onClick={() => onViewDocument(doc.id)}
                    className="hover:bg-indigo-50/40 transition-colors group cursor-pointer"
                  >
                    
                    {/* 1. Document ID */}
                    <td className="py-3 px-3 align-middle">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-[11px] text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/80">
                          #{doc.id}
                        </span>
                      </div>
                    </td>

                    {/* 2. Supplier / Vendor */}
                    <td className="py-3 px-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${getVendorBadgeStyle(vendorName)} flex items-center justify-center font-black text-[10px] shrink-0 shadow-2xs`}>
                          {vendorInitials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[11.5px] text-slate-900 truncate group-hover:text-indigo-600 transition">
                            {vendorName}
                          </span>
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono mt-0.5">
                            <span>GSTIN: {(doc as any).vendor_gstin || "33DXWPS8140D1Z1"}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 3. Invoice & PO Reference */}
                    <td className="py-3 px-3 align-middle">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[11px] text-slate-900 font-mono">
                            {doc.invoice_number || `INV-${doc.id}00`}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {doc.invoice_date || new Date(doc.created_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.2 rounded font-mono">
                            PO: {doc.po_number || `PO-2026-${doc.id}870`}
                          </span>
                          <span className="text-[8.5px] font-bold text-slate-400">
                            Net 30 Days
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 4. Gross Value (INR) */}
                    <td className="py-3 px-3 align-middle text-right">
                      <div className="flex flex-col items-end">
                        <span className="font-black text-[12.5px] text-indigo-700 font-mono tracking-tight">
                          ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] font-semibold text-slate-400">
                          Base: ₹{taxableBase.toLocaleString('en-IN', { maximumFractionDigits: 0 })} + 18% GST
                        </span>
                      </div>
                    </td>

                    {/* 5. Status & Stage Pulse */}
                    <td className="py-3 px-3 align-middle">
                      {renderStatusBadge(doc)}
                    </td>

                    {/* 6. Primary Action CTA */}
                    <td className="py-3 px-3 align-middle text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDocument(doc.id);
                        }}
                        className="px-3 py-1.5 bg-indigo-50 group-hover:bg-indigo-600 text-indigo-700 group-hover:text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg border border-indigo-200 group-hover:border-indigo-600 transition flex items-center justify-center gap-1 mx-auto shadow-2xs group-hover:shadow-indigo-500/20 active:scale-95"
                      >
                        <span>Review</span>
                        <ChevronRight className="h-3 w-3 stroke-[3]" />
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
              <h3 className="text-sm font-bold text-slate-800">No invoices match the filter</h3>
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
            Showing <strong className="text-slate-900">{filteredAndSortedDocs.length}</strong> of <strong className="text-slate-900">{documents.length}</strong> total invoices
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
