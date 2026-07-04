import React, { useState, useEffect } from 'react';
import { Database, Plus, Edit2, Trash2, Upload, Save, X, AlertTriangle } from 'lucide-react';

export default function AdminMasterData() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/erp-master', { headers: { "Authorization": `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const saveRow = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      po_number: fd.get('po_number'),
      vendor: fd.get('vendor'),
      division: fd.get('division'),
      department: fd.get('department'),
      cost_center: fd.get('cost_center'),
      requestor_email: fd.get('requestor_email')
    };

    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/erp-master', {
        method: 'POST',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchData();
        setEditingRow(null);
      }
    } catch(e) { console.error(e); }
  };

  const processBulk = async () => {
    try {
      // Very basic CSV parser: po_number,vendor,division,department,cost_center,requestor_email
      const lines = bulkText.split('\\n').map(l => l.trim()).filter(l => l && !l.startsWith('po_number'));
      const items = lines.map(line => {
        const [po_number, vendor, division, department, cost_center, requestor_email] = line.split(',').map(s => s.trim());
        return { po_number, vendor, division, department, cost_center, requestor_email };
      });

      const token = localStorage.getItem("authToken");
      const res = await fetch('/api/admin/erp-master/bulk', {
        method: 'POST',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ items })
      });
      if (res.ok) {
        fetchData();
        setBulkMode(false);
        setBulkText("");
      } else {
        alert("Bulk upload failed. Check format.");
      }
    } catch(e) { console.error(e); alert("Error parsing CSV"); }
  };

  const deleteRow = async (po) => {
    if (!window.confirm(`Delete PO ${po}?`)) return;
    try {
      const token = localStorage.getItem("authToken");
      await fetch(`/api/admin/erp-master/${po}`, { method: 'DELETE', headers: { "Authorization": `Bearer ${token}` } });
      fetchData();
    } catch(e) { console.error(e); }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden flex flex-col">
      <div className="border-b border-slate-100/80 bg-slate-50/50 p-3 flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
          <Database className="h-4 w-4 text-emerald-600" />
          ERP Master Data Synchronizer
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setBulkMode(true); setEditingRow(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded transition-colors shadow-sm"
          >
            <Upload className="h-3.5 w-3.5" /> CSV Upload
          </button>
          <button
            onClick={() => { setEditingRow({ po_number: '', vendor: '' }); setBulkMode(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold text-[10px] uppercase tracking-wider rounded transition-colors shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add Record
          </button>
        </div>
      </div>

      <div className="p-0 flex-1">
        {bulkMode && (
          <div className="bg-slate-50/50 p-4 border-b border-slate-200">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative">
              <button onClick={() => setBulkMode(false)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              <h3 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">Bulk Import (CSV format)</h3>
              <p className="text-[10px] text-slate-500 mb-2 font-mono bg-slate-100 p-2 rounded border border-slate-200">Format: po_number,vendor,division,department,cost_center,requestor_email</p>
              <textarea 
                value={bulkText} 
                onChange={e => setBulkText(e.target.value)} 
                className="w-full h-32 text-xs p-2 border border-slate-200 rounded focus:border-emerald-400 font-mono text-slate-600 outline-none" 
                placeholder="PO-999,Acme Corp,Finance,AP,CC-01,ap@acme.com" 
              />
              <div className="flex justify-end pt-3">
                <button onClick={processBulk} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow transition-colors uppercase tracking-wider">
                  <Upload className="h-3.5 w-3.5" /> Sync Data
                </button>
              </div>
            </div>
          </div>
        )}

        {editingRow && (
          <div className="bg-emerald-50/30 p-4 border-b border-emerald-100/50">
            <form onSubmit={saveRow} className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm relative">
              <button type="button" onClick={() => setEditingRow(null)} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              <h3 className="text-xs font-bold text-slate-800 mb-4 uppercase tracking-wider">{editingRow.po_number ? 'Edit Master Record' : 'Create Master Record'}</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">PO Number (Key)</label>
                  <input name="po_number" defaultValue={editingRow.po_number} readOnly={!!editingRow.po_number} required className={`w-full text-xs p-2 border border-slate-200 rounded focus:outline-none ${editingRow.po_number ? 'bg-slate-100 cursor-not-allowed' : 'focus:border-emerald-400'}`} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vendor Name</label>
                  <input name="vendor" defaultValue={editingRow.vendor} required className="w-full text-xs p-2 border border-slate-200 rounded focus:border-emerald-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Requestor / Owner Email</label>
                  <input name="requestor_email" defaultValue={editingRow.requestor_email} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-emerald-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Division</label>
                  <input name="division" defaultValue={editingRow.division} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-emerald-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Department</label>
                  <input name="department" defaultValue={editingRow.department} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-emerald-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cost Center</label>
                  <input name="cost_center" defaultValue={editingRow.cost_center} className="w-full text-xs p-2 border border-slate-200 rounded focus:border-emerald-400 focus:outline-none" />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded shadow transition-colors uppercase tracking-wider">
                  <Save className="h-3.5 w-3.5" /> Save Record
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">PO & Vendor</th>
                <th className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Org Hierarchy</th>
                <th className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cost Center</th>
                <th className="px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="4" className="p-4 text-center text-xs text-slate-400">Loading master data...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="4" className="p-4 text-center text-xs text-slate-400 italic">No master records found.</td></tr>
              ) : data.map(row => (
                <tr key={row.po_number} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-emerald-700 text-xs">{row.po_number}</span>
                      <span className="text-[10px] text-slate-600 font-bold mt-0.5">{row.vendor || 'Unknown Vendor'}</span>
                      {row.requestor_email && <span className="text-[9px] text-slate-400 mt-0.5">{row.requestor_email}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold text-slate-700">{row.division || '-'}</span>
                      <span className="text-[9px] text-slate-500">{row.department || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[10px] font-mono text-slate-600 font-bold">
                    {row.cost_center || '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingRow(row)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteRow(row.po_number)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
