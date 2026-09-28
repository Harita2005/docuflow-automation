import React, { useState, useEffect } from "react";
import {
  X,
  BookOpen,
  Search,
  Layers,
  CheckCircle2,
  Upload,
  LayoutDashboard,
  MessageSquare,
  Sliders,
  Shield,
  Clock,
  UserCheck,
  FileText,
  Printer,
  ChevronRight,
  Sparkles,
  GitFork,
  CheckSquare,
  History,
  Check
} from "lucide-react";

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultSection?: "operations" | "feedback" | "admin";
  currentUserRole?: string;
  userPermissions?: string[];
}

export default function UserManualModal({
  isOpen,
  onClose,
  defaultSection = "operations",
  currentUserRole = "",
  userPermissions = []
}: UserManualModalProps) {
  const roleKey = (currentUserRole || "").toLowerCase().trim();
  const isAdmin = roleKey.includes("admin") || roleKey.includes("settings") || roleKey === "administrator" || userPermissions.includes("admin");
  const isFeedbackRole = roleKey.includes("feedback") || roleKey === "customer_feedback_agent";

  // Strict Role-Based Visibility Checks:
  // Admin: gets all 3 manuals (Operations, Feedback, Admin)
  // Feedback Agent: gets Feedback manual (and Ops manual ONLY if they have explicit ops permissions)
  // Ops Users (approvers, managers, ap_executive, employee): get Ops manual
  // Admin Manual: strictly Admin only!
  const hasFeedbackAccess = isAdmin || isFeedbackRole || userPermissions.includes("customer-feedback");
  const hasAdminAccess = isAdmin;
  const hasOpsAccess = isAdmin || (
    !isFeedbackRole && (
      userPermissions.length === 0 || 
      userPermissions.some(p => ["dashboard", "work-tracker", "approved-documents", "upload", "data-verification"].includes(p)) ||
      ["ap_executive", "manager", "accounts_approver", "executive", "employee", "finance_manager"].includes(roleKey) ||
      roleKey.includes("approver") || roleKey.includes("manager") || roleKey.includes("ap")
    )
  ) || (isFeedbackRole && userPermissions.some(p => ["dashboard", "work-tracker", "approved-documents"].includes(p)));

  // Compute Initial Active Section based strictly on user access
  const computeInitialSection = (): "operations" | "feedback" | "admin" => {
    if (defaultSection === "admin" && hasAdminAccess) return "admin";
    if (defaultSection === "feedback" && hasFeedbackAccess) return "feedback";
    if (defaultSection === "operations" && hasOpsAccess) return "operations";
    if (hasFeedbackAccess && isFeedbackRole) return "feedback";
    if (hasOpsAccess) return "operations";
    if (hasFeedbackAccess) return "feedback";
    if (hasAdminAccess) return "admin";
    return "operations";
  };

  const [activeSection, setActiveSection] = useState<"operations" | "feedback" | "admin">(computeInitialSection);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setActiveSection(computeInitialSection());
  }, [defaultSection, currentUserRole, userPermissions]);

  if (!isOpen) return null;

  // 1. OPERATIONS MANUAL
  const operationsManual = {
    title: "📦 OPERATIONS USER MANUAL",
    subtitle: "Step-by-step operating guide for Operations Staff & Invoice Approvers",
    color: "from-[#003F28] to-[#005638]",
    sections: [
      {
        id: "ops_dashboard",
        title: "1. Dashboard Page & KPI Counters",
        icon: LayoutDashboard,
        badge: "Overview & Analytics",
        color: "bg-[#FFF7E2] text-[#D97706] border-[#FDE68A]",
        summary: "Monitor active workload, pending approval alerts, and filter documents by date and status.",
        steps: [
          "Understanding KPI Cards: Click any KPI card (PENDING, HOLD, REJECTED, PROGRESS, APPROVED) to filter your view.",
          "Date Range Filtering: Filter documents by 'Today', 'This Week', 'This Month', 'All Time', or 'Custom Date Range'.",
          "Doc Type Pills: Click document type pills to filter by AP Invoice, Freight, Capex, etc.",
          "Quick Inspection: Click any document row to open the full Document Inspection Panel."
        ]
      },
      {
        id: "ops_upload",
        title: "2. Document Upload Page & Extraction",
        icon: Upload,
        badge: "Intake & Extraction",
        color: "bg-[#F3E8FF] text-[#7E22CE] border-[#E9D5FF]",
        summary: "Ingest single or batch supplier invoice files and run automated OCR extraction.",
        steps: [
          "Select Division: Choose target enterprise division (e.g. VCC, ENES, ACM).",
          "Select Category: Choose expense category (e.g. Standard AP Invoice, Freight, Utilities).",
          "File Upload: Drag & drop PDF/image invoice files.",
          "OCR Parsing: System reads Vendor Name, Invoice Number, Gross Amount, Base Amount, and 18% GST splits.",
          "GRN Check: If physical verification is needed, document is placed in 'Waiting for GRN' state."
        ]
      },
      {
        id: "ops_work_tracker",
        title: "3. Work Tracker & Stage Approval Actions",
        icon: Layers,
        badge: "Action & Clearance",
        color: "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]",
        summary: "Review document metadata, verify checklist items, and execute workflow actions.",
        steps: [
          "Inspecting Data: Review supplier details, PO reference numbers, cost centers, and line items.",
          "Mandatory Checklist: Verify required stage checklist items before approving.",
          "APPROVE ACTION: Click 'Approve & Pass Stage', write sign-off remarks, and confirm.",
          "HOLD ACTION: Click 'Hold / Pause' if details are missing. MANDATORY clarification comments are required.",
          "REJECT ACTION: Click 'Reject' if invoice is invalid. MANDATORY rejection command notes are required.",
          "SLA Countdown: Monitor target SLA deadlines. Overdue items trigger automated escalation warnings."
        ]
      },
      {
        id: "ops_approved",
        title: "4. Approved Documents Page & Archival",
        icon: CheckCircle2,
        badge: "Settlement & Audit",
        color: "bg-[#E7F9F1] text-[#059669] border-[#A7F3D0]",
        summary: "Search, filter, and export fully settled and approved invoice records.",
        steps: [
          "Searching Approved Records: Search by Vendor Name, Invoice Number, or Approval Date.",
          "Filtering: Filter settled bills by Division or Expense Category.",
          "Download Signed PDF: Click 'Download PDF' to obtain physical invoice file stamped with digital signatures.",
          "ERP Sync: Verify SAP/ERP sync status keys and settlement reference codes."
        ]
      }
    ]
  };

  // 2. CUSTOMER FEEDBACK MANUAL
  const feedbackManual = {
    title: "💬 CUSTOMER FEEDBACK USER MANUAL",
    subtitle: "Operating guide for Customer Feedback Agents & Complaint Resolution Teams",
    color: "from-[#003F28] to-[#005638]",
    sections: [
      {
        id: "fb_tracker",
        title: "1. Customer Feedback Hub & Status Filters",
        icon: MessageSquare,
        badge: "Complaints Tracker",
        color: "bg-purple-50 text-purple-900 border-purple-200",
        summary: "Track customer complaints, quality defect notices, and service feedback tickets.",
        steps: [
          "Status Filter Tabs: Filter complaints by 'All', 'Pending Review', 'In Progress', 'On Hold', 'Rejected', and 'Cleared'.",
          "KPI Cards: View counters for Pending (Yellow), In Progress (Blue), On Hold (Purple), Rejected (Red), and Cleared (Green).",
          "Complaint Search: Search by Complaint ID, Dealer Name, Account Code, or Customer Name."
        ]
      },
      {
        id: "fb_inspection",
        title: "2. Inspecting Complaints & Evidence Files",
        icon: Search,
        badge: "Evidence Verification",
        color: "bg-indigo-50 text-indigo-900 border-indigo-200",
        summary: "Review complaint details, attached evidence photos, and packaging defect reports.",
        steps: [
          "Inspect Row: Click 'Inspect' on any complaint row to open full inspection drawer.",
          "Evidence Photos & PDF: Click evidence thumbnails (Image 1 - Image 5) to inspect physical defect evidence with zoom/rotate controls.",
          "Customer Details: Review Account Name, BP Code, Dealer Name, Employee ID, and Type of Complaint."
        ]
      },
      {
        id: "fb_sla",
        title: "3. SLA Target Completion & Auto-Escalation",
        icon: Clock,
        badge: "SLA Control",
        color: "bg-amber-50 text-amber-900 border-amber-200",
        summary: "Set target SLA completion deadlines and manage automated escalation triggers.",
        steps: [
          "Setting Target Date/Time: Select Target SLA Completion Date and Time for ticket resolution.",
          "Auto-Escalation: If target date/time expires without sign-off, DocuFlow automatically escalates ticket to higher management!",
          "Manual Escalation: Click 'Trigger Manual Escalation' for immediate senior management review."
        ]
      },
      {
        id: "fb_transition",
        title: "4. Approval Sign-Off & Next Person Transition Modal",
        icon: UserCheck,
        badge: "Stage Handover",
        color: "bg-emerald-50 text-emerald-900 border-emerald-200",
        summary: "Sign off on complaint stages and hand over ownership to next assigned person.",
        steps: [
          "APPROVE / PASS STAGE: Click 'Approve / Pass Stage' when review is complete.",
          "Transition Popup: Confirm approval remarks and select Next Assigned Person (Name & Designation) for Stage 2.",
          "Confirm & Handover: Click 'Confirm & Handover' — ownership transfers strictly to selected person!",
          "HOLD ACTION: Click 'Hold' to pause for customer clarification (MANDATORY hold comments required).",
          "REJECT ACTION: Click 'Reject' for invalid complaints (MANDATORY command notes required)."
        ]
      }
    ]
  };

  // 3. ADMIN GOVERNANCE MANUAL
  const adminManual = {
    title: "⚙️ ADMINISTRATOR & GOVERNANCE USER MANUAL",
    subtitle: "Guide for System Administrators on permissions, flows, rules, and audit logs",
    color: "from-[#003F28] to-[#005638]",
    sections: [
      {
        id: "adm_rbac",
        title: "1. 1-Click Page Access Clearance (RBAC)",
        icon: Shield,
        badge: "Access Controls",
        color: "bg-rose-50 text-rose-900 border-rose-200",
        summary: "Configure role clearances and page visibility across system pages.",
        steps: [
          "Role Clearance Matrix: Go to Control Settings -> Access Control & RBAC -> Role Clearance Matrix.",
          "Selecting Roles: Pick any role (Feedback Agent, Approver Manager, AP Staff, Employee).",
          "Master Page Access Switches: Toggle Master Switch ON/OFF for Operations Pages, Feedback Page, or Admin Pages.",
          "Sub-Actions: Set access level: 'View Only', 'Edit / Action' (Approve/Reject), or 'Admin Control'.",
          "Custom Permissions: Click '+ Add System Permission', type Permission Name, pick Category Group, click Create!",
          "User Master: Click '+ Add New Employee' to manage user logins and roles."
        ]
      },
      {
        id: "adm_flow",
        title: "2. Flow Builder (Creating & Editing Workflows)",
        icon: GitFork,
        badge: "Workflow Profiles",
        color: "bg-sky-50 text-sky-900 border-sky-200",
        summary: "Design multi-stage approval workflow profiles and stage approver pools.",
        steps: [
          "Create Workflow Profile: Go to Workflow & Rules Page -> Flow Builder -> click '+ Create New Workflow Profile'.",
          "Define Approval Stages: Add Stage 1, Stage 2, Stage 3, etc.",
          "Assign Approver Targets: Assign approvers by role name or employee IDs.",
          "Delegate Approvers: Set backup/delegate approvers for out-of-office coverage."
        ]
      },
      {
        id: "adm_condition",
        title: "3. Condition Builder (Routing Rules Engine)",
        icon: Sliders,
        badge: "Routing Logic",
        color: "bg-amber-50 text-amber-900 border-amber-200",
        summary: "Set up conditional routing rules using Search, Type, and Paste options.",
        steps: [
          "Select Condition Fields: Pick target document fields (Division, Category, Amount, Vendor Name).",
          "Enter Values: Use SEARCH options, TYPE value + Enter, or PASTE from Excel (auto-deduplicated!).",
          "Save & Publish: Link rule to Workflow Profile and click 'Save & Publish Condition'."
        ]
      },
      {
        id: "adm_checklist",
        title: "4. Universal Checklist Builder",
        icon: CheckSquare,
        badge: "Checklist Verification",
        color: "bg-emerald-50 text-emerald-900 border-emerald-200",
        summary: "Set up stage-wise verification checklists across divisions and categories.",
        steps: [
          "Create Checklist Rule: Go to Workflow & Rules Page -> Universal Checklist Matrix -> click '+ New Rule'.",
          "Target Mapping: Select Division, Category, Branch, and Stage Name.",
          "Checklist Items: Type verification requirements or pick from Master Library.",
          "Mandatory Flag: Enforce mandatory check before approvers can pass stage."
        ]
      },
      {
        id: "adm_audit",
        title: "5. Signed Audit Trail & Admin Log History",
        icon: History,
        badge: "Audit & Security",
        color: "bg-slate-100 text-slate-900 border-slate-300",
        summary: "Inspect tamper-evident audit logs and action dockets for complete compliance.",
        steps: [
          "Tamper-Evident Audit Trail: Every approval, hold, rejection, escalation, and permission update is cryptographically timestamped.",
          "Viewing Audit History: Click 'Signed Audit Trail' on any document or feedback record.",
          "System Audit Logs: Inspect overall IAM login history, permission modifications, and ERP sync logs."
        ]
      }
    ]
  };

  const currentManual =
    activeSection === "feedback"
      ? feedbackManual
      : activeSection === "admin"
      ? adminManual
      : operationsManual;

  // Count allowed manuals for tab selector rendering
  const allowedManualsCount = (hasOpsAccess ? 1 : 0) + (hasFeedbackAccess ? 1 : 0) + (hasAdminAccess ? 1 : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn font-sans select-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* DYNAMIC HEADER */}
        <div className={`px-6 py-4 bg-gradient-to-r ${currentManual.color} text-white flex items-center justify-between shrink-0 shadow-sm`}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-[#FFBF00] font-black text-lg">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight font-display text-white uppercase">
                {currentManual.title}
              </h2>
              <p className="text-[11.5px] text-white/80 font-medium">
                {currentManual.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              title="Print Manual"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* MANUAL SELECTOR BAR (ONLY RENDERED IF MULTIPLE MANUALS ALLOWED) */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {allowedManualsCount > 1 ? (
              <>
                {hasOpsAccess && (
                  <button
                    onClick={() => setActiveSection("operations")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                      activeSection === "operations"
                        ? "bg-[#003F28] text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-250 hover:bg-slate-50"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>📦 Operations Manual</span>
                  </button>
                )}

                {hasFeedbackAccess && (
                  <button
                    onClick={() => setActiveSection("feedback")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                      activeSection === "feedback"
                        ? "bg-[#003F28] text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-250 hover:bg-slate-50"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>💬 Feedback Manual</span>
                  </button>
                )}

                {hasAdminAccess && (
                  <button
                    onClick={() => setActiveSection("admin")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition flex items-center gap-1.5 cursor-pointer ${
                      activeSection === "admin"
                        ? "bg-[#003F28] text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-250 hover:bg-slate-50"
                    }`}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    <span>⚙️ Admin Manual</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-250 rounded-lg text-xs font-extrabold text-slate-800 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>
                  {activeSection === "admin"
                    ? "⚙️ Administrator Manual (Admin Exclusive)"
                    : activeSection === "feedback"
                    ? "💬 Customer Feedback Operating Manual"
                    : "📦 Operations Operating Manual"}
                </span>
              </div>
            )}
          </div>

          {/* Search Filter */}
          <div className="relative w-44 sm:w-52">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search steps..."
              className="w-full pl-8 pr-3 py-1 text-[11px] bg-white border border-slate-300 rounded-lg outline-none font-medium focus:border-[#003F28]"
            />
          </div>
        </div>

        {/* STEP-BY-STEP CARDS CONTAINER */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 custom-scrollbar bg-slate-50/50">
          {currentManual.sections
            .filter(
              (sec) =>
                !searchQuery ||
                sec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sec.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                sec.steps.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
            )
            .map((sec) => {
              const Icon = sec.icon;
              return (
                <div key={sec.id} className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3.5 animate-fadeIn">
                  
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-xl bg-slate-100 text-[#003F28] border border-slate-200 flex items-center justify-center shrink-0">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 tracking-tight">
                          {sec.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.2">
                          {sec.summary}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[9.5px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border self-start sm:self-auto ${sec.color}`}>
                      {sec.badge}
                    </span>
                  </div>

                  {/* Procedures */}
                  <div className="space-y-2 pt-0.5">
                    {sec.steps.map((stepText, sIdx) => {
                      const parts = stepText.split(":");
                      const stepTitle = parts[0];
                      const stepDetails = parts.slice(1).join(":");

                      return (
                        <div key={sIdx} className="p-3 rounded-xl bg-slate-50/90 border border-slate-200/70 flex items-start gap-3">
                          <div className="h-5 w-5 rounded-full bg-[#003F28] text-white flex items-center justify-center font-black text-[10px] shrink-0 mt-0.5 shadow-2xs">
                            {sIdx + 1}
                          </div>
                          <div className="text-xs leading-relaxed text-slate-800 flex-1">
                            <span className="font-extrabold text-slate-900">{stepTitle}:</span>
                            {stepDetails && (
                              <span className="font-medium text-slate-700 ml-1">{stepDetails}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              );
            })}
        </div>

        {/* FOOTER */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Check className="h-4 w-4 text-emerald-600" />
            <span>Role-scoped operating manual for {roleKey || "active user"}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
          >
            Close Manual
          </button>
        </div>

      </div>
    </div>
  );
}
