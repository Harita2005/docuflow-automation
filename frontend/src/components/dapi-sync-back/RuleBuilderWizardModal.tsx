import React, { useState } from 'react';
import {
  GitBranch,
  Server,
  FileText,
  Sliders,
  CheckCircle,
  XCircle,
  Layers,
  Zap,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Lock,
  Code,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import {
  SyncRule,
  ThirdPartyApplication,
  Condition,
  FieldMapping,
  EndpointConfig,
  HttpMethod,
  AuthType
} from '../../types/dapiSyncBack';
import { SYSTEM_FIELDS, DEFAULT_FIELD_MAPPINGS } from './mockSyncBackData';

interface RuleBuilderWizardModalProps {
  apps: ThirdPartyApplication[];
  ruleToEdit?: SyncRule | null;
  onClose: () => void;
  onSaveRule: (rule: SyncRule, saveStatus: 'Active' | 'Draft') => void;
}

export default function RuleBuilderWizardModal({
  apps,
  ruleToEdit,
  onClose,
  onSaveRule
}: RuleBuilderWizardModalProps) {
  // Requirement 26: 9-Step Guided Wizard Flow
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [selectedAppId, setSelectedAppId] = useState<string>(
    ruleToEdit?.applicationId || apps[0]?.id || ''
  );
  const [ruleName, setRuleName] = useState<string>(
    ruleToEdit?.ruleName || 'New Sync-Back Rule'
  );
  const [selectedDocType, setSelectedDocType] = useState<string>(
    ruleToEdit?.documentType || 'Purchase Order'
  );
  const [priority, setPriority] = useState<number>(ruleToEdit?.priority || 1);

  // Conditions State (Requirement 8 & 9)
  const [conditions, setConditions] = useState<Condition[]>(
    ruleToEdit?.conditions || [
      { id: 'c-1', field: 'Approval Status', operator: 'Equals', value: 'Approved', logicalOperator: 'AND' }
    ]
  );

  // Approved Endpoint State (Requirement 5 & 6)
  const [approvedAction, setApprovedAction] = useState<EndpointConfig>(
    ruleToEdit?.approvedAction || {
      method: 'POST',
      url: 'https://thirdparty.com/api/documents/approval',
      timeoutMs: 5000,
      retryCount: 3,
      auth: { type: 'API Key', apiKeyHeader: 'X-API-KEY', apiKeyValue: 'secret_key' },
      headers: [{ id: 'h-1', key: 'Content-Type', value: 'application/json' }],
      requestBodyTemplate: ''
    }
  );

  // Rejected Endpoint State (Requirement 5 & 6)
  const [rejectedAction, setRejectedAction] = useState<EndpointConfig>(
    ruleToEdit?.rejectedAction || {
      method: 'POST',
      url: 'https://thirdparty.com/api/documents/rejection',
      timeoutMs: 5000,
      retryCount: 3,
      auth: { type: 'API Key', apiKeyHeader: 'X-API-KEY', apiKeyValue: 'secret_key' },
      headers: [{ id: 'hr-1', key: 'Content-Type', value: 'application/json' }],
      requestBodyTemplate: ''
    }
  );

  // Payload Mappings State (Requirement 13)
  const [payloadMappings, setPayloadMappings] = useState<FieldMapping[]>(
    ruleToEdit?.payloadMappings || [...DEFAULT_FIELD_MAPPINGS]
  );

  // Test API Result State
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    loading: boolean;
    status: number;
    responseTimeMs: number;
  }>({ tested: false, loading: false, status: 200, responseTimeMs: 180 });

  const currentApp = apps.find(a => a.id === selectedAppId) || apps[0];

  // Condition Builder Handlers
  const handleAddCondition = () => {
    setConditions(prev => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        field: 'Attachment Status',
        operator: 'Equals',
        value: 'Complete',
        logicalOperator: 'AND'
      }
    ]);
  };

  const handleRemoveCondition = (id: string) => {
    if (conditions.length === 1) return; // Keep at least one condition
    setConditions(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateCondition = (id: string, key: keyof Condition, val: any) => {
    setConditions(prev => prev.map(c => (c.id === id ? { ...c, [key]: val } : c)));
  };

  // Field Mapping Handlers
  const handleAddMapping = () => {
    const unused = SYSTEM_FIELDS.find(sf => !payloadMappings.some(pm => pm.ourField === sf.key)) || SYSTEM_FIELDS[0];
    setPayloadMappings(prev => [
      ...prev,
      {
        id: `fm-${Date.now()}`,
        ourField: unused.key,
        thirdPartyField: unused.key.toLowerCase().replace(/\s+/g, '')
      }
    ]);
  };

  const handleRemoveMapping = (id: string) => {
    setPayloadMappings(prev => prev.filter(m => m.id !== id));
  };

  // Run Mock Test API (Step 7)
  const handleRunMockTest = () => {
    setTestResult({ tested: false, loading: true, status: 200, responseTimeMs: 0 });
    setTimeout(() => {
      setTestResult({ tested: true, loading: false, status: 200, responseTimeMs: 195 });
    }, 1000);
  };

  // Final Save Handler (Requirement 22)
  const handleCompleteSave = (saveStatus: 'Active' | 'Draft') => {
    const finalRule: SyncRule = {
      id: ruleToEdit?.id || `rule-${Date.now()}`,
      applicationId: selectedAppId,
      applicationName: currentApp?.name || 'Third-Party App',
      ruleName,
      documentType: selectedDocType,
      priority,
      status: saveStatus,
      currentVersion: (ruleToEdit?.currentVersion || 0) + 1,
      versions: [
        ...(ruleToEdit?.versions || []),
        {
          version: (ruleToEdit?.currentVersion || 0) + 1,
          status: saveStatus === 'Active' ? 'Active' : 'Draft',
          createdAt: new Date().toLocaleString(),
          createdBy: 'admin@docuflow.com',
          changeLog: `Rule configured via 9-step visual wizard.`,
          conditionsCount: conditions.length
        }
      ],
      conditions,
      approvedAction,
      rejectedAction,
      payloadMappings,
      lastModified: new Date().toLocaleString()
    };

    onSaveRule(finalRule, saveStatus);
    onClose();
  };

  const steps = [
    { num: 1, label: 'Application' },
    { num: 2, label: 'Doc Type' },
    { num: 3, label: 'IF Conditions' },
    { num: 4, label: 'APPROVED API' },
    { num: 5, label: 'REJECTED API' },
    { num: 6, label: 'Payload Map' },
    { num: 7, label: 'Test API' },
    { num: 8, label: 'Summary' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden animate-fadeIn flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm font-display tracking-wide">
                Requirement 26 DAPI Sync-Back Rule Builder Wizard
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Configure IF condition → decision → endpoint pipeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Wizard Stepper Progress Bar */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[640px]">
            {steps.map((s, idx) => (
              <React.Fragment key={s.num}>
                <div
                  onClick={() => setCurrentStep(s.num)}
                  className={`flex items-center gap-2 cursor-pointer transition ${
                    currentStep === s.num
                      ? 'text-blue-600 font-extrabold'
                      : currentStep > s.num
                      ? 'text-emerald-600 font-bold'
                      : 'text-slate-400 font-semibold'
                  }`}
                >
                  <div
                    className={`h-6 w-6 rounded-full text-xs font-mono font-black flex items-center justify-center ${
                      currentStep === s.num
                        ? 'bg-blue-600 text-white shadow-md'
                        : currentStep > s.num
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {currentStep > s.num ? '✓' : s.num}
                  </div>
                  <span className="text-[11px] whitespace-nowrap">{s.label}</span>
                </div>

                {idx < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 ${
                      currentStep > s.num ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Wizard Step Content Views */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* STEP 1: Select Application */}
          {currentStep === 1 && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="text-center space-y-1">
                <h4 className="text-base font-black text-slate-900 font-display">
                  Step 1: Select Target Third-Party Application
                </h4>
                <p className="text-xs text-slate-500">
                  Which application will receive this sync-back decision?
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Target Application *
                </label>
                {apps.map(app => (
                  <div
                    key={app.id}
                    onClick={() => setSelectedAppId(app.id)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      selectedAppId === app.id
                        ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-blue-600 text-white rounded-lg flex items-center justify-center font-extrabold shrink-0">
                        <Server className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="block text-xs font-extrabold text-slate-900">{app.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{app.code} • {app.environment}</span>
                      </div>
                    </div>
                    {selectedAppId === app.id && (
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Select Document Type */}
          {currentStep === 2 && (
            <div className="space-y-4 max-w-lg mx-auto">
              <div className="text-center space-y-1">
                <h4 className="text-base font-black text-slate-900 font-display">
                  Step 2: Select Document Type & Rule Priority
                </h4>
                <p className="text-xs text-slate-500">
                  Specify which incoming document category triggers this rule.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Document Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(currentApp?.documentTypes || ['Purchase Order', 'Invoice', 'Contract']).map(dt => (
                    <button
                      type="button"
                      key={dt}
                      onClick={() => setSelectedDocType(dt)}
                      className={`p-3.5 rounded-xl border text-xs font-bold transition text-left cursor-pointer ${
                        selectedDocType === dt
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                          : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <FileText className="h-4 w-4 mb-2 opacity-80" />
                      {dt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Rule Evaluation Priority
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400 font-medium mt-1 block">
                  Lower numbers execute first (Priority 1 &gt; Priority 2).
                </span>
              </div>
            </div>
          )}

          {/* STEP 3: Define IF Conditions (Requirement 8 & 9) */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h4 className="text-base font-black text-slate-900 font-display">
                  Step 3: Requirement 8 & 9 Configurable IF Conditions
                </h4>
                <p className="text-xs text-slate-500">
                  Build rule logic using configurable operators and logical AND / OR connectors.
                </p>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {conditions.map((cond, index) => (
                  <div key={cond.id} className="space-y-2">
                    <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-col md:flex-row items-center gap-3">
                      {/* Field */}
                      <div className="flex-1 w-full">
                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                          Field
                        </label>
                        <select
                          value={cond.field}
                          onChange={(e) => handleUpdateCondition(cond.id, 'field', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                        >
                          <option value="Approval Status">Approval Status</option>
                          <option value="IA Approval">IA Approval</option>
                          <option value="Checklist Status">Checklist Status</option>
                          <option value="Attachment Status">Attachment Status</option>
                          <option value="Document Status">Document Status</option>
                          <option value="Category">Category</option>
                          <option value="Company">Company</option>
                          <option value="Branch">Branch</option>
                          <option value="Cost Center">Cost Center</option>
                          <option value="Pay Mode">Pay Mode</option>
                          <option value="Document Type">Document Type</option>
                        </select>
                      </div>

                      {/* Operator */}
                      <div className="w-full md:w-44">
                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                          Operator
                        </label>
                        <select
                          value={cond.operator}
                          onChange={(e) => handleUpdateCondition(cond.id, 'operator', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-blue-600 font-mono"
                        >
                          <option value="Equals">Equals (=)</option>
                          <option value="Not Equals">Not Equals (!=)</option>
                          <option value="Contains">Contains</option>
                          <option value="Does Not Contain">Does Not Contain</option>
                          <option value="Greater Than">Greater Than (&gt;)</option>
                          <option value="Less Than">Less Than (&lt;)</option>
                          <option value="Is Empty">Is Empty</option>
                          <option value="Is Not Empty">Is Not Empty</option>
                        </select>
                      </div>

                      {/* Value */}
                      <div className="flex-1 w-full">
                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                          Expected Value
                        </label>
                        <input
                          type="text"
                          value={cond.value}
                          onChange={(e) => handleUpdateCondition(cond.id, 'value', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                          placeholder="e.g. Approved"
                        />
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => handleRemoveCondition(cond.id)}
                        disabled={conditions.length === 1}
                        className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer self-end md:self-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Logical Operator AND / OR Connector */}
                    {index < conditions.length - 1 && (
                      <div className="flex justify-center">
                        <select
                          value={cond.logicalOperator || 'AND'}
                          onChange={(e) => handleUpdateCondition(cond.id, 'logicalOperator', e.target.value)}
                          className="px-3 py-1 bg-purple-100 border border-purple-200 rounded-full text-[10px] font-black text-purple-800 uppercase tracking-widest cursor-pointer shadow-2xs"
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                      </div>
                    )}
                  </div>
                ))}

                <button
                  onClick={handleAddCondition}
                  className="w-full py-2 bg-white hover:bg-slate-100 text-blue-600 border border-dashed border-blue-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> Add Another Condition Block
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Configure APPROVED Endpoint */}
          {currentStep === 4 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="text-center space-y-1">
                <h4 className="text-base font-black text-emerald-600 font-display flex items-center justify-center gap-2">
                  <CheckCircle className="h-5 w-5" /> Step 4: APPROVED Decision Endpoint
                </h4>
                <p className="text-xs text-slate-500">
                  Where should the system send the payload when conditions evaluate to APPROVED?
                </p>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    HTTP Method
                  </label>
                  <select
                    value={approvedAction.method}
                    onChange={(e) => setApprovedAction({ ...approvedAction, method: e.target.value as HttpMethod })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Endpoint URL
                  </label>
                  <input
                    type="url"
                    value={approvedAction.url}
                    onChange={(e) => setApprovedAction({ ...approvedAction, url: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Authentication Scheme
                  </label>
                  <select
                    value={approvedAction.auth.type}
                    onChange={(e) => setApprovedAction({ ...approvedAction, auth: { ...approvedAction.auth, type: e.target.value as AuthType } })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    <option value="None">None</option>
                    <option value="API Key">API Key</option>
                    <option value="Bearer Token">Bearer Token</option>
                    <option value="Basic Authentication">Basic Authentication</option>
                    <option value="OAuth 2.0">OAuth 2.0</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Configure REJECTED Endpoint */}
          {currentStep === 5 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="text-center space-y-1">
                <h4 className="text-base font-black text-rose-600 font-display flex items-center justify-center gap-2">
                  <XCircle className="h-5 w-5" /> Step 5: REJECTED Decision Endpoint
                </h4>
                <p className="text-xs text-slate-500">
                  Where should the system send the payload when conditions evaluate to REJECTED?
                </p>
              </div>

              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    HTTP Method
                  </label>
                  <select
                    value={rejectedAction.method}
                    onChange={(e) => setRejectedAction({ ...rejectedAction, method: e.target.value as HttpMethod })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Endpoint URL
                  </label>
                  <input
                    type="url"
                    value={rejectedAction.url}
                    onChange={(e) => setRejectedAction({ ...rejectedAction, url: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Authentication Scheme
                  </label>
                  <select
                    value={rejectedAction.auth.type}
                    onChange={(e) => setRejectedAction({ ...rejectedAction, auth: { ...rejectedAction.auth, type: e.target.value as AuthType } })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    <option value="None">None</option>
                    <option value="API Key">API Key</option>
                    <option value="Bearer Token">Bearer Token</option>
                    <option value="Basic Authentication">Basic Authentication</option>
                    <option value="OAuth 2.0">OAuth 2.0</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Payload Field Mapping */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h4 className="text-base font-black text-slate-900 font-display">
                  Step 6: Map Payload Attributes
                </h4>
                <p className="text-xs text-slate-500">
                  Select which system document fields get mapped into outgoing JSON keys.
                </p>
              </div>

              <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {payloadMappings.map(pm => (
                  <div key={pm.id} className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="w-1/3 text-xs font-bold text-slate-800">{pm.ourField}</span>
                    <span className="text-blue-600 font-bold">→</span>
                    <input
                      type="text"
                      value={pm.thirdPartyField}
                      onChange={(e) => setPayloadMappings(payloadMappings.map(m => m.id === pm.id ? { ...m, thirdPartyField: e.target.value } : m))}
                      className="flex-1 px-3 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono font-bold"
                    />
                    <button
                      onClick={() => handleRemoveMapping(pm.id)}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleAddMapping}
                  className="w-full py-1.5 bg-white text-blue-600 border border-dashed border-blue-300 rounded-lg text-xs font-bold mt-2"
                >
                  + Add Mapping
                </button>
              </div>
            </div>
          )}

          {/* STEP 7: Test API Execution */}
          {currentStep === 7 && (
            <div className="space-y-4 max-w-lg mx-auto text-center">
              <h4 className="text-base font-black text-slate-900 font-display">
                Step 7: Test API Connectivity
              </h4>
              <p className="text-xs text-slate-500">
                Simulate a mock request to verify that the target endpoint responds with HTTP 200.
              </p>

              <div className="p-6 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 space-y-4 shadow-2xs">
                <Zap className="h-8 w-8 text-blue-600 mx-auto" />
                <div className="text-xs font-mono font-bold text-slate-700">
                  Target: {approvedAction.method} {approvedAction.url}
                </div>

                <button
                  onClick={handleRunMockTest}
                  disabled={testResult.loading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-md cursor-pointer"
                >
                  {testResult.loading ? 'Executing Test...' : 'Run Live Mock Test'}
                </button>

                {testResult.tested && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-mono font-bold">
                    ✓ Mock Test Passed — HTTP {testResult.status} OK ({testResult.responseTimeMs} ms)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 8: Requirement 22 Configuration Summary */}
          {currentStep === 8 && (
            <div className="space-y-4 max-w-xl mx-auto">
              <div className="text-center space-y-1">
                <h4 className="text-base font-black text-slate-900 font-display">
                  Requirement 22 Final Configuration Summary
                </h4>
                <p className="text-xs text-slate-500">
                  Review rule settings before saving to production.
                </p>
              </div>

              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-500 uppercase">Application</span>
                  <span className="font-extrabold text-slate-900">{currentApp?.name}</span>
                </div>

                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-500 uppercase">Document Type</span>
                  <span className="font-extrabold text-blue-600">{selectedDocType}</span>
                </div>

                <div className="border-b border-slate-200 pb-2 space-y-1">
                  <span className="font-bold text-slate-500 uppercase block">IF Conditions</span>
                  <p className="font-mono text-[11px] bg-white p-2 rounded border">
                    {conditions.map(c => `${c.field} ${c.operator} "${c.value}"`).join(' AND ')}
                  </p>
                </div>

                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-500 uppercase">Approved Action</span>
                  <span className="font-mono font-bold text-emerald-600">{approvedAction.method} {approvedAction.url}</span>
                </div>

                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-slate-500 uppercase">Rejected Action</span>
                  <span className="font-mono font-bold text-rose-600">{rejectedAction.method} {rejectedAction.url}</span>
                </div>

                <div className="space-y-1">
                  <span className="font-bold text-slate-500 uppercase block">Payload Mapped Fields</span>
                  <div className="flex flex-wrap gap-1">
                    {payloadMappings.map(pm => (
                      <span key={pm.id} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono font-bold">
                        {pm.ourField} → {pm.thirdPartyField}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Stepper Controls (Requirement 22 Buttons) */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition disabled:opacity-30 cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" /> Previous
          </button>

          <div className="flex items-center gap-2">
            {currentStep === 8 ? (
              <>
                <button
                  type="button"
                  onClick={() => handleCompleteSave('Draft')}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleCompleteSave('Active')}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  ✓ Save & Enable
                </button>
              </>
            ) : (
              <button
                onClick={() => setCurrentStep(prev => Math.min(8, prev + 1))}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
              >
                Next Step <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
