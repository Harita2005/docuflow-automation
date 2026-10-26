import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Play,
  Save,
  Globe,
  Database,
  Sliders,
  Search,
  Code,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  Server,
  Check,
  Copy,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileText,
  Zap
} from 'lucide-react';
import { ThirdPartyApplication, SyncRule, Condition, AuthType, FieldMapping } from '../../types/dapiSyncBack';
import { SYSTEM_FIELDS, DEFAULT_FIELD_MAPPINGS } from './syncFields';

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

  // Application Master Edit State (collapsible)
  const [showMasterConfig, setShowMasterConfig] = useState(false);
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
  useEffect(() => {
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

  // Keep selectedRuleId synchronized if rule list updates
  useEffect(() => {
    if (!appRules.some(r => r.id === selectedRuleId) && appRules.length > 0) {
      setSelectedRuleId(appRules[0].id);
    }
  }, [currentAppId, rules]);

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
  const [decisionTrigger, setDecisionTrigger] = useState<'APPROVED' | 'REJECTED' | 'BOTH'>(
    activeRule?.decisionTrigger || 'APPROVED'
  );

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
  const [payloadSource, setPayloadSource] = useState<'SQL_PROCEDURE' | 'JSON_MAPPING' | 'RAW_TEMPLATE'>(
    activeRule?.payloadSource || 'SQL_PROCEDURE'
  );
  const [storedProcedureName, setStoredProcedureName] = useState(
    activeRule?.storedProcedureName || 'sp_GetApprovalCallbackPayload'
  );

  // Field Mappings for JSON_MAPPING mode
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>(() => {
    if (activeRule?.payloadMappings && activeRule.payloadMappings.length > 0) {
      return activeRule.payloadMappings;
    }
    return DEFAULT_FIELD_MAPPINGS;
  });

  // Raw Template for RAW_TEMPLATE mode
  const [rawTemplate, setRawTemplate] = useState<string>(
    activeRule?.rawPayloadTemplate ||
      JSON.stringify(
        {
          docKey: '{{primaryKey}}',
          documentNumber: '{{documentNumber}}',
          status: '{{approvalStatus}}',
          approver: '{{approvedBy}}',
          company: '{{company}}',
          timestamp: '{{approvalDate}}'
        },
        null,
        2
      )
  );

  // Live Test Sandbox State
  const [sampleDocKey, setSampleDocKey] = useState('CAPEX-101');
  const [sampleDecision, setSampleDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testTab, setTestTab] = useState<'request' | 'response' | 'diagnostics'>('request');
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Notifications & UI states
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state when active rule changes
  useEffect(() => {
    if (activeRule) {
      setRuleName(activeRule.ruleName);
      setPriority(activeRule.priority);
      setRuleStatus(activeRule.status);
      setHttpMethod(activeRule.approvedAction?.method || 'POST');
      setTargetEndpoint(activeRule.approvedAction?.url || 'https://sap.company.com/api/v1/approval');
      setDecisionTrigger(activeRule.decisionTrigger || 'APPROVED');
      if (activeRule.conditions && activeRule.conditions.length > 0) {
        setConditions(activeRule.conditions);
      }
      if (activeRule.payloadSource) {
        setPayloadSource(activeRule.payloadSource);
      }
      if (activeRule.storedProcedureName) {
        setStoredProcedureName(activeRule.storedProcedureName);
      }
      if (activeRule.payloadMappings && activeRule.payloadMappings.length > 0) {
        setFieldMappings(activeRule.payloadMappings);
      }
      if (activeRule.rawPayloadTemplate) {
        setRawTemplate(activeRule.rawPayloadTemplate);
      }
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
      ruleName: `Conditional Rule #${appRules.length + 1}`,
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
        auth: { type: authType },
        headers: [],
        requestBodyTemplate: ''
      },
      rejectedAction: {
        method: 'POST',
        url: 'https://sap.company.com/api/v1/rejection',
        timeoutMs: 30000,
        retryCount: 3,
        auth: { type: authType },
        headers: [],
        requestBodyTemplate: ''
      },
      payloadMappings: DEFAULT_FIELD_MAPPINGS,
      payloadSource: 'SQL_PROCEDURE',
      storedProcedureName: 'sp_GetApprovalCallbackPayload',
      decisionTrigger: 'APPROVED'
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
    if (conditions.length > 1) {
      setConditions(conditions.filter(c => c.id !== id));
    }
  };

  const handleAddFieldMapping = () => {
    const newMapping: FieldMapping = {
      id: `fm-${Date.now()}`,
      ourField: 'Company',
      thirdPartyField: `field_${fieldMappings.length + 1}`,
      description: 'Custom field mapping'
    };
    setFieldMappings([...fieldMappings, newMapping]);
  };

  const handleRemoveFieldMapping = (id: string) => {
    setFieldMappings(fieldMappings.filter(m => m.id !== id));
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    setRawTemplate(prev => prev + `\n  "customField": "${placeholder}",`);
  };

  const handleFormatTemplate = () => {
    try {
      const parsed = JSON.parse(rawTemplate);
      setRawTemplate(JSON.stringify(parsed, null, 2));
      showToast('JSON formatted successfully');
    } catch {
      showToast('Invalid JSON syntax: check quotes and commas');
    }
  };

  const showToast = (msg: string) => {
    setSaveSuccessMsg(msg);
    setTimeout(() => setSaveSuccessMsg(null), 3500);
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
      showToast(`Master settings for ${appName} saved.`);
    }
  };

  const handleSaveWorkspace = async () => {
    setIsSaving(true);
    handleSaveMasterApp();
    if (!activeRule) {
      setIsSaving(false);
      return;
    }

    const updatedRule: SyncRule = {
      ...activeRule,
      ruleName,
      priority,
      status: ruleStatus,
      conditions,
      payloadSource,
      storedProcedureName,
      payloadMappings: fieldMappings,
      rawPayloadTemplate: rawTemplate,
      decisionTrigger,
      approvedAction: {
        ...activeRule.approvedAction,
        method: httpMethod,
        url: targetEndpoint
      }
    };

    onSaveRule(updatedRule, ruleStatus === 'Draft' ? 'Draft' : 'Active');
    showToast(`Rule "${ruleName}" saved to database.`);
    setTimeout(() => setIsSaving(false), 500);
  };

  const handleRunLiveTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      const appIdNum = parseInt(currentAppId);
      const ruleIdNum = parseInt(selectedRuleId);

      // Construct live active configuration to test immediate unsaved changes
      const ruleConfigPayload = {
        rule_name: ruleName,
        application_id: isNaN(appIdNum) ? 1 : appIdNum,
        status: ruleStatus === 'Active' ? 'ACTIVE' : 'DRAFT',
        priority: priority,
        trigger_event: 'FDO_FINAL_DECISION',
        run_when: decisionTrigger,
        conditions_json: { logicalOperator, conditions },
        http_method: httpMethod,
        url_mode: 'OVERRIDE',
        custom_url: targetEndpoint,
        body_type: 'JSON',
        payload_source: payloadSource,
        stored_procedure_name: storedProcedureName,
        raw_payload_template: payloadSource === 'RAW_TEMPLATE' ? rawTemplate : undefined,
        payload_mapping_json: payloadSource === 'JSON_MAPPING' ? fieldMappings : undefined,
        content_type: 'application/json'
      };

      const res = await fetch('/api/integrations/v2/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          application_id: isNaN(appIdNum) ? 1 : appIdNum,
          rule_id: !isNaN(ruleIdNum) ? ruleIdNum : undefined,
          sample_primary_key: sampleDocKey || 'TEST-DOC-001',
          sample_document_number: sampleDocKey ? `INV-${sampleDocKey}` : 'INV-TEST-001',
          sample_approval_status: sampleDecision,
          rule_config: ruleConfigPayload
        })
      });

      const data = await res.json();
      setTestResult(data);
      if (data.status_code) {
        setTestTab('response');
      } else {
        setTestTab('request');
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        error: e.message || 'Connection test failed',
        status_code: 500
      });
      setTestTab('response');
    } finally {
      setTesting(false);
    }
  };

  const copyPayloadToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden space-y-2 font-sans text-[11px]">
      
      {/* Toast Notification Banner */}
      {saveSuccessMsg && (
        <div className="fixed top-4 right-4 z-50 bg-[#005A36] text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold animate-fadeIn">
          <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Top Header Command Bar */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBackToApps}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-bold flex items-center gap-1.5 cursor-pointer text-[10.5px]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Apps
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-emerald-50 text-[#005A36] rounded-lg flex items-center justify-center font-bold border border-emerald-200">
              <Server className="h-3.5 w-3.5" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Target App:</span>
              <select
                value={currentAppId}
                onChange={(e) => setCurrentAppId(e.target.value)}
                className="font-extrabold text-xs text-slate-900 bg-slate-50 px-2 py-0.5 border border-slate-200 rounded-md outline-none cursor-pointer focus:border-[#005A36]"
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
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[10.5px] transition flex items-center gap-1 cursor-pointer"
          >
            <Sliders className="h-3.5 w-3.5 text-slate-500" />
            {showMasterConfig ? 'Hide App & Auth Master' : 'Show App & Auth Master'}
            {showMasterConfig ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={handleSaveWorkspace}
            disabled={isSaving}
            className="px-3.5 py-1 bg-[#005A36] hover:bg-[#00482B] text-white font-extrabold text-[10.5px] rounded-lg shadow-2xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Save All Changes
          </button>
        </div>
      </div>

      {/* COMPACT MASTER APPLICATION CONFIGURATION CARD */}
      {showMasterConfig && (
        <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs space-y-2.5 animate-fadeIn shrink-0 max-h-56 overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#005A36]" />
              <h3 className="text-[10.5px] font-extrabold text-slate-800 uppercase tracking-wider">
                Application Identity & Token API (Endpoint 1)
              </h3>
            </div>
            <button
              onClick={handleSaveMasterApp}
              className="text-[#005A36] hover:text-[#00482B] text-[10px] font-extrabold flex items-center gap-1 cursor-pointer"
            >
              <Save className="h-3 w-3" /> Save App Master
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-[9px] font-extrabold text-slate-500 uppercase mb-0.5">Application Name</label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10.5px] font-bold text-slate-900 outline-none focus:border-[#005A36]"
              />
            </div>
            <div>
              <label className="block text-[9px] font-extrabold text-slate-500 uppercase mb-0.5">App Code</label>
              <input
                type="text"
                value={appCode}
                onChange={(e) => setAppCode(e.target.value.toUpperCase())}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10.5px] font-mono font-bold text-slate-900 outline-none focus:border-[#005A36]"
              />
            </div>
            <div>
              <label className="block text-[9px] font-extrabold text-slate-500 uppercase mb-0.5">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10.5px] font-bold text-slate-800 outline-none focus:border-[#005A36]"
              >
                <option value="Production">Production</option>
                <option value="Staging">Staging / Testing</option>
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-extrabold text-slate-500 uppercase mb-0.5">Auth Method</label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as any)}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10.5px] font-bold text-slate-800 outline-none focus:border-[#005A36]"
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
                <label className="block text-[9px] font-extrabold text-[#005A36] uppercase mb-0.5">
                  Token API Endpoint 1 URL *
                </label>
                <input
                  type="url"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  placeholder="https://api.example.com/v1/auth/token"
                  className="w-full px-2 py-1 bg-white border border-emerald-200 rounded text-[10px] font-mono text-slate-900 outline-none focus:border-[#005A36]"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-600 uppercase mb-0.5">Client ID</label>
                <input
                  type="text"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  placeholder="Client ID..."
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-mono outline-none focus:border-[#005A36]"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-600 uppercase mb-0.5">Client Secret</label>
                <input
                  type="password"
                  value={oauthClientSecret}
                  onChange={(e) => setOauthClientSecret(e.target.value)}
                  placeholder="Client Secret..."
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-mono outline-none focus:border-[#005A36]"
                />
              </div>
            </div>
          )}

          {authType === 'API Key' && (
            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-bold text-slate-600 uppercase mb-0.5">Header Name</label>
                <input
                  type="text"
                  value={apiKeyHeader}
                  onChange={(e) => setApiKeyHeader(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-mono outline-none focus:border-[#005A36]"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-slate-600 uppercase mb-0.5">API Key Secret</label>
                <input
                  type="password"
                  value={apiKeyValue}
                  onChange={(e) => setApiKeyValue(e.target.value)}
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-mono outline-none focus:border-[#005A36]"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Master-Detail Grid View */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2.5 overflow-hidden">
        
        {/* LEFT SIDEBAR: ENDPOINT RULES MASTER LIST (3 Cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-2xs p-2.5 space-y-2 flex flex-col h-full min-h-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 shrink-0">
            <h3 className="text-[10.5px] font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-[#005A36]" />
              Rules ({filteredRules.length})
            </h3>
            <button
              onClick={handleAddNewRule}
              className="text-[#005A36] hover:text-[#00482B] font-extrabold text-[9.5px] flex items-center gap-0.5 cursor-pointer bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200"
            >
              <Plus className="h-3 w-3" /> New Rule
            </button>
          </div>

          <div className="relative shrink-0">
            <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search rules..."
              value={searchRuleTerm}
              onChange={(e) => setSearchRuleTerm(e.target.value)}
              className="w-full pl-6 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-800 outline-none focus:border-[#005A36]"
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5 custom-scrollbar">
            {filteredRules.length === 0 ? (
              <div className="p-4 text-center text-slate-400 font-bold text-[10px]">
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
                        ? 'bg-emerald-50/80 border-[#005A36] shadow-2xs ring-1 ring-[#005A36]/30'
                        : 'bg-slate-50/60 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900 text-[10.5px] truncate max-w-[140px]">
                        {rule.ruleName}
                      </span>
                      <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded text-[8.5px] font-mono font-bold">
                        P{rule.priority}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="px-1 py-0.2 bg-[#005A36] text-white rounded text-[8px] font-mono font-black">
                        {rule.approvedAction?.method || 'POST'}
                      </span>
                      <span className="text-slate-600 font-mono truncate max-w-[150px]">
                        {rule.approvedAction?.url || 'Default Endpoint'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[8.5px] text-slate-400 border-t border-slate-200/50 pt-0.5">
                      <span>{rule.conditions?.length || 0} Conditions</span>
                      <span className={`font-bold ${rule.status === 'Active' ? 'text-[#005A36]' : 'text-slate-400'}`}>
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
        <div className="lg:col-span-9 bg-white rounded-xl border border-slate-200 shadow-2xs p-2.5 flex flex-col h-full min-h-0 overflow-hidden">
          
          {/* Header Action Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-emerald-100 text-[#005A36] font-extrabold rounded text-[9.5px]">
                ACTIVE RULE WORKSPACE
              </span>
              <h2 className="text-xs font-black text-slate-900">
                {ruleName}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={ruleStatus}
                onChange={(e) => setRuleStatus(e.target.value as any)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded font-bold text-[10px] text-slate-700 outline-none"
              >
                <option value="Active">Active</option>
                <option value="Draft">Draft</option>
                <option value="Disabled">Disabled</option>
              </select>

              <button
                type="button"
                onClick={handleSaveWorkspace}
                disabled={isSaving}
                className="px-3 py-1 bg-[#005A36] hover:bg-[#00482B] text-white font-bold text-[10.5px] rounded-lg transition shadow-2xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Changes
              </button>
            </div>
          </div>

          {/* Internal Scrollable Workspace Body */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1.5 custom-scrollbar mt-2">

            {/* SECTION A: TARGET ENDPOINT CONFIGURATION */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[#005A36] flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Section A: Target Endpoint Configuration (Endpoint 2)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">Rule Name *</label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10.5px] font-bold text-slate-900 outline-none focus:border-[#005A36]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">Priority (Lower runs first) *</label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10.5px] font-bold text-slate-900 outline-none focus:border-[#005A36]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">Trigger Event</label>
                  <select
                    value={decisionTrigger}
                    onChange={(e) => setDecisionTrigger(e.target.value as any)}
                    className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10.5px] font-bold text-slate-900 outline-none focus:border-[#005A36]"
                  >
                    <option value="APPROVED">APPROVED Only</option>
                    <option value="REJECTED">REJECTED Only</option>
                    <option value="BOTH">BOTH (Approved or Rejected)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
                  Target Endpoint URL *
                </label>
                <div className="flex items-center gap-1.5">
                  <div className="flex bg-slate-200 p-0.5 rounded-lg border border-slate-300">
                    {(['POST', 'PUT', 'PATCH', 'DELETE'] as const).map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setHttpMethod(m)}
                        className={`px-2 py-0.5 rounded font-black text-[9.5px] transition cursor-pointer ${
                          httpMethod === m
                            ? 'bg-[#005A36] text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  <input
                    type="url"
                    value={targetEndpoint}
                    onChange={(e) => setTargetEndpoint(e.target.value)}
                    placeholder="https://sap.company.com/api/v1/capex-assets"
                    className="flex-1 px-2.5 py-1 bg-white border border-slate-200 rounded font-mono text-[10.5px] font-bold text-slate-900 outline-none focus:border-[#005A36]"
                  />
                </div>
              </div>
            </div>

            {/* SECTION B: DYNAMIC MULTI-CONDITION RULE ENGINE */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[#005A36] flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5" /> Section B: Dynamic Multi-Condition Engine
                </h4>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-extrabold text-slate-500 uppercase">Logical Match:</span>
                  <select
                    value={logicalOperator}
                    onChange={(e) => setLogicalOperator(e.target.value as any)}
                    className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[9.5px] font-bold text-slate-800 outline-none focus:border-[#005A36]"
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
                    className="text-[9.5px] px-2 py-1 border border-slate-200 rounded font-bold text-slate-700 outline-none focus:border-[#005A36]"
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
                    className="text-[9.5px] px-2 py-1 border border-slate-200 rounded font-semibold text-slate-700 outline-none focus:border-[#005A36]"
                  >
                    <option value="Equals">Equals</option>
                    <option value="Not Equals">Not Equals</option>
                    <option value="Contains">Contains</option>
                    <option value="Does Not Contain">Does Not Contain</option>
                    <option value="Greater Than">Greater Than</option>
                    <option value="Less Than">Less Than</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Comparison value (e.g. VCC, CAPEX, 50000)..."
                    value={cond.value}
                    onChange={(e) => {
                      const updated = [...conditions];
                      updated[idx].value = e.target.value;
                      setConditions(updated);
                    }}
                    className="flex-1 text-[9.5px] px-2 py-1 border border-slate-200 rounded outline-none font-bold text-slate-800 focus:border-[#005A36]"
                  />

                  <button
                    type="button"
                    onClick={() => handleRemoveCondition(cond.id)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                    title="Remove condition"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddCondition}
                className="px-2.5 py-1 bg-white border border-emerald-300 text-[#005A36] font-extrabold text-[9.5px] rounded-lg hover:bg-emerald-50 transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Add Condition
              </button>
            </div>

            {/* SECTION C: PAYLOAD GENERATION ENGINE */}
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[#005A36] flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5" /> Section C: Payload Generation Engine
                </h4>

                {/* Mode Selector Tabs */}
                <div className="flex bg-slate-200 p-0.5 rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setPayloadSource('SQL_PROCEDURE')}
                    className={`px-2 py-0.5 rounded font-extrabold text-[9.5px] transition cursor-pointer flex items-center gap-1 ${
                      payloadSource === 'SQL_PROCEDURE'
                        ? 'bg-[#005A36] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Database className="h-3 w-3" /> SQL Stored Procedure
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayloadSource('JSON_MAPPING')}
                    className={`px-2 py-0.5 rounded font-extrabold text-[9.5px] transition cursor-pointer flex items-center gap-1 ${
                      payloadSource === 'JSON_MAPPING'
                        ? 'bg-[#005A36] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sliders className="h-3 w-3" /> Visual Field Mapper
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayloadSource('RAW_TEMPLATE')}
                    className={`px-2 py-0.5 rounded font-extrabold text-[9.5px] transition cursor-pointer flex items-center gap-1 ${
                      payloadSource === 'RAW_TEMPLATE'
                        ? 'bg-[#005A36] text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Code className="h-3 w-3" /> Raw JSON Template
                  </button>
                </div>
              </div>

              {/* Mode 1: SQL Stored Procedure */}
              {payloadSource === 'SQL_PROCEDURE' && (
                <div className="space-y-2 animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500 mb-0.5">
                        Stored Procedure Name *
                      </label>
                      <select
                        value={storedProcedureName}
                        onChange={(e) => setStoredProcedureName(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-mono font-bold text-slate-900 outline-none focus:border-[#005A36]"
                      >
                        <option value="sp_GetApprovalCallbackPayload">sp_GetApprovalCallbackPayload (Standard Approval Schema)</option>
                        <option value="sp_GetInvoiceCallbackPayload">sp_GetInvoiceCallbackPayload (Detailed Line Items + Tax Breakdown)</option>
                        <option value="sp_DocuFlow_CallbackPayload">sp_DocuFlow_CallbackPayload (Enterprise ERP Schema)</option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <input
                        type="text"
                        value={storedProcedureName}
                        onChange={(e) => setStoredProcedureName(e.target.value)}
                        placeholder="Custom procedure name..."
                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-800 outline-none focus:border-[#005A36]"
                      />
                    </div>
                  </div>

                  <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-200 flex items-start gap-2">
                    <Zap className="h-3.5 w-3.5 text-[#005A36] shrink-0 mt-0.5" />
                    <div className="text-[9.5px] text-slate-700 space-y-0.5">
                      <span className="font-extrabold text-[#005A36]">Execution Parameter: </span>
                      <span>
                        The callback runner executes <code className="bg-white px-1 py-0.2 rounded border font-mono font-bold text-slate-900">EXEC {storedProcedureName} @DocKey = :primaryKey</code> and serializes the returned recordset into JSON before sending to Endpoint 2.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mode 2: Visual JSON Field Mapper */}
              {payloadSource === 'JSON_MAPPING' && (
                <div className="space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-[9.5px]">
                    <span className="text-slate-600 font-bold">
                      Map DocuFlow internal document fields to third-party callback JSON keys:
                    </span>
                    <button
                      type="button"
                      onClick={() => setFieldMappings(DEFAULT_FIELD_MAPPINGS)}
                      className="text-[#005A36] hover:underline font-extrabold cursor-pointer"
                    >
                      Reset to Defaults
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {fieldMappings.map((mapping, idx) => (
                      <div key={mapping.id || idx} className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200">
                        <div className="flex-1 flex items-center gap-1.5">
                          <span className="text-[8.5px] font-extrabold text-slate-400 uppercase w-16">DocuFlow:</span>
                          <select
                            value={mapping.ourField}
                            onChange={(e) => {
                              const updated = [...fieldMappings];
                              updated[idx].ourField = e.target.value;
                              setFieldMappings(updated);
                            }}
                            className="flex-1 text-[9.5px] px-2 py-1 border border-slate-200 rounded font-bold text-slate-800 outline-none focus:border-[#005A36]"
                          >
                            {SYSTEM_FIELDS.map(f => (
                              <option key={f.key} value={f.key}>
                                {f.label} (e.g. {f.example})
                              </option>
                            ))}
                          </select>
                        </div>

                        <span className="text-slate-400 font-bold">➔</span>

                        <div className="flex-1 flex items-center gap-1.5">
                          <span className="text-[8.5px] font-extrabold text-slate-400 uppercase w-16">JSON Key:</span>
                          <input
                            type="text"
                            value={mapping.thirdPartyField}
                            onChange={(e) => {
                              const updated = [...fieldMappings];
                              updated[idx].thirdPartyField = e.target.value;
                              setFieldMappings(updated);
                            }}
                            placeholder="e.g. documentId, status"
                            className="flex-1 text-[9.5px] px-2 py-1 border border-slate-200 rounded font-mono font-bold text-slate-900 outline-none focus:border-[#005A36]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFieldMapping(mapping.id)}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddFieldMapping}
                    className="px-2.5 py-1 bg-white border border-emerald-300 text-[#005A36] font-extrabold text-[9.5px] rounded-lg hover:bg-emerald-50 transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Add Mapped Field
                  </button>
                </div>
              )}

              {/* Mode 3: Raw JSON Payload Template */}
              {payloadSource === 'RAW_TEMPLATE' && (
                <div className="space-y-2 animate-fadeIn">
                  <div className="flex items-center justify-between text-[9.5px]">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-slate-500 font-extrabold uppercase text-[8.5px]">Insert Placeholders:</span>
                      {['{{primaryKey}}', '{{documentNumber}}', '{{approvalStatus}}', '{{company}}', '{{approvedBy}}', '{{approvalDate}}'].map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleInsertPlaceholder(tag)}
                          className="px-1.5 py-0.2 bg-white hover:bg-emerald-50 text-[#005A36] border border-emerald-200 rounded font-mono text-[8.5px] font-bold cursor-pointer"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleFormatTemplate}
                      className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded font-bold text-[9px] cursor-pointer"
                    >
                      Format / Validate JSON
                    </button>
                  </div>

                  <textarea
                    rows={6}
                    value={rawTemplate}
                    onChange={(e) => setRawTemplate(e.target.value)}
                    className="w-full p-2 bg-slate-900 text-emerald-300 font-mono text-[10px] rounded-lg border border-slate-700 outline-none focus:border-[#005A36] custom-scrollbar"
                  />
                </div>
              )}
            </div>

            {/* SECTION D: LIVE RULE TEST SANDBOX & PAYLOAD PREVIEW */}
            <div className="p-3 bg-slate-900 text-white rounded-xl space-y-2.5 border border-slate-800 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Code className="h-3.5 w-3.5" /> Section D: Live Rule Test Sandbox & Payload Preview
                </h4>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] font-bold text-slate-400">DocKey:</span>
                    <input
                      type="text"
                      placeholder="e.g. CAPEX-101"
                      value={sampleDocKey}
                      onChange={(e) => setSampleDocKey(e.target.value)}
                      className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9.5px] font-mono text-white outline-none focus:border-emerald-500 w-28"
                    />
                  </div>

                  <select
                    value={sampleDecision}
                    onChange={(e) => setSampleDecision(e.target.value as any)}
                    className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[9.5px] font-bold text-slate-200 outline-none"
                  >
                    <option value="APPROVED">Decision: APPROVED</option>
                    <option value="REJECTED">Decision: REJECTED</option>
                  </select>

                  <button
                    type="button"
                    onClick={handleRunLiveTest}
                    disabled={testing}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {testing ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                    {testing ? 'Executing...' : 'Run Live Test'}
                  </button>
                </div>
              </div>

              {/* Console Tabs */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 text-[9.5px]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTestTab('request')}
                    className={`px-2 py-0.5 rounded font-extrabold transition cursor-pointer ${
                      testTab === 'request'
                        ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Request Preview
                  </button>

                  <button
                    type="button"
                    onClick={() => setTestTab('response')}
                    className={`px-2 py-0.5 rounded font-extrabold transition cursor-pointer flex items-center gap-1 ${
                      testTab === 'response'
                        ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Live Response
                    {testResult?.status_code && (
                      <span className={`px-1 py-0.1 rounded text-[8px] font-black ${
                        testResult.status_code < 400 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                      }`}>
                        {testResult.status_code}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setTestTab('diagnostics')}
                    className={`px-2 py-0.5 rounded font-extrabold transition cursor-pointer ${
                      testTab === 'diagnostics'
                        ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Diagnostics
                  </button>
                </div>

                {testResult?.response_time_ms !== undefined && (
                  <span className="text-[9px] font-mono text-slate-400">
                    Latency: <strong className="text-emerald-400">{testResult.response_time_ms} ms</strong>
                  </span>
                )}
              </div>

              {/* Tab 1: Request Preview */}
              {testTab === 'request' && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[9.5px] space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between text-slate-300 border-b border-slate-800 pb-1">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.2 bg-emerald-600 text-white font-extrabold rounded text-[8.5px]">
                        {httpMethod}
                      </span>
                      <span className="text-emerald-300 font-bold truncate max-w-sm">{targetEndpoint}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const body = testResult?.request_preview?.body || JSON.stringify({
                          primaryKey: sampleDocKey,
                          approvalStatus: sampleDecision,
                          company: 'VCC',
                          decisionTrigger
                        }, null, 2);
                        copyPayloadToClipboard(body);
                      }}
                      className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedPayload ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      {copiedPayload ? 'Copied' : 'Copy Payload'}
                    </button>
                  </div>

                  {/* Headers */}
                  <div className="text-slate-400 space-y-0.5 text-[9px]">
                    <div><span className="text-slate-500">Authorization:</span> Bearer [Token API Endpoint 1]</div>
                    <div><span className="text-slate-500">Content-Type:</span> application/json</div>
                    <div><span className="text-slate-500">X-Approval-Event-ID:</span> TEST-EVT-{sampleDocKey}</div>
                  </div>

                  {/* Body Preview */}
                  <div className="text-emerald-300 pt-1 border-t border-slate-800/80">
                    <pre className="whitespace-pre-wrap leading-relaxed">
                      {testResult?.request_preview?.body
                        ? (typeof testResult.request_preview.body === 'string'
                            ? (testResult.request_preview.body.startsWith('{')
                                ? JSON.stringify(JSON.parse(testResult.request_preview.body), null, 2)
                                : testResult.request_preview.body)
                            : JSON.stringify(testResult.request_preview.body, null, 2))
                        : (payloadSource === 'SQL_PROCEDURE'
                            ? `// Payload will be generated by executing ${storedProcedureName} @DocKey = '${sampleDocKey}'\n{\n  "documentId": "${sampleDocKey}",\n  "approvalStatus": "${sampleDecision}",\n  "companyCode": "VCC",\n  "grandTotal": 125000.00,\n  "executedStoredProcedure": "${storedProcedureName}"\n}`
                            : (payloadSource === 'RAW_TEMPLATE'
                                ? rawTemplate.replace('{{primaryKey}}', sampleDocKey).replace('{{approvalStatus}}', sampleDecision)
                                : JSON.stringify({
                                    documentId: sampleDocKey,
                                    status: sampleDecision,
                                    companyCode: 'VCC'
                                  }, null, 2)))}
                    </pre>
                  </div>
                </div>
              )}

              {/* Tab 2: Live Response */}
              {testTab === 'response' && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono text-[9.5px] space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  {!testResult ? (
                    <div className="text-slate-500 text-center py-4">
                      No response yet. Click "Run Live Test" to test the target endpoint.
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded font-black text-[9px] ${
                            testResult.success
                              ? 'bg-emerald-600 text-white'
                              : 'bg-rose-600 text-white'
                          }`}>
                            {testResult.status_code || 500} {testResult.success ? 'OK' : 'ERROR'}
                          </span>
                          <span className="text-slate-400">Response from {targetEndpoint}</span>
                        </div>
                        {testResult.response_time_ms && (
                          <span className="text-emerald-400 font-bold">{testResult.response_time_ms} ms</span>
                        )}
                      </div>

                      {testResult.error && (
                        <div className="p-2 bg-rose-950/60 border border-rose-800 rounded text-rose-300">
                          {testResult.error}
                        </div>
                      )}

                      {testResult.response_body && (
                        <div className="text-blue-300">
                          <pre className="whitespace-pre-wrap leading-relaxed">
                            {testResult.response_body}
                          </pre>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Tab 3: Diagnostics */}
              {testTab === 'diagnostics' && (
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-sans text-[10px] space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
                  <div className="grid grid-cols-2 gap-2 text-slate-300">
                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 font-bold block text-[8.5px] uppercase">Payload Generation Engine:</span>
                      <strong className="text-emerald-400 font-mono">{payloadSource}</strong>
                    </div>

                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 font-bold block text-[8.5px] uppercase">Stored Procedure / Template:</span>
                      <strong className="text-emerald-400 font-mono truncate block">
                        {payloadSource === 'SQL_PROCEDURE' ? storedProcedureName : (payloadSource === 'RAW_TEMPLATE' ? 'Custom Raw JSON' : `${fieldMappings.length} Fields Mapped`)}
                      </strong>
                    </div>

                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 font-bold block text-[8.5px] uppercase">Trigger Configuration:</span>
                      <strong className="text-slate-200">{decisionTrigger} (Run When {decisionTrigger})</strong>
                    </div>

                    <div className="bg-slate-900 p-2 rounded border border-slate-800">
                      <span className="text-slate-500 font-bold block text-[8.5px] uppercase">Authentication Mode:</span>
                      <strong className="text-slate-200">{authType}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
