import React, { useState, useMemo } from "react";
import {
  MessageSquare,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  ImageIcon,
  ArrowRight,
  Filter,
  RefreshCw,
  User,
  Building,
  Calendar,
  AlertCircle,
  FileText,
  Activity,
  Kanban,
  ListFilter,
  Layers,
  ShieldCheck,
  CheckCheck,
} from "lucide-react";
import { DbInvoice } from "../types";
import { formatDocNumber, formatDate, formatDateTime, getCanonicalDocumentType } from "../utils/formatters";
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
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "PROGRESS" | "CLEARED">("ALL");
  const [viewMode, setViewMode] = useState<"TRACKER" | "REGISTRY">("TRACKER");
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; title?: string } | null>(null);

  // Filter only Customer Feedback documents
  const feedbackDocs = useMemo(() => {
    return documents.filter((doc) => {
      const rawType = (
        doc.document_type ||
        doc.subtype_of_complaint ||
        doc.type_of_complaint ||
        ""
      ).toUpperCase();
      const canonicalType = getCanonicalDocumentType(rawType);
      const docIdUpper = (doc.id || "").toUpperCase();
      const docNumUpper = (doc.document_number || doc.invoice_number || "").toUpperCase();

      return (
        canonicalType === "CUSTOMER FEEDBACK" ||
        docIdUpper.startsWith("CMP") ||
        docIdUpper.startsWith("CF") ||
        docNumUpper.startsWith("CMP") ||
        docNumUpper.startsWith("CF") ||
        Boolean(doc.type_of_complaint)
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

  // Helper to categorize document status into Pending, Progress, Cleared
  const getFeedbackCategory = (doc: DbInvoice): "PENDING" | "PROGRESS" | "CLEARED" => {
    const st = (doc.status || "").toLowerCase().trim();
    if (st.includes("approved") || st.includes("cleared") || st.includes("settled") || st.includes("resolved") || st.includes("completed")) {
      return "CLEARED";
    }
    if (st.includes("progress") || st.includes("investigat") || st.includes("routing") || st.includes("processing")) {
      return "PROGRESS";
    }
    // Default to PENDING for new / initiated / unrouted / review items
    return "PENDING";
  };

  // Filtered feedback list based on search and status tabs
  const filteredDocs = useMemo(() => {
    return feedbackDocs.filter((doc) => {
      const category = getFeedbackCategory(doc);

      // 1. Status Filter
      if (statusFilter !== "ALL" && category !== statusFilter) {
        return false;
      }

      // 2. Search Term
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
  }, [feedbackDocs, statusFilter, searchTerm]);

  // KPI Calculations
  const totalCount = feedbackDocs.length;
  const pendingCount = feedbackDocs.filter((d) => getFeedbackCategory(d) === "PENDING").length;
  const progressCount = feedbackDocs.filter((d) => getFeedbackCategory(d) === "PROGRESS").length;
  const clearedCount = feedbackDocs.filter((d) => getFeedbackCategory(d) === "CLEARED").length;
  const withImagesCount = feedbackDocs.filter((d) => d.image_1 || d.image_2 || d.image_3 || d.image_4 || d.image_5).length;

  // Render Details view if a record is selected
  if (selectedDocId) {
    return (
      <CustomerFeedbackDetails
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
      
      {/* 1. TOP HEADER & VIEW MODE SWITCHER */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#003F28] text-white flex items-center justify-center shadow-md shrink-0">
            <MessageSquare className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Customer Feedback Hub</span>
              <span className="text-xs bg-emerald-100 text-emerald-900 font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                {totalCount} RECORDS
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Track customer complaint lifecycle, workflow stages, and physical document evidence.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View Mode Toggle: Work Tracker vs Registry */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode("TRACKER")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                viewMode === "TRACKER"
                  ? "bg-[#003F28] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <Kanban className="h-3.5 w-3.5" />
              <span>Work Tracker</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("REGISTRY")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                viewMode === "REGISTRY"
                  ? "bg-[#003F28] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              <ListFilter className="h-3.5 w-3.5" />
              <span>Registry Table</span>
            </button>
          </div>

          {onRefreshDocs && (
            <button
              type="button"
              onClick={onRefreshDocs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-extrabold transition cursor-pointer shadow-2xs"
              title="Refresh Records"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. FEEDBACK STAT STRIP (3 CARDS ONLY: PENDING REVIEW, IN PROGRESS, CLEARED / RESOLVED) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div 
          onClick={() => setStatusFilter("PENDING")}
          className={`bg-white border rounded-xl p-3 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            statusFilter === "PENDING" ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20" : "border-slate-200 hover:border-amber-400"
          }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">PENDING REVIEW</span>
            <div className="text-xl font-black text-slate-900 mt-0.5">{pendingCount}</div>
          </div>
          <div className="h-8 w-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
            <Clock className="h-4 w-4" />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter("PROGRESS")}
          className={`bg-white border rounded-xl p-3 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            statusFilter === "PROGRESS" ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20" : "border-slate-200 hover:border-blue-400"
          }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">IN PROGRESS</span>
            <div className="text-xl font-black text-slate-900 mt-0.5">{progressCount}</div>
          </div>
          <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
            <Activity className="h-4 w-4" />
          </div>
        </div>

        <div 
          onClick={() => setStatusFilter("CLEARED")}
          className={`bg-white border rounded-xl p-3 shadow-2xs flex items-center justify-between cursor-pointer transition-all ${
            statusFilter === "CLEARED" ? "border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/20" : "border-slate-200 hover:border-emerald-400"
          }`}
        >
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">CLEARED / RESOLVED</span>
            <div className="text-xl font-black text-slate-900 mt-0.5">{clearedCount}</div>
          </div>
          <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <CheckCheck className="h-4 w-4 text-emerald-800" />
          </div>
        </div>
      </div>

      {/* 3. WORK TRACKER FILTER BAR & SEARCH */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Dedicated Status Filters: ALL, PENDING, IN PROGRESS, CLEARED */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          {[
            { id: "ALL", label: `All (${totalCount})` },
            { id: "PENDING", label: `Pending (${pendingCount})` },
            { id: "PROGRESS", label: `In Progress (${progressCount})` },
            { id: "CLEARED", label: `Cleared (${clearedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                statusFilter === tab.id
                  ? "bg-[#003F28] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative flex-1 max-w-md min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search complaint ID, account, dealer, employee..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
          />
        </div>
      </div>

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
                            <span className="text-[8.5px] bg-emerald-50 text-emerald-800 font-extrabold px-1 py-0 rounded border border-emerald-200 flex items-center gap-0.5">
                              <ImageIcon className="h-2 w-2 text-emerald-700" />
                              <span>Evidence</span>
                            </span>
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
                            : "bg-amber-50 text-amber-900 border-amber-200"
                        }`}
                      >
                        {category === "CLEARED" ? (
                          <CheckCheck className="h-2.5 w-2.5 text-emerald-700" />
                        ) : category === "PROGRESS" ? (
                          <Activity className="h-2.5 w-2.5 text-blue-700" />
                        ) : (
                          <Clock className="h-2.5 w-2.5 text-amber-700" />
                        )}
                        <span>{category === "CLEARED" ? "CLEARED" : category === "PROGRESS" ? "IN PROGRESS" : "PENDING"}</span>
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
                          {doc.document_number || doc.id}
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
                                : "bg-amber-50 text-amber-900 border-amber-200"
                            }`}
                          >
                            {category === "CLEARED" ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                            ) : category === "PROGRESS" ? (
                              <Activity className="h-3 w-3 text-blue-700" />
                            ) : (
                              <Clock className="h-3 w-3 text-amber-700" />
                            )}
                            <span>{category === "CLEARED" ? "CLEARED" : category === "PROGRESS" ? "IN PROGRESS" : "PENDING"}</span>
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
                src={previewImageModal.url}
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
