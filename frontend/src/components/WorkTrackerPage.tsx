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
      default:
        return <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 shadow-sm">{status}</span>;
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
      {/* Header Banner */}
      <div className="bg-slate-900 rounded-xl px-4 py-2.5 shadow-lg bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black relative overflow-hidden flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 border border-slate-700/50 mb-5">
        <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-80"></div>
        <div className="relative z-10">
          <h2 className="text-lg font-black font-display text-white tracking-tight leading-tight">Executive Dashboard</h2>
          <p className="text-blue-400 text-[9px] mt-0.5 font-bold tracking-widest uppercase">Real-time operational pipeline</p>
        </div>

        {/* Global vs Personal Toggle */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 shadow-inner relative z-10 backdrop-blur-md">
          <button
            onClick={() => setViewMode("global")}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-[10px] font-bold transition-all ${viewMode === "global" ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Globe className="h-3 w-3" />
            <span>Global Pipeline</span>
          </button>
          <button
            onClick={() => setViewMode("personal")}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded text-[10px] font-bold transition-all ${viewMode === "personal" ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <User className="h-3 w-3" />
            <span>My Tasks</span>
          </button>
        </div>
      </div>

      {/* KPI Glassmorphism Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 relative z-20">
        {/* KPI 1 */}
        <div 
          onClick={() => setKpiFilter('all')}
          className={`bg-gradient-to-br from-white to-blue-50/80 backdrop-blur-xl p-2.5 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(59,130,246,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative group min-h-[80px] ${kpiFilter === 'all' ? 'border-2 border-blue-400 ring-2 ring-blue-50/50' : 'border border-blue-100/50 hover:border-blue-300'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-50/0 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-1.5 relative z-10">
            <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${kpiFilter === 'all' ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`}>Active Pipeline Value</span>
            <div className="bg-blue-50 text-blue-600 rounded flex items-center justify-center p-1 border border-blue-100/50 shadow-sm"><IndianRupee className="h-3.5 w-3.5" /></div>
          </div>
          <h3 className={`text-xl font-black font-display tracking-tight relative z-10 transition-colors ${kpiFilter === 'all' ? 'text-blue-700' : 'text-slate-800 group-hover:text-blue-600'}`}>
            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(kpis.pipelineValue)}
          </h3>
        </div>

        {/* KPI 2 */}
        <div 
          onClick={() => setKpiFilter(kpiFilter === 'grn' ? 'all' : 'grn')}
          className={`bg-gradient-to-br from-white to-teal-50/80 backdrop-blur-xl p-2.5 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(20,184,166,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative group min-h-[80px] ${kpiFilter === 'grn' ? 'border-2 border-teal-400 ring-2 ring-teal-50/50' : 'border border-teal-100/50 hover:border-teal-300'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-teal-50/0 to-teal-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-1.5 relative z-10">
            <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${kpiFilter === 'grn' ? 'text-teal-600' : 'text-slate-500 group-hover:text-slate-700'}`}>Pending GRN Blockade</span>
            <div className="bg-teal-50 text-teal-600 rounded flex items-center justify-center p-1 border border-teal-100/50 shadow-sm"><Activity className="h-3.5 w-3.5" /></div>
          </div>
          <div className="flex items-baseline space-x-2 relative z-10">
            <h3 className={`text-xl font-black font-display tracking-tight transition-colors ${kpiFilter === 'grn' ? 'text-teal-700' : 'text-slate-800 group-hover:text-teal-600'}`}>{kpis.pendingGrns}</h3>
            <span className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${kpiFilter === 'grn' ? 'text-teal-500' : 'text-slate-400'}`}>Documents</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div 
          onClick={() => setKpiFilter(kpiFilter === 'aging' ? 'all' : 'aging')}
          className={`bg-gradient-to-br from-white to-rose-50/80 backdrop-blur-xl p-2.5 rounded-xl flex flex-col justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(244,63,94,0.12)] hover:-translate-y-1 transition-all duration-300 cursor-pointer relative group min-h-[80px] ${kpiFilter === 'aging' ? 'border-2 border-rose-400 ring-2 ring-rose-50/50' : 'border border-rose-100/50 hover:border-rose-300'}`}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-rose-50/0 to-rose-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl pointer-events-none"></div>
          <div className="flex items-center justify-between mb-1.5 relative z-10">
            <span className={`text-[9px] font-bold uppercase tracking-widest transition-colors ${kpiFilter === 'aging' ? 'text-rose-600' : 'text-slate-500 group-hover:text-slate-700'}`}>Aging / Bottlenecks</span>
            <div className="bg-rose-50 text-rose-600 rounded flex items-center justify-center p-1 border border-rose-100/50 shadow-sm"><Clock className="h-3.5 w-3.5" /></div>
          </div>
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-baseline space-x-2">
              <h3 className={`text-xl font-black font-display tracking-tight transition-colors ${kpiFilter === 'aging' ? 'text-rose-700' : 'text-slate-800 group-hover:text-rose-600'}`}>{kpis.stuckDocs}</h3>
              <span className={`text-[8px] font-bold uppercase tracking-widest mt-0.5 ${kpiFilter === 'aging' ? 'text-rose-500' : 'text-slate-400'}`}>Aging {'>'}</span>
            </div>
            {isCustomSla ? (
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <input 
                  type="number" 
                  value={customValue} 
                  onChange={e => setCustomValue(parseInt(e.target.value) || 0)}
                  className={`w-10 text-[9px] font-bold outline-none rounded px-1.5 py-0.5 border ${kpiFilter === 'aging' ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-white border-slate-300 text-slate-800'}`}
                  autoFocus
                />
                <select
                  value={customUnit}
                  onChange={e => setCustomUnit(e.target.value as any)}
                  className={`text-[9px] font-bold outline-none cursor-pointer rounded px-1 py-0.5 border ${kpiFilter === 'aging' ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-white border-slate-300 text-slate-800'}`}
                >
                  <option value="Hours">Hours</option>
                  <option value="Days">Days</option>
                  <option value="Weeks">Weeks</option>
                </select>
                <button 
                  onClick={() => { 
                    setIsCustomSla(false);
                    let finalHours = customValue;
                    if (customUnit === 'Days') finalHours *= 24;
                    if (customUnit === 'Weeks') finalHours *= 168;
                    if (finalHours === 0) finalHours = globalSlaHours;
                    updateSlaHours(finalHours);
                    const newSaved = [...new Set([...savedCustomSlas, finalHours])];
                    setSavedCustomSlas(newSaved);
                    localStorage.setItem("worktracker_customSlas", JSON.stringify(newSaved));
                  }}
                  className={`ml-1 text-[8px] font-bold px-1.5 py-0.5 rounded border ${kpiFilter === 'aging' ? 'bg-rose-200 text-rose-800 border-rose-300 hover:bg-rose-300' : 'bg-slate-200 text-slate-700 border-slate-300 hover:bg-slate-300'}`}
                >
                  OK
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setIsDropdownOpen(!isDropdownOpen); }}
                  className={`flex items-center justify-between text-[9px] font-bold outline-none cursor-pointer rounded px-1.5 py-0.5 transition-colors border w-24 ${
                    kpiFilter === 'aging' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-600 border-slate-200 group-hover:bg-rose-50 group-hover:text-rose-600'
                  }`}
                >
                  <span>{formatCustomSla(slaHours)} {slaHours === globalSlaHours ? '(System)' : ''}</span>
                  <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
                </button>
                
                {isDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsDropdownOpen(false); }}></div>
                    <div 
                      className="absolute top-full mt-1 right-0 w-[140px] bg-white border border-slate-200 rounded shadow-lg py-1 z-50 max-h-[200px] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {[...new Set([12, 24, 48, 72, 96, 168, 336, globalSlaHours, ...savedCustomSlas])]
                        .filter(val => !hiddenSlas.includes(val))
                        .sort((a,b) => a-b)
                        .map(val => (
                          <div 
                            key={val} 
                            className={`group/item flex items-center justify-between px-2 py-1 text-[10px] font-medium cursor-pointer ${slaHours === val ? 'bg-rose-50 text-rose-700' : 'text-slate-700 hover:bg-slate-50'}`}
                            onClick={() => { updateSlaHours(val); setIsDropdownOpen(false); }}
                          >
                            <span>{formatCustomSla(val)} {val === globalSlaHours ? '(System)' : ''}</span>
                            {val !== globalSlaHours && (
                              <X 
                                className="w-3 h-3 text-slate-400 opacity-0 group-hover/item:opacity-100 hover:text-rose-500 transition-all" 
                                onClick={(e) => deleteDuration(e, val)}
                              />
                            )}
                          </div>
                      ))}
                      
                      {![...new Set([12, 24, 48, 72, 96, 168, 336, globalSlaHours, ...savedCustomSlas])]
                        .filter(val => !hiddenSlas.includes(val)).includes(slaHours) && (
                        <div className="px-2 py-1 text-[10px] font-medium text-rose-700 bg-rose-50 cursor-default flex items-center justify-between">
                          <span>{formatCustomSla(slaHours)} (Custom)</span>
                          <X 
                            className="w-3 h-3 text-slate-400 hover:text-rose-500 cursor-pointer" 
                            onClick={(e) => deleteDuration(e, slaHours)}
                          />
                        </div>
                      )}

                      <div className="border-t border-slate-100 my-1"></div>
                      <div 
                        className="px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                        onClick={() => {
                          setCustomValue(slaHours);
                          setCustomUnit('Hours');
                          setIsCustomSla(true);
                          setIsDropdownOpen(false);
                        }}
                      >
                        + Add Custom...
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
      <div className="bg-white/90 backdrop-blur-xl rounded-[1rem] border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
            <thead>
              <tr className="bg-blue-950 border-b border-blue-900 text-[10px] uppercase tracking-wider text-slate-300 font-black">
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
                    <td className="py-2.5 px-4 text-[10px] font-black text-slate-800 whitespace-nowrap">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      {doc.id}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-slate-900 truncate">{doc.vendor_name || "Unknown Vendor"}</span>
                        <span className="text-[10px] font-semibold text-slate-500 tracking-wide uppercase">{doc.document_type || "Invoice"} • {doc.invoice_number || "Pending"}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-[12px] font-bold text-slate-900 text-right whitespace-nowrap tracking-tight tabular-nums">
                      {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(doc.amount || 0)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap flex items-center space-x-2">
                      {isAging && (
                        <span className="relative flex h-2 w-2 mr-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                        </span>
                      )}
                      {getStatusPill(doc)}
                    </td>
                    <td className="py-2.5 px-2 text-[10px] font-bold text-slate-600 whitespace-nowrap">
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

