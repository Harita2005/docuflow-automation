import React from "react";
import { createPortal } from "react-dom";
import {
  Edit2,
  Users,
  Shield,
  Filter,
  Search,
  X,
  Loader2
} from "lucide-react";

export default function EditUserModal({
  user,
  onClose,
  onSubmit,
  setEditingUserModal,
  isUpdatingUser,
  roles,
  availableDivisions,
  divisionsLoading,
  divisionsError,
  isDivisionInGroup,
  getDivisionPrefix,
  showAllEditDivs,
  setShowAllEditDivs,
  activeEditMainDiv,
  editGroupDivs,
  editGroupList,
  allEditGroupSelected,
  currentEditApprovals,
  editDivSearch,
  setEditDivSearch,
  filteredEditDivs
}) {
  if (!user || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#003F28] flex items-center justify-center shadow-xs">
              <Edit2 className="h-4 w-4 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">Edit Employee Profile & Details</h3>
              <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">Modify profile credentials, primary organizational division, and approval access permissions</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* LEFT COLUMN: Employee Identity & Hierarchy (5 Cols) */}
              <div className="lg:col-span-5 space-y-3.5 border-b lg:border-b-0 lg:border-r border-slate-100 pb-5 lg:pb-0 lg:pr-6">
                <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                  <Users className="h-3.5 w-3.5 text-[#003F28]" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">User Profile Details</span>
                </div>

                {/* Row 1: EMP ID + Full Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Emp ID (Editable) <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text"
                      required
                      value={user.employee_id || ''}
                      onChange={e => setEditingUserModal({ ...user, employee_id: e.target.value })}
                      placeholder="e.g. 16220 or E22-02094"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-900 focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Full Name (Editable) <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="text"
                      required
                      value={user.employee_name || user.name || ''}
                      onChange={e => setEditingUserModal({ ...user, employee_name: e.target.value, name: e.target.value })}
                      placeholder="e.g. Ram Kumar"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-900 focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {/* Row 2: Email + Username */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="email"
                      required
                      value={user.email || ''}
                      onChange={e => setEditingUserModal({ ...user, email: e.target.value })}
                      placeholder="e.g. ram@company.com"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Username</label>
                    <input 
                      type="text"
                      value={user.username || ''}
                      onChange={e => setEditingUserModal({ ...user, username: e.target.value })}
                      placeholder="e.g. ramk"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {/* Row 3: Phone Number + Role Group */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Phone Number</label>
                    <input 
                      type="text"
                      value={user.phone_number || ''}
                      onChange={e => setEditingUserModal({ ...user, phone_number: e.target.value })}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Role Group</label>
                    <select
                      value={user.role || 'employee'}
                      onChange={e => setEditingUserModal({ ...user, role: e.target.value })}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 font-semibold text-slate-800 cursor-pointer transition-all"
                    >
                      {roles.map(r => (
                        <option key={r.code || r.id} value={r.code || r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 4: Main Division (Triggers Approval Divisions Filter) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      Main Division <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      Filters Approvals
                    </span>
                  </div>
                  {divisionsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#003F28]" />
                      <span>Loading...</span>
                    </div>
                  ) : divisionsError ? (
                    <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {divisionsError}
                    </div>
                  ) : availableDivisions.length === 0 ? (
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      No active divisions.
                    </div>
                  ) : (
                    <select
                      value={user.division || (availableDivisions[0]?.code || "")}
                      onChange={e => {
                        const newDiv = e.target.value;
                        setShowAllEditDivs(false); // Reset to filtered view for selected Main Division
                        const currApprovals = Array.isArray(user.approval_divisions) 
                          ? user.approval_divisions 
                          : (user.approval_divisions ? String(user.approval_divisions).split(',').map(x => x.trim()).filter(Boolean) : []);
                        const matchingDivs = availableDivisions.filter(d => isDivisionInGroup(d.code, newDiv)).map(d => d.code);
                        const retained = currApprovals.filter(code => matchingDivs.includes(code));
                        const nextApprovals = (newDiv && !retained.includes(newDiv) && matchingDivs.includes(newDiv))
                          ? [newDiv, ...retained]
                          : (retained.length > 0 ? retained : (newDiv ? [newDiv] : []));
                        setEditingUserModal({ 
                          ...user, 
                          division: newDiv,
                          approval_divisions: nextApprovals
                        });
                      }}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 font-bold text-slate-800 cursor-pointer transition-all"
                    >
                      {availableDivisions.map(d => (
                        <option key={d.code} value={d.code}>
                          {d.name ? `${d.name} (${d.code})` : d.code}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[9px] text-slate-400 mt-1">Primary organizational unit assigned to this employee.</p>
                </div>

                {/* Row 5: Department + Plant */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Department</label>
                    <input 
                      type="text"
                      value={user.department || user.dept || ''}
                      onChange={e => setEditingUserModal({ ...user, department: e.target.value })}
                      placeholder="e.g. Finance"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Plant / Branch</label>
                    <input 
                      type="text"
                      value={user.plant || ''}
                      onChange={e => setEditingUserModal({ ...user, plant: e.target.value })}
                      placeholder="e.g. TN-SIVAKASI"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {/* Row 6: Reset Password */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reset Password (Optional)</label>
                  <input 
                    type="password"
                    value={user.password || ''}
                    onChange={e => setEditingUserModal({ ...user, password: e.target.value })}
                    placeholder="Leave blank to keep current password"
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                  />
                </div>
              </div>

              {/* RIGHT COLUMN: Approval Divisions Matrix (7 Cols) */}
              <div className="lg:col-span-7 flex flex-col space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#003F28]" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">Approval Divisions</span>
                    {currentEditApprovals.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-[#003F28] border border-emerald-200">
                        {currentEditApprovals.length} selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editGroupList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (allEditGroupSelected) {
                            const nextList = currentEditApprovals.filter(c => !editGroupList.some(d => d.code === c));
                            setEditingUserModal({ ...user, approval_divisions: nextList });
                          } else {
                            const nextList = Array.from(new Set([...currentEditApprovals, ...editGroupList.map(d => d.code)]));
                            setEditingUserModal({ ...user, approval_divisions: nextList });
                          }
                        }}
                        className="text-[10px] text-[#003F28] hover:underline font-bold transition-colors cursor-pointer"
                      >
                        {allEditGroupSelected ? "Deselect group" : "Select all group"}
                      </button>
                    )}
                    {currentEditApprovals.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setEditingUserModal({ ...user, approval_divisions: [] })}
                        className="text-[10px] text-slate-400 hover:text-rose-500 font-medium transition-colors cursor-pointer"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Mode Tabs: [ Main Division Group ] / [ All Divisions ] */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setShowAllEditDivs(false)}
                    className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      !showAllEditDivs
                        ? "bg-white text-[#003F28] shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Filter className="h-3 w-3 text-emerald-600" />
                    <span>Filtered: {getDivisionPrefix(activeEditMainDiv) || "Main"} Group ({editGroupDivs.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllEditDivs(true)}
                    className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      showAllEditDivs
                        ? "bg-white text-[#003F28] shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <span>Show All Divisions ({availableDivisions.length})</span>
                  </button>
                </div>

                {/* Division Selector Box */}
                {divisionsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-6 border border-slate-200 rounded-lg bg-slate-50 justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-[#003F28]" />
                    <span>Loading approval divisions...</span>
                  </div>
                ) : divisionsError ? (
                  <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-3">
                    {divisionsError}
                  </div>
                ) : editGroupList.length === 0 ? (
                  <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-4 text-center">
                    No divisions available in {getDivisionPrefix(activeEditMainDiv)} group. Click "Show All Divisions" to assign any division.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex flex-col bg-white">
                    {/* Search bar */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/70">
                      <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={editDivSearch}
                        onChange={e => setEditDivSearch(e.target.value)}
                        placeholder={showAllEditDivs ? "Search all divisions..." : `Search within ${getDivisionPrefix(activeEditMainDiv)} divisions...`}
                        className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400 font-medium"
                      />
                      {editDivSearch && (
                        <button type="button" onClick={() => setEditDivSearch("")} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Grid of checkboxes (2 spacious columns) */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 max-h-[290px] overflow-y-auto custom-scrollbar">
                      {filteredEditDivs.length === 0 ? (
                        <div className="col-span-full text-[11px] text-slate-400 text-center py-6">
                          No divisions found matching "{editDivSearch}".
                        </div>
                      ) : (
                        filteredEditDivs.map(d => {
                          const isChecked = currentEditApprovals.includes(d.code);
                          const isMain = d.code === activeEditMainDiv;
                          return (
                            <label
                              key={d.code}
                              className={`flex items-start gap-2 p-2 rounded-lg border transition-all cursor-pointer select-none ${
                                isChecked
                                  ? "bg-emerald-50/90 border-emerald-300 text-emerald-950 font-bold shadow-2xs"
                                  : "bg-slate-50/60 border-slate-200 hover:bg-slate-100/70 text-slate-700"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  let nextList;
                                  if (e.target.checked) {
                                    nextList = [...currentEditApprovals, d.code];
                                  } else {
                                    nextList = currentEditApprovals.filter(x => x !== d.code);
                                  }
                                  setEditingUserModal({
                                    ...user,
                                    approval_divisions: nextList
                                  });
                                }}
                                className="rounded border-slate-300 text-[#003F28] focus:ring-[#003F28] h-3.5 w-3.5 mt-0.5 shrink-0 cursor-pointer"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-bold text-slate-900 truncate" title={d.name || d.code}>
                                    {d.name || d.code}
                                  </span>
                                  {isMain && (
                                    <span className="px-1 py-0.2 rounded text-[8px] font-extrabold uppercase bg-[#003F28] text-white">
                                      Main
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9.5px] text-slate-400 font-mono block">
                                  {d.code}
                                </span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <p className="text-[9.5px] text-slate-400 leading-relaxed">
                  Filtered against Main Division (<strong>{activeEditMainDiv}</strong>). Select the business divisions this user is permitted to review and approve documents for.
                </p>
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 flex-shrink-0">
            <p className="text-[10px] text-slate-400">Fields marked <span className="text-rose-500 font-bold">*</span> are required</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingUser}
                className="px-5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {isUpdatingUser && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{isUpdatingUser ? "Saving..." : "Save Profile"}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
