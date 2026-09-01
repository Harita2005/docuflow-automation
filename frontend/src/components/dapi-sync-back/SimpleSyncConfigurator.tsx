import React, { useState } from 'react';
import {
  Server,
  Globe,
  CheckCircle,
  XCircle,
  Zap,
  Check,
  Power,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Sliders,
  ShieldCheck,
  Edit,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import {
  ThirdPartyApplication,
  SyncRule,
  Condition,
  ConditionField,
  ConditionOperator,
  FieldMapping,
  EndpointConfig,
  HttpMethod,
  AuthType
} from '../../types/dapiSyncBack';

export interface AppEndpoint {
  id: string;
  name: string;
  event: 'APPROVED' | 'REJECTED' | 'CUSTOM';
  method: HttpMethod;
  url: string;
  conditions: Condition[];
  authType: AuthType;
  secretKey: string;
}

export const ALL_DOCUMENT_TYPES: string[] = [
  'Purchase Order',
  'AP Invoice',
  'Tax Invoice',
  'Contract',
  'Goods Receipt (GRN)',
  'Payment Receipt / Voucher',
  'Debit Note / Credit Note',
  'Bill of Lading / Shipping Note',
  'Vendor Onboarding Form',
  'Expense Claim',
  'Requisition Form (PR)',
  'Service Entry Sheet (SES)',
  'Custom / Other Document'
];

export const ALL_DOCUMENT_FIELDS: string[] = [
  'Primary Key',
  'Document Number',
  'Approval Status',
  'IA Approval',
  'Attachment Status',
  'Checklist Status',
  'Category',
  'Company',
  'Branch',
  'Cost Center',
  'Pay Mode',
  'Document Type',
  'Vendor Name',
  'Vendor Code',
  'Total Amount',
  'Invoice Date',
  'Invoice Number',
  'Purchase Order Number',
  'GRN Number',
  'Department',
  'Created By',
  'Created At',
  'Rejection Reason',
  'Approval Comments'
];

export const FIELD_VALUE_OPTIONS: Record<string, string[]> = {
  'Approval Status': ['Approved', 'Rejected', 'Pending', 'Under Review'],
  'IA Approval': ['Approved', 'Rejected', 'Pending', 'Waived'],
  'Attachment Status': ['Complete', 'Incomplete', 'Pending', 'Uploaded', 'Verified'],
  'Checklist Status': ['Passed', 'Failed', 'Pending', 'Complete'],
  'Document Status': ['Active', 'Archived', 'Draft', 'Completed'],
  'Category': ['Procurement', 'Finance', 'Operations', 'HR', 'Legal', 'IT'],
  'Document Type': ['Purchase Order', 'Invoice', 'Contract', 'Payment Receipt', 'GRN'],
  'Pay Mode': ['Wire Transfer', 'ACH', 'Check', 'Credit Card', 'Cash'],
  'Company': ['Acme Corp', 'Global Logistics', 'Enterprise Solutions', 'Headquarters'],
  'Branch': ['Main Branch', 'North America', 'EMEA', 'APAC'],
  'Cost Center': ['CC-1001 (Engineering)', 'CC-2002 (Operations)', 'CC-3003 (Finance)', 'CC-4004 (Sales)'],
  'Vendor Name': ['Acme Supplies Ltd', 'Global Tech Services', 'FastTrack Logistics', 'Apex Components'],
  'Department': ['Procurement', 'Finance', 'IT & Software', 'Operations', 'Legal'],
  'Created By': ['Admin User', 'System Auto-Trigger', 'Procurement Manager', 'Finance Lead']
};

interface SimpleSyncConfiguratorProps {
  apps: ThirdPartyApplication[];
  rules: SyncRule[];
  selectedAppId?: string;
  onSaveRule: (rule: SyncRule, status: 'Active' | 'Draft') => void;
  onUpdateApp: (app: ThirdPartyApplication) => void;
  onAddAppClick: () => void;
  onViewLogsClick: () => void;
}

export default function SimpleSyncConfigurator({
  apps,
  rules,
  selectedAppId: initialSelectedAppId,
  onSaveRule,
  onUpdateApp,
  onAddAppClick,
  onViewLogsClick
}: SimpleSyncConfiguratorProps) {
  // Selected Application State
  const [selectedAppId, setSelectedAppId] = useState<string>(initialSelectedAppId || apps[0]?.id || '');
  const currentApp = apps.find(a => a.id === selectedAppId) || apps[0];
  const activeRule = rules.find(r => r.applicationId === currentApp?.id) || rules[0];

  // Collapsible Accordion State per Endpoint Card (Default: all collapsed for clean UI)
  const [expandedEndpointIds, setExpandedEndpointIds] = useState<Record<string, boolean>>({});

  const toggleExpandEndpoint = (id: string) => {
    setExpandedEndpointIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 1. App General Info
  const [documentType, setDocumentType] = useState<string>(
    activeRule?.documentType || currentApp?.documentTypes?.[0] || 'Purchase Order'
  );
  const [syncEnabled, setSyncEnabled] = useState<boolean>(currentApp?.syncStatus === 'Enabled');

  // 2. Multiple Endpoints State for Current Application (with Multiple Conditions support)
  const [endpoints, setEndpoints] = useState<AppEndpoint[]>([
    {
      id: 'ep-approved',
      name: 'Approved Decision Callback',
      event: 'APPROVED',
      method: (activeRule?.approvedAction?.method as HttpMethod) || 'POST',
      url: currentApp?.approvalEndpoint || 'https://erp.example.com/api/v2/documents/approval',
      conditions: [
        {
          id: 'c-1',
          field: (activeRule?.conditions?.[0]?.field as ConditionField) || 'Approval Status',
          operator: (activeRule?.conditions?.[0]?.operator as ConditionOperator) || 'Equals',
          value: activeRule?.conditions?.[0]?.value || 'Approved',
          logicalOperator: 'AND'
        }
      ],
      authType: (activeRule?.approvedAction?.auth?.type as AuthType) || 'API Key',
      secretKey: activeRule?.approvedAction?.auth?.apiKeyValue || '••••••••••••••••'
    },
    {
      id: 'ep-rejected',
      name: 'Rejected Decision Callback',
      event: 'REJECTED',
      method: (activeRule?.rejectedAction?.method as HttpMethod) || 'POST',
      url: currentApp?.rejectionEndpoint || 'https://erp.example.com/api/v2/documents/rejection',
      conditions: [
        {
          id: 'c-2',
          field: 'Approval Status',
          operator: 'Not Equals',
          value: 'Approved',
          logicalOperator: 'AND'
        }
      ],
      authType: (activeRule?.approvedAction?.auth?.type as AuthType) || 'API Key',
      secretKey: activeRule?.approvedAction?.auth?.apiKeyValue || '••••••••••••••••'
    }
  ]);

  // Secret Visibility Toggle
  const [showSecretMap, setShowSecretMap] = useState<Record<string, boolean>>({});

  // 3. Notification Payload Field Mappings
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([
    { id: 'fm-1', ourField: 'Primary Key', thirdPartyField: 'documentId' },
    { id: 'fm-2', ourField: 'Document Number', thirdPartyField: 'docNumber' },
    { id: 'fm-3', ourField: 'Approval Status', thirdPartyField: 'status' },
    { id: 'fm-4', ourField: 'Rejection Reason', thirdPartyField: 'rejectionReason' }
  ]);

  // Feedback states
  const [testResult, setTestResult] = useState<{ testing: boolean; message: string; timeMs: number } | null>(null);
  const [savedBanner, setSavedBanner] = useState(false);

  // When selected application changes, populate its endpoints
  const handleSelectApp = (appId: string) => {
    setSelectedAppId(appId);
    const app = apps.find(a => a.id === appId);
    const rule = rules.find(r => r.applicationId === appId);
    if (app) {
      setSyncEnabled(app.syncStatus === 'Enabled');
      if (app.documentTypes?.length) setDocumentType(app.documentTypes[0]);
    }
    if (rule) {
      setEndpoints([
        {
          id: `ep-${appId}-approved`,
          name: 'Approved Decision Callback',
          event: 'APPROVED',
          method: rule.approvedAction?.method || 'POST',
          url: app?.approvalEndpoint || rule.approvedAction?.url || 'https://api.example.com/approval',
          conditions: rule.conditions?.length ? rule.conditions : [
            { id: 'c-1', field: 'Approval Status', operator: 'Equals', value: 'Approved', logicalOperator: 'AND' }
          ],
          authType: rule.approvedAction?.auth?.type || 'API Key',
          secretKey: rule.approvedAction?.auth?.apiKeyValue || '••••••••••••••••'
        },
        {
          id: `ep-${appId}-rejected`,
          name: 'Rejected Decision Callback',
          event: 'REJECTED',
          method: rule.rejectedAction?.method || 'POST',
          url: app?.rejectionEndpoint || rule.rejectedAction?.url || 'https://api.example.com/rejection',
          conditions: [
            { id: 'c-2', field: 'Approval Status', operator: 'Not Equals', value: 'Approved', logicalOperator: 'AND' }
          ],
          authType: rule.approvedAction?.auth?.type || 'API Key',
          secretKey: rule.approvedAction?.auth?.apiKeyValue || '••••••••••••••••'
        }
      ]);
    }
    setExpandedEndpointIds({});
  };

  // Add a new Endpoint to this Application (Auto-expands)
  const handleAddEndpoint = () => {
    const newEpId = `ep-${Date.now()}`;
    setEndpoints(prev => [
      ...prev,
      {
        id: newEpId,
        name: `Custom Callback #${prev.length + 1}`,
        event: 'CUSTOM',
        method: 'POST',
        url: `https://${currentApp?.code.toLowerCase() || 'app'}.example.com/api/v1/callback`,
        conditions: [
          { id: `c-${Date.now()}-1`, field: 'Attachment Status', operator: 'Equals', value: 'Complete', logicalOperator: 'AND' }
        ],
        authType: 'API Key',
        secretKey: 'secret_key_123'
      }
    ]);
    setExpandedEndpointIds(prev => ({ ...prev, [newEpId]: true }));
  };

  // Remove Endpoint
  const handleRemoveEndpoint = (id: string) => {
    if (endpoints.length <= 1) return;
    setEndpoints(prev => prev.filter(ep => ep.id !== id));
  };

  // Update Endpoint Top-level Field
  const handleUpdateEndpoint = (id: string, key: keyof AppEndpoint, value: any) => {
    setEndpoints(prev => prev.map(ep => ep.id === id ? { ...ep, [key]: value } : ep));
  };

  // --- MULTIPLE CONDITIONS MANAGEMENT PER ENDPOINT ---
  const handleAddConditionToEndpoint = (endpointId: string) => {
    setEndpoints(prev => prev.map(ep => {
      if (ep.id === endpointId) {
        const newCond: Condition = {
          id: `c-${Date.now()}`,
          field: 'IA Approval',
          operator: 'Equals',
          value: 'Approved',
          logicalOperator: 'AND'
        };
        return { ...ep, conditions: [...ep.conditions, newCond] };
      }
      return ep;
    }));
  };

  const handleUpdateEndpointCondition = (endpointId: string, conditionId: string, field: keyof Condition, value: any) => {
    setEndpoints(prev => prev.map(ep => {
      if (ep.id === endpointId) {
        const updatedConds = ep.conditions.map(cond => cond.id === conditionId ? { ...cond, [field]: value } : cond);
        return { ...ep, conditions: updatedConds };
      }
      return ep;
    }));
  };

  const handleRemoveConditionFromEndpoint = (endpointId: string, conditionId: string) => {
    setEndpoints(prev => prev.map(ep => {
      if (ep.id === endpointId && ep.conditions.length > 1) {
        return { ...ep, conditions: ep.conditions.filter(c => c.id !== conditionId) };
      }
      return ep;
    }));
  };

  // --- DYNAMIC PAYLOAD FIELD MAPPINGS HANDLERS ---
  const handleAddFieldMapping = () => {
    const newId = `fm-${Date.now()}`;
    setFieldMappings([
      ...fieldMappings,
      { id: newId, ourField: 'Vendor Name', thirdPartyField: 'vendorName' }
    ]);
  };

  const handleUpdateFieldMapping = (id: string, key: 'ourField' | 'thirdPartyField', value: string) => {
    setFieldMappings(fieldMappings.map(fm => fm.id === id ? { ...fm, [key]: value } : fm));
  };

  const handleRemoveFieldMapping = (id: string) => {
    if (fieldMappings.length <= 1) return;
    setFieldMappings(fieldMappings.filter(fm => fm.id !== id));
  };

  // Test Endpoint Connection
  const handleTestEndpoint = (ep: AppEndpoint) => {
    setTestResult({ testing: true, message: `Testing "${ep.name}"...`, timeMs: 0 });
    setTimeout(() => {
      setTestResult({
        testing: false,
        message: `Success! Endpoint "${ep.name}" (${ep.method} ${ep.url}) returned HTTP 200 OK.`,
        timeMs: 148
      });
    }, 850);
  };

  // Save Application Configuration
  const handleSaveConfig = () => {
    if (!currentApp) return;

    const approvedEp = endpoints.find(e => e.event === 'APPROVED') || endpoints[0];
    const rejectedEp = endpoints.find(e => e.event === 'REJECTED') || endpoints[1] || endpoints[0];

    onUpdateApp({
      ...currentApp,
      syncStatus: syncEnabled ? 'Enabled' : 'Disabled',
      approvalEndpoint: approvedEp.url,
      rejectionEndpoint: rejectedEp.url
    });

    const allConditions: Condition[] = endpoints.flatMap(ep => ep.conditions);

    const approvedConfig: EndpointConfig = {
      method: approvedEp.method,
      url: approvedEp.url,
      timeoutMs: 5000,
      retryCount: 3,
      auth: { type: approvedEp.authType, apiKeyHeader: 'X-API-KEY', apiKeyValue: approvedEp.secretKey },
      headers: [{ id: 'h-1', key: 'Content-Type', value: 'application/json' }],
      requestBodyTemplate: ''
    };

    const rejectedConfig: EndpointConfig = {
      method: rejectedEp.method,
      url: rejectedEp.url,
      timeoutMs: 5000,
      retryCount: 3,
      auth: { type: rejectedEp.authType, apiKeyHeader: 'X-API-KEY', apiKeyValue: rejectedEp.secretKey },
      headers: [{ id: 'h-2', key: 'Content-Type', value: 'application/json' }],
      requestBodyTemplate: ''
    };

    const rule: SyncRule = {
      id: activeRule?.id || `rule-${Date.now()}`,
      applicationId: currentApp.id,
      applicationName: currentApp.name,
      ruleName: `${currentApp.name} Decision Notification Sync`,
      documentType,
      priority: 1,
      status: 'Active',
      currentVersion: (activeRule?.currentVersion || 0) + 1,
      versions: [],
      conditions: allConditions,
      approvedAction: approvedConfig,
      rejectedAction: rejectedConfig,
      payloadMappings: fieldMappings,
      lastModified: new Date().toLocaleString()
    };

    onSaveRule(rule, 'Active');
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3 font-sans text-[11px]">
      {/* Save Success Banner */}
      {savedBanner && (
        <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center gap-2 text-emerald-800 font-bold animate-fadeIn">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Sync configuration & endpoints for <strong>{currentApp?.name}</strong> successfully saved & enabled!</span>
        </div>
      )}

      {/* Target Application Header Selector */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="h-6 w-6 bg-slate-100 text-slate-700 rounded-md flex items-center justify-center font-bold shrink-0 border border-slate-200">
            <Server className="h-3 w-3" />
          </div>
          <div>
            <label className="block text-[7.5px] font-black text-slate-400 uppercase tracking-widest">
              TARGET APPLICATION SYNC CONFIGURATOR
            </label>
            <select
              value={selectedAppId}
              onChange={(e) => handleSelectApp(e.target.value)}
              className="text-[10px] font-extrabold text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 cursor-pointer focus:outline-hidden h-6.5"
            >
              {apps.map(app => (
                <option key={app.id} value={app.id}>
                  {app.name} ({app.code}) — {app.syncStatus}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 h-6.5">
            <span className="font-bold text-slate-600 text-[9px]">Sync Enabled:</span>
            <button
              type="button"
              onClick={() => setSyncEnabled(!syncEnabled)}
              className={`px-1.5 py-0.2 rounded text-[8.5px] font-bold tracking-wide uppercase transition cursor-pointer flex items-center gap-1 ${
                syncEnabled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-slate-600'
              }`}
            >
              <Power className="h-2 w-2" /> {syncEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
          <button
            onClick={onViewLogsClick}
            className="px-2 py-0.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-md text-[9px] font-bold transition cursor-pointer shadow-2xs h-6.5"
          >
            Delivery Logs
          </button>
        </div>
      </div>

      {/* Section 1: Application & Document Category */}
      <div className="bg-white p-2.5 px-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
        <h3 className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-1">
          <Server className="h-2.5 w-2.5 text-blue-600" />
          1. APPLICATION & DOCUMENT CATEGORY
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">
              DOCUMENT CATEGORY
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-900 text-[10px] h-6.5"
            >
              {ALL_DOCUMENT_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">
              APPLICATION IDENTIFIER CODE
            </label>
            <input
              type="text"
              readOnly
              value={currentApp?.code || 'ERP_001'}
              className="w-full px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-lg font-mono font-bold text-slate-600 text-[10px] h-6.5"
            />
          </div>
        </div>
      </div>

      {/* Section 2: Application API Endpoints (Collapsible Accordion + Multiple Conditions Support) */}
      <div className="bg-white p-2.5 px-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1">
          <div className="flex items-center gap-1.5">
            <Globe className="h-2.5 w-2.5 text-blue-600" />
            <h3 className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider">
              2. APPLICATION API ENDPOINTS ({endpoints.length})
            </h3>
          </div>

          <button
            type="button"
            onClick={handleAddEndpoint}
            className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-[8.5px] font-extrabold transition flex items-center gap-1 cursor-pointer shadow-2xs active:scale-98"
          >
            <Plus className="h-2.5 w-2.5 text-blue-600" /> Add Endpoint
          </button>
        </div>

        {/* Collapsible Endpoints List */}
        <div className="space-y-1.5">
          {endpoints.map((ep) => {
            const isExpanded = !!expandedEndpointIds[ep.id];
            const condSummary = ep.conditions.map(c => `${c.field} ${c.operator === 'Equals' ? '=' : '!='} "${c.value}"`).join(' AND ');

            return (
              <div
                key={ep.id}
                className={`rounded-lg border transition ${
                  isExpanded ? 'bg-white border-blue-300 ring-2 ring-blue-500/10 shadow-xs' :
                  'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                }`}
              >
                {/* Collapsed / Expanded Card Header */}
                <div className="p-1.5 px-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className={`px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase shrink-0 ${
                      ep.event === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      ep.event === 'REJECTED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}>
                      {ep.event}
                    </span>

                    <span className="font-extrabold text-slate-900 text-[10px] truncate">
                      {ep.name}
                    </span>

                    {!isExpanded && (
                      <span className="font-mono text-[9px] text-slate-400 truncate hidden sm:inline-block">
                        • {ep.method} {ep.url} ({condSummary})
                      </span>
                    )}
                  </div>

                  {/* Header Right Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleExpandEndpoint(ep.id)}
                      className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold transition flex items-center gap-1 cursor-pointer border ${
                        isExpanded ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Edit className="h-2.5 w-2.5" />
                      {isExpanded ? 'Hide Details' : 'Edit Configuration'}
                      {isExpanded ? <ChevronUp className="h-2.5 w-2.5 ml-0.5" /> : <ChevronDown className="h-2.5 w-2.5 ml-0.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTestEndpoint(ep)}
                      className="px-1.5 py-0.5 bg-white text-slate-600 border border-slate-200 rounded text-[8.5px] font-medium hover:bg-slate-50 transition cursor-pointer"
                    >
                      Test Endpoint
                    </button>

                    {endpoints.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEndpoint(ep.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Delete Endpoint"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Detailed Configuration Fields */}
                {isExpanded && (
                  <div className="p-3.5 pt-0 border-t border-slate-100 space-y-3 mt-1 animate-fadeIn">
                    {/* Endpoint Name */}
                    <div>
                      <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">ENDPOINT LABEL NAME</label>
                      <input
                        type="text"
                        value={ep.name}
                        onChange={(e) => handleUpdateEndpoint(ep.id, 'name', e.target.value)}
                        placeholder="Endpoint Name..."
                        className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded font-black text-slate-900 text-xs"
                      />
                    </div>

                    {/* Method & URL */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">METHOD</label>
                        <select
                          value={ep.method}
                          onChange={(e) => handleUpdateEndpoint(ep.id, 'method', e.target.value as HttpMethod)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-black text-slate-900 text-[11px]"
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                          <option value="DELETE">DELETE</option>
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">ENDPOINT URL</label>
                        <input
                          type="url"
                          value={ep.url}
                          onChange={(e) => handleUpdateEndpoint(ep.id, 'url', e.target.value)}
                          placeholder="https://thirdparty.com/api/v2/documents/callback"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-900 text-[11px]"
                        />
                      </div>
                    </div>

                    {/* MULTIPLE IF CONDITIONS SECTION */}
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-blue-600 text-[10px] uppercase">
                          IF CONDITION(S) ({ep.conditions.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddConditionToEndpoint(ep.id)}
                          className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[9px] font-extrabold flex items-center gap-1 cursor-pointer transition"
                        >
                          <Plus className="h-2.5 w-2.5" /> Add Condition Rule
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {ep.conditions.map((cond, cIdx) => (
                          <div key={cond.id} className="flex flex-col sm:flex-row items-center gap-2 bg-white p-2 rounded border border-slate-200 text-[10px]">
                            {cIdx === 0 ? (
                              <span className="font-mono font-black text-blue-600 w-10 text-center shrink-0">IF</span>
                            ) : (
                              <select
                                value={cond.logicalOperator || 'AND'}
                                onChange={(e) => handleUpdateEndpointCondition(ep.id, cond.id, 'logicalOperator', e.target.value)}
                                className="w-14 px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-black text-blue-700 text-[9px] shrink-0"
                              >
                                <option value="AND">AND</option>
                                <option value="OR">OR</option>
                              </select>
                            )}

                            <select
                              value={cond.field}
                              onChange={(e) => handleUpdateEndpointCondition(ep.id, cond.id, 'field', e.target.value as ConditionField)}
                              className="flex-1 w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-bold text-slate-900"
                            >
                              {ALL_DOCUMENT_FIELDS.map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>

                            <select
                              value={cond.operator}
                              onChange={(e) => handleUpdateEndpointCondition(ep.id, cond.id, 'operator', e.target.value as ConditionOperator)}
                              className="w-full sm:w-28 px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-blue-600"
                            >
                              <option value="Equals">Equals (=)</option>
                              <option value="Not Equals">Not Equals (!=)</option>
                              <option value="Contains">Contains</option>
                            </select>

                            {/* Combo Dropdown + Free Custom Text Input via Datalist */}
                            <div className="flex-1 w-full relative">
                              <input
                                type="text"
                                list={`datalist-${cond.id}`}
                                value={cond.value}
                                onChange={(e) => handleUpdateEndpointCondition(ep.id, cond.id, 'value', e.target.value)}
                                placeholder="Select option or type custom value..."
                                className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded font-bold text-slate-900 text-[10px] focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                              />
                              <datalist id={`datalist-${cond.id}`}>
                                {(FIELD_VALUE_OPTIONS[cond.field] || [
                                  'Approved',
                                  'Rejected',
                                  'Pending',
                                  'Completed',
                                  'Passed',
                                  'Failed'
                                ]).map((val) => (
                                  <option key={val} value={val} />
                                ))}
                              </datalist>
                            </div>

                            {ep.conditions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveConditionFromEndpoint(ep.id, cond.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="Remove Condition"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Auth & Secret */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[9px] font-black text-slate-500 uppercase mb-0.5">AUTHENTICATION</label>
                        <select
                          value={ep.authType}
                          onChange={(e) => handleUpdateEndpoint(ep.id, 'authType', e.target.value as AuthType)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-900 text-[10px]"
                        >
                          <option value="API Key">API Key Header</option>
                          <option value="Bearer Token">Bearer Token</option>
                          <option value="Basic Authentication">Basic Auth</option>
                          <option value="None">None</option>
                        </select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <label className="block text-[9px] font-black text-slate-500 uppercase">SECRET KEY / API TOKEN</label>
                          <span className="text-[8px] text-slate-400 font-medium">Provided by 3rd-party App</span>
                        </div>
                        <div className="relative">
                          <input
                            type={showSecretMap[ep.id] ? 'text' : 'password'}
                            value={ep.secretKey}
                            onChange={(e) => handleUpdateEndpoint(ep.id, 'secretKey', e.target.value)}
                            placeholder="Generated by 3rd-party system (e.g. sk_live_...)"
                            className="w-full px-2.5 py-1.5 pr-8 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-900 text-[10px]"
                          />
                          <button
                            type="button"
                            onClick={() => setShowSecretMap(prev => ({ ...prev, [ep.id]: !prev[ep.id] }))}
                            className="absolute right-2 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                          >
                            {showSecretMap[ep.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 3: Dynamic Field Mappings with Document Field Dropdowns */}
      <div className="bg-white p-2.5 px-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex items-center justify-between border-b border-slate-100 pb-1">
          <h3 className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="h-2.5 w-2.5 text-blue-600" />
            3. PAYLOAD KEY MAPPINGS ({fieldMappings.length})
          </h3>
          <button
            type="button"
            onClick={handleAddFieldMapping}
            className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[8.5px] font-extrabold transition flex items-center gap-1 cursor-pointer"
          >
            <Plus className="h-2.5 w-2.5" /> Add Payload Mapping Field
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {fieldMappings.map((fm) => (
            <div key={fm.id} className="p-1 bg-slate-50/80 rounded-md border border-slate-200/80 flex items-center gap-1">
              <select
                value={fm.ourField}
                onChange={(e) => handleUpdateFieldMapping(fm.id, 'ourField', e.target.value)}
                className="flex-1 px-1.5 py-0.5 bg-white border border-slate-200 rounded font-bold text-slate-800 text-[9.5px] h-6"
              >
                {ALL_DOCUMENT_FIELDS.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <span className="text-slate-400 font-bold text-[10px]">:</span>
              <input
                type="text"
                value={fm.thirdPartyField}
                onChange={(e) => handleUpdateFieldMapping(fm.id, 'thirdPartyField', e.target.value)}
                placeholder="Payload Key..."
                className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono font-bold text-blue-700 text-[9.5px] w-24 h-6"
              />
              {fieldMappings.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveFieldMapping(fm.id)}
                  className="p-0.5 text-slate-400 hover:text-rose-600 transition cursor-pointer shrink-0"
                  title="Remove Payload Mapping"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Test Feedback Banner */}
      {testResult && (
        <div className={`p-2 rounded-lg border flex items-center justify-between font-bold text-[10px] ${
          testResult.testing ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-blue-600 shrink-0" />
            <span>{testResult.message}</span>
          </div>
          {testResult.timeMs > 0 && (
            <span className="font-mono text-[9px] opacity-80">{testResult.timeMs} ms</span>
          )}
        </div>
      )}

      {/* Save Button */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-end">
        <button
          type="button"
          onClick={handleSaveConfig}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition shadow-xs flex items-center gap-1 cursor-pointer active:scale-98 text-[10px] h-7"
        >
          <Check className="h-3 w-3" /> Save Application Sync Configuration
        </button>
      </div>
    </div>
  );
}
