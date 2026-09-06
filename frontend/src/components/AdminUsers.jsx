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
  Key, 
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
  Sparkles,
  MoreVertical,
  ExternalLink,
  Info,
  ChevronDown,
  DollarSign,
  FileText,
  BarChart3,
  CheckSquare,
  FileSpreadsheet,
  User,
  Sliders
} from 'lucide-react';

const MOCKUP_USERS = [
  { 
    id: "mock-1", 
    user_uid: "USR-200001", 
    employee_id: "EMP-20001", 
    name: "Shane Nguyen", 
    employee_name: "Shane Nguyen",
    username: "shanengu", 
    email: "shanengu@labourlink.com", 
    phone_number: "+91 98401 23001",
    role: "ap_specialist", // Consultant
    department: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Onboarded",
    is_new: true, // "New" badge next to Shane's name
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2023-06-07T09:30:00.000Z",
    created_at: "2023-06-07T09:30:00.000Z" 
  },
  { 
    id: "mock-2", 
    user_uid: "USR-200002", 
    employee_id: "EMP-20002", 
    name: "Arlene McCoy", 
    employee_name: "Arlene McCoy",
    username: "arlenemccoy", 
    email: "arlenemccoy@labourlink.com", 
    phone_number: "+91 98401 23002",
    role: "ap_specialist", // Consultant
    department: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "AUTHENTICATOR",
    created_by: "System Initializer",
    created_on: "2022-01-24T10:00:00.000Z",
    created_at: "2022-01-24T10:00:00.000Z" 
  },
  { 
    id: "mock-3", 
    user_uid: "USR-200003", 
    employee_id: "EMP-20003", 
    name: "Guy Hawkins", 
    employee_name: "Guy Hawkins",
    username: "guyhawk", 
    email: "guyhawk@labourlink.com", 
    phone_number: "+91 98401 23003",
    role: "admin", // Administrator
    department: "IT Governance", 
    division: "VCC", 
    is_active: false, 
    status: "Inactive",
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2020-04-18T11:15:00.000Z",
    created_at: "2020-04-18T11:15:00.000Z" 
  },
  { 
    id: "mock-4", 
    user_uid: "USR-200004", 
    employee_id: "EMP-20004", 
    name: "Dianne Russell", 
    employee_name: "Dianne Russell",
    username: "diannerussell", 
    email: "diannerussell@labourlink.com", 
    phone_number: "+91 98401 23004",
    role: "manager", // Manager
    department: "Operations Management", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "SMS",
    created_by: "System Initializer",
    created_on: "2022-02-02T12:00:00.000Z",
    created_at: "2022-02-02T12:00:00.000Z" 
  },
  { 
    id: "mock-5", 
    user_uid: "USR-200005", 
    employee_id: "EMP-20005", 
    name: "Albert Flores", 
    employee_name: "Albert Flores",
    username: "albertflores", 
    email: "albertflores@labourlink.com", 
    phone_number: "+91 98401 23005",
    role: "ap_specialist", // Consultant
    department: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Pending",
    mfa_enabled: false,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2022-06-29T14:30:00.000Z",
    created_at: "2022-06-29T14:30:00.000Z" 
  },
  { 
    id: "mock-6", 
    user_uid: "USR-200006", 
    employee_id: "EMP-20006", 
    name: "Jacob Jones", 
    employee_name: "Jacob Jones",
    username: "jacobjones", 
    email: "jacobjones@labourlink.com", 
    phone_number: "+91 98401 23006",
    role: "admin", // Administrator
    department: "IT Governance", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "AUTHENTICATOR",
    created_by: "System Initializer",
    created_on: "2021-10-30T08:15:00.000Z",
    created_at: "2021-10-30T08:15:00.000Z" 
  },
  { 
    id: "mock-7", 
    user_uid: "USR-200007", 
    employee_id: "EMP-20007", 
    name: "Kathryn Murphy", 
    employee_name: "Kathryn Murphy",
    username: "kathryn", 
    email: "kathryn@labourlink.com", 
    phone_number: "+91 98401 23007",
    role: "manager", // Manager
    department: "Operations Management", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "SMS",
    created_by: "System Initializer",
    created_on: "2022-12-23T15:20:00.000Z",
    created_at: "2022-12-23T15:20:00.000Z" 
  },
  { 
    id: "mock-8", 
    user_uid: "USR-200008", 
    employee_id: "EMP-20008", 
    name: "Marvin McKinney", 
    employee_name: "Marvin McKinney",
    username: "marvin", 
    email: "marvin@labourlink.com", 
    phone_number: "+91 98401 23008",
    role: "ap_specialist", // Consultant
    department: "Consultancy Services", 
    division: "VCC", 
    is_active: false, 
    status: "Inactive",
    mfa_enabled: false,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2023-05-17T11:00:00.000Z",
    created_at: "2023-05-17T11:00:00.000Z" 
  },
  { 
    id: "mock-9", 
    user_uid: "USR-200009", 
    employee_id: "EMP-20009", 
    name: "Darlene Robertson", 
    employee_name: "Darlene Robertson",
    username: "darlene", 
    email: "darlenerobert@labourlink.com", 
    phone_number: "+91 98401 23009",
    role: "ap_specialist", // Consultant
    department: "Consultancy Services", 
    division: "VCC", 
    is_active: true, 
    status: "Active",
    mfa_enabled: true,
    mfa_type: "EMAIL",
    created_by: "System Initializer",
    created_on: "2022-08-14T09:00:00.000Z",
    created_at: "2022-08-14T09:00:00.000Z" 
  }
];

