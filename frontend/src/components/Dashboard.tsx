import { useState } from "react";
import { 
  Clock, 
  PauseCircle, 
  CheckCircle2, 
  Activity, 
  XCircle, 
  FileText, 
  ShieldCheck, 
  CalendarDays, 
  ChevronDown,
  ArrowRight,
  Loader2
} from "lucide-react";
import { DbInvoice } from "../types.ts";
import { REFERENCE_DOCUMENTS, REFERENCE_DOC_TYPE_FILTERS, REFERENCE_STATS } from "../data/dashboardData";

interface DashboardProps {
  documents: DbInvoice[];
  stats: any | null;
  loading: boolean;
  onViewDocument: (docId: string) => void;
  currentUserRole?: string;
  currentUserEmail?: string;
  currentUserUsername?: string;
  setCurrentView?: (view: string) => void;
  requireGRN?: boolean;
}

export default function Dashboard({ 
  documents, 
  loading, 
  onViewDocument
}: DashboardProps) {
  const [activeDocType, setActiveDocType] = useState<string>("ALL DOCUMENTS");
  const [timeRangeOpen, setTimeRangeOpen] = useState(false);
  const [timeRange, setTimeRange] = useState<string>("ALL TIME");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[400px]">
        <Loader2 className="h-10 w-10 text-[#003F28] animate-spin mb-2" />
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest font-display">
          Loading DAAS Dashboard...
        </p>
      </div>
    );
  }

  // Merge real documents with reference documents if real documents list is empty
  const displayDocs = documents && documents.length > 0
    ? documents.map(d => ({
        id: d.id,
        vendor_name: d.vendor_name || "Enterprise Vendor",
        document_type: (d.document_type || "AP INVOICE").toUpperCase().trim(),
        invoice_number: d.invoice_number || `INV-${d.id.slice(0, 5)}`,
        invoice_date: d.invoice_date || d.doc_date || "2026-09-07",
        status: d.status || "UNROUTED (NO RULE MATCHED)",
        status_badge_type: (d.status && d.status.toLowerCase().includes("initiated")
          ? (d.status.toLowerCase().includes("attachment") ? "initiated_attachment" : "initiated_first")
          : "unrouted") as any,
        amount: d.amount || 45000
      }))
    : REFERENCE_DOCUMENTS;

  // Filter docs by type
  const filteredDocs = activeDocType === "ALL DOCUMENTS"
    ? displayDocs
    : displayDocs.filter(d => d.document_type.toUpperCase().trim() === activeDocType.toUpperCase().trim());

  // Render Status Badge matching exact reference image design
  const renderStatusBadge = (statusText: string, badgeType?: string) => {
    const sLower = statusText.toLowerCase();

    if (badgeType === "initiated_first" || sLower.includes("first approval") || sLower.includes("initiated (first")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase bg-[#FFF9E6] text-[#E65100] border border-[#FFCC80]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E65100]" />
          INITIATED (FIRST APPROVAL)
        </span>
      );
    }

    if (badgeType === "initiated_attachment" || sLower.includes("attachment status") || sLower.includes("initiated (attachment")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase bg-[#FFF9E6] text-[#E65100] border border-[#FFCC80]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E65100]" />
          INITIATED (ATTACHMENT STATUS)
        </span>
      );
    }

    if (badgeType === "unrouted" || sLower.includes("unrouted") || sLower.includes("no rule")) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
          UNROUTED (NO RULE MATCHED)
        </span>
      );
    }

    if (sLower.includes("approved") || sLower.includes("settled") || sLower.includes("paid")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase bg-[#E7F9F1] text-[#059669] border border-[#A7F3D0]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#059669]" />
          {statusText}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
        {statusText}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F8F6] p-6 lg:p-8 space-y-6 animate-fadeIn font-sans text-slate-800">
      
      {/* 1. SIX STATISTIC CARDS ROW */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        
        {/* Card 1: PENDING */}
        <div className="bg-white border border-[#E2E7E3] rounded-[16px] p-5 h-[150px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#FFF7E2] text-[#D97706] flex items-center justify-center shrink-0 border border-[#FDE68A]">
              <Clock className="h-5 w-5" />
            </div>
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest font-display">
              PENDING
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-auto">
            <span className="text-3xl font-extrabold text-slate-900 font-display leading-none">
              {REFERENCE_STATS.pending}
            </span>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
              REQUIRES ACTION
            </span>
          </div>

          {/* Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#FFBE00]"></div>
        </div>

        {/* Card 2: HOLD */}
        <div className="bg-white border border-[#E2E7E3] rounded-[16px] p-5 h-[150px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#F7E8FF] text-[#9333EA] flex items-center justify-center shrink-0 border border-[#F0ABFC]">
              <PauseCircle className="h-5 w-5" />
            </div>
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest font-display">
              HOLD
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-auto">
            <span className="text-3xl font-extrabold text-slate-900 font-display leading-none">
              {REFERENCE_STATS.hold}
            </span>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
              ON HOLD
            </span>
          </div>

          {/* Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#A855F7]"></div>
        </div>

        {/* Card 3: APPROVED */}
        <div className="bg-white border border-[#E2E7E3] rounded-[16px] p-5 h-[150px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#E7F9F1] text-[#059669] flex items-center justify-center shrink-0 border border-[#A7F3D0]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest font-display">
              APPROVED
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-auto text-center">
            <span className="text-3xl font-extrabold text-slate-900 font-display leading-none">
              {REFERENCE_STATS.approved}
            </span>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1 leading-tight">
              SUCCESSFULLY<br />COMPLETED
            </span>
          </div>

          {/* Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#10B981]"></div>
        </div>

        {/* Card 4: PROGRESS */}
        <div className="bg-white border border-[#E2E7E3] rounded-[16px] p-5 h-[150px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#EAF3FF] text-[#2563EB] flex items-center justify-center shrink-0 border border-[#BFDBFE]">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest font-display">
              PROGRESS
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-auto">
            <span className="text-3xl font-extrabold text-slate-900 font-display leading-none">
              {REFERENCE_STATS.progress}
            </span>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
              IN WORKFLOW
            </span>
          </div>

          {/* Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#3B82F6]"></div>
        </div>

        {/* Card 5: REJECTED */}
        <div className="bg-white border border-[#E2E7E3] rounded-[16px] p-5 h-[150px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#FFECEF] text-[#DC2626] flex items-center justify-center shrink-0 border border-[#FECDD3]">
              <XCircle className="h-5 w-5" />
            </div>
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest font-display">
              REJECTED
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-auto">
            <span className="text-3xl font-extrabold text-slate-900 font-display leading-none">
              {REFERENCE_STATS.rejected}
            </span>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
              NOT APPROVED
            </span>
          </div>

          {/* Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#EF4444]"></div>
        </div>

        {/* Card 6: TOTAL DOC */}
        <div className="bg-white border border-[#E2E7E3] rounded-[16px] p-5 h-[150px] flex flex-col justify-between shadow-2xs relative overflow-hidden group hover:shadow-md transition-all duration-200">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#E6F7FF] text-[#0284C7] flex items-center justify-center shrink-0 border border-[#BAE6FD]">
              <FileText className="h-5 w-5" />
            </div>
            <span className="text-xs font-black text-slate-700 uppercase tracking-widest font-display">
              TOTAL DOC
            </span>
          </div>

          <div className="flex flex-col items-center justify-center my-auto">
            <span className="text-3xl font-extrabold text-slate-900 font-display leading-none">
              {REFERENCE_STATS.totalDoc}
            </span>
            <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-1">
              ALL TIME
            </span>
          </div>

          {/* Bottom Accent Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[#003F28]"></div>
        </div>

      </div>

      {/* 2. DOCUMENT LIST CONTAINER */}
      <div className="bg-white border border-[#E3E8E4] rounded-[14px] p-6 shadow-2xs space-y-6">
        
        {/* Header & Date Filter */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-150">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-[#003F28]" />
            <h2 className="text-base font-black text-[#003F28] uppercase tracking-wide font-display">
              DOCUMENT LIST
            </h2>
          </div>

          {/* Date Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setTimeRangeOpen(!timeRangeOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#F7F8F6] border border-slate-250 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <CalendarDays className="h-4 w-4 text-[#003F28]" />
              <span className="uppercase">{timeRange}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {timeRangeOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setTimeRangeOpen(false)}></div>
                <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-40 text-xs font-bold font-sans">
                  {["ALL TIME", "TODAY", "THIS WEEK", "THIS MONTH"].map((range) => (
                    <button
                      key={range}
                      onClick={() => {
                        setTimeRange(range);
                        setTimeRangeOpen(false);
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 hover:text-[#003F28] transition-colors cursor-pointer"
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filter By Doc Type Pills */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mr-2 font-display">
              FILTER BY DOC TYPE:
            </span>
            
            {REFERENCE_DOC_TYPE_FILTERS.map((filter) => {
              const isActive = activeDocType.toUpperCase() === filter.label.toUpperCase();
              return (
                <button
                  key={filter.label}
                  onClick={() => setActiveDocType(filter.label)}
                  className={`px-3 py-1 rounded-[20px] text-[10.5px] font-extrabold uppercase tracking-wider transition-all duration-200 flex items-center gap-2 cursor-pointer shadow-2xs ${
                    isActive
                      ? "bg-[#003F28] text-white border border-[#003F28]"
                      : "bg-white text-slate-700 border border-[#E2E7E3] hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <span>{filter.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[9px] font-black font-mono ${
                    isActive ? "bg-[#FFBE00] text-[#003F28]" : "bg-slate-100 text-slate-600"
                  }`}>
                    {filter.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Document List Rows */}
        <div className="space-y-2 pt-2">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onViewDocument(doc.id)}
              className="bg-white border border-[#E6EAE7] rounded-[10px] px-4 py-3 hover:border-[#003F28] hover:shadow-md transition-all duration-200 flex items-center justify-between gap-4 cursor-pointer group"
            >
              {/* Left Side: Icon & Details */}
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Clock Icon Box */}
                <div className="h-9 w-9 rounded-lg bg-[#F7F8F6] border border-slate-200 flex items-center justify-center text-slate-500 shrink-0 group-hover:bg-emerald-50 group-hover:text-[#003F28] transition-colors">
                  <Clock className="h-4.5 w-4.5" />
                </div>

                <div className="flex flex-col min-w-0">
                  {/* Vendor Name */}
                  <span className="font-extrabold text-slate-900 text-sm tracking-tight font-display group-hover:text-[#003F28] transition-colors truncate">
                    {doc.vendor_name}
                  </span>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 font-sans mt-0.5">
                    {/* Doc Type Badge */}
                    <span className="bg-[#F1F5F2] text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-200">
                      {doc.document_type}
                    </span>

                    <span className="text-slate-300">|</span>

                    {/* Doc ID */}
                    <span className="font-mono text-slate-600 text-[11px] font-bold">
                      {doc.id}
                    </span>

                    <span className="text-slate-300">|</span>

                    {/* Invoice Number */}
                    <span className="font-mono text-slate-600 text-[11px]">
                      {doc.invoice_number}
                    </span>

                    <span className="text-slate-300">|</span>

                    {/* Date */}
                    <span className="font-mono text-slate-500 text-[11px]">
                      {doc.invoice_date}
                    </span>

                    <span className="text-slate-400">•</span>

                    {/* Status Badge */}
                    {renderStatusBadge(doc.status, doc.status_badge_type)}
                  </div>
                </div>
              </div>

              {/* Right Side: Amount & Circular Arrow Button */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1">
                    AMOUNT
                  </span>
                  <span className="text-base font-black text-slate-900 tracking-tight font-display leading-none">
                    ₹{doc.amount.toLocaleString("en-IN")}
                  </span>
                </div>

                {/* Circular Arrow Button */}
                <div className="h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[#003F28] shadow-2xs group-hover:bg-[#003F28] group-hover:text-white group-hover:border-[#003F28] transition-all duration-200">
                  <ArrowRight className="h-4 w-4 transform group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
}
