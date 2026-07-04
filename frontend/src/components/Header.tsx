import { RefreshCw, LogOut, ShieldAlert, Sparkles, User, HelpCircle, Bell } from "lucide-react";
import { useState, useEffect } from "react";

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  currentUserRole: string;
  setCurrentUserRole: (role: any) => void;
  currentUserEmail: string;
  setCurrentUserEmail: (email: string) => void;
  stats: any;
  onRefreshStats: () => void;
  onLogout: () => void;
  onViewDocument?: (docId: string) => void;
}

export default function Header({
  currentView,
  setCurrentView,
  currentUserRole,
  setCurrentUserRole,
  currentUserEmail,
  setCurrentUserEmail,
  stats,
  onRefreshStats,
  onLogout,
  onViewDocument
}: HeaderProps) {
  const [spinning, setSpinning] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

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

  const roles = [
    { id: "gm", name: "General Manager (GM)", email: "gm@company.com" },
    { id: "cto", name: "Chief Technology Officer (CTO)", email: "cto@company.com" },
    { id: "md", name: "Managing Director (MD)", email: "md@company.com" },
    { id: "ap_executive", name: "AP Team Executive", email: "ap.executive@company.com" },
    { id: "admin", name: "System Administrator", email: "admin@company.com" },
  ];

  const getViewTitle = () => {
    switch (currentView) {
      case "getting-started": return "System Onboarding & Walkthrough";
      case "dashboard": return "Executive Command Dashboard";
      case "upload": return "Supplier Invoice Ingest";
      case "incoming": return "Document Ledger Repository";
      case "goods-receipt": return "Gate Entry Control";
      case "workflow-builder": return "Compliance Route Designer";
      case "approval-queue": return "Compliance & Audit Desk";
      case "payment-readiness": return "Treasury Release Panel";
      case "reports": return "Reports & Spend Analytics";
      case "details": return "Document Extraction Inspector";
      default: return "Enterprise Portal";
    }
  };

  const handleRefresh = async () => {
    setSpinning(true);
    await onRefreshStats();
    await fetchNotifications();
    setTimeout(() => setSpinning(false), 800);
  };

  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 h-16 flex items-center px-6 justify-between">
      {/* Left Context Title */}
      <div className="flex flex-col">
        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">
          Initech accounts payable
        </span>
        <h1 className="text-[11px] font-extrabold text-slate-800 tracking-tight flex items-center">
          {getViewTitle()}
        </h1>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Sync Trigger */}
        <button
          onClick={handleRefresh}
          title="Sync General Ledger Database"
          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all duration-200"
        >
          <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin text-blue-600" : ""}`} />
        </button>

        {/* Notification Bell Icon */}
        <div className="relative">
          <button
            onClick={() => setPopoverOpen(!popoverOpen)}
            title="Notification Center"
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all duration-200 relative"
          >
            <Bell className={`h-4 w-4 ${unreadCount > 0 ? "text-blue-600 animate-pulse" : ""}`} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 bg-rose-500 text-white rounded-full text-[8px] font-bold flex items-center justify-center border border-white">
                {unreadCount}
              </span>
            )}
          </button>

          {popoverOpen && (
            <>
              {/* Overlay to close popover */}
              <div className="fixed inset-0 z-40" onClick={() => setPopoverOpen(false)}></div>
              
              {/* Popover Dropdown */}
              <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden font-sans text-xs animate-fadeIn">
                {/* Header */}
                <div className="bg-slate-50 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between">
                  <span className="font-extrabold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-1.5">
                    <Bell className="h-4 w-4 text-blue-600" />
                    <span>Notification Desk</span>
                  </span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[10px] text-blue-600 hover:text-blue-700 font-bold bg-blue-50 hover:bg-blue-100/80 px-2.5 py-1 rounded-lg transition border border-blue-100"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Body List */}
                <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      <ShieldAlert className="h-8 w-8 text-slate-350 mx-auto mb-2 opacity-50" />
                      <p className="font-bold text-[10px] uppercase tracking-wider text-slate-500">All clear</p>
                      <p className="text-[10px] text-slate-450 mt-1">No workflow logs registered for your acting desk.</p>
                    </div>
                  ) : (
                    notifications.map((n) => {
                      // Determine tag color/icon based on type
                      let badgeColor = "bg-slate-100 text-slate-600 border-slate-250/30";
                      let tagText = "Alert";
                      if (n.notification_type === "PENDING_APPROVAL") {
                        badgeColor = "bg-blue-50 text-blue-700 border-blue-100";
                        tagText = "Pending Approval";
                      } else if (n.notification_type === "CLARIFICATION") {
                        badgeColor = "bg-amber-50 text-amber-700 border-amber-250/60";
                        tagText = "Clarification";
                      } else if (n.notification_type === "SENT_BACK") {
                        badgeColor = "bg-orange-50 text-orange-700 border-orange-250/60";
                        tagText = "Sent Back";
                      } else if (n.notification_type === "REJECTED") {
                        badgeColor = "bg-rose-50 text-rose-700 border-rose-250/50";
                        tagText = "Rejected";
                      } else if (n.notification_type === "COMPLETED") {
                        badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
                        tagText = "Approved";
                      }

                      return (
                        <div
                          key={n.notification_id}
                          onClick={() => {
                            handleMarkAsRead(n.notification_id);
                            if (onViewDocument) onViewDocument(n.document_id);
                            setPopoverOpen(false);
                          }}
                          className={`p-3.5 hover:bg-slate-50/70 transition cursor-pointer flex gap-3 relative ${
                            !n.is_read ? "bg-blue-50/20 font-semibold" : ""
                          }`}
                        >
                          {/* Unread indicator dot */}
                          {!n.is_read && (
                            <span className="absolute top-4 left-2 h-1.5 w-1.5 bg-blue-500 rounded-full"></span>
                          )}
                          
                          <div className="flex-1 space-y-1 pl-1 text-left">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`px-2 py-0.5 rounded text-[8.5px] font-extrabold uppercase border ${badgeColor}`}>
                                {tagText}
                              </span>
                              <span className="text-[9.5px] text-slate-450 font-mono">
                                {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <h4 className="text-[11px] font-extrabold text-slate-800 tracking-tight">{n.title}</h4>
                            <p className="text-[10px] text-slate-500 leading-relaxed font-sans">{n.message}</p>
                            <div className="pt-1.5 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                              <span>ID: {n.document_id}</span>
                              <span className="underline hover:text-blue-600 font-bold transition">Inspect Document →</span>
                            </div>
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

        {/* Acting Desk Box */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-200 text-xs">
          <div className="flex flex-col text-right hidden lg:flex">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
              Acting AP Officer:
            </span>
            <span className="text-xs font-bold text-slate-800 font-mono">
              {currentUserEmail}
            </span>
          </div>

          <div className="bg-white rounded-lg p-0.5 text-slate-800 border border-slate-200 shadow-sm hover:border-blue-300 transition-colors flex items-center">
            <select
              value={currentUserRole}
              onChange={(e) => {
                const r = roles.find((x) => x.id === e.target.value);
                if (r) {
                  setCurrentUserRole(r.id);
                  setCurrentUserEmail(r.email);
                }
              }}
              className="bg-transparent border-none focus:ring-0 text-xs font-bold py-1.5 pl-3 pr-2 cursor-pointer outline-none"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id} className="bg-white text-slate-700">
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={onLogout}
          title="Sign Out Session"
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 border border-transparent hover:border-red-100"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
