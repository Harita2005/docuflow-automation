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
  Printer,
  GitFork,
  CheckSquare,
  History,
  Check,
  Users,
  Database
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
  // Ops Users: get Ops manual
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

  // Only initialize active section when the modal is freshly opened
  useEffect(() => {
    if (isOpen) {
      setActiveSection(computeInitialSection());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 1. OPERATIONS MANUAL
  const operationsManual = {
    title: "OPERATIONS USER MANUAL",
    subtitle: "Step-by-step operating guide for Operations Staff & Invoice Approvers",
    color: "from-[#003F28] to-[#005638]",
    sections: [
      {
        id: "ops_dashboard",
        title: "1. Dashboard Page & Workload Analytics",
        icon: LayoutDashboard,
        badge: "Overview & Workload",
        color: "bg-[#FFF7E2] text-[#D97706] border-[#FDE68A]",
        summary: "Monitor real-time active workload, pending approval alerts, and filter documents by date or category.",
        steps: [
          "Understanding KPI Cards: Click any KPI card (TOTAL INGESTED, PENDING APPROVAL, ON HOLD, REJECTED, APPROVED & SETTLED) to filter your document list.",
          "Date Range Filtering: Filter documents using preset buttons ('Today', 'This Week', 'This Month', 'All Time', or 'Custom Date Range').",
          "Document Type Pills: Filter by specific invoice categories such as AP Invoice, Freight Invoice, Utility Bill, or Capex Expense.",
          "Quick Inspection: Click any invoice row in the table list to open the full Document Inspection Panel."
        ]
      },
      {
        id: "ops_upload",
        title: "2. Document Upload & Automated Extraction",
        icon: Upload,
        badge: "Intake & Parsing",
        color: "bg-[#F3E8FF] text-[#7E22CE] border-[#E9D5FF]",
        summary: "Ingest supplier invoice files and review automated OCR field extraction.",
        steps: [
          "Select Division: Choose the target enterprise division (e.g., VCC, ENES, ACM) from the dropdown.",
          "Select Category: Choose the expense category (e.g., Standard AP Invoice, Freight Bill).",
          "File Selection: Drag and drop your PDF or image invoice file into the box or click 'Browse Files'.",
          "Automated Extraction: Click 'Run Automated Extraction' to parse Vendor Name, Invoice Number, Date, Gross Amount, Base Amount, and GST splits.",
          "Submit Document: Review extracted fields for accuracy, make corrections if needed, and click 'Submit & Queue Document'."
        ]
      },
      {
        id: "ops_work_tracker",
        title: "3. Work Tracker Queue & Pending Items",
        icon: Layers,
        badge: "Work Queue",
        color: "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]",
        summary: "Access invoices assigned to your active approval stage and monitor priority deadlines.",
        steps: [
          "Assigned Queue View: Work Tracker displays invoices currently pending action at your active workflow stage.",
          "Search & Filters: Use the search bar to find documents by Vendor Name, Invoice Number, or PO Reference.",
          "Priority Alerts: Red priority badges highlight urgent or near-overdue invoices requiring prompt review."
        ]
      },
      {
        id: "ops_actions",
        title: "4. Document Inspection & Workflow Actions",
        icon: UserCheck,
        badge: "Verification & Sign-Off",
        color: "bg-emerald-50 text-emerald-900 border-emerald-200",
        summary: "Inspect original document PDFs, verify mandatory checklists, and sign off on approvals.",
        steps: [
          "Document Viewer: Review the original invoice PDF/image on screen with zoom, rotate, and full-page controls.",
          "Mandatory Checklist: Check all required verification items (e.g., 'Tax ID Validated', 'PO Quantities Match') before approving.",
          "APPROVE ACTION: Click 'Approve & Pass Stage', enter optional sign-off remarks, and confirm.",
          "HOLD ACTION: Click 'Hold / Pause' if information is missing. Type MANDATORY clarification comments before submitting.",
          "SEND BACK ACTION: Click 'Send Back' to return the invoice to a previous stage with mandatory return instructions.",
          "REJECT ACTION: Click 'Reject Document' if invalid. Type MANDATORY rejection reason notes in the popup box."
        ]
      },
      {
        id: "ops_approved",
        title: "5. Approved Documents Archive & Signed Downloads",
        icon: CheckCircle2,
        badge: "Settlement & Archive",
        color: "bg-[#E7F9F1] text-[#059669] border-[#A7F3D0]",
        summary: "Search, inspect, and download fully cleared invoices stamped with digital approval signatures.",
        steps: [
          "Search Archive: Filter settled invoices by Vendor Name, Invoice Number, PO Reference, or Date Range.",
          "Audit Trail History: View the complete chronological audit docket showing every approval step and sign-off comment.",
          "Download Signed PDF: Click 'Download Signed PDF' to save an official invoice PDF stamped with digital signatures."
        ]
      }
    ]
  };

  // 2. CUSTOMER FEEDBACK MANUAL
  const feedbackManual = {
    title: "CUSTOMER FEEDBACK USER MANUAL",
    subtitle: "Operating guide for Customer Feedback Agents & Complaint Resolution Teams",
    color: "from-[#003F28] to-[#005638]",
    sections: [
      {
        id: "fb_tracker",
        title: "1. Customer Feedback Hub & Status Filters",
        icon: MessageSquare,
        badge: "Complaints Hub",
        color: "bg-purple-50 text-purple-900 border-purple-200",
        summary: "Track customer complaints, quality defect notices, and service feedback tickets.",
        steps: [
          "Status Tabs: Filter tickets by 'All', 'Pending Review', 'In Progress', 'On Hold', 'Rejected', and 'Cleared'.",
          "KPI Summary Cards: Monitor real-time counts for Pending Review, In Progress, On Hold, Rejected, and Cleared.",
          "Search Tools: Search instantly by Complaint ID, Customer Name, BP Code, Dealer Name, or Complaint Type."
        ]
      },
      {
        id: "fb_inspection",
        title: "2. Inspecting Complaint Fields & Defect Photographs",
        icon: Search,
        badge: "Evidence Inspection",
        color: "bg-indigo-50 text-indigo-900 border-indigo-200",
        summary: "Review customer metadata, complaint details, and attached defect inspection photographs.",
        steps: [
          "Open Ticket: Click any ticket row to open the complete Customer Feedback inspection panel.",
          "Review Details: Check Account Name, Customer Name, BP Code, Dealer Name, Employee Name, Survey Date, and Complaint Description.",
          "Inspect Evidence Gallery: Click photo thumbnails to launch the interactive viewer with zoom, rotate, and fullscreen inspection controls."
        ]
      },
      {
        id: "fb_actions",
        title: "3. Processing Actions & Officer Handover Modal",
        icon: UserCheck,
        badge: "Resolution & Handover",
        color: "bg-emerald-50 text-emerald-900 border-emerald-200",
        summary: "Execute resolution sign-offs, assign next resolution officers, or pause/reject tickets.",
        steps: [
          "APPROVE / CLEAR: Click 'Approve / Clear' to open the Next Person Handover Modal.",
          "Officer Handover: Type stage resolution remarks, select the Next Assigned Officer and Designation, then click 'Confirm & Handover'.",
          "HOLD ACTION: Click 'Hold' to pause processing for customer/dealer clarification. MANDATORY clarification remarks are required.",
          "REJECT ACTION: Click 'Reject' for invalid or duplicate complaints. MANDATORY rejection command notes are required."
        ]
      },
      {
        id: "fb_sla",
        title: "4. SLA Target Deadlines & Management Escalations",
        icon: Clock,
        badge: "SLA Control",
        color: "bg-amber-50 text-amber-900 border-amber-200",
        summary: "Monitor target resolution countdown timers and trigger manual escalations when urgent.",
        steps: [
          "SLA Countdown Clock: Monitor the target resolution timer displayed on each ticket ('14h 30m remaining').",
          "Overdue Alerts: Tickets exceeding target resolution time display a prominent red overdue badge.",
          "Manual Escalation: Click 'Trigger Manual Escalation' to immediately dispatch escalation alerts to senior quality managers."
        ]
      }
    ]
  };

  // 3. ADMIN GOVERNANCE MANUAL
  const adminManual = {
    title: "CONTROL & ADMINISTRATION USER MANUAL",
    subtitle: "Frontend administration guide for user setup, access matrix, flow builders, and rules",
    color: "from-[#003F28] to-[#005638]",
    sections: [
      {
        id: "adm_users",
        title: "1. User Account Management",
        icon: Users,
        badge: "Employee Governance",
        color: "bg-blue-50 text-blue-900 border-blue-200",
        summary: "Create new employee accounts, assign operating roles, map departments, and toggle active status.",
        steps: [
          "Create User: Open Control Settings -> User Management and click 'Create User' (+ Add New Employee).",
          "Employee Fields: Enter Full Name, Employee ID, Corporate Email Address, Division, and Department.",
          "Assign Role: Select the employee's operating role profile (e.g., Accounts Approver, Manager, Admin).",
          "Account Toggle: Use the Status Toggle switch to instantly activate or deactivate user account access."
        ]
      },
      {
        id: "adm_rbac",
        title: "2. Roles & Access Control Matrix",
        icon: Shield,
        badge: "Access Matrix",
        color: "bg-rose-50 text-rose-900 border-rose-200",
        summary: "Configure role clearances and set granular permissions across system pages.",
        steps: [
          "Access Control Matrix: Go to Control Settings -> Access Control & Roles to select target role profiles.",
          "Permission Catalog: View permission controls for Dashboard, Work Tracker, Upload, Customer Feedback, Approved Docs, Workflow Rules, and Control Settings.",
          "Action Scope Switches: Toggle specific capabilities ('View', 'Create', 'Edit', 'Delete', 'Approve', 'Export') for each role."
        ]
      },
      {
        id: "adm_flow",
        title: "3. Workflow Flow Builder",
        icon: GitFork,
        badge: "Approval Paths",
        color: "bg-sky-50 text-sky-900 border-sky-200",
        summary: "Design multi-stage approval workflow profiles and configure assigned role pools.",
        steps: [
          "Create Profile: Go to Workflow & Rules -> Flow Builder and click 'Create New Workflow Profile'.",
          "Add Sequential Stages: Add Stage 1, Stage 2, Stage 3, assigning each step to a specific role or user pool.",
          "Target SLA Hours: Define expected SLA duration hours for each approval stage.",
          "Save & Publish: Save the workflow profile to activate it for incoming document routing."
        ]
      },
      {
        id: "adm_condition",
        title: "4. Business Routing Rules (Condition Builder)",
        icon: Sliders,
        badge: "Routing Engine",
        color: "bg-amber-50 text-amber-900 border-amber-200",
        summary: "Set up conditional rules to route incoming invoices based on amount, division, or category.",
        steps: [
          "Add Routing Rule: Go to Workflow & Rules -> Condition Builder and click 'Add Routing Rule'.",
          "Define Conditions: Select Field (Gross Amount, Division, Category), Operator (Greater Than, Equals), and Threshold Value.",
          "Link Target Profile: Connect the rule to its target Workflow Profile and click 'Save & Publish Rule'."
        ]
      },
      {
        id: "adm_checklist",
        title: "5. Universal Checklist Builder",
        icon: CheckSquare,
        badge: "Checklist Matrix",
        color: "bg-emerald-50 text-emerald-900 border-emerald-200",
        summary: "Configure stage-wise verification checklists across divisions and expense categories.",
        steps: [
          "Add Checklist Rule: Go to Workflow & Rules -> Universal Checklist Matrix and click '+ Add Checklist Rule'.",
          "Target Mapping: Select target Division, Category, and Workflow Stage Name.",
          "Checklist Item Title: Type the verification item text (e.g., 'Verify Tax Registration Number').",
          "Mandatory Switch: Toggle the Mandatory switch ON to enforce completion before stage sign-off."
        ]
      },
      {
        id: "adm_master_backup",
        title: "6. Master Data, RACI, & System Backups",
        icon: Database,
        badge: "System Governance",
        color: "bg-slate-100 text-slate-900 border-slate-300",
        summary: "Manage vendor master tables, RACI notification triggers, recycle bin, and backup logs.",
        steps: [
          "Master Data: Manage Vendors, PO Master, GL Accounts, and Cost Center references.",
          "RACI Notifications: Configure event alerts for Responsible, Accountable, Consulted, and Informed recipients.",
          "Recycle Bin: Search deleted records and restore accidentally removed items.",
          "Backup History: View timestamped backup logs and check system status indicators."
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

        {/* MANUAL SELECTOR BAR */}
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
                    <span>Operations Manual</span>
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
                    <span>Feedback Manual</span>
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
                    <span>Admin Manual</span>
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white border border-slate-250 rounded-lg text-xs font-extrabold text-slate-800 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>
                  {activeSection === "admin"
                    ? "Administrator Manual (Admin Access)"
                    : activeSection === "feedback"
                    ? "Customer Feedback Operating Manual"
                    : "Operations Operating Manual"}
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
