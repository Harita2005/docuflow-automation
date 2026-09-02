import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Globe,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Key,
  ShieldCheck,
  Zap,
  RefreshCw,
  Eye,
  EyeOff,
  Sliders,
  AlertTriangle,
  Server
} from "lucide-react";

interface Application {
  id: number;
  name: string;
  code: string;
  description?: string;
  base_url: string;
  environment: string;
  status: string;
  auth_type: string;
  auth_config_json?: string;
  rules_count?: number;
  last_callback?: string;
}

interface ApplicationsManagerProps {
  onConfigureRules?: (appId: number) => void;
}

export default function ApplicationsManager({ onConfigureRules }: ApplicationsManagerProps) {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [envFilter, setEnvFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    base_url: "",
    environment: "Production",
    status: "Active",
    auth_type: "None",
    apiKeyHeader: "X-API-Key",
    apiKeyValue: "",
    apiKeyPrefix: "",
    bearerToken: "",
    basicUsername: "",
    basicPassword: "",
    oauthClientId: "",
    oauthClientSecret: "",
    oauthTokenUrl: "",
    oauthScope: "",
    oauthGrantType: "client_credentials"
  });

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/v2/applications");
      const json = await res.json();
      if (json.success) {
        setApps(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingApp(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      base_url: "",
      environment: "Production",
      status: "Active",
      auth_type: "None",
      apiKeyHeader: "X-API-Key",
      apiKeyValue: "",
      apiKeyPrefix: "",
      bearerToken: "",
      basicUsername: "",
      basicPassword: "",
      oauthClientId: "",
      oauthClientSecret: "",
      oauthTokenUrl: "",
      oauthScope: "",
      oauthGrantType: "client_credentials"
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (app: Application) => {
    setEditingApp(app);
    let parsedAuth: any = {};
    if (app.auth_config_json) {
      try {
        parsedAuth = JSON.parse(app.auth_config_json);
      } catch (e) {}
    }

    setFormData({
      name: app.name || "",
      code: app.code || "",
      description: app.description || "",
      base_url: app.base_url || "",
      environment: app.environment || "Production",
      status: app.status || "Active",
      auth_type: app.auth_type || "None",
      apiKeyHeader: parsedAuth.header_name || "X-API-Key",
      apiKeyValue: parsedAuth.api_key || "",
      apiKeyPrefix: parsedAuth.prefix || "",
      bearerToken: parsedAuth.token || "",
      basicUsername: parsedAuth.username || "",
      basicPassword: parsedAuth.password || "",
      oauthClientId: parsedAuth.client_id || "",
      oauthClientSecret: parsedAuth.client_secret || "",
      oauthTokenUrl: parsedAuth.token_url || "",
      oauthScope: parsedAuth.scope || "",
      oauthGrantType: parsedAuth.grant_type || "client_credentials"
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleSaveApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim() || !formData.base_url.trim()) {
      setErrorMsg("Application Name, Code, and Base URL are required.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    let auth_config: any = {};
    if (formData.auth_type === "API_KEY") {
      auth_config = {
        header_name: formData.apiKeyHeader,
        api_key: formData.apiKeyValue,
        prefix: formData.apiKeyPrefix
      };
    } else if (formData.auth_type === "BEARER_TOKEN") {
      auth_config = { token: formData.bearerToken };
    } else if (formData.auth_type === "BASIC_AUTH") {
      auth_config = { username: formData.basicUsername, password: formData.basicPassword };
    } else if (formData.auth_type === "OAUTH2") {
      auth_config = {
        client_id: formData.oauthClientId,
        client_secret: formData.oauthClientSecret,
        token_url: formData.oauthTokenUrl,
        scope: formData.oauthScope,
        grant_type: formData.oauthGrantType
      };
    }

    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase(),
      description: formData.description,
      base_url: formData.base_url.trim(),
      environment: formData.environment,
      status: formData.status,
      auth_type: formData.auth_type,
      auth_config_json: auth_config
    };

    try {
      const url = editingApp
        ? `/api/integrations/v2/applications/${editingApp.id}`
        : "/api/integrations/v2/applications";
      const method = editingApp ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMsg(json.detail || json.message || "Failed to save application");
      } else {
        setIsModalOpen(false);
        fetchApplications();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error while saving application");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (app: Application) => {
    try {
      const res = await fetch(`/api/integrations/v2/applications/${app.id}/toggle-status`, {
        method: "POST"
      });
      const json = await res.json();
      if (json.success) {
        fetchApplications();
      }
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  const handleDelete = async (app: Application) => {
    if (!window.confirm(`Are you sure you want to delete application '${app.name}' (${app.code})? This will also remove associated rules.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/integrations/v2/applications/${app.id}`, {
        method: "DELETE"
      });
      const json = await res.json();
      if (json.success) {
        fetchApplications();
      }
    } catch (err) {
      console.error("Failed to delete application:", err);
    }
  };

  const generateRandomKey = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "key_live_";
    for (let i = 0; i < 24; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, apiKeyValue: key });
  };

  const filteredApps = apps.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.base_url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEnv = envFilter === "ALL" || a.environment === envFilter;
    const matchesStatus = statusFilter === "ALL" || a.status === statusFilter;
    return matchesSearch && matchesEnv && matchesStatus;
  });

  return (
    <div className="space-y-3">
      {/* Compact Header & Action Row */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-blue-600 shrink-0" />
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide">
            Third-Party Applications ({filteredApps.length})
          </h2>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-all shrink-0 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" /> Add Application
        </button>
      </div>

      {/* Compact Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search application name, code, or URL..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] outline-none focus:border-blue-500 font-medium"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">All Environments</option>
            <option value="Production">Production</option>
            <option value="UAT">UAT</option>
            <option value="Testing">Testing</option>
            <option value="Development">Development</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2 font-medium">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading Applications...
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="p-8 text-center">
            <Globe className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-xs font-bold text-slate-700">No third-party applications configured</h3>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
              Add an application to start sending real-time FDO approval decision callbacks.
            </p>
            <button
              onClick={handleOpenAddModal}
              className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-2xs inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Application
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Application</th>
                  <th className="py-2.5 px-3">Code</th>
                  <th className="py-2.5 px-3">Environment</th>
                  <th className="py-2.5 px-3">Auth Type</th>
                  <th className="py-2.5 px-3 text-center">Callback Rules</th>
                  <th className="py-2.5 px-3">Last Callback</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApps.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold shrink-0">
                          <Globe className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 leading-tight">{app.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate max-w-xs">{app.base_url}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono font-bold rounded text-[10px]">
                        {app.code}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        app.environment === "Production"
                          ? "bg-purple-50 text-purple-700 border border-purple-200"
                          : app.environment === "UAT"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}>
                        {app.environment}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-600">
                      {app.auth_type}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-black rounded-full text-[10px]">
                        {app.rules_count || 0}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500 font-medium text-[10px]">
                      {app.last_callback || "No activity"}
                    </td>
                    <td className="py-2 px-3">
                      <button
                        onClick={() => handleToggleStatus(app)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wide cursor-pointer ${
                          app.status === "Active"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {app.status === "Active" ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                        {app.status}
                      </button>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onConfigureRules && (
                          <button
                            onClick={() => onConfigureRules(app.id)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-bold rounded transition-colors text-[9px] flex items-center gap-0.5 cursor-pointer"
                          >
                            <Sliders className="h-2.5 w-2.5" /> Rules
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(app)}
                          className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded transition-colors cursor-pointer"
                          title="Edit Application"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(app)}
                          className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Delete Application"
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

      {/* Add / Edit Application Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
                <Globe className="h-4 w-4 text-blue-600" />
                {editingApp ? "Configure Application" : "Add Target Application"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xs"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[11px] font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveApplication} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Application Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Payment Application"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none focus:border-blue-500 font-medium"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Application Code (Unique) *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PAYMENT_APP"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Base URL *
                </label>
                <input
                  type="url"
                  placeholder="https://payment.example.com/api"
                  value={formData.base_url}
                  onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                  className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Environment
                  </label>
                  <select
                    value={formData.environment}
                    onChange={(e) => setFormData({ ...formData, environment: e.target.value })}
                    className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none font-semibold text-slate-800"
                  >
                    <option value="Development">Development</option>
                    <option value="Testing">Testing</option>
                    <option value="UAT">UAT</option>
                    <option value="Production">Production</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none font-semibold text-slate-800"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Authentication */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Authentication Type
                </label>
                <select
                  value={formData.auth_type}
                  onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
                  className="w-full text-[11px] px-2.5 py-1.5 border border-slate-200 rounded-md outline-none font-bold text-slate-800"
                >
                  <option value="None">None (Public / IP Whitelisted)</option>
                  <option value="API_KEY">API Key</option>
                  <option value="BEARER_TOKEN">Bearer Token</option>
                  <option value="BASIC_AUTH">Basic Authentication</option>
                  <option value="OAUTH2">OAuth 2.0 (Client Credentials)</option>
                </select>

                {formData.auth_type === "API_KEY" && (
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Header Name (e.g. X-API-Key)"
                        value={formData.apiKeyHeader}
                        onChange={(e) => setFormData({ ...formData, apiKeyHeader: e.target.value })}
                        className="text-[11px] px-2.5 py-1 bg-white border border-slate-200 rounded outline-none font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Prefix (Optional e.g. Key)"
                        value={formData.apiKeyPrefix}
                        onChange={(e) => setFormData({ ...formData, apiKeyPrefix: e.target.value })}
                        className="text-[11px] px-2.5 py-1 bg-white border border-slate-200 rounded outline-none font-mono"
                      />
                    </div>
                    <div className="relative">
                      <input
                        type={showSecret ? "text" : "password"}
                        placeholder="API Key Secret..."
                        value={formData.apiKeyValue}
                        onChange={(e) => setFormData({ ...formData, apiKeyValue: e.target.value })}
                        className="w-full text-[11px] px-2.5 py-1 pr-8 bg-white border border-slate-200 rounded outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                      >
                        {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                )}

                {formData.auth_type === "BEARER_TOKEN" && (
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <input
                      type={showSecret ? "text" : "password"}
                      placeholder="Bearer Token..."
                      value={formData.bearerToken}
                      onChange={(e) => setFormData({ ...formData, bearerToken: e.target.value })}
                      className="w-full text-[11px] px-2.5 py-1 bg-white border border-slate-200 rounded outline-none font-mono"
                    />
                  </div>
                )}

                {formData.auth_type === "OAUTH2" && (
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <div>
                      <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                        Token Endpoint URL (Endpoint 1 that generates token) *
                      </label>
                      <input
                        type="url"
                        placeholder="https://payment.example.com/api/v1/auth/token"
                        value={formData.oauthTokenUrl}
                        onChange={(e) => setFormData({ ...formData, oauthTokenUrl: e.target.value })}
                        className="w-full text-[11px] px-2.5 py-1 bg-white border border-slate-200 rounded outline-none font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          Client ID
                        </label>
                        <input
                          type="text"
                          placeholder="Client ID..."
                          value={formData.oauthClientId}
                          onChange={(e) => setFormData({ ...formData, oauthClientId: e.target.value })}
                          className="w-full text-[11px] px-2.5 py-1 bg-white border border-slate-200 rounded outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                          Client Secret
                        </label>
                        <input
                          type={showSecret ? "text" : "password"}
                          placeholder="Client Secret..."
                          value={formData.oauthClientSecret}
                          onChange={(e) => setFormData({ ...formData, oauthClientSecret: e.target.value })}
                          className="w-full text-[11px] px-2.5 py-1 bg-white border border-slate-200 rounded outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                  {editingApp ? "Save Changes" : "Create Application"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
