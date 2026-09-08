import React, { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Play,
  Save,
  CheckCircle,
  AlertTriangle,
  Globe,
  Database,
  Sliders,
  Search,
  Code,
  Shield,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Key,
  Server
} from 'lucide-react';
import { ThirdPartyApplication, SyncRule, Condition, AuthType } from '../../types/dapiSyncBack';

interface ApplicationStudioPageProps {
  apps: ThirdPartyApplication[];
  rules: SyncRule[];
  selectedAppId: string;
  onBackToApps: () => void;
  onSaveRule: (rule: SyncRule, status: 'Active' | 'Draft') => void;
  onUpdateApp?: (app: ThirdPartyApplication) => void;
}

export default function ApplicationStudioPage({
  apps,
  rules,
  selectedAppId,
  onBackToApps,
  onSaveRule,
  onUpdateApp
}: ApplicationStudioPageProps) {
  const [currentAppId, setCurrentAppId] = useState<string>(selectedAppId || apps[0]?.id || '');
  const selectedApp = apps.find(a => a.id === currentAppId) || apps[0];

  // Application Master Edit State
  const [showMasterConfig, setShowMasterConfig] = useState(true);
  const [appName, setAppName] = useState(selectedApp?.name || '');
  const [appCode, setAppCode] = useState(selectedApp?.code || '');
  const [environment, setEnvironment] = useState(selectedApp?.environment || 'Production');
  const [appStatus, setAppStatus] = useState(selectedApp?.status || 'Active');
  const [authType, setAuthType] = useState<AuthType>(selectedApp?.authType || 'OAuth 2.0');
  const [tokenUrl, setTokenUrl] = useState(selectedApp?.tokenUrl || 'https://api.example.com/oauth/token');
  const [oauthClientId, setOauthClientId] = useState(selectedApp?.oauthClientId || '');
  const [oauthClientSecret, setOauthClientSecret] = useState(selectedApp?.oauthClientSecret || '');
  const [apiKeyHeader, setApiKeyHeader] = useState(selectedApp?.apiKeyHeader || 'X-API-Key');
  const [apiKeyValue, setApiKeyValue] = useState(selectedApp?.apiKeyValue || '');
  const [approvalEndpoint, setApprovalEndpoint] = useState(selectedApp?.approvalEndpoint || 'https://api.example.com/approval');
  const [rejectionEndpoint, setRejectionEndpoint] = useState(selectedApp?.rejectionEndpoint || 'https://api.example.com/rejection');

  // Sync state when application selection changes
  React.useEffect(() => {
    if (selectedApp) {
      setAppName(selectedApp.name);
      setAppCode(selectedApp.code);
      setEnvironment(selectedApp.environment || 'Production');
      setAppStatus(selectedApp.status);
      setAuthType(selectedApp.authType || 'OAuth 2.0');
      setTokenUrl(selectedApp.tokenUrl || 'https://api.example.com/oauth/token');
      setOauthClientId(selectedApp.oauthClientId || '');
      setOauthClientSecret(selectedApp.oauthClientSecret || '');
      setApiKeyHeader(selectedApp.apiKeyHeader || 'X-API-Key');
      setApiKeyValue(selectedApp.apiKeyValue || '');
      setApprovalEndpoint(selectedApp.approvalEndpoint || 'https://api.example.com/approval');
      setRejectionEndpoint(selectedApp.rejectionEndpoint || 'https://api.example.com/rejection');
    }
  }, [currentAppId]);

  // Filter rules belonging to the selected application
  const appRules = rules.filter(r => r.applicationId === currentAppId);
  const [selectedRuleId, setSelectedRuleId] = useState<string>(appRules[0]?.id || '');
  const [searchRuleTerm, setSearchRuleTerm] = useState('');

  // Current Active Rule State
  const activeRule = appRules.find(r => r.id === selectedRuleId) || appRules[0];

  // Form State for Active Rule Workspace
  const [ruleName, setRuleName] = useState(activeRule?.ruleName || 'Default Approval Endpoint Rule');
  const [priority, setPriority] = useState<number>(activeRule?.priority ?? 10);
  const [ruleStatus, setRuleStatus] = useState<'Active' | 'Draft' | 'Disabled'>(activeRule?.status || 'Active');
  
  // Endpoint Settings
  const [httpMethod, setHttpMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>(
    activeRule?.approvedAction?.method || 'POST'
  );
  const [targetEndpoint, setTargetEndpoint] = useState<string>(
    activeRule?.approvedAction?.url || 'https://sap.company.com/api/v1/approval'
  );
  const [decisionTrigger, setDecisionTrigger] = useState<'APPROVED' | 'REJECTED' | 'BOTH'>('APPROVED');

  // Conditions
  const [logicalOperator, setLogicalOperator] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<Condition[]>(() => {
    if (activeRule?.conditions && activeRule.conditions.length > 0) {
      return activeRule.conditions;
    }
    return [
      { id: 'c-1', field: 'company', operator: 'Equals', value: 'VCC', logicalOperator: 'AND' }
    ];
  });

  // Payload Source
  const [payloadSource, setPayloadSource] = useState<'SQL_PROCEDURE' | 'JSON_MAPPING' | 'RAW_TEMPLATE'>('SQL_PROCEDURE');
  const [storedProcedureName, setStoredProcedureName] = useState('sp_GetApprovalCallbackPayload');

  // Live Test Sandbox State
  const [sampleDocKey, setSampleDocKey] = useState('CAPEX-101');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Sync state when active rule changes
  React.useEffect(() => {
    if (activeRule) {
      setRuleName(activeRule.ruleName);
      setPriority(activeRule.priority);
      setRuleStatus(activeRule.status);
      setHttpMethod(activeRule.approvedAction?.method || 'POST');
      setTargetEndpoint(activeRule.approvedAction?.url || 'https://sap.company.com/api/v1/approval');
      if (activeRule.conditions) setConditions(activeRule.conditions);
    }
  }, [selectedRuleId]);

  const filteredRules = appRules.filter(r =>
    r.ruleName.toLowerCase().includes(searchRuleTerm.toLowerCase()) ||
    (r.approvedAction?.url && r.approvedAction.url.toLowerCase().includes(searchRuleTerm.toLowerCase()))
  );

  const handleAddNewRule = () => {
    const newId = `rule-${Date.now()}`;
    const newRule: SyncRule = {
      id: newId,
      applicationId: currentAppId,
      applicationName: selectedApp?.name || 'Target Application',
      ruleName: `Conditional Endpoint Rule #${appRules.length + 1}`,
      documentType: 'Purchase Order',
      priority: (appRules.length + 1) * 10,
      status: 'Active',
      currentVersion: 1,
      versions: [],
      conditions: [
        { id: `c-${Date.now()}`, field: 'category', operator: 'Equals', value: 'CAPEX', logicalOperator: 'AND' }
      ],
      approvedAction: {
        method: 'POST',
        url: 'https://sap.company.com/api/v1/capex',
        timeoutMs: 30000,
        retryCount: 3,
        auth: { type: 'OAuth 2.0' },
        headers: [],
        requestBodyTemplate: ''
      },
      rejectedAction: {
        method: 'POST',
        url: 'https://sap.company.com/api/v1/rejection',
        timeoutMs: 30000,
        retryCount: 3,
        auth: { type: 'OAuth 2.0' },
        headers: [],
        requestBodyTemplate: ''
      },
      payloadMappings: []
    };

    onSaveRule(newRule, 'Active');
    setSelectedRuleId(newId);
  };

  const handleAddCondition = () => {
    setConditions([
      ...conditions,
      { id: `c-${Date.now()}`, field: 'category', operator: 'Equals', value: 'CAPEX', logicalOperator: logicalOperator }
    ]);
  };

  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter(c => c.id !== id));
  };

  const handleSaveMasterApp = () => {
    if (onUpdateApp && selectedApp) {
      onUpdateApp({
        ...selectedApp,
        name: appName,
        code: appCode,
        environment,
        status: appStatus as any,
        authType,
        tokenUrl,
        oauthClientId,
        oauthClientSecret,
        apiKeyHeader,
        apiKeyValue,
        approvalEndpoint,
        rejectionEndpoint
      });
    }
  };

  const handleSaveWorkspace = () => {
    handleSaveMasterApp();
    if (!activeRule) return;
    const updatedRule: SyncRule = {
      ...activeRule,
      ruleName,
      priority,
      status: ruleStatus,
      conditions,
      approvedAction: {
        ...activeRule.approvedAction,
        method: httpMethod,
        url: targetEndpoint
      }
    };
    onSaveRule(updatedRule, ruleStatus === 'Draft' ? 'Draft' : 'Active');
  };

  const handleRunLiveTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/v2/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: selectedApp?.id || 1,
          sample_primary_key: sampleDocKey,
          sample_document_number: `INV-${sampleDocKey}`,
          sample_approval_status: 'APPROVED'
        })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Connection test failed'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3 font-sans text-[10.5px]">
      
      {/* Top Header Command Bar */}
      <div className="bg-white p-2.5 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToApps}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-bold flex items-center gap-1 cursor-pointer text-[10px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Apps
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold border border-blue-200">
              <Server className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase">Target Application:</span>
              <select
                value={currentAppId}
                onChange={(e) => setCurrentAppId(e.target.value)}
                className="font-black text-xs text-slate-900 bg-slate-50 px-2 py-0.5 border border-slate-200 rounded-md outline-none cursor-pointer"
              >
                {apps.map(app => (
                  <option key={app.id} value={app.id}>
                    {app.name} ({app.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMasterConfig(!showMasterConfig)}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[10px] transition flex items-center gap-1 cursor-pointer"
          >
            <Sliders className="h-3 w-3 text-slate-500" />
            {showMasterConfig ? 'Hide App & Auth Master' : 'Show App & Auth Master'}
            {showMasterConfig ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={handleSaveWorkspace}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] rounded-lg shadow-2xs transition flex items-center gap-1 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" /> Save All Changes
          </button>
        </div>
      </div>

      {/* COMPACT MASTER APPLICATION CONFIGURATION CARD (Identity, Token API Endpoint 1, Auth, Callbacks) */}
      {showMasterConfig && (
        <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-2xs space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-amber-500" />
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                Application Identity & Token Generation API (Endpoint 1)
              </h3>
            </div>
            <span className="text-[9px] font-bold text-slate-400">Master Settings for {selectedApp?.name}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[8.5px] font-extrabold text-slate-500 uppercase mb-0.5">Application Name</label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-[8.5px] font-extrabold text-slate-500 uppercase mb-0.5">App Code</label>
              <input
                type="text"
                value={appCode}
                onChange={(e) => setAppCode(e.target.value.toUpperCase())}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-[8.5px] font-extrabold text-slate-500 uppercase mb-0.5">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-800 outline-none"
              >
                <option value="Production">Production</option>
                <option value="Staging">Staging / Testing</option>
              </select>
            </div>
            <div>
              <label className="block text-[8.5px] font-extrabold text-slate-500 uppercase mb-0.5">Auth Method</label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as any)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-800 outline-none"
              >
                <option value="OAuth 2.0">OAuth 2.0 (Client Credentials)</option>
                <option value="API Key">Static API Key Header</option>
                <option value="Bearer Token">Static Bearer Token</option>
                <option value="None">None (Public)</option>
              </select>
            </div>
          </div>

          {/* Token API & Credentials Row */}
          {authType === 'OAuth 2.0' && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-[8.5px] font-extrabold text-blue-700 uppercase mb-0.5">
                  Token API Endpoint 1 URL *
                </label>
                <input
                  type="url"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  placeholder="https://api.example.com/v1/auth/token"
                  className="w-full px-2 py-1 bg-white border border-blue-200 rounded text-[9.5px] font-mono text-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-[8.5px] font-bold text-slate-600 uppercase mb-0.5">Client ID</label>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  placeholder="Client ID..."
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[9.5px] font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-[8.5px] font-bold text-slate-600 uppercase mb-0.5">Client Secret</label>
                <input
                  type="password"
                  value={oauthClientSecret}
                  onChange={(e) => setOauthClientSecret(e.target.value)}
                  placeholder="Client Secret..."
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[9.5px] font-mono outline-none"
                />
              </div>
            </div>
          )}

          {authType === 'API Key' && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[8.5px] font-bold text-slate-600 uppercase mb-0.5">Header Name</label>
                <input
                  type="text"
                  value={apiKeyHeader}
                  onChange={(e) => setApiKeyHeader(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[9.5px] font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-[8.5px] font-bold text-slate-600 uppercase mb-0.5">API Key Secret</label>
                <input
                  type="password"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[9.5px] font-mono outline-none"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Master-Detail Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        
        {/* LEFT SIDEBAR: ENDPOINT RULES MASTER LIST (3 Cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-2xs p-2.5 space-y-2 flex flex-col h-[600px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1">
              <Layers className="h-3 w-3 text-blue-600" />
              Endpoint Rules ({filteredRules.length})
            </h3>
            <button
              onClick={handleAddNewRule}
              className="text-blue-600 hover:text-blue-800 font-bold text-[9px] flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="h-2.5 w-2.5" /> New Rule
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-400" />
            <input
              type="text"
              placeholder="Filter rules..."
              value={searchRuleTerm}
              onChange={(e) => setSearchRuleTerm(e.target.value)}
              className="w-full pl-6 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-[9.5px] font-bold text-slate-800 outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
            {filteredRules.length === 0 ? (
              <div className="p-3 text-center text-slate-400 font-bold text-[9.5px]">
                No endpoint rules found. Click "+ New Rule" to create one.
              </div>
            ) : (
              filteredRules.map(rule => {
                const isSelected = rule.id === selectedRuleId;
                return (
                  <div
                    key={rule.id}
                    onClick={() => setSelectedRuleId(rule.id)}
                    className={`p-2 rounded-lg border transition cursor-pointer space-y-1 ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-500 shadow-2xs'
                        : 'bg-slate-50/60 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900 text-[10px] truncate max-w-[140px]">
                        {rule.ruleName}
                      </span>
                      <span className="px-1 py-0.2 bg-slate-200 text-slate-700 rounded text-[8px] font-mono font-bold">
                        P{rule.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[8.5px]">
                      <span className="px-1 py-0.2 bg-blue-600 text-white rounded text-[8px] font-mono font-black">
                        {rule.approvedAction?.method || 'POST'}
                      </span>
                      <span className="text-slate-500 font-mono truncate max-w-[150px]">
                        {rule.approvedAction?.url || 'Default Endpoint'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[8.5px] text-slate-400 border-t border-slate-200/50 pt-0.5">
                      <span>{rule.conditions?.length || 0} Conditions</span>
                      <span className={`font-bold ${rule.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {rule.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT WORKSPACE: HIGH-DENSITY RULE STUDIO (9 Cols) */}
        <div className="lg:col-span-9 bg-white rounded-xl border border-slate-200 shadow-2xs p-3 space-y-3 h-[600px] overflow-y-auto">
          
          {/* Header Action Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 font-black rounded text-[9px]">
                ACTIVE RULE WORKSPACE
              </span>
              <h2 className="text-xs font-black text-slate-900">
                {ruleName}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveWorkspace}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded-lg transition shadow-2xs flex items-center gap-1 cursor-pointer"
              >
                <Save className="h-3 w-3" /> Save Changes
              </button>
            </div>
          </div>

          {/* SECTION A: TARGET ENDPOINT CONFIGURATION */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
              <Globe className="h-3 w-3" /> Section A: Target Endpoint Configuration (Endpoint 2)
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Rule Name *</label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Priority *</label>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Trigger Event</label>
                <select
                  value={decisionTrigger}
                  onChange={(e) => setDecisionTrigger(e.target.value as any)}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-900 outline-none"
                >
                  <option value="APPROVED">APPROVED Only</option>
                  <option value="REJECTED">REJECTED Only</option>
                  <option value="BOTH">BOTH (Approved or Rejected)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                Target Endpoint URL *
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={httpMethod}
                  onChange={(e) => setHttpMethod(e.target.value as any)}
                  className="px-2 py-1 bg-blue-600 text-white rounded font-black text-[10px] outline-none"
                >
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
                <input
                  type="url"
                  value={targetEndpoint}
                  onChange={(e) => setTargetEndpoint(e.target.value)}
                  placeholder="https://sap.company.com/api/v1/capex-assets"
                  className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded font-mono text-[10px] font-bold text-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          {/* SECTION B: DYNAMIC MULTI-CONDITION RULE ENGINE */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
                <Sliders className="h-3 w-3" /> Section B: Dynamic Multi-Condition Engine
              </h4>

              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-slate-500">Logical Match:</span>
                <select
                  value={logicalOperator}
                  onChange={(e) => setLogicalOperator(e.target.value as any)}
                  className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[9.5px] font-bold text-slate-800"
                >
                  <option value="AND">AND (All conditions must match)</option>
                  <option value="OR">OR (Any condition matches)</option>
                </select>
              </div>
            </div>

            {conditions.map((cond, idx) => (
              <div key={cond.id || idx} className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200">
                <select
                  value={cond.field}
                  onChange={(e) => {
                    const updated = [...conditions];
                    updated[idx].field = e.target.value;
                    setConditions(updated);
                  }}
                  className="text-[9.5px] px-2 py-1 border border-slate-200 rounded font-bold text-slate-700 outline-none"
                >
                  <option value="company">Division / Company</option>
                  <option value="category">Category</option>
                  <option value="branch">Branch / Plant</option>
                  <option value="costCenter">Cost Center</option>
                  <option value="amount">Gross Amount</option>
                  <option value="documentType">Document Type</option>
                </select>

                <select
                  value={cond.operator}
                  onChange={(e) => {
                    const updated = [...conditions];
                    updated[idx].operator = e.target.value as any;
                    setConditions(updated);
                  }}
                  className="text-[9.5px] px-2 py-1 border border-slate-200 rounded font-semibold text-slate-700 outline-none"
                >
                  <option value="Equals">Equals</option>
                  <option value="Not Equals">Not Equals</option>
                  <option value="Contains">Contains</option>
                  <option value="Greater Than">Greater Than</option>
                  <option value="Less Than">Less Than</option>
                </select>

                <input
                  type="text"
                  placeholder="Comparison value..."
                  value={cond.value}
                  onChange={(e) => {
                    const updated = [...conditions];
                    updated[idx].value = e.target.value;
                    setConditions(updated);
                  }}
                  className="flex-1 text-[9.5px] px-2 py-1 border border-slate-200 rounded outline-none font-medium"
                />

                <button
                  type="button"
                  onClick={() => handleRemoveCondition(cond.id)}
                  className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddCondition}
              className="px-2.5 py-1 bg-white border border-blue-200 text-blue-600 font-bold text-[9.5px] rounded-lg hover:bg-blue-50 transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3 w-3" /> Add Condition
            </button>
          </div>

          {/* SECTION C: PAYLOAD ENGINE & SQL STORED PROCEDURE */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1">
              <Database className="h-3 w-3" /> Section C: Payload Engine & SQL Stored Procedure
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Payload Generation Engine *</label>
                <select
                  value={payloadSource}
                  onChange={(e) => setPayloadSource(e.target.value as any)}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[9.5px] font-bold text-slate-900 outline-none"
                >
                  <option value="SQL_PROCEDURE">SQL Stored Procedure (@DocKey Parameterized)</option>
                  <option value="JSON_MAPPING">Visual JSON Field Mapper</option>
                  <option value="RAW_TEMPLATE">Raw JSON Payload Template</option>
                </select>
              </div>

              {payloadSource === 'SQL_PROCEDURE' && (
                <div>
                  <label className="block text-[8.5px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Stored Procedure Name *</label>
                  <input
                    type="text"
                    value={storedProcedureName}
                    onChange={(e) => setStoredProcedureName(e.target.value)}
                    placeholder="sp_GetApprovalCallbackPayload"
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[9.5px] font-mono font-bold text-slate-900 outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION D: LIVE RULE TEST SANDBOX */}
          <div className="p-2.5 bg-slate-900 text-white rounded-xl space-y-2 border border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <Code className="h-3 w-3" /> Live Rule Test Sandbox & Payload Preview
              </h4>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="DocKey (e.g. CAPEX-101)"
                  value={sampleDocKey}
                  onChange={(e) => setSampleDocKey(e.target.value)}
                  className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9.5px] font-mono text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleRunLiveTest}
                  disabled={testing}
                  className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[9.5px] rounded transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Play className="h-2.5 w-2.5" /> {testing ? 'Testing...' : 'Run Live Test'}
                </button>
              </div>
            </div>

            {testResult && (
              <div className="bg-slate-950 p-2 rounded border border-slate-800 font-mono text-[9.5px] text-blue-300 space-y-1 overflow-x-auto max-h-32">
                <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-slate-800 pb-0.5">
                  <span>POST {targetEndpoint}</span>
                  <span>Header: Authorization Bearer (Token API Endpoint 1)</span>
                </div>
                <pre>{JSON.stringify(testResult.request_preview || testResult, null, 2)}</pre>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
