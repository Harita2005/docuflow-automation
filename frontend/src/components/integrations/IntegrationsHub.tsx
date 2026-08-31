import React, { useState } from "react";
import { Server, Sliders, ListFilter, ShieldCheck } from "lucide-react";
import ApplicationsManager from "./ApplicationsManager";
import CallbackRulesPage from "./CallbackRulesPage";
import IntegrationLogsPage from "./IntegrationLogsPage";

interface IntegrationsHubProps {
  initialTab?: "applications" | "rules" | "logs";
}

export default function IntegrationsHub({ initialTab = "applications" }: IntegrationsHubProps) {
  const [activeTab, setActiveTab] = useState<"applications" | "rules" | "logs">(initialTab);
  const [targetAppForRules, setTargetAppForRules] = useState<number | null>(null);

  const handleConfigureRulesForApp = (appId: number) => {
    setTargetAppForRules(appId);
    setActiveTab("rules");
  };

  return (
    <div className="space-y-3">
      {/* Top Header & Navigation Tabs */}
      <div className="bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-extrabold shadow-md shadow-blue-500/20 shrink-0">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-xs font-black text-slate-900 tracking-wide font-display uppercase">
              Approval Callback Integrations Hub
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              Third-party target applications, approval callback rules, and real-time delivery logs.
            </p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto shrink-0">
          <button
            onClick={() => setActiveTab("applications")}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "applications"
                ? "bg-white text-blue-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Server className="h-3.5 w-3.5" /> Applications
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "rules"
                ? "bg-white text-blue-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" /> Callback Rules
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "logs"
                ? "bg-white text-blue-600 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <ListFilter className="h-3.5 w-3.5" /> Integration Logs
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "applications" && (
          <ApplicationsManager onConfigureRules={handleConfigureRulesForApp} />
        )}
        {activeTab === "rules" && (
          <CallbackRulesPage />
        )}
        {activeTab === "logs" && (
          <IntegrationLogsPage />
        )}
      </div>
    </div>
  );
}
