import { useState, useEffect } from "react";
import Header from "./components/Header.tsx";
import Sidebar from "./components/Sidebar.tsx";
import LoginPage from "./components/LoginPage";
import Dashboard from "./components/Dashboard.tsx";
import DocumentUpload from "./components/DocumentUpload.tsx";
import DocumentDetails from "./components/DocumentDetails.tsx";
import DataVerificationPage from "./components/DataVerificationPage.tsx";
import ApprovalQueuePage from "./components/ApprovalQueuePage.tsx";
import PaymentReadinessPage from "./components/PaymentReadinessPage.tsx";
import WorkTrackerPage from "./components/WorkTrackerPage.tsx";
import ApprovedDocumentsPage from "./components/ApprovedDocumentsPage.tsx";
import GettingStartedPage from "./components/GettingStartedPage.tsx";
import AdminPage from "./pages/Admin.jsx";
import WorkflowRulesPage from "./pages/WorkflowRulesPage.jsx";

import CustomerFeedbackDetails from "./components/CustomerFeedbackDetails.tsx";
import CustomerFeedbackPage from "./components/CustomerFeedbackPage.tsx";
import DapiSyncBackHub from "./components/dapi-sync-back/DapiSyncBackHub.tsx";
import { DbInvoice } from "./types";
import { ClipboardCheck, ArrowRight, X, Clock } from "lucide-react";

import { formatCurrencyINR, getCanonicalDocumentType } from "./utils/formatters.ts";

