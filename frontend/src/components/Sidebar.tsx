import { 
  LayoutDashboard, 
  Upload, 
  ListOrdered, 
  FileCheck, 
  GitBranch, 
  LineChart, 
  Receipt, 
  Settings, 
  Settings2,
  CheckSquare, 
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Globe,
  Sliders,
  ListFilter,
  Share2
} from "lucide-react";

import { useState } from "react";

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  currentUserRole: string;
  stats: any;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  rolePermissions?: Record<string, string[]>;
}

export default function Sidebar({
  currentView,
  setCurrentView,
  currentUserRole,
  stats,
  collapsed,
  setCollapsed,
  rolePermissions
}: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = !collapsed || isHovered;
  
  const permissions = rolePermissions?.[currentUserRole] || (
    currentUserRole === "admin" ? ["dashboard", "work-tracker", "upload", "data-verification", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"] :
    currentUserRole === "settings_editor" ? ["dashboard", "work-tracker", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"] :
    ["dashboard", "work-tracker", "dapi-sync-back"]
  );

  const menuGroups = [
    {
      group: "Operations",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "work-tracker", label: "Work Tracker", icon: Layers },
        { id: "upload", label: "Upload Document", icon: Upload },
      ]
    },
    {
      group: "Administration",
      items: [
        { id: "admin", label: "Control Settings", icon: Settings },
      ]
    }
  ];

  return (
    <aside 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-[#003d27] text-emerald-100 border-r border-emerald-900/60 transition-all duration-300 flex flex-col z-40 relative overflow-hidden select-none ${
        !isExpanded ? "w-20" : "w-68"
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-emerald-900/60 flex items-center justify-between z-10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-9 w-9 bg-white text-[#003d27] rounded-xl flex items-center justify-center font-extrabold shrink-0 shadow-lg">
            <Layers className="h-5 w-5 text-[#003d27]" />
          </div>
          {isExpanded && (
            <div className="flex flex-col min-w-0">
              <span className="font-black text-white text-base tracking-tight font-display">DAAS</span>
              <span className="text-[8px] text-emerald-200/80 font-bold tracking-wider uppercase truncate">Document Approval & Automation System</span>
            </div>
          )}
        </div>
        <button 
          onClick={() => setCollapsed(!collapsed)} 
          className="p-1 rounded-lg hover:bg-emerald-800/60 text-emerald-300 hover:text-white transition hidden md:block"
        >
          {!isExpanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Menu Area */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6 z-10">
        {menuGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => permissions.includes(item.id));
          if (visibleItems.length === 0) return null;
          return (
            <div key={gIdx} className="space-y-2">
              {isExpanded && (
                <span className="text-[9px] font-extrabold text-emerald-400/60 uppercase tracking-[0.2em] px-3 block">
                  {group.group}
                </span>
              )}
              <div className="space-y-1.5">
                {visibleItems.map((item) => {
                  const active = currentView === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentView(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold tracking-wide transition-all group relative cursor-pointer ${
                        active
                          ? "bg-[#f5a623] text-slate-950 font-black shadow-md"
                          : "text-emerald-100/80 hover:text-white hover:bg-emerald-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-105 ${active ? 'text-slate-950' : 'text-emerald-300/80 group-hover:text-white'}`} />
                        {isExpanded && <span className="truncate">{item.label}</span>}
                      </div>

                      {/* Optional Badge */}
                      {isExpanded && (item as any).badge !== undefined && (item as any).badge > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          active ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-900 text-emerald-200'
                        }`}>
                          {(item as any).badge}
                        </span>
                      )}

                      {/* Hover Tooltip if collapsed */}
                      {!isExpanded && (
                        <div className="absolute left-full ml-4 px-2.5 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap shadow-xl z-50">
                          {item.label}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sidebar Bottom Watermark Artwork */}
      {isExpanded && (
        <div className="relative h-44 w-full pointer-events-none select-none z-0 mt-auto">
          {/* Temple Gopuram Tower Silhouette Watermark */}
          <div className="absolute left-3 bottom-10 w-44 h-36 opacity-15">
            <svg className="w-full h-full stroke-emerald-100 fill-none" viewBox="0 0 200 250">
              <path d="M80 50 L120 50 L124 75 L76 75 Z" strokeWidth="1.2" />
              <path d="M76 75 L124 75 L128 105 L72 105 Z" strokeWidth="1.2" />
              <path d="M72 105 L128 105 L132 145 L68 145 Z" strokeWidth="1.2" />
              <path d="M68 145 L132 145 L136 195 L64 195 Z" strokeWidth="1.2" />
              <path d="M64 195 L136 195 L140 240 L60 240 Z" strokeWidth="1.5" />
            </svg>
          </div>

          {/* Bottom-Left Red Corner Shape */}
          <div className="absolute bottom-0 left-0 w-36 h-28 z-1">
            <svg className="w-full h-full" viewBox="0 0 150 120" preserveAspectRatio="none">
              <path d="M0 120 L0 40 Q70 80 110 120 Z" fill="#b91c1c" />
            </svg>
          </div>

          {/* Bottom-Left Red Dot Matrix (5x4) */}
          <div className="absolute bottom-3 left-3 grid grid-cols-5 gap-1.5 opacity-40 z-10">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full bg-red-200" />
            ))}
          </div>

          {/* Bottom-Right Golden Yellow Sweep */}
          <div className="absolute bottom-0 right-0 w-40 h-24 z-2">
            <svg className="w-full h-full" viewBox="0 0 160 100" preserveAspectRatio="none">
              <path d="M0 100 Q80 40 160 60 L160 100 Z" fill="#f5a623" />
            </svg>
          </div>

          {/* Tagline */}
          <div className="absolute bottom-2 right-4 text-[9px] font-extrabold text-slate-950 z-20 font-display">
            Automate Today<br />Enable Tomorrow
          </div>
        </div>
      )}

    </aside>
  );
}
