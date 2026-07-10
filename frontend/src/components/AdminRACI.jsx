import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Mail, Users, Info, Plus, X } from 'lucide-react';

const EVENTS = ["Approve", "Reject", "Request Clarification", "Send Back"];
const DEFAULT_WORKFLOWS = ["Standard Linear Workflow", "IT Hardware Approval", "Legal Contract Review"];

export default function AdminRACI() {
  const [loading, setLoading] = useState(false);
  const [matrices, setMatrices] = useState([]);
  const [workflowProfile, setWorkflowProfile] = useState("Standard Linear Workflow");
  const [customWorkflow, setCustomWorkflow] = useState("");
  
  // State for the grid for the current workflow
  const [grid, setGrid] = useState({});

  const [providerConfig, setProviderConfig] = useState({ smtp_server: '', port: 587, username: '', encrypted_password: '', sender_email: '', sender_name: '' });

  useEffect(() => {
    fetchMatrices();
    fetchProviderConfig();
  }, []);

  useEffect(() => {
    // When workflow changes, update grid state from matrices
    const activeWorkflow = customWorkflow || workflowProfile;
    const newGrid = {};
    
    EVENTS.forEach(event => {
      const match = matrices.find(m => m.workflow_profile === activeWorkflow && m.event_name === event);
      
      const safeParse = (str) => {
        if (!str) return [];
        try { return JSON.parse(str); } catch (e) { return []; }
      };

      newGrid[event] = {
        R: match ? safeParse(match.responsible_emails) : [],
        A: match ? safeParse(match.accountable_emails) : [],
        C: match ? safeParse(match.consulted_emails) : [],
        I: match ? safeParse(match.informed_emails) : [],
        title_template: match ? (match.title_template || "") : "",
        message_template: match ? (match.message_template || "") : ""
      };
    });
    setGrid(newGrid);
  }, [workflowProfile, customWorkflow, matrices]);

  const headers = {
    'Content-Type': 'application/json',
    ...(localStorage.getItem("authToken") ? { "Authorization": `Bearer ${localStorage.getItem("authToken")}` } : {})
  };

  const fetchMatrices = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/raci', { headers });
      if (res.ok) {
        setMatrices(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchProviderConfig = async () => {
    try {
      const res = await fetch('/api/admin/notifications/provider', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data) setProviderConfig(data);
      }
    } catch(e) {}
  };

  const saveRACI = async () => {
    setLoading(true);
    const activeWorkflow = customWorkflow || workflowProfile;
    
    try {
      for (const event of EVENTS) {
        const payload = {
          workflow_profile: activeWorkflow,
          event_name: event,
          responsible_emails: JSON.stringify(grid[event].R),
          accountable_emails: JSON.stringify(grid[event].A),
          consulted_emails: JSON.stringify(grid[event].C),
          informed_emails: JSON.stringify(grid[event].I),
          title_template: grid[event].title_template,
          message_template: grid[event].message_template
        };

        await fetch('/api/admin/notifications/raci', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }
      alert('RACI Matrix saved successfully!');
      fetchMatrices();
    } catch (e) {
      alert('Error saving RACI Matrix: ' + e.message);
    }
    setLoading(false);
  };

  const saveProviderConfig = async () => {
    setLoading(true);
    try {
      await fetch('/api/admin/notifications/provider', { method: 'POST', headers, body: JSON.stringify(providerConfig) });
      alert('SMTP settings saved!');
    } catch(e) { alert(e.message); }
    setLoading(false);
  };

  const handleAddEmail = (event, role, email) => {
    if (!email) return;
    setGrid(prev => ({
      ...prev,
      [event]: {
        ...prev[event],
        [role]: [...new Set([...prev[event][role], email])]
      }
    }));
  };

  const handleRemoveEmail = (event, role, email) => {
    setGrid(prev => ({
      ...prev,
      [event]: {
        ...prev[event],
        [role]: prev[event][role].filter(e => e !== email)
      }
    }));
  };

  const activeWorkflow = customWorkflow || workflowProfile;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            RACI Email Matrix
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure automated email notifications based on the Responsible, Accountable, Consulted, and Informed framework.
          </p>
        </div>
        <button 
          onClick={saveRACI} 
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Matrix
        </button>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-bold text-slate-700">SMTP Email Server Configuration</label>
          <button onClick={saveProviderConfig} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-colors flex items-center gap-1.5"><Save className="h-3 w-3" /> Save SMTP Config</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">SMTP Server</label><input type="text" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-blue-500 outline-none" value={providerConfig.smtp_server || ''} onChange={e => setProviderConfig({...providerConfig, smtp_server: e.target.value})} placeholder="e.g. smtp.office365.com"/></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Port</label><input type="number" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-blue-500 outline-none" value={providerConfig.port || ''} onChange={e => setProviderConfig({...providerConfig, port: parseInt(e.target.value)})} placeholder="587"/></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sender Email</label><input type="email" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-blue-500 outline-none" value={providerConfig.sender_email || ''} onChange={e => setProviderConfig({...providerConfig, sender_email: e.target.value})} placeholder="noreply@company.com"/></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Username</label><input type="text" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-blue-500 outline-none" value={providerConfig.username || ''} onChange={e => setProviderConfig({...providerConfig, username: e.target.value})} placeholder="SMTP Username"/></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password</label><input type="password" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-blue-500 outline-none" value={providerConfig.encrypted_password || ''} onChange={e => setProviderConfig({...providerConfig, encrypted_password: e.target.value})} placeholder="SMTP Password"/></div>
          <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sender Name</label><input type="text" className="w-full text-xs p-2 border border-slate-200 rounded focus:border-blue-500 outline-none" value={providerConfig.sender_name || ''} onChange={e => setProviderConfig({...providerConfig, sender_name: e.target.value})} placeholder="e.g. DocuFlow System"/></div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mb-6">
        <label className="block text-sm font-bold text-slate-700 mb-2">Target Workflow Profile</label>
        <div className="flex gap-4">
          <select 
            className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 outline-none focus:border-blue-500"
            value={workflowProfile}
            onChange={(e) => {
              setWorkflowProfile(e.target.value);
              setCustomWorkflow("");
            }}
          >
            {DEFAULT_WORKFLOWS.map(w => <option key={w} value={w}>{w}</option>)}
            <option value="custom">-- Custom Workflow --</option>
          </select>

          {workflowProfile === "custom" && (
            <input 
              type="text"
              placeholder="Enter exact workflow name..."
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 outline-none focus:border-blue-500"
              value={customWorkflow}
              onChange={(e) => setCustomWorkflow(e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="p-4 text-sm font-bold text-slate-700 w-48">Trigger Event</th>
              <th className="p-4 text-sm font-bold text-slate-700 w-1/4">
                <span className="text-blue-600">R</span>esponsible
                <div className="text-[10px] text-slate-400 font-normal mt-1">Required to take action</div>
              </th>
              <th className="p-4 text-sm font-bold text-slate-700 w-1/4">
                <span className="text-purple-600">A</span>ccountable
                <div className="text-[10px] text-slate-400 font-normal mt-1">Owns the outcome</div>
              </th>
              <th className="p-4 text-sm font-bold text-slate-700 w-1/4">
                <span className="text-amber-600">C</span>onsulted
                <div className="text-[10px] text-slate-400 font-normal mt-1">SME / Feedback provider</div>
              </th>
              <th className="p-4 text-sm font-bold text-slate-700 w-1/4">
                <span className="text-green-600">I</span>nformed
                <div className="text-[10px] text-slate-400 font-normal mt-1">Kept in the loop</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {EVENTS.map(event => (
              <React.Fragment key={event}>
                <tr className="border-t border-slate-200 bg-white">
                  <td className="p-4 text-sm font-bold text-slate-800 bg-slate-50/50 align-top">{event}</td>
                  {['R', 'A', 'C', 'I'].map(role => (
                    <td key={role} className="p-4 align-top border-l border-slate-100">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-1 mb-1">
                          {grid[event] && grid[event][role] && grid[event][role].map(email => (
                            <span key={email} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 border border-slate-200 rounded-md text-[10px] font-medium text-slate-700">
                              {email}
                              <button onClick={() => handleRemoveEmail(event, role, email)} className="text-slate-400 hover:text-red-500">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <input 
                            id={`input-${event}-${role}`}
                            type="text" 
                            placeholder="user@company.com" 
                            className="w-full text-xs p-1.5 bg-transparent border border-slate-200 rounded outline-none focus:border-blue-500 focus:bg-white transition-colors"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddEmail(event, role, e.target.value.trim());
                                e.target.value = '';
                              }
                            }}
                          />
                          <button 
                            className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 border border-slate-200 rounded flex-shrink-0 transition-colors"
                            title="Add User"
                            onClick={() => {
                              const input = document.getElementById(`input-${event}-${role}`);
                              if (input && input.value.trim()) {
                                handleAddEmail(event, role, input.value.trim());
                                input.value = '';
                              }
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </td>
                  ))}
                </tr>
                {/* Expandable template editor for the event */}
                {grid[event] && (
                  <tr className="bg-slate-50/30 border-b border-slate-200">
                    <td className="p-4 text-xs font-semibold text-slate-500 text-right align-top border-r border-slate-200">
                      Email Content
                      <div className="text-[9px] font-normal text-slate-400 mt-1">Variables:</div>
                      <div className="text-[9px] font-normal text-slate-400">{"{{document_number}}"}</div>
                      <div className="text-[9px] font-normal text-slate-400">{"{{vendor_name}}"}</div>
                      <div className="text-[9px] font-normal text-slate-400">{"{{amount}}"}</div>
                    </td>
                    <td colSpan={4} className="p-4 align-top">
                      <div className="flex flex-col gap-3 max-w-4xl">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Subject Template</label>
                          <input 
                            type="text" 
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded outline-none focus:border-blue-500"
                            placeholder="e.g. [ACTION REQUIRED] Invoice {{document_number}} needs your approval"
                            value={grid[event].title_template || ''}
                            onChange={(e) => setGrid(prev => ({ ...prev, [event]: { ...prev[event], title_template: e.target.value } }))}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Body Template</label>
                          <textarea 
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded outline-none focus:border-blue-500 min-h-[60px]"
                            placeholder={`e.g. Please review the invoice from {{vendor_name}} for {{amount}}.\nLast Action: {{performed_by}}\nComments: {{comments}}`}
                            value={grid[event].message_template || ''}
                            onChange={(e) => setGrid(prev => ({ ...prev, [event]: { ...prev[event], message_template: e.target.value } }))}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
