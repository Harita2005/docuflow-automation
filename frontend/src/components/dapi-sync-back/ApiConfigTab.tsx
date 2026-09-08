import React, { useState } from 'react';
import {
  Globe,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Zap,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
  Code,
  Check,
  Play
} from 'lucide-react';
import {
  EndpointConfig,
  ThirdPartyApplication,
  HttpMethod,
  AuthType,
  HeaderConfig
} from '../../types/dapiSyncBack';

interface ApiConfigTabProps {
  apps: ThirdPartyApplication[];
  selectedAppId: string;
  onSelectApp: (appId: string) => void;
  approvedConfig: EndpointConfig;
  rejectedConfig: EndpointConfig;
  onSaveConfig: (approved: EndpointConfig, rejected: EndpointConfig) => void;
}

export default function ApiConfigTab({
  apps,
  selectedAppId,
  onSelectApp,
  approvedConfig,
  rejectedConfig,
  onSaveConfig
}: ApiConfigTabProps) {
  const [activeDecisionTab, setActiveDecisionTab] = useState<'APPROVED' | 'REJECTED'>('APPROVED');

  // Form State
  const [approvedState, setApprovedState] = useState<EndpointConfig>(approvedConfig);
  const [rejectedState, setRejectedState] = useState<EndpointConfig>(rejectedConfig);

  // Secret Visibility
  const [showSecret, setShowSecret] = useState(false);

  // Test API Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testEndpointType, setTestEndpointType] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [testResult, setTestResult] = useState<{
    loading: boolean;
    executed: boolean;
    status: number;
    statusText: string;
    responseTimeMs: number;
    responseBody: any;
  } | null>(null);

  const currentApp = apps.find(a => a.id === selectedAppId) || apps[0];
  const activeState = activeDecisionTab === 'APPROVED' ? approvedState : rejectedState;
  const setActiveState = activeDecisionTab === 'APPROVED' ? setApprovedState : setRejectedState;

  const handleMethodChange = (method: HttpMethod) => {
    setActiveState(prev => ({ ...prev, method }));
  };

  const handleAuthTypeChange = (type: AuthType) => {
    setActiveState(prev => ({
      ...prev,
      auth: { ...prev.auth, type }
    }));
  };

  const handleAddHeader = () => {
    setActiveState(prev => ({
      ...prev,
      headers: [
        ...prev.headers,
        { id: `h-${Date.now()}`, key: 'Custom-Header', value: 'Value' }
      ]
    }));
  };

  const handleRemoveHeader = (id: string) => {
    setActiveState(prev => ({
      ...prev,
      headers: prev.headers.filter(h => h.id !== id)
    }));
  };

  const handleUpdateHeader = (id: string, key: string, value: string) => {
    setActiveState(prev => ({
      ...prev,
      headers: prev.headers.map(h => (h.id === id ? { ...h, key, value } : h))
    }));
  };

  // Run Test API Mock Execution (Requirement 15)
  const handleRunApiTest = (type: 'APPROVED' | 'REJECTED') => {
    setTestEndpointType(type);
    setIsTestModalOpen(true);
    setTestResult({
      loading: true,
      executed: false,
      status: 200,
      statusText: 'OK',
      responseTimeMs: 0,
      responseBody: null
    });

    const targetConfig = type === 'APPROVED' ? approvedState : rejectedState;

    // Simulate API HTTP execution
    setTimeout(() => {
      if (targetConfig.url.includes('invalid') || targetConfig.url.includes('fail')) {
        setTestResult({
          loading: false,
          executed: true,
          status: 401,
          statusText: 'Unauthorized',
          responseTimeMs: 412,
          responseBody: {
            success: false,
            error: 'Invalid authentication credentials provided in request header.'
          }
        });
      } else {
        setTestResult({
          loading: false,
          executed: true,
          status: 200,
          statusText: 'OK',
          responseTimeMs: 198,
          responseBody: {
            success: true,
            status: type === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            message: `Document decision successfully synced to ${currentApp.name}`,
            referenceId: `REF-SYNC-${Math.floor(100000 + Math.random() * 900000)}`,
            timestamp: new Date().toISOString()
          }
        });
      }
    }, 1200);
  };

  return (
    <div className="space-y-4">
      {/* Target Application Selector Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-extrabold border border-blue-100">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide">
              API Configuration Target Application
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              Configure independent HTTP endpoints, security auth, headers & retry behavior.
            </p>
          </div>
        </div>

        <select
          value={selectedAppId}
          onChange={(e) => onSelectApp(e.target.value)}
          className="w-full sm:w-72 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
        >
          {apps.map(app => (
            <option key={app.id} value={app.id}>
              {app.name} ({app.code})
            </option>
          ))}
        </select>
      </div>

      {/* Decision Endpoints Switcher (Approved vs Rejected) */}
      <div className="flex bg-slate-200/80 p-1 rounded-xl border border-slate-300 self-start w-fit">
        <button
          onClick={() => setActiveDecisionTab('APPROVED')}
          className={`px-5 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
            activeDecisionTab === 'APPROVED'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          <CheckCircle className="h-4 w-4" /> APPROVED Endpoint Configuration
        </button>
        <button
          onClick={() => setActiveDecisionTab('REJECTED')}
          className={`px-5 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
            activeDecisionTab === 'REJECTED'
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          <XCircle className="h-4 w-4" /> REJECTED Endpoint Configuration
        </button>
      </div>

      {/* Main Configuration Form Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-6 space-y-6">
        {/* Requirement 5 Safety Warnings for GET/DELETE */}
        {(activeState.method === 'GET' || activeState.method === 'DELETE') && (
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-center gap-3 text-amber-800 text-xs font-medium">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-extrabold uppercase block">Requirement 5 Safety Warning:</span>
              <span>
                Using <strong>{activeState.method}</strong> for a sync-back operation may be non-standard or dangerous. Most sync-back webhooks expect <strong>POST</strong>, <strong>PUT</strong>, or <strong>PATCH</strong> to transmit status payloads safely.
              </span>
            </div>
          </div>
        )}

        {/* Section 1: HTTP Method & Endpoint URL */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
            1. Method & Destination URL
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* HTTP Method */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                HTTP Method
              </label>
              <select
                value={activeState.method}
                onChange={(e) => handleMethodChange(e.target.value as HttpMethod)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="POST">POST (Recommended)</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="GET">GET (Warning)</option>
                <option value="DELETE">DELETE (Warning)</option>
              </select>
            </div>

            {/* Endpoint URL */}
            <div className="md:col-span-3">
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                Target Endpoint URL
              </label>
              <input
                type="url"
                value={activeState.url}
                onChange={(e) => setActiveState({ ...activeState, url: e.target.value })}
                placeholder="https://thirdparty.com/api/documents/callback"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Authentication Configuration (Requirement 6) */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              2. Requirement 6 Authentication Configuration
            </h3>
            <span className="text-[10px] text-slate-400 font-semibold">
              Secrets are masked as ••••••••••••
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Auth Type Selector */}
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                Authentication Scheme
              </label>
              <select
                value={activeState.auth.type}
                onChange={(e) => handleAuthTypeChange(e.target.value as AuthType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="None">None (Public Endpoint)</option>
                <option value="API Key">API Key</option>
                <option value="Bearer Token">Bearer Token</option>
                <option value="Basic Authentication">Basic Authentication</option>
                <option value="OAuth 2.0">OAuth 2.0</option>
              </select>
            </div>

            {/* Dynamic Auth Fields */}
            {activeState.auth.type === 'API Key' && (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    API Key Header Name
                  </label>
                  <input
                    type="text"
                    value={activeState.auth.apiKeyHeader || 'X-API-KEY'}
                    onChange={(e) => setActiveState({ ...activeState, auth: { ...activeState.auth, apiKeyHeader: e.target.value } })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    API Key Value (Masked)
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={activeState.auth.apiKeyValue || 'secret_key_123'}
                      onChange={(e) => setActiveState({ ...activeState, auth: { ...activeState.auth, apiKeyValue: e.target.value } })}
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeState.auth.type === 'Bearer Token' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                  Bearer Token Value (Masked)
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={activeState.auth.bearerToken || 'eyJhbGciOiJIUzI1Ni...'}
                    onChange={(e) => setActiveState({ ...activeState, auth: { ...activeState.auth, bearerToken: e.target.value } })}
                    className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {activeState.auth.type === 'Basic Authentication' && (
              <>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Basic Username
                  </label>
                  <input
                    type="text"
                    value={activeState.auth.basicUsername || 'admin'}
                    onChange={(e) => setActiveState({ ...activeState, auth: { ...activeState.auth, basicUsername: e.target.value } })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                    Basic Password (Masked)
                  </label>
                  <div className="relative">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      value={activeState.auth.basicPassword || 'password'}
                      onChange={(e) => setActiveState({ ...activeState, auth: { ...activeState.auth, basicPassword: e.target.value } })}
                      className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Section 3: Custom Headers */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              3. HTTP Headers
            </h3>
            <button
              onClick={handleAddHeader}
              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Header
            </button>
          </div>

          <div className="space-y-2">
            {activeState.headers.map(h => (
              <div key={h.id} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Header Name (e.g. X-API-KEY)"
                  value={h.key}
                  onChange={(e) => handleUpdateHeader(h.id, e.target.value, h.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
                <input
                  type="text"
                  placeholder="Header Value"
                  value={h.value}
                  onChange={(e) => handleUpdateHeader(h.id, h.key, e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                />
                <button
                  onClick={() => handleRemoveHeader(h.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Timeout & Retries */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
            4. Timeout & Retry Policy
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                Timeout (Milliseconds)
              </label>
              <input
                type="number"
                value={activeState.timeoutMs}
                onChange={(e) => setActiveState({ ...activeState, timeoutMs: parseInt(e.target.value) || 5000 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 uppercase mb-1">
                Max Retry Count (Exponential Back-off)
              </label>
              <input
                type="number"
                min={0}
                max={5}
                value={activeState.retryCount}
                onChange={(e) => setActiveState({ ...activeState, retryCount: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
          {/* Requirement 15 Test API button */}
          <button
            type="button"
            onClick={() => handleRunApiTest(activeDecisionTab)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Zap className="h-4 w-4 text-amber-400" /> Test {activeDecisionTab} API Endpoint
          </button>

          <button
            type="button"
            onClick={() => onSaveConfig(approvedState, rejectedState)}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-blue-500/20 cursor-pointer"
          >
            Save API Configuration
          </button>
        </div>
      </div>

      {/* Requirement 15 Test API Interactive Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-fadeIn">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-400" />
                <h3 className="font-extrabold text-sm tracking-wide">
                  Requirement 15 API Connection Test — {testEndpointType} Endpoint
                </h3>
              </div>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto font-mono text-xs">
              {/* Request Info Box */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-white space-y-2">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                  <span className="font-bold text-blue-400">OUTGOING REQUEST</span>
                  <span className="font-bold px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                    {activeState.method}
                  </span>
                </div>
                <p className="text-slate-300 break-all">{activeState.url}</p>
                <div className="text-[11px] text-slate-400 pt-1">
                  Headers: Auth ({activeState.auth.type}), Content-Type (application/json)
                </div>
              </div>

              {/* Response Execution Box */}
              {testResult?.loading ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="font-bold text-slate-700">Dispatching test payload to target endpoint...</p>
                </div>
              ) : testResult?.executed ? (
                <div className="space-y-3">
                  {/* Status Bar */}
                  <div className={`p-3 rounded-xl border flex items-center justify-between font-bold ${
                    testResult.status === 200
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      {testResult.status === 200 ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-600" />
                      )}
                      <span>
                        {testResult.status === 200 ? '✓ Request Successful' : '✕ Request Failed'} — HTTP {testResult.status} {testResult.statusText}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono opacity-80">{testResult.responseTimeMs} ms</span>
                  </div>

                  {/* Body Box */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                      Response Body Output
                    </label>
                    <pre className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 text-emerald-400 overflow-x-auto">
                      {JSON.stringify(testResult.responseBody, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">
                Simulated mock execution (no real production mutations caused)
              </span>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="px-4 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-bold cursor-pointer"
              >
                Close Test Modal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
