import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ListFilter,
  Search,
  RefreshCw,
  Eye,
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Code,
  FileText,
  AlertTriangle,
  Server,
  Copy,
  Terminal,
  Play
} from "lucide-react";

interface IntegrationLog {
  id: number;
  event_id: string;
  document_id: string;
  document_number: string;
  primary_key: string;
  application_id: number;
  application_name: string;
  rule_id: number;
  rule_name: string;
  decision: string;
  method: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_retry_at?: string;
  created_at: string;
}

export default function IntegrationLogsPage() {
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [decisionFilter, setDecisionFilter] = useState("ALL");

  // Selected Log Drawer / Modal
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventDetail, setEventDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [copiedCurlKey, setCopiedCurlKey] = useState<string | null>(null);
  const [bulkRetrying, setBulkRetrying] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/v2/logs");
      const json = await res.json();
      if (json.success) {
        setLogs(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch integration logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (eventIdStr: string) => {
    setSelectedEventId(eventIdStr);
    setLoadingDetail(true);
    setEventDetail(null);

    try {
      const res = await fetch(`/api/integrations/v2/logs/${eventIdStr}`);
      const json = await res.json();
      if (json.success) {
        setEventDetail(json);
      }
    } catch (err) {
      console.error("Failed to fetch log details:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleManualRetry = async (eventIdStr: string) => {
    if (!window.confirm(`Are you sure you want to retry callback event '${eventIdStr}'?`)) return;

    setRetryingId(eventIdStr);
    try {
      const res = await fetch(`/api/integrations/v2/logs/${eventIdStr}/retry`, {
        method: "POST"
      });
      const json = await res.json();
      if (json.success) {
        fetchLogs();
        if (selectedEventId === eventIdStr) {
          handleOpenDetail(eventIdStr);
        }
      } else {
        alert(json.error || json.message || "Manual retry failed");
      }
    } catch (err) {
      console.error("Retry error:", err);
    } finally {
      setRetryingId(null);
    }
  };

  const handleCopyCurl = (att: any) => {
    let headersObj: Record<string, string> = {};
    try {
      if (att.request_headers_json) {
        headersObj = typeof att.request_headers_json === "string" ? JSON.parse(att.request_headers_json) : att.request_headers_json;
      }
    } catch (e) {}

    const headerStr = Object.entries(headersObj)
      .map(([k, v]) => `-H "${k}: ${v}"`)
      .join(" \\\n  ");

    const bodyStr = att.request_body ? `-d '${att.request_body}'` : "";

    const curlCmd = `curl -X ${att.http_method || "POST"} "${att.request_url}" ${headerStr ? "\\\n  " + headerStr : ""} ${bodyStr ? "\\\n  " + bodyStr : ""}`.trim();

    navigator.clipboard.writeText(curlCmd);
    const key = `${att.id || att.attempt_number}`;
    setCopiedCurlKey(key);
    setTimeout(() => setCopiedCurlKey(null), 2000);
  };

  const handleBulkRetry = async () => {
    if (!window.confirm("Are you sure you want to bulk re-dispatch all failed/retrying callback events?")) return;
    setBulkRetrying(true);
    try {
      const res = await fetch("/api/integrations/v2/logs/bulk-retry", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        alert(`Bulk Replay Complete: ${json.successful_count} succeeded, ${json.failed_count} failed.`);
        fetchLogs();
      }
    } catch (err) {
      console.error("Bulk retry failed:", err);
    } finally {
      setBulkRetrying(false);
    }
  };

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.event_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.document_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.primary_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.application_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.rule_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || l.status === statusFilter;
    const matchesDecision = decisionFilter === "ALL" || l.decision === decisionFilter;
    return matchesSearch && matchesStatus && matchesDecision;
  });

  return (
    <div className="space-y-3">
      {/* Compact Header Card */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-blue-600 shrink-0" />
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide">
            Callback Audit Logs ({filteredLogs.length})
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleBulkRetry}
            disabled={bulkRetrying}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] rounded-lg transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            title="Bulk re-dispatch all failed/retrying callbacks"
          >
            {bulkRetrying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Bulk Replay Failed
          </button>
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Audit Trail
          </button>
        </div>
      </div>

      {/* Compact Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2 items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Event ID, Document #, Primary Key, Application..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-[11px] outline-none focus:border-blue-500 font-medium"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">All Decisions</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-semibold text-slate-700 outline-none"
          >
            <option value="ALL">All Delivery Statuses</option>
            <option value="DELIVERED">DELIVERED</option>
            <option value="RETRYING">RETRYING</option>
            <option value="FAILED">FAILED</option>
            <option value="PENDING">PENDING</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2 font-medium">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading Callback Audit Logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center">
            <ListFilter className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-xs font-bold text-slate-700">No integration activity found</h3>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs mx-auto">
              Callback audit activity will appear here when FDO final approval decisions are made on documents.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Document / DN</th>
                  <th className="py-2.5 px-3">Application</th>
                  <th className="py-2.5 px-3">Decision</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Callback Status</th>
                  <th className="py-2.5 px-3 text-center">Attempts</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-blue-600">
                      {l.event_id}
                    </td>
                    <td className="py-2 px-3">
                      <div>
                        <p className="font-bold text-slate-800 leading-tight">{l.document_number}</p>
                        <p className="text-[10px] text-slate-400 font-mono">PK: {l.primary_key}</p>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <Globe className="h-3 w-3 text-slate-400" />
                        <span className="font-bold text-slate-700">{l.application_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                        l.decision === "APPROVED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}>
                        {l.decision}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono font-black text-slate-700">
                      {l.method}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${
                        l.status === "DELIVERED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : l.status === "RETRYING"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}>
                        {l.status === "DELIVERED" ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                        {l.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-bold text-slate-700">
                      {l.attempt_count} / {l.max_attempts}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-500 text-[10px]">
                      {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenDetail(l.event_id)}
                          className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 font-bold rounded transition-colors text-[9px] flex items-center gap-0.5 cursor-pointer"
                        >
                          <Eye className="h-2.5 w-2.5" /> View
                        </button>
                        {l.status !== "DELIVERED" && (
                          <button
                            onClick={() => handleManualRetry(l.event_id)}
                            disabled={retryingId === l.event_id}
                            className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded transition-colors text-[9px] flex items-center gap-0.5 cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className={`h-2.5 w-2.5 ${retryingId === l.event_id ? "animate-spin" : ""}`} /> Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Log Detail Drawer / Modal */}
      {selectedEventId && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <ListFilter className="h-5 w-5 text-blue-600" /> Integration Callback Details
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedEventId}</p>
              </div>
              <button
                onClick={() => setSelectedEventId(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {loadingDetail ? (
              <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2 font-medium">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading Event Audit Details...
              </div>
            ) : eventDetail ? (
              <div className="space-y-6">
                {/* Event Overview */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Document Number</span>
                    <p className="font-bold text-slate-800">{eventDetail.event.document_number}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Primary Key</span>
                    <p className="font-bold text-slate-800 font-mono">{eventDetail.event.primary_key}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Target Application</span>
                    <p className="font-bold text-blue-600">{eventDetail.event.application_name}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase tracking-wider text-[9px]">Status</span>
                    <p className="font-bold text-emerald-600">{eventDetail.event.status}</p>
                  </div>
                </div>

                {/* Attempts History */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-blue-600">
                    Execution Attempts History ({eventDetail.attempts.length})
                  </h4>

                  {eventDetail.attempts.map((att: any, idx: number) => (
                    <div key={att.id || idx} className="p-4 bg-slate-900 text-slate-200 rounded-xl space-y-3 font-mono text-xs border border-slate-800">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[10px]">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-400">Attempt #{att.attempt_number}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyCurl(att)}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-400 font-bold rounded flex items-center gap-1 transition-colors cursor-pointer text-[9px]"
                            title="Copy as cURL command"
                          >
                            {copiedCurlKey === `${att.id || att.attempt_number}` ? (
                              <>
                                <CheckCircle className="h-2.5 w-2.5 text-emerald-400" /> Copied cURL!
                              </>
                            ) : (
                              <>
                                <Terminal className="h-2.5 w-2.5" /> Copy cURL
                              </>
                            )}
                          </button>
                        </div>
                        <span>HTTP Status: <strong className="text-white">{att.response_status_code || "Error"}</strong></span>
                        <span>Response Time: <strong className="text-blue-400">{att.response_time_ms || 0} ms</strong></span>
                        <span>{new Date(att.timestamp).toLocaleTimeString()}</span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Request:</span>
                        <p className="text-white font-bold">{att.http_method} {att.request_url}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Headers: {att.request_headers}</p>
                        {att.request_body && (
                          <pre className="mt-2 text-emerald-400 overflow-x-auto p-2 bg-slate-950 rounded">{att.request_body}</pre>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Response Body:</span>
                        <pre className="mt-1 text-slate-300 overflow-x-auto p-2 bg-slate-950 rounded">{att.response_body || "No response body returned"}</pre>
                      </div>

                      {att.error_message && (
                        <div className="text-rose-400 text-[10px] font-bold">
                          Error: {att.error_message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 pt-3">
                  {eventDetail.event.status !== "DELIVERED" && (
                    <button
                      onClick={() => handleManualRetry(eventDetail.event.event_id)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Manual Retry Now
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedEventId(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
