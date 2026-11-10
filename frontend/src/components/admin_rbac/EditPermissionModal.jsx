import React from "react";
import { createPortal } from "react-dom";
import { Edit2, X } from "lucide-react";

export default function EditPermissionModal({
  isOpen,
  onClose,
  onSubmit,
  editPermModule,
  setEditPermModule,
  editPermSubpage,
  setEditPermSubpage,
  editCustomSubpage,
  setEditCustomSubpage,
  editPermAction,
  setEditPermAction,
  editPermCategory,
  setEditPermCategory,
  editPermLabel,
  setEditPermLabel,
  editPermDesc,
  setEditPermDesc,
  editPermScopes,
  setEditPermScopes,
  moduleOptions,
  subpageOptions,
  actionOptions,
  scopeOptions,
}) {
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Edit2 className="h-4 w-4 text-[#003F28]" />
            <span>Edit Permission Definition</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
          {/* Row 1: Module & Subpage */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Module
              </label>
              <select
                value={editPermModule}
                onChange={e => setEditPermModule(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white cursor-pointer"
              >
                {moduleOptions.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Subpage / Desk
              </label>
              <select
                value={editPermSubpage}
                onChange={e => setEditPermSubpage(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white cursor-pointer"
              >
                {subpageOptions.map(sp => (
                  <option key={sp.value} value={sp.value}>{sp.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Subpage Key (if 'custom' selected) */}
          {editPermSubpage === "custom" && (
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Custom Subpage Key
              </label>
              <input
                type="text"
                required
                value={editCustomSubpage}
                onChange={e => setEditCustomSubpage(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="e.g. payments, audit_vault, vendor_portal"
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono text-slate-800 focus:border-[#003F28] focus:bg-white"
              />
            </div>
          )}

          {/* Row 2: Action */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Action
              </label>
              <select
                value={editPermAction}
                onChange={e => setEditPermAction(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white cursor-pointer"
              >
                {actionOptions.map(act => (
                  <option key={act.value} value={act.value}>{act.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Category Group
              </label>
              <input
                type="text"
                value={editPermCategory}
                onChange={e => setEditPermCategory(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white"
              />
            </div>
          </div>

          {/* Live Permission Code Preview */}
          <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-900 uppercase">Permission Code:</span>
            <span className="font-mono text-xs font-black text-emerald-800 bg-white px-2.5 py-1 rounded border border-emerald-300">
              {editPermModule.toLowerCase()}:{(editPermSubpage === "custom" ? (editCustomSubpage.trim().toLowerCase() || "custom") : editPermSubpage).toLowerCase()}:{editPermAction.toLowerCase()}
            </span>
          </div>

          {/* Permission Display Name */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
              Permission Name / Label <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text"
              required
              value={editPermLabel}
              onChange={e => setEditPermLabel(e.target.value)}
              className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
              Description
            </label>
            <textarea 
              value={editPermDesc}
              onChange={e => setEditPermDesc(e.target.value)}
              rows={2}
              className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-medium text-slate-700 focus:border-[#003F28] focus:bg-white resize-none"
            />
          </div>

          {/* Supported Scopes */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1.5">
              Supported Authorization Scopes
            </label>
            <div className="flex flex-wrap gap-2">
              {scopeOptions.map(sc => {
                const isChecked = editPermScopes.includes(sc);
                return (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => {
                      setEditPermScopes(prev => 
                        isChecked ? prev.filter(s => s !== sc) : [...prev, sc]
                      );
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                      isChecked
                        ? "bg-[#003F28] text-white border-[#003F28]"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {isChecked ? "✓ " : ""}{sc}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!editPermLabel.trim()}
              className="px-4 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
