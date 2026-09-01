import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Code,
  ArrowRight,
  Sparkles,
  RefreshCw,
  CheckCircle,
  Copy,
  Info
} from 'lucide-react';
import { FieldMapping, SystemFieldOption } from '../../types/dapiSyncBack';
import { SYSTEM_FIELDS } from './mockSyncBackData';

interface FieldMappingTabProps {
  mappings: FieldMapping[];
  onUpdateMappings: (mappings: FieldMapping[]) => void;
}

export default function FieldMappingTab({
  mappings,
  onUpdateMappings
}: FieldMappingTabProps) {
  const [currentMappings, setCurrentMappings] = useState<FieldMapping[]>(mappings);
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [customFieldInput, setCustomFieldInput] = useState('');

  const handleAddMapping = () => {
    const unusedSystemField = SYSTEM_FIELDS.find(
      sf => !currentMappings.some(m => m.ourField === sf.key)
    ) || SYSTEM_FIELDS[0];

    const newMapping: FieldMapping = {
      id: `fm-${Date.now()}`,
      ourField: unusedSystemField.key,
      thirdPartyField: unusedSystemField.key.toLowerCase().replace(/\s+/g, ''),
      description: unusedSystemField.description
    };

    const updated = [...currentMappings, newMapping];
    setCurrentMappings(updated);
    onUpdateMappings(updated);
  };

  const handleRemoveMapping = (id: string) => {
    const updated = currentMappings.filter(m => m.id !== id);
    setCurrentMappings(updated);
    onUpdateMappings(updated);
  };

  const handleUpdateField = (id: string, key: 'ourField' | 'thirdPartyField', value: string) => {
    const updated = currentMappings.map(m => {
      if (m.id === id) {
        if (key === 'ourField') {
          const sysInfo = SYSTEM_FIELDS.find(s => s.key === value);
          return {
            ...m,
            ourField: value,
            description: sysInfo?.description || m.description
          };
        }
        return { ...m, [key]: value };
      }
      return m;
    });
    setCurrentMappings(updated);
    onUpdateMappings(updated);
  };

  // Requirement 14 JSON Payload Preview Generator
  const generateJsonPreview = () => {
    const obj: Record<string, string> = {};
    currentMappings.forEach(m => {
      const fieldKey = m.thirdPartyField || 'field';
      switch (m.ourField) {
        case 'Primary Key':
          obj[fieldKey] = '{{document.primaryKey}}';
          break;
        case 'Document Number':
          obj[fieldKey] = '{{document.documentNumber}}';
          break;
        case 'Approval Status':
          obj[fieldKey] = '{{decision.status}}';
          break;
        case 'Rejection Reason':
          obj[fieldKey] = '{{decision.rejectionReason}}';
          break;
        case 'Approved By':
          obj[fieldKey] = '{{decision.approvedBy}}';
          break;
        case 'Rejected By':
          obj[fieldKey] = '{{decision.rejectedBy}}';
          break;
        case 'Approval Date':
          obj[fieldKey] = '{{decision.timestamp}}';
          break;
        default:
          obj[fieldKey] = `{{document.${m.ourField.toLowerCase().replace(/\s+/g, '')}}}`;
          break;
      }
    });
    return JSON.stringify(obj, null, 2);
  };

  const handleCopyPreview = () => {
    navigator.clipboard.writeText(generateJsonPreview());
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-600" /> Requirement 13 Payload Field Mappings
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Configure how internal DocuFlow document attributes transform into 3rd-party JSON payload keys.
          </p>
        </div>

        <button
          onClick={handleAddMapping}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Add Field Mapping
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Visual Mapping Table (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              System Field → Third-Party Field Matrix ({currentMappings.length})
            </span>
            <span className="text-[10px] text-slate-500 font-semibold">
              Changes update JSON preview automatically
            </span>
          </div>

          <div className="p-4 space-y-3">
            {currentMappings.map((m) => {
              const currentSysField = SYSTEM_FIELDS.find(sf => sf.key === m.ourField);
              return (
                <div
                  key={m.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 group hover:border-blue-300 transition"
                >
                  {/* Our System Field Dropdown */}
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                      Our System Field
                    </label>
                    <select
                      value={m.ourField}
                      onChange={(e) => handleUpdateField(m.id, 'ourField', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    >
                      {SYSTEM_FIELDS.map(sf => (
                        <option key={sf.key} value={sf.key}>
                          {sf.label} (e.g. {sf.example})
                        </option>
                      ))}
                    </select>
                    {currentSysField && (
                      <span className="text-[9px] text-slate-400 font-medium block mt-0.5">
                        {currentSysField.description}
                      </span>
                    )}
                  </div>

                  {/* Arrow Indicator */}
                  <div className="flex items-center justify-center text-blue-600 shrink-0">
                    <ArrowRight className="h-4 w-4 hidden md:block" />
                    <span className="text-xs font-bold md:hidden">↓ Maps To ↓</span>
                  </div>

                  {/* Third Party Target Field Input */}
                  <div className="flex-1">
                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                      Third Party Field Name
                    </label>
                    <input
                      type="text"
                      value={m.thirdPartyField}
                      onChange={(e) => handleUpdateField(m.id, 'thirdPartyField', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-blue-600 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. documentId"
                    />
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={() => handleRemoveMapping(m.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition self-end md:self-center cursor-pointer"
                    title="Remove Mapping"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Requirement 14 Request Body JSON Preview (1 col) - Clean Enterprise Theme */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-blue-600" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                  JSON Payload Preview
                </h3>
              </div>
              <button
                onClick={handleCopyPreview}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 font-bold rounded flex items-center gap-1 cursor-pointer border border-slate-200"
              >
                {copiedPreview ? <CheckCircle className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                {copiedPreview ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <p className="text-[11px] text-slate-500 font-medium mb-3">
              The payload below is compiled in real-time from your field mappings above using handlebar placeholders.
            </p>

            {/* Code View */}
            <pre className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-[11px] font-mono text-blue-900 font-bold overflow-x-auto custom-scrollbar leading-relaxed">
              {generateJsonPreview()}
            </pre>
          </div>

          <div className="mt-4 p-3 bg-blue-50/60 rounded-lg border border-blue-100 text-[10px] text-slate-700 space-y-1">
            <div className="flex items-center gap-1 font-bold text-blue-400">
              <Info className="h-3.5 w-3.5 shrink-0" /> Variable Context Note
            </div>
            <p>
              `document.*` variables extract OCR and workflow header data, while `decision.*` variables supply final approval/rejection outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
