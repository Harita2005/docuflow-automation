import React, { useState, useEffect } from "react";
import {
  Sliders,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Copy,
  Play,
  RefreshCw,
  Zap,
  Globe
} from "lucide-react";
import CallbackRuleBuilder from "./CallbackRuleBuilder";

interface Application {
  id: number;
  name: string;
  code: string;
  base_url: string;
  auth_type: string;
}

interface CallbackRule {
  id: number;
  rule_name: string;
  description?: string;
  application_id: number;
  application_name: string;
  application_code: string;
  status: string;
  priority: number;
  trigger_event: string;
  run_when: string;
  conditions_json?: string;
  http_method: string;
  url_mode: string;
  endpoint_path?: string;
  custom_url?: string;
  body_type: string;
  last_execution?: string;
}

export default function CallbackRulesPage() {
  const [rules, setRules] = useState<CallbackRule[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [appFilter, setAppFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Builder Mode State
  const [isBuilding, setIsBuilding] = useState(false);
  const [editingRule, setEditingRule] = useState<CallbackRule | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [resApps, resRules] = await Promise.all([
        fetch("/api/integrations/v2/applications"),
        fetch("/api/integrations/v2/rules")
      ]);
      const jsonApps = await resApps.json();
      const jsonRules = await resRules.json();

      if (jsonApps.success) setApplications(jsonApps.data || []);
      if (jsonRules.success) setRules(jsonRules.data || []);
    } catch (err) {
      console.error("Failed to load callback rules or applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setEditingRule(null);
    setIsBuilding(true);
  };

  const handleEdit = (rule: CallbackRule) => {
    setEditingRule(rule);
    setIsBuilding(true);
  };

  const handleDuplicate = async (rule: CallbackRule) => {
    try {
      const res = await fetch(`/api/integrations/v2/rules/${rule.id}/duplicate`, {
        method: "POST"
      });
      const json = await res.json();
      if (json.success) {
        fetchInitialData();
      }
    } catch (err) {
      console.error("Failed to duplicate rule:", err);
    }
  };

  const handleToggleStatus = async (rule: CallbackRule) => {
    try {
      const res = await fetch(`/api/integrations/v2/rules/${rule.id}/toggle-status`, {
        method: "POST"
      });
      const json = await res.json();
      if (json.success) {
        fetchInitialData();
      }
    } catch (err) {
      console.error("Failed to toggle rule status:", err);
    }
  };

  const handleDelete = async (rule: CallbackRule) => {
    if (!window.confirm(`Are you sure you want to delete rule '${rule.rule_name}'?`)) return;
    try {
      const res = await fetch(`/api/integrations/v2/rules/${rule.id}`, {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.success) {
        fetchInitialData();
      }
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  };

  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      r.rule_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.application_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.endpoint_path || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesApp = appFilter === "ALL" || String(r.application_id) === appFilter;
    const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
    return matchesSearch && matchesApp && matchesStatus;
  });

  if (isBuilding) {
    return (
      <CallbackRuleBuilder
        initialRule={editingRule}
        applications={applications}
        onSave={() => {
          setIsBuilding(false);
          fetchInitialData();
        }}
        onCancel={() => setIsBuilding(false)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Header Card */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-blue-600 shrink-0" />
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide">
            Approval Callback Rules ({filteredRules.length})
          </h2>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-all shrink-0 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Create Callback Rule
        </button>
      </div>

      {/* Compact Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search callback rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] outline-none focus:border-blue-500 font-medium"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">All Target Applications</option>
            {applications.map((app) => (
              <option key={app.id} value={String(app.id)}>
                {app.name} ({app.code})
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="DRAFT">DRAFT</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2 font-medium">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading Callback Rules...
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="p-8 text-center">
            <Sliders className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-xs font-bold text-slate-700">No callback rules configured</h3>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
              Create a callback rule to define which external system receives final approval decisions.
            </p>
            <button
              onClick={handleCreateNew}
              className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-2xs inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Create Callback Rule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Rule Name</th>
                  <th className="py-2.5 px-3">Target Application</th>
                  <th className="py-2.5 px-3">Trigger Event</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Last Execution</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 px-3">
                      <div>
                        <p className="font-bold text-slate-800 leading-tight">{rule.rule_name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {rule.url_mode === "OVERRIDE" ? rule.custom_url : rule.endpoint_path}
                        </p>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 text-blue-500" />
                        <span className="font-bold text-slate-700">{rule.application_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({rule.application_code})</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 font-bold rounded text-[9px]">
                        {rule.trigger_event} ({rule.run_when})
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 bg-slate-900 text-emerald-400 font-mono font-black rounded text-[9px]">
                        {rule.http_method}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleToggleStatus(rule)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black cursor-pointer ${
                          rule.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : rule.status === "DRAFT"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {rule.status === "ACTIVE" ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                        {rule.status}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-slate-500 font-medium text-[10px]">
                      {rule.last_execution || "No activity"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(rule)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-bold rounded transition-colors text-[9px] flex items-center gap-0.5 cursor-pointer"
                        >
                          <Edit2 className="h-2.5 w-2.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDuplicate(rule)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                          title="Duplicate Rule"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Delete Rule"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
