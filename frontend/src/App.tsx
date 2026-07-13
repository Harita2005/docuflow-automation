import { useState, useEffect } from "react";
import Header from "./components/Header.tsx";
import Sidebar from "./components/Sidebar.tsx";
import LoginPage from "./components/LoginPage.tsx";
import Dashboard from "./components/Dashboard.tsx";
import DocumentUpload from "./components/DocumentUpload.tsx";
import DocumentDetails from "./components/DocumentDetails.tsx";
import GoodsReceiptPage from "./components/GoodsReceiptPage.tsx";
import DataVerificationPage from "./components/DataVerificationPage.tsx";


import PaymentReadinessPage from "./components/PaymentReadinessPage.tsx";
import WorkTrackerPage from "./components/WorkTrackerPage.tsx";
import GettingStartedPage from "./components/GettingStartedPage.tsx";
import AdminPage from "./pages/Admin.jsx";
import { DbInvoice } from "./types.ts";
import { Sparkles } from "lucide-react";
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
    setIsLoggedIn(false);
  }

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
          // Smart Routing based on role
          setCurrentView((prev) => {
            if (prev === "details" && selectedDocId) return "details";
            // If they are an approver or employee, send them straight to the queue!
            if (role === "manager" || role === "executive" || role === "employee") return "approval-queue";
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
                />
              )
            )}
          </div>
        </main>


      </div>
    </div>
  );
}
