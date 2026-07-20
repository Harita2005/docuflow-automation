import React, { useState, useMemo } from "react";
import { Search, ListFilter, List, ArrowUpRight, Activity, Clock, IndianRupee, Globe, User, X, ChevronDown } from "lucide-react";
import { DbInvoice } from "../types.ts";

interface WorkTrackerPageProps {
  documents: DbInvoice[];
  onViewDocument: (id: string) => void;
}

export default function WorkTrackerPage({ documents, onViewDocument }: WorkTrackerPageProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [viewMode, setViewMode] = useState<"global" | "personal">("global");
  const [kpiFilter, setKpiFilter] = useState<'all' | 'grn' | 'aging'>('all');
  const [slaHours, setSlaHours] = useState(48);
  const [globalSlaHours, setGlobalSlaHours] = useState(48);
  const [isCustomSla, setIsCustomSla] = useState(false);
  const [customValue, setCustomValue] = useState<number>(0);
  const [customUnit, setCustomUnit] = useState<'Hours' | 'Days' | 'Weeks'>('Hours');
  const [savedCustomSlas, setSavedCustomSlas] = useState<number[]>([]);
  const [hiddenSlas, setHiddenSlas] = useState<number[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  React.useEffect(() => {
    const localSlaStr = localStorage.getItem("worktracker_slaHours");
    if (localSlaStr) setSlaHours(parseInt(localSlaStr));
    
    const customSlasStr = localStorage.getItem("worktracker_customSlas");
    if (customSlasStr) {
      try { setSavedCustomSlas(JSON.parse(customSlasStr)); } catch (e) {}
    }

    const hiddenSlasStr = localStorage.getItem("worktracker_hiddenSlas");
    if (hiddenSlasStr) {
      try { setHiddenSlas(JSON.parse(hiddenSlasStr)); } catch (e) {}
    }

    const fetchSla = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch("/api/admin/config", { headers: { "Authorization": `Bearer ${token}` } });
        if (res.ok) {
          const configs = await res.json();
          const slaConfig = configs.find((c: any) => c.key === "APPROVAL_SLA_HOURS");
          if (slaConfig && slaConfig.value) {
            const parsedSla = parseInt(slaConfig.value) || 48;
            setGlobalSlaHours(parsedSla);
            if (!localSlaStr) {
              setSlaHours(parsedSla);
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch SLA config", e);
      }
    };
    fetchSla();
  }, []);

  const updateSlaHours = (newSla: number) => {
    setSlaHours(newSla);
    localStorage.setItem("worktracker_slaHours", newSla.toString());
  };

  const deleteDuration = (e: React.MouseEvent, val: number) => {
    e.stopPropagation();
    if (savedCustomSlas.includes(val)) {
      const newSaved = savedCustomSlas.filter(s => s !== val);
      setSavedCustomSlas(newSaved);
      localStorage.setItem("worktracker_customSlas", JSON.stringify(newSaved));
    } else {
      const newHidden = [...new Set([...hiddenSlas, val])];
      setHiddenSlas(newHidden);
      localStorage.setItem("worktracker_hiddenSlas", JSON.stringify(newHidden));
    }
    if (slaHours === val) {
      updateSlaHours(globalSlaHours);
    }
  };

  const dynamicTypes = Array.from(new Set(documents.map(d => (d.document_type || "").toUpperCase().trim()).filter(Boolean)));
  const TABS = ["All", ...dynamicTypes];

  // --- Executive KPI Calculations ---
  const kpis = useMemo(() => {
    let pipelineValue = 0;
    let pendingGrns = 0;
    let stuckDocs = 0;

    const now = new Date().getTime();

    documents.forEach(doc => {
      // Exclude terminal states from pipeline value
      if (!["Paid", "Rejected", "Failed"].includes(doc.status)) {
        pipelineValue += (doc.amount || 0);
      }

      if (doc.status === "Waiting for GRN") {
        pendingGrns++;
      }

      // Check for aging (stuck for > slaHours)
      if (doc.status.includes("Approval")) {
        const created = new Date(doc.created_at || new Date()).getTime();
        const diffHours = (now - created) / (1000 * 60 * 60);
        if (diffHours > slaHours) {
          stuckDocs++;
        }
      }
    });

    return { pipelineValue, pendingGrns, stuckDocs };
  }, [documents, slaHours]);

  const formatCustomSla = (hours: number) => {
    if (hours % 168 === 0) return `${hours / 168} Week${hours / 168 > 1 ? 's' : ''}`;
    if (hours % 24 === 0) return `${hours / 24} Day${hours / 24 > 1 ? 's' : ''}`;
    return `${hours}H`;
  };

  const getStatusPill = (doc: DbInvoice) => {
    const status = doc.status;
    const log = doc.activeApprovalLog;

    if (status.includes("Approval")) {
      if (log) {
        if (log.status === "Approved") return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shadow-sm">Approved (Stage {log.current_stage_number})</span>;
        if (log.status === "Rejected") return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 shadow-sm">Rejected at Stage {log.current_stage_number}</span>;
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 shadow-sm border border-blue-200">Pending Stage {log.current_stage_number}</span>;
      }
      return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 shadow-sm">In progress</span>;
    }

    switch (status) {
      case "Received":
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-50 shadow-sm">New</span>;
      case "Waiting for GRN":
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-teal-800 text-teal-50 shadow-sm border border-teal-900/20">Waiting for GRN</span>;
      case "Approved":
      case "Paid":
      case "Ready for Payment":
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200">Completed</span>;
      case "Rejected":
      case "Failed":
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 shadow-sm">Blocked</span>;
      case "Duplicate":
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">Duplicate</span>;
      default:
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 shadow-sm border border-slate-200">{status}</span>;
    }
  };



  // Filter docs
  const filteredDocs = documents.filter(doc => {
    const docType = (doc.document_type || "Invoice").toLowerCase();

    // Tab filtering
    if (activeTab !== "All" && (doc.document_type || "").toUpperCase().trim() !== activeTab.toUpperCase().trim()) return false;

    // KPI filtering
    if (kpiFilter === "grn" && doc.status !== "Waiting for GRN") return false;
    if (kpiFilter === "aging") {
      const created = new Date(doc.created_at || new Date()).getTime();
      const diffHours = (new Date().getTime() - created) / (1000 * 60 * 60);
      const isAging = doc.status.includes("Approval") && diffHours > slaHours;
      if (!isAging) return false;
    }

    // Search filtering
    return (
      (doc.vendor_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.invoice_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      docType.includes(searchTerm.toLowerCase())
    );
  });

  return (
    <div className="space-y-4 animate-fadeIn pb-12">
      {/* Controls Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
        <div className="flex border-b border-slate-200 gap-6 w-full sm:w-auto overflow-x-auto hide-scrollbar">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`pb-2 text-[9px] uppercase tracking-widest font-black transition-colors whitespace-nowrap ${activeTab === t
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-slate-400 hover:text-slate-700'
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 max-w-sm w-full bg-white border border-slate-200/80 rounded-xl px-4 py-2 flex items-center space-x-3 focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor, ID, or type..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-0 outline-none text-[11px] text-slate-800 w-full placeholder-slate-400 focus:ring-0 p-0 font-sans font-bold tracking-wide"
          />
        </div>
      </div>

      {/* Highly Dense Data Table */}
      <div className="bg-white/90 backdrop-blur-xl rounded-[1rem] border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500 font-black">
                <th className="py-3 px-4 w-[12%] rounded-tl-xl">ID</th>
                <th className="py-3 px-2 w-[35%]">Document Details</th>
                <th className="py-3 px-2 text-right w-[18%]">Value</th>
                <th className="py-3 px-4 w-[18%]">Status Pulse</th>
                <th className="py-3 px-2 w-[17%] rounded-tr-xl">Assigned To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocs.map((doc, idx) => {
                // Check if aging
                const created = new Date(doc.created_at || new Date()).getTime();
                const isAging = doc.status.includes("Approval") && ((new Date().getTime() - created) / 3600000 > slaHours);

                return (
                  <tr key={doc.id} className="hover:bg-slate-50/80 group transition-all cursor-pointer relative" onClick={() => onViewDocument(doc.id)}>
                    <td className="py-1.5 px-4 text-[10px] font-black text-slate-800 whitespace-nowrap">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      {doc.tracking_id || doc.id}
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-slate-900 truncate">{doc.vendor_name || "Unknown Vendor"}</span>
                        <span className="text-[10px] font-semibold text-slate-500 tracking-wide uppercase">{doc.document_type || "Invoice"} • {doc.invoice_number || "Pending"}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-[12px] font-bold text-slate-900 text-right whitespace-nowrap tracking-tight tabular-nums">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(doc.amount || 0)}
                    </td>
                    <td className="py-1.5 px-4 whitespace-nowrap flex items-center space-x-2">
                      {isAging && (
                        <span className="relative flex h-2 w-2 mr-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                      )}
                      {getStatusPill(doc)}
                    </td>
                    <td className="py-1.5 px-2 text-[10px] font-bold text-slate-600 whitespace-nowrap">
                      {(doc as any).assigned_to || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredDocs.length === 0 && (
            <div className="text-center py-16 bg-slate-50/50">
              <List className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-800">No documents found</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Try adjusting your search filters or tabs.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

