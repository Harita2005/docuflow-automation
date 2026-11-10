import React from "react";
import { createPortal } from "react-dom";
import {
  Shield,
  X,
  Eye,
  Check,
  Edit2,
  CheckSquare,
  BarChart3,
  Trash2,
  Loader2,
  Plus
} from "lucide-react";

export default function AddRoleModal({
  isOpen,
  onClose,
  onSubmit,
  newRoleName,
  setNewRoleName,
  newRoleCode,
  setNewRoleCode,
  newRoleDescription,
  setNewRoleDescription,
  newRolePreset,
  handleSelectRolePreset,
  newRoleCapabilities,
  handleToggleRoleCapability,
  showCustomRolePageBuilder,
  setShowCustomRolePageBuilder,
  newRolePages,
  handleToggleRolePage,
  isCreatingRole,
}) {
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto custom-scrollbar">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#003F28] shrink-0 shadow-2xs">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Create Role & Assign Permissions</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Name the role and choose exactly what actions (Create, Edit, Approve, Delete) and pages it can access
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          
          {/* Step 1: Role Identity */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="h-5 w-5 rounded-full bg-[#003F28] text-white text-[10px] font-black flex items-center justify-center">1</span>
              <span>Role Information</span>
              <span className="text-rose-500">*</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Role Title / Job Name <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  value={newRoleName}
                  onChange={e => {
                    setNewRoleName(e.target.value);
                    if (!newRoleCode || newRoleCode === newRoleName.toLowerCase().replace(/[\s\-/\\]+/g, '_').replace(/[^a-z0-9_]/g, '')) {
                      setNewRoleCode(e.target.value.toLowerCase().replace(/[\s\-/\\]+/g, '_').replace(/[^a-z0-9_]/g, ''));
                    }
                  }}
                  placeholder="e.g. Accounts Payable Specialist"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  System Role ID <span className="text-slate-400 font-normal">(Auto-generated)</span>
                </label>
                <input 
                  type="text"
                  value={newRoleCode}
                  onChange={e => setNewRoleCode(e.target.value.toLowerCase().replace(/[\s\-/\\]+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. ap_specialist"
                  className="w-full text-xs p-2.5 font-mono bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-700 focus:border-[#003F28] focus:bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Role Description / Purpose <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input 
                type="text"
                value={newRoleDescription}
                onChange={e => setNewRoleDescription(e.target.value)}
                placeholder="e.g. Reviews invoice line items and performs OCR data verification"
                className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium text-slate-700 focus:border-[#003F28] focus:bg-white"
              />
            </div>
          </div>

          {/* Step 2: Role Level Presets (One-click baseline) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-[#003F28] text-white text-[10px] font-black flex items-center justify-center">2</span>
                <span>Role Access Baseline</span>
              </label>
              <span className="text-[11px] text-slate-400 font-medium">Choose a standard preset or customize</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleSelectRolePreset("viewer")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  newRolePreset === "viewer"
                    ? "bg-[#003F28] text-white border-[#003F28] shadow-sm ring-2 ring-[#003F28]/20"
                    : "bg-slate-50 hover:bg-slate-100/80 text-slate-700 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    <span>Viewer</span>
                  </span>
                  {newRolePreset === "viewer" && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
                <span className={`text-[10px] leading-snug ${newRolePreset === "viewer" ? "text-emerald-100" : "text-slate-400"}`}>
                  Read-only viewing and report downloads. No editing.
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRolePreset("operator")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  newRolePreset === "operator"
                    ? "bg-[#003F28] text-white border-[#003F28] shadow-sm ring-2 ring-[#003F28]/20"
                    : "bg-slate-50 hover:bg-slate-100/80 text-slate-700 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>Operator</span>
                  </span>
                  {newRolePreset === "operator" && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
                <span className={`text-[10px] leading-snug ${newRolePreset === "operator" ? "text-emerald-100" : "text-slate-400"}`}>
                  Upload files, correct OCR data and edit fields.
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRolePreset("manager")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  newRolePreset === "manager"
                    ? "bg-[#003F28] text-white border-[#003F28] shadow-sm ring-2 ring-[#003F28]/20"
                    : "bg-slate-50 hover:bg-slate-100/80 text-slate-700 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>Approver</span>
                  </span>
                  {newRolePreset === "manager" && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
                <span className={`text-[10px] leading-snug ${newRolePreset === "manager" ? "text-emerald-100" : "text-slate-400"}`}>
                  Approve, reject, hold, and advance workflow gates.
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectRolePreset("admin")}
                className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  newRolePreset === "admin"
                    ? "bg-[#003F28] text-white border-[#003F28] shadow-sm ring-2 ring-[#003F28]/20"
                    : "bg-slate-50 hover:bg-slate-100/80 text-slate-700 border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Admin</span>
                  </span>
                  {newRolePreset === "admin" && <Check className="h-3.5 w-3.5 text-white" />}
                </div>
                <span className={`text-[10px] leading-snug ${newRolePreset === "admin" ? "text-emerald-100" : "text-slate-400"}`}>
                  Full control including deletion and system settings.
                </span>
              </button>
            </div>
          </div>

          {/* Step 3: Action Permissions with "What is Included" */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-[#003F28] text-white text-[10px] font-black flex items-center justify-center">3</span>
                <span>Action Clearances (What this role can do)</span>
                <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-slate-400 font-medium">Click any action to grant or revoke</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              
              {/* Action 1: VIEW */}
              <div 
                onClick={() => handleToggleRoleCapability("view")}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 select-none ${
                  newRoleCapabilities.view 
                    ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200" 
                    : "bg-slate-50/80 border-slate-200 opacity-60"
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  newRoleCapabilities.view ? "bg-[#003F28] text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  <Eye className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-xs font-bold text-slate-900">View / Read</h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      newRoleCapabilities.view ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      {newRoleCapabilities.view ? "Granted ✓" : "Off"}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 mb-1">What is included:</p>
                  <ul className="text-[10px] text-slate-500 space-y-0.5 list-disc list-inside">
                    <li>View document lists, status counters and dashboards</li>
                    <li>Open and read invoice OCR fields & audit logs</li>
                  </ul>
                </div>
              </div>

              {/* Action 2: CREATE */}
              <div 
                onClick={() => handleToggleRoleCapability("create")}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 select-none ${
                  newRoleCapabilities.create 
                    ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200" 
                    : "bg-slate-50/80 border-slate-200 opacity-60"
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  newRoleCapabilities.create ? "bg-[#003F28] text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  <Plus className="h-4 w-4 stroke-[2.5]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-xs font-bold text-slate-900">Create / Upload</h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      newRoleCapabilities.create ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      {newRoleCapabilities.create ? "Granted ✓" : "Off"}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 mb-1">What is included:</p>
                  <ul className="text-[10px] text-slate-500 space-y-0.5 list-disc list-inside">
                    <li>Upload single & batch PDF invoices to ingestion desk</li>
                    <li>Create new customer feedback tickets</li>
                  </ul>
                </div>
              </div>

              {/* Action 3: EDIT */}
              <div 
                onClick={() => handleToggleRoleCapability("edit")}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 select-none ${
                  newRoleCapabilities.edit 
                    ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200" 
                    : "bg-slate-50/80 border-slate-200 opacity-60"
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  newRoleCapabilities.edit ? "bg-[#003F28] text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  <Edit2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-xs font-bold text-slate-900">Edit / Modify</h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      newRoleCapabilities.edit ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      {newRoleCapabilities.edit ? "Granted ✓" : "Off"}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 mb-1">What is included:</p>
                  <ul className="text-[10px] text-slate-500 space-y-0.5 list-disc list-inside">
                    <li>Correct OCR vendor names, dates, taxes & amounts</li>
                    <li>Update cost centers, line items & reviewer remarks</li>
                  </ul>
                </div>
              </div>

              {/* Action 4: APPROVE */}
              <div 
                onClick={() => handleToggleRoleCapability("approve")}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 select-none ${
                  newRoleCapabilities.approve 
                    ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200" 
                    : "bg-slate-50/80 border-slate-200 opacity-60"
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  newRoleCapabilities.approve ? "bg-[#003F28] text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  <CheckSquare className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-xs font-bold text-slate-900">Approve / Workflow</h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      newRoleCapabilities.approve ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      {newRoleCapabilities.approve ? "Granted ✓" : "Off"}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 mb-1">What is included:</p>
                  <ul className="text-[10px] text-slate-500 space-y-0.5 list-disc list-inside">
                    <li>Approve invoices & advance to next workflow stage</li>
                    <li>Reject, hold, or send back invoices with comments</li>
                  </ul>
                </div>
              </div>

              {/* Action 5: EXPORT */}
              <div 
                onClick={() => handleToggleRoleCapability("export")}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 select-none ${
                  newRoleCapabilities.export 
                    ? "bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200" 
                    : "bg-slate-50/80 border-slate-200 opacity-60"
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  newRoleCapabilities.export ? "bg-[#003F28] text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-xs font-bold text-slate-900">Export & Download</h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      newRoleCapabilities.export ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}>
                      {newRoleCapabilities.export ? "Granted ✓" : "Off"}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 mb-1">What is included:</p>
                  <ul className="text-[10px] text-slate-500 space-y-0.5 list-disc list-inside">
                    <li>Download stamped PDF invoices & attachments</li>
                    <li>Export report datasets and work queues to Excel/CSV</li>
                  </ul>
                </div>
              </div>

              {/* Action 6: DELETE (Restricted) */}
              <div 
                onClick={() => handleToggleRoleCapability("delete")}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-start gap-3 select-none ${
                  newRoleCapabilities.delete 
                    ? "bg-rose-50 border-rose-300 ring-1 ring-rose-200" 
                    : "bg-slate-50/80 border-slate-200 opacity-60"
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  newRoleCapabilities.delete ? "bg-rose-700 text-white" : "bg-slate-200 text-slate-500"
                }`}>
                  <Trash2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h4 className="text-xs font-bold text-rose-900">Delete / Discard</h4>
                    <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                      newRoleCapabilities.delete ? "bg-rose-200 text-rose-900" : "bg-slate-200 text-slate-600"
                    }`}>
                      {newRoleCapabilities.delete ? "Danger ✓" : "Restricted"}
                    </span>
                  </div>
                  <p className="text-[10px] font-bold text-rose-700 mb-1">What is included:</p>
                  <ul className="text-[10px] text-rose-600 space-y-0.5 list-disc list-inside">
                    <li>Permanently discard invoices and cancel records</li>
                    <li>⚠️ High privilege (Recommended for Admin only)</li>
                  </ul>
                </div>
              </div>

            </div>
          </div>

          {/* Step 4: Custom Page Access Accordion */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 rounded-full bg-[#003F28] text-white text-[10px] font-black flex items-center justify-center">4</span>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Page Clearances</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomRolePageBuilder(prev => !prev)}
                className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
              >
                <span>{showCustomRolePageBuilder ? "Hide Page Details ▲" : "Customize Accessible Pages ▼"}</span>
              </button>
            </div>

            {/* Page badges summary */}
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(newRolePages).map(pageId => {
                const isEnabled = newRolePages[pageId]?.enabled;
                const pageNames = {
                  "dashboard": "Dashboard",
                  "work-tracker": "Work Tracker",
                  "approved-documents": "Approved Docs",
                  "upload": "Upload Desk",
                  "customer-feedback": "Feedback",
                  "workflow-rules": "Workflow Rules",
                  "admin": "Control Settings"
                };
                return (
                  <span
                    key={pageId}
                    onClick={() => handleToggleRolePage(pageId, "enabled")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition border ${
                      isEnabled 
                        ? "bg-white text-emerald-800 border-emerald-300 shadow-2xs" 
                        : "bg-slate-100 text-slate-400 border-slate-200 line-through"
                    }`}
                  >
                    {isEnabled ? "✓ " : "✕ "}{pageNames[pageId] || pageId}
                  </span>
                );
              })}
            </div>

            {/* Detailed Page Checkboxes if expanded */}
            {showCustomRolePageBuilder && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2 animate-fadeIn">
                <p className="text-[10px] text-slate-500 font-medium">Toggle access and editing for each specific page:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { id: "dashboard", name: "Dashboard Page", desc: "Overview metrics & pending work" },
                    { id: "work-tracker", name: "Work Tracker Page", desc: "Active invoice review & stages" },
                    { id: "approved-documents", name: "Approved Docs Page", desc: "Settled invoices & payments" },
                    { id: "upload", name: "Upload Document Page", desc: "Invoice upload & ingestion" },
                    { id: "customer-feedback", name: "Customer Feedback Page", desc: "Complaints & SLAs" },
                    { id: "workflow-rules", name: "Workflow & Rules Page", desc: "Routing schemes & matrix" },
                    { id: "admin", name: "Control Settings Page", desc: "Users, roles & audit logs" }
                  ].map(pg => {
                    const pgState = newRolePages[pg.id] || { enabled: false, write: false, admin: false };
                    return (
                      <div key={pg.id} className="p-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-800 block text-[11px]">{pg.name}</span>
                          <span className="text-[9px] text-slate-400 block">{pg.desc}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleRolePage(pg.id, "enabled")}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                              pgState.enabled ? "bg-[#003F28] text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {pgState.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newRoleName.trim() || isCreatingRole}
              className="px-5 py-2 bg-[#003F28] hover:bg-[#003320] text-white text-xs font-extrabold rounded-xl shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {isCreatingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 stroke-[2.5]" />}
              <span>{isCreatingRole ? "Creating Role..." : "Create Role & Permissions"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
