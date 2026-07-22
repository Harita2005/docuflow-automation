import { useState, useEffect } from "react";
import Header from "./components/Header.tsx";
import Sidebar from "./components/Sidebar.tsx";
import LoginPage from "./components/LoginPage.tsx";
import Dashboard from "./components/Dashboard.tsx";
import DocumentUpload from "./components/DocumentUpload.tsx";
import DocumentDetails from "./components/DocumentDetails.tsx";
import GoodsReceiptPage from "./components/GoodsReceiptPage.tsx";
import DataVerificationPage from "./components/DataVerificationPage.tsx";
import ApprovalQueuePage from "./components/ApprovalQueuePage.tsx";
import PaymentReadinessPage from "./components/PaymentReadinessPage.tsx";
import WorkTrackerPage from "./components/WorkTrackerPage.tsx";
import GettingStartedPage from "./components/GettingStartedPage.tsx";
import AdminPage from "./pages/Admin.jsx";
import { DbInvoice } from "./types.ts";
import { Sparkles, ClipboardCheck, Clock, ArrowRight, X } from "lucide-react";
import { io } from "socket.io-client";

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

  // Registry states
  const [documents, setDocuments] = useState<DbInvoice[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [showPendingModal, setShowPendingModal] = useState(false);

  const isDocumentPendingForUser = (doc: DbInvoice) => {
    const terminalStates = ["Approved", "Paid", "Ready for Payment", "Rejected", "Failed"];
    if (terminalStates.includes(doc.status)) return false;

    const isInvoice = (doc.document_type || "").toLowerCase().includes("invoice");
    if (!isInvoice) return false;

    if (doc.status === "Data Verification Pending") {
      return currentUserRole === "admin" || currentUserRole === "ap_executive";
    }

    if (doc.activeApprovalLog && doc.activeApprovalLog.status === 'Pending') {
      return !!doc.is_current_approver;
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
        handleLogout();
      } else {
        console.error("Failed to fetch documents:", await response.text());
      }
    } catch (e) {
      console.error("Failed to fetch documents registry stats:", e);
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
        handleLogout();
      } else {
        console.error("Failed to fetch analytical stats counters:", await response.text());
        setStats({ totalDocuments: 0 }); // Fallback to avoid infinite loading
      }
    } catch (e) {
      console.error("Failed to fetch analytical stats counters:", e);
      setStats({ totalDocuments: 0 }); // Fallback to avoid infinite loading
    } finally {
      if (!silent) setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchDocuments();
    fetchStats();

    // Aggressive Polling for Real-Time Dashboard Metrics
    const docInterval = setInterval(() => {
      fetchDocuments(true);
    }, 3000);
    const statsInterval = setInterval(() => {
      fetchStats(true);
    }, 5000);

    return () => {
      clearInterval(docInterval);
      clearInterval(statsInterval);
    };
  }, [isLoggedIn]);

  // WebSockets Connection
  useEffect(() => {
    const socket = io("/"); // Automatically connects to the same origin host:port

    socket.on("workflow_updated", (data) => {
      console.log("WebSocket Event: workflow_updated", data);
      fetchDocuments(true);
      fetchStats(true);
    });

    socket.on("new_notification", (data) => {
      console.log("WebSocket Event: new_notification", data);
      window.dispatchEvent(new CustomEvent("new_notification", { detail: data }));
    });

    socket.on("document_ingested", (data) => {
      console.log("WebSocket Event: document_ingested", data);
      fetchDocuments(true);
      fetchStats(true);
    });

    socket.on("new_comment", (data) => {
      console.log("WebSocket Event: new_comment", data);
      fetchDocuments(true);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Sync state to localStorage to persist across refreshes
  useEffect(() => {
    localStorage.setItem("isLoggedIn", String(isLoggedIn));
  }, [isLoggedIn]);

  const handleLoginSuccess = (userId: string, role: string, email: string) => {
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("currentUserRole", role);
    localStorage.setItem("currentUserEmail", email);
    setCurrentUserRole(role);
    setCurrentUserEmail(email);
    setCurrentUserUsername(localStorage.getItem("currentUserUsername") || "");
    setIsLoggedIn(true);
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

  // Access Control Enforcement
  useEffect(() => {
    if (!isLoggedIn) return;
    const isAdmin = currentUserRole === "admin";
    const isEmployee = currentUserRole === "employee" || isAdmin;
    
    if (currentView === "admin" && !isAdmin) {
      setCurrentView("dashboard");
    } else if ((currentView === "upload" || currentView === "goods-receipt") && !isEmployee) {
      setCurrentView("dashboard");
    }
  }, [currentView, currentUserRole, isLoggedIn]);

  function handleFullRefresh() {
    fetchDocuments();
    fetchStats();
  }

  // Handles switching directly to inspect a document details panel
  const handleViewDocument = (docId: string) => {
    setSelectedDocId(docId);
    setCurrentView("details");
    fetchDocuments(true);
  };

  // Handles adding recently parsed documents to the state
  const handleDocUploadSuccess = (newDoc: DbInvoice) => {
    setDocuments((prev) => [newDoc, ...prev]);
    fetchStats();
  };

  function handleLogout() {
    localStorage.removeItem("authToken");
    sessionStorage.removeItem("hasShownWelcomeQueue");
    setIsLoggedIn(false);
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
  const activeDocument = documents.find((d) => d.id === selectedDocId) || null;

  // Unauthenticated viewport
  if (!isLoggedIn) {
    return (
      <LoginPage
        onLoginSuccess={(userId, role, email, username) => {
          setCurrentUserRole(role);
          setCurrentUserEmail(email);
          setCurrentUserUsername(username);
          setIsLoggedIn(true);
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
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto px-6 pt-0 pb-2">
          <div className="w-full max-w-[1920px] mx-auto space-y-4 animate-fadeIn">
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
                setCurrentView={setCurrentView}
              />
            )}

            {currentView === "work-tracker" && (
              <WorkTrackerPage
                documents={documents}
                onViewDocument={handleViewDocument}
              />
            )}

            {currentView === "upload" && (
              <DocumentUpload
                onUploadSuccess={handleDocUploadSuccess}
                setCurrentView={setCurrentView}
                setSelectedDocId={setSelectedDocId}
              />
            )}

            {currentView === "goods-receipt" && (
              <GoodsReceiptPage
                onWorkflowTriggered={handleFullRefresh}
                currentUserEmail={currentUserEmail}
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
                        {doc.document_type || "Invoice"} • {doc.invoice_number}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="block text-[11px] font-black text-slate-900">
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(doc.amount || 0)}
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
