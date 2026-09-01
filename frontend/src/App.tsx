import { useState, useEffect } from "react";
import Header from "./components/Header.tsx";
import Sidebar from "./components/Sidebar.tsx";
import LoginPage from "./components/LoginPage.tsx";
import Dashboard from "./components/Dashboard.tsx";
import DocumentUpload from "./components/DocumentUpload.tsx";
import DocumentDetails from "./components/DocumentDetails.tsx";
import DataVerificationPage from "./components/DataVerificationPage.tsx";
import ApprovalQueuePage from "./components/ApprovalQueuePage.tsx";
import PaymentReadinessPage from "./components/PaymentReadinessPage.tsx";
import WorkTrackerPage from "./components/WorkTrackerPage.tsx";
import GettingStartedPage from "./components/GettingStartedPage.tsx";
import AdminPage from "./pages/Admin.jsx";
import IntegrationsHub from "./components/integrations/IntegrationsHub.tsx";
import DapiSyncBackHub from "./components/dapi-sync-back/DapiSyncBackHub.tsx";
import { DbInvoice } from "./types.ts";
import { Sparkles, ClipboardCheck, Clock, ArrowRight, X } from "lucide-react";
import { io } from "socket.io-client";
import { formatCurrencyINR } from "./utils/formatters.ts";

