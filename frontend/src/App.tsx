import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Header from "./components/Header.tsx";
import Sidebar from "./components/Sidebar.tsx";
const LoginPage = lazy(() => import("./components/LoginPage"));
const Dashboard = lazy(() => import("./components/Dashboard.tsx"));

const DocumentUpload = lazy(() => import("./components/DocumentUpload.tsx"));
const DocumentDetails = lazy(() => import("./components/DocumentDetails.tsx"));
const DataVerificationPage = lazy(() => import("./components/DataVerificationPage.tsx"));
const ApprovalQueuePage = lazy(() => import("./components/ApprovalQueuePage.tsx"));
const PaymentReadinessPage = lazy(() => import("./components/PaymentReadinessPage.tsx"));
const WorkTrackerPage = lazy(() => import("./components/WorkTrackerPage.tsx"));
const ApprovedDocumentsPage = lazy(() => import("./components/ApprovedDocumentsPage.tsx"));
const GettingStartedPage = lazy(() => import("./components/GettingStartedPage.tsx"));
const AdminPage = lazy(() => import("./pages/Admin.jsx"));
const WorkflowRulesPage = lazy(() => import("./pages/WorkflowRulesPage.jsx"));
const CustomerFeedbackPage = lazy(() => import("./components/CustomerFeedbackPage.tsx"));
const DapiSyncBackHub = lazy(() => import("./components/dapi-sync-back/DapiSyncBackHub.tsx"));

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[400px] w-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium text-slate-500">Loading module...</span>
      </div>
    </div>
  );
}
import { DbInvoice } from "./types";
import { Clock } from "lucide-react";

import { getCanonicalDocumentType } from "./utils/formatters.ts";
import { initAuthTokenMigration, removeAuthTokens } from "./utils/auth";

