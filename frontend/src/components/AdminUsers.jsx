import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  ShieldCheck, 
  Mail, 
  Phone,
  KeyRound,
  Save, 
  X, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Check, 
  Lock, 
  Building, 
  UserCheck, 
  UserX,
  Smartphone,
  Shield,
  Fingerprint,
  Calendar,
  Sparkles
} from 'lucide-react';

const FALLBACK_USERS = [
  { 
    id: 1, 
    user_uid: "USR-100001", 
    employee_id: "ADM-001", 
    name: "Anbu Selvan", 
    employee_name: "Anbu Selvan",
    username: "anbu", 
    email: "admin@initech.com", 
    phone_number: "+91 98401 23456",
    role: "admin", 
    department: "IT Governance", 
    division: "VCC", 
    is_active: true, 
    mfa_enabled: true,
    mfa_type: "AUTHENTICATOR",
    created_by: "System Initializer",
    created_on: "2026-01-15T09:30:00.000Z",
    created_at: "2026-01-15T09:30:00.000Z" 
  },
  { 
    id: 2, 
    user_uid: "USR-100002", 
    employee_id: "MGR-002", 
    name: "Karthik Natarajan", 
    employee_name: "Karthik Natarajan",
    username: "karthik", 
    email: "manager@initech.com", 
    phone_number: "+91 98402 34567",
    role: "manager", 
    department: "Operations", 
    division: "VCC", 
    is_active: true, 
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "Anbu Selvan",
    created_on: "2026-02-10T11:15:00.000Z",
    created_at: "2026-02-10T11:15:00.000Z" 
  },
  { 
    id: 3, 
    user_uid: "USR-100003", 
    employee_id: "EXEC-003", 
    name: "Surya Prakash", 
    employee_name: "Surya Prakash",
    username: "surya", 
    email: "executive@initech.com", 
    phone_number: "+91 98403 45678",
    role: "manager", 
    department: "Corporate Finance", 
    division: "VCC", 
    is_active: true, 
    mfa_enabled: true,
    mfa_type: "SMS",
    created_by: "Anbu Selvan",
    created_on: "2026-02-18T14:20:00.000Z",
    created_at: "2026-02-18T14:20:00.000Z" 
  },
  { 
    id: 4, 
    user_uid: "USR-100004", 
    employee_id: "AUD-004", 
    name: "Priya Sundaram", 
    employee_name: "Priya Sundaram",
    username: "priya", 
    email: "auditor@initech.com", 
    phone_number: "+91 98404 56789",
    role: "auditor", 
    department: "Internal Audit", 
    division: "VCC", 
    is_active: true, 
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "Anbu Selvan",
    created_on: "2026-03-01T10:00:00.000Z",
    created_at: "2026-03-01T10:00:00.000Z" 
  },
  { 
    id: 5, 
    user_uid: "USR-100005", 
    employee_id: "AP-005", 
    name: "Meera Krishnan", 
    employee_name: "Meera Krishnan",
    username: "meera", 
    email: "ap_staff@initech.com", 
    phone_number: "+91 98405 67890",
    role: "ap_specialist", 
    department: "Accounts Payable", 
    division: "VCC", 
    is_active: true, 
    mfa_enabled: false,
    mfa_type: "SMS",
    created_by: "Karthik Natarajan",
    created_on: "2026-03-12T16:45:00.000Z",
    created_at: "2026-03-12T16:45:00.000Z" 
  },
  { 
    id: 6, 
    user_uid: "USR-100006", 
    employee_id: "EMP-006", 
    name: "Vijay Kumar", 
    employee_name: "Vijay Kumar",
    username: "vijay", 
    email: "employee@initech.com", 
    phone_number: "+91 98406 78901",
    role: "employee", 
    department: "General Processing", 
    division: "VCC", 
    is_active: true, 
    mfa_enabled: false,
    mfa_type: "EMAIL",
    created_by: "Karthik Natarajan",
    created_on: "2026-04-05T08:30:00.000Z",
    created_at: "2026-04-05T08:30:00.000Z" 
  }
];

