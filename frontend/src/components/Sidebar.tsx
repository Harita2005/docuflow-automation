import React from "react";
import { 
  LayoutDashboard, 
  Upload, 
  Settings, 
  Layers,
  ChevronLeft
} from "lucide-react";
import kolamSolidImg from "../assets/kolam_solid_white.png";

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  currentUserRole: string;
  stats?: any;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  rolePermissions?: Record<string, string[]>;
}

// 1. BRAND HEADER COMPONENT (64px Height)
function SidebarBrand({ 
  isExpanded, 
  collapsed, 
  setCollapsed 
}: { 
  isExpanded: boolean; 
  collapsed: boolean; 
  setCollapsed: (c: boolean) => void;
}) {
  return (
    <div className={`h-[64px] border-b border-white/12 flex items-center justify-between z-30 shrink-0 relative ${
      !isExpanded ? "px-2 justify-center" : "px-3"
    }`}>
      <div 
        onClick={() => !isExpanded && setCollapsed(false)}
        className={`flex items-center gap-2 overflow-hidden ${!isExpanded ? "cursor-pointer" : ""}`}
        title={!isExpanded ? "Click to expand sidebar" : undefined}
      >
        {/* 34px x 34px White Rounded Square Logo Box */}
        <div className="h-[34px] w-[34px] bg-white text-[#003F29] rounded-md flex items-center justify-center font-extrabold shrink-0 shadow-md border border-white/20">
          <Layers className="h-4 w-4 text-[#003F29]" />
        </div>

        {isExpanded && (
          <div className="flex flex-col min-w-0">
            <span className="font-[800] text-white text-[15px] font-display leading-tight tracking-tight">
              DAAS
            </span>
            <span className="text-[7.5px] font-[600] tracking-[0.2px] text-white/70 uppercase leading-[1.2] font-sans mt-0.2">
              DOCUMENT APPROVAL &<br />AUTOMATION SYSTEM
            </span>
          </div>
        )}
      </div>

      {isExpanded && (
        <button 
          onClick={() => setCollapsed(!collapsed)} 
          aria-label="Collapse Sidebar"
          className="p-1 rounded text-white/75 hover:text-white hover:bg-white/10 transition flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// 2. NAV ITEM COMPONENT (36px Height)
function NavItem({
  label,
  icon: Icon,
  active,
  isExpanded,
  onClick
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  isExpanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className={`h-[36px] rounded-[6px] flex items-center transition-all duration-200 group relative cursor-pointer ${
        !isExpanded ? "w-[40px] mx-auto justify-center px-0" : "w-full px-2.5 gap-[8px] justify-start"
      } ${
        active
          ? "bg-[#FFBF00] text-[#002F20] font-bold shadow-[0_2px_4px_rgba(0,0,0,0.15)] border border-[#001F16]"
          : "text-[#D8EEE4] hover:text-white hover:bg-white/8"
      }`}
    >
      <Icon 
        className={`h-[16px] w-[16px] shrink-0 transition-transform group-hover:scale-105 ${
          active ? "text-[#003F29]" : "text-[#9FD7C0] group-hover:text-white"
        }`} 
      />

      {isExpanded && (
        <span className={`text-[11.5px] truncate font-sans ${active ? "font-bold text-[#002F20]" : "font-[600]"}`}>
          {label}
        </span>
      )}

      {/* Collapsed Tooltip */}
      {!isExpanded && (
        <div className="absolute left-full ml-3 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap shadow-xl z-50">
          {label}
        </div>
      )}
    </button>
  );
}

// 3. BACKGROUND ARTWORK & GEOMETRIC LAYER COMPONENT
function SidebarBackgroundArtwork({ isExpanded }: { isExpanded: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none overflow-hidden z-10">
      
      {/* LAYER 1: Dark Forest Green Base Gradient (Rich & Premium) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#004B32] via-[#003F29] to-[#002E1E]" />

      {/* LAYER 2: Upper-Right Subtle Dot Matrix Grid (4x5 Grid) */}
      {isExpanded && (
        <div className="absolute top-[75px] right-2.5 grid grid-cols-4 gap-1.5 opacity-20 z-20">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-[#9FD7C0]" />
          ))}
        </div>
      )}

      {isExpanded && (
        <img
          src={kolamSolidImg}
          alt=""
          aria-hidden="true"
          className="absolute inset-x-[-18px] top-[300px] bottom-20 w-[116%] max-w-none object-contain opacity-20 pointer-events-none"
        />
      )}

      {/* LOWER RED & YELLOW GEOMETRIC BRANDING FOOTER WITH SLOGAN & DOT MATRIX */}
      {isExpanded && (
        <div className="absolute bottom-0 left-0 right-0 h-[140px] z-20 overflow-hidden pointer-events-none">
          
          {/* Bottom-Left Red Polygon (#D90816) with Gold Edge */}
          <div className="absolute inset-0 z-10">
            <svg className="w-full h-full" viewBox="0 0 230 140" preserveAspectRatio="none" fill="none">
              <polygon points="0,140 0,40 150,140" fill="#D90816" />
              <line x1="0" y1="40" x2="150" y2="140" stroke="#FFBF00" strokeWidth="2" />
            </svg>
          </div>

          {/* Bottom-Right Yellow Polygon (#FFBF00) */}
          <div className="absolute inset-0 z-20">
            <svg className="w-full h-full" viewBox="0 0 230 140" preserveAspectRatio="none" fill="none">
              <polygon points="85,140 230,65 230,140" fill="#FFBF00" />
            </svg>
          </div>

          {/* 5x5 Gold Dot Matrix inside bottom-left Red area */}
          <div className="absolute bottom-[12px] left-[10px] grid grid-cols-5 gap-1 opacity-65 z-30">
            {[...Array(25)].map((_, i) => (
              <div key={i} className="w-1 h-1 rounded-full bg-[#FFBF00]" />
            ))}
          </div>

          {/* Bottom Slogan Text on Yellow Area */}
          <div className="absolute bottom-2.5 right-2.5 text-right z-30 pointer-events-auto">
            <div className="w-4 h-[1.5px] bg-[#002F20]/70 mb-0.5 ml-auto" />
            <div className="text-[8.5px] font-[700] text-[#002F20] leading-[1.2] font-display tracking-tight">
              Automate Today<br />
              Enable Tomorrow
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

// MAIN SIDEBAR EXPORT
export default function Sidebar({
  currentView,
  setCurrentView,
  currentUserRole,
  collapsed,
  setCollapsed,
  rolePermissions
}: SidebarProps) {
  const isExpanded = !collapsed;

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
      className={`fixed left-0 top-0 h-screen z-40 overflow-hidden select-none transition-all duration-300 flex flex-col shrink-0 ${
        !isExpanded ? "w-[72px]" : "w-[230px]"
      }`}
      style={{
        ["--daas-sidebar-green" as any]: "#004B32",
        ["--daas-sidebar-dark" as any]: "#003F29",
        ["--daas-green" as any]: "#005638",
        ["--daas-yellow" as any]: "#FFBF00",
        ["--daas-red" as any]: "#D90816",
        ["--daas-gold" as any]: "#D9A900",
        ["--daas-white" as any]: "#FFFFFF"
      }}
    >
      {/* Background Artwork Layers */}
      <SidebarBackgroundArtwork isExpanded={isExpanded} />

      {/* TOP BRAND SECTION */}
      <SidebarBrand 
        isExpanded={isExpanded} 
        collapsed={collapsed} 
        setCollapsed={setCollapsed} 
      />

      {/* NAVIGATION SECTION */}
      <div className="flex-1 overflow-y-auto px-2 py-3.5 space-y-4 z-30 relative custom-scrollbar">
        {menuGroups.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => permissions.includes(item.id));
          if (visibleItems.length === 0) return null;
          return (
            <div key={gIdx} className="space-y-0.5">
              {isExpanded && (
                <span className="text-[8.5px] font-[700] tracking-[1.2px] text-white/50 uppercase mb-1.5 px-2 block font-sans">
                  {group.group}
                </span>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = currentView === item.id;
                  return (
                    <NavItem
                      key={item.id}
                      label={item.label}
                      icon={item.icon}
                      active={active}
                      isExpanded={isExpanded}
                      onClick={() => setCurrentView(item.id)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
