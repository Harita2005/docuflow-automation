import React, { useState } from "react";
import { 
  Sparkles, 
  ArrowRight, 
  User, 
  ShieldCheck, 
  ClipboardList, 
  FileCheck, 
  Receipt, 
  Mail, 
  ScanLine, 
  Send, 
  CheckCircle2, 
  Database, 
  GitBranch,
  Building2,
  Lock,
  ArrowRightLeft
} from "lucide-react";

interface GettingStartedPageProps {
  setCurrentView: (view: string) => void;
  setCurrentUserRole: (role: string) => void;
  setCurrentUserEmail: (email: string) => void;
  onLoginOverride: () => void;
}

const steps = [
  {
    title: "1. Vendor Email Received",
    desc: "Supplier emails their digital commercial invoice to billing@company.com.",
    badge: "Document Intake",
    color: "blue",
    icon: Mail,
  },
  {
    title: "2. Layout Scanned & Extracted",
    desc: "Extraction engine automatically reads visual bounding boxes, parsing items, Tax values, and totals.",
    badge: "Intelligent Extraction",
    color: "amber",
    icon: ScanLine,
  },
  {
    title: "3. Waiting for Gate Entry",
    desc: "System holds the invoice in 'Waiting for GRN' state until the Warehouse Dock Supervisor confirms the physical receipt of products.",
    badge: "Inventory Guard",
    color: "orange",
    icon: ClipboardList,
  },
  {
    title: "4. Compliance Routing (Manager/Director)",
    desc: "After GRN is released, the invoice routes to the appropriate managers. High-value spend levels conditionally escalate up to Managing Director.",
    badge: "Multi-Tier Approval",
    color: "fuchsia",
    icon: FileCheck,
  },
  {
    title: "5. Payment Disbursal",
    desc: "Finance team releases payments directly to the supplier's bank account.",
    badge: "Payment Released",
    color: "emerald",
    icon: Receipt,
  }
];

const guideRoles = [
  { id: "md", name: "Managing Director (MD)", email: "md@company.com", desc: "Monitors overall enterprise liability volume, inspects high-value bottleneck approvals, and analyzes monthly turnaround times.", icon: User },
  { id: "gm", name: "General Manager (GM)", email: "gm@company.com", desc: "Oversees division-level operational speed, pending clearances, and operational KPIs across internal logistics.", icon: User },
  { id: "cio", name: "Chief Info Officer (CIO)", email: "cio@company.com", desc: "Monitors secure ledger trace logs, transaction throughput speeds, and system status health metrics.", icon: User },
  { id: "finance_manager", name: "Finance Manager", email: "finance.manager@company.com", desc: "Aggregates liability reports, verifies extraction accuracy, releases treasury settlements, and coordinates compliance checks.", icon: User },
  { id: "department_manager", name: "Department Manager", email: "department.manager@company.com", desc: "Releases budget limits, clears department-specific expenditures, and provides compliance comments.", icon: User },
  { id: "ap_executive", name: "AP Team Executive", email: "ap.executive@company.com", desc: "Directly uploads supplier PDFs, validates visual bounding box extraction fields, and initiates first-tier reviews.", icon: User },
];

