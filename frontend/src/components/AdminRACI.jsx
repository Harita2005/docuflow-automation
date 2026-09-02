import React, { useState, useEffect } from 'react';
import { Save, RefreshCw, Mail, Users, Plus, X, Server, Edit3, Sparkles } from 'lucide-react';

const EVENTS = ["Approve", "Reject", "Request Clarification", "Send Back", "Escalate"];

export default function AdminRACI() {
  const [loading, setLoading] = useState(false);
  const [matrices, setMatrices] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [workflowProfile, setWorkflowProfile] = useState("");
  const [customWorkflow, setCustomWorkflow] = useState("");
  const [activeModalEvent, setActiveModalEvent] = useState(null);
  
  // State for the grid for the current workflow
  const [grid, setGrid] = useState({});
  const [providerConfig, setProviderConfig] = useState({ smtp_server: '', port: 587, username: '', encrypted_password: '', sender_email: '', sender_name: '' });

  useEffect(() => {
    fetchMatrices();
    fetchProviderConfig();
    fetchWorkflows();
  }, []);

  useEffect(() => {
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

  const fetchWorkflows = async () => {
    try {
      const res = await fetch('/api/admin/workflows', { headers });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data);
        if (data.length > 0 && !workflowProfile) {
          setWorkflowProfile(data[0].profile_name);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const saveRACI = async () => {
    setLoading(true);
    const activeWorkflow = customWorkflow || workflowProfile;
    
    const currentGrid = { ...grid };
    EVENTS.forEach(event => {
      ['R', 'A', 'C', 'I'].forEach(role => {
        const input = document.getElementById(`input-${event}-${role}`);
        if (input && input.value.trim()) {
          const email = input.value.trim();
          if (currentGrid[event] && currentGrid[event][role]) {
            currentGrid[event][role] = [...new Set([...currentGrid[event][role], email])];
          }
          input.value = '';
        }
      });
    });
    setGrid(currentGrid);
    
    try {
      for (const event of EVENTS) {
        const payload = {
          workflow_profile: activeWorkflow,
          event_name: event,
          responsible_emails: JSON.stringify(currentGrid[event].R),
          accountable_emails: JSON.stringify(currentGrid[event].A),
          consulted_emails: JSON.stringify(currentGrid[event].C),
          informed_emails: JSON.stringify(currentGrid[event].I),
          title_template: currentGrid[event].title_template,
          message_template: currentGrid[event].message_template
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
      alert('SMTP settings saved successfully!');
    } catch(e) { alert(e.message); }
    setLoading(false);
  };

  const testSMTPConnection = async () => {
    const userEmail = localStorage.getItem("currentUserEmail") || "";
    const targetEmail = window.prompt("Enter recipient email address for SMTP test:", userEmail || "admin@company.com");
    if (!targetEmail) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/test', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: targetEmail.trim(),
          subject: 'DocuFlow Automation - SMTP Test',
          html: '<p>This is a test email from DocuFlow RACI Engine. If you received this, your SMTP settings are configured correctly!</p>'
        })
      });
      if (res.ok) {
        alert(`Test email sent successfully to ${targetEmail.trim()}!`);
      } else {
        const err = await res.json();
        alert('Error sending test email: ' + (err.error || 'Unknown error'));
      }
    } catch(e) {
      alert('Error: ' + e.message);
    }
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

  const insertVariable = (event, field, varName) => {
    setGrid(prev => ({
      ...prev,
      [event]: {
        ...prev[event],
        [field]: (prev[event][field] || '') + ` {{${varName}}}`
      }
    }));
  };

  return (
    <div className="p-3 flex flex-col gap-3 font-sans text-xs">
      
      {/* HEADER BAR */}
      <div className="flex justify-between items-center bg-white p-2 px-3 rounded-xl shadow-2xs border border-slate-200">
        <div>
          <h2 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-blue-600" />
            RACI Email Matrix & SMTP Engine
          </h2>
          <p className="text-[9px] font-medium text-slate-500">
            Configure automated email notifications (Responsible, Accountable, Consulted, Informed) and SMTP credentials.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button 
            onClick={testSMTPConnection} 
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-blue-700 font-bold text-[9.5px] uppercase tracking-wide rounded-md transition shadow-2xs border border-slate-200 cursor-pointer active:scale-98 h-6.5"
          >
            <Mail className="h-3 w-3" /> Test Email
          </button>
          <button 
            onClick={saveRACI} 
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[9.5px] uppercase tracking-wide rounded-md transition shadow-2xs cursor-pointer active:scale-98 disabled:opacity-50 h-6.5"
          >
            {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Matrix
          </button>
        </div>
      </div>

      {/* SMTP EMAIL SERVER CONFIGURATION CARD */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="bg-slate-50/80 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Server className="h-3 w-3 text-blue-600" />
            <h3 className="text-[8.5px] font-black text-slate-700 uppercase tracking-wider">
              SMTP Email Server Settings
            </h3>
          </div>
          <button 
            onClick={saveProviderConfig} 
            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[8.5px] font-bold uppercase rounded transition shadow-2xs cursor-pointer"
          >
            Save SMTP Config
          </button>
        </div>

        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">SMTP SERVER</label>
            <input type="text" className="w-full text-[9.5px] font-mono font-bold px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-hidden h-6.5 text-slate-900" value={providerConfig.smtp_server || ''} onChange={e => setProviderConfig({...providerConfig, smtp_server: e.target.value})} placeholder="smtp.office365.com"/>
          </div>
          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">PORT</label>
            <input type="number" className="w-full text-[9.5px] font-mono font-bold px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-hidden h-6.5 text-slate-900" value={providerConfig.port || ''} onChange={e => setProviderConfig({...providerConfig, port: parseInt(e.target.value)})} placeholder="587"/>
          </div>
          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">SENDER EMAIL</label>
            <input type="email" className="w-full text-[9.5px] font-mono font-bold px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-hidden h-6.5 text-slate-900" value={providerConfig.sender_email || ''} onChange={e => setProviderConfig({...providerConfig, sender_email: e.target.value})} placeholder="noreply@company.com"/>
          </div>
          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">USERNAME</label>
            <input type="text" className="w-full text-[9.5px] font-mono font-bold px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-hidden h-6.5 text-slate-900" value={providerConfig.username || ''} onChange={e => setProviderConfig({...providerConfig, username: e.target.value})} placeholder="SMTP Username"/>
          </div>
          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">PASSWORD</label>
            <input type="password" className="w-full text-[9.5px] font-mono font-bold px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-hidden h-6.5 text-slate-900" value={providerConfig.encrypted_password || ''} onChange={e => setProviderConfig({...providerConfig, encrypted_password: e.target.value})} placeholder="••••••••"/>
          </div>
          <div>
            <label className="block text-[8.5px] font-black text-slate-500 uppercase mb-0.5">SENDER NAME</label>
            <input type="text" className="w-full text-[9.5px] font-mono font-bold px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md focus:border-blue-500 outline-hidden h-6.5 text-slate-900" value={providerConfig.sender_name || ''} onChange={e => setProviderConfig({...providerConfig, sender_name: e.target.value})} placeholder="DocuFlow Alerts"/>
          </div>
        </div>
      </div>

      {/* TARGET WORKFLOW PROFILE SELECTOR BAR */}
      <div className="bg-white p-2 px-3 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
        <label className="text-[9px] font-black text-slate-700 uppercase tracking-wide shrink-0">
          Target Workflow Profile:
        </label>
        <div className="flex items-center gap-2 flex-1 max-w-lg">
          <select 
            className="flex-1 px-2 py-0.5 bg-slate-50 border border-slate-200 hover:border-slate-300 transition rounded-md text-[9.5px] font-bold text-slate-900 outline-hidden focus:border-blue-500 h-6.5 cursor-pointer"
            value={workflowProfile}
            onChange={(e) => {
              setWorkflowProfile(e.target.value);
              setCustomWorkflow("");
            }}
          >
            {Object.entries(
              workflows.reduce((acc, wf) => {
                const category = wf.workflow_type || 'General';
                const subCategory = wf.profile_name.includes(' - ') ? wf.profile_name.split(' - ')[0] : 'Other Workflows';
                const groupName = `${category} > ${subCategory}`;
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(wf.profile_name);
                return acc;
              }, {})
            ).map(([groupName, wfs]) => (
              <optgroup key={groupName} label={groupName}>
                {wfs.map(w => <option key={w} value={w}>{w}</option>)}
              </optgroup>
            ))}
            <option value="custom">-- Custom Workflow --</option>
          </select>

          {workflowProfile === "custom" && (
            <input 
              type="text"
              placeholder="Enter exact workflow name..."
              className="flex-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-[9.5px] font-mono h-6.5 outline-hidden focus:border-blue-500"
              value={customWorkflow}
              onChange={(e) => setCustomWorkflow(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* RACI MATRIX TABLE */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[8.5px] font-black text-slate-400 uppercase tracking-wider">
              <th className="py-1.5 px-3 w-40">Trigger Event</th>
              <th className="py-1.5 px-3 w-1/4">
                <span className="text-blue-600 font-black">R</span>ESPONSIBLE
                <span className="text-[7.5px] text-slate-400 block font-medium">Required to take action</span>
              </th>
              <th className="py-1.5 px-3 w-1/4">
                <span className="text-purple-600 font-black">A</span>CCOUNTABLE
                <span className="text-[7.5px] text-slate-400 block font-medium">Owns the outcome</span>
              </th>
              <th className="py-1.5 px-3 w-1/4">
                <span className="text-amber-600 font-black">C</span>ONSULTED
                <span className="text-[7.5px] text-slate-400 block font-medium">SME / Feedback provider</span>
              </th>
              <th className="py-1.5 px-3 w-1/4">
                <span className="text-emerald-600 font-black">I</span>NFORMED
                <span className="text-[7.5px] text-slate-400 block font-medium">Kept in the loop</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[10px]">
            {EVENTS.map(event => (
              <tr key={event} className="hover:bg-slate-50/60 transition">
                <td className="py-2 px-3 align-top font-bold text-slate-900 bg-slate-50/40">
                  <div className="text-[10px] font-extrabold">{event}</div>
                  <button
                    type="button"
                    onClick={() => setActiveModalEvent(event)}
                    className="mt-1.5 px-2 py-0.5 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-blue-700 rounded text-[8.5px] font-bold transition inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <Edit3 className="h-2.5 w-2.5 text-blue-600" />
                    Configure Template
                  </button>
                </td>

                {['R', 'A', 'C', 'I'].map(role => (
                  <td key={role} className="py-2 px-3 align-top border-l border-slate-100">
                    <div className="flex flex-col gap-1.5">
                      {/* Active Email Tags */}
                      <div className="flex flex-wrap gap-1">
                        {grid[event] && grid[event][role] && grid[event][role].map(email => (
                          <span key={email} className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-[8.5px] font-mono text-slate-700">
                            {email}
                            <button onClick={() => handleRemoveEmail(event, role, email)} className="text-slate-400 hover:text-red-500 cursor-pointer">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>

                      {/* Email Input */}
                      <div className="flex items-center gap-1">
                        <input 
                          id={`input-${event}-${role}`}
                          type="text" 
                          placeholder="user@company.com" 
                          className="w-full text-[9px] font-mono px-2 py-0.5 bg-slate-50 border border-slate-200 rounded focus:border-blue-500 outline-hidden h-6"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddEmail(event, role, e.target.value.trim());
                              e.target.value = '';
                            }
                          }}
                        />
                        <button 
                          className="p-1 bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 border border-slate-200 rounded shrink-0 transition cursor-pointer"
                          title="Add User Email"
                          onClick={() => {
                            const input = document.getElementById(`input-${event}-${role}`);
                            if (input && input.value.trim()) {
                              handleAddEmail(event, role, input.value.trim());
                              input.value = '';
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EMAIL TEMPLATE MODAL DIALOG POPUP */}
      {activeModalEvent && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-fadeIn">
            {/* Modal Header */}
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">
                  Configure Email Template ({activeModalEvent})
                </h3>
              </div>
              <button
                onClick={() => setActiveModalEvent(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3.5">
              {/* Subject Template */}
              <div>
                <label className="block text-[8.5px] font-black uppercase text-slate-500 mb-1">
                  SUBJECT TEMPLATE
                </label>
                <input
                  type="text"
                  className="w-full text-xs font-mono font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-hidden focus:border-blue-500 text-slate-900 h-8"
                  placeholder="e.g. [ACTION REQUIRED] Invoice {{document_number}} needs your review"
                  value={grid[activeModalEvent]?.title_template || ''}
                  onChange={(e) => setGrid(prev => ({
                    ...prev,
                    [activeModalEvent]: { ...prev[activeModalEvent], title_template: e.target.value }
                  }))}
                />
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  <span className="text-[8px] font-extrabold text-slate-400">Insert Variable:</span>
                  {['document_number', 'vendor_name', 'amount'].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(activeModalEvent, 'title_template', v)}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded-md text-[8.5px] font-mono font-semibold transition border border-slate-200 cursor-pointer"
                    >
                      + {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body Template */}
              <div>
                <label className="block text-[8.5px] font-black uppercase text-slate-500 mb-1">
                  BODY TEMPLATE
                </label>
                <textarea
                  className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-hidden focus:border-blue-500 min-h-[110px] font-medium text-slate-900 leading-relaxed"
                  placeholder={`e.g. Please review invoice {{document_number}} from {{vendor_name}} (₹{{amount}}).\nReview URL: {{review_url}}`}
                  value={grid[activeModalEvent]?.message_template || ''}
                  onChange={(e) => setGrid(prev => ({
                    ...prev,
                    [activeModalEvent]: { ...prev[activeModalEvent], message_template: e.target.value }
                  }))}
                />
                <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                  <span className="text-[8px] font-extrabold text-slate-400">Insert Variable:</span>
                  {['document_number', 'vendor_name', 'amount', 'review_url'].map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(activeModalEvent, 'message_template', v)}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded-md text-[8.5px] font-mono font-semibold transition border border-slate-200 cursor-pointer"
                    >
                      + {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setActiveModalEvent(null)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[9.5px] uppercase tracking-wide rounded-md transition shadow-2xs cursor-pointer active:scale-98"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


