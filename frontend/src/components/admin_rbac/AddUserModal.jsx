import React from "react";
import { createPortal } from "react-dom";
import {
  UserPlus,
  Users,
  Shield,
  Filter,
  Search,
  X,
  Loader2
} from "lucide-react";

export default function AddUserModal({
  isOpen,
  onClose,
  onSubmit,
  newUserEmpId,
  setNewUserEmpId,
  newUserName,
  setNewUserName,
  newUserEmail,
  setNewUserEmail,
  newUserRole,
  setNewUserRole,
  newUserDivision,
  setNewUserDivision,
  newUserDept,
  setNewUserDept,
  newUserPlant,
  setNewUserPlant,
  newUserApprovalDivisions,
  setNewUserApprovalDivisions,
  isCreatingUser,
  roles,
  rolesLoading,
  rolesError,
  availableDivisions,
  divisionsLoading,
  divisionsError,
  isDivisionInGroup,
  getDivisionPrefix,
  showAllAddDivs,
  setShowAllAddDivs,
  activeAddMainDiv,
  addGroupDivs,
  addGroupList,
  allAddGroupSelected,
  divSearch,
  setDivSearch,
  filteredAddDivs
}) {
  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl lg:max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#003F28] flex items-center justify-center shadow-xs">
              <UserPlus className="h-4 w-4 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">Add New Employee / User</h3>
              <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">Fill in employee details and assign division approval access</p>
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

        {/* Body */}
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
                      Employee ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newUserEmpId}
                      onChange={e => setNewUserEmpId(e.target.value)}
                      placeholder="e.g. 16220"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newUserName}
                      onChange={e => setNewUserName(e.target.value)}
                      placeholder="e.g. Ram Kumar"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300 font-semibold"
                    />
                  </div>
                </div>

                {/* Row 2: Official Email */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
                    Official Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={newUserEmail}
                    onChange={e => setNewUserEmail(e.target.value)}
                    placeholder="e.g. ram.kumar@company.com"
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                  />
                  <p className="text-[9.5px] text-slate-400 mt-1">Activation & login OTP will be sent to this email address.</p>
                </div>

                {/* Row 3: Role Group */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Role Group</label>
                  {rolesLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#003F28]" />
                      <span>Loading roles...</span>
                    </div>
                  ) : rolesError ? (
                    <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{rolesError}</div>
                  ) : roles.length === 0 ? (
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No roles configured.</div>
                  ) : (
                    <select
                      value={newUserRole || (roles[0].code || roles[0].id)}
                      onChange={e => setNewUserRole(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 font-semibold text-slate-800 cursor-pointer transition-all"
                    >
                      {roles.map(r => (
                        <option key={r.code || r.id} value={r.code || r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
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
                    <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{divisionsError}</div>
                  ) : availableDivisions.length === 0 ? (
                    <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No divisions available.</div>
                  ) : (
                    <select
                      value={newUserDivision || (availableDivisions[0]?.code || "")}
                      onChange={e => {
                        const newDiv = e.target.value;
                        setNewUserDivision(newDiv);
                        setShowAllAddDivs(false); // Reset to filtered view for selected Main Division
                        const matchingDivs = availableDivisions.filter(d => isDivisionInGroup(d.code, newDiv)).map(d => d.code);
                        setNewUserApprovalDivisions(prev => {
                          const retained = prev.filter(c => matchingDivs.includes(c));
                          if (newDiv && !retained.includes(newDiv) && matchingDivs.includes(newDiv)) {
                            return [newDiv, ...retained];
                          }
                          return retained.length > 0 ? retained : (newDiv ? [newDiv] : []);
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
                      value={newUserDept}
                      onChange={e => setNewUserDept(e.target.value)}
                      placeholder="e.g. Finance"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Plant / Branch</label>
                    <input
                      type="text"
                      value={newUserPlant}
                      onChange={e => setNewUserPlant(e.target.value)}
                      placeholder="e.g. TN-SIVAKASI"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#003F28] focus:ring-2 focus:ring-[#003F28]/20 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Approval Divisions Matrix (7 Cols) */}
              <div className="lg:col-span-7 flex flex-col space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[#003F28]" />
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">Approval Divisions</span>
                    {newUserApprovalDivisions.length > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-100 text-[#003F28] border border-emerald-200">
                        {newUserApprovalDivisions.length} selected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {addGroupList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (allAddGroupSelected) {
                            setNewUserApprovalDivisions(prev => prev.filter(c => !addGroupList.some(d => d.code === c)));
                          } else {
                            setNewUserApprovalDivisions(prev => Array.from(new Set([...prev, ...addGroupList.map(d => d.code)])));
                          }
                        }}
                        className="text-[10px] text-[#003F28] hover:underline font-bold transition-colors cursor-pointer"
                      >
                        {allAddGroupSelected ? "Deselect all" : "Select all in view"}
                      </button>
                    )}
                    {newUserApprovalDivisions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setNewUserApprovalDivisions([])}
                        className="text-[10px] text-slate-400 hover:text-rose-500 font-semibold transition-colors cursor-pointer"
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
                    onClick={() => setShowAllAddDivs(false)}
                    className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      !showAllAddDivs
                        ? "bg-white text-[#003F28] shadow-xs border border-slate-200"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    <Filter className="h-3 w-3 text-emerald-600" />
                    <span>Filtered: {getDivisionPrefix(activeAddMainDiv) || "Main"} Group ({addGroupDivs.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllAddDivs(true)}
                    className={`flex-1 py-1.5 px-3 rounded-md text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      showAllAddDivs
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
                  <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-3">{divisionsError}</div>
                ) : addGroupList.length === 0 ? (
                  <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-4 text-center">
                    No divisions available in {getDivisionPrefix(activeAddMainDiv)} group. Click "Show All Divisions" to assign any division.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs flex flex-col bg-white">
                    {/* Search bar */}
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/70">
                      <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                      <input
                        type="text"
                        value={divSearch}
                        onChange={e => setDivSearch(e.target.value)}
                        placeholder={showAllAddDivs ? "Search all divisions..." : `Search within ${getDivisionPrefix(activeAddMainDiv)} divisions...`}
                        className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder:text-slate-400 font-medium"
                      />
                      {divSearch && (
                        <button type="button" onClick={() => setDivSearch("")} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Grid of checkboxes (2 spacious columns) */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 max-h-[290px] overflow-y-auto custom-scrollbar">
                      {filteredAddDivs.length === 0 ? (
                        <div className="col-span-full text-[11px] text-slate-400 text-center py-6">
                          No divisions found matching "{divSearch}".
                        </div>
                      ) : (
                        filteredAddDivs.map(d => {
                          const isChecked = newUserApprovalDivisions.includes(d.code);
                          const isMain = d.code === activeAddMainDiv;
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
                                  if (e.target.checked) {
                                    setNewUserApprovalDivisions(prev => [...prev, d.code]);
                                  } else {
                                    setNewUserApprovalDivisions(prev => prev.filter(x => x !== d.code));
                                  }
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
                  Filtered against Main Division (<strong>{activeAddMainDiv}</strong>). Select the business divisions this user is permitted to review and approve documents for.
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
                disabled={isCreatingUser}
                className="px-5 py-1.5 bg-[#003F28] hover:bg-[#002f1e] text-white text-xs font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {isCreatingUser && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{isCreatingUser ? "Creating..." : "Create User"}</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>,
    document.body
  );
}