export default function GettingStartedPage({
  setCurrentView,
  setCurrentUserRole,
  setCurrentUserEmail,
  onLoginOverride
}: GettingStartedPageProps) {
  const [activeTab, setActiveTab] = useState<"onboarding" | "simulator">("onboarding");

  // Simulator State
  const [simStep, setSimStep] = useState<number>(0);
  const [logs, setLogs] = useState<string[]>([
    "System standby. Waiting to simulate intake workflow..."
  ]);

  const runSimulationStep = (stepIndex: number) => {
    setSimStep(stepIndex);
    const timeStr = new Date().toLocaleTimeString();
    
    let newLogs: string[] = [];
    if (stepIndex === 1) {
      newLogs = [
        `[${timeStr}] [EMAIL-INTAKE] Monitored mailbox discovered new attachment from 'v.shirley@acme-manufacturing.com'`,
        `[${timeStr}] [INBOUND-QUEUE] Registered invoice file 'ACME_PROD_CHASSIS_3042.pdf' under Registry ID: inv-${Math.floor(Math.random() * 900 + 100)}`,
        ...logs
      ];
    } else if (stepIndex === 2) {
      newLogs = [
        `[${timeStr}] [GEOMETRY-SCAN] Parsing layout coordinates. Table row borders, supplier headers, and tax codes identified successfully.`,
        `[${timeStr}] [EXTRACTION] Compiled structured billing: ACME Mfg Inc, Invoice Ref #9385-AC, Balance Total: ₹45,800.00.`,
        ...logs
      ];
    } else if (stepIndex === 3) {
      newLogs = [
        `[${timeStr}] [GRN-SYSTEM] State flagged as 'Waiting for GRN'. Warehouse Dock receiving check is now required.`,
        `[${timeStr}] [COMPLIANCE-GATE] Shipment validation pending supervisor verification comments. Release required in 'Gate Entry' Desk.`,
        ...logs
      ];
    } else if (stepIndex === 4) {
      newLogs = [
        `[${timeStr}] [DOCK-CLEARED] GRN release sign-off received from dock supervisor. Invoiced items verified physically.`,
        `[${timeStr}] [WORKFLOW-ROUTING] Compliance rule triggered: ₹45,800 spend requires GM & CFO signature. Escalated to GM desk for verification.`,
        ...logs
      ];
    } else if (stepIndex === 5) {
      newLogs = [
        `[${timeStr}] [DIRECT-RELEASE] GM clearance approved with ledger comment: 'Verified chassis received. Quantities accurate. Approve release.'`,
        `[${timeStr}] [TREASURY] Payout approved and released. State: Paid!`,
        ...logs
      ];
    } else {
      setSimStep(0);
      newLogs = ["System standby. Waiting to simulate intake workflow..."];
    }
    setLogs(newLogs);
  };

  const handleQuickLogin = (role: string, email: string) => {
    setCurrentUserRole(role);
    setCurrentUserEmail(email);
    onLoginOverride();
    setCurrentView("dashboard");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-2 animate-fadeIn font-sans">
      
      {/* Banner Intro */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 rounded-2xl p-8 text-white relative overflow-hidden shadow-lg border border-slate-800">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 h-48 w-48 bg-blue-500/10 rounded-full blur-2xl"></div>
        <div className="space-y-3 relative z-10">
          <span className="px-2.5 py-1 bg-blue-500/15 text-blue-300 font-extrabold text-[10px] uppercase tracking-widest rounded-md border border-blue-500/20">
            Guided Onboarding Desk
          </span>
          <h2 className="text-3xl font-black tracking-tight font-display">
            DocuFlow Accounts Payable Automation
          </h2>
          <p className="text-slate-300 text-xs max-w-2xl leading-relaxed">
            Welcome to the enterprise Invoice Processing, GRN verification, and Approval workflow control suite. Explore our interactive flow simulator or log in directly to specific managerial roles to witness how DocuFlow maintains tight budget controls and audit safety.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("onboarding")}
          className={`pb-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
            activeTab === "onboarding"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          1. System Roles & Walkthrough
        </button>
        <button
          onClick={() => {
            setActiveTab("simulator");
            if (simStep === 0) runSimulationStep(1);
          }}
          className={`pb-3 px-6 text-xs font-bold uppercase tracking-wider border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === "simulator"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>2. Interactive End-to-End Simulator</span>
        </button>
      </div>

      {activeTab === "onboarding" ? (
        <div className="space-y-8">
          
          {/* Section: Workflow Explanation */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-5 shadow-sm">
            <div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <GitBranch className="h-4.5 w-4.5 text-blue-600" />
                <span>Invoice Processing Lifecycle</span>
              </h3>
              <p className="text-slate-450 text-xs mt-0.5">How DocuFlow routes and secures your accounts payable ledger.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {steps.map((s, idx) => {
                const StepIcon = s.icon;
                return (
                  <div key={idx} className="bg-slate-50 border border-slate-200/60 p-4.5 rounded-xl space-y-3 relative flex flex-col justify-between group hover:shadow-md transition duration-300">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-8 w-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold">
                          <StepIcon className="h-4 w-4" />
                        </div>
                        <span className="text-[9px] font-extrabold uppercase bg-blue-50/50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-105">
                          {s.badge}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-xs text-slate-800 leading-tight">{s.title}</h4>
                      <p className="text-[11px] text-slate-450 leading-relaxed font-sans">{s.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Clickable Roles */}
          <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-5 shadow-sm">
            <div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <User className="h-4.5 w-4.5 text-blue-600" />
                <span>Tailored Executive & Manager Roles</span>
              </h3>
              <p className="text-slate-450 text-xs mt-0.5">Click any workspace role profile below to immediately adopt their desk and test their unique view capabilities.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {guideRoles.map((role) => (
                <div key={role.id} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm hover:shadow-md hover:border-blue-300 transition duration-300 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <span className="text-[9px] bg-slate-100 text-slate-600 font-mono font-bold px-2 py-0.5 border rounded-md">
                      {role.email}
                    </span>
                    <h4 className="font-extrabold text-sm text-slate-800 tracking-tight">{role.name}</h4>
                    <p className="text-xs text-slate-450 leading-relaxed font-sans">{role.desc}</p>
                  </div>

                  <button
                    onClick={() => handleQuickLogin(role.id, role.email)}
                    className="w-full py-2 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all border border-blue-100 flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm group"
                  >
                    <span>Adopt {role.id === "md" ? "MD Role" : "Desk"}</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition" />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Simulator Visual Flow (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 p-6 rounded-2xl space-y-6 shadow-sm">
            <div>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">End-to-End Invoice Processing Flow</h3>
              <p className="text-slate-450 text-xs">Observe live status updates as digital invoices travel through physical goods matching, layout scans, and payments.</p>
            </div>

            {/* Steps Track */}
            <div className="flex flex-col space-y-4 relative">
              <div className="absolute left-6.5 top-2 bottom-2 w-0.5 bg-slate-100"></div>

              {steps.map((s, idx) => {
                const stepNum = idx + 1;
                const active = simStep >= stepNum;
                const activePulse = simStep === stepNum;
                const StepIcon = s.icon;

                return (
                  <button
                    key={idx}
                    onClick={() => runSimulationStep(stepNum)}
                    className={`flex items-start text-left space-x-4 p-3.5 rounded-xl border transition-all ${
                      activePulse 
                        ? "border-blue-500 bg-blue-50/15 scale-[1.01] shadow-md shadow-blue-500/5" 
                        : active 
                          ? "border-slate-250 bg-slate-50/50" 
                          : "border-transparent opacity-65 hover:opacity-100"
                    }`}
                  >
                    <div className={`z-10 h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border transition-all duration-300 ${
                      activePulse 
                        ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20" 
                        : active 
                          ? "bg-slate-900 text-slate-100 border-slate-800" 
                          : "bg-white text-slate-400 border-slate-220 shadow-sm"
                    }`}>
                      {activePulse ? <StepIcon className="h-5 w-5 animate-pulse" /> : <StepIcon className="h-5 w-5" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center space-x-2.5">
                        <h4 className={`font-extrabold text-sm ${activePulse ? "text-blue-700" : active ? "text-slate-800 font-bold" : "text-slate-500"}`}>
                          {s.title}
                        </h4>
                        <span className={`text-[8.5px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                          activePulse 
                            ? "bg-blue-50 text-blue-700 border-blue-150" 
                            : active 
                              ? "bg-slate-100 text-slate-650 border-slate-205" 
                              : "bg-slate-50 text-slate-400 border-slate-150"
                        }`}>
                          {s.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-450 leading-relaxed font-sans">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase">Step {simStep} / 5 Running</span>
              <button
                onClick={() => runSimulationStep(simStep < 5 ? simStep + 1 : 1)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center space-x-1.5 shadow-md shadow-blue-500/10 cursor-pointer"
              >
                <span>Advance Simulator</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Simulator Console Trace logs (5 cols) */}
          <div className="lg:col-span-12 xl:col-span-5 space-y-6">
            <div className="bg-slate-900 border border-slate-950 p-6 rounded-2xl flex flex-col h-[550px] shadow-sm overflow-hidden text-slate-300">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between shrink-0">
                <span className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-white">
                  <Database className="h-4 w-4 text-blue-500" />
                  <span>Interactive Flow Engine Console</span>
                </span>
                <button
                  onClick={() => runSimulationStep(0)}
                  className="px-2.5 py-1 text-[10px] border border-slate-800 hover:border-slate-700 font-semibold uppercase tracking-wider rounded-lg transition hover:bg-slate-850"
                >
                  Clear Terminal
                </button>
              </div>

              {/* Visualization Container */}
              <div className="flex-1 overflow-auto bg-slate-950 p-4.5 rounded-xl border border-slate-850/80 my-4 shadow-inner">
                <div className="space-y-4 font-mono text-[11px] leading-relaxed">
                  {logs.map((log, idx) => (
                    <div key={idx} className="border-b border-slate-900 pb-2 animate-fadeIn text-slate-350">
                      {log}
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[10px] text-slate-450 uppercase font-sans font-bold border-t border-slate-800 pt-3">
                Live transactional routing updates synchronized
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
