import React from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";

export default function AddPermissionModal({
  isOpen,
  onClose,
  onSubmit,
  newPermModule,
  setNewPermModule,
  newPermSubpage,
  setNewPermSubpage,
  newCustomSubpage,
  setNewCustomSubpage,
  newPermActions,
  setNewPermActions,
  newPermAction,
  setNewPermAction,
  newPermCategory,
  setNewPermCategory,
  newCategoryName,
  setNewCategoryName,
  newPermLabel,
  setNewPermLabel,
  newPermDesc,
  setNewPermDesc,
  newPermScopes,
  setNewPermScopes,
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
            <Plus className="h-4 w-4 text-[#003F28]" />
            <span>Create System Permission</span>
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
                Module <span className="text-rose-500">*</span>
              </label>
              <select
                value={newPermModule}
                onChange={e => setNewPermModule(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white cursor-pointer"
              >
                {moduleOptions.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Subpage / Desk <span className="text-rose-500">*</span>
              </label>
              <select
                value={newPermSubpage}
                onChange={e => setNewPermSubpage(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white cursor-pointer"
              >
                {subpageOptions.map(sp => (
                  <option key={sp.value} value={sp.value}>{sp.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom Subpage Key (if 'custom' selected) */}
          {newPermSubpage === "custom" && (
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Custom Subpage Key <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newCustomSubpage}
                onChange={e => setNewCustomSubpage(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="e.g. payments, audit_vault, vendor_portal"
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-mono text-slate-800 focus:border-[#003F28] focus:bg-white"
              />
            </div>
          )}

          {/* Row 2: Action & Category with Multi-Action Support */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-bold text-slate-700 uppercase">
                Allowed Action(s) <span className="text-rose-500">*</span>
                <span className="text-slate-400 font-normal lowercase ml-1.5">(select one or multiple actions)</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const crud = ["VIEW", "CREATE", "EDIT", "DELETE"];
                    setNewPermActions(crud);
                    setNewPermAction(crud[0]);
                  }}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer"
                >
                  + CRUD All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const apprv = ["APPROVE", "REJECT", "HOLD", "SEND_BACK"];
                    setNewPermActions(apprv);
                    setNewPermAction(apprv[0]);
                  }}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 transition cursor-pointer"
                >
                  + Approvals
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewPermActions(["VIEW"]);
                    setNewPermAction("VIEW");
                  }}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Multi-Select Action Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {actionOptions.map(act => {
                const isSelected = newPermActions.includes(act.value);
                return (
                  <button
                    key={act.value}
                    type="button"
                    onClick={() => {
                      setNewPermActions(prev => {
                        let next;
                        if (isSelected) {
                          next = prev.length > 1 ? prev.filter(a => a !== act.value) : prev;
                        } else {
                          next = [...prev, act.value];
                        }
                        setNewPermAction(next[0] || act.value);
                        return next;
                      });
                    }}
                    className={`px-2 py-1.5 rounded-lg border text-left transition cursor-pointer flex items-center justify-between text-xs ${
                      isSelected
                        ? "bg-[#003F28] text-white border-[#003F28] shadow-2xs font-bold"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 font-medium"
                    }`}
                    title={act.label}
                  >
                    <span className="truncate">{act.value}</span>
                    <span className={`text-[10px] ml-1 shrink-0 ${isSelected ? "text-emerald-200" : "text-slate-400"}`}>
                      {isSelected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Action Explanations */}
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-600 space-y-0.5">
              <span className="font-bold text-slate-700 block">
                Selected ({newPermActions.length}): {newPermActions.join(", ")}
              </span>
              <p className="text-slate-500 italic">
                {newPermActions.length > 1
                  ? `All ${newPermActions.length} actions will be created together for this subpage.`
                  : (actionOptions.find(a => a.value === newPermAction)?.label || "Select actions to grant")}
              </p>
            </div>

            {/* Category Group Selector */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                Category Group
              </label>
              <select
                value={newPermCategory}
                onChange={e => setNewPermCategory(e.target.value)}
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white cursor-pointer"
              >
                <option value="OPERATIONS PAGES">OPERATIONS PAGES</option>
                <option value="FEEDBACK PAGE">FEEDBACK PAGE</option>
                <option value="ADMINISTRATION PAGES">ADMINISTRATION PAGES</option>
                <option value="NEW_CATEGORY">+ Create Custom Category...</option>
              </select>
            </div>
          </div>

          {/* Custom Category Input if selected */}
          {newPermCategory === "NEW_CATEGORY" && (
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">New Category Title</label>
              <input 
                type="text"
                required
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="e.g. Vendor Management & Approvals"
                className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white"
              />
            </div>
          )}

          {/* Live Permission Code Preview */}
          <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-900 uppercase">
                Generated Permission Code{newPermActions.length > 1 ? "s" : ""}:
              </span>
              <span className="text-[9px] font-bold text-emerald-700 px-1.5 py-0.2 rounded bg-emerald-100 border border-emerald-200">
                {newPermActions.length} code{newPermActions.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 font-mono text-xs font-black text-emerald-800">
              {newPermActions.map(act => (
                <span key={act} className="bg-white px-2 py-0.5 rounded border border-emerald-300">
                  {newPermModule.toLowerCase()}:{(newPermSubpage === "custom" ? (newCustomSubpage.trim().toLowerCase() || "custom") : newPermSubpage).toLowerCase()}:{act.toLowerCase()}
                </span>
              ))}
            </div>
          </div>

          {/* Permission Display Name */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
              Permission Name / Label <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text"
              required
              value={newPermLabel}
              onChange={e => setNewPermLabel(e.target.value)}
              placeholder={`e.g. ${newPermAction} ${(newPermSubpage === 'custom' ? newCustomSubpage : newPermSubpage) || 'Document'} (${newPermModule.toUpperCase()})`}
              className="w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold text-slate-800 focus:border-[#003F28] focus:bg-white transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
              Description <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea 
              value={newPermDesc}
              onChange={e => setNewPermDesc(e.target.value)}
              placeholder={`Allows ${newPermAction} operations on ${newPermModule}:${newPermSubpage}...`}
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
                const isChecked = newPermScopes.includes(sc);
                return (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => {
                      setNewPermScopes(prev => 
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
              disabled={!newPermLabel.trim()}
              className="px-4 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-lg shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
            >
              Create Permission
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