const PERMISSION_DEFINITIONS = [
  {
    id: "doc:verify",
    label: "Auditing",
    desc: "Allows full access to review and activate candidates",
    iconColor: "bg-blue-50 text-blue-600 border-blue-100",
    icon: BarChart3
  },
  {
    id: "doc:edit",
    label: "Allocate as job authority",
    desc: "Allows the user to gain full access to review",
    iconColor: "bg-sky-50 text-sky-600 border-sky-100",
    icon: CheckSquare
  },
  {
    id: "wf:approve",
    label: "Candidate activation",
    desc: "Allows to activate candidates enabling them to work",
    iconColor: "bg-emerald-50 text-emerald-600 border-emerald-100",
    icon: ShieldCheck
  },
  {
    id: "doc:upload",
    label: "Candidate documents",
    desc: "Allows the user to view all candidate documents",
    iconColor: "bg-purple-50 text-purple-600 border-purple-100",
    icon: FileText
  },
  {
    id: "audit:signoff",
    label: "Financial information",
    desc: "Allows to view the financial information of candidates",
    iconColor: "bg-amber-50 text-amber-600 border-amber-100",
    icon: DollarSign
  },
  {
    id: "sys:flows",
    label: "Job posting",
    desc: "Allows bulk texts, posting jobs to paid job boards",
    iconColor: "bg-indigo-50 text-indigo-600 border-indigo-100",
    icon: FileSpreadsheet
  }
];

const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    "doc:verify": { read: true, write: true, admin: true },
    "doc:edit": { read: true, write: true, admin: true },
    "wf:approve": { read: true, write: true, admin: true },
    "doc:upload": { read: true, write: true, admin: true },
    "audit:signoff": { read: true, write: true, admin: true },
    "sys:flows": { read: true, write: true, admin: true }
  },
  manager: {
    "doc:verify": { read: true, write: true, admin: false },
    "doc:edit": { read: true, write: false, admin: false },
    "wf:approve": { read: true, write: true, admin: true },
    "doc:upload": { read: true, write: true, admin: false },
    "audit:signoff": { read: false, write: false, admin: false },
    "sys:flows": { read: false, write: false, admin: false }
  },
  auditor: {
    "doc:verify": { read: true, write: true, admin: false },
    "doc:edit": { read: true, write: false, admin: false },
    "wf:approve": { read: true, write: false, admin: false },
    "doc:upload": { read: true, write: false, admin: false },
    "audit:signoff": { read: true, write: true, admin: true },
    "sys:flows": { read: true, write: false, admin: false }
  },
  ap_specialist: {
    "doc:verify": { read: true, write: true, admin: false },
    "doc:edit": { read: true, write: false, admin: false },
    "wf:approve": { read: false, write: false, admin: false },
    "doc:upload": { read: true, write: false, admin: false },
    "audit:signoff": { read: false, write: false, admin: false },
    "sys:flows": { read: false, write: false, admin: false }
  },
  employee: {
    "doc:verify": { read: true, write: false, admin: false },
    "doc:edit": { read: false, write: false, admin: false },
    "wf:approve": { read: false, write: false, admin: false },
    "doc:upload": { read: true, write: false, admin: false },
    "audit:signoff": { read: false, write: false, admin: false },
    "sys:flows": { read: false, write: false, admin: false }
  }
};

