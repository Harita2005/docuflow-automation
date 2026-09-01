import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Server,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  Sliders,
  Power,
  ArrowRight,
  Globe,
  X
} from 'lucide-react';
import { ThirdPartyApplication } from '../../types/dapiSyncBack';

interface ApplicationsTabProps {
  apps: ThirdPartyApplication[];
  onAddApp: (app: Partial<ThirdPartyApplication>) => void;
  onUpdateApp: (app: ThirdPartyApplication) => void;
  onDeleteApp: (appId: string) => void;
  onConfigureSync: (appId: string) => void;
  onTestConnection: (app: ThirdPartyApplication) => void;
}

export default function ApplicationsTab({
  apps,
  onAddApp,
  onUpdateApp,
  onDeleteApp,
  onConfigureSync
}: ApplicationsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<ThirdPartyApplication | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    documentTypes: ['Purchase Order'],
    status: 'Active' as 'Active' | 'Inactive',
    syncStatus: 'Enabled' as 'Enabled' | 'Disabled',
    approvalEndpoint: 'https://api.example.com/approval',
    rejectionEndpoint: 'https://api.example.com/rejection',
    environment: 'Production' as 'Production' | 'Staging'
  });

  const filteredApps = apps.filter(app => {
    return (
      app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (app.description && app.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const handleOpenAddModal = () => {
    setEditingApp(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      documentTypes: ['Purchase Order'],
      status: 'Active',
      syncStatus: 'Enabled',
      approvalEndpoint: 'https://api.example.com/approval',
      rejectionEndpoint: 'https://api.example.com/rejection',
      environment: 'Production'
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (app: ThirdPartyApplication) => {
    setEditingApp(app);
    setFormData({
      name: app.name,
      code: app.code,
      description: app.description || '',
      documentTypes: app.documentTypes || ['Purchase Order'],
      status: app.status,
      syncStatus: app.syncStatus,
      approvalEndpoint: app.approvalEndpoint,
      rejectionEndpoint: app.rejectionEndpoint,
      environment: (app.environment as 'Production' | 'Staging') || 'Production'
    });
    setIsModalOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) return;

    if (editingApp) {
      onUpdateApp({ ...editingApp, ...formData });
    } else {
      onAddApp({ ...formData, id: `app-${Date.now()}`, lastSync: 'Never', rulesCount: 0 });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-3 font-sans text-xs">
      {/* Search & Add Action Bar */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2.5">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search target applications..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 focus:outline-hidden h-7"
          />
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition shadow-2xs flex items-center gap-1 cursor-pointer active:scale-98 h-7"
        >
          <Plus className="h-3 w-3" /> Add Target Application
        </button>
      </div>

      {/* Sleek Enterprise Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[8.5px] font-black text-slate-400 uppercase tracking-wider">
              <th className="py-1.5 px-3">Application</th>
              <th className="py-1.5 px-3">Configured API Endpoints</th>
              <th className="py-1.5 px-3">Sync Status</th>
              <th className="py-1.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[10px]">
            {filteredApps.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-slate-400 font-bold text-[10px]">
                  No target applications found.
                </td>
              </tr>
            ) : (
              filteredApps.map(app => (
                <tr key={app.id} className="hover:bg-slate-50/60 transition">
                  {/* Column 1: Application Name, Code & Status */}
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 bg-slate-100 text-slate-700 rounded-md flex items-center justify-center font-bold shrink-0 border border-slate-200">
                        <Server className="h-3 w-3" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-slate-900 text-[10px]">{app.name}</span>
                          <span className="px-1 py-0.2 bg-slate-100 border border-slate-200 rounded text-[8.5px] font-mono font-semibold text-slate-600">
                            {app.code}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[8.5px] font-bold ${
                            app.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${app.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            {app.status}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-medium">
                          {app.documentTypes.join(', ')} • Last Sync: {app.lastSync || 'Recent'}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Column 2: Clean Endpoints Badge Summary */}
                  <td className="py-2 px-3 text-[9px]">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-slate-50 border border-slate-200 rounded font-mono font-medium text-slate-700">
                      <Globe className="h-2.5 w-2.5 text-blue-600" />
                      2 Active Endpoints Configured
                    </span>
                  </td>

                  {/* Column 3: Sync Status Toggle Button */}
                  <td className="py-2 px-3">
                    <button
                      onClick={() => onUpdateApp({ ...app, syncStatus: app.syncStatus === 'Enabled' ? 'Disabled' : 'Enabled' })}
                      className={`px-1.5 py-0.2 rounded text-[8.5px] font-bold tracking-wide uppercase transition cursor-pointer flex items-center gap-1 ${
                        app.syncStatus === 'Enabled'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      <Power className="h-2 w-2" />
                      {app.syncStatus === 'Enabled' ? 'SYNC ENABLED' : 'DISABLED'}
                    </button>
                  </td>

                  {/* Column 4: Primary Action Button */}
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onConfigureSync(app.id)}
                        className="px-2 py-0.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded text-[9px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        Configure Endpoints <ArrowRight className="h-2.5 w-2.5 text-blue-600" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(app)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer ml-0.5"
                        title="Edit App Details"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => onDeleteApp(app.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                        title="Delete App"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Perfectly Centered Enterprise Middle Popup Modal (Portal) */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-5 space-y-4 font-sans relative">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold">
                  <Server className="h-4 w-4" />
                </div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                  {editingApp ? 'Edit Application Details' : 'Add Third-Party Application'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitForm} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Application Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. ERP System"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Application Code</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. ERP_001"
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Approved Callback URL</label>
                <input
                  type="url"
                  value={formData.approvalEndpoint}
                  onChange={(e) => setFormData({ ...formData, approvalEndpoint: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Rejected Callback URL</label>
                <input
                  type="url"
                  value={formData.rejectionEndpoint}
                  onChange={(e) => setFormData({ ...formData, rejectionEndpoint: e.target.value })}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black text-xs transition shadow-md shadow-blue-500/20 cursor-pointer active:scale-98"
                >
                  Save Application
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
