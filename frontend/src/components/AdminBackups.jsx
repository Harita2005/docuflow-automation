import React, { useState, useEffect } from "react";
import { Database, Play, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

export default function AdminBackups() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchBackupHistory();
  }, []);

  const fetchBackupHistory = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/admin/backup/history", {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setHistory(await res.json());
      } else {
        setError("Failed to fetch backup logs.");
      }
    } catch (e) {
      setError(e.message || "Network error loading logs.");
    } finally {
      setLoading(false);
    }
  };

  const triggerBackup = async () => {
    setBackingUp(true);
    setError("");
    setSuccess("");
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch("/api/admin/backup/trigger", {
        method: "POST",
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      if (res.ok) {
        setSuccess("Database and uploads backup ran successfully! Copy saved to all 3 paths.");
        fetchBackupHistory();
      } else {
        setError("Backup failed. Check if SQL Server service has write permission to C:\\Users\\TempAdmin");
      }
    } catch (e) {
      setError(e.message || "Network failure during backup request.");
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] overflow-hidden flex flex-col min-h-[400px]">
      <div className="border-b border-slate-100/80 bg-slate-50/50 p-4 flex items-center justify-between">
        <h2 className="text-xs font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
          <Database className="h-4 w-4 text-sky-600" />
          Triple Backup Control Panel
        </h2>
        <button
          onClick={triggerBackup}
          disabled={backingUp}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] uppercase tracking-wider rounded transition-colors shadow-sm disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          {backingUp ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running Backup...
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5 fill-current" />
              Run Backup Now
            </>
          )}
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-700 text-xs flex items-center gap-2">
            <CheckCircle className="h-4 w-4 flex-shrink-0" />
            {success}
          </div>
        )}

        {/* Backups Paths Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { name: "Local Disk Backup (Drive C)", path: "C:\\docuflow-backups\\local", type: "Primary" },
            { name: "Secondary Volume (Drive D/USB)", path: "C:\\docuflow-backups\\secondary", type: "Redundant" },
            { name: "Offsite Storage Copy", path: "C:\\docuflow-backups\\offsite", type: "Archive" }
          ].map((d, i) => (
            <div key={i} className="border border-slate-100 bg-slate-50/50 p-3 rounded-lg flex flex-col gap-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{d.type}</span>
              <span className="text-xs font-bold text-slate-800">{d.name}</span>
              <span className="text-[10px] text-slate-500 font-mono select-all mt-1">{d.path}</span>
            </div>
          ))}
        </div>

        {/* Backup logs */}
        <div className="flex-1">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Execution Logs</h3>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin text-sky-600 mb-1" />
              <span className="text-[10px]">Loading history logs...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-100 rounded-xl">
              <Database className="h-8 w-8 text-slate-200 mx-auto mb-1.5" />
              <span className="text-xs font-semibold">No backup logs found</span>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-3 py-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Time</th>
                    <th className="px-3 py-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Database Backup File</th>
                    <th className="px-3 py-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest">Uploads Folder</th>
                    <th className="px-3 py-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((log, index) => (
                    <tr key={index} className="hover:bg-slate-50/30 text-[11px]">
                      <td className="px-3 py-2 text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-700 font-mono">
                        {log.databaseBackup}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-700 font-mono">
                        {log.uploadsBackup}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide ${
                          log.status === "SUCCESS" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
