import React, { useState, useEffect, useCallback } from 'react';
import {
  Server,
  ListFilter,
  Share2,
  CheckCircle,
  Sliders
} from 'lucide-react';
import {
  ThirdPartyApplication,
  SyncRule,
  SyncLog,
  FieldMapping
} from '../../types/dapiSyncBack';

import ApplicationsTab from './ApplicationsTab';
import SyncLogsTab from './SyncLogsTab';
import ApplicationStudioPage from './ApplicationStudioPage';

export type SyncBackTab = 'applications' | 'studio' | 'simple' | 'logs';

interface DapiSyncBackHubProps {
  initialTab?: SyncBackTab;
}

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export default function DapiSyncBackHub({ initialTab = 'applications' }: DapiSyncBackHubProps) {
  const [activeTab, setActiveTab] = useState<SyncBackTab>(initialTab);

  // Dynamic Live Database State
  const [apps, setApps] = useState<ThirdPartyApplication[]>([]);
  const [rules, setRules] = useState<SyncRule[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [_fieldMappings, _setFieldMappings] = useState<FieldMapping[]>([]);

  // Selected Target App for API Config & Rules Studio
  const [selectedAppIdForConfig, setSelectedAppIdForConfig] = useState<string>('');

  // Toast Banner State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch Live Applications from Database
  const fetchLiveApps = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/v2/applications', { headers: getAuthHeaders() });
      if (res.ok) {
        const body = await res.json();
        if (body.success && Array.isArray(body.data)) {
          const mapped: ThirdPartyApplication[] = body.data.map((a: any) => ({
            id: String(a.id),
            name: a.name,
            code: a.code,
            description: a.description || '',
            documentTypes: ['Purchase Order', 'AP Invoice', 'Customer Feedback'],
            status: a.status || 'Active',
            syncStatus: (a.status || 'Active') === 'Active' ? 'Enabled' : 'Disabled',
            approvalEndpoint: a.base_url || '',
            rejectionEndpoint: a.base_url || '',
            authType: a.auth_type || 'None',
            lastSync: a.last_callback || 'Never',
            rulesCount: a.rules_count || 0,
            environment: a.environment || 'Production'
          }));
          setApps(mapped);
          if (mapped.length > 0) {
            setSelectedAppIdForConfig(prev => prev && mapped.some(m => m.id === prev) ? prev : mapped[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Error fetching live applications:", err);
    }
  }, []);

  // Fetch Live Callback Rules from Database
  const fetchLiveRules = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/v2/rules', { headers: getAuthHeaders() });
      if (res.ok) {
        const body = await res.json();
        if (body.success && Array.isArray(body.data)) {
          const mapped: SyncRule[] = body.data.map((r: any) => {
            let parsedConditions: any[] = [];
            try {
              const parsed = typeof r.conditions_json === 'string' ? JSON.parse(r.conditions_json) : r.conditions_json;
              if (Array.isArray(parsed)) parsedConditions = parsed;
              else if (parsed?.conditions && Array.isArray(parsed.conditions)) parsedConditions = parsed.conditions;
            } catch {}

            return {
              id: String(r.id),
              applicationId: String(r.application_id),
              applicationName: r.application_name || '',
              ruleName: r.rule_name,
              documentType: 'Purchase Order',
              priority: r.priority || 1,
              status: r.status === 'ACTIVE' ? 'Active' : (r.status === 'DRAFT' ? 'Draft' : 'Disabled'),
              currentVersion: 1,
              versions: [],
              conditions: parsedConditions.map((c: any, idx: number) => ({
                id: c.id || `cond-${idx}`,
                field: c.field || 'company',
                operator: c.operator || 'Equals',
                value: c.value || ''
              })),
              approvedAction: {
                method: (r.http_method || 'POST') as any,
                url: r.custom_url || (r.endpoint_path ? `${r.endpoint_path}` : ''),
                timeoutMs: (r.timeout_seconds || 30) * 1000,
                retryCount: 3,
                auth: { type: r.auth_override_type || 'None' },
                headers: [],
                requestBodyTemplate: r.raw_payload_template || ''
              },
              rejectedAction: {
                method: (r.http_method || 'POST') as any,
                url: r.custom_url || (r.endpoint_path ? `${r.endpoint_path}` : ''),
                timeoutMs: (r.timeout_seconds || 30) * 1000,
                retryCount: 3,
                auth: { type: r.auth_override_type || 'None' },
                headers: [],
                requestBodyTemplate: r.raw_payload_template || ''
              },
              payloadMappings: []
            };
          });
          setRules(mapped);
        }
      }
    } catch (err) {
      console.error("Error fetching live rules:", err);
    }
  }, []);

  // Fetch Live Delivery Logs from Database
  const fetchLiveLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/v2/logs?limit=50', { headers: getAuthHeaders() });
      if (res.ok) {
        const body = await res.json();
        if (body.success && Array.isArray(body.data)) {
          const mappedLogs: SyncLog[] = body.data.map((l: any) => ({
            id: String(l.id),
            timestamp: l.created_at ? new Date(l.created_at).toLocaleString() : new Date().toLocaleString(),
            applicationId: String(l.application_id),
            applicationName: l.application_name || 'Target Application',
            documentNumber: l.document_number || l.document_id || 'DOC-001',
            primaryKey: l.primary_key || l.document_id || 'PK-001',
            documentType: 'Purchase Order',
            decision: l.decision || 'APPROVED',
            endpoint: l.custom_url || '/api/callback',
            httpMethod: (l.method || 'POST') as any,
            httpStatus: l.status === 'DELIVERED' ? 200 : (l.status === 'FAILED' ? 500 : 202),
            syncStatus: l.status === 'DELIVERED' ? 'Success' : (l.status === 'FAILED' ? 'Failed' : 'Pending'),
            retryCount: l.attempt_count || 1,
            maxRetries: l.max_attempts || 3,
            idempotencyKey: l.event_id || `EVT-${l.id}`,
            ruleId: String(l.rule_id),
            ruleName: l.rule_name || 'Approval Sync Rule',
            conditionSummary: `Decision = ${l.decision || 'APPROVED'}`,
            requestHeaders: { 'Content-Type': 'application/json' },
            requestBody: { event_id: l.event_id, document_id: l.document_id, decision: l.decision },
            responseBody: { status: l.status },
            responseTimeMs: 145,
            retryHistory: []
          }));
          setLogs(mappedLogs);
        }
      }
    } catch (err) {
      console.error("Error loading live sync logs in hub:", err);
    }
  }, []);

  // Mount Effect
  useEffect(() => {
    fetchLiveApps();
    fetchLiveRules();
    fetchLiveLogs();
  }, [fetchLiveApps, fetchLiveRules, fetchLiveLogs]);

  // Handlers for Applications (Connected to Backend Database)
  const handleAddApp = async (newApp: Partial<ThirdPartyApplication>) => {
    try {
      const payload = {
        name: newApp.name || 'New Application',
        code: (newApp.code || `APP_${Date.now()}`).toUpperCase(),
        description: newApp.description || '',
        base_url: newApp.approvalEndpoint || 'https://api.example.com',
        environment: newApp.environment || 'Production',
        status: newApp.status || 'Active',
        auth_type: newApp.authType || 'None',
        auth_config_json: newApp.apiKeyHeader ? { header_name: newApp.apiKeyHeader, api_key: newApp.apiKeyValue } : null
      };

      const res = await fetch('/api/integrations/v2/applications', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showNotification(`Application "${payload.name}" saved in database.`);
        await fetchLiveApps();
      } else {
        const err = await res.json();
        showNotification(`Failed to save: ${err.detail || 'Server error'}`);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  const handleUpdateApp = async (updatedApp: ThirdPartyApplication) => {
    try {
      const appIdNum = parseInt(updatedApp.id);
      if (isNaN(appIdNum)) return;
      const payload = {
        name: updatedApp.name,
        code: updatedApp.code,
        description: updatedApp.description,
        base_url: updatedApp.approvalEndpoint,
        environment: updatedApp.environment,
        status: updatedApp.status,
        auth_type: updatedApp.authType
      };

      const res = await fetch(`/api/integrations/v2/applications/${appIdNum}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showNotification(`Application "${updatedApp.name}" updated in database.`);
        await fetchLiveApps();
      } else {
        const err = await res.json();
        showNotification(`Failed to update: ${err.detail || 'Server error'}`);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  const handleDeleteApp = async (appId: string) => {
    try {
      const appIdNum = parseInt(appId);
      if (isNaN(appIdNum)) return;
      const res = await fetch(`/api/integrations/v2/applications/${appIdNum}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        showNotification(`Application deleted from database.`);
        await fetchLiveApps();
        await fetchLiveRules();
      } else {
        const err = await res.json();
        showNotification(`Failed to delete: ${err.detail || 'Server error'}`);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  // Handlers for Rules (Connected to Backend Database)
  const handleSaveRule = async (rule: SyncRule, status: 'Active' | 'Draft') => {
    try {
      const appIdNum = parseInt(rule.applicationId);
      const ruleIdNum = parseInt(rule.id);
      const isExisting = !isNaN(ruleIdNum);

      const targetAppId = !isNaN(appIdNum) ? appIdNum : (apps[0]?.id ? parseInt(apps[0].id) : 1);

      const payload = {
        rule_name: rule.ruleName,
        description: `Rule for ${rule.ruleName}`,
        application_id: targetAppId,
        status: status === 'Active' ? 'ACTIVE' : 'DRAFT',
        priority: rule.priority || 1,
        trigger_event: 'FDO_FINAL_DECISION',
        run_when: 'BOTH',
        conditions_json: { logicalOperator: 'AND', conditions: rule.conditions },
        http_method: rule.approvedAction?.method || 'POST',
        url_mode: 'CUSTOM',
        custom_url: rule.approvedAction?.url || 'https://api.example.com/callback',
        endpoint_path: '',
        body_type: 'JSON',
        payload_source: 'SQL_PROCEDURE',
        stored_procedure_name: 'sp_GetApprovalCallbackPayload',
        content_type: 'application/json'
      };

      const url = isExisting
        ? `/api/integrations/v2/rules/${ruleIdNum}`
        : '/api/integrations/v2/rules';
      const method = isExisting ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showNotification(`Rule "${rule.ruleName}" saved to database.`);
        await fetchLiveRules();
        await fetchLiveApps();
      } else {
        const err = await res.json();
        showNotification(`Failed to save rule: ${err.detail || 'Server error'}`);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  // Retry Sync Handler (Connected to Backend Database)
  const handleRetrySync = async (logId: string) => {
    try {
      const res = await fetch(`/api/integrations/v2/logs/${logId}/retry`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (res.ok) {
        const json = await res.json();
        showNotification(`Retry executed: ${json.message || 'Success'}`);
        await fetchLiveLogs();
      } else {
        const err = await res.json();
        showNotification(`Retry failed: ${err.detail || 'Server error'}`);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden font-sans space-y-2">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-800 flex items-center gap-2.5 animate-slideUp text-xs font-bold">
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card & Navigation Bar */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
        {/* Module Title */}
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-blue-600 rounded-md flex items-center justify-center text-white font-black shadow-2xs shrink-0">
            <Share2 className="h-3.5 w-3.5" />
          </div>
          <div>
            <h1 className="text-[11px] font-black text-slate-900 tracking-wider uppercase font-display">
              DAPI Sync Back Module
            </h1>
            <p className="text-[10px] text-slate-400 font-medium">
              Sync workflow decision notifications to third-party applications.
            </p>
          </div>
        </div>

        {/* Clean 3-Page Navigation Bar */}
        <div className="flex bg-slate-100/90 p-0.5 rounded-lg border border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab('applications')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'applications'
                ? 'bg-blue-600 text-white shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className="h-3 w-3" /> Target Applications ({apps.length})
          </button>
          <button
            onClick={() => setActiveTab('studio')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'studio'
                ? 'bg-white text-blue-600 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="h-3 w-3 text-blue-600" /> Application Studio & Rules
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'logs'
                ? 'bg-white text-blue-600 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ListFilter className="h-3 w-3" /> Delivery Logs ({logs.length})
          </button>
        </div>
      </div>

      {/* Render Active View Page */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'applications' && (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <ApplicationsTab
              apps={apps}
              onAddApp={handleAddApp}
              onUpdateApp={handleUpdateApp}
              onDeleteApp={handleDeleteApp}
              onConfigureSync={(appId) => {
                setSelectedAppIdForConfig(appId);
                setActiveTab('studio');
              }}
              onTestConnection={(app) => {
                setSelectedAppIdForConfig(app.id);
                setActiveTab('studio');
              }}
            />
          </div>
        )}

        {(activeTab === 'studio' || activeTab === 'simple') && (
          <ApplicationStudioPage
            apps={apps}
            rules={rules}
            selectedAppId={selectedAppIdForConfig}
            onBackToApps={() => setActiveTab('applications')}
            onSaveRule={handleSaveRule}
          />
        )}

        {activeTab === 'logs' && (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <SyncLogsTab
              logs={logs}
              onRetrySync={handleRetrySync}
            />
          </div>
        )}
      </div>
    </div>
  );
}
