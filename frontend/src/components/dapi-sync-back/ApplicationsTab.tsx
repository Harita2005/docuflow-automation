import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Server,
  Plus,
  Search,
  Edit,
  Trash2,
  Power,
  ArrowRight,
  Globe,
  X,
  Key,
  Shield,
  Layers,
  PlusCircle
} from 'lucide-react';
import { ThirdPartyApplication, ConditionalEndpointRule, AuthType } from '../../types/dapiSyncBack';

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
  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'AUTH' | 'ENDPOINTS' | 'CONDITIONAL'>('IDENTITY');

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
    environment: 'Production' as 'Production' | 'Staging',
    // Authentication & Token API (Endpoint 1)
    authType: 'OAuth 2.0' as AuthType,
    tokenUrl: 'https://api.example.com/oauth/token',
    oauthClientId: '',
    oauthClientSecret: '',
    apiKeyHeader: 'X-API-Key',
    apiKeyValue: '',
    bearerToken: '',
    // Conditional Endpoint Rules
    conditionalRules: [] as ConditionalEndpointRule[]
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
      environment: 'Production',
      authType: 'OAuth 2.0',
      tokenUrl: 'https://api.example.com/oauth/token',
      oauthClientId: '',
      oauthClientSecret: '',
      apiKeyHeader: 'X-API-Key',
      apiKeyValue: '',
      bearerToken: '',
      conditionalRules: []
    });
    setActiveTab('IDENTITY');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (app: ThirdPartyApplication, initialTab: 'IDENTITY' | 'AUTH' | 'ENDPOINTS' | 'CONDITIONAL' = 'IDENTITY') => {
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
      environment: (app.environment as 'Production' | 'Staging') || 'Production',
      authType: app.authType || 'OAuth 2.0',
      tokenUrl: app.tokenUrl || 'https://api.example.com/oauth/token',
      oauthClientId: app.oauthClientId || '',
      oauthClientSecret: app.oauthClientSecret || '',
      apiKeyHeader: app.apiKeyHeader || 'X-API-Key',
      apiKeyValue: app.apiKeyValue || '',
      bearerToken: app.bearerToken || '',
      conditionalRules: app.conditionalRules || []
    });
    setActiveTab(initialTab);
    setIsModalOpen(true);
  };

  const handleAddConditionalRule = () => {
    const newRule: ConditionalEndpointRule = {
      id: `rule-${Date.now()}`,
      field: 'company',
      operator: 'Equals',
      value: 'VCC',
      decision: 'APPROVED',
      targetEndpoint: 'https://assets-api.example.com/approval'
    };
    setFormData({ ...formData, conditionalRules: [...formData.conditionalRules, newRule] });
  };

  const handleRemoveConditionalRule = (id: string) => {
    setFormData({
      ...formData,
      conditionalRules: formData.conditionalRules.filter(r => r.id !== id)
    });
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.code) return;

    if (editingApp) {
      onUpdateApp({ ...editingApp, ...formData });
    } else {
      onAddApp({ ...formData, id: `app-${Date.now()}`, lastSync: 'Never', rulesCount: formData.conditionalRules.length });
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
              <th className="py-1.5 px-3">Application & Auth</th>
              <th className="py-1.5 px-3">Endpoints & Rules</th>
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
                          <span className="px-1 py-0.2 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[8.5px] font-bold">
                            {app.authType || 'OAuth 2.0'}
                          </span>
                        </div>
                        <p className="text-[9px] text-slate-400 font-medium">
                          Token API: {app.tokenUrl ? app.tokenUrl.substring(0, 30) + '...' : 'Configured'}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Column 2: Endpoints & Rules Summary */}
                  <td className="py-2 px-3 text-[9px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-1 text-slate-700 font-mono font-bold">
                        <Globe className="h-2.5 w-2.5 text-blue-600 shrink-0" />
                        Approved: {app.approvalEndpoint.substring(0, 32)}...
                      </span>
                      {app.conditionalRules && app.conditionalRules.length > 0 && (
                        <span className="text-emerald-700 font-bold text-[8.5px] flex items-center gap-1">
                          <Layers className="h-2.5 w-2.5 text-emerald-600" />
                          {app.conditionalRules.length} Conditional Endpoint Rules Active
                        </span>
                      )}
                    </div>
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

                  {/* Column 4: Actions */}
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onConfigureSync(app.id)}
                        className="px-2 py-0.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded text-[9px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        Endpoints & Rules <ArrowRight className="h-2.5 w-2.5 text-blue-600" />
                      </button>
                      <button
                        onClick={() => onConfigureSync(app.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer ml-0.5"
                        title="Edit App Endpoints & Rules"
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

      {/* Restructured Unified Application Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl p-5 space-y-4 font-sans relative">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold">
                  <Server className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
                    {editingApp ? 'Edit Application & Endpoints' : 'Add Third-Party Application'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">Configure Token API (Endpoint 1), Callbacks (Endpoint 2), and Conditional Rules</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Sub-Tabs Navigation */}
            <div className="flex border-b border-slate-100 gap-1 bg-slate-50 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('IDENTITY')}
                className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] transition cursor-pointer ${
                  activeTab === 'IDENTITY' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                1. Identity
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('AUTH')}
                className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] transition cursor-pointer flex items-center justify-center gap-1 ${
                  activeTab === 'AUTH' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Key className="h-3 w-3 text-amber-500" />
                2. Token API (Endpoint 1)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ENDPOINTS')}
                className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] transition cursor-pointer flex items-center justify-center gap-1 ${
                  activeTab === 'ENDPOINTS' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Globe className="h-3 w-3 text-blue-500" />
                3. Callbacks (Endpoint 2)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('CONDITIONAL')}
                className={`flex-1 py-1.5 rounded-lg font-bold text-[10px] transition cursor-pointer flex items-center justify-center gap-1 ${
                  activeTab === 'CONDITIONAL' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Layers className="h-3 w-3 text-emerald-500" />
                4. Conditional Rules ({formData.conditionalRules.length})
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmitForm} className="space-y-4">
              
              {/* TAB 1: IDENTITY */}
              {activeTab === 'IDENTITY' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Application Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. SAP ERP Payment Gateway"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Application Code *</label>
                      <input
                        type="text"
                        required
                        value={formData.code}
                        onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                        placeholder="e.g. SAP_001"
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Environment</label>
                      <select
                        value={formData.environment}
                        onChange={(e) => setFormData({ ...formData, environment: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Production">Production</option>
                        <option value="Staging">Staging / Testing</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Status</label>
                      <select
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enterprise payment integration endpoint for vendor disbursement..."
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: AUTHENTICATION & TOKEN API (ENDPOINT 1) */}
              {activeTab === 'AUTH' && (
                <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Shield className="h-4 w-4 text-amber-600" />
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase">Authentication & Token Generation (Endpoint 1)</h4>
                      <p className="text-[9.5px] text-slate-400">Configure how Docuflow authenticates or fetches access tokens from the 3rd party</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Authentication Method</label>
                    <select
                      value={formData.authType}
                      onChange={(e) => setFormData({ ...formData, authType: e.target.value as AuthType })}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="OAuth 2.0">OAuth 2.0 (Client Credentials - 2 Step Handshake)</option>
                      <option value="API Key">Static API Key Header</option>
                      <option value="Bearer Token">Static Bearer Token</option>
                      <option value="Basic Authentication">Basic Auth (Username / Password)</option>
                      <option value="None">None (Public / IP Whitelisted)</option>
                    </select>
                  </div>

                  {formData.authType === 'OAuth 2.0' && (
                    <div className="space-y-2.5 pt-1">
                      <div>
                        <label className="block text-[9.5px] font-extrabold text-blue-800 uppercase mb-0.5">
                          Token Generation Endpoint URL (Endpoint 1) *
                        </label>
                        <input
                          type="url"
                          required
                          value={formData.tokenUrl}
                          onChange={(e) => setFormData({ ...formData, tokenUrl: e.target.value })}
                          placeholder="https://api.example.com/v1/auth/token"
                          className="w-full px-3 py-1.5 bg-white border border-blue-200 rounded-lg font-mono text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-[9px] text-slate-400 mt-0.5">Docuflow sends credentials here to issue a fresh access_token before posting data</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[9.5px] font-bold text-slate-600 uppercase mb-0.5">Client ID</label>
                          <input
                            type="text"
                            value={formData.oauthClientId}
                            onChange={(e) => setFormData({ ...formData, oauthClientId: e.target.value })}
                            placeholder="Client ID..."
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-900 text-xs focus:outline-hidden"
                          />
                        </div>

                        <div>
                          <label className="block text-[9.5px] font-bold text-slate-600 uppercase mb-0.5">Client Secret</label>
                          <input
                            type="password"
                            value={formData.oauthClientSecret}
                            onChange={(e) => setFormData({ ...formData, oauthClientSecret: e.target.value })}
                            placeholder="Client Secret..."
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-slate-900 text-xs focus:outline-hidden"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.authType === 'API Key' && (
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[9.5px] font-bold text-slate-600 uppercase mb-0.5">Header Name</label>
                        <input
                          type="text"
                          value={formData.apiKeyHeader}
                          onChange={(e) => setFormData({ ...formData, apiKeyHeader: e.target.value })}
                          placeholder="X-API-Key"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[9.5px] font-bold text-slate-600 uppercase mb-0.5">API Secret Key</label>
                        <input
                          type="password"
                          value={formData.apiKeyValue}
                          onChange={(e) => setFormData({ ...formData, apiKeyValue: e.target.value })}
                          placeholder="Paste API Secret Key..."
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {formData.authType === 'Bearer Token' && (
                    <div className="pt-1">
                      <label className="block text-[9.5px] font-bold text-slate-600 uppercase mb-0.5">Bearer Token Secret</label>
                      <input
                        type="password"
                        value={formData.bearerToken}
                        onChange={(e) => setFormData({ ...formData, bearerToken: e.target.value })}
                        placeholder="Bearer token string..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CALL BACKS (ENDPOINT 2) */}
              {activeTab === 'ENDPOINTS' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Approved Callback URL (Endpoint 2) *</label>
                    <input
                      type="url"
                      required
                      value={formData.approvalEndpoint}
                      onChange={(e) => setFormData({ ...formData, approvalEndpoint: e.target.value })}
                      placeholder="https://api.example.com/approval"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[9px] text-slate-400 mt-0.5">Primary URL where final approved document JSON payload is transmitted</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Rejected Callback URL (Endpoint 2) *</label>
                    <input
                      type="url"
                      required
                      value={formData.rejectionEndpoint}
                      onChange={(e) => setFormData({ ...formData, rejectionEndpoint: e.target.value })}
                      placeholder="https://api.example.com/rejection"
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 text-xs focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-[9px] text-slate-400 mt-0.5">Primary URL where rejected/voided document payload is transmitted</p>
                  </div>
                </div>
              )}

              {/* TAB 4: CONDITIONAL ENDPOINT RULES */}
              {activeTab === 'CONDITIONAL' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-slate-900 uppercase">Multiple Conditional Endpoint Rules</h4>
                      <p className="text-[9.5px] text-slate-400">Override destination endpoints based on document conditions (Division, Category, Amount)</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddConditionalRule}
                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <PlusCircle className="h-3 w-3" /> Add Rule
                    </button>
                  </div>

                  {formData.conditionalRules.length === 0 ? (
                    <div className="p-4 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-[10.5px]">
                      No conditional rules added. Default Approved and Rejected Callback URLs will be used for all documents.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {formData.conditionalRules.map((rule, idx) => (
                        <div key={rule.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-[10px]">
                          <div className="flex items-center justify-between font-bold text-slate-600">
                            <span>Rule #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveConditionalRule(rule.id)}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={rule.field}
                              onChange={(e) => {
                                const updated = [...formData.conditionalRules];
                                updated[idx].field = e.target.value;
                                setFormData({ ...formData, conditionalRules: updated });
                              }}
                              className="px-2 py-1 bg-white border border-slate-200 rounded font-bold"
                            >
                              <option value="company">Division / Company</option>
                              <option value="category">Category</option>
                              <option value="branch">Branch / Plant</option>
                              <option value="amount">Amount</option>
                            </select>

                            <select
                              value={rule.operator}
                              onChange={(e) => {
                                const updated = [...formData.conditionalRules];
                                updated[idx].operator = e.target.value;
                                setFormData({ ...formData, conditionalRules: updated });
                              }}
                              className="px-2 py-1 bg-white border border-slate-200 rounded font-semibold"
                            >
                              <option value="Equals">Equals</option>
                              <option value="Not Equals">Not Equals</option>
                              <option value="Greater Than">Greater Than</option>
                            </select>

                            <input
                              type="text"
                              placeholder="Value (e.g. CAPEX)"
                              value={rule.value}
                              onChange={(e) => {
                                const updated = [...formData.conditionalRules];
                                updated[idx].value = e.target.value;
                                setFormData({ ...formData, conditionalRules: updated });
                              }}
                              className="px-2 py-1 bg-white border border-slate-200 rounded font-medium"
                            />
                          </div>

                          <div>
                            <input
                              type="url"
                              placeholder="Target Endpoint URL (e.g. https://capex-api.com/approval)"
                              value={rule.targetEndpoint}
                              onChange={(e) => {
                                const updated = [...formData.conditionalRules];
                                updated[idx].targetEndpoint = e.target.value;
                                setFormData({ ...formData, conditionalRules: updated });
                              }}
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono text-[9.5px]"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Modal Action Buttons */}
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
                  Save Application Configuration
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
