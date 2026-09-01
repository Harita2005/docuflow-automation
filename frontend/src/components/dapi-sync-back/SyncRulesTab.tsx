import React, { useState } from 'react';
import {
  Sliders,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Edit,
  AlertTriangle,
  GitBranch,
  CheckCircle2,
  XCircle,
  History,
  Layers,
  ArrowRight,
  ShieldAlert,
  Server,
  FileCheck,
  Eye
} from 'lucide-react';
import { SyncRule, ThirdPartyApplication } from '../../types/dapiSyncBack';

interface SyncRulesTabProps {
  rules: SyncRule[];
  apps: ThirdPartyApplication[];
  onOpenWizard: (ruleToEdit?: SyncRule | null) => void;
  onUpdateRule: (rule: SyncRule) => void;
  onDeleteRule: (ruleId: string) => void;
  onDuplicateRule: (rule: SyncRule) => void;
  onReorderPriority: (ruleId: string, direction: 'up' | 'down') => void;
}

export default function SyncRulesTab({
  rules,
  apps,
  onOpenWizard,
  onUpdateRule,
  onDeleteRule,
  onDuplicateRule,
  onReorderPriority
}: SyncRulesTabProps) {
  const [selectedAppFilter, setSelectedAppFilter] = useState('ALL');
  const [selectedDocTypeFilter, setSelectedDocTypeFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPathRuleId, setExpandedPathRuleId] = useState<string | null>(rules[0]?.id || null);

  // Versioning Drawer state
  const [versionDrawerRule, setVersionDrawerRule] = useState<SyncRule | null>(null);

  // Filter Rules
  const filteredRules = rules
    .filter(r => {
      if (selectedAppFilter !== 'ALL' && r.applicationId !== selectedAppFilter) return false;
      if (selectedDocTypeFilter !== 'ALL' && r.documentType !== selectedDocTypeFilter) return false;
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        return (
          r.ruleName.toLowerCase().includes(query) ||
          r.applicationName.toLowerCase().includes(query) ||
          r.documentType.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => a.priority - b.priority);

  // Ambiguity / Conflict Detection Engine (Requirement 11 & 21)
  const detectRuleConflicts = () => {
    const activeRules = rules.filter(r => r.status === 'Active');
    const conflicts: string[] = [];

    for (let i = 0; i < activeRules.length; i++) {
      for (let j = i + 1; j < activeRules.length; j++) {
        const r1 = activeRules[i];
        const r2 = activeRules[j];

        if (
          r1.applicationId === r2.applicationId &&
          r1.documentType === r2.documentType
        ) {
          // Check if primary condition fields overlap (e.g. both check Approval Status = Approved)
          const r1Conds = r1.conditions.map(c => `${c.field}:${c.operator}:${c.value}`).join(';');
          const r2Conds = r2.conditions.map(c => `${c.field}:${c.operator}:${c.value}`).join(';');
          if (r1Conds === r2Conds) {
            conflicts.push(`Conflict Warning: Rule "${r1.ruleName}" (Priority ${r1.priority}) and "${r2.ruleName}" (Priority ${r2.priority}) have identical conditions for ${r1.applicationName} [${r1.documentType}]. Evaluation will pick Priority ${Math.min(r1.priority, r2.priority)}.`);
          }
        }
      }
    }
    return conflicts;
  };

  const conflicts = detectRuleConflicts();

  return (
    <div className="space-y-4">
      {/* Ambiguity / Conflict Warning Banner (Requirement 11) */}
      {conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl shadow-2xs space-y-1">
          <div className="flex items-center gap-2 text-amber-800 font-extrabold text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Rule Ambiguity / Conflict Warnings ({conflicts.length})</span>
          </div>
          <div className="space-y-1 pl-6">
            {conflicts.map((msg, idx) => (
              <p key={idx} className="text-[11px] font-medium text-amber-700">
                • {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Top Header & Actions */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search sync rules..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* App Filter */}
          <select
            value={selectedAppFilter}
            onChange={(e) => setSelectedAppFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Target Apps</option>
            {apps.map(app => (
              <option key={app.id} value={app.id}>{app.name}</option>
            ))}
          </select>

          {/* Doc Type Filter */}
          <select
            value={selectedDocTypeFilter}
            onChange={(e) => setSelectedDocTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Document Types</option>
            <option value="Purchase Order">Purchase Order</option>
            <option value="Invoice">Invoice</option>
            <option value="Contract">Contract</option>
            <option value="Goods Receipt">Goods Receipt</option>
          </select>
        </div>

        {/* Wizard Button */}
        <button
          onClick={() => onOpenWizard(null)}
          className="w-full md:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <Plus className="h-4 w-4" /> Create New Sync Rule
        </button>
      </div>

      {/* Rules List View */}
      <div className="space-y-3">
        {filteredRules.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-2xs">
            <GitBranch className="h-8 w-8 text-slate-400 mx-auto mb-2 opacity-60" />
            <h3 className="font-extrabold text-xs text-slate-700 uppercase">No sync rules found</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Click "+ Create New Sync Rule" to build a visual rule workflow.</p>
          </div>
        ) : (
          filteredRules.map((rule, index) => {
            const isFirst = index === 0;
            const isLast = index === filteredRules.length - 1;
            const isExpanded = expandedPathRuleId === rule.id;

            return (
              <div
                key={rule.id}
                className={`bg-white rounded-xl border transition shadow-2xs overflow-hidden ${
                  rule.status === 'Active' ? 'border-slate-200 hover:border-blue-300' : 'border-slate-200 bg-slate-50/50 opacity-85'
                }`}
              >
                {/* Rule Main Header Bar */}
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left: Priority Badge & Rule Information */}
                  <div className="flex items-start gap-3">
                    {/* Priority & Reorder Controls */}
                    <div className="flex flex-col items-center bg-slate-100 p-1.5 rounded-lg border border-slate-200 shrink-0">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">PRIORITY</span>
                      <span className="text-base font-black text-blue-600 font-mono leading-none my-0.5">#{rule.priority}</span>
                      <div className="flex items-center gap-1 mt-1">
                        <button
                          disabled={isFirst}
                          onClick={() => onReorderPriority(rule.id, 'up')}
                          className="p-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30 cursor-pointer"
                          title="Increase Priority"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          disabled={isLast}
                          onClick={() => onReorderPriority(rule.id, 'down')}
                          className="p-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30 cursor-pointer"
                          title="Decrease Priority"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    {/* Rule Title & Attributes */}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-extrabold text-slate-900 font-display">{rule.ruleName}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                          rule.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          rule.status === 'Draft' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {rule.status}
                        </span>
                        <button
                          onClick={() => setVersionDrawerRule(rule)}
                          className="px-2 py-0.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <History className="h-3 w-3" /> v{rule.currentVersion} Active
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500 font-semibold">
                        <span className="flex items-center gap-1 text-slate-700">
                          <Server className="h-3 w-3 text-blue-600" /> {rule.applicationName}
                        </span>
                        <span>•</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[10px] font-bold">
                          {rule.documentType}
                        </span>
                        <span>•</span>
                        <span>{rule.conditions.length} Condition{rule.conditions.length > 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span>Last modified: {rule.lastModified || 'Recent'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Quick Action Controls */}
                  <div className="flex items-center gap-1.5 self-end md:self-auto">
                    <button
                      onClick={() => setExpandedPathRuleId(isExpanded ? null : rule.id)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {isExpanded ? 'Hide Routing' : 'View Workflow Path'}
                    </button>
                    <button
                      onClick={() => onOpenWizard(rule)}
                      className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="Edit Rule"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDuplicateRule(rule)}
                      className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                      title="Duplicate Rule"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onUpdateRule({ ...rule, status: rule.status === 'Active' ? 'Disabled' : 'Active' })}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition border cursor-pointer ${
                        rule.status === 'Active'
                          ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {rule.status === 'Active' ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => onDeleteRule(rule.id)}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs transition cursor-pointer"
                      title="Delete Rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Condition Summary String */}
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="font-extrabold text-blue-600">IF:</span>
                  {rule.conditions.map((c, i) => (
                    <React.Fragment key={c.id || i}>
                      <span className="bg-white px-2 py-0.5 border border-slate-200 rounded font-bold text-slate-800 shadow-2xs">
                        {c.field} <span className="text-blue-600 font-extrabold">{c.operator}</span> "{c.value}"
                      </span>
                      {i < rule.conditions.length - 1 && (
                        <span className="font-black text-purple-600 text-[10px] uppercase">
                          {c.logicalOperator || 'AND'}
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                  <span className="font-extrabold text-emerald-600 ml-2">→ THEN:</span>
                  <span className="text-slate-700 font-bold">
                    {rule.approvedAction.method} {rule.approvedAction.url}
                  </span>
                </div>

                {/* Visual Routing Path View (Expanded) - Professional Enterprise Theme */}
                {isExpanded && (
                  <div className="p-4 bg-slate-50/80 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5 font-display">
                        <GitBranch className="h-4 w-4 text-blue-600" /> Decision Routing Workflow Path
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono font-bold">Rule Priority #{rule.priority}</span>
                    </div>

                    {/* Routing Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Approved Path Flow */}
                      <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs space-y-2.5">
                        <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                          <span className="text-xs font-extrabold text-emerald-800 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> APPROVED ROUTE
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-bold">
                            {rule.approvedAction.method}
                          </span>
                        </div>

                        {/* Workflow Nodes Vertical Pipeline */}
                        <div className="space-y-1.5 text-[11px]">
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">DOCUMENT</span>
                            <span className="font-bold text-slate-900">{rule.documentType} (PO-100245)</span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">CONDITION</span>
                            <span className="font-bold text-slate-800">
                              {rule.conditions[0]?.field || 'Status'} = {rule.conditions[0]?.value || 'Approved'}
                            </span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-emerald-800 uppercase">DECISION</span>
                            <span className="font-black text-emerald-700">✓ APPROVED</span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">SYNC TO</span>
                            <span className="font-bold text-blue-700">{rule.applicationName}</span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-300 text-emerald-900 font-mono text-[11px] font-bold truncate">
                            {rule.approvedAction.method} {rule.approvedAction.url}
                          </div>
                        </div>
                      </div>

                      {/* Rejected Path Flow */}
                      <div className="bg-white p-3.5 rounded-xl border border-rose-200 shadow-2xs space-y-2.5">
                        <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                          <span className="text-xs font-extrabold text-rose-800 flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-rose-600" /> REJECTED ROUTE
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded font-bold">
                            {rule.rejectedAction.method}
                          </span>
                        </div>

                        {/* Workflow Nodes Vertical Pipeline */}
                        <div className="space-y-1.5 text-[11px]">
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">DOCUMENT</span>
                            <span className="font-bold text-slate-900">{rule.documentType} (PO-100245)</span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">CONDITION</span>
                            <span className="font-bold text-slate-800">
                              {rule.conditions[0]?.field || 'Status'} != Approved
                            </span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-rose-50 p-2 rounded-lg border border-rose-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-rose-800 uppercase">DECISION</span>
                            <span className="font-black text-rose-700">✕ REJECTED</span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase">SYNC TO</span>
                            <span className="font-bold text-blue-700">{rule.applicationName}</span>
                          </div>
                          <div className="text-center text-slate-400 font-extrabold text-xs">↓</div>
                          <div className="bg-rose-50/80 p-2.5 rounded-lg border border-rose-300 text-rose-900 font-mono text-[11px] font-bold truncate">
                            {rule.rejectedAction.method} {rule.rejectedAction.url}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Requirement 23 Rule Versioning Drawer / Modal */}
      {versionDrawerRule && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-fadeIn">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-blue-400" />
                <h3 className="font-extrabold text-sm tracking-wide">
                  Rule Version History — {versionDrawerRule.ruleName}
                </h3>
              </div>
              <button
                onClick={() => setVersionDrawerRule(null)}
                className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-xs text-blue-800">
                <p className="font-bold">Requirement 23 Production Safety Guarantee:</p>
                <p className="text-[11px] mt-0.5">
                  Rules are versioned to preserve historical auditability. You can inspect previous versions, duplicate them into new drafts, or activate archived versions. Active production rules are never silently overwritten.
                </p>
              </div>

              <div className="space-y-3">
                {versionDrawerRule.versions.map((ver) => (
                  <div
                    key={ver.version}
                    className={`p-4 rounded-xl border flex flex-col justify-between gap-2 ${
                      ver.status === 'Active' ? 'bg-emerald-50/40 border-emerald-300' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 font-mono">
                          Version {ver.version}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          ver.status === 'Active' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {ver.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{ver.createdAt}</span>
                    </div>

                    <p className="text-xs font-medium text-slate-700">{ver.changeLog}</p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                      <span>Created by: {ver.createdBy}</span>
                      <div className="flex items-center gap-2">
                        {ver.status !== 'Active' && (
                          <button
                            onClick={() => {
                              onUpdateRule({
                                ...versionDrawerRule,
                                currentVersion: ver.version,
                                versions: versionDrawerRule.versions.map(v => ({
                                  ...v,
                                  status: v.version === ver.version ? 'Active' : 'Archived'
                                }))
                              });
                              setVersionDrawerRule(null);
                            }}
                            className="px-2.5 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded text-[10px] font-bold transition cursor-pointer"
                          >
                            Activate Version {ver.version}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            onDuplicateRule({
                              ...versionDrawerRule,
                              ruleName: `${versionDrawerRule.ruleName} (From v${ver.version})`
                            });
                            setVersionDrawerRule(null);
                          }}
                          className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded text-[10px] font-bold transition cursor-pointer"
                        >
                          Duplicate as Draft
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 text-right">
              <button
                onClick={() => setVersionDrawerRule(null)}
                className="px-4 py-1.5 bg-slate-800 text-white hover:bg-slate-900 rounded-lg text-xs font-bold cursor-pointer"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
