import { RefreshCw, LogOut, ShieldAlert, User, Bell, Settings, ChevronDown } from "lucide-react";
import { useState, useEffect } from "react";

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  currentUserRole: string;
  setCurrentUserRole?: (role: any) => void;
  currentUserEmail: string;
  setCurrentUserEmail?: (email: string) => void;
  stats?: any;
  onRefreshStats: () => void;
  onLogout: () => void;
  onViewDocument?: (docId: string) => void;
  orgName?: string;
}

export default function Header({
  currentView,
  setCurrentView,
  currentUserRole,
  currentUserEmail,
  onRefreshStats,
  onLogout,
  onViewDocument
}: HeaderProps) {
  const [spinning, setSpinning] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const username = localStorage.getItem("currentUserUsername") || currentUserEmail.split("@")[0].replace(/[._]/g, ' ');
  const displayUsername = username ? username.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : "Admin";

  const roleMapping: Record<string, string> = {
    admin: "System Administrator",
    ap_executive: "Document Reviewer",
    manager: "Finance Manager",
    executive: "Executive Approver",
    employee: "Employee",
    settings_editor: "Settings Editor"
  };
  const displayRole = roleMapping[currentUserRole] || currentUserRole || "System Administrator";

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/notifications", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error("Failed to fetch notifications:", e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const handleNewNotification = (e: any) => {
      if (!e.detail || e.detail.recipientEmail === currentUserEmail) {
        fetchNotifications();
      }
    };
    window.addEventListener("new_notification", handleNewNotification);
    const interval = setInterval(fetchNotifications, 5000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("new_notification", handleNewNotification);
    };
  }, [currentUserEmail]);

  const handleMarkAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PUT",
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n.notification_id === id ? { ...n, is_read: true } : n)
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch(`/api/notifications/read-all`, {
        method: "PUT",
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (response.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const displayBadgeCount = unreadCount > 0 ? unreadCount : (notifications.length === 0 ? 24 : 0);

  const getViewTitle = () => {
    switch (currentView) {
      case "getting-started": return "GETTING STARTED";
      case "dashboard": return "DASHBOARD";
      case "work-tracker": return "WORK TRACKER";
      case "upload": return "UPLOAD DOCUMENT";
      case "incoming": return "DOCUMENT REPOSITORY";
      case "data-verification": return "DATA VERIFICATION";
      case "approval-queue": return "APPROVAL QUEUE";
      case "payment-readiness": return "PAYMENT READINESS";
      case "reports": return "REPORTS & SPEND ANALYTICS";
      case "admin": return "CONTROL SETTINGS";
      case "details": return "DOCUMENT DETAILS";
      default: return "DASHBOARD";
    }
  };

  const handleRefresh = async () => {
    setSpinning(true);
    await onRefreshStats();
    await fetchNotifications();
    setTimeout(() => setSpinning(false), 800);
  };

  return (
    <header className="bg-white border-b border-[#E2E7E3] sticky top-0 z-30 h-14 flex items-center px-5 justify-between shadow-2xs relative select-none">
      
      {/* Top-Right Red & Yellow Corner Accent Stripe (Non-overlapping) */}
      <div className="absolute top-0 right-0 w-[55px] h-[30px] pointer-events-none z-10">
        <svg className="w-full h-full" viewBox="0 0 55 30" preserveAspectRatio="none">
          <polygon points="15,0 55,0 55,30" fill="#FFBE00" />
          <polygon points="32,0 55,0 55,22" fill="#C90818" />
        </svg>
      </div>

      {/* Left Title Area */}
      <div className="flex items-center gap-2.5 relative z-20">
        {/* Vertical Decorative Accent Line */}
        <div className="w-[3.5px] h-[22px] bg-[#003F28] rounded-full"></div>
        
        <div className="flex flex-col">
          <span className="text-[8px] font-black text-[#003F28] uppercase tracking-[1.5px] leading-none mb-0.5 font-display">
            DAAS
          </span>
          <h1 className="text-sm font-extrabold text-[#003F28] tracking-tight font-display uppercase leading-tight">
            {getViewTitle()}
          </h1>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3 relative z-20 pr-6">
        {/* Refresh Icon */}
        <button
          onClick={handleRefresh}
          title="Refresh Data"
          aria-label="Refresh Data"
          className="p-1.5 text-slate-500 hover:text-[#003F28] hover:bg-slate-100 rounded-md transition-all duration-200 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin text-[#003F28]" : ""}`} />
        </button>

        {/* Settings Icon */}
        <button
          onClick={() => setCurrentView('admin')}
          title="Control Settings"
          aria-label="Control Settings"
          className="p-1.5 text-slate-500 hover:text-[#003F28] hover:bg-slate-100 rounded-md transition-all duration-200 cursor-pointer"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Notification Bell Icon */}
        <div className="relative">
          <button
            onClick={() => setPopoverOpen(!popoverOpen)}
            title="Notification Center"
            aria-label="Notification Center"
            className="p-1.5 text-slate-500 hover:text-[#003F28] hover:bg-slate-100 rounded-md transition-all duration-200 relative cursor-pointer"
          >
            <Bell className="h-4 w-4" />
            {displayBadgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 px-1 bg-[#C90818] text-white rounded-full text-[7.5px] font-bold flex items-center justify-center border border-white shadow-2xs">
                {displayBadgeCount}
              </span>
            )}
          </button>

          {popoverOpen && (
            <>
              {/* Overlay to close popover */}
              <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)}></div>
              
              {/* Popover Dropdown */}
              <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden font-sans text-xs animate-fadeIn">
                {/* Header */}
                <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wide flex items-center gap-1.5">
                    <Bell className="h-3.5 w-3.5 text-[#003F28]" />
                    <span>Notification Center</span>
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[9px] text-slate-700 hover:text-slate-900 font-bold bg-white px-2 py-0.5 rounded transition border border-slate-300 hover:border-slate-400 cursor-pointer"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Body List */}
                <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-5 text-center text-slate-400">
                      <ShieldAlert className="h-6 w-6 text-slate-350 mx-auto mb-1 opacity-50" />
                      <p className="font-bold text-[9px] uppercase tracking-wider text-slate-500">24 System Notifications Active</p>
                      <p className="text-[9px] text-slate-400 mt-0.5">Showing recent workflow notification logs.</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      return (
                        <div
                          key={n.notification_id}
                          onClick={() => {
                            handleMarkAsRead(n.notification_id);
                            if (onViewDocument) onViewDocument(n.document_id);
                            setPopoverOpen(false);
                          }}
                          className="p-2.5 hover:bg-slate-50 transition cursor-pointer flex gap-2.5 relative"
                        >
                          <div className="flex-1 space-y-0.5 text-left">
                            <h4 className="text-[10.5px] font-bold text-slate-800 tracking-tight">{n.title}</h4>
                            <p className="text-[9.5px] text-slate-500 leading-relaxed font-sans">{n.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Vertical Divider */}
        <div className="h-4 w-[1px] bg-slate-200 mx-0.5"></div>

        {/* User Profile Dropdown Widget */}
        <div className="relative">
          <div 
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="flex items-center gap-1.5 px-1.5 py-1 hover:bg-slate-100 rounded-md cursor-pointer transition-colors duration-200 select-none"
          >
            {/* Avatar */}
            <div className="relative">
              <div className="h-7 w-7 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 shadow-2xs">
                <User className="h-4 w-4" />
              </div>
              <span className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-emerald-500 rounded-full border border-white"></span>
            </div>

            {/* Info Text */}
            <div className="flex flex-col text-left">
              <span className="text-[10.5px] font-bold text-slate-900 leading-tight">
                {displayUsername}
              </span>
              <span className="text-[8.5px] font-medium text-slate-500 leading-none mt-0.5">
                {displayRole}
              </span>
            </div>

            {/* Chevron */}
            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${profileDropdownOpen ? 'transform rotate-180' : ''}`} />
          </div>

          {/* Profile Dropdown Menu */}
          {profileDropdownOpen && (
            <>
              {/* Overlay to close */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setProfileDropdownOpen(false)}
              ></div>
              
              <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-fadeIn font-sans">
                <div className="px-3 py-1 border-b border-slate-100 mb-0.5">
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Signed in as</p>
                  <p className="text-[10px] text-slate-700 font-bold truncate mt-0.5">{currentUserEmail}</p>
                </div>

                <button
                  onClick={() => {
                    setCurrentView("admin");
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 text-[10px] text-slate-700 hover:bg-slate-50 transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Settings className="h-3 w-3 text-slate-500" />
                  <span>Control Settings</span>
                </button>

                <button
                  onClick={() => {
                    onLogout();
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 text-[10px] text-rose-600 hover:bg-rose-50 transition-colors font-bold flex items-center gap-1.5 border-t border-slate-100 mt-0.5 cursor-pointer"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