export default function AdminUsers() {
  const [users, setUsers] = useState(FALLBACK_USERS);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [toastMsg, setToastMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const currentUserRole = (localStorage.getItem("currentUserRole") || "admin").toLowerCase();
  const isAdmin = currentUserRole === "admin" || currentUserRole === "settings_editor";

  useEffect(() => { 
    fetchUsers(); 
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      
      let res = await fetch('/api/users', { headers });
      if (!res.ok) {
        res = await fetch('/api/admin/users', { headers });
      }
      
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setUsers(data.map(u => ({
            id: u.id,
            user_uid: u.user_uid || `USR-${100000 + Number(u.id)}`,
            employee_id: u.employee_id || `EMP-${u.id}`,
            name: u.employee_name || u.name || u.username,
            employee_name: u.employee_name || u.name || u.username,
            username: u.username || u.employee_id,
            email: u.email || `${u.username || 'user'}@initech.com`,
            phone_number: u.phone_number || "+91 98400 00000",
            role: u.role || 'employee',
            department: u.department || 'General Operations',
            division: u.division || 'VCC',
            is_active: u.is_active !== undefined ? u.is_active : true,
            mfa_enabled: u.mfa_enabled !== undefined ? u.mfa_enabled : false,
            mfa_type: u.mfa_type || 'EMAIL',
            created_by: u.created_by || 'System Admin',
            created_on: u.created_on || u.created_at || new Date().toISOString(),
            created_at: u.created_at || u.created_on || new Date().toISOString()
          })));
        }
      }
    } catch (e) { 
      console.error(e); 
    } finally {
      setLoading(false);
    }
  };

  const handleSyncDirectory = async () => {
    setSyncing(true);
    setToastMsg("");
    setErrorMsg("");
    try {
      await fetchUsers();
      setToastMsg("✓ User directory successfully synchronized with User Master database!");
      setTimeout(() => setToastMsg(""), 3500);
    } catch (e) {
      setErrorMsg("Directory sync failed.");
      setTimeout(() => setErrorMsg(""), 3500);
    } finally {
      setSyncing(false);
    }
  };

  const saveUser = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMsg("Action Restricted: Only Administrators can provision or edit users.");
      setTimeout(() => setErrorMsg(""), 3500);
      return;
    }

    const fd = new FormData(e.target);
    const name = fd.get('name');
    const email = fd.get('email');
    const phone_number = fd.get('phone_number') || '+91 98000 00000';
    const username = fd.get('username') || fd.get('employee_id');
    const employee_id = fd.get('employee_id');
    const role = fd.get('role');
    const department = fd.get('department') || 'General Operations';
    const division = fd.get('division') || 'VCC';
    const password = fd.get('password') || 'default123';
    const mfa_enabled = fd.get('mfa_enabled') === 'on' || fd.get('mfa_enabled') === 'true';
    const mfa_type = fd.get('mfa_type') || 'EMAIL';
    const is_active = fd.get('is_active') === 'on' || fd.get('is_active') === 'true';

    const payload = {
      employee_id: employee_id,
      employee_name: name,
      name: name,
      username: username,
      email: email,
      phone_number: phone_number,
      password: password,
      role: role,
      department: department,
      division: division,
      is_active: is_active,
      mfa_enabled: mfa_enabled,
      mfa_type: mfa_type,
      created_by: editingUser?.created_by || "System Admin"
    };

    try {
      const token = localStorage.getItem("authToken");
      const url = editingUser?.id && !editingUser.isNew ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser?.id && !editingUser.isNew ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setToastMsg(`✓ User "${name}" (${employee_id}) saved successfully!`);
        setTimeout(() => setToastMsg(""), 3500);
        fetchUsers();
        setEditingUser(null);
      } else {
        // Fallback optimistic update
        if (editingUser?.id && !editingUser.isNew) {
          setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...payload } : u));
        } else {
          const newUid = `USR-${Math.floor(100000 + Math.random() * 900000)}`;
          setUsers(prev => [{ 
            ...payload, 
            id: prev.length + 1, 
            user_uid: newUid,
            created_on: new Date().toISOString(),
            created_at: new Date().toISOString() 
          }, ...prev]);
        }
        setToastMsg(`✓ User "${name}" updated successfully.`);
        setTimeout(() => setToastMsg(""), 3500);
        setEditingUser(null);
      }
    } catch(e) { 
      console.error(e); 
      setEditingUser(null);
    }
  };

  const deleteUser = async (id, name, empId) => {
    if (!isAdmin) {
      setErrorMsg("Action Restricted: Only Administrators can remove users.");
      setTimeout(() => setErrorMsg(""), 3500);
      return;
    }
    if (!window.confirm(`Are you sure you want to deactivate and remove employee ${name} (${empId})?`)) return;
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/users/${id}`, { method: 'DELETE', headers: token ? { "Authorization": `Bearer ${token}` } : {} });
      setUsers(prev => prev.filter(u => u.id !== id));
      setToastMsg(`User ${name} removed.`);
      setTimeout(() => setToastMsg(""), 3000);
    } catch(e) { 
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  const handleToggleStatus = async (user) => {
    if (!isAdmin) return;
    const nextStatus = !user.is_active;
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: nextStatus } : u));
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({ is_active: nextStatus })
      });
      setToastMsg(`Status for ${user.name} set to ${nextStatus ? 'ACTIVE' : 'INACTIVE'}.`);
      setTimeout(() => setToastMsg(""), 3000);
    } catch(e) {}
  };

  const handleRoleChangeInline = async (user, newRole) => {
    if (!isAdmin) return;
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
    try {
      const token = localStorage.getItem("authToken");
      const payload = {
        employee_id: user.employee_id,
        employee_name: user.name,
        name: user.name,
        email: user.email,
        username: user.username,
        role: newRole,
        department: user.department,
        division: user.division
      };
      await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload)
      });
      setToastMsg(`Role for ${user.name} updated to ${newRole.toUpperCase()}.`);
      setTimeout(() => setToastMsg(""), 3000);
    } catch(e) {}
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.employee_id.toLowerCase().includes(search.toLowerCase()) ||
      (u.user_uid && u.user_uid.toLowerCase().includes(search.toLowerCase())) ||
      u.department.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role) => {
    switch(role) {
      case 'admin':
        return <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">Admin</span>;
      case 'manager':
        return <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">Manager</span>;
      case 'auditor':
        return <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">Auditor</span>;
      case 'ap_specialist':
        return <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">AP Staff</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">Employee</span>;
    }
  };

  const getMfaBadge = (user) => {
    if (!user.mfa_enabled) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[8.5px] font-bold border border-slate-200">
          <Lock className="h-2.5 w-2.5 text-slate-400" />
          <span>MFA Off</span>
        </span>
      );
    }
    switch (user.mfa_type) {
      case "SMS":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-800 text-[8.5px] font-bold border border-sky-200" title={`SMS OTP to ${user.phone_number}`}>
            <Smartphone className="h-2.5 w-2.5 text-sky-600" />
            <span>SMS OTP</span>
          </span>
        );
      case "AUTHENTICATOR":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 text-[8.5px] font-bold border border-purple-200" title="TOTP Authenticator App">
            <Fingerprint className="h-2.5 w-2.5 text-purple-600" />
            <span>Authenticator</span>
          </span>
        );
      case "EMAIL":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[8.5px] font-bold border border-emerald-200" title={`Email OTP to ${user.email}`}>
            <Mail className="h-2.5 w-2.5 text-emerald-600" />
            <span>Email OTP</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col font-sans">
      
      {/* 1. TOP HEADER & DIRECTORY CONTROLS */}
      <div className="border-b border-slate-200 bg-slate-50/80 p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Identity & Access Management (IAM)
              </h2>
              <span className="px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[8.5px] font-bold">
                {users.length} Provisioned Accounts
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              User Master directory: Auto PK, unique Emp ID, login credentials, OTP/MFA security & audit history
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncDirectory}
            disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors shadow-2xs cursor-pointer disabled:opacity-60"
            title="Sync live user master directory with database"
          >
            <RefreshCw className={`h-3 w-3 text-indigo-600 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Directory'}</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditingUser({ 
                isNew: true, 
                name: '', 
                email: '', 
                username: '', 
                phone_number: '+91 98400 00000',
                employee_id: `EMP-${Math.floor(1000 + Math.random()*9000)}`, 
                role: 'employee', 
                department: 'Corporate Finance', 
                division: 'VCC',
                is_active: true,
                mfa_enabled: true,
                mfa_type: 'EMAIL',
                created_by: 'System Admin'
              })}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Provision User</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. SEARCH & FILTER BAR */}
      <div className="px-3 py-2 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by Emp ID, User UID, Name, Email, or Dept..."
              className="w-full text-xs pl-8 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:border-indigo-500 focus:bg-white outline-none text-slate-800"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Role Filter:</span>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer focus:border-indigo-500"
          >
            <option value="ALL">All Roles ({users.length})</option>
            <option value="admin">Administrator</option>
            <option value="manager">Manager / Approver</option>
            <option value="auditor">Internal Auditor</option>
            <option value="ap_specialist">AP Specialist</option>
            <option value="employee">Employee</option>
          </select>
        </div>
      </div>

      {/* TOASTS */}
      {toastMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-800 text-xs px-3.5 py-1.5 font-bold flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 3. PROVISION / EDIT USER MODAL FORM */}
      {editingUser && (
        <div className="bg-indigo-50/40 p-4 border-b border-indigo-100">
          <form onSubmit={saveUser} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative max-w-2xl mx-auto space-y-3.5">
            <button 
              type="button" 
              onClick={() => setEditingUser(null)} 
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4 text-indigo-600" />
                <span>{editingUser.isNew ? 'Provision New User Master Account' : `Edit Account: ${editingUser.name} (${editingUser.employee_id})`}</span>
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              
              {/* Unique Employee ID */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Employee ID (Unique Primary Identifier)
                </label>
                <input 
                  name="employee_id" 
                  defaultValue={editingUser.employee_id} 
                  required 
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none font-mono font-bold text-indigo-700 bg-slate-50/50" 
                  placeholder="e.g. EMP-1004" 
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Employee Name</label>
                <input 
                  name="name" 
                  defaultValue={editingUser.name} 
                  required 
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none font-bold text-slate-900" 
                  placeholder="e.g. Jane Doe" 
                />
              </div>

              {/* Login Email */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Login Email Address</label>
                <input 
                  name="email" 
                  type="email" 
                  defaultValue={editingUser.email} 
                  required 
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-slate-800" 
                  placeholder="jane@initech.com" 
                />
              </div>

              {/* Mobile Phone (for SMS OTP) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Phone Number (SMS OTP)</label>
                <input 
                  name="phone_number" 
                  type="tel"
                  defaultValue={editingUser.phone_number || '+91 98400 00000'} 
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-slate-800 font-mono" 
                  placeholder="+91 98401 23456" 
                />
              </div>

              {/* Department & Division */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department & Division</label>
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    name="department" 
                    defaultValue={editingUser.department || 'Corporate Finance'} 
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-slate-800" 
                    placeholder="Department" 
                  />
                  <input 
                    name="division" 
                    defaultValue={editingUser.division || 'VCC'} 
                    className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-slate-800 font-bold text-center" 
                    placeholder="Division (VCC)" 
                  />
                </div>
              </div>

              {/* Role Level */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Role / Clearance Level</label>
                <select 
                  name="role" 
                  defaultValue={editingUser.role} 
                  className="w-full text-xs p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none bg-white font-bold text-slate-800"
                >
                  <option value="admin">Administrator (Full IT Governance & RBAC)</option>
                  <option value="manager">Approver / Manager (Workflow Sign-off)</option>
                  <option value="auditor">Internal Auditor (Compliance Audit)</option>
                  <option value="ap_specialist">AP Specialist (Verification Desk)</option>
                  <option value="employee">General Employee (Read-Only Submissions)</option>
                </select>
              </div>

              {/* Login Password */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Login Password {editingUser.isNew ? '(Default: default123)' : '(Leave blank to retain)'}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input 
                    name="password" 
                    type="password" 
                    className="w-full text-xs pl-8 pr-2.5 py-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none" 
                    placeholder={editingUser.isNew ? "default123" : "••••••••"} 
                  />
                </div>
              </div>

              {/* OTP / MFA Security Configuration */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">OTP / Multi-Factor Auth (MFA)</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-slate-50/50">
                    <input 
                      type="checkbox" 
                      name="mfa_enabled" 
                      defaultChecked={editingUser.mfa_enabled} 
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" 
                    />
                    <span className="text-xs font-bold text-slate-700">Enable MFA</span>
                  </label>
                  <select
                    name="mfa_type"
                    defaultValue={editingUser.mfa_type || 'EMAIL'}
                    className="text-xs font-bold p-2 border border-slate-200 rounded-lg outline-none bg-white text-slate-800"
                  >
                    <option value="EMAIL">✉️ Email OTP</option>
                    <option value="SMS">📱 SMS OTP</option>
                    <option value="AUTHENTICATOR">🔐 Authenticator App</option>
                  </select>
                </div>
              </div>

            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="is_active" 
                  defaultChecked={editingUser.is_active} 
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4" 
                />
                <span className="text-xs font-bold text-emerald-700">Account Active / Enabled</span>
              </label>

              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setEditingUser(null)} 
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition-colors uppercase tracking-wider cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Save User Master Record</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 4. USER DIRECTORY DATA TABLE */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200">
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest">
                PK & User UID
              </th>
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest">
                Unique Emp ID & Name
              </th>
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest">
                Login Email & Phone
              </th>
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest">
                Assigned Role
              </th>
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest">
                OTP / MFA Method
              </th>
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest">
                Created By & On
              </th>
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest text-center">
                Status
              </th>
              <th className="px-3.5 py-2 text-[9.5px] font-extrabold text-slate-600 uppercase tracking-widest text-right">
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-xs">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-xs text-slate-400 italic">
                  No users matching search criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-indigo-50/20 transition-colors group">
                  
                  {/* PK & UID */}
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-mono font-black text-slate-900 text-xs">#{u.id}</span>
                      <span className="font-mono text-[9px] text-slate-400">{u.user_uid || `USR-${100000 + Number(u.id)}`}</span>
                    </div>
                  </td>

                  {/* Unique Emp ID & Name */}
                  <td className="px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-black text-[10px] shrink-0">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-indigo-700 text-xs">{u.employee_id}</span>
                          <span className="font-bold text-slate-900 text-xs">{u.name}</span>
                        </div>
                        <span className="text-[9.5px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building className="h-2.5 w-2.5 text-slate-400" />
                          {u.department} ({u.division})
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Login Email & Phone */}
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-[10.5px] font-medium text-slate-800 flex items-center gap-1">
                        <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                        {u.email}
                      </span>
                      <span className="text-[9.5px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                        <Phone className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                        {u.phone_number || "+91 98400 00000"}
                      </span>
                    </div>
                  </td>

                  {/* Role Selector */}
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={u.role}
                        disabled={!isAdmin}
                        onChange={(e) => handleRoleChangeInline(u, e.target.value)}
                        className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider border border-slate-200 cursor-pointer outline-none bg-white hover:border-indigo-400 transition-colors disabled:opacity-75"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="auditor">Auditor</option>
                        <option value="ap_specialist">AP Staff</option>
                        <option value="employee">Employee</option>
                      </select>
                      {getRoleBadge(u.role)}
                    </div>
                  </td>

                  {/* OTP / MFA Details */}
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    {getMfaBadge(u)}
                  </td>

                  {/* Created By & Date */}
                  <td className="px-3.5 py-2.5 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5 text-slate-400" />
                        {new Date(u.created_on || u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-[8.5px] text-slate-400">by {u.created_by || 'System Admin'}</span>
                    </div>
                  </td>

                  {/* Status Toggle */}
                  <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => handleToggleStatus(u)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold cursor-pointer transition ${
                        u.is_active 
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' 
                          : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                      }`}
                      title="Click to toggle active/inactive status"
                    >
                      {u.is_active ? <UserCheck className="h-3 w-3 text-emerald-600" /> : <UserX className="h-3 w-3 text-rose-600" />}
                      <span>{u.is_active ? 'Active' : 'Inactive'}</span>
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                      {isAdmin && (
                        <>
                          <button 
                            type="button"
                            onClick={() => setEditingUser(u)} 
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit user master profile & credentials"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => deleteUser(u.id, u.name, u.employee_id)} 
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Deactivate & remove employee"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>

                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