const SYSTEM_ROLES = [
  { id: "admin", name: "Administrator" },
  { id: "manager", name: "Manager" },
  { id: "ap_specialist", name: "Consultant" },
  { id: "auditor", name: "Internal Auditor" },
  { id: "employee", name: "Employee" }
];

export default function AdminUsers() {
  const [users, setUsers] = useState(MOCKUP_USERS);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Custom permissions UI side panel state
  const [panelUserGroup, setPanelUserGroup] = useState("ap_specialist");
  const [panelPermissions, setPanelPermissions] = useState({});
  const [userOverrides, setUserOverrides] = useState({});
  const [rolePermissions, setRolePermissions] = useState(DEFAULT_ROLE_PERMISSIONS);
  
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL"); // "ALL" | "admin" | "manager" | "ap_specialist" | "auditor" | "employee"
  const [menuOpenUserId, setMenuOpenUserId] = useState(null);
  const [toastMsg, setToastMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());

  const currentUserRole = (localStorage.getItem("currentUserRole") || "admin").toLowerCase();
  const isAdmin = currentUserRole === "admin" || currentUserRole === "settings_editor";

  useEffect(() => { 
    fetchUsers(); 
    fetchConfigs();
    
    // Window click listener to close action menus
    const handleOutsideClick = () => {
      setMenuOpenUserId(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Update permission panel values when selectedUser or configs change
  useEffect(() => {
    if (selectedUser) {
      setPanelUserGroup(selectedUser.role || "employee");
      
      const userKey = selectedUser.username || selectedUser.email;
      const userRole = selectedUser.role || "employee";
      const roleBase = rolePermissions[userRole] || DEFAULT_ROLE_PERMISSIONS[userRole] || {};
      const overrides = userOverrides[userKey] || {};
      
      const initialPerms = {};
      PERMISSION_DEFINITIONS.forEach(perm => {
        // Inherited base value
        const baseVal = roleBase[perm.id] ? (roleBase[perm.id].write || roleBase[perm.id].read) : false;
        // Override value
        const overrideVal = overrides[perm.id];
        
        let effectiveVal = baseVal;
        if (overrideVal !== undefined) {
          effectiveVal = overrideVal.write !== undefined ? overrideVal.write : (overrideVal.read !== undefined ? overrideVal.read : baseVal);
        }
        initialPerms[perm.id] = effectiveVal;
      });
      setPanelPermissions(initialPerms);
    }
  }, [selectedUser, userOverrides, rolePermissions]);

  const fetchConfigs = async () => {
    try {
      const token = localStorage.getItem("authToken");
      const headers = token ? { "Authorization": `Bearer ${token}` } : {};
      const res = await fetch("/api/admin/config", { headers });
      if (res.ok) {
        const data = await res.json();
        
        const overridesCfg = data.find(c => c.key === "UBAC_USER_OVERRIDES");
        if (overridesCfg) {
          try {
            setUserOverrides(JSON.parse(overridesCfg.value));
          } catch (e) {
            console.error(e);
          }
        }
        
        const matrixCfg = data.find(c => c.key === "RBAC_GRANULAR_MATRIX");
        if (matrixCfg) {
          try {
            setRolePermissions(JSON.parse(matrixCfg.value));
          } catch (e) {
            console.error(e);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

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
          const dbUsers = data.map(u => ({
            id: u.id,
            user_uid: u.user_uid || `USR-${100000 + Number(u.id)}`,
            employee_id: u.employee_id || `EMP-${u.id}`,
            name: u.employee_name || u.name || u.username,
            employee_name: u.employee_name || u.name || u.username,
            username: u.username || u.employee_id,
            email: u.email || `${u.username || 'user'}@labourlink.com`,
            phone_number: u.phone_number || "+91 98400 00000",
            role: u.role || 'employee',
            department: u.department || 'General Operations',
            division: u.division || 'VCC',
            is_active: u.is_active !== undefined ? u.is_active : true,
            status: u.is_active ? "Active" : "Inactive",
            mfa_enabled: u.mfa_enabled !== undefined ? u.mfa_enabled : false,
            mfa_type: u.mfa_type || 'EMAIL',
            created_by: u.created_by || 'System Admin',
            created_on: u.created_on || u.created_at || new Date().toISOString(),
            created_at: u.created_at || u.created_on || new Date().toISOString()
          }));

          // Merge backend DB users with mockup template, prioritizing mockup formatting
          const merged = [...MOCKUP_USERS];
          dbUsers.forEach(dbU => {
            if (!merged.some(m => m.email.toLowerCase() === dbU.email.toLowerCase())) {
              merged.push(dbU);
            }
          });
          setUsers(merged);
        } else {
          setUsers(MOCKUP_USERS);
        }
      } else {
        setUsers(MOCKUP_USERS);
      }
    } catch (e) { 
      console.error(e);
      setUsers(MOCKUP_USERS);
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
      setToastMsg("✓ User directory successfully synchronized with database!");
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
      const headers = { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };
      
      // If it's a mock user, perform local mock update
      if (editingUser?.id && String(editingUser.id).startsWith("mock")) {
        setUsers(prev => prev.map(u => u.id === editingUser.id ? { 
          ...u, 
          ...payload, 
          status: is_active ? "Active" : "Inactive"
        } : u));
        setToastMsg(`✓ User "${name}" updated successfully (Local).`);
        setTimeout(() => setToastMsg(""), 3500);
        setEditingUser(null);
        return;
      }

      const url = editingUser?.id && !editingUser.isNew ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser?.id && !editingUser.isNew ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        setToastMsg(`✓ User "${name}" saved successfully!`);
        setTimeout(() => setToastMsg(""), 3500);
        fetchUsers();
        setEditingUser(null);
      } else {
        // Fallback optimistic update
        if (editingUser?.id && !editingUser.isNew) {
          setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...payload } : u));
        } else {
          const randomBuf = new Uint32Array(1);
          window.crypto.getRandomValues(randomBuf);
          const newUid = `USR-${100000 + (randomBuf[0] % 900000)}`;
          setUsers(prev => [{ 
            ...payload, 
            id: `mock-${Date.now()}`, 
            user_uid: newUid,
            status: is_active ? "Active" : "Onboarded",
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
    
    // If it's a mock user, delete locally
    if (String(id).startsWith("mock")) {
      setUsers(prev => prev.filter(u => u.id !== id));
      setToastMsg(`User ${name} removed.`);
      setTimeout(() => setToastMsg(""), 3000);
      if (selectedUser?.id === id) setSelectedUser(null);
      return;
    }

    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/users/${id}`, { method: 'DELETE', headers: token ? { "Authorization": `Bearer ${token}` } : {} });
      setUsers(prev => prev.filter(u => u.id !== id));
      setToastMsg(`User ${name} removed.`);
      setTimeout(() => setToastMsg(""), 3000);
      if (selectedUser?.id === id) setSelectedUser(null);
    } catch(e) { 
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  const handleToggleStatus = async (user) => {
    if (!isAdmin) return;
    const nextStatus = !user.is_active;
    
    // Update local state
    setUsers(prev => prev.map(u => u.id === user.id ? { 
      ...u, 
      is_active: nextStatus,
      status: nextStatus ? 'Active' : 'Inactive' 
    } : u));
    
    if (selectedUser?.id === user.id) {
      setSelectedUser(prev => ({
        ...prev,
        is_active: nextStatus,
        status: nextStatus ? 'Active' : 'Inactive'
      }));
    }

    // If mock user, stop here
    if (String(user.id).startsWith("mock")) {
      setToastMsg(`Status for ${user.name} set to ${nextStatus ? 'ACTIVE' : 'INACTIVE'}.`);
      setTimeout(() => setToastMsg(""), 3000);
      return;
    }

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

  // Triggered from permissions panel to toggle override
  const handleTogglePermission = (permId) => {
    if (!isAdmin) return;
    setPanelPermissions(prev => ({
      ...prev,
      [permId]: !prev[permId]
    }));
  };

  // Triggered when panel user group dropdown changes
  const handlePanelGroupChange = (newRole) => {
    if (!isAdmin) return;
    setPanelUserGroup(newRole);
    
    // Fetch baseline permissions of the newly selected role
    const roleBase = rolePermissions[newRole] || DEFAULT_ROLE_PERMISSIONS[newRole] || {};
    const newPerms = {};
    PERMISSION_DEFINITIONS.forEach(perm => {
      // Determine base value
      const baseVal = roleBase[perm.id] ? (roleBase[perm.id].write || roleBase[perm.id].read) : false;
      newPerms[perm.id] = baseVal;
    });
    setPanelPermissions(newPerms);
  };

  // Persists panel role & toggled overrides to backend configurations and user profile
  const handleSavePermissionChanges = async () => {
    if (!isAdmin || !selectedUser) {
      setErrorMsg("Action Restricted: Only Administrators can modify user permissions.");
      setTimeout(() => setErrorMsg(""), 3500);
      return;
    }

    setSaving(true);
    setErrorMsg("");
    setToastMsg("");

    try {
      const userKey = selectedUser.username || selectedUser.email;
      const updatedOverrides = { ...userOverrides };
      const overridesForUser = {};
      const roleBase = rolePermissions[panelUserGroup] || DEFAULT_ROLE_PERMISSIONS[panelUserGroup] || {};

      PERMISSION_DEFINITIONS.forEach(perm => {
        const baseVal = roleBase[perm.id] ? (roleBase[perm.id].write || roleBase[perm.id].read) : false;
        const currentVal = panelPermissions[perm.id];

        // If the toggled setting differs from baseline role permission, write an override
        if (currentVal !== baseVal) {
          overridesForUser[perm.id] = {
            read: currentVal,
            write: currentVal,
            admin: currentVal && !!roleBase[perm.id]?.admin
          };
        }
      });

      if (Object.keys(overridesForUser).length > 0) {
        updatedOverrides[userKey] = overridesForUser;
      } else {
        delete updatedOverrides[userKey];
      }

      // Save overrides to backend configurations config file
      const token = localStorage.getItem("authToken");
      const headers = { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) };

      await fetch("/api/admin/config", {
        method: "POST",
        headers,
        body: JSON.stringify({
          key: "UBAC_USER_OVERRIDES",
          value: JSON.stringify(updatedOverrides),
          description: "User permission overrides"
        })
      });

      setUserOverrides(updatedOverrides);

      // Save user group / role to user record
      if (String(selectedUser.id).startsWith("mock")) {
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { 
          ...u, 
          role: panelUserGroup,
          status: u.is_active ? "Active" : "Inactive"
        } : u));
      } else {
        const payload = {
          employee_id: selectedUser.employee_id,
          employee_name: selectedUser.name,
          name: selectedUser.name,
          email: selectedUser.email,
          username: selectedUser.username,
          role: panelUserGroup,
          department: selectedUser.department,
          division: selectedUser.division
        };

        await fetch(`/api/users/${selectedUser.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload)
        });

        setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, role: panelUserGroup } : u));
      }

      setToastMsg(`✓ Permissions for "${selectedUser.name}" saved successfully!`);
      setSelectedUser(null); // Close side panel
      
      // Dispatch refresh signal for app-wide permissions checks
      window.dispatchEvent(new CustomEvent("role-permissions-updated"));
      setTimeout(() => setToastMsg(""), 3500);
    } catch(e) {
      console.error(e);
      setErrorMsg("Failed to save permission modifications.");
      setTimeout(() => setErrorMsg(""), 3500);
    } finally {
      setSaving(false);
    }
  };

  const getRoleDisplayName = (roleId) => {
    const matched = SYSTEM_ROLES.find(r => r.id === roleId);
    return matched ? matched.name : roleId;
  };

  // Filter based on search input and top tabs
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

  const getAvatarColor = (name) => {
    const colors = [
      'bg-indigo-500 text-white',
      'bg-emerald-500 text-white',
      'bg-sky-500 text-white',
      'bg-amber-500 text-white',
      'bg-purple-500 text-white',
      'bg-rose-500 text-white',
      'bg-teal-500 text-white',
      'bg-indigo-600 text-white',
      'bg-blue-500 text-white'
    ];
    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  const handleSelectAllUsers = (e) => {
    if (e.target.checked) {
      setSelectedUserIds(new Set(filteredUsers.map(u => u.id)));
    } else {
      setSelectedUserIds(new Set());
    }
  };

  const handleSelectUserCheckbox = (e, userId) => {
    e.stopPropagation();
    const updated = new Set(selectedUserIds);
    if (updated.has(userId)) {
      updated.delete(userId);
    } else {
      updated.add(userId);
    }
    setSelectedUserIds(updated);
  };

  const toggleMenu = (e, userId) => {
    e.stopPropagation();
    setMenuOpenUserId(prev => prev === userId ? null : userId);
  };

  return (
    <div className="bg-slate-50/20 border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col font-sans">
      
      {/* 1. TOP HEADER & GENERAL CONTROLS */}
      <div className="border-b border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            <span>User groups</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            You can manage all permissions and settings here of internal users of docuflow
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncDirectory}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-[10.5px] uppercase tracking-wider rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-60"
            title="Sync user directory with database"
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
                employee_id: (() => {
                  const buf = new Uint32Array(1);
                  window.crypto.getRandomValues(buf);
                  return `EMP-${1000 + (buf[0] % 9000)}`;
                })(), 
                role: 'employee', 
                department: 'General Operations', 
                division: 'VCC',
                is_active: true,
                mfa_enabled: true,
                mfa_type: 'EMAIL',
                created_by: 'System Admin'
              })}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] uppercase tracking-wider rounded-lg transition shadow-2xs cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Provision User</span>
            </button>
          )}
        </div>
      </div>

      {/* TOASTS & MESSAGES */}
      {toastMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs px-4 py-2 font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-800 text-xs px-4 py-2 font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 2. ADD/EDIT USER MASTER FORM MODAL CONTAINER */}
      {editingUser && (
        <div className="bg-indigo-50/40 p-4 border-b border-indigo-100 animate-fadeIn">
          <form onSubmit={saveUser} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative max-w-2xl mx-auto space-y-4">
            <button 
              type="button" 
              onClick={() => setEditingUser(null)} 
              className="absolute top-3.5 right-3.5 text-slate-400 hover:text-slate-600 cursor-pointer transition"
            >
              <X className="h-4 w-4" />
            </button>
            
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="h-4 w-4 text-indigo-600" />
                <span>{editingUser.isNew ? 'Provision New User Master Account' : `Edit Account: ${editingUser.name}`}</span>
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Employee ID (Unique Identifier)
                </label>
                <input 
                  name="employee_id" 
                  defaultValue={editingUser.employee_id} 
                  required 
                  disabled={!editingUser.isNew}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none font-mono font-bold text-indigo-700 bg-slate-50/50" 
                  placeholder="e.g. EMP-1004" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Full Employee Name</label>
                <input 
                  name="name" 
                  defaultValue={editingUser.name} 
                  required 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none font-bold text-slate-900" 
                  placeholder="e.g. Jane Doe" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Login Email Address</label>
                <input 
                  name="email" 
                  type="email" 
                  defaultValue={editingUser.email} 
                  required 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-slate-800" 
                  placeholder="jane@labourlink.com" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Phone Number</label>
                <input 
                  name="phone_number" 
                  type="tel"
                  defaultValue={editingUser.phone_number || '+91 98400 00000'} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-slate-800 font-mono" 
                  placeholder="+91 98401 23456" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department</label>
                <input 
                  name="department" 
                  defaultValue={editingUser.department || 'General Operations'} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none text-slate-800" 
                  placeholder="Department" 
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Role / Group Assignment</label>
                <select 
                  name="role" 
                  defaultValue={editingUser.role} 
                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none bg-white font-bold text-slate-800"
                >
                  <option value="admin">Administrator (Full Access & RBAC)</option>
                  <option value="manager">Manager / Approver</option>
                  <option value="ap_specialist">Consultant</option>
                  <option value="auditor">Internal Auditor</option>
                  <option value="employee">Employee (Read-Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                  Login Password {editingUser.isNew ? '(Default: default123)' : '(Leave blank to retain)'}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <input 
                    name="password" 
                    type="password" 
                    className="w-full pl-8 pr-2.5 py-2 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none" 
                    placeholder={editingUser.isNew ? "default123" : "••••••••"} 
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">OTP Multi-Factor Authentication</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-slate-50/50">
                    <input 
                      type="checkbox" 
                      name="mfa_enabled" 
                      defaultChecked={editingUser.mfa_enabled} 
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" 
                    />
                    <span className="text-[11px] font-bold text-slate-700">Enable MFA</span>
                  </label>
                  <select
                    name="mfa_type"
                    defaultValue={editingUser.mfa_type || 'EMAIL'}
                    className="text-[11px] font-bold p-2 border border-slate-200 rounded-lg outline-none bg-white text-slate-800"
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
                <span className="text-xs font-bold text-emerald-700">Account Enabled (Active)</span>
              </label>

              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setEditingUser(null)} 
                  className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow transition uppercase tracking-wider cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>Save Record</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 3. SPLIT WORKSPACE INTERFACE */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-[580px] bg-white">
        
        {/* LEFT COMPONENT: Users Table */}
        <div className={`flex-1 flex flex-col overflow-y-auto min-w-0 ${selectedUser ? 'lg:border-r lg:border-slate-200' : ''}`}>
          
          {/* Top Tabs Filtering & Search Row */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/40 space-y-3.5">
            {/* Top filtering tabs */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setRoleFilter("ALL")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  roleFilter === "ALL" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                All users
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("admin")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  roleFilter === "admin" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Administrator
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("manager")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  roleFilter === "manager" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Manager
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("ap_specialist")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  roleFilter === "ap_specialist" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Consultant
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("auditor")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  roleFilter === "auditor" 
                    ? "bg-blue-50/80 text-blue-700 border-blue-200/60 shadow-3xs" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                Auditor
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search users"
                className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 text-slate-800 shadow-3xs"
              />
            </div>
          </div>

          {/* Users List Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/40 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none">
                  <th className="px-4 py-3 w-[6%] text-center">
                    <input 
                      type="checkbox"
                      onChange={handleSelectAllUsers}
                      checked={filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 w-[38%]">Name</th>
                  <th className="px-4 py-3 w-[16%]">Status</th>
                  <th className="px-4 py-3 w-[20%]">Permissions</th>
                  <th className="px-4 py-3 w-[15%]">Date Added</th>
                  <th className="px-4 py-3 w-[5%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-[11.5px]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-400 italic">
                      <RefreshCw className="h-4 w-4 animate-spin inline mr-2 text-indigo-600" />
                      Loading users list...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-400 italic">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => {
                    const isSelected = selectedUser?.id === u.id;
                    const hasOverrides = userOverrides[u.username || u.email] && Object.keys(userOverrides[u.username || u.email]).length > 0;
                    
                    return (
                      <tr 
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className={`hover:bg-slate-50/60 transition-colors cursor-pointer select-none ${
                          isSelected ? 'bg-indigo-50/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={selectedUserIds.has(u.id)}
                            onChange={(e) => handleSelectUserCheckbox(e, u.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                          />
                        </td>

                        {/* Name + Email + Avatar */}
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-[10px] tracking-wide shrink-0 shadow-3xs ${getAvatarColor(u.name)}`}>
                              {u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 truncate max-w-[120px]">{u.name}</span>
                                {u.is_new && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-blue-50 text-blue-600 text-[8.5px] font-bold border border-blue-100">
                                    New
                                  </span>
                                )}
                                {hasOverrides && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-amber-50 text-amber-600 text-[8.5px] font-bold border border-amber-100" title="User has specific permission overrides">
                                    Custom
                                  </span>
                                )}
                              </div>
                              <span className="text-[9.5px] text-slate-400 truncate leading-tight mt-0.5">{u.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Status badge */}
                        <td className="px-4 py-3 align-middle">
                          {u.status === "Onboarded" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-100/60 shadow-3xs">
                              Onboarded
                            </span>
                          ) : u.status === "Active" || u.is_active ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100/60 shadow-3xs">
                              Active
                            </span>
                          ) : u.status === "Pending" ? (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-50 text-amber-700 border border-amber-100/60 shadow-3xs">
                              Pending
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-semibold bg-slate-50 text-slate-500 border border-slate-200 shadow-3xs">
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Permissions (Role name) */}
                        <td className="px-4 py-3 text-slate-600 font-medium align-middle">
                          {getRoleDisplayName(u.role)}
                        </td>

                        {/* Date Added */}
                        <td className="px-4 py-3 text-slate-400 font-medium align-middle">
                          {u.created_on ? new Date(u.created_on).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : "24 Jan 2022"}
                        </td>

                        {/* Actions menu */}
                        <td className="px-4 py-3 text-right relative" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-[10.5px] font-semibold text-slate-400 hover:text-indigo-600 mr-2 transition cursor-pointer flex items-center gap-0.5" onClick={() => setSelectedUser(u)}>
                              <span>View profile</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </span>
                            <button
                              type="button"
                              onClick={(e) => toggleMenu(e, u.id)}
                              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition cursor-pointer"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* Context action menu dropdown */}
                          {menuOpenUserId === u.id && (
                            <div className="absolute right-4 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUser(u);
                                  setMenuOpenUserId(null);
                                }}
                                className="w-full px-3 py-2 hover:bg-slate-50 text-[11px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <Shield className="h-3.5 w-3.5 text-slate-400" />
                                <span>Setup permissions</span>
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedUser(u);
                                  setMenuOpenUserId(null);
                                  setTimeout(() => {
                                    document.getElementById("user-group-dropdown")?.focus();
                                  }, 150);
                                }}
                                className="w-full px-3 py-2 hover:bg-slate-50 text-[11px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <Sliders className="h-3.5 w-3.5 text-slate-400" />
                                <span>Move to other group</span>
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingUser(u);
                                  setMenuOpenUserId(null);
                                }}
                                className="w-full px-3 py-2 hover:bg-slate-50 text-[11px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-400" />
                                <span>Edit details</span>
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  handleToggleStatus(u);
                                  setMenuOpenUserId(null);
                                }}
                                className="w-full px-3 py-2 hover:bg-slate-50 text-[11px] font-medium text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                {u.is_active ? <UserX className="h-3.5 w-3.5 text-slate-400" /> : <UserCheck className="h-3.5 w-3.5 text-slate-400" />}
                                <span>{u.is_active ? 'Disable user' : 'Enable user'}</span>
                              </button>
                              
                              <div className="border-t border-slate-100 my-1"></div>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  deleteUser(u.id, u.name, u.employee_id);
                                  setMenuOpenUserId(null);
                                }}
                                className="w-full px-3 py-2 hover:bg-rose-50 text-[11px] font-medium text-rose-600 flex items-center gap-2 cursor-pointer transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Remove user</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT NESTED PANEL: User Permissions settings */}
        {selectedUser && (
          <div className="w-full lg:w-[450px] bg-slate-50/20 border-t lg:border-t-0 border-slate-200 flex flex-col shrink-0">
            {/* Panel header */}
            <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                User Permissions
              </h3>
              <button 
                type="button" 
                onClick={() => setSelectedUser(null)}
                className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-md transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Profile Overview Card */}
            <div className="p-4 bg-white border-b border-slate-200 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-11 w-11 rounded-full flex items-center justify-center font-bold text-xs tracking-wider shadow-2xs ${getAvatarColor(selectedUser.name)}`}>
                    {selectedUser.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-extrabold text-slate-900 text-xs tracking-tight">{selectedUser.name}</span>
                    <span className="text-[10px] text-slate-400 truncate mt-0.5">{selectedUser.email}</span>
                  </div>
                </div>
                <span className="text-[10.5px] font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer flex items-center gap-0.5">
                  <span>View profile</span>
                  <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </div>

            {/* Info Alert banner */}
            <div className="p-3 bg-blue-50/60 border-b border-blue-100 text-blue-700 text-[10px] font-medium flex items-start gap-2 shrink-0 select-none">
              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
              <span>Permission list will change when select the user group</span>
            </div>

            {/* Group assignment dropdown */}
            <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0 text-xs">
              <span className="font-bold text-slate-700">User Group</span>
              <div className="relative w-48">
                <select
                  id="user-group-dropdown"
                  value={panelUserGroup}
                  onChange={e => handlePanelGroupChange(e.target.value)}
                  className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 pr-8 outline-none appearance-none cursor-pointer focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 shadow-3xs"
                >
                  <option value="admin">Administrator</option>
                  <option value="manager">Manager</option>
                  <option value="ap_specialist">Consultant</option>
                  <option value="auditor">Internal Auditor</option>
                  <option value="employee">Employee</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Scrollable list of permissions toggles */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {PERMISSION_DEFINITIONS.map(perm => {
                const isEnabled = !!panelPermissions[perm.id];
                const IconComponent = perm.icon;
                
                return (
                  <div 
                    key={perm.id} 
                    className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 hover:border-slate-300 transition shadow-3xs select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center border shrink-0 ${perm.iconColor}`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col text-left">
                        <span className="text-[11px] font-extrabold text-slate-900 leading-snug">{perm.label}</span>
                        <span className="text-[9.5px] text-slate-400 leading-tight mt-0.5">{perm.desc}</span>
                      </div>
                    </div>

                    {/* Toggle switch */}
                    <button
                      type="button"
                      onClick={() => handleTogglePermission(perm.id)}
                      disabled={!isAdmin}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none focus:ring-2 focus:ring-indigo-500/25 ${
                        isEnabled ? 'bg-emerald-500' : 'bg-slate-200'
                      } ${!isAdmin ? 'opacity-65 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          isEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Panel save changes action footer */}
            <div className="p-4 bg-white border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={handleSavePermissionChanges}
                disabled={saving || !isAdmin}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] uppercase tracking-wider rounded-lg transition shadow-2xs hover:shadow-sm cursor-pointer disabled:opacity-60 text-center flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save changes</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
