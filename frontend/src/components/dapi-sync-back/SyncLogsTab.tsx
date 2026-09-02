import React, { useState } from 'react';
import {
  ListFilter,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Eye,
  RotateCcw,
  FileText,
  Server,
  Download
} from 'lucide-react';
import { SyncLog, SyncLogStatus } from '../../types/dapiSyncBack';
import SyncLogDetailDrawer from './SyncLogDetailDrawer';

interface SyncLogsTabProps {
  logs: SyncLog[];
  onRetrySync: (logId: string) => void;
}

export default function SyncLogsTab({ logs, onRetrySync }: SyncLogsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [appFilter, setAppFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<SyncLogStatus | 'ALL'>('ALL');

  // Selected Log Drawer
  const [selectedLog, setSelectedLog] = useState<SyncLog | null>(null);

  const filteredLogs = logs.filter(l => {
    const matchesSearch =
      l.documentNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.primaryKey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.applicationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.idempotencyKey.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesApp = appFilter === 'ALL' || l.applicationId === appFilter;
    const matchesDecision = decisionFilter === 'ALL' || l.decision === decisionFilter;
    const matchesStatus = statusFilter === 'ALL' || l.syncStatus === statusFilter;

    return matchesSearch && matchesApp && matchesDecision && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Requirement 16 Sync Logs Filtering Bar */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by doc #, key, idempotency..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 h-7"
            />
          </div>

          {/* Decision Filter */}
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 h-7"
          >
            <option value="ALL">All Decisions</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 h-7"
          >
            <option value="ALL">All Statuses</option>
            <option value="Success">Success</option>
            <option value="Failed">Failed</option>
            <option value="Pending">Pending</option>
            <option value="Retrying">Retrying</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
          <span>Showing {filteredLogs.length} of {logs.length} logs</span>
        </div>
      </div>

      {/* Requirement 16 Sync Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                <th className="py-2 px-3">Date/Time</th>
                <th className="py-2 px-3">Application</th>
                <th className="py-2 px-3">Doc Number</th>
                <th className="py-2 px-3">Primary Key</th>
                <th className="py-2 px-3">Decision</th>
                <th className="py-2 px-3">Endpoint</th>
                <th className="py-2 px-3">Method</th>
                <th className="py-2 px-3">HTTP Code</th>
                <th className="py-2 px-3">Sync Status</th>
                <th className="py-2 px-3">Attempt / Retries</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[10px]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    <ListFilter className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                    <p className="font-bold text-[10px]">No sync logs match filters</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition">
                    {/* Timestamp */}
                    <td className="py-2 px-3 font-mono text-[9.5px] text-slate-500 whitespace-nowrap">
                      {log.timestamp}
                    </td>

                    {/* Application */}
                    <td className="py-2 px-3 font-extrabold text-slate-900 text-[10px]">
                      <span className="flex items-center gap-1.5">
                        <Server className="h-3 w-3 text-blue-600 shrink-0" />
                        {log.applicationName}
                      </span>
                    </td>

                    {/* Doc Number */}
                    <td className="py-2 px-3 font-extrabold text-slate-900 font-mono text-[10px]">
                      {log.documentNumber}
                    </td>

                    {/* Primary Key */}
                    <td className="py-2 px-3 font-mono text-slate-600 text-[9.5px]">
                      {log.primaryKey}
                    </td>

                    {/* Decision */}
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.2 rounded text-[8.5px] font-black uppercase ${
                        log.decision === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {log.decision}
                      </span>
                    </td>

                    {/* Endpoint */}
                    <td className="py-2 px-3 font-mono text-[9px] text-slate-500 max-w-[140px]">
                      <span className="truncate block" title={log.endpoint}>
                        {log.endpoint}
                      </span>
                    </td>

                    {/* Method */}
                    <td className="py-2 px-3 font-mono font-bold text-slate-700 text-[9.5px]">
                      {log.httpMethod}
                    </td>

                    {/* HTTP Status Code */}
                    <td className="py-2 px-3 font-mono font-black text-[10px]">
                      <span className={log.httpStatus === 200 ? 'text-emerald-600' : 'text-rose-600'}>
                        {log.httpStatus || '---'}
                      </span>
                    </td>

                    {/* Statuses */}
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase tracking-wide ${
                        log.syncStatus === 'Success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        log.syncStatus === 'Failed' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        log.syncStatus === 'Retrying' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {log.syncStatus === 'Success' && <CheckCircle className="h-2.5 w-2.5" />}
                        {log.syncStatus === 'Failed' && <XCircle className="h-2.5 w-2.5" />}
                        {log.syncStatus === 'Retrying' && <RefreshCw className="h-2.5 w-2.5 animate-spin" />}
                        {log.syncStatus === 'Pending' && <Clock className="h-2.5 w-2.5" />}
                        {log.syncStatus}
                      </span>
                    </td>

                    {/* Attempt / Retry Count */}
                    <td className="py-2 px-3 font-mono text-[9.5px]">
                      <span className={log.syncStatus === 'Failed' && log.retryCount >= log.maxRetries ? 'text-rose-700 font-black' : 'text-slate-800 font-extrabold'}>
                        {log.retryCount === 0 ? 1 : log.retryCount} / {log.maxRetries}
                      </span>
                      <span className="block text-[7.5px] font-sans font-bold text-slate-400 uppercase tracking-tight">
                        {log.syncStatus === 'Failed' && log.retryCount >= log.maxRetries ? 'Max Retries' : `Attempt ${log.retryCount === 0 ? 1 : log.retryCount}`}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2 py-0.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded text-[9px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <Eye className="h-2.5 w-2.5" /> Details
                        </button>
                        {log.syncStatus === 'Failed' && (
                          <button
                            onClick={() => onRetrySync(log.id)}
                            className="p-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[9px] transition cursor-pointer"
                            title="Retry Sync Execution"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sync Log Details Drawer */}
      {selectedLog && (
        <SyncLogDetailDrawer
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          onRetrySync={(logId) => {
            onRetrySync(logId);
            setSelectedLog(null);
          }}
        />
      )}
    </div>
  );
}
