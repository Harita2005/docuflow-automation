import React, { useState } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  TrendingUp,
  Filter,
  Layers,
  ArrowUpRight,
  Server,
  FileText
} from 'lucide-react';
import { ThirdPartyApplication, SyncLog } from '../../types/dapiSyncBack';

interface DashboardTabProps {
  apps: ThirdPartyApplication[];
  logs: SyncLog[];
  onNavigateTab: (tab: 'apps' | 'rules' | 'mapping' | 'api' | 'logs') => void;
  onSelectAppForRules: (appId: string) => void;
}

export default function DashboardTab({
  apps,
  logs,
  onNavigateTab,
  onSelectAppForRules
}: DashboardTabProps) {
  // Filters State
  const [selectedAppFilter, setSelectedAppFilter] = useState('ALL');
  const [selectedDocTypeFilter, setSelectedDocTypeFilter] = useState('ALL');
  const [selectedDecisionFilter, setSelectedDecisionFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [dateRangeFilter, setDateRangeFilter] = useState('7d');

  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  // Filter logs based on dashboard selections
  const filteredLogs = logs.filter(log => {
    if (selectedAppFilter !== 'ALL' && log.applicationId !== selectedAppFilter) return false;
    if (selectedDocTypeFilter !== 'ALL' && log.documentType !== selectedDocTypeFilter) return false;
    if (selectedDecisionFilter !== 'ALL' && log.decision !== selectedDecisionFilter) return false;
    if (selectedStatusFilter !== 'ALL' && log.syncStatus !== selectedStatusFilter) return false;
    return true;
  });

  // Calculate Metrics
  const totalCount = 1284;
  const successCount = 1241;
  const failedCount = 23;
  const pendingCount = 20;
  const successRate = ((successCount / totalCount) * 100).toFixed(1);

  // Chart Data: Syncs by Application
  const syncsByAppData = apps.map(app => {
    const appLogs = logs.filter(l => l.applicationId === app.id);
    const success = appLogs.filter(l => l.syncStatus === 'Success').length || (app.code === 'ERP_001' ? 840 : app.code === 'PROC_002' ? 320 : 81);
    const failed = appLogs.filter(l => l.syncStatus === 'Failed').length || (app.code === 'ERP_001' ? 14 : app.code === 'PROC_002' ? 7 : 2);
    return {
      name: app.name,
      code: app.code,
      Success: success,
      Failed: failed,
      Total: success + failed
    };
  });

  const maxAppTotal = Math.max(...syncsByAppData.map(d => d.Total), 100);

  // Chart Data: Success vs Failed Activity Timeline
  const activityTimelineData = [
    { time: '08:00', Success: 140, Failed: 2 },
    { time: '09:00', Success: 210, Failed: 4 },
    { time: '10:00', Success: 185, Failed: 1 },
    { time: '11:00', Success: 290, Failed: 5 },
    { time: '12:00', Success: 160, Failed: 3 },
    { time: '13:00', Success: 256, Failed: 8 }
  ];

  const maxTimelineVal = Math.max(...activityTimelineData.map(d => Math.max(d.Success, d.Failed)), 300);

  return (
    <div className="space-y-4 font-sans">
      {/* Top Filter Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
            Dashboard Filters
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Application Filter */}
          <select
            value={selectedAppFilter}
            onChange={(e) => setSelectedAppFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Applications ({apps.length})</option>
            {apps.map(app => (
              <option key={app.id} value={app.id}>{app.name} ({app.code})</option>
            ))}
          </select>

          {/* Document Type Filter */}
          <select
            value={selectedDocTypeFilter}
            onChange={(e) => setSelectedDocTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Document Types</option>
            <option value="Purchase Order">Purchase Order</option>
            <option value="Invoice">Invoice</option>
            <option value="Contract">Contract</option>
            <option value="Goods Receipt">Goods Receipt</option>
          </select>

          {/* Decision Filter */}
          <select
            value={selectedDecisionFilter}
            onChange={(e) => setSelectedDecisionFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Decisions</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="Success">Success</option>
            <option value="Failed">Failed</option>
            <option value="Pending">Pending</option>
            <option value="Retrying">Retrying</option>
          </select>

          {/* Date Range Filter */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {['24h', '7d', '30d', 'All'].map(range => (
              <button
                key={range}
                onClick={() => setDateRangeFilter(range)}
                className={`px-2 py-1 text-[10px] font-bold rounded-md transition ${
                  dateRangeFilter === range
                    ? 'bg-white text-blue-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Requirement 19 Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Syncs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Syncs</span>
            <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">{totalCount.toLocaleString()}</span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 mt-1">
              <TrendingUp className="h-3 w-3" /> +12.4% vs last period
            </div>
          </div>
          <div className="absolute top-0 right-0 h-1 w-full bg-blue-500" />
        </div>

        {/* Successful */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Successful</span>
            <div className="h-8 w-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-emerald-600 font-mono tracking-tight">{successCount.toLocaleString()}</span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 mt-1">
              <CheckCircle className="h-3 w-3" /> Deliveries confirmed
            </div>
          </div>
          <div className="absolute top-0 right-0 h-1 w-full bg-emerald-500" />
        </div>

        {/* Failed */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Failed</span>
            <div className="h-8 w-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-rose-600 font-mono tracking-tight">{failedCount}</span>
            <button
              onClick={() => onNavigateTab('logs')}
              className="flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:underline mt-1 cursor-pointer"
            >
              Inspect failures <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="absolute top-0 right-0 h-1 w-full bg-rose-500" />
        </div>

        {/* Pending */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pending / Retry</span>
            <div className="h-8 w-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-amber-600 font-mono tracking-tight">{pendingCount}</span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 mt-1">
              <RefreshCw className="h-3 w-3" /> In back-off queue
            </div>
          </div>
          <div className="absolute top-0 right-0 h-1 w-full bg-amber-500" />
        </div>

        {/* Success Rate */}
        <div className="bg-gradient-to-br from-slate-900 to-blue-950 p-4 rounded-xl border border-slate-800 shadow-md text-white flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Success Rate</span>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold font-mono">SLO 99%</span>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black text-white font-mono tracking-tight">{successRate}%</span>
            <p className="text-[10px] text-slate-400 font-medium mt-1">
              High operational reliability
            </p>
          </div>
          <div className="absolute top-0 right-0 h-1 w-full bg-emerald-400" />
        </div>
      </div>

      {/* Requirement 19 Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Syncs by Application - Robust Custom SVG Bar Chart */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Sync Volume by Application
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Distribution of successful vs failed sync-backs across target platforms
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('apps')}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              View Apps <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-4 py-2">
            {syncsByAppData.map((item, idx) => {
              const successWidth = Math.round((item.Success / maxAppTotal) * 100);
              const failedWidth = Math.max(Math.round((item.Failed / maxAppTotal) * 100), 2);

              return (
                <div key={item.code} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800 flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-blue-600" />
                      {item.name} <span className="text-[10px] text-slate-400 font-mono">({item.code})</span>
                    </span>
                    <span className="text-slate-600 font-mono text-[11px]">
                      {item.Success.toLocaleString()} Success • {item.Failed} Failed
                    </span>
                  </div>

                  <div className="h-4 bg-slate-100 rounded-lg overflow-hidden flex items-center p-0.5 gap-0.5">
                    <div
                      style={{ width: `${successWidth}%` }}
                      className="h-full bg-emerald-500 rounded-xs transition-all duration-500"
                      title={`Success: ${item.Success}`}
                    />
                    <div
                      style={{ width: `${failedWidth}%` }}
                      className="h-full bg-rose-500 rounded-xs transition-all duration-500"
                      title={`Failed: ${item.Failed}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-xs font-bold pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-xs bg-emerald-500" />
              <span className="text-slate-600">Successful Syncs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-xs bg-rose-500" />
              <span className="text-slate-600">Failed Delivery Syncs</span>
            </div>
          </div>
        </div>

        {/* Approved vs Rejected SVG Donut Chart */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Approved vs Rejected Decisions
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Ratio of document workflow outcomes synced
            </p>
          </div>

          <div className="h-44 w-full relative flex items-center justify-center my-2">
            <svg viewBox="0 0 100 100" className="w-36 h-36 -rotate-90">
              {/* APPROVED ring (76.3% = strokeDasharray 240 75) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke="#10B981"
                strokeWidth="14"
                strokeDasharray="182 238"
              />
              {/* REJECTED ring (23.7%) */}
              <circle
                cx="50"
                cy="50"
                r="38"
                fill="transparent"
                stroke="#EF4444"
                strokeWidth="14"
                strokeDasharray="56 238"
                strokeDashoffset="-182"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-base font-black text-slate-900 font-mono">1,284</span>
              <span className="text-[9px] font-bold text-slate-400 uppercase">Decisions</span>
            </div>
          </div>

          <div className="flex items-center justify-around border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-xs bg-emerald-500" />
              <div>
                <span className="block text-[11px] font-black text-slate-900 font-mono">980 (76.3%)</span>
                <span className="text-[9px] font-semibold text-slate-500">APPROVED</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-xs bg-rose-500" />
              <div>
                <span className="block text-[11px] font-black text-slate-900 font-mono">304 (23.7%)</span>
                <span className="text-[9px] font-semibold text-slate-500">REJECTED</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Activity Timeline & Application Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Activity Stream Chart - Responsive SVG Trend */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs lg:col-span-2 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Sync Delivery Trend (Hourly)
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Real-time API response throughput and error spikes
              </p>
            </div>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold">
              Live Stream Active
            </span>
          </div>

          <div className="h-44 w-full flex items-end justify-between gap-3 pt-4 px-2 border-b border-slate-100">
            {activityTimelineData.map((d, i) => {
              const successHeight = Math.round((d.Success / maxTimelineVal) * 120);
              const failedHeight = Math.max(Math.round((d.Failed / maxTimelineVal) * 120), 6);

              return (
                <div key={d.time} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="flex items-end gap-1 w-full justify-center h-32">
                    <div
                      style={{ height: `${successHeight}px` }}
                      className="w-4/12 bg-emerald-500 rounded-t-xs hover:bg-emerald-600 transition"
                      title={`${d.time}: ${d.Success} Successful Syncs`}
                    />
                    <div
                      style={{ height: `${failedHeight}px` }}
                      className="w-4/12 bg-rose-500 rounded-t-xs hover:bg-rose-600 transition"
                      title={`${d.time}: ${d.Failed} Failed`}
                    />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-500">{d.time}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-xs font-bold pt-3">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-xs bg-emerald-500" />
              <span className="text-slate-600">Successful Syncs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-xs bg-rose-500" />
              <span className="text-slate-600">Failed Deliveries</span>
            </div>
          </div>
        </div>

        {/* Quick App Health List */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Application Health
            </h3>
            <span className="text-[10px] font-bold text-slate-400">{apps.length} Configured</span>
          </div>

          <div className="space-y-2.5">
            {apps.map(app => (
              <div
                key={app.id}
                onClick={() => onSelectAppForRules(app.id)}
                className="p-3 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/20 transition cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-700 font-bold shrink-0">
                    <Server className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-900">{app.name}</span>
                    <span className="text-[10px] text-slate-500 font-medium">{app.code} • {app.rulesCount || 0} Rules</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                    app.syncStatus === 'Enabled' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {app.syncStatus}
                  </span>
                  <span className="block text-[9px] text-slate-400 font-medium mt-0.5">{app.lastSync}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
