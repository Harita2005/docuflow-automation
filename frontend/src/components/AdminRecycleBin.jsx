import React, { useState, useEffect } from "react";
import { Trash2, RotateCcw, AlertCircle, Info, Loader2 } from "lucide-react";

export default function AdminRecycleBin() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    fetchCancelledDocs();
  }, []);

  const fetchCancelledDocs = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/admin/recycle-bin", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setItems(await res.json());
      } else {
        setError("Failed to fetch cancelled documents.");
      }
    } catch (e) {
      setError(e.message || "Failed to fetch items.");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id) => {
    setRestoringId(id);
    setError("");
    setSuccess("");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`/api/invoices/${id}/restore`, {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setSuccess("Document restored back to workflow successfully!");
        fetchCancelledDocs();
        setTimeout(() => setSuccess(""), 5000);
      } else {
        setError("Failed to restore document.");
      }
    } catch (e) {
      setError(e.message || "Network failure during restore.");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden flex flex-col min-h-[400px]">
      <div className="border-b border-slate-100/80 bg-slate-50/50 p-4 flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
          <Trash2 className="h-4 w-4 text-rose-500" />
          DMS Recycle Bin (Cancelled Documents)
        </h2>
        <button
          onClick={fetchCancelledDocs}
          className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 bg-white hover:bg-slate-50 border border-slate-200 rounded transition-colors"
        >
          Refresh Bin
        </button>
      </div>

      <div className="p-4 flex-1">
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 text-xs flex items-center gap-2">
            <Info className="h-4 w-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600 mb-2" />
            <span className="text-xs font-medium">Scanning recycle bin...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
            <Trash2 className="h-12 w-12 text-slate-200 mb-2" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Recycle Bin is Empty</span>
            <span className="text-[10px] text-slate-400 mt-1">Deleted or cancelled invoices will appear here for recovery.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Document No.</th>
                  <th className="px-4 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Supplier Details</th>
                  <th className="px-4 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Amount</th>
                  <th className="px-4 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Deleted By / Reason</th>
                  <th className="px-4 py-2 text-[9px] font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-800 text-xs">
                      {item.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-semibold text-slate-700">{item.vendor_name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-900">
                      {item.currency} {item.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-700">{item.cancelled_by_name}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5 italic">"{item.cancelled_reason}"</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRestore(item.id)}
                        disabled={restoringId === item.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold text-[10px] uppercase tracking-wider rounded transition-colors"
                      >
                        {restoringId === item.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