export default function App() {
  const getInitialRoute = () => {
    const path = window.location.pathname;
    const matchFeedback = path.match(/^\/customer-feedback\/([^/]+)$/);
    if (matchFeedback) {
      return { docId: matchFeedback[1], view: "customer-feedback" };
    }
    const match = path.match(/^\/review\/([^/]+)$/);
    if (match) {
      const docId = match[1];
      const docType = getCanonicalDocumentType(docId);
      if (docType === "CUSTOMER FEEDBACK" || docId.toUpperCase().startsWith("CMP")) {
        return { docId, view: "customer-feedback" };
      }
      return { docId, view: "details" };
    }
    return { docId: null, view: localStorage.getItem("currentView") || "dashboard" };
  };

  const [initialRoute] = useState(getInitialRoute);
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem("isLoggedIn") === "true");
  const [currentView, setCurrentView] = useState<string>(initialRoute.view);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialRoute.docId);
  const [previousView, setPreviousView] = useState<string>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workTrackerInitialFilter, setWorkTrackerInitialFilter] = useState<string>(() => {
    return localStorage.getItem("workTrackerStatusFilter") || "all";
  });

  const handleNavigateToWorkTracker = (statusFilter: string) => {
    setWorkTrackerInitialFilter(statusFilter);
    localStorage.setItem("workTrackerStatusFilter", statusFilter);
    setCurrentView("work-tracker");
  };

  // Default Actor settings
  const [currentUserRole, setCurrentUserRole] = useState<string>(() => localStorage.getItem("currentUserRole") || "");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>(() => localStorage.getItem("currentUserEmail") || "");
  const [currentUserUsername, setCurrentUserUsername] = useState<string>(() => localStorage.getItem("currentUserUsername") || "");
  const [kickedReason, setKickedReason] = useState<string | null>(() => sessionStorage.getItem("sessionKickedReason") || null);

  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({
    employee: ["dashboard", "work-tracker", "customer-feedback", "approved-documents", "dapi-sync-back"],
    settings_editor: ["dashboard", "work-tracker", "customer-feedback", "approved-documents", "workflow-rules", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"],
    admin: ["dashboard", "work-tracker", "customer-feedback", "approved-documents", "upload", "data-verification", "workflow-rules", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"]
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

    const handleNavigateView = (e: any) => {
      if (e.detail) {
        setCurrentView(e.detail);
        setSelectedDocId(null);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("navigate-view", handleNavigateView);

    return () => {
      if (authChannel) authChannel.close();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("navigate-view", handleNavigateView);
    };
  }, []);

  // Session Inactivity Warning Modal State (Option 1)
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const [inactivitySecondsLeft, setInactivitySecondsLeft] = useState(120);

  // Option 1: 20-Minute Inactivity Watcher with 2-Minute Pre-Expiration Countdown Modal
  useEffect(() => {
    if (!isLoggedIn) return;

    const WARNING_THRESHOLD_MS = 18 * 60 * 1000; // 18 minutes (show warning modal)
    const MAX_INACTIVITY_MS = 20 * 60 * 1000;     // 20 minutes (hard logout)

    const updateLastActivity = () => {
      localStorage.setItem("lastActivityTime", String(Date.now()));
      setShowInactivityWarning(false);
    };

    if (!localStorage.getItem("lastActivityTime")) {
      updateLastActivity();
    }

    const checkSessionExpiry = () => {
      const lastActive = parseInt(localStorage.getItem("lastActivityTime") || "0", 10);
      const now = Date.now();
      const idleTime = now - lastActive;

      if (lastActive > 0) {
        if (idleTime >= MAX_INACTIVITY_MS) {
          setShowInactivityWarning(false);
          handleLogout("Your session has expired after 20 minutes of inactivity. Please log in again.", true);
        } else if (idleTime >= WARNING_THRESHOLD_MS) {
          const secondsRemaining = Math.max(0, Math.ceil((MAX_INACTIVITY_MS - idleTime) / 1000));
          setInactivitySecondsLeft(secondsRemaining);
          setShowInactivityWarning(true);
        } else {
          if (showInactivityWarning) setShowInactivityWarning(false);
        }
      }
    };

    // User activity listeners
    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    let throttleTimer: any = null;
    const handleUserActivity = () => {
      if (!throttleTimer || showInactivityWarning) {
        updateLastActivity();
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
        }, 5000);
      }
    };

    events.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Check every 1 second for real-time countdown updates
    const interval = setInterval(checkSessionExpiry, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
      clearInterval(interval);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [isLoggedIn, showInactivityWarning]);

  // Registry states
  const [documents, setDocuments] = useState<DbInvoice[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showPendingModal, setShowPendingModal] = useState(false);

  const isDocumentPendingForUser = (doc: DbInvoice) => {
    if (!doc) return false;
    const terminalStates = ["Approved", "Fully Approved", "Settled", "Completed", "Paid", "Ready for Payment", "Rejected", "Failed", "Cancelled", "Auto-Approved", "On Hold"];
    if (terminalStates.includes(doc.status)) return false;
    const st = (doc.status || "").toLowerCase();
    if (st.includes("hold") || st.includes("pause") || st.includes("reject") || st.includes("cancel") || st.includes("fail")) return false;
    if ((doc as any).has_approved) return false;

    // Check if the user is explicitly assigned to it at current stage
    if (doc.is_current_approver) return true;

    const uHandle = (currentUserUsername || "").toLowerCase().trim();
    const eHandle = (currentUserEmail || "").toLowerCase().trim();
    const rHandle = (currentUserRole || "").toLowerCase().trim();

    if (doc.assigned_approver) {
      const approvers = doc.assigned_approver.toLowerCase().split(",").map((s: string) => s.trim());
      if (uHandle && (approvers.includes(uHandle) || approvers.some((p: string) => p && (p.includes(uHandle) || uHandle.includes(p))))) return true;
      if (eHandle && (approvers.includes(eHandle) || approvers.some((p: string) => p && (p.includes(eHandle) || eHandle.includes(p))))) return true;
      if (rHandle && approvers.includes(rHandle)) return true;
    }

    if (doc.status === "Data Verification Pending" && (currentUserRole === "ap_executive" || currentUserRole === "executive")) return true;

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
        } catch {}
        handleLogout();
      } else if (response.status === 503) {
        // Backend starting up or restarting - silent retry
      } else {
        console.error("Failed to fetch documents:", await response.text());
      }
    } catch {
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
        } catch {}
        handleLogout();
      } else if (response.status === 503) {
        setStats({ totalDocuments: 0 });
      } else {
        console.error("Failed to fetch analytical stats counters:", await response.text());
        setStats({ totalDocuments: 0 });
      }
    } catch {
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
        } catch {
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
    sessionStorage.setItem("hasShownWelcomeQueue", "false");
    setShowPendingModal(false);
    setLoadingDocs(true);
    setIsLoggedIn(true);

    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("docuflow_auth_channel");
        channel.postMessage({ type: "LOGIN", role, email, username });
        channel.close();
      }
    } catch {}
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
    if (currentView === "customer-feedback" && selectedDocId) {
      const targetPath = `/customer-feedback/${selectedDocId}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState({}, "", targetPath);
      }
    } else if (currentView === "details" && selectedDocId) {
      const targetPath = `/review/${selectedDocId}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState({}, "", targetPath);
      }
    } else {
      if (window.location.pathname.startsWith("/review/") || window.location.pathname.startsWith("/customer-feedback/")) {
        window.history.replaceState({}, "", "/");
      }
    }
  }, [currentView, selectedDocId]);

  const [requireGRN, setRequireGRN] = useState(true);
  const [orgName, setOrgName] = useState("Document Approval & Automation System");

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
      currentUserRole === "admin" ? ["dashboard", "work-tracker", "approved-documents", "customer-feedback", "upload", "data-verification", "admin"] :
      currentUserRole === "settings_editor" ? ["dashboard", "work-tracker", "approved-documents", "customer-feedback", "admin"] :
      ["dashboard", "work-tracker", "approved-documents", "customer-feedback"]
    );
    
    const viewMapping: Record<string, string> = {
      "dashboard": "dashboard",
      "admin": "admin",
      "upload": "upload",
      "goods-receipt": "upload",
      "data-verification": "data-verification",
      "customer-feedback": "customer-feedback",
      "work-tracker": "work-tracker",
      "approved-documents": "approved-documents",
      "workflow-rules": "workflow-rules"
    };

    const requiredPermission = viewMapping[currentView];
    if (requiredPermission && !permissions.includes(requiredPermission)) {
      const fallback = permissions.includes("customer-feedback") ? "customer-feedback" : 
                       permissions.includes("dashboard") ? "dashboard" : 
                       permissions.includes("work-tracker") ? "work-tracker" : 
                       permissions.includes("admin") ? "admin" : "customer-feedback";
      setCurrentView(fallback);
    }
  }, [currentView, currentUserRole, isLoggedIn, rolePermissions]);

  function handleFullRefresh() {
    fetchDocuments();
    fetchStats();
  }

  // Handles switching directly to inspect a document details panel
  const handleViewDocument = (docId: string | number) => {
    if (currentView !== "details" && currentView !== "customer-feedback") {
      setPreviousView(currentView);
    }
    const docIdStr = String(docId);
    setSelectedDocId(docIdStr);

    const targetDoc = documents.find(
      (d) => String(d.id) === docIdStr || String(d.invoice_number || "").toUpperCase() === docIdStr.toUpperCase()
    );
    const rawType = targetDoc?.document_type || targetDoc?.subtype_of_complaint || targetDoc?.type_of_complaint || docIdStr;
    const docType = getCanonicalDocumentType(rawType);

    if (docType === "CUSTOMER FEEDBACK" || docIdStr.toUpperCase().startsWith("CMP") || docIdStr.toUpperCase().startsWith("CF")) {
      setCurrentView("customer-feedback");
    } else {
      setCurrentView("details");
    }
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
    setShowPendingModal(false);
    setDocuments([]);
    setLoadingDocs(true);
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
      } catch {}
    }
  }

  // Welcome Pending Actions Queue: Check user's actual pending count upon login/session
  useEffect(() => {
    if (isLoggedIn && !loadingDocs) {
      const hasShown = sessionStorage.getItem("hasShownWelcomeQueue");
      if (hasShown !== "true") {
        const pending = documents.filter(isDocumentPendingForUser);
        if (pending.length > 0) {
          setShowPendingModal(true);
        } else {
          setShowPendingModal(false);
        }
        sessionStorage.setItem("hasShownWelcomeQueue", "true");
      }
    }
  }, [documents, loadingDocs, isLoggedIn, currentUserRole, currentUserUsername, currentUserEmail]);

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

  const pendingActionDocs = !loadingDocs ? documents.filter(isDocumentPendingForUser) : [];

  return (
    <div className="h-screen w-full bg-[#FAF8F3] text-slate-900 flex font-sans overflow-hidden">
      
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
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${sidebarCollapsed ? "ml-[64px]" : "ml-[180px]"}`}>
        
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
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 pt-1 pb-2">
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
                onNavigateToWorkTracker={handleNavigateToWorkTracker}
                onNavigateToApproved={() => setCurrentView("approved-documents")}
                requireGRN={requireGRN}
              />
            )}

            {currentView === "work-tracker" && (
              <WorkTrackerPage
                documents={documents}
                onViewDocument={handleViewDocument}
                currentUserRole={currentUserRole}
                currentUserEmail={currentUserEmail}
                currentUserUsername={currentUserUsername}
                initialStatusFilter={workTrackerInitialFilter}
              />
            )}

            {currentView === "approved-documents" && (
              <ApprovedDocumentsPage
                documents={documents}
                onViewDocument={handleViewDocument}
                currentUserRole={currentUserRole}
                currentUserEmail={currentUserEmail}
                currentUserUsername={currentUserUsername}
                onRefreshDocs={handleFullRefresh}
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

            {currentView === "workflow-rules" && (
              <WorkflowRulesPage />
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

            {currentView === "customer-feedback" && (
              <CustomerFeedbackPage
                documents={documents}
                selectedDocId={selectedDocId}
                onSelectDocument={(docId) => setSelectedDocId(docId)}
                currentUserRole={currentUserRole}
                currentUserEmail={currentUserEmail}
                currentUserUsername={currentUserUsername}
                onRefreshDocs={handleFullRefresh}
              />
            )}

            {currentView === "details" && (
              !activeDocument ? (
                loadingDocs ? (
                  <div className="text-center py-24 bg-white border border-slate-200 rounded-2xl max-w-md mx-auto flex flex-col items-center justify-center animate-pulse">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                    <p className="text-slate-500 font-semibold text-[10px] tracking-wider uppercase">Loading Document Details...</p>
                  </div>
                ) : (
                  <div className="text-center py-24 bg-white border border-slate-200 rounded-2xl max-w-md mx-auto flex flex-col items-center justify-center">
                    <p className="text-slate-700 font-bold mb-4">Document Not Found or Access Denied</p>
                    <button onClick={() => setCurrentView("dashboard")} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">
                      Return to Dashboard
                    </button>
                  </div>
                )
              ) : (
                <DocumentDetails
                  document={activeDocument}
                  currentUserRole={currentUserRole}
                  currentUserEmail={currentUserEmail}
                  currentUserUsername={currentUserUsername}
                  onRefreshDocument={handleFullRefresh}
                  onGoBack={() => {
                    setCurrentView(previousView || "dashboard");
                    setSelectedDocId(null);
                  }}
                  onSelectDocument={(docId) => setSelectedDocId(docId)}
                  pendingDocIds={pendingActionDocs.map(d => d.id)}
                />
              )
            )}
          </div>
        </main>


      </div>



      {/* Session Pre-Expiration Warning Modal (Option 1) */}
      {showInactivityWarning && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fadeIn p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scaleIn border border-amber-200">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white relative">
              <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center mb-3 border border-white/20 shadow-inner">
                <Clock className="h-5 w-5 text-white animate-pulse" />
              </div>
              <h3 className="text-base font-black tracking-tight leading-snug">
                Session Expiring Soon
              </h3>
              <p className="text-[11px] text-amber-100 font-semibold tracking-wide uppercase mt-1">
                Idle Inactivity Warning
              </p>
            </div>

            <div className="p-5 text-center space-y-4">
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                You have been idle for 18 minutes. For security, your session will automatically end in:
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 inline-block mx-auto">
                <span className="font-mono text-2xl font-black text-amber-700">
                  {Math.floor(inactivitySecondsLeft / 60)}:{String(inactivitySecondsLeft % 60).padStart(2, '0')}
                </span>
                <span className="text-[9px] font-extrabold text-amber-600 block uppercase tracking-wider mt-0.5">
                  Remaining Time
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("lastActivityTime", String(Date.now()));
                    setShowInactivityWarning(false);
                  }}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                >
                  Stay Logged In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
