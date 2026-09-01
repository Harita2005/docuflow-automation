import React, { useState } from 'react';
import {
  Server,
  ListFilter,
  Share2,
  Zap,
  CheckCircle
} from 'lucide-react';
import {
  ThirdPartyApplication,
  SyncRule,
  SyncLog,
  FieldMapping
} from '../../types/dapiSyncBack';
import {
  INITIAL_APPLICATIONS,
  INITIAL_RULES,
  INITIAL_SYNC_LOGS,
  DEFAULT_FIELD_MAPPINGS
} from './mockSyncBackData';

import ApplicationsTab from './ApplicationsTab';
import SyncLogsTab from './SyncLogsTab';
import SimpleSyncConfigurator from './SimpleSyncConfigurator';

export type SyncBackTab = 'applications' | 'simple' | 'logs';

interface DapiSyncBackHubProps {
  initialTab?: SyncBackTab;
}

export default function DapiSyncBackHub({ initialTab = 'applications' }: DapiSyncBackHubProps) {
  const [activeTab, setActiveTab] = useState<SyncBackTab>(initialTab);

  // Persistent State
  const [apps, setApps] = useState<ThirdPartyApplication[]>(INITIAL_APPLICATIONS);
  const [rules, setRules] = useState<SyncRule[]>(INITIAL_RULES);
  const [logs, setLogs] = useState<SyncLog[]>(INITIAL_SYNC_LOGS);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>(DEFAULT_FIELD_MAPPINGS);

  // Selected Target App for API Config & Rules
  const [selectedAppIdForConfig, setSelectedAppIdForConfig] = useState<string>(apps[0]?.id || '');

  // Wizard Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingRuleForWizard, setEditingRuleForWizard] = useState<SyncRule | null>(null);

  // Toast Banner State
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Handlers for Applications
  const handleAddApp = (newApp: Partial<ThirdPartyApplication>) => {
    const created: ThirdPartyApplication = {
      id: newApp.id || `app-${Date.now()}`,
      name: newApp.name || 'New Application',
      code: newApp.code || 'APP_NEW',
      description: newApp.description || '',
      documentTypes: newApp.documentTypes || ['Purchase Order'],
      status: newApp.status || 'Active',
      syncStatus: newApp.syncStatus || 'Enabled',
      approvalEndpoint: newApp.approvalEndpoint || 'https://api.example.com/approval',
      rejectionEndpoint: newApp.rejectionEndpoint || 'https://api.example.com/rejection',
      lastSync: 'Never',
      rulesCount: 0,
      environment: newApp.environment || 'Production'
    };

    setApps(prev => [created, ...prev]);
    showNotification(`Application "${created.name}" created successfully!`);
  };

  const handleUpdateApp = (updatedApp: ThirdPartyApplication) => {
    setApps(prev => prev.map(a => a.id === updatedApp.id ? updatedApp : a));
    showNotification(`Application "${updatedApp.name}" updated.`);
  };

  const handleDeleteApp = (appId: string) => {
    const app = apps.find(a => a.id === appId);
    setApps(prev => prev.filter(a => a.id !== appId));
    setRules(prev => prev.filter(r => r.applicationId !== appId));
    showNotification(`Application "${app?.name || appId}" deleted.`);
  };

  // Handlers for Rules
  const handleSaveRule = (rule: SyncRule, status: 'Active' | 'Draft') => {
    setRules(prev => {
      const exists = prev.some(r => r.id === rule.id);
      if (exists) {
        return prev.map(r => r.id === rule.id ? rule : r);
      } else {
        return [rule, ...prev];
      }
    });

    // Update app rule count
    setApps(prev => prev.map(a => {
      if (a.id === rule.applicationId) {
        return { ...a, rulesCount: (a.rulesCount || 0) + 1 };
      }
      return a;
    }));

    showNotification(`Rule "${rule.ruleName}" saved as ${status}.`);
  };

  const handleDeleteRule = (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    setRules(prev => prev.filter(r => r.id !== ruleId));
    showNotification(`Rule "${rule?.ruleName}" deleted.`);
  };

  const handleDuplicateRule = (rule: SyncRule) => {
    const dup: SyncRule = {
      ...rule,
      id: `rule-${Date.now()}`,
      ruleName: `${rule.ruleName} (Copy)`,
      priority: rule.priority + 1,
      status: 'Draft',
      currentVersion: 1,
      versions: [
        {
          version: 1,
          status: 'Draft',
          createdAt: new Date().toLocaleString(),
          createdBy: 'admin@docuflow.com',
          changeLog: 'Duplicated from existing rule.',
          conditionsCount: rule.conditions.length
        }
      ]
    };
    setRules(prev => [...prev, dup]);
    showNotification(`Duplicated rule as "${dup.ruleName}".`);
  };

  const handleReorderPriority = (ruleId: string, direction: 'up' | 'down') => {
    setRules(prev => {
      const sorted = [...prev].sort((a, b) => a.priority - b.priority);
      const index = sorted.findIndex(r => r.id === ruleId);
      if (index === -1) return prev;

      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sorted.length) return prev;

      // Swap priorities
      const tempP = sorted[index].priority;
      sorted[index].priority = sorted[targetIndex].priority;
      sorted[targetIndex].priority = tempP;

      return [...sorted];
    });
    showNotification('Rule priority re-ordered.');
  };

  // Retry Sync Handler (Requirement 18)
  const handleRetrySync = (logId: string) => {
    setLogs(prev => prev.map(l => {
      if (l.id === logId) {
        const attemptNum = l.retryCount + 1;
        return {
          ...l,
          syncStatus: 'Success',
          httpStatus: 200,
          retryCount: attemptNum,
          responseBody: {
            success: true,
            message: 'Manual retry executed successfully.',
            transactionId: `TXN-RETRY-${Math.floor(100000 + Math.random() * 900000)}`,
            retriedAt: new Date().toISOString()
          },
          retryHistory: [
            ...l.retryHistory,
            {
              attempt: attemptNum,
              timestamp: new Date().toLocaleString(),
              status: 'Success',
              httpStatus: 200,
              responseTimeMs: 210
            }
          ]
        };
      }
      return l;
    }));
    showNotification(`Retry initiated for sync log #${logId}. Status updated to Success.`);
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-800 flex items-center gap-2.5 animate-slideUp text-xs font-bold">
          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card & Navigation Bar */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2.5">
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

        {/* Clean, Compact 3-Page Navigation Bar */}
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
            onClick={() => setActiveTab('simple')}
            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'simple'
                ? 'bg-white text-blue-600 shadow-2xs font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Zap className="h-3 w-3 text-blue-600" /> App Sync Configurator
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

      {/* Render Active View Page (Only the 3 Clean Pages) */}
      <div>
        {activeTab === 'applications' && (
          <ApplicationsTab
            apps={apps}
            onAddApp={handleAddApp}
            onUpdateApp={handleUpdateApp}
            onDeleteApp={handleDeleteApp}
            onConfigureSync={(appId) => {
              setSelectedAppIdForConfig(appId);
              setActiveTab('simple');
            }}
            onTestConnection={(app) => {
              setSelectedAppIdForConfig(app.id);
              setActiveTab('simple');
            }}
          />
        )}

        {activeTab === 'simple' && (
          <SimpleSyncConfigurator
            apps={apps}
            rules={rules}
            selectedAppId={selectedAppIdForConfig}
            onSaveRule={handleSaveRule}
            onUpdateApp={handleUpdateApp}
            onAddAppClick={() => setActiveTab('applications')}
            onViewLogsClick={() => setActiveTab('logs')}
          />
        )}

        {activeTab === 'logs' && (
          <SyncLogsTab
            logs={logs}
            onRetrySync={handleRetrySync}
          />
        )}
      </div>
    </div>
  );
}
