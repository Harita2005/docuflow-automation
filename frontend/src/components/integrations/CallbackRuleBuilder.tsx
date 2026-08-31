import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Sliders,
  CheckCircle,
  Plus,
  Trash2,
  Play,
  Copy,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Code,
  ShieldCheck,
  RefreshCw,
  Zap,
  Info
} from "lucide-react";

interface Application {
  id: number;
  name: string;
  code: string;
  base_url: string;
  auth_type: string;
}

interface CallbackRuleBuilderProps {
  initialRule?: any;
  applications: Application[];
  onSave: () => void;
  onCancel: () => void;
}

const STEP_TITLES = [
  "1. Basic Info",
  "2. Trigger & Conditions",
  "3. Endpoint & Method",
  "4. Params & Headers",
  "5. Authentication",
  "6. Payload Mapping",
  "7. Response Handling",
  "8. Retry Settings",
  "9. Test Callback",
  "10. Review & Save"
];

export default function CallbackRuleBuilder({
  initialRule,
  applications,
  onSave,
  onCancel
}: CallbackRuleBuilderProps) {
  const [currentStep, setCurrentStep] = useState(1);

  // Form State
  const [ruleName, setRuleName] = useState(initialRule?.rule_name || "");
  const [description, setDescription] = useState(initialRule?.description || "");
  const [applicationId, setApplicationId] = useState<number>(
    initialRule?.application_id || (applications[0]?.id ?? 0)
  );
  const [ruleStatus, setRuleStatus] = useState(initialRule?.status || "ACTIVE");
  const [priority, setPriority] = useState<number>(initialRule?.priority ?? 100);

  // Trigger & Conditions
  const [triggerEvent, setTriggerEvent] = useState(initialRule?.trigger_event || "FDO_FINAL_DECISION");
  const [runWhen, setRunWhen] = useState(initialRule?.run_when || "BOTH");
  const [logicalOperator, setLogicalOperator] = useState("AND");
  const [conditions, setConditions] = useState<any[]>(() => {
    if (initialRule?.conditions_json) {
      try {
        const parsed = JSON.parse(initialRule.conditions_json);
        if (Array.isArray(parsed)) return parsed;
        if (parsed.conditions) {
          if (parsed.logicalOperator) setLogicalOperator(parsed.logicalOperator);
          return parsed.conditions;
        }
      } catch (e) {}
    }
    return [
      { field: "company", operator: "Equals", value: "VCC" }
    ];
  });

  // Endpoint & Method
  const [httpMethod, setHttpMethod] = useState(initialRule?.http_method || "POST");
  const [urlMode, setUrlMode] = useState(initialRule?.url_mode || "INHERIT_BASE");
  const [endpointPath, setEndpointPath] = useState(initialRule?.endpoint_path || "/v1/approval/callback");
  const [customUrl, setCustomUrl] = useState(initialRule?.custom_url || "https://api.example.com/callback");

  // Query Params & Headers
  const [queryParams, setQueryParams] = useState<any[]>(() => {
    if (initialRule?.query_params_json) {
      try {
        const parsed = JSON.parse(initialRule.query_params_json);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [
      { key: "source", value: "DOCUFLOW", type: "Static" }
    ];
  });

  const [customHeaders, setCustomHeaders] = useState<any[]>(() => {
    if (initialRule?.headers_json) {
      try {
        const parsed = JSON.parse(initialRule.headers_json);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [
      { key: "Content-Type", value: "application/json", type: "Static" }
    ];
  });

  // Authentication Override
  const [authOverrideType, setAuthOverrideType] = useState(initialRule?.auth_override_type || "INHERIT");
  const [authApiKeyHeader, setAuthApiKeyHeader] = useState("X-API-Key");
  const [authApiKeyValue, setAuthApiKeyValue] = useState("");
  const [authBearerToken, setAuthBearerToken] = useState("");

  // Payload Mapping
  const [bodyType, setBodyType] = useState(initialRule?.body_type || "JSON");
  const [contentType, setContentType] = useState(initialRule?.content_type || "application/json");
  const [payloadMappings, setPayloadMappings] = useState<any[]>(() => {
    if (initialRule?.payload_mapping_json) {
      try {
        const parsed = JSON.parse(initialRule.payload_mapping_json);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return [
      { thirdPartyField: "primaryKey", sourceField: "primaryKey" },
      { thirdPartyField: "documentNumber", sourceField: "documentNumber" },
      { thirdPartyField: "approvalStatus", sourceField: "approvalStatus" }
    ];
  });

  const [rawPayloadTemplate, setRawPayloadTemplate] = useState(
    initialRule?.raw_payload_template ||
      '{\n  "primaryKey": "{{primaryKey}}",\n  "documentNumber": "{{documentNumber}}",\n  "approvalStatus": "{{approvalStatus}}"\n}'
  );
  const [useRawTemplate, setUseRawTemplate] = useState(!!initialRule?.raw_payload_template);

  // Response Handling
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(initialRule?.timeout_seconds ?? 30);
  const [successCodes, setSuccessCodes] = useState<string>("200, 201, 202, 204");
  const [followRedirects, setFollowRedirects] = useState<boolean>(!!initialRule?.follow_redirects);

  // Retry Settings
  const [retryMode, setRetryMode] = useState("AUTO");
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [backoffStrategy, setBackoffStrategy] = useState("EXPONENTIAL");

  // Test Runner State
  const [samplePk, setSamplePk] = useState("TEST-84932");
  const [sampleDn, setSampleDn] = useState("TEST-INV-1024");
  const [sampleStatus, setSampleStatus] = useState("APPROVED");
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedApp = applications.find((a) => a.id === applicationId) || applications[0];

  // Helper live summary
  const generateLiveSummary = () => {
    const appName = selectedApp?.name || "Selected Application";
    const condSummary = conditions.length
      ? conditions.map((c) => `${c.field} ${c.operator} '${c.value}'`).join(` ${logicalOperator} `)
      : "Always";

    const pathUrl =
      urlMode === "OVERRIDE"
        ? customUrl
        : `${(selectedApp?.base_url || "").replace(/\/+$/, "")}/${endpointPath.replace(/^\/+/, "")}`;

    return `WHEN Invoice reaches FDO Final Decision (${runWhen}) AND ${condSummary} THEN ${httpMethod} approval decision to ${appName} AT [${pathUrl}].`;
  };

  const handleAddCondition = () => {
    setConditions([...conditions, { field: "company", operator: "Equals", value: "VCC" }]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleAddQueryParam = () => {
    setQueryParams([...queryParams, { key: "", value: "", type: "Dynamic" }]);
  };

  const handleAddHeader = () => {
    setCustomHeaders([...customHeaders, { key: "", value: "", type: "Static" }]);
  };

  const handleAddPayloadMapping = () => {
    setPayloadMappings([...payloadMappings, { thirdPartyField: "", sourceField: "documentNumber" }]);
  };

  // Preview generated JSON
  const generateJsonPreview = () => {
    if (useRawTemplate) {
      return rawPayloadTemplate
        .replace(/{{primaryKey}}/g, samplePk)
        .replace(/{{documentNumber}}/g, sampleDn)
        .replace(/{{approvalStatus}}/g, sampleStatus);
    }
    const previewObj: any = {};
    payloadMappings.forEach((m) => {
      if (m.thirdPartyField) {
        if (m.sourceField === "primaryKey") previewObj[m.thirdPartyField] = samplePk;
        else if (m.sourceField === "documentNumber") previewObj[m.thirdPartyField] = sampleDn;
        else if (m.sourceField === "approvalStatus") previewObj[m.thirdPartyField] = sampleStatus;
        else previewObj[m.thirdPartyField] = `{{${m.sourceField}}}`;
      }
    });
    return JSON.stringify(previewObj, null, 2);
  };

  const handleRunTest = async () => {
    setTesting(true);
    setTestResult(null);

    const ruleConfig = {
      rule_name: ruleName || "Test Callback Rule",
      application_id: applicationId,
      http_method: httpMethod,
      url_mode: urlMode,
      endpoint_path: endpointPath,
      custom_url: customUrl,
      body_type: bodyType,
      content_type: contentType,
      payload_mapping_json: payloadMappings,
      raw_payload_template: useRawTemplate ? rawPayloadTemplate : null,
      query_params_json: queryParams,
      headers_json: customHeaders,
      timeout_seconds: timeoutSeconds
    };

    try {
      const res = await fetch("/api/integrations/v2/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          sample_primary_key: samplePk,
          sample_document_number: sampleDn,
          sample_approval_status: sampleStatus,
          rule_config: ruleConfig
        })
      });

      const json = await res.json();
      setTestResult(json);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message || "Test request failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveRule = async () => {
    if (!ruleName.trim()) {
      setErrorMsg("Rule Name is required.");
      setCurrentStep(1);
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const parsedSuccessCodes = successCodes
      .split(",")
      .map((c) => parseInt(c.trim()))
      .filter((n) => !isNaN(n));

    const payload = {
      rule_name: ruleName.trim(),
      description,
      application_id: applicationId,
      status: ruleStatus,
      priority: Number(priority),
      trigger_event: triggerEvent,
      run_when: runWhen,
      conditions_json: { logicalOperator, conditions },
      http_method: httpMethod,
      url_mode: urlMode,
      endpoint_path: endpointPath,
      custom_url: customUrl,
      body_type: bodyType,
      content_type: contentType,
      payload_mapping_json: payloadMappings,
      raw_payload_template: useRawTemplate ? rawPayloadTemplate : null,
      query_params_json: queryParams,
      headers_json: customHeaders,
      auth_override_type: authOverrideType,
      timeout_seconds: Number(timeoutSeconds),
      success_criteria_json: parsedSuccessCodes,
      follow_redirects: followRedirects,
      retry_config_json: { mode: retryMode, max_attempts: maxAttempts, backoff: backoffStrategy }
    };

    try {
      const url = initialRule?.id ? `/api/integrations/v2/rules/${initialRule.id}` : "/api/integrations/v2/rules";
      const method = initialRule?.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setErrorMsg(json.detail || json.message || "Failed to save callback rule");
      } else {
        onSave();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error while saving rule");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-w-5xl w-full my-auto flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
        <div>
          <h2 className="text-base font-black flex items-center gap-2 font-display">
            <Sliders className="h-5 w-5 text-blue-400" />
            {initialRule ? "Edit Approval Callback Rule" : "Create Callback Rule"}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure when and how FDO approval/rejection decisions are routed to external systems.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>

      {/* Human Readable Live Summary Header */}
      <div className="bg-blue-50/80 border-b border-blue-100 p-3 px-6 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Live Rule Summary</p>
          <p className="text-xs font-semibold text-blue-900 leading-snug">{generateLiveSummary()}</p>
        </div>
      </div>

      {/* Stepper Bar */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 overflow-x-auto flex gap-1">
        {STEP_TITLES.map((title, idx) => {
          const stepNum = idx + 1;
          const isActive = currentStep === stepNum;
          const isDone = currentStep > stepNum;
          return (
            <button
              key={stepNum}
              onClick={() => setCurrentStep(stepNum)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? "bg-blue-600 text-white shadow-xs"
                  : isDone
                  ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  : "bg-white text-slate-400 border border-slate-200 hover:text-slate-600"
              }`}
            >
              {isDone ? <CheckCircle className="h-3 w-3 text-emerald-600" /> : <span>{stepNum}.</span>}
              {title.replace(/^\d+\.\s*/, "")}
            </button>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="p-6 space-y-6 flex-1 overflow-y-auto">
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: BASIC INFO */}
        {currentStep === 1 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 1: Basic Information</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Invoice Payment Approval Callback"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Target Application *
                </label>
                <select
                  value={applicationId}
                  onChange={(e) => setApplicationId(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-800"
                >
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} ({app.code}) - {app.base_url}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Rule Status
                  </label>
                  <select
                    value={ruleStatus}
                    onChange={(e) => setRuleStatus(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Evaluation Priority
                  </label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Lower values run earlier.</p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe the purpose of this callback rule..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-medium"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: TRIGGER & CONDITIONS */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 2: Trigger & Conditions</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Primary Trigger Event
                </label>
                <input
                  type="text"
                  value="FDO Final Decision"
                  disabled
                  className="w-full text-xs px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Run When FDO Decision Is
                </label>
                <select
                  value={runWhen}
                  onChange={(e) => setRunWhen(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-800"
                >
                  <option value="BOTH">Approved OR Rejected (BOTH)</option>
                  <option value="APPROVED">APPROVED Only</option>
                  <option value="REJECTED">REJECTED Only</option>
                </select>
              </div>
            </div>

            {/* Dynamic Condition Builder */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-600">Dynamic Rule Conditions</h4>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500">Logical Match:</span>
                  <select
                    value={logicalOperator}
                    onChange={(e) => setLogicalOperator(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-bold text-slate-800"
                  >
                    <option value="AND">AND (All conditions must match)</option>
                    <option value="OR">OR (Any condition matches)</option>
                  </select>
                </div>
              </div>

              {conditions.map((cond, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-lg border border-slate-200">
                  <select
                    value={cond.field}
                    onChange={(e) => {
                      const updated = [...conditions];
                      updated[idx].field = e.target.value;
                      setConditions(updated);
                    }}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-md font-bold text-slate-700 outline-none"
                  >
                    <option value="company">Company / Division</option>
                    <option value="documentType">Document Type</option>
                    <option value="documentNumber">Document Number</option>
                    <option value="primaryKey">Primary Key</option>
                    <option value="category">Category</option>
                    <option value="branch">Branch / Plant</option>
                    <option value="costCenter">Cost Center</option>
                    <option value="pay_mode">Pay Mode</option>
                    <option value="approvalStage">Approval Stage</option>
                    <option value="approvalStatus">Approval Status</option>
                    <option value="amount">Gross Amount</option>
                  </select>

                  <select
                    value={cond.operator}
                    onChange={(e) => {
                      const updated = [...conditions];
                      updated[idx].operator = e.target.value;
                      setConditions(updated);
                    }}
                    className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-md font-semibold text-slate-700 outline-none"
                  >
                    <option value="Equals">Equals</option>
                    <option value="Not Equals">Not Equals</option>
                    <option value="Contains">Contains</option>
                    <option value="In">In (Comma Separated)</option>
                    <option value="Greater Than">Greater Than</option>
                    <option value="Less Than">Less Than</option>
                    <option value="Is Empty">Is Empty</option>
                    <option value="Is Not Empty">Is Not Empty</option>
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
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-md outline-none font-medium"
                  />

                  <button
                    type="button"
                    onClick={() => handleRemoveCondition(idx)}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddCondition}
                className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 font-bold text-xs rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Condition
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ENDPOINT & METHOD */}
        {currentStep === 3 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 3: Endpoint & HTTP Method</h3>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                HTTP Method *
              </label>
              <div className="flex flex-wrap gap-2">
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setHttpMethod(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      httpMethod === m
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                URL Configuration Mode
              </label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="urlMode"
                    checked={urlMode === "INHERIT_BASE"}
                    onChange={() => setUrlMode("INHERIT_BASE")}
                    className="text-blue-600"
                  />
                  Inherit Application Base URL ({selectedApp?.base_url})
                </label>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="urlMode"
                    checked={urlMode === "OVERRIDE"}
                    onChange={() => setUrlMode("OVERRIDE")}
                    className="text-blue-600"
                  />
                  Override Complete Custom URL
                </label>
              </div>
            </div>

            {urlMode === "INHERIT_BASE" ? (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Endpoint Path (Supports Dynamic Variables) *
                </label>
                <input
                  type="text"
                  placeholder="/v1/payment/{{documentNumber}}/approval"
                  value={endpointPath}
                  onChange={(e) => setEndpointPath(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Final URL preview: <span className="font-mono text-slate-600">{selectedApp?.base_url}/{endpointPath.replace(/^\//, "")}</span>
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Complete Custom URL *
                </label>
                <input
                  type="url"
                  placeholder="https://payment.example.com/api/v1/payment/{{documentNumber}}/approval"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-mono font-bold"
                />
              </div>
            )}
          </div>
        )}

        {/* STEP 4: PARAMS & HEADERS */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 4: Query Parameters & Custom Headers</h3>

            {/* Query Params */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-blue-600">Query Parameters</h4>
              {queryParams.map((qp, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                  <input
                    type="text"
                    placeholder="Parameter key (e.g. dn)"
                    value={qp.key}
                    onChange={(e) => {
                      const updated = [...queryParams];
                      updated[idx].key = e.target.value;
                      setQueryParams(updated);
                    }}
                    className="w-1/3 text-xs px-2.5 py-1.5 border border-slate-200 rounded outline-none font-mono font-bold"
                  />
                  <input
                    type="text"
                    placeholder="Value (e.g. {{documentNumber}})"
                    value={qp.value}
                    onChange={(e) => {
                      const updated = [...queryParams];
                      updated[idx].value = e.target.value;
                      setQueryParams(updated);
                    }}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded outline-none font-mono"
                  />
                  <select
                    value={qp.type || "Dynamic"}
                    onChange={(e) => {
                      const updated = [...queryParams];
                      updated[idx].type = e.target.value;
                      setQueryParams(updated);
                    }}
                    className="text-xs px-2 py-1.5 border border-slate-200 rounded font-semibold"
                  >
                    <option value="Dynamic">Dynamic</option>
                    <option value="Static">Static</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setQueryParams(queryParams.filter((_, i) => i !== idx))}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddQueryParam}
                className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 font-bold text-xs rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Query Parameter
              </button>
            </div>

            {/* Custom Headers */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-blue-600">Custom Request Headers</h4>
              {customHeaders.map((h, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                  <input
                    type="text"
                    placeholder="Header key (e.g. X-Event-ID)"
                    value={h.key}
                    onChange={(e) => {
                      const updated = [...customHeaders];
                      updated[idx].key = e.target.value;
                      setCustomHeaders(updated);
                    }}
                    className="w-1/3 text-xs px-2.5 py-1.5 border border-slate-200 rounded outline-none font-mono font-bold"
                  />
                  <input
                    type="text"
                    placeholder="Header value (e.g. {{eventId}})"
                    value={h.value}
                    onChange={(e) => {
                      const updated = [...customHeaders];
                      updated[idx].value = e.target.value;
                      setCustomHeaders(updated);
                    }}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded outline-none font-mono"
                  />
                  <select
                    value={h.type || "Static"}
                    onChange={(e) => {
                      const updated = [...customHeaders];
                      updated[idx].type = e.target.value;
                      setCustomHeaders(updated);
                    }}
                    className="text-xs px-2 py-1.5 border border-slate-200 rounded font-semibold"
                  >
                    <option value="Static">Static</option>
                    <option value="Dynamic">Dynamic</option>
                    <option value="Secret">Secret</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setCustomHeaders(customHeaders.filter((_, i) => i !== idx))}
                    className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddHeader}
                className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 font-bold text-xs rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Add Request Header
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: AUTHENTICATION */}
        {currentStep === 5 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 5: Authentication Configuration</h3>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Rule Authentication Override
              </label>
              <select
                value={authOverrideType}
                onChange={(e) => setAuthOverrideType(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-800"
              >
                <option value="INHERIT">
                  Use Application Authentication ({selectedApp?.auth_type || "None"})
                </option>
                <option value="NONE">None (No Auth Headers)</option>
                <option value="API_KEY">API Key (Rule Override)</option>
                <option value="BEARER_TOKEN">Bearer Token (Rule Override)</option>
              </select>
            </div>

            {authOverrideType === "INHERIT" && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 text-xs font-semibold">
                Inheriting authentication mechanism <strong>{selectedApp?.auth_type}</strong> from target application <strong>{selectedApp?.name}</strong>.
              </div>
            )}
          </div>
        )}

        {/* STEP 6: PAYLOAD MAPPING */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-black text-slate-800">Step 6: Payload Mapping & Live Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUseRawTemplate(!useRawTemplate)}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Code className="h-3.5 w-3.5" />
                  {useRawTemplate ? "Use Visual Mapper" : "Use Raw Template Editor"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Visual Mapper or Raw Editor */}
              <div>
                {!useRawTemplate ? (
                  <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                    <h4 className="text-xs font-black uppercase tracking-wider text-blue-600">
                      Field Mapping Table
                    </h4>
                    {payloadMappings.map((m, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                        <input
                          type="text"
                          placeholder="Third-Party Field (e.g. invoice_no)"
                          value={m.thirdPartyField}
                          onChange={(e) => {
                            const updated = [...payloadMappings];
                            updated[idx].thirdPartyField = e.target.value;
                            setPayloadMappings(updated);
                          }}
                          className="w-1/2 text-xs px-2.5 py-1.5 border border-slate-200 rounded outline-none font-mono font-bold"
                        />
                        <span className="text-slate-400 font-bold">←</span>
                        <select
                          value={m.sourceField}
                          onChange={(e) => {
                            const updated = [...payloadMappings];
                            updated[idx].sourceField = e.target.value;
                            setPayloadMappings(updated);
                          }}
                          className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded font-bold text-slate-700"
                        >
                          <option value="primaryKey">Primary Key</option>
                          <option value="documentNumber">Document Number</option>
                          <option value="approvalStatus">Approval Status</option>
                          <option value="company">Company / Division</option>
                          <option value="category">Category</option>
                          <option value="branch">Branch / Plant</option>
                          <option value="costCenter">Cost Center</option>
                          <option value="approvedBy">Approved By</option>
                          <option value="approvalDate">Approval Date</option>
                          <option value="rejectionReason">Rejection Reason</option>
                          <option value="eventId">Event ID</option>
                          <option value="attemptNumber">Attempt Number</option>
                          <option value="maxAttempts">Max Attempts</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setPayloadMappings(payloadMappings.filter((_, i) => i !== idx))}
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddPayloadMapping}
                      className="px-3 py-1.5 bg-white border border-blue-200 text-blue-600 font-bold text-xs rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Field Mapping
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Raw Payload Template (JSON / XML / Text)
                    </label>
                    <textarea
                      rows={12}
                      value={rawPayloadTemplate}
                      onChange={(e) => setRawPayloadTemplate(e.target.value)}
                      className="w-full text-xs font-mono p-3 bg-slate-900 text-emerald-400 rounded-xl outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Right Column: Live Preview */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Live Sample JSON Payload Preview
                </label>
                <div className="bg-slate-900 p-4 rounded-xl font-mono text-xs text-blue-300 border border-slate-800 overflow-x-auto min-h-[220px]">
                  <pre>{generateJsonPreview()}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: RESPONSE HANDLING */}
        {currentStep === 7 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 7: Response Handling & Success Criteria</h3>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Request Timeout (Seconds) *
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Accepted HTTP Success Status Codes (Comma Separated)
              </label>
              <input
                type="text"
                placeholder="200, 201, 202, 204"
                value={successCodes}
                onChange={(e) => setSuccessCodes(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-mono font-bold"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="followRedir"
                checked={followRedirects}
                onChange={(e) => setFollowRedirects(e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded"
              />
              <label htmlFor="followRedir" className="text-xs font-bold text-slate-700 cursor-pointer">
                Follow HTTP Redirects Automatically
              </label>
            </div>
          </div>
        )}

        {/* STEP 8: RETRY SETTINGS */}
        {currentStep === 8 && (
          <div className="space-y-4 max-w-2xl">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 8: Retry Settings & Failure Handling</h3>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Failure Action
              </label>
              <select
                value={retryMode}
                onChange={(e) => setRetryMode(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-800"
              >
                <option value="AUTO">Retry Automatically</option>
                <option value="NOTIFY">Retry Automatically + Notify Administrator</option>
                <option value="NONE">Do Not Retry (Single Attempt)</option>
              </select>
            </div>

            {retryMode !== "NONE" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Maximum Retry Attempts
                  </label>
                  <select
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-800"
                  >
                    <option value={1}>1 Attempt</option>
                    <option value={3}>3 Attempts</option>
                    <option value={5}>5 Attempts</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Backoff Strategy
                  </label>
                  <select
                    value={backoffStrategy}
                    onChange={(e) => setBackoffStrategy(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none font-bold text-slate-800"
                  >
                    <option value="EXPONENTIAL">Exponential Backoff (30s, 60s, 120s...)</option>
                    <option value="FIXED">Fixed Interval (30s)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 9: TEST CALLBACK */}
        {currentStep === 9 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-black text-slate-800">Step 9: Test Callback Execution</h3>
              <button
                type="button"
                onClick={handleRunTest}
                disabled={testing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Send Test Request
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Sample Primary Key
                </label>
                <input
                  type="text"
                  value={samplePk}
                  onChange={(e) => setSamplePk(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Sample Document Number
                </label>
                <input
                  type="text"
                  value={sampleDn}
                  onChange={(e) => setSampleDn(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Sample Approval Status
                </label>
                <select
                  value={sampleStatus}
                  onChange={(e) => setSampleStatus(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded font-bold"
                >
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                </select>
              </div>
            </div>

            {testResult && (
              <div className="space-y-4">
                <div
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                    testResult.success
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-rose-50 text-rose-800 border-rose-200"
                  }`}
                >
                  <span>
                    Status: {testResult.success ? "Callback Successful" : "Callback Failed"} (HTTP {testResult.status_code || "N/A"})
                  </span>
                  {testResult.response_time_ms && <span>Time: {testResult.response_time_ms} ms</span>}
                </div>

                {testResult.request_preview && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Generated Request Snapshot
                    </label>
                    <div className="bg-slate-900 p-3 rounded-xl font-mono text-xs text-blue-300 overflow-x-auto">
                      <p className="text-white font-bold">{testResult.request_preview.method} {testResult.request_preview.url}</p>
                      <p className="text-slate-400 text-[10px] mt-1">Headers: {JSON.stringify(testResult.request_preview.headers)}</p>
                      {testResult.request_preview.body && (
                        <pre className="mt-2 text-emerald-400">{testResult.request_preview.body}</pre>
                      )}
                    </div>
                  </div>
                )}

                {testResult.response_body && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Response Output
                    </label>
                    <div className="bg-slate-900 p-3 rounded-xl font-mono text-xs text-slate-200 overflow-x-auto">
                      <pre>{testResult.response_body}</pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 10: REVIEW & SAVE */}
        {currentStep === 10 && (
          <div className="space-y-5 max-w-2xl">
            <h3 className="text-sm font-black text-slate-800 border-b pb-2">Step 10: Review & Save Callback Rule</h3>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-bold text-slate-400">Rule Name:</span>
                  <p className="font-bold text-slate-800">{ruleName || "Untitled"}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400">Target Application:</span>
                  <p className="font-bold text-slate-800">{selectedApp?.name}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400">HTTP Method & Path:</span>
                  <p className="font-bold text-blue-600">{httpMethod} {endpointPath}</p>
                </div>
                <div>
                  <span className="font-bold text-slate-400">Trigger & Run When:</span>
                  <p className="font-bold text-slate-800">{triggerEvent} ({runWhen})</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stepper Footer Buttons */}
      <div className="bg-slate-50 p-4 px-6 border-t border-slate-200 flex items-center justify-between">
        <button
          type="button"
          disabled={currentStep === 1}
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Previous
        </button>

        <div className="flex items-center gap-3">
          {currentStep < 10 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.min(10, s + 1))}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center gap-1 cursor-pointer"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSaveRule}
              disabled={saving}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Save & Activate Callback Rule
            </button>
          )}
        </div>
      </div>
    </div>
  </div>,
  document.body
);
}
