import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  GitBranch,
  Code,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  X
} from 'lucide-react';
import { SyncLog } from '../../types/dapiSyncBack';

interface SyncLogDetailDrawerProps {
  log: SyncLog;
  onClose: () => void;
  onRetrySync: (logId: string) => void;
}

export default function SyncLogDetailDrawer({
  log,
  onClose,
  onRetrySync
}: SyncLogDetailDrawerProps) {
  const [retrying, setRetrying] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleManualRetry = () => {
    setRetrying(true);
    setTimeout(() => {
      onRetrySync(log.id);
      setRetrying(false);
    }, 1000);
  };

  const handleCopyIdempotencyKey = () => {
    navigator.clipboard.writeText(log.idempotencyKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white w-full max-w-2xl max-h-[88vh] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden font-sans text-xs relative">
        {/* Header */}
        <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-blue-600/30 text-blue-400 rounded-lg flex items-center justify-center border border-blue-500/30 font-bold shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-black tracking-tight">
                Sync Delivery Log Details — {log.documentNumber}
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Log ID: {log.id} • {log.timestamp}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px]">
          {/* Status & Idempotency Key Bar */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase flex items-center gap-1 ${
                  log.syncStatus === 'Success' ? 'bg-emerald-100 text-emerald-800' :
                  log.syncStatus === 'Failed' ? 'bg-rose-100 text-rose-800' :
                  log.syncStatus === 'Retrying' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-800'
                }`}>
                  {log.syncStatus === 'Success' && <CheckCircle className="h-3 w-3" />}
                  {log.syncStatus === 'Failed' && <XCircle className="h-3 w-3" />}
                  {log.syncStatus === 'Retrying' && <RefreshCw className="h-3 w-3 animate-spin" />}
                  {log.syncStatus === 'Pending' && <Clock className="h-3 w-3" />}
                  {log.syncStatus}
                </span>

                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                  log.decision === 'APPROVED' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                }`}>
                  {log.decision}
                </span>
              </div>

              {/* Idempotency Key */}
              <button
                onClick={handleCopyIdempotencyKey}
                className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-mono text-slate-700 hover:bg-slate-100 flex items-center gap-1 transition cursor-pointer"
                title="Click to copy idempotency key"
              >
                <ShieldCheck className="h-3 w-3 text-blue-600" />
                <span>Idempotency: {log.idempotencyKey}</span>
                {copiedKey ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
              </button>
            </div>
          </div>

          {/* Section 1: Document Information */}
          <div className="space-y-2 border-b border-slate-100 pb-3">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <FileText className="h-3 w-3 text-blue-600" /> Document Information
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div>
                <span className="block text-[9px] font-black text-slate-400 uppercase">DOCUMENT NUMBER</span>
                <span className="font-bold text-slate-900">{log.documentNumber}</span>
              </div>
              <div>
                <span className="block text-[9px] font-black text-slate-400 uppercase">PRIMARY KEY</span>
                <span className="font-mono font-bold text-slate-800">{log.primaryKey}</span>
              </div>
              <div>
                <span className="block text-[9px] font-black text-slate-400 uppercase">APPLICATION</span>
                <span className="font-bold text-blue-700">{log.applicationName}</span>
              </div>
              <div>
                <span className="block text-[9px] font-black text-slate-400 uppercase">DECISION</span>
                <span className="font-bold text-slate-900">{log.decision}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Evaluated Rule Details */}
          <div className="space-y-2 border-b border-slate-100 pb-3">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <GitBranch className="h-3 w-3 text-blue-600" /> Evaluated Rule
            </h4>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900">{log.ruleName}</span>
                <span className="text-[9px] font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                  Rule ID: {log.ruleId}
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-700 bg-white p-1.5 rounded border border-slate-200">
                {log.conditionSummary || 'IF Approval Status = Approved AND Attachment Status = Complete'}
              </p>
            </div>
          </div>

          {/* Section 3: HTTP Request & Response Payload Inspector */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Code className="h-3 w-3 text-blue-600" /> HTTP Payload Inspector
            </h4>

            {/* Request Payload */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-black text-slate-500 uppercase">
                <span>Request Payload (Sent to 3rd-Party App)</span>
                <span className="font-mono text-slate-400">Content-Type: application/json</span>
              </div>
              <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded-lg text-[10px] font-mono overflow-x-auto max-h-36 border border-slate-800">
                {log.requestBody ? JSON.stringify(log.requestBody, null, 2) : '{\n  "documentId": "984734",\n  "docNumber": "PO-100245",\n  "status": "APPROVED"\n}'}
              </pre>
            </div>

            {/* Response Payload */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-black text-slate-500 uppercase">
                <span>Response Payload (Returned by 3rd-Party App)</span>
                <span className={`font-mono font-bold ${log.httpStatus === 200 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  HTTP {log.httpStatus} • {log.responseTimeMs} ms
                </span>
              </div>
              <pre className="p-2.5 bg-slate-900 text-blue-300 rounded-lg text-[10px] font-mono overflow-x-auto max-h-36 border border-slate-800">
                {log.responseBody ? JSON.stringify(log.responseBody, null, 2) : '{\n  "success": true,\n  "code": 200,\n  "message": "Notification received & acknowledged"\n}'}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 p-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-100 transition cursor-pointer text-xs"
          >
            Close
          </button>

          <button
            onClick={handleManualRetry}
            disabled={retrying}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Retrying Notification...' : 'Retry Sync Now'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
