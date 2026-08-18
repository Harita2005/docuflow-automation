import { useState } from "react";

const API = "/api/workflow";

interface MatchResult {
  matched: boolean;
  inputId?: number;
  rule?: { ruleId: number; ruleName: string; priority: number };
  workflow?: { workflowId: number; workflowName: string; workflowCode: string };
  execution?: { executionId: number; status: string };
  conditions?: { field: string; operator: string; expected: any; actual: string; matched: boolean }[];
  message?: string;
}

interface ChecklistData {
  executionId: number;
  workflow: string;
  status: string;
  stages: {
    stageId: number;
    stageName: string;
    stageOrder: number;
    items: {
      executionChecklistId: number;
      checklistItemId: number;
      itemName: string;
      sequence: number;
      status: string;
      remarks?: string;
    }[];
  }[];
}

export default function WorkflowMatchPage() {
  const [form, setForm] = useState({
    sourceRecordId: "",
    sourceSystem: "EXTERNAL_APP",
    division: "",
    plant: "",
    category: "",
    costCenter: "",
  });
  const [loading, setLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [checklist, setChecklist] = useState<ChecklistData | null>(null);
  const [error, setError] = useState("");

  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function handleMatch() {
    setLoading(true);
    setError("");
    setMatchResult(null);
    setChecklist(null);
    try {
      const res = await fetch(`${API}/match`, { method: "POST", headers, body: JSON.stringify(form) });
      const data = await res.json();
      setMatchResult(data);
      if (data.matched && data.execution?.executionId) {
        const res2 = await fetch(`${API}/execution/${data.execution.executionId}/checklist`, { headers });
        setChecklist(await res2.json());
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleItem(ecId: number, currentStatus: string) {
    const newStatus = currentStatus === "COMPLETED" ? "PENDING" : "COMPLETED";
    const res = await fetch(`${API}/execution/checklist/${ecId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok && checklist) {
      setChecklist((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stages: prev.stages.map((s) => ({
            ...s,
            items: s.items.map((i) =>
              i.executionChecklistId === ecId ? { ...i, status: newStatus } : i
            ),
          })),
        };
      });
    }
  }

  const inputCls =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide";

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Rule Matcher</h1>
          <p className="text-sm text-gray-500 mt-1">
            Submit a record to find the matching workflow and load its checklist.
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Input Record</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "sourceRecordId", label: "Source Record ID" },
              { key: "sourceSystem",   label: "Source System" },
              { key: "division",       label: "Division" },
              { key: "plant",          label: "Plant / Branch" },
              { key: "category",       label: "Category" },
              { key: "costCenter",     label: "Cost Center" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <input
                  className={inputCls}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={label}
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleMatch}
            disabled={loading}
            className="mt-5 px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Matching…" : "Match Workflow"}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {/* No Match */}
        {matchResult && !matchResult.matched && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-base font-bold text-amber-800">No Matching Workflow</h2>
            </div>
            <p className="text-sm text-amber-700 mb-3">{matchResult.message}</p>
            <p className="text-xs text-amber-600">Please verify: Division · Plant · Category · Cost Center</p>
          </div>
        )}

        {/* Match Result */}
        {matchResult?.matched && (
          <div className="space-y-4">

            {/* Matched Rule & Workflow */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</span>
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Matched Workflow</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Rule</p>
                  <p className="text-sm font-semibold text-gray-900">{matchResult.rule?.ruleName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Priority: {matchResult.rule?.priority}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Workflow</p>
                  <p className="text-sm font-semibold text-gray-900">{matchResult.workflow?.workflowName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{matchResult.workflow?.workflowCode}</p>
                </div>
              </div>
            </div>

            {/* Conditions */}
            {matchResult.conditions && matchResult.conditions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Match Conditions</h2>
                <div className="space-y-2">
                  {matchResult.conditions.map((c, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg ${
                        c.matched ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"
                      }`}
                    >
                      <span className={`mt-0.5 text-sm font-bold ${c.matched ? "text-green-600" : "text-red-500"}`}>
                        {c.matched ? "✓" : "✗"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{c.field}</p>
                        <p className="text-xs text-gray-500">
                          <span className="font-medium">Expected:</span>{" "}
                          {Array.isArray(c.expected) ? c.expected.join(", ") : c.expected}
                        </p>
                        <p className="text-xs text-gray-500">
                          <span className="font-medium">Actual:</span> {c.actual || "(empty)"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Checklist */}
            {checklist && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Checklist</h2>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                    Execution #{checklist.executionId}
                  </span>
                </div>

                <div className="space-y-6">
                  {checklist.stages.map((stage) => {
                    const completed = stage.items.filter((i) => i.status === "COMPLETED").length;
                    return (
                      <div key={stage.stageId}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                            {stage.stageName}
                          </h3>
                          <span className="text-xs text-gray-400">
                            {completed}/{stage.items.length}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {stage.items.map((item) => (
                            <label
                              key={item.executionChecklistId}
                              className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={item.status === "COMPLETED"}
                                onChange={() => toggleItem(item.executionChecklistId, item.status)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                              />
                              <span
                                className={`text-sm ${
                                  item.status === "COMPLETED"
                                    ? "line-through text-gray-400"
                                    : "text-gray-700"
                                }`}
                              >
                                {item.itemName}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
