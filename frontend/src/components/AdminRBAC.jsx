import React, { useState, useEffect } from "react";
import { Save, Loader2, Shield, CheckSquare, Square, Info } from "lucide-react";

export default function AdminRBAC({ onRefreshSignal }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [permissions, setPermissions] = useState({
    employee: ["dashboard", "work-tracker"],
    settings_editor: ["dashboard", "work-tracker", "admin"],
    admin: ["dashboard", "work-tracker", "upload", "data-verification", "admin"]
  });

  const roles = [
    { id: "employee", name: "Employee" },
    { id: "settings_editor", name: "Settings Editor" },
    { id: "admin", name: "Admin" }
  ];

  const views = [
    { id: "dashboard", label: "Executive Command Dashboard", description: "Default landing view containing metrics, pending approvals queue, SLA widgets, and status breakdown summary." },
    { id: "work-tracker", label: "Work Tracker", description: "Audit trail log and interactive SLA list tracking every ingested invoice, credit note, and debit note." },
    { id: "upload", label: "Supplier Invoice Ingest", description: "Manual upload page where files are uploaded and mapped to specific document type templates." },
    { id: "data-verification", label: "Data Verification Desk", description: "Audit verification screen for reviewing field extractions prior to triggering workflows (bypassed in direct auto-route flows)." },
    { id: "admin", label: "Control Settings Panel", description: "Administration view to configure workflow steps, condition matrix policies, email templates, users, and ERP credentials." }
  ];

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/admin/config", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        const roleConfig = data.find((c) => c.key === "ROLE_PERMISSIONS");
        if (roleConfig && roleConfig.value) {
          try {
            setPermissions(JSON.parse(roleConfig.value));
          } catch(e) {}
        }
      } else {
        setError("Failed to load roles configuration from server.");
      }
    } catch (e) {
      setError(e.message || "Failed to fetch configurations.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (roleId, viewId) => {
    const rolePerms = permissions[roleId] || [];
    let newPerms;
    if (rolePerms.includes(viewId)) {
      newPerms = rolePerms.filter(v => v !== viewId);
    } else {
      newPerms = [...rolePerms, viewId];
    }

    setPermissions(prev => ({
      ...prev,
      [roleId]: newPerms
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          key: "ROLE_PERMISSIONS",
          value: JSON.stringify(permissions),
          description: "Configurable role-based access control visibility matrix map for application tabs."
        })
      });

      if (res.ok) {
        setSuccessMsg("Role permission matrix saved successfully! All user view clearances are now active.");
        window.dispatchEvent(new CustomEvent("role-permissions-updated"));
        if (onRefreshSignal) onRefreshSignal();
        setTimeout(() => setSuccessMsg(""), 5000);
      } else {
        setError("Failed to save role permissions config to database.");
      }
    } catch (e) {
      setError(e.message || "Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 shadow-sm min-h-[300px]">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-3" />
        <span className="text-xs text-slate-500 font-medium">Fetching Role Clearance Settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans max-w-4xl">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Access Control & Role Mapping Matrix</h2>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed mb-4">
          Establish tab-level visibility and authorization guards for user access levels. Modifying these configurations will dynamically adjust sidebar navigation menus and prevent unauthorised routing access.
        </p>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg font-bold mb-4">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-lg font-bold mb-4">
            {successMsg}
          </div>
        )}

        <div className="overflow-x-auto border border-slate-250 rounded-xl shadow-sm">
          <table className="w-full text-left border-collapse bg-white">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-2/5">App Feature / View Scope</th>
                {roles.map(r => (
                  <th key={r.id} className="px-4 py-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">
                    {r.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {views.map(v => (
                <tr key={v.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 text-xs">{v.label}</span>
                      <span className="text-[10px] text-slate-455 mt-0.5 leading-relaxed">{v.description}</span>
                    </div>
                  </td>
                  {roles.map(r => {
                    const isChecked = (permissions[r.id] || []).includes(v.id);
                    return (
                      <td key={r.id} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggle(r.id, v.id)}
                          className="mx-auto flex items-center justify-center p-1 rounded hover:bg-slate-100 transition active:scale-95 cursor-pointer text-slate-650 hover:text-indigo-600"
                        >
                          {isChecked ? (
                            <CheckSquare className="h-5 w-5 text-indigo-600 fill-indigo-50" />
                          ) : (
                            <Square className="h-5 w-5 text-slate-350" />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-5 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-150">
            <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
            <span>Updates require Save and will reflect system-wide in real-time.</span>
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>Save Matrix Config</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
