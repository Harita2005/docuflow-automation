import { 
  LayoutDashboard, 
  Upload, 
  Settings, 
  Layers,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useState } from "react";
import SidebarCulturalArt from "./SidebarCulturalArt";

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  currentUserRole: string;
  stats?: any;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  rolePermissions?: Record<string, string[]>;
}

export default function Sidebar({
  currentView,
  setCurrentView,
  currentUserRole,
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
      group: "OPERATIONS",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "work-tracker", label: "Work Tracker", icon: Layers },
        { id: "upload", label: "Upload Document", icon: Upload },
      ]
    },
    {
      group: "ADMINISTRATION",
      items: [
        { id: "admin", label: "Control Settings", icon: Settings },
      ]
    }
  ];

  return (
    <aside 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-gradient-to-b from-[#003F28] via-[#00452B] to-[#005333] text-emerald-100 border-r border-[#005333]/80 transition-all duration-300 flex flex-col z-40 relative overflow-hidden select-none shrink-0 ${
        !isExpanded ? "w-20" : "w-[338px]"
      }`}
      style={{ height: '100vh' }}
    >
      {/* 1. BRAND HEADER (~90px Height) */}
      <div className="h-[90px] px-6 border-b border-emerald-800/40 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4 overflow-hidden">
          {/* Logo 50x50px */}
          <div className="h-[50px] w-[50px] bg-white text-[#003F28] rounded-[12px] flex items-center justify-center font-extrabold shrink-0 shadow-md border border-white/20">
            <Layers className="h-7 w-7 text-[#003F28]" />
          </div>

          {isExpanded && (
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-white text-[21px] tracking-tight font-display leading-tight">
                DAAS
              </span>
              <span className="text-[10px] text-[#A3BFB0] font-bold tracking-[0.08em] uppercase leading-tight font-sans mt-0.5">
                DOCUMENT APPROVAL &<br />AUTOMATION SYSTEM
              </span>
            </div>
          )}
        </div>

        <button 
          onClick={() => setCollapsed(!collapsed)} 
          aria-label={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          className="p-1.5 rounded-lg hover:bg-emerald-800/60 text-[#A3BFB0] hover:text-white transition hidden md:block cursor-pointer"
        >
          {!isExpanded ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      {/* 2. MENU NAVIGATION AREA */}
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-7 z-20 relative">
        {menuGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => permissions.includes(item.id));
          if (visibleItems.length === 0) return null;
          return (
            <div key={gIdx} className="space-y-3">
              {isExpanded && (
                <span className="text-[11px] font-bold text-[#8FA99B] uppercase tracking-[2px] px-3 block">
                  {group.group}
                </span>
              )}
              <div className="space-y-2">
                {visibleItems.map((item) => {
                  const active = currentView === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentView(item.id)}
                      className={`w-full flex items-center justify-between h-[44px] px-4 rounded-[8px] text-sm font-bold tracking-wide transition-all duration-200 group relative cursor-pointer ${
                        active
                          ? "bg-[#FFBE00] text-[#003F28] font-black shadow-md"
                          : "text-emerald-100/90 hover:text-white hover:bg-emerald-800/30"
                      }`}
                    >
                      <div className="flex items-center gap-[14px]">
                        <Icon className={`h-5 w-5 shrink-0 transition-transform group-hover:scale-105 ${
                          active ? 'text-[#003F28]' : 'text-emerald-200/90 group-hover:text-white'
                        }`} />
                        {isExpanded && <span className="truncate">{item.label}</span>}
                      </div>

                      {/* Collapsed Tooltip */}
                      {!isExpanded && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap shadow-xl z-50">
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

      {/* 3. CULTURAL ARTWORK & DECORATIVE GEOMETRIC BOTTOM */}
      {isExpanded && (
        <div className="relative w-full h-[280px] pointer-events-none select-none z-10 mt-auto overflow-hidden">
          {/* Tamil Gopuram Temple Line-Art SVG */}
          <div className="absolute left-0 bottom-[60px] w-full h-[240px] opacity-90 z-10">
            <SidebarCulturalArt />
          </div>

          {/* Deep Red Diagonal Polygon (#C90818) */}
          <div className="absolute bottom-0 left-0 w-[240px] h-[170px] z-20">
            <svg className="w-full h-full" viewBox="0 0 240 170" preserveAspectRatio="none">
              <polygon points="0,170 0,30 200,170" fill="#C90818" />
              {/* Thin Golden Edge Line */}
              <polyline points="0,30 200,170" stroke="#FFBE00" strokeWidth="1.5" opacity="0.6" />
            </svg>
          </div>

          {/* Golden Yellow Diagonal Polygon (#FFBE00) */}
          <div className="absolute bottom-0 right-0 w-[220px] h-[140px] z-30">
            <svg className="w-full h-full" viewBox="0 0 220 140" preserveAspectRatio="none">
              <polygon points="40,140 220,10 220,140" fill="#FFBE00" />
            </svg>
          </div>

          {/* Golden Dotted Matrix (5x4) near bottom-left */}
          <div className="absolute bottom-6 left-6 grid grid-cols-5 gap-2 opacity-50 z-40">
            {[...Array(20)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#E5B300]" />
            ))}
          </div>

          {/* Bottom Tagline Text */}
          <div className="absolute bottom-5 right-6 text-right z-40">
            <div className="w-8 h-[2px] bg-[#003F28]/60 mb-1 ml-auto"></div>
            <div className="text-[11px] font-bold text-[#003F28] leading-tight font-display tracking-tight">
              Automate Today<br />
              Enable Tomorrow
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