export default function App() {
  const getInitialRoute = () => {
    const path = window.location.pathname;
    const match = path.match(/^\/review\/([^/]+)$/);
    if (match) {
      return { docId: match[1], view: "details" };
    }
    return { docId: null, view: localStorage.getItem("currentView") || "dashboard" };
  };

  const [initialRoute] = useState(getInitialRoute);
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem("isLoggedIn") === "true");
  const [currentView, setCurrentView] = useState<string>(initialRoute.view);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialRoute.docId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Default Actor settings
  const [currentUserRole, setCurrentUserRole] = useState<string>(() => localStorage.getItem("currentUserRole") || "");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>(() => localStorage.getItem("currentUserEmail") || "");
  const [currentUserUsername, setCurrentUserUsername] = useState<string>(() => localStorage.getItem("currentUserUsername") || "");
  const [kickedReason, setKickedReason] = useState<string | null>(() => sessionStorage.getItem("sessionKickedReason") || null);

  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({
    employee: ["dashboard", "work-tracker", "dapi-sync-back"],
    settings_editor: ["dashboard", "work-tracker", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"],
    admin: ["dashboard", "work-tracker", "upload", "data-verification", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"]
  });

  // Multi-Tab Synchronization across tabs in the same browser
  useEffect(() => {
    let authChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        authChannel = new BroadcastChannel("docuflow_auth_channel");
        authChannel.onmessage = (event) => {
          if (event.data?.type === "LOGIN") {
            setIsLoggedIn(true);
            setCurrentUserRole(event.data.role || localStorage.getItem("currentUserRole") || "");
            setCurrentUserEmail(event.data.email || localStorage.getItem("currentUserEmail") || "");
            setCurrentUserUsername(event.data.username || localStorage.getItem("currentUserUsername") || "");
            setKickedReason(null);
            sessionStorage.removeItem("sessionKickedReason");
          } else if (event.data?.type === "LOGOUT") {
            setIsLoggedIn(false);
          } else if (event.data?.type === "SESSION_KICKED") {
            const reason = event.data.reason || "Your session was terminated because your account was logged in from another device/browser.";
            setKickedReason(reason);
            sessionStorage.setItem("sessionKickedReason", reason);
            handleLogout(reason, false);
          }
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel not supported or error:", e);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "authToken") {
        if (!e.newValue) {
          setIsLoggedIn(false);
        } else {
          setIsLoggedIn(true);
          setCurrentUserRole(localStorage.getItem("currentUserRole") || "");
          setCurrentUserEmail(localStorage.getItem("currentUserEmail") || "");
          setCurrentUserUsername(localStorage.getItem("currentUserUsername") || "");
        }
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      if (authChannel) authChannel.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // 30-Minute Inactivity & Session Expiration Watcher
  useEffect(() => {
    if (!isLoggedIn) return;

    const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

    const updateLastActivity = () => {
      localStorage.setItem("lastActivityTime", String(Date.now()));
    };

    if (!localStorage.getItem("lastActivityTime")) {
      updateLastActivity();
    }

    const checkSessionExpiry = () => {
      const lastActive = parseInt(localStorage.getItem("lastActivityTime") || "0", 10);
      const now = Date.now();
      if (lastActive > 0 && now - lastActive > SESSION_TIMEOUT_MS) {
        handleLogout("Your session has expired after 30 minutes of inactivity. Please log in again.", true);
      }
    };

    // User interaction listeners
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    let throttleTimer: any = null;
    const handleUserActivity = () => {
      if (!throttleTimer) {
        updateLastActivity();
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
        }, 10000); // Throttled every 10s
      }
    };

    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Periodic check every 15 seconds
    const interval = setInterval(checkSessionExpiry, 15000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(interval);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [isLoggedIn]);

  // Registry states
  const [documents, setDocuments] = useState<DbInvoice[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showPendingModal, setShowPendingModal] = useState(false);

  const isDocumentPendingForUser = (doc: DbInvoice) => {
    const terminalStates = ["Approved", "Paid", "Ready for Payment", "Rejected", "Failed"];
    if (terminalStates.includes(doc.status)) return false;

    // Check if the user is explicitly assigned to it
    const isAssigned = doc.is_current_approver || 
      (doc.assigned_approver && 
       doc.assigned_approver.toLowerCase().split(",").map((s: string) => s.trim()).includes(currentUserUsername.toLowerCase()));

    if (isAssigned) return true;

    if (doc.status === "Data Verification Pending") {
      return currentUserRole === "admin" || currentUserRole === "ap_executive";
    }

    return false;
  };

  // Sync Registry documents
  const fetchDocuments = async (silent = false) => {
    if (!silent) setLoadingDocs(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/documents", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      } else if (response.status === 401 || response.status === 403) {
        try {
          const errData = await response.json();
          if (errData?.detail === "SESSION_TERMINATED_BY_NEW_LOGIN") {
            handleLogout("Your session was terminated because your account was logged in from another device/browser.", true);
            return;
          }
        } catch (_) {}
        handleLogout();
      } else if (response.status === 503) {
        // Backend starting up or restarting - silent retry
      } else {
        console.error("Failed to fetch documents:", await response.text());
      }
    } catch (e) {
      // Backend temporarily offline
    } finally {
      if (!silent) setLoadingDocs(false);
    }
  };

  // Sync aggregations stats
  const fetchStats = async (silent = false) => {
    if (!silent) setLoadingStats(true);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stats", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else if (response.status === 401 || response.status === 403) {
        try {
          const errData = await response.json();
          if (errData?.detail === "SESSION_TERMINATED_BY_NEW_LOGIN") {
            handleLogout("Your session was terminated because your account was logged in from another device/browser.", true);
            return;
          }
        } catch (_) {}
        handleLogout();
      } else if (response.status === 503) {
        setStats({ totalDocuments: 0 });
      } else {
        console.error("Failed to fetch analytical stats counters:", await response.text());
        setStats({ totalDocuments: 0 });
      }
    } catch (e) {
      setStats({ totalDocuments: 0 });
    } finally {
      if (!silent) setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchDocuments();
    fetchStats();

    // Real-Time Server-Sent Events (SSE) Stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events/stream');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Check for session kick on this user
          if (data.type === "SESSION_KICKED") {
            if (data.payload?.username && data.payload.username.toLowerCase() === currentUserUsername.toLowerCase()) {
              const newDevice = data.payload.new_device || "another device/browser";
              const reason = `Your session was terminated because your account was logged in from ${newDevice}.`;
              handleLogout(reason, true);
              return;
            }
          }
          if (['DOCUMENT_UPDATED', 'DOCUMENT_CREATED', 'DOCUMENT_LOCKED', 'DOCUMENT_UNLOCKED', 'STAGE_APPROVED'].includes(data.type)) {
            fetchDocuments(true);
            fetchStats(true);
          }
        } catch (err) {
          // heartbeat or ping
        }
      };
      eventSource.onerror = () => {
        // EventSource will auto-reconnect
      };
    } catch (e) {
      console.warn("SSE connection error:", e);
    }

    // Polling fallback
    const docInterval = setInterval(() => {
      fetchDocuments(true);
    }, 10000);
    const statsInterval = setInterval(() => {
      fetchStats(true);
    }, 15000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(docInterval);
      clearInterval(statsInterval);
    };
  }, [isLoggedIn, currentUserUsername]);

  // Sync state to localStorage to persist across refreshes
  useEffect(() => {
    localStorage.setItem("isLoggedIn", String(isLoggedIn));
  }, [isLoggedIn]);

  const handleLoginSuccess = (userId: string, role: string, email: string, username: string) => {
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("currentUserRole", role);
    localStorage.setItem("currentUserEmail", email);
    localStorage.setItem("currentUserUsername", username);
    localStorage.setItem("lastActivityTime", String(Date.now()));
    setCurrentUserRole(role);
    setCurrentUserEmail(email);
    setCurrentUserUsername(username);
    setKickedReason(null);
    sessionStorage.removeItem("sessionKickedReason");
    setIsLoggedIn(true);

    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("docuflow_auth_channel");
        channel.postMessage({ type: "LOGIN", role, email, username });
        channel.close();
      }
    } catch (e) {}
  };

  useEffect(() => {
    localStorage.setItem("currentView", currentView);
  }, [currentView]);

  useEffect(() => {
    localStorage.setItem("currentUserRole", currentUserRole);
  }, [currentUserRole]);

  useEffect(() => {
    localStorage.setItem("currentUserEmail", currentUserEmail);
  }, [currentUserEmail]);

  // Synchronize browser address bar pathname dynamically based on currentView and selectedDocId
  useEffect(() => {
    if (currentView === "details" && selectedDocId) {
      const targetPath = `/review/${selectedDocId}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState({}, "", targetPath);
      }
    } else {
      if (window.location.pathname.startsWith("/review/")) {
        window.history.replaceState({}, "", "/");
      }
    }
  }, [currentView, selectedDocId]);

  const [requireGRN, setRequireGRN] = useState(true);
  const [orgName, setOrgName] = useState("DocuFlow Automation");

  // Fetch dynamic role permissions from DB
  const fetchRolePermissions = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/admin/config", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const roleConfig = data.find((c: any) => c.key === "ROLE_PERMISSIONS");
          if (roleConfig && roleConfig.value) {
            setRolePermissions(JSON.parse(roleConfig.value));
          }
          const grnConfig = data.find((c: any) => c.key === "GLOBAL_REQUIRE_GRN");
          if (grnConfig) {
            setRequireGRN(grnConfig.value === "true");
          }
          const orgConfig = data.find((c: any) => c.key === "ORGANIZATION_NAME" || c.key === "COMPANY_NAME");
          if (orgConfig && orgConfig.value) {
            setOrgName(orgConfig.value);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch role permissions", e);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchRolePermissions();
    }
  }, [isLoggedIn, currentUserRole]);

  useEffect(() => {
    const handlePermissionsUpdated = () => {
      fetchRolePermissions();
    };
    window.addEventListener("role-permissions-updated", handlePermissionsUpdated);
    return () => window.removeEventListener("role-permissions-updated", handlePermissionsUpdated);
  }, []);

  // Access Control Enforcement
  useEffect(() => {
    if (!isLoggedIn) return;
    
    const permissions = rolePermissions[currentUserRole] || (
      currentUserRole === "admin" ? ["dashboard", "work-tracker", "upload", "data-verification", "admin"] :
      currentUserRole === "settings_editor" ? ["dashboard", "work-tracker", "admin"] :
      ["dashboard", "work-tracker"]
    );
    
    const viewMapping: Record<string, string> = {
      "admin": "admin",
      "upload": "upload",
      "goods-receipt": "upload",
      "data-verification": "data-verification"
    };

    const requiredPermission = viewMapping[currentView];
    if (requiredPermission && !permissions.includes(requiredPermission)) {
      const fallback = permissions.includes("dashboard") ? "dashboard" : 
                       permissions.includes("work-tracker") ? "work-tracker" : 
                       permissions.includes("admin") ? "admin" : "dashboard";
      setCurrentView(fallback);
    }
  }, [currentView, currentUserRole, isLoggedIn, rolePermissions]);

  function handleFullRefresh() {
    fetchDocuments();
    fetchStats();
  }

  // Handles switching directly to inspect a document details panel
  const handleViewDocument = (docId: string | number) => {
    setSelectedDocId(String(docId));
    setCurrentView("details");
    fetchDocuments(true);
  };

  // Handles adding recently parsed documents to the state
  const handleDocUploadSuccess = (newDoc: DbInvoice) => {
    setDocuments((prev) => [newDoc, ...prev]);
    fetchStats();
  };

  function handleLogout(reason?: string | null, broadcast = true) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("lastActivityTime");
    sessionStorage.removeItem("hasShownWelcomeQueue");
    if (reason) {
      setKickedReason(reason);
      sessionStorage.setItem("sessionKickedReason", reason);
    }
    setIsLoggedIn(false);

    if (broadcast) {
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("docuflow_auth_channel");
          if (reason) {
            channel.postMessage({ type: "SESSION_KICKED", reason });
          } else {
            channel.postMessage({ type: "LOGOUT" });
          }
          channel.close();
        }
      } catch (e) {}
    }
  }

  // Reset the hasShownWelcomeQueue flag when the app loads, the role changes, or the user logs in,
  // ensuring they see the pending popup on every new session, refresh, or login.
  useEffect(() => {
    sessionStorage.setItem("hasShownWelcomeQueue", "false");
  }, [currentUserRole, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && documents.length > 0) {
      const hasShown = sessionStorage.getItem("hasShownWelcomeQueue");
      if (hasShown !== "true") {
        const pending = documents.filter(isDocumentPendingForUser);

        if (pending.length > 0) {
          setShowPendingModal(true);
        }
        sessionStorage.setItem("hasShownWelcomeQueue", "true");
      }
    }
  }, [documents, isLoggedIn, currentUserRole]);

  // Redirect to work tracker if approval queue is empty
  useEffect(() => {
    if (isLoggedIn && currentView === "approval-queue" && documents.length > 0) {
      const pending = documents.filter(isDocumentPendingForUser);

      if (pending.length === 0) {
        setCurrentView("work-tracker");
      }
    }
  }, [currentView, documents, isLoggedIn, currentUserRole]);

  // Get active selected doc object
  const activeDocument = documents.find((d) => String(d.id) === String(selectedDocId)) || null;

  // Unauthenticated viewport
  if (!isLoggedIn) {
    return (
      <LoginPage
        kickedReason={kickedReason}
        onClearKickedReason={() => {
          setKickedReason(null);
          sessionStorage.removeItem("sessionKickedReason");
        }}
        onLoginSuccess={(userId, role, email, username) => {
          handleLoginSuccess(userId, role, email, username);
          sessionStorage.setItem("hasShownWelcomeQueue", "false");
          // Smart Routing based on role
          setCurrentView((prev) => {
            if (prev === "details" && selectedDocId) return "details";
            // If they are an approver or employee, send them straight to the work tracker!
            if (role === "manager" || role === "executive" || role === "employee") return "work-tracker";
            return "dashboard";
          });
        }}
      />
    );
  }

  return (
    <div className="h-screen w-full bg-[#F8FAFC] text-slate-900 flex font-sans overflow-hidden">
      
      {/* Sleek Navigation Sidebar */}
      <Sidebar
        currentView={currentView}
        setCurrentView={(view) => {
          setCurrentView(view);
          setSelectedDocId(null);
        }}
        currentUserRole={currentUserRole}
        stats={stats}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        rolePermissions={rolePermissions}
      />

      {/* Main Content Area Container */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Sophisticated Action top bar */}
        <Header
          currentView={currentView}
          setCurrentView={(view) => {
            setCurrentView(view);
            setSelectedDocId(null);
          }}
          currentUserRole={currentUserRole}
          setCurrentUserRole={setCurrentUserRole}
          currentUserEmail={currentUserEmail}
          setCurrentUserEmail={setCurrentUserEmail}
          stats={stats}
          onRefreshStats={handleFullRefresh}
          onLogout={handleLogout}
          onViewDocument={handleViewDocument}
          orgName={orgName}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto px-4 pt-1 pb-2">
          <div className="w-full max-w-[1920px] mx-auto space-y-2 animate-fadeIn">
            {currentView === "getting-started" && (
              <GettingStartedPage
                setCurrentView={setCurrentView}
                setCurrentUserRole={setCurrentUserRole}
                setCurrentUserEmail={setCurrentUserEmail}
                onLoginOverride={() => setIsLoggedIn(true)}
              />
            )}

            {currentView === "dashboard" && (
              <Dashboard
                documents={documents}
                stats={stats}
                loading={loadingDocs || loadingStats}
                onViewDocument={handleViewDocument}
                currentUserRole={currentUserRole}
                currentUserEmail={currentUserEmail}
                currentUserUsername={currentUserUsername}
                setCurrentView={setCurrentView}
                requireGRN={requireGRN}
              />
            )}

            {currentView === "work-tracker" && (
              <WorkTrackerPage
                documents={documents}
                onViewDocument={handleViewDocument}
                requireGRN={requireGRN}
                currentUserRole={currentUserRole}
                currentUserEmail={currentUserEmail}
                currentUserUsername={currentUserUsername}
              />
            )}

            {currentView === "upload" && (
              <DocumentUpload
                onUploadSuccess={handleDocUploadSuccess}
                setCurrentView={setCurrentView}
                setSelectedDocId={setSelectedDocId}
              />
            )}

            {currentView === "approval-queue" && (
              <ApprovalQueuePage
                currentUserRole={currentUserRole}
                currentUserEmail={currentUserEmail}
                onRefreshDataSignal={handleFullRefresh}
                setCurrentView={setCurrentView}
              />
            )}

            {currentView === "data-verification" && (
              <DataVerificationPage
                onViewDocument={handleViewDocument}
              />
            )}

            {currentView === "payment-readiness" && (
              <PaymentReadinessPage
                onRefreshStats={handleFullRefresh}
              />
            )}

            {currentView === "admin" && (
              <AdminPage />
            )}

            {(currentView === "dapi-sync-back" || currentView === "integrations" || currentView === "applications" || currentView === "callback-rules" || currentView === "integration-logs") && (
              <DapiSyncBackHub
                key={currentView}
                initialTab={
                  currentView === "applications" ? "applications" :
                  currentView === "callback-rules" ? "simple" :
                  currentView === "integration-logs" ? "logs" : "applications"
                }
              />
            )}

            {currentView === "details" && (
              !activeDocument ? (
                <div className="text-center py-24 bg-white border border-slate-200 rounded-2xl max-w-md mx-auto flex flex-col items-center justify-center animate-pulse">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                  <p className="text-slate-500 font-semibold text-[10px] tracking-wider uppercase">Loading Document Details...</p>
                </div>
              ) : (
                <DocumentDetails
                  document={activeDocument}
                  currentUserRole={currentUserRole}
                  currentUserEmail={currentUserEmail}
                  currentUserUsername={currentUserUsername}
                  onRefreshDocument={handleFullRefresh}
                  onGoBack={() => {
                    setCurrentView("dashboard");
                    setSelectedDocId(null);
                  }}
                  onSelectDocument={(docId) => setSelectedDocId(docId)}
                  pendingDocIds={documents.filter(isDocumentPendingForUser).map(d => d.id)}
                />
              )
            )}
          </div>
        </main>


      </div>

      {/* Welcome Pending Approvals Modal */}
      {showPendingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-fadeIn p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scaleIn border border-slate-100">
            {/* Header / Graphic */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white relative">
              <button 
                onClick={() => setShowPendingModal(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition"
              >
                <X className="h-4 w-4" />
              </button>
              
              <div className="h-12 w-12 bg-white/15 rounded-xl backdrop-blur-md flex items-center justify-center mb-4 border border-white/10 shadow-inner">
                <ClipboardCheck className="h-6 w-6 text-white" />
              </div>
              
              <h3 className="text-base font-black font-display tracking-tight leading-none mb-1">
                Welcome back, {currentUserUsername || currentUserEmail.split('@')[0]}!
              </h3>
              <p className="text-[11px] text-blue-100 font-semibold tracking-wide uppercase mt-1">
                You have {documents.filter(isDocumentPendingForUser).length} pending actions waiting
              </p>
            </div>

            {/* List of pending docs */}
            <div className="p-5">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-3">Awaiting your approval</p>
              
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto custom-scrollbar mb-5 p-1.5 pr-2">
                {documents.filter(isDocumentPendingForUser).slice(0, 3).map(doc => (
                  <div 
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocId(doc.id);
                      setCurrentView("details");
                      setShowPendingModal(false);
                    }}
                    className="group border border-slate-100 hover:border-blue-300 hover:bg-blue-50/20 p-3 rounded-xl transition cursor-pointer flex items-center justify-between shadow-sm relative overflow-hidden"
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className="text-[10px] font-black text-slate-800 tracking-tight">
                        {doc.tracking_id || doc.id}
                      </span>
                      <span className="text-[11px] font-extrabold text-slate-900 truncate mt-0.5">
                        {doc.vendor_name || "Unknown Vendor"}
                      </span>
                      <span className="text-[9px] font-semibold text-slate-500 tracking-wide uppercase mt-0.5">
                        {doc.document_type || "Document"} • {doc.invoice_number}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-[11px] font-black text-slate-900">
                        {formatCurrencyINR(doc.amount)}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-blue-600 mt-1 uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity">
                        Review <ArrowRight className="h-2 w-2" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setCurrentView("work-tracker");
                    setShowPendingModal(false);
                  }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/10 flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <ClipboardCheck className="h-4 w-4" /> Go to Work Tracker
                </button>
                <button
                  onClick={() => setShowPendingModal(false)}
                  className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all border border-slate-200 text-center active:scale-98"
                >
                  Review Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
