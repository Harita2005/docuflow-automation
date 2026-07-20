import { 
  LayoutDashboard, 
  Upload, 
  ListOrdered, 
  FileCheck, 
  GitBranch, 
  LineChart, 
  Receipt, 
  Settings, 
  CheckSquare, 
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";

interface SidebarProps {
  
  currentView: string;
  setCurrentView: (view: string) => void;
  currentUserRole: string;
  stats: any;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({
  currentView,
  setCurrentView,
  currentUserRole,
  stats,
  collapsed,
  setCollapsed
}: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = !collapsed || isHovered;
  
  const isAdmin = currentUserRole === "admin";
  const isEmployee = currentUserRole === "employee" || isAdmin;

  const menuGroups = [
    {
      group: "Main",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "work-tracker", label: "Work Tracker", icon: Layers },
      ]
    },
    isEmployee ? {
      group: "Documents",
      items: [
        { id: "upload", label: "Upload Document", icon: Upload },
      ]
    } : null,
    isEmployee ? {
      group: "Verification",
      items: [
        { id: "data-verification", label: "Data Verification", icon: FileCheck },
        { id: "goods-receipt", label: "Goods Receipt", icon: ClipboardList, badge: stats?.waitingForGRN || 0 },
      ]
    } : null,

    isAdmin ? {
      group: "Administration",
      items: [
        { id: "admin", label: "Control Settings", icon: Settings },
      ]
    } : null
  ].filter(Boolean) as any[];

  return (
    <aside 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-300 flex flex-col z-40 ${
        !isExpanded ? "w-20" : "w-68"
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-extrabold shrink-0 shadow-lg shadow-blue-500/20">
            <Layers className="h-5 w-5" />
          </div>
          {isExpanded && (
            <div className="flex flex-col">
              <span className="font-extrabold text-white text-base tracking-tight font-display">DocuFlow</span>
              <span className="text-[10px] text-blue-400 font-medium tracking-widest uppercase">AP Enterprise</span>
            </div>
          )}
        </div>
        <button 
          onClick={() => setCollapsed(!collapsed)} 
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition hidden md:block"
        >
          {!isExpanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Menu Area */}
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-7">
        {menuGroups.map((group, gIdx) => {
          // If all items in a group are hidden based on role, hide group
          return (
            <div key={gIdx} className="space-y-2">
              {isExpanded && (
                <span className="text-[9px] font-semibold text-slate-500/70 uppercase tracking-[0.15em] px-3 block">
                  {group.group}
                </span>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = currentView === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentView(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold tracking-wide transition-all group relative ${
                        active
                          ? "bg-blue-500/10 text-blue-400 font-bold border-l-2 border-blue-500 pl-2.5 rounded-l-none"
                          : "hover:bg-slate-800/40 text-slate-400 hover:text-slate-200 border-l-2 border-transparent pl-2.5 rounded-l-none"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-105 ${active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'}`} />
                        {isExpanded && <span className="truncate">{item.label}</span>}
                      </div>

                      {/* Optional Badge */}
                      {isExpanded && item.badge !== undefined && item.badge > 0 && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
                          active ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {item.badge}
                        </span>
                      )}

                      {/* Hover Tooltip if collapsed */}
                      {!isExpanded && (
                        <div className="absolute left-full ml-4 px-2.5 py-1.5 bg-slate-950 text-white text-[11px] font-bold rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 whitespace-nowrap shadow-xl z-50">
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

    </aside>
  );
}
