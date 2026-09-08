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
  Layers,
  Calendar,
  X
} from "lucide-react";
import { DbInvoice } from "../types.ts";
import { formatDocNumber } from "../utils/formatters";

interface WorkTrackerPageProps {
  documents: DbInvoice[];
  onViewDocument: (id: string) => void;
  requireGRN?: boolean;
  currentUserRole?: string;
  currentUserEmail?: string;
  currentUserUsername?: string;
}

export default function WorkTrackerPage({ 
  documents, 
  onViewDocument,
  requireGRN = true,
  currentUserRole = "employee",
  currentUserEmail = "",
  currentUserUsername = ""
}: WorkTrackerPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("AP INVOICE");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, _setSortBy] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "vendor">("date_desc");
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'this_week' | 'this_month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);

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

  const getApproverRole = (approverStr: string) => {
    if (!approverStr) return "";
    const mainApprover = approverStr.split(",")[0].trim();
    const lower = mainApprover.toLowerCase();
    if (lower.includes("prabhu")) return "finance_auditor";
    if (lower.includes("harish")) return "auditor";
    if (lower.includes("karthik")) return "auditor";
    if (lower.includes("abinaya")) return "finance_auditor";
    return "auditor";
  };

  const isAssignedToUser = (doc: DbInvoice): boolean => {
    if (doc.is_current_approver) return true;
    if (!currentUserUsername && !currentUserEmail) return false;
    const uHandle = (currentUserUsername || '').toLowerCase().trim();
    const eHandle = (currentUserEmail || '').toLowerCase().trim();
    const approverStr = (doc.assigned_approver || '').toLowerCase();
    const pool = approverStr.split(',').map(s => s.trim());
    if (uHandle && (pool.includes(uHandle) || pool.some(p => p.includes(uHandle) || uHandle.includes(p)))) return true;
    if (eHandle && (pool.includes(eHandle) || pool.some(p => p.includes(eHandle)))) return true;
    return false;
  };

  const [trackerScope, _setTrackerScope] = useState<'assigned' | 'all'>(() => 
    currentUserRole === 'admin' ? 'all' : 'assigned'
  );

  // Filter documents: non-admin users see strictly documents assigned to them (with fallback to all)
  const visibleDocs = useMemo(() => {
    if (trackerScope === "all" || currentUserRole === "admin") return documents;
    const filtered = documents.filter(doc => isAssignedToUser(doc) || !!doc.is_current_approver || !!doc.has_approved);
    return filtered.length > 0 ? filtered : documents;
  }, [documents, currentUserRole, trackerScope, currentUserUsername, currentUserEmail]);

  // Derive dynamic document types (strictly document-wise, no 'All' tab)
  const dynamicTypes = useMemo(() => {
    const types = Array.from(new Set(visibleDocs.map(d => (d.document_type || "").toUpperCase().trim()).filter(Boolean)));
    return types.length > 0 ? types : ["AP INVOICE", "GENERAL RECORDS"];
  }, [visibleDocs]);

  const TABS = dynamicTypes;

  // Auto-select first tab if current activeTab is not present
  React.useEffect(() => {
    if (dynamicTypes.length > 0 && !dynamicTypes.includes(activeTab)) {
      setActiveTab(dynamicTypes[0]);
    }
  }, [dynamicTypes, activeTab]);

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
      if (docType !== selectedTab) {
        // Fallback matching for similar doc type labels
        const isAPInvoice = selectedTab.includes("INVOICE") && (docType.includes("INVOICE") || !docType);
        const isGeneral = selectedTab.includes("GENERAL") && (docType.includes("GENERAL") || docType.includes("VCC") || docType.includes("EXPENSE"));
        const isPO = selectedTab.includes("PURCHASE") && (docType.includes("PURCHASE") || docType === "PO");
        const isGRN = selectedTab.includes("GOODS") && (docType.includes("GOODS") || docType === "GRN");

        if (!isAPInvoice && !isGeneral && !isPO && !isGRN) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "all") {
        const st = (doc.status || "").toLowerCase();
        if (statusFilter === "approved") {
          if (!st.includes("approve") && !st.includes("paid") && !st.includes("ready") && !st.includes("settled")) return false;
        } else if (statusFilter === "pending") {
          if (st.includes("reject") || st.includes("cancel") || st.includes("approve") || st.includes("paid") || st.includes("ready") || st.includes("settled") || st.includes("fail")) return false;
        } else if (statusFilter === "rejected") {
          if (!st.includes("reject") && !st.includes("fail")) return false;
        } else if (statusFilter === "cancelled") {
          if (!st.includes("cancel")) return false;
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

  const getNormalizedTabCategory = (tab: string) => {
    const norm = tab.toUpperCase().trim();
    if (norm.includes("AP INVOICE") || norm === "INVOICE") return "AP INVOICE";
    if (norm.includes("GENERAL") || norm.includes("VCC") || norm.includes("EXPENSE")) return "GENERAL RECORDS";
    if (norm.includes("PURCHASE ORDER") || norm === "PO") return "PURCHASE ORDER";
    if (norm.includes("GOODS RECEIPT") || norm === "GRN") return "GOODS RECEIPT";
    return "ALL";
  };

  // Export to CSV helper
  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const tabCategory = getNormalizedTabCategory(activeTab);
      let headers: string[] = [];
      let rows: (string | number)[][] = [];

      if (tabCategory === "AP INVOICE") {
        headers = ["Invoice ID", "Supplier / Vendor", "GSTIN", "Invoice Number", "Invoice Date", "PO Reference", "Gross Value (INR)", "Tax Amount (GST)", "Stage", "Status", "Assigned Approver"];
        rows = filteredAndSortedDocs.map(doc => {
          const gross = Number(doc.amount || 0);
          const tax = Math.round(gross - (gross / 1.18));
          return [
            doc.id,
            `"${(doc.vendor_name || '').replace(/"/g, '""')}"`,
            `"${((doc as any).vendor_gstin || '33AAAAA0000A1Z5').replace(/"/g, '""')}"`,
            `"${(doc.invoice_number || '').replace(/"/g, '""')}"`,
            doc.invoice_date || '',
            `"${(doc.po_number || '').replace(/"/g, '""')}"`,
            gross,
            tax,
            doc.current_stage || 1,
            doc.status || "Pending",
            `"${(doc.assigned_approver || '').replace(/"/g, '""')}"`
          ];
        });
      } else if (tabCategory === "GENERAL RECORDS") {
        headers = ["Record ID", "Submitter / Employee", "Cost Center", "Division", "Category", "Description", "Gross Value (INR)", "Stage", "Status", "Assigned Approver"];
        rows = filteredAndSortedDocs.map(doc => {
          const gross = Number(doc.amount || 0);
          return [
            doc.id,
            `"${(doc.vendor_name || (doc as any).employee_name || 'Employee').replace(/"/g, '""')}"`,
            `"${((doc as any).cost_center || 'CC-4020').replace(/"/g, '""')}"`,
            `"${((doc as any).division || 'Corporate').replace(/"/g, '""')}"`,
            doc.document_type || "General Record",
            `"${(doc.invoice_number || 'General Expense').replace(/"/g, '""')}"`,
            gross,
            doc.current_stage || 1,
            doc.status || "Pending",
            `"${(doc.assigned_approver || '').replace(/"/g, '""')}"`
          ];
        });
      } else if (tabCategory === "PURCHASE ORDER") {
        headers = ["PO Number", "Supplier / Vendor", "Plant / Division", "Order Date", "Total PO Value (INR)", "Stage", "Status", "Assigned Approver"];
        rows = filteredAndSortedDocs.map(doc => {
          const gross = Number(doc.amount || 0);
          return [
            `"${(doc.po_number || doc.invoice_number || `PO-${doc.id}`).replace(/"/g, '""')}"`,
            `"${(doc.vendor_name || '').replace(/"/g, '""')}"`,
            `"${((doc as any).plant || 'Plant-01 (Chennai Hub)').replace(/"/g, '""')}"`,
            doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''),
            gross,
            doc.current_stage || 1,
            doc.status || "Pending",
            `"${(doc.assigned_approver || '').replace(/"/g, '""')}"`
          ];
        });
      } else if (tabCategory === "GOODS RECEIPT") {
        headers = ["GRN Ref", "PO Reference", "Supplier / Vendor", "Intake Date", "Quality Check", "Stage", "Status"];
        rows = filteredAndSortedDocs.map(doc => {
          return [
            `"${(doc.invoice_number || `GRN-${doc.id}`).replace(/"/g, '""')}"`,
            `"${(doc.po_number || '').replace(/"/g, '""')}"`,
            `"${(doc.vendor_name || '').replace(/"/g, '""')}"`,
            doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''),
            "Passed",
            doc.current_stage || 1,
            doc.status || "Pending"
          ];
        });
      } else {
        headers = ["Doc ID", "Vendor Name", "Document Number / Ref", "Document Type", "Amount (INR)", "Status", "Created Date"];
        rows = filteredAndSortedDocs.map(doc => [
          doc.id,
          `"${(doc.vendor_name || '').replace(/"/g, '""')}"`,
          `"${(doc.invoice_number || '').replace(/"/g, '""')}"`,
          doc.document_type || "Document",
          doc.amount || 0,
          doc.status || "Pending",
          new Date(doc.created_at || Date.now()).toLocaleDateString()
        ]);
      }

      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `DocuFlow_${tabCategory.replace(/\s+/g, '_')}_Export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export failed", err);
    } finally {
      setIsExporting(false);
    }
  };

  const activeTabCategory = getNormalizedTabCategory(activeTab);

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
                  ? 'bg-indigo-600 text-white shadow-2xs'
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
              className="w-full pl-6.5 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-500 transition"
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[10px] font-medium text-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>

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
            
            {/* Dynamic Table Header based on activeTab */}
            <thead className="bg-slate-50 border-b border-slate-200 text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              {activeTabCategory === "AP INVOICE" && (
                <tr>
                  <th className="py-2.5 px-3 w-[9%]">ID</th>
                  <th className="py-2.5 px-3 w-[20%]">Supplier / Vendor &amp; GSTIN</th>
                  <th className="py-2.5 px-3 w-[12%]">Invoice # &amp; Date</th>
                  <th className="py-2.5 px-3 w-[12%]">PO Reference</th>
                  <th className="py-2.5 px-3 w-[12%] text-right">Gross Value (₹)</th>
                  <th className="py-2.5 px-3 w-[9%] text-right">Tax (GST)</th>
                  <th className="py-2.5 px-3 w-[7%] text-center">Stage</th>
                  <th className="py-2.5 px-3 w-[9%] text-center">Status</th>
                  <th className="py-2.5 px-3 w-[11%]">Assigned Approver</th>
                  <th className="py-2.5 px-3 w-[8%] text-center">Action</th>
                </tr>
              )}

              {activeTabCategory === "GENERAL RECORDS" && (
                <tr>
                  <th className="py-2.5 px-3 w-[10%]">Record ID</th>
                  <th className="py-2.5 px-3 w-[18%]">Submitter / Employee</th>
                  <th className="py-2.5 px-3 w-[14%]">Cost Center &amp; Division</th>
                  <th className="py-2.5 px-3 w-[16%]">Category / Description</th>
                  <th className="py-2.5 px-3 w-[12%] text-right">Gross Value (₹)</th>
                  <th className="py-2.5 px-3 w-[7%] text-center">Stage</th>
                  <th className="py-2.5 px-3 w-[9%] text-center">Status</th>
                  <th className="py-2.5 px-3 w-[14%]">Assigned Approver</th>
                  <th className="py-2.5 px-3 w-[8%] text-center">Action</th>
                </tr>
              )}

              {activeTabCategory === "PURCHASE ORDER" && (
                <tr>
                  <th className="py-2.5 px-3 w-[12%]">PO Number</th>
                  <th className="py-2.5 px-3 w-[22%]">Supplier / Vendor</th>
                  <th className="py-2.5 px-3 w-[14%]">Plant / Division</th>
                  <th className="py-2.5 px-3 w-[10%]">Order Date</th>
                  <th className="py-2.5 px-3 w-[14%] text-right">Total PO Value (₹)</th>
                  <th className="py-2.5 px-3 w-[8%] text-center">Stage</th>
                  <th className="py-2.5 px-3 w-[10%] text-center">Status</th>
                  <th className="py-2.5 px-3 w-[10%] text-center">Action</th>
                </tr>
              )}

              {activeTabCategory === "GOODS RECEIPT" && (
                <tr>
                  <th className="py-2.5 px-3 w-[12%]">GRN Ref</th>
                  <th className="py-2.5 px-3 w-[14%]">PO Reference</th>
                  <th className="py-2.5 px-3 w-[22%]">Supplier / Vendor</th>
                  <th className="py-2.5 px-3 w-[12%]">Intake Date</th>
                  <th className="py-2.5 px-3 w-[12%] text-center">Quality Check</th>
                  <th className="py-2.5 px-3 w-[8%] text-center">Stage</th>
                  <th className="py-2.5 px-3 w-[10%] text-center">Status</th>
                  <th className="py-2.5 px-3 w-[10%] text-center">Action</th>
                </tr>
              )}

              {activeTabCategory === "ALL" && (
                <tr>
                  <th className="py-2.5 px-3 w-[9%]">ID</th>
                  <th className="py-2.5 px-3 w-[20%]">Supplier / Vendor</th>
                  <th className="py-2.5 px-3 w-[12%]">Document Ref</th>
                  <th className="py-2.5 px-3 w-[13%]">PO Reference</th>
                  <th className="py-2.5 px-3 w-[11%] text-right">Gross Value (₹)</th>
                  <th className="py-2.5 px-3 w-[8%] text-center">Stage</th>
                  <th className="py-2.5 px-3 w-[9%] text-center">Status</th>
                  <th className="py-2.5 px-3 w-[12%]">Assigned To</th>
                  <th className="py-2.5 px-3 w-[6%] text-center">Action</th>
                </tr>
              )}
            </thead>

            {/* Dynamic Table Body based on activeTab */}
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
                const taxableBase = Math.round(grossAmount / 1.18);
                const gstTaxAmount = Math.round(grossAmount - taxableBase);
                const cleanId = String(doc.id || "").replace(/^#/, "").replace(/^•/, "").trim();
                const displayId = formatDocNumber(doc.id, doc.document_type, (doc as any).category);

                const displayPaymentTerms = (terms: string) => {
                  if (!terms) return "Net 30 Days";
                  const cleanTerms = terms.replace(/^Net\s+/i, "").trim();
                  return `Net ${cleanTerms}`;
                };

                // Helper for Stage Pill
                const renderStageBadge = () => {
                  const status = (doc.status || "Pending Approval").trim();
                  const stageNum = doc.current_stage || doc.activeApprovalLog?.current_stage_number || 1;

                  if (status === "Settled" || status === "Approved" || status === "Paid" || status === "Ready for Payment") {
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Approved
                      </span>
                    );
                  }
                  if (status === "On Hold") {
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                        Stage {stageNum}
                      </span>
                    );
                  }
                  if (status === "Rejected" || status === "Failed") {
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                        Stage {stageNum}
                      </span>
                    );
                  }
                  
                  const isStage2 = stageNum === 2;
                  const badgeClass = isStage2
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200";

                  return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold ${badgeClass}`}>
                      Stage {stageNum}
                    </span>
                  );
                };

                // Helper for Status Pill
                const renderStatusBadge = () => {
                  const status = (doc.status || "Pending Approval").trim();
                  const stageNum = doc.current_stage || doc.activeApprovalLog?.current_stage_number || 1;

                  if (status === "Settled" || status === "Approved" || status === "Paid" || status === "Ready for Payment") {
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span>Completed</span>
                      </span>
                    );
                  }
                  if (status === "On Hold") {
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                        <span>On Hold</span>
                      </span>
                    );
                  }
                  if (status === "Rejected" || status === "Failed") {
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        <span>Rejected</span>
                      </span>
                    );
                  }
                  
                  const isStage2 = stageNum === 2;
                  const badgeClass = isStage2
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200";
                  
                  const dotColor = isStage2 ? "bg-indigo-500" : "bg-amber-500 animate-pulse";
                  const statusText = isStage2 ? "In Progress" : "Pending";

                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold ${badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                      <span>{statusText}</span>
                    </span>
                  );
                };

                // Helper for Approver Cell
                const renderApproverCell = () => {
                  const rawApprover = (doc.assigned_approver || "-").trim();
                  const approverList = rawApprover.split(",").map(a => a.trim()).filter(Boolean);
                  const firstApprover = approverList[0] || "-";
                  const extraCount = approverList.length - 1;

                  return (
                    <div className="flex flex-col min-w-0" title={rawApprover}>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-bold text-[10px] text-slate-800 truncate block">
                          {firstApprover}
                        </span>
                        {extraCount > 0 && (
                          <span className="text-[8.5px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-1 rounded shrink-0">
                            +{extraCount}
                          </span>
                        )}
                      </div>
                      {rawApprover !== "-" && (
                        <span className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate block">
                          {getApproverRole(rawApprover)}
                        </span>
                      )}
                    </div>
                  );
                };

                // Helper for Review Button
                const renderActionButton = () => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDocument(doc.id);
                    }}
                    className="px-2.5 py-1 border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-600 hover:text-white font-bold text-[9.5px] rounded-md transition-all cursor-pointer flex items-center justify-center gap-0.5 mx-auto text-indigo-700"
                  >
                    <span>Review</span>
                    <span>&gt;</span>
                  </button>
                );

                // --- TAB 1: AP INVOICE ROW ---
                if (activeTabCategory === "AP INVOICE") {
                  return (
                    <tr 
                      key={doc.id} 
                      onClick={() => onViewDocument(doc.id)}
                      className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    >
                      <td className="py-2.5 px-3 align-middle w-[9%] min-w-0">
                        <span className="text-[9.5px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate inline-block max-w-full" title={displayId}>
                          {displayId}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[20%] min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-[9px] shrink-0">
                            {vendorInitials}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-[11px] text-slate-900 truncate block group-hover:text-indigo-600 transition uppercase" title={vendorName}>
                              {vendorName}
                            </span>
                            <div className="flex items-center gap-1 text-[8.5px] text-slate-400 font-normal truncate">
                              <span>{(doc as any).vendor_gstin ? `GSTIN: ${(doc as any).vendor_gstin}` : "GSTIN: 33AAAAA0000A1Z5"}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[12%] min-w-0">
                        <div className="flex flex-col space-y-0.5 min-w-0">
                          <span className="font-bold text-[11px] text-slate-900 truncate block" title={doc.invoice_number || `INV-${cleanId}`}>
                            {doc.invoice_number || `INV-${cleanId}`}
                          </span>
                          <span className="text-[9.5px] text-slate-500 font-medium whitespace-nowrap">
                            {doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "-")}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                            {displayPaymentTerms(doc.payment_terms || "")}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[12%] min-w-0">
                        <span className="text-[9.5px] font-semibold text-indigo-600 font-mono truncate block" title={doc.po_number || `PO-2026-${cleanId}`}>
                          {doc.po_number || `PO-2026-${cleanId}`}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-right w-[12%]">
                        <div className="flex flex-col items-end">
                          <span className="font-extrabold text-[11px] text-slate-900 whitespace-nowrap">
                            ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                            Base: ₹{taxableBase.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-right w-[9%]">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-[10px] text-slate-700 whitespace-nowrap">
                            ₹{gstTaxAmount.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[8.5px] text-slate-400 font-medium whitespace-nowrap">
                            18% GST
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[7%]">
                        {renderStageBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[9%]">
                        {renderStatusBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[11%] min-w-0">
                        {renderApproverCell()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[8%]">
                        {renderActionButton()}
                      </td>
                    </tr>
                  );
                }

                // --- TAB 2: GENERAL RECORDS / VCC ROW ---
                if (activeTabCategory === "GENERAL RECORDS") {
                  const employeeName = doc.vendor_name || (doc as any).employee_name || "Enterprise Employee";
                  const costCenter = (doc as any).cost_center || "CC-4020 (IT Ops)";
                  const division = (doc as any).division || "Corporate";
                  const category = doc.document_type || "General Record";

                  return (
                    <tr 
                      key={doc.id} 
                      onClick={() => onViewDocument(doc.id)}
                      className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    >
                      <td className="py-2.5 px-3 align-middle w-[10%] min-w-0">
                        <span className="text-[9.5px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate inline-block max-w-full" title={displayId}>
                          {displayId}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[18%] min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold text-[9px] shrink-0">
                            {employeeName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-bold text-[11px] text-slate-900 truncate block group-hover:text-indigo-600 transition" title={employeeName}>
                            {employeeName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[14%] min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[10px] text-slate-800 truncate block" title={costCenter}>
                            {costCenter}
                          </span>
                          <span className="text-[8.5px] text-slate-400 font-medium truncate block">
                            {division}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[16%] min-w-0">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[10px] text-indigo-600 truncate block" title={category}>
                            {category}
                          </span>
                          <span className="text-[8.5px] text-slate-400 font-normal truncate block">
                            {doc.invoice_number || "Expense Voucher"}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-right w-[12%]">
                        <span className="font-extrabold text-[11px] text-slate-900 whitespace-nowrap">
                          ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[7%]">
                        {renderStageBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[9%]">
                        {renderStatusBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[14%] min-w-0">
                        {renderApproverCell()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[8%]">
                        {renderActionButton()}
                      </td>
                    </tr>
                  );
                }

                // --- TAB 3: PURCHASE ORDER ROW ---
                if (activeTabCategory === "PURCHASE ORDER") {
                  const poNum = doc.po_number || doc.invoice_number || `PO-2026-${cleanId}`;
                  const plant = (doc as any).plant || "Plant-01 (Chennai Hub)";

                  return (
                    <tr 
                      key={doc.id} 
                      onClick={() => onViewDocument(doc.id)}
                      className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    >
                      <td className="py-2.5 px-3 align-middle w-[12%] min-w-0">
                        <span className="text-[9.5px] font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 truncate inline-block max-w-full" title={poNum}>
                          {poNum}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[22%] min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-[9px] shrink-0">
                            {vendorInitials}
                          </div>
                          <span className="font-bold text-[11px] text-slate-900 truncate block group-hover:text-indigo-600 transition uppercase" title={vendorName}>
                            {vendorName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[14%] min-w-0">
                        <span className="text-[10px] font-medium text-slate-700 truncate block" title={plant}>
                          {plant}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[10%] min-w-0">
                        <span className="text-[9.5px] text-slate-600 font-medium whitespace-nowrap">
                          {doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "-")}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-right w-[14%]">
                        <span className="font-extrabold text-[11px] text-slate-900 whitespace-nowrap">
                          ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[8%]">
                        {renderStageBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[10%]">
                        {renderStatusBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[10%]">
                        {renderActionButton()}
                      </td>
                    </tr>
                  );
                }

                // --- TAB 4: GOODS RECEIPT / GRN ROW ---
                if (activeTabCategory === "GOODS RECEIPT") {
                  const grnRef = doc.invoice_number || `GRN-2026-${cleanId}`;
                  const poRef = doc.po_number || `PO-2026-${cleanId}`;

                  return (
                    <tr 
                      key={doc.id} 
                      onClick={() => onViewDocument(doc.id)}
                      className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    >
                      <td className="py-2.5 px-3 align-middle w-[12%] min-w-0">
                        <span className="text-[9.5px] font-mono font-bold text-slate-800 bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200 truncate inline-block max-w-full" title={grnRef}>
                          {grnRef}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[14%] min-w-0">
                        <span className="text-[9.5px] font-semibold text-indigo-600 font-mono truncate block" title={poRef}>
                          {poRef}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[22%] min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-[9px] shrink-0">
                            {vendorInitials}
                          </div>
                          <span className="font-bold text-[11px] text-slate-900 truncate block group-hover:text-indigo-600 transition uppercase" title={vendorName}>
                            {vendorName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 align-middle w-[12%] min-w-0">
                        <span className="text-[9.5px] text-slate-600 font-medium whitespace-nowrap">
                          {doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "-")}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[12%]">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Passed</span>
                        </span>
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[8%]">
                        {renderStageBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[10%]">
                        {renderStatusBadge()}
                      </td>

                      <td className="py-2.5 px-3 align-middle text-center w-[10%]">
                        {renderActionButton()}
                      </td>
                    </tr>
                  );
                }

                // --- DEFAULT / ALL RECORDS ROW ---
                return (
                  <tr 
                    key={doc.id} 
                    onClick={() => onViewDocument(doc.id)}
                    className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                  >
                    <td className="py-2.5 px-3 align-middle w-[9%] min-w-0">
                      <span className="text-[9.5px] font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate inline-block max-w-full" title={displayId}>
                        {displayId}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 align-middle w-[20%] min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-6 w-6 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-bold text-[9px] shrink-0">
                          {vendorInitials}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-[11px] text-slate-900 truncate block group-hover:text-indigo-600 transition uppercase" title={vendorName}>
                            {vendorName}
                          </span>
                          <div className="flex items-center gap-1 text-[8.5px] text-slate-400 font-normal truncate">
                            <span>{(doc as any).vendor_gstin ? `GSTIN: ${(doc as any).vendor_gstin}` : ""}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 align-middle w-[12%] min-w-0">
                      <div className="flex flex-col space-y-0.5 min-w-0">
                        <span className="font-bold text-[11px] text-slate-900 truncate block" title={doc.invoice_number || `INV-${cleanId}`}>
                          {doc.invoice_number || `INV-${cleanId}`}
                        </span>
                        <span className="text-[9.5px] text-slate-500 font-medium whitespace-nowrap">
                          {doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : "-")}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                          {displayPaymentTerms(doc.payment_terms || "")}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 align-middle w-[13%] min-w-0">
                      <span className="text-[9.5px] font-semibold text-indigo-600 font-mono truncate block" title={doc.po_number || `PO-2026-${cleanId}`}>
                        {doc.po_number || `PO-2026-${cleanId}`}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 align-middle text-right w-[11%]">
                      <div className="flex flex-col items-end">
                        <span className="font-extrabold text-[11px] text-slate-900 whitespace-nowrap">
                          ₹{grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                          Base: ₹{taxableBase.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                          +18% GST
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 align-middle text-center w-[8%]">
                      {renderStageBadge()}
                    </td>

                    <td className="py-2.5 px-3 align-middle text-center w-[9%]">
                      {renderStatusBadge()}
                    </td>

                    <td className="py-2.5 px-3 align-middle w-[12%] min-w-0">
                      {renderApproverCell()}
                    </td>

                    <td className="py-2.5 px-3 align-middle text-center w-[6%]">
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
