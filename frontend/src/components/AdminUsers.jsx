import React, { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, ShieldCheck, Mail, Save, X } from 'lucide-react';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/users', { headers: { "Authorization": `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.map(u => ({...u, permissions: u.permissions ? JSON.parse(u.permissions) : []})));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveUser = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      email: fd.get('email'),
      username: fd.get('username'),
      employee_id: fd.get('employee_id'),
      role: fd.get('role'),
      permissions: fd.getAll('permissions'),
      password: fd.get('password') || undefined
    };

    try {
      const token = localStorage.getItem("authToken");
      const url = editingUser?.id ? `/api/admin/users/${editingUser.id}` : '/api/admin/users';
      const method = editingUser?.id ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchUsers();
        setEditingUser(null);
      } else {
        const errorData = await res.json();
        alert(`Error saving user: ${errorData.error}`);
      }
    } catch(e) { console.error(e); }
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: { "Authorization": `Bearer ${token}` } });
      fetchUsers();
    } catch(e) { console.error(e); }
  };

  const handleRoleChangeInline = async (user, newRole) => {
    try {
      const token = localStorage.getItem("authToken");
      const payload = {
        name: user.name,
        email: user.email,
        username: user.username,
        employee_id: user.employee_id,
        role: newRole,
        permissions: user.permissions
      };
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchUsers();
      } else {
        alert("Failed to update user role");
      }
    } catch(e) { console.error(e); }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden flex flex-col">
      <div className="border-b border-slate-100/80 bg-slate-50/50 p-3 flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
          <Users className="h-4 w-4 text-sky-600" />
          Identity & Access Management (IAM)
        </h2>
        <button
          onClick={() => setEditingUser({ name: '', email: '', username: '', employee_id: '', role: 'employee', permissions: [] })}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold text-[10px] uppercase tracking-wider rounded transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" /> New User
        </button>
      </div>

      <div className="p-0 flex-1">
        {editingUser && (
          <div className="bg-sky-50/30 p-4 border-b border-sky-100/50">
            <form onSubmit={saveUser} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative">
              <button type="button" onClick={() => setEditingUser(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              <h3 className="text-xs font-bold text-slate-800 mb-4 uppercase tracking-wider">{editingUser.id ? 'Edit User' : 'Provision New User'}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Name</label>
                  <input name="name" defaultValue={editingUser.name} required className="w-full text-xs p-2 border border-slate-200 rounded focus:border-sky-400 focus:outline-none" placeholder="e.g. Jane Doe" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email Address</label>
                  <input name="email" type="email" defaultValue={editingUser.email} required className="w-full text-xs p-2 border border-slate-200 rounded focus:border-sky-400 focus:outline-none" placeholder="jane@initech.com" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Username</label>
                  <input name="username" defaultValue={editingUser.username} required className="w-full text-xs p-2 border border-slate-200 rounded focus:border-sky-400 focus:outline-none" placeholder="e.g. jdoe" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Employee ID</label>
                  <input name="employee_id" defaultValue={editingUser.employee_id} required className="w-full text-xs p-2 border border-slate-200 rounded focus:border-sky-400 focus:outline-none" placeholder="e.g. EMP-1004" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Role / Access Level</label>
                  <select name="role" defaultValue={editingUser.role} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-sky-400 focus:outline-none bg-white">
                    <option value="employee">Employee (Uploader)</option>
                    <option value="manager">Manager / Dept Head (Approver)</option>
                    <option value="ap_exec">AP Executive (Reviewer)</option>
                    <option value="executive">Executive (Approver/Viewer)</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password {editingUser.id && "(Leave blank to keep current)"}</label>
                  <input name="password" type="password" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-sky-400 focus:outline-none" placeholder={editingUser.id ? "••••••••" : "Default: default123"} />
                </div>
                <div className="col-span-1 md:col-span-2 mt-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Micro-Permissions (RBAC Matrix)</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-3 rounded border border-slate-200 shadow-inner">
                    {[
                      {id: 'routing', label: 'Modify Flow Routing Rules'},
                      {id: 'edit_ai', label: 'Configure AI Templates'},
                      {id: 'manage_users', label: 'Identity & Access Management (IAM)'},
                      {id: 'raci', label: 'Configure Email & RACI Rules'},
                      {id: 'audit', label: 'View Compliance Audit Logs'},
                      {id: 'system', label: 'Manage Core System Settings'}
                    ].map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer hover:text-sky-700 transition-colors">
                        <input type="checkbox" name="permissions" value={p.id} defaultChecked={(editingUser.permissions || []).includes(p.id)} className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4" />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded shadow transition-colors uppercase tracking-wider">
                  <Save className="h-3.5 w-3.5" /> Save User Profile
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">User Details</th>
                <th className="px-4 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Role Level</th>
                <th className="px-4 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Date Provisioned</th>
                <th className="px-4 py-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="4" className="p-4 text-center text-xs text-slate-400">Loading directory...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="4" className="p-4 text-center text-xs text-slate-400 italic">No users found.</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-4 py-2">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 text-xs">{u.name}</span>
                      <span className="text-[9px] font-medium text-slate-500 flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" /> {u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChangeInline(u, e.target.value)}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border-0 cursor-pointer outline-none bg-transparent transition-colors ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                        u.role === 'ap_exec' ? 'bg-blue-100 text-blue-700' : 
                        u.role === 'manager' ? 'bg-amber-100 text-amber-700' : 
                        u.role === 'executive' ? 'bg-rose-100 text-rose-700' : 
                        'bg-slate-100 text-slate-600'
                      }`}
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="ap_exec">AP Exec</option>
                      <option value="executive">Executive</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 text-[9px] font-bold text-slate-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingUser(u)} className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteUser(u.id)} className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