export default function App() {
  useEffect(() => {
    initAuthTokenMigration();
  }, []);
  const parseRouteFromPath = (pathname: string): { view: string; docId: string | null } => {
    const path = (pathname || "/").trim();
    const lower = path.toLowerCase();

    if (lower === "/login") {
      return { view: "login", docId: null };
    }

    const matchFeedback = path.match(/^\/customer-feedback\/([^/]+)$/i);
    if (matchFeedback) {
      return { view: "customer-feedback", docId: decodeURIComponent(matchFeedback[1]) };
    }

    const matchReview = path.match(/^\/(?:review|documents|details)\/([^/]+)$/i);
    if (matchReview) {
      const docId = decodeURIComponent(matchReview[1]);
      const docType = getCanonicalDocumentType(docId);
      if (docType === "CUSTOMER FEEDBACK" || docId.toUpperCase().startsWith("CMP") || docId.toUpperCase().startsWith("CF")) {
        return { view: "customer-feedback", docId };
      }
      return { view: "details", docId };
    }

    if (lower === "/work-tracker") return { view: "work-tracker", docId: null };
    if (lower === "/approved-docs" || lower === "/approved-documents") return { view: "approved-documents", docId: null };
    if (lower === "/upload" || lower === "/upload-document") return { view: "upload", docId: null };
    if (lower === "/customer-feedback") return { view: "customer-feedback", docId: null };
    if (lower === "/workflow-rules" || lower === "/workflows") return { view: "workflow-rules", docId: null };
    if (lower === "/admin" || lower === "/settings" || lower === "/control-settings") return { view: "admin", docId: null };
    if (lower === "/data-verification") return { view: "data-verification", docId: null };
    if (lower === "/payment-readiness") return { view: "payment-readiness", docId: null };
    if (lower === "/approval-queue") return { view: "approval-queue", docId: null };
    if (lower === "/getting-started") return { view: "getting-started", docId: null };
    if (lower === "/dapi-sync-back" || lower === "/integrations" || lower === "/applications" || lower === "/callback-rules" || lower === "/integration-logs") {
      return { view: "dapi-sync-back", docId: null };
    }

    if (lower === "/dashboard" || lower === "/") {
      return { view: "dashboard", docId: null };
    }

    let savedView = localStorage.getItem("currentView") || "dashboard";
    if (savedView === "audit-logs") {
      localStorage.setItem("adminActiveTab", "audit");
      savedView = "admin";
    }
    return { docId: null, view: savedView };
  };

  const getPathFromRoute = (view: string, docId: string | null = null): string => {
    if (view === "login") return "/login";
    if (view === "customer-feedback" && docId) return `/customer-feedback/${encodeURIComponent(docId)}`;
    if (view === "details" && docId) return `/review/${encodeURIComponent(docId)}`;
    if (view === "dashboard") return "/dashboard";
    if (view === "work-tracker") return "/work-tracker";
    if (view === "approved-documents") return "/approved-docs";
    if (view === "upload") return "/upload";
    if (view === "customer-feedback") return "/customer-feedback";
    if (view === "workflow-rules") return "/workflow-rules";
    if (view === "admin") return "/admin";
    if (view === "data-verification") return "/data-verification";
    if (view === "payment-readiness") return "/payment-readiness";
    if (view === "approval-queue") return "/approval-queue";
    if (view === "getting-started") return "/getting-started";
    if (view === "dapi-sync-back") return "/dapi-sync-back";
    return `/${view}`;
  };

  const getInitialRoute = () => {
    const isStoredLoggedIn = localStorage.getItem("isLoggedIn") === "true" && Boolean(localStorage.getItem("authToken"));
    if (!isStoredLoggedIn) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.history.replaceState({ view: "login", docId: null }, "", "/login");
      }
      return { docId: null, view: "login" };
    }
    const path = typeof window !== "undefined" ? window.location.pathname : "/";
    const route = parseRouteFromPath(path);
    if (route.view === "login") {
      if (typeof window !== "undefined") {
        window.history.replaceState({ view: "dashboard", docId: null }, "", "/dashboard");
      }
      return { docId: null, view: "dashboard" };
    }
    if (typeof window !== "undefined") {
      const canonicalPath = getPathFromRoute(route.view, route.docId);
      if (window.location.pathname !== canonicalPath && window.location.pathname !== "/") {
        window.history.replaceState({ view: route.view, docId: route.docId }, "", canonicalPath);
      }
    }
    return route;
  };

  const isNavigatingFromPopStateRef = useRef(false);
  const [initialRoute] = useState(getInitialRoute);
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem("isLoggedIn") === "true" && Boolean(localStorage.getItem("authToken")));
  const [currentView, setCurrentView] = useState<string>(initialRoute.view);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(initialRoute.docId);
  const [previousView, setPreviousView] = useState<string>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workTrackerInitialFilter, setWorkTrackerInitialFilter] = useState<string>(() => {
    return localStorage.getItem("workTrackerStatusFilter") || "all";
  });

  const routerNavigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const route = parseRouteFromPath(location.pathname);
    if (route.view !== currentView || route.docId !== selectedDocId) {
      if (currentView !== "details" && currentView !== "customer-feedback" && route.view !== currentView) {
        setPreviousView(currentView);
      }
      setCurrentView(route.view);
      setSelectedDocId(route.docId);
    }
  }, [location.pathname]);

  const navigate = (newView: string, docId: string | null = null, replace = false, state?: any) => {
    const isStoredLoggedIn = localStorage.getItem("isLoggedIn") === "true" && Boolean(localStorage.getItem("authToken"));
    if (!isStoredLoggedIn && newView !== "login") {
      newView = "login";
      docId = null;
      replace = true;
    }

    const targetPath = getPathFromRoute(newView, docId);
    const navState = state !== undefined ? state : { from: location.pathname };

    routerNavigate(targetPath, { replace, state: navState });

    if (newView !== "details" && newView !== "customer-feedback") {
      setPreviousView(currentView);
    }
    setCurrentView(newView);
    setSelectedDocId(docId);
  };

  const handleNavigateToWorkTracker = (statusFilter: string) => {
    setWorkTrackerInitialFilter(statusFilter);
    localStorage.setItem("workTrackerStatusFilter", statusFilter);
    navigate("work-tracker", null, false);
  };

  // Default Actor settings
  const [currentUserRole, setCurrentUserRole] = useState<string>(() => localStorage.getItem("currentUserRole") || "");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>(() => localStorage.getItem("currentUserEmail") || "");
  const [currentUserUsername, setCurrentUserUsername] = useState<string>(() => localStorage.getItem("currentUserUsername") || "");
  const [kickedReason, setKickedReason] = useState<string | null>(() => sessionStorage.getItem("sessionKickedReason") || null);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (token) {
      fetch("/api/auth/me", {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then(r => r.ok ? r.json() : null)
        .then(u => {
          if (u) {
            if (u.role) {
              setCurrentUserRole(u.role);
              localStorage.setItem("currentUserRole", u.role);
            }
            if (u.username) {
              setCurrentUserUsername(u.username);
              localStorage.setItem("currentUserUsername", u.username);
            }
            if (u.email) {
              setCurrentUserEmail(u.email);
              localStorage.setItem("currentUserEmail", u.email);
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({
    employee: ["dashboard", "work-tracker", "customer-feedback", "approved-documents", "dapi-sync-back"],
    settings_editor: ["dashboard", "work-tracker", "customer-feedback", "approved-documents", "workflow-rules", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"],
    admin: ["dashboard", "work-tracker", "customer-feedback", "approved-documents", "upload", "data-verification", "workflow-rules", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"]
  });

  // Multi-Tab Synchronization across tabs in the same browser
  const handleLogoutRef = useRef<(reason?: string | null, broadcast?: boolean) => void>(() => {});
  const refreshDataRef = useRef<() => void>(() => {});

  useEffect(() => {
    let authChannel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        authChannel = new BroadcastChannel("docuflow_auth_channel");
        authChannel.onmessage = (event) => {
          if (event.data?.type === "LOGIN") {
            // Fresh start on Dashboard for all open tabs, never inside any doc
            setCurrentView("dashboard");
            setSelectedDocId(null);
            setPreviousView("dashboard");
            if (typeof window !== "undefined") {
              window.history.replaceState({ view: "dashboard", docId: null }, "", "/dashboard");
            }
            setIsLoggedIn(true);
            setCurrentUserRole(event.data.role || localStorage.getItem("currentUserRole") || "");
            setCurrentUserEmail(event.data.email || localStorage.getItem("currentUserEmail") || "");
            setCurrentUserUsername(event.data.username || localStorage.getItem("currentUserUsername") || "");
            setKickedReason(null);
            sessionStorage.removeItem("sessionKickedReason");
            sessionStorage.setItem("hasShownWelcomeQueue", "false");
            setShowPendingModal(false);
            setLoadingDocs(true);
            refreshDataRef.current();
          } else if (event.data?.type === "LOGOUT") {
            handleLogoutRef.current(null, false);
            try {
              if (window.opener && !window.opener.closed) {
                window.close();
              }
            } catch {}
          } else if (event.data?.type === "SESSION_KICKED") {
            const reason = event.data.reason || "Your session was terminated because your account was logged in from another device/browser.";
            setKickedReason(reason);
            sessionStorage.setItem("sessionKickedReason", reason);
            handleLogoutRef.current(reason, false);
            try {
              if (window.opener && !window.opener.closed) {
                window.close();
              }
            } catch {}
          }
        };
      }
    } catch (e) {
      console.warn("BroadcastChannel not supported or error:", e);
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "authToken") {
        if (!e.newValue) {
          handleLogoutRef.current(null, false);
          try {
            if (window.opener && !window.opener.closed) {
              window.close();
            }
          } catch {}
        } else {
          // Fresh start on Dashboard for all open tabs, never inside any doc
          setCurrentView("dashboard");
          setSelectedDocId(null);
          setPreviousView("dashboard");
          if (typeof window !== "undefined") {
            window.history.replaceState({ view: "dashboard", docId: null }, "", "/dashboard");
          }
          setIsLoggedIn(true);
          setCurrentUserRole(localStorage.getItem("currentUserRole") || "");
          setCurrentUserEmail(localStorage.getItem("currentUserEmail") || "");
          setCurrentUserUsername(localStorage.getItem("currentUserUsername") || "");
          setKickedReason(null);
          sessionStorage.removeItem("sessionKickedReason");
          sessionStorage.setItem("hasShownWelcomeQueue", "false");
          setShowPendingModal(false);
          setLoadingDocs(true);
          refreshDataRef.current();
        }
      }
    };

    const handleNavigateView = (e: any) => {
      if (e.detail) {
        navigate(e.detail, null, false);
      }
    };

    const handlePopState = () => {
      const isStoredLoggedIn = localStorage.getItem("isLoggedIn") === "true" && Boolean(localStorage.getItem("authToken"));

      // Logout Security Guard: block protected views if not logged in
      if (!isStoredLoggedIn) {
        setIsLoggedIn(false);
        setCurrentView("login");
        setSelectedDocId(null);
        if (window.location.pathname !== "/login") {
          window.history.replaceState({ view: "login", docId: null }, "", "/login");
        }
        return;
      }

      // If user is authenticated, parse destination route
      const route = parseRouteFromPath(window.location.pathname);
      if (route.view === "login") {
        window.history.replaceState({ view: "dashboard", docId: null }, "", "/dashboard");
        setCurrentView("dashboard");
        setSelectedDocId(null);
        return;
      }

      isNavigatingFromPopStateRef.current = true;
      setCurrentView(route.view);
      setSelectedDocId(route.docId);
    };

    const handlePageShow = () => {
      const isStoredLoggedIn = localStorage.getItem("isLoggedIn") === "true" && Boolean(localStorage.getItem("authToken"));
      if (!isStoredLoggedIn) {
        setIsLoggedIn(false);
        setCurrentView("login");
        setSelectedDocId(null);
        if (window.location.pathname !== "/login") {
          window.history.replaceState({ view: "login", docId: null }, "", "/login");
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("navigate-view", handleNavigateView);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      if (authChannel) authChannel.close();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("navigate-view", handleNavigateView);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pageshow", handlePageShow);
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
  const [_showPendingModal, setShowPendingModal] = useState(false);

  const isDocumentPendingForUser = (doc: DbInvoice) => {
    if (!doc) return false;
    const terminalStates = ["Approved", "Fully Approved", "Settled", "Completed", "Paid", "Ready for Payment", "Rejected", "Failed", "Cancelled", "Auto-Approved", "On Hold"];
    if (terminalStates.includes(doc.status)) return false;
    const st = (doc.status || "").toLowerCase();
    if (st.includes("hold") || st.includes("pause") || st.includes("reject") || st.includes("cancel") || st.includes("fail")) return false;
    if ((doc as any).has_approved) return false;

    // Check if the user is explicitly assigned to it at current stage
    if (doc.is_current_approver === false) return false;
    if (doc.is_current_approver) return true;

    const uHandle = (currentUserUsername || "").toLowerCase().trim();
    const eHandle = (currentUserEmail || "").toLowerCase().trim();
    const rHandle = (currentUserRole || "").toLowerCase().trim();

    const roleAliases: Record<string, string[]> = {
      admin: ["admin", "administrator", "system administrator", "superadmin", "system_admin"],
      manager: ["manager", "operations manager", "operations_manager", "finance_manager", "finance manager"],
      finance_manager: ["finance_manager", "finance manager", "manager", "operations_manager"],
      ap_executive: ["ap_executive", "ap executive", "ap_specialist", "ap specialist", "accounts_approver", "accounts approver", "ap", "accounts"],
      accounts_approver: ["accounts_approver", "accounts approver", "ap_executive", "ap executive", "ap_specialist", "ap specialist", "ap", "accounts"],
      accounts_approver2: ["accounts_approver2", "accounts approver 2", "accounts_approver", "accounts approver", "ap", "accounts"],
      employee: ["employee", "standard employee", "standard_employee"],
      account_uploder: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader", "accounts", "account"],
      accounts_uploder: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader", "accounts", "account"],
      doc_uploder: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader", "accounts", "account"],
      account_uploader: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader", "accounts", "account"],
      doc_uploader: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader", "accounts", "account"]
    };
    const activeAliases = roleAliases[rHandle] ? [...roleAliases[rHandle]] : (rHandle ? [rHandle] : []);
    if (uHandle === "yuvasree" || uHandle === "meshak") {
      activeAliases.push("account_uploder", "account_uploader", "accounts_uploder", "accounts_uploader", "uploader");
    }
    const nHandle = (localStorage.getItem("currentUserName") || "").toLowerCase().trim();
    const empHandle = (localStorage.getItem("currentUserEmployeeId") || "").toLowerCase().trim();

    const idHandle = (localStorage.getItem("currentUserId") || localStorage.getItem("userId") || "").toLowerCase().trim();
    const docUserId = String(doc.user_id || (doc as any).assigned_user_id || (doc as any).approver_user_id || "").toLowerCase().trim();
    if (idHandle && docUserId && idHandle === docUserId) return true;

    const rawAssigned = (doc.assigned_approver || (doc as any).assigned_to || (doc as any).assigned_user || "").toLowerCase();
    if (rawAssigned) {
      const approvers = rawAssigned.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (idHandle && approvers.some((p: string) => p && p === idHandle)) return true;
      if (uHandle && approvers.some((p: string) => p && (p.includes(uHandle) || uHandle.includes(p)))) return true;
      if (nHandle && approvers.some((p: string) => p && (p.includes(nHandle) || nHandle.includes(p)))) return true;
      if (empHandle && approvers.some((p: string) => p && (p.includes(empHandle) || empHandle.includes(p)))) return true;
      if (eHandle && approvers.some((p: string) => p && (p.includes(eHandle) || eHandle.includes(p)))) return true;
      if (rHandle && approvers.some(p => p && activeAliases.some(a => a && (p.includes(a) || a.includes(p))))) return true;
    }

    const sLow = (doc.status || "").toLowerCase();
    const isUnrouted = sLow.includes("unrouted") || sLow.includes("no rule") || (doc.assigned_approver || "").toLowerCase().includes("unassigned");
    const isStage1 = ((doc.current_stage || 1) === 1 || sLow.includes("attachment") || sLow.includes("initiated"));
    const isUploader = rHandle.includes("uplod") || rHandle.includes("account") || rHandle === "admin" || rHandle === "manager";
    if (sLow.includes("verification") && (rHandle === "ap_executive" || rHandle === "executive" || isUploader)) return true;
    if (isUnrouted && isUploader) return true;
    if (isStage1 && isUploader) return true;

    return false;
  };

  // Sync Registry documents
  const fetchDocuments = async (silent = false) => {
    if (!silent) setLoadingDocs(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/documents", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        signal: controller.signal
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
      // Backend temporarily offline or timed out
    } finally {
      clearTimeout(timeoutId);
      setLoadingDocs(false);
    }
  };

  // Sync aggregations stats
  const fetchStats = async (_silent = false) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const token = localStorage.getItem("authToken");
      const response = await fetch("/api/stats", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {},
        signal: controller.signal
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
      clearTimeout(timeoutId);
    }
  };

  refreshDataRef.current = () => {
    fetchDocuments();
    fetchStats();
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchDocuments();
    fetchStats();

    // Real-Time Server-Sent Events (SSE) Stream
    let eventSource: EventSource | null = null;
    let isCancelled = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectSSE = async () => {
      if (isCancelled || !isLoggedIn) return;
      try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        if (!token) return;

        // Request a short-lived, single-use ticket to prevent exposing JWT in URLs
        const ticketRes = await fetch('/api/events/stream-ticket', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!ticketRes.ok || isCancelled) return;
        const ticketData = await ticketRes.json();
        const ticket = ticketData?.ticket;
        if (!ticket || isCancelled) return;

        eventSource = new EventSource(`/api/events/stream?ticket=${encodeURIComponent(ticket)}`);
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
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (!isCancelled) {
            reconnectTimeout = setTimeout(connectSSE, 5000);
          }
        };
      } catch (e) {
        console.warn("SSE connection error:", e);
      }
    };

    connectSSE();

    // Polling fallback
    const docInterval = setInterval(() => {
      fetchDocuments(true);
    }, 10000);
    const statsInterval = setInterval(() => {
      fetchStats(true);
    }, 15000);

    return () => {
      isCancelled = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
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
    localStorage.setItem("currentUserId", String(userId || ""));
    localStorage.setItem("userId", String(userId || ""));
    localStorage.setItem("currentUserRole", role);
    localStorage.setItem("currentUserEmail", email);
    localStorage.setItem("currentUserUsername", username);
    localStorage.setItem("currentView", "dashboard");
    localStorage.setItem("lastActivityTime", String(Date.now()));
    
    // Always reset view and document selection back to Dashboard upon login
    setCurrentView("dashboard");
    setSelectedDocId(null);
    setPreviousView("dashboard");
    if (typeof window !== "undefined") {
      window.history.replaceState({ view: "dashboard", docId: null }, "", "/dashboard");
    }

    setCurrentUserRole(role);
    setCurrentUserEmail(email);
    setCurrentUserUsername(username);
    setKickedReason(null);
    sessionStorage.removeItem("sessionKickedReason");
    sessionStorage.setItem("hasShownWelcomeQueue", "false");
    setShowPendingModal(false);
    setLoadingDocs(true);
    setIsLoggedIn(true);
    fetchDocuments();
    fetchStats();

    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("docuflow_auth_channel");
        channel.postMessage({ type: "LOGIN", role, email, username });
        channel.close();
      }
    } catch {}
  };

  useEffect(() => {
    if (isLoggedIn && currentView) {
      localStorage.setItem("currentView", currentView);
    }
  }, [currentView, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem("currentUserRole", currentUserRole);
    }
  }, [currentUserRole, isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem("currentUserEmail", currentUserEmail);
    }
  }, [currentUserEmail, isLoggedIn]);

  // Synchronize browser address bar pathname dynamically based on currentView and selectedDocId
  useEffect(() => {
    if (isNavigatingFromPopStateRef.current) {
      isNavigatingFromPopStateRef.current = false;
      return;
    }

    if (!isLoggedIn) {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.history.replaceState({ view: "login", docId: null }, "", "/login");
      }
      return;
    }

    const targetPath = getPathFromRoute(currentView, selectedDocId);
    if (window.location.pathname !== targetPath) {
      const currentState = (typeof window !== "undefined" && window.history.state) ? window.history.state : {};
      window.history.pushState({ ...currentState, view: currentView, docId: selectedDocId }, "", targetPath);
    }
  }, [currentView, selectedDocId, isLoggedIn]);

  const [requireGRN, setRequireGRN] = useState(true);
  const [orgName, setOrgName] = useState("Document Approval & Automation System");

  // Fetch dynamic role permissions from DB & Config
  const fetchRolePermissions = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};

      const [configRes, rolesRes] = await Promise.all([
        fetch("/api/admin/config", { headers }),
        fetch("/api/admin/roles", { headers })
      ]);

      const mergedPerms: Record<string, any> = {};

      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        if (Array.isArray(rolesData)) {
          rolesData.forEach((r: any) => {
            if (r.code && Array.isArray(r.permissions)) {
              mergedPerms[r.code] = r.permissions;
            }
          });
        }
      }

      if (configRes.ok) {
        const data = await configRes.json();
        if (Array.isArray(data)) {
          const matrixConfig = data.find((c: any) => c.key === "RBAC_GRANULAR_MATRIX");
          const roleConfig = data.find((c: any) => c.key === "ROLE_PERMISSIONS");
          const activeConfig = matrixConfig || roleConfig;
          if (activeConfig && activeConfig.value) {
            try {
              const parsed = JSON.parse(activeConfig.value);
              Object.assign(mergedPerms, parsed);
            } catch {}
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

      if (Object.keys(mergedPerms).length > 0) {
        setRolePermissions(mergedPerms);
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

  // Helper to compute active user permissions
  const getUserPermissions = (): string[] => {
    const rawRole = (currentUserRole || "").toLowerCase().trim();
    if (rawRole === "admin" || rawRole === "administrator" || rawRole.includes("admin") || rawRole === "settings_editor") {
      return ["dashboard", "work-tracker", "approved-documents", "customer-feedback", "upload", "data-verification", "workflow-rules", "admin", "dapi-sync-back", "integrations", "applications", "callback-rules", "integration-logs"];
    }
    const roleKey = rawRole.replace(/[^a-z0-9_]/g, "_");
    const rolePermObj = 
      rolePermissions[currentUserRole] || 
      rolePermissions[rawRole] || 
      rolePermissions[roleKey] ||
      (rawRole.includes("uplod") || rawRole.includes("upload") ? (rolePermissions["account_uploder"] || rolePermissions["accounts_uploder"] || rolePermissions["doc_uploder"]) : undefined) ||
      (rawRole.includes("approver") || rawRole.includes("manager") || rawRole.includes("account") ? (rolePermissions["manager"] || rolePermissions["accounts_approver"] || rolePermissions["accounts.approver"]) : undefined) ||
      (rawRole.includes("feedback") ? (rolePermissions["customer_feedback_agent"] || rolePermissions["employee"]) : undefined);

    let basePerms: string[] = [];
    if (Array.isArray(rolePermObj)) {
      basePerms = [...rolePermObj];
    } else if (rolePermObj && typeof rolePermObj === "object") {
      basePerms = Object.keys(rolePermObj).filter(key => {
        const val = (rolePermObj as Record<string, any>)[key];
        if (typeof val === "boolean") return val;
        if (typeof val === "object" && val !== null) {
          return Boolean(val.read || val.write || val.admin);
        }
        return false;
      });
    } else {
      basePerms = ["dashboard", "work-tracker", "approved-documents", "customer-feedback"];
    }

    // Canonical code expansion to top-level view navigation IDs
    const activeCodes = new Set(basePerms);
    if (activeCodes.has("doc:upload") || activeCodes.has("doc:create") || activeCodes.has("upload:create") || activeCodes.has("upload:write") || activeCodes.has("doc:upload:create") || rawRole.includes("uplod") || rawRole.includes("upload")) {
      activeCodes.add("upload");
    }
    if (activeCodes.has("doc:read") || activeCodes.has("doc:view") || activeCodes.has("doc:work_tracker") || activeCodes.has("doc:work_tracker:view") || activeCodes.has("wf:view") || rawRole.includes("uplod") || rawRole.includes("upload") || rawRole.includes("account")) {
      activeCodes.add("work-tracker");
      activeCodes.add("dashboard");
    }
    if (activeCodes.has("doc:approved_view") || activeCodes.has("doc:approved_docs:view") || rawRole.includes("uplod") || rawRole.includes("upload") || rawRole.includes("account")) {
      activeCodes.add("approved-documents");
    }
    if (activeCodes.has("wf:customer_feedback") || activeCodes.has("customer_feedback") || activeCodes.has("customer-feedback")) {
      activeCodes.add("customer-feedback");
    }
    if (activeCodes.has("workflow:routing:view") || activeCodes.has("workflow:read") || activeCodes.has("workflow-rules")) {
      activeCodes.add("workflow-rules");
    }
    if (activeCodes.has("admin:users:view") || activeCodes.has("admin:rbac:view") || activeCodes.has("user:manage") || activeCodes.has("admin")) {
      activeCodes.add("admin");
    }
    return Array.from(activeCodes);
  };

  // Access Control Enforcement
  useEffect(() => {
    if (!isLoggedIn) return;
    
    const permissions = getUserPermissions();
    
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
  const handleViewDocument = (docId: string | number, state?: any) => {
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

    const navState = state || { from: location.pathname };
    if (docType === "CUSTOMER FEEDBACK" || docIdStr.toUpperCase().startsWith("CMP") || docIdStr.toUpperCase().startsWith("CF")) {
      navigate("customer-feedback", docIdStr, false, navState);
    } else {
      navigate("details", docIdStr, false, navState);
    }
    fetchDocuments(true);
  };

  // Handles adding recently parsed documents to the state
  const handleDocUploadSuccess = (newDoc: DbInvoice) => {
    setDocuments((prev) => [newDoc, ...prev]);
    fetchStats();
  };

  function handleLogout(reason?: string | null, broadcast = true) {
    const activeToken = localStorage.getItem("authToken") || localStorage.getItem("token");
    if (selectedDocId && activeToken) {
      try {
        fetch(`/api/invoices/${selectedDocId}/lock/release`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${activeToken}`
          },
          body: JSON.stringify({}),
          keepalive: true
        }).catch(() => {});
      } catch {}
    }

    // 1. Clear all authentication tokens and storage
    removeAuthTokens();
    localStorage.removeItem("authToken");
    localStorage.removeItem("token");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("lastActivityTime");
    localStorage.removeItem("currentView");
    localStorage.removeItem("currentUserRole");
    localStorage.removeItem("currentUserEmail");
    localStorage.removeItem("currentUserUsername");
    localStorage.removeItem("currentUserName");
    localStorage.removeItem("currentUserEmployeeId");
    localStorage.removeItem("workTrackerStatusFilter");
    localStorage.removeItem("adminActiveTab");

    // Clear session storage, preserving kicked reason if present
    const savedKickedReason = reason || sessionStorage.getItem("sessionKickedReason");
    sessionStorage.clear();
    if (savedKickedReason) {
      sessionStorage.setItem("sessionKickedReason", savedKickedReason);
      setKickedReason(savedKickedReason);
    } else {
      setKickedReason(null);
    }

    // 2. Clear in-memory sensitive application data
    setSelectedDocId(null);
    setCurrentView("login");
    setPreviousView("dashboard");
    setCurrentUserRole("");
    setCurrentUserEmail("");
    setCurrentUserUsername("");
    setShowPendingModal(false);
    setDocuments([]);
    setStats(null);
    setLoadingDocs(false);
    setIsLoggedIn(false);

    // 3. Replace browser history with /login so Chrome Back cannot enter authenticated views
    if (typeof window !== "undefined") {
      window.history.replaceState({ view: "login", docId: null }, "", "/login");
    }

    if (broadcast) {
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const channel = new BroadcastChannel("docuflow_auth_channel");
          if (savedKickedReason) {
            channel.postMessage({ type: "SESSION_KICKED", reason: savedKickedReason });
          } else {
            channel.postMessage({ type: "LOGOUT" });
          }
          channel.close();
        }
      } catch {}
    }
  }

  handleLogoutRef.current = handleLogout;

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

  // Fallback single-document fetching for direct route loading (e.g. /review/:id)
  const [directDocument, setDirectDocument] = useState<DbInvoice | null>(null);
  const [directDocLoading, setDirectDocLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn && selectedDocId && !documents.some(d => String(d.id) === String(selectedDocId))) {
      let isMounted = true;
      setDirectDocLoading(true);
      const token = localStorage.getItem("authToken");
      fetch(`/api/documents/${selectedDocId}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data) {
          setDirectDocument(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setDirectDocLoading(false);
      });
      return () => { isMounted = false; };
    } else {
      setDirectDocument(null);
    }
  }, [isLoggedIn, selectedDocId, documents]);

  // Get active selected doc object
  const activeDocument = documents.find((d) => String(d.id) === String(selectedDocId)) || directDocument || null;

  // Unauthenticated viewport
  if (!isLoggedIn) {
    return (
      <Suspense fallback={<RouteLoadingFallback />}>
        <LoginPage
          kickedReason={kickedReason}
          onClearKickedReason={() => {
            setKickedReason(null);
            sessionStorage.removeItem("sessionKickedReason");
          }}
          onLoginSuccess={(userId, role, email, username) => {
            handleLoginSuccess(userId, role, email, username);
            sessionStorage.setItem("hasShownWelcomeQueue", "false");
            // Always start completely fresh in Dashboard, never retain previous document state
            setSelectedDocId(null);
            setCurrentView("dashboard");
          }}
        />
      </Suspense>
    );
  }

  const pendingActionDocs = !loadingDocs ? documents.filter(isDocumentPendingForUser) : [];

  return (
    <div className="h-screen w-full bg-[#FAF8F3] text-slate-900 flex font-sans overflow-hidden">
      
      {/* Sleek Navigation Sidebar */}
      <Sidebar
        currentView={currentView}
        setCurrentView={(view) => {
          navigate(view, null, false);
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
            navigate(view, null, false);
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
          userPermissions={getUserPermissions()}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 pt-1 pb-2">
          <div className="w-full max-w-[1920px] mx-auto space-y-2 animate-fadeIn">
            <Suspense fallback={<RouteLoadingFallback />}>
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
                loading={loadingDocs && documents.length === 0}
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
                (loadingDocs || directDocLoading) ? (
                  <div className="text-center py-24 bg-white border border-slate-200 rounded-2xl max-w-md mx-auto flex flex-col items-center justify-center animate-pulse">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin mb-4" />
                    <p className="text-slate-500 font-semibold text-[10px] tracking-wider uppercase">Loading Document Details...</p>
                  </div>
                ) : (
                  <div className="text-center py-24 bg-white border border-slate-200 rounded-2xl max-w-md mx-auto flex flex-col items-center justify-center">
                    <p className="text-slate-700 font-bold mb-4">Document Not Found or Access Denied</p>
                    <button onClick={() => navigate("dashboard", null, false)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">
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
                    setSelectedDocId(null);
                    if (location.pathname.startsWith('/review') || location.pathname.startsWith('/details')) {
                      const fromTarget = location.state?.from || (window.history.state as any)?.from || (window.history.state as any)?.usr?.from;
                      if (fromTarget && typeof fromTarget === "string") {
                        routerNavigate(fromTarget);
                      } else if (typeof window !== "undefined" && window.history.length > 2) {
                        routerNavigate(-1);
                      } else {
                        routerNavigate(previousView && previousView !== "details" ? getPathFromRoute(previousView) : "/dashboard");
                      }
                    }
                  }}
                  onSelectDocument={(docId) => handleViewDocument(docId, location.state || { from: location.pathname })}
                  pendingDocIds={pendingActionDocs.map(d => d.id)}
                />
              )
            )}
            </Suspense>
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
