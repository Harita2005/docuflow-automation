/**
 * Settings > Customer Feedback (CFMS administration). CFMS <-> DocuFlow Integration Spec v2, section 8C.
 *
 * Talks ONLY to the DocuFlow backend (/api/admin/cfms/*), never to CFMS. No secrets, passwords or job data
 * are stored in localStorage/sessionStorage. Every mutating click creates ONE Idempotency-Key that is reused
 * for the retry of that click. Controls are hidden without permission; the backend still enforces them.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Clock, KeyRound, Mail, ScrollText, Loader2, RefreshCw, ChevronLeft, ChevronRight, Trash2, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';

const BASE = '/api/admin/cfms';
const IDEMPOTENT = new Set(['POST /sync/now', 'POST /sync/schedule', 'POST /salesforce/login-test', 'PUT /salesforce/password']);
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOT = { COMPLETED: 'bg-emerald-500', SCHEDULED: 'bg-sky-500', PROCESSING: 'bg-amber-500', RETRY_PENDING: 'bg-amber-500', FAILED: 'bg-red-500' };
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// ---------------------------------------------------------------- helpers (exported for tests)
export function istToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function fmtIst(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
}

/** Month grid Monday-Sunday: array of weeks, each 7 cells of 'YYYY-MM-DD' or null. */
export function monthGrid(month) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const cells = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Preview of attempt times for a schedule form. */
export function previewSlots(startTime, attempts, intervalMinutes) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime || '');
  const a = Number(attempts);
  const i = Number(intervalMinutes);
  if (!m || !Number.isInteger(a) || a < 1 || a > 6 || !Number.isInteger(i) || i < 15 || i > 240) return null;
  const start = Number(m[1]) * 60 + Number(m[2]);
  const out = [];
  for (let k = 0; k < a; k++) {
    const t = start + k * i;
    if (t > 23 * 60 + 59) return null;
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

/** Splits comma/space/newline separated addresses; returns {valid, invalid, duplicates}. */
export function splitAddresses(text) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const duplicates = [];
  for (const a of String(text || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    if (!EMAIL_RE.test(a)) { invalid.push(a); continue; }
    if (seen.has(a.toLowerCase())) { duplicates.push(a); continue; }
    seen.add(a.toLowerCase());
    valid.push(a);
  }
  return { valid, invalid, duplicates };
}

/**
 * Calls the DocuFlow backend. For the four idempotent operations the caller passes ONE key per click;
 * a network failure is retried once with the same key.
 */
export async function cfmsApi(method, path, { body, idempotencyKey } = {}) {
  const op = `${method} ${path.split('?')[0].replace(/\/[A-Za-z0-9-]+\/cancel$/, '/x/cancel')}`;
  const token = localStorage.getItem('authToken');
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (IDEMPOTENT.has(op)) headers['Idempotency-Key'] = idempotencyKey;
  const init = { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) };
  let res;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch (e) {
    if (!IDEMPOTENT.has(op)) throw e;
    res = await fetch(`${BASE}${path}`, init); // same Idempotency-Key: CFMS returns the original result
  }
  let data = null;
  if (res.status !== 204) { try { data = await res.json(); } catch { data = null; } }
  return { ok: res.ok, status: res.status, data, message: data?.error?.message || (res.ok ? '' : `Request failed (HTTP ${res.status}).`) };
}

const newKey = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// ---------------------------------------------------------------- small UI pieces (DocuFlow styling)
const Card = ({ title, subtitle, icon: Icon, children, actions }) => (
  <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
      <div className="flex items-center gap-2">
        {Icon && <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[#003F28] to-[#00452B] text-white flex items-center justify-center"><Icon className="h-3.5 w-3.5" /></div>}
        <div>
          <h3 className="text-xs font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
    <div className="p-4 space-y-3">{children}</div>
  </div>
);

const Notice = ({ type = 'info', children }) => {
  if (!children) return null;
  const cls = type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-700';
  return <div role={type === 'error' ? 'alert' : 'status'} className={`text-[11px] border rounded-md px-3 py-2 ${cls}`}>{children}</div>;
};

const Btn = ({ children, busy, variant = 'primary', ...props }) => (
  <button
    type="button"
    {...props}
    disabled={busy || props.disabled}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variant === 'primary' ? 'bg-[#003F28] text-white hover:bg-[#005333]' : variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
  >
    {busy && <Loader2 className="h-3 w-3 animate-spin" />}{children}
  </button>
);

const inputCls = 'w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600';

/** Polls GET /jobs/{id} every 5 s until a terminal status; calls onDone(job). */
function useJobPoller(onDone) {
  const timer = useRef(null);
  const doneRef = useRef(onDone);
  const [job, setJob] = useState(null);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);
  const stop = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  const start = useCallback((jobId) => {
    stop();
    const tick = async () => {
      const r = await cfmsApi('GET', `/jobs/${encodeURIComponent(jobId)}`).catch(() => null);
      if (r && r.ok) {
        setJob(r.data);
        if (TERMINAL.has(r.data.status)) {
          stop();
          if (doneRef.current) doneRef.current(r.data);
          return;
        }
      }
      timer.current = setTimeout(tick, 5000);
    };
    tick();
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { job, start, stop, setJob };
}

// ---------------------------------------------------------------- 1. Calendar & Sync
function CalendarSync({ can, onChanged }) {
  const today = istToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [dates, setDates] = useState({});
  const [selected, setSelected] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const [reload, setReload] = useState(0); // bump to refresh calendar and recent requests

  useEffect(() => {
    let alive = true;
    cfmsApi('GET', `/calendar?month=${month}`).then((r) => {
      if (!alive) return;
      if (r.ok) setDates(r.data.dates || {}); else setMsg({ type: 'error', text: r.message });
    }).catch(() => {});
    return () => { alive = false; };
  }, [month, reload]);
  useEffect(() => {
    let alive = true;
    cfmsApi('GET', '/jobs?limit=20').then((r) => { if (alive && r.ok) setJobs(r.data.jobs || []); }).catch(() => {});
    return () => { alive = false; };
  }, [reload]);

  const refresh = () => {
    setReload((n) => n + 1);
    if (onChanged) onChanged();
  };
  const poller = useJobPoller((j) => {
    setMsg({ type: j.status === 'COMPLETED' ? 'success' : 'error', text: `Report date ${j.reportDate}: ${j.status}. ${j.detail || ''}` });
    refresh();
  });

  useEffect(() => {
    if (!selected) { setLastRun(null); return; }
    cfmsApi('GET', `/audit?q=${encodeURIComponent(selected)}&page=1&pageSize=1`).then((r) => setLastRun(r.ok ? (r.data.rows || [])[0] || null : null)).catch(() => setLastRun(null));
  }, [selected]);

  const act = async (kind) => {
    const key = newKey();
    setBusy(kind); setMsg(null);
    try {
      const r = await cfmsApi('POST', kind === 'now' ? '/sync/now' : '/sync/schedule', { body: { reportDate: selected }, idempotencyKey: key });
      if (!r.ok) { setMsg({ type: 'error', text: r.message }); return; }
      if (kind === 'now') { setMsg({ type: 'info', text: `Synchronization of ${selected} started. Checking progress every 5 seconds...` }); poller.start(r.data.jobId); }
      else setMsg({ type: 'success', text: `Report date ${selected} scheduled for ${fmtIst(r.data.runAt)}.` });
      refresh();
    } catch { setMsg({ type: 'error', text: 'The DocuFlow server could not be reached.' }); } finally { setBusy(null); setConfirm(false); }
  };

  const cancel = async (jobId) => {
    setBusy(jobId);
    const r = await cfmsApi('POST', `/sync/${encodeURIComponent(jobId)}/cancel`).catch(() => null);
    setBusy(null);
    setMsg(r && r.ok ? { type: 'success', text: 'Scheduled request cancelled.' } : { type: 'error', text: r ? r.message : 'Request failed.' });
    refresh();
  };

  const status = selected ? dates[selected] : null;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
      <Card title="Calendar" subtitle="Report dates (India time). Future dates cannot be selected." icon={CalendarDays}
        actions={<div className="flex items-center gap-1">
          <Btn variant="secondary" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="h-3 w-3" /></Btn>
          <span className="text-xs font-bold text-slate-800 w-20 text-center">{month}</span>
          <Btn variant="secondary" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="h-3 w-3" /></Btn>
        </div>}>
        <table className="w-full text-center text-[11px] select-none" role="grid" aria-label={`Calendar ${month}`}>
          <thead><tr>{WEEKDAYS.map((d) => <th key={d} className="py-1 text-[10px] font-bold text-slate-500">{d}</th>)}</tr></thead>
          <tbody>
            {monthGrid(month).map((week, wi) => (
              <tr key={wi}>{week.map((d, di) => {
                if (!d) return <td key={di} />;
                const future = d > today;
                const st = dates[d] && dates[d].status;
                return (
                  <td key={d} className="p-0.5">
                    <button type="button" disabled={future} aria-label={`${d}${st ? ` ${st}` : ''}`} aria-pressed={selected === d}
                      onClick={() => { setSelected(d); setMsg(null); }}
                      className={`w-full h-9 rounded-md flex flex-col items-center justify-center gap-0.5 ${future ? 'text-slate-300 cursor-not-allowed' : selected === d ? 'bg-[#FFBF00] text-[#002F20] font-bold' : 'hover:bg-emerald-50 text-slate-700'}`}>
                      <span>{Number(d.slice(8))}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${st ? DOT[st] || 'bg-slate-300' : 'bg-transparent'}`} />
                    </button>
                  </td>
                );
              })}</tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
          {[['bg-emerald-500', 'Completed'], ['bg-sky-500', 'Scheduled'], ['bg-amber-500', 'Processing / retry pending'], ['bg-red-500', 'Failed']].map(([c, l]) => <span key={l} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${c}`} />{l}</span>)}
        </div>
      </Card>

      <div className="space-y-3">
        <Card title={selected ? `Report date ${selected}` : 'Select a report date'} subtitle="Status, last run and synchronization" icon={RefreshCw}>
          {!selected && <p className="text-[11px] text-slate-500">Choose a date in the calendar.</p>}
          {selected && (
            <>
              <div className="text-[11px] text-slate-700 space-y-1">
                <div><span className="font-bold">Status:</span> {status ? `${status.status}${status.detail ? ` - ${status.detail}` : ''}` : 'No run recorded'}</div>
                <div><span className="font-bold">Last run:</span> {lastRun ? `${fmtIst(lastRun.executedAt)} - ${lastRun.status}${lastRun.recordsFound != null ? `, ${lastRun.recordsFound} found / ${lastRun.recordsSynced ?? '-'} synced` : ''}` : '-'}</div>
              </div>
              {can.sync ? (
                <div className="flex flex-wrap gap-2">
                  <Btn variant="secondary" busy={busy === 'schedule'} disabled={Boolean(busy)} onClick={() => act('schedule')}>Schedule</Btn>
                  <Btn busy={busy === 'now'} disabled={Boolean(busy) || (poller.job && !TERMINAL.has(poller.job.status))} onClick={() => setConfirm(true)}>Sync Now</Btn>
                </div>
              ) : <p className="text-[10px] text-slate-500">You can view the calendar. Synchronization needs the cfms:sync permission.</p>}
              {confirm && (
                <div className="border border-amber-200 bg-amber-50 rounded-md p-3 space-y-2" role="dialog" aria-label="Confirm synchronization">
                  <p className="text-[11px] text-amber-900">Synchronize report date {selected} now? Records already in DocuFlow are skipped.</p>
                  <div className="flex gap-2"><Btn busy={busy === 'now'} onClick={() => act('now')}>Synchronize</Btn><Btn variant="secondary" onClick={() => setConfirm(false)}>Cancel</Btn></div>
                </div>
              )}
              {poller.job && !TERMINAL.has(poller.job.status) && <Notice>Job {poller.job.jobId}: {poller.job.status}...</Notice>}
            </>
          )}
          <Notice type={msg?.type}>{msg?.text}</Notice>
        </Card>

        <Card title="Recent requests" subtitle="Last 20 synchronization and login-test jobs" icon={Clock} actions={<Btn variant="secondary" aria-label="Refresh" onClick={() => setReload((n) => n + 1)}><RefreshCw className="h-3 w-3" /></Btn>}>
          {jobs.length === 0 ? <p className="text-[11px] text-slate-500">No requests yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-[11px]">
              <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1">Type</th><th>Report date</th><th>Status</th><th>Requested</th><th>Run at</th><th /></tr></thead>
              <tbody>{jobs.map((j) => (
                <tr key={j.jobId} className="border-t border-slate-100">
                  <td className="py-1">{j.type}</td><td>{j.reportDate || '-'}</td><td>{j.status}</td>
                  <td>{j.requestedBy || '-'}<br /><span className="text-slate-400">{fmtIst(j.requestedAt)}</span></td><td>{fmtIst(j.runAt)}</td>
                  <td>{can.sync && j.type === 'SYNC' && j.status === 'SCHEDULED' && <Btn variant="secondary" busy={busy === j.jobId} onClick={() => cancel(j.jobId)}>Cancel</Btn>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 2. Automation Schedule
function AutomationSchedule({ can }) {
  const [view, setView] = useState(null);
  const [form, setForm] = useState({ startTime: '10:00', attempts: 3, intervalMinutes: 60 });
  const [msg, setMsg] = useState(null);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await cfmsApi('GET', '/schedule').catch(() => null);
    if (r && r.ok) {
      setView(r.data);
      const src = r.data.pending || r.data.current;
      if (src) setForm({ startTime: src.startTime, attempts: src.attempts, intervalMinutes: src.intervalMinutes });
    } else if (r) setMsg({ type: 'error', text: r.message });
  }, []);
  useEffect(() => { load(); }, [load]);

  const preview = previewSlots(form.startTime, form.attempts, form.intervalMinutes);
  const save = async () => {
    setBusy(true); setMsg(null); setErrors([]);
    const r = await cfmsApi('PUT', '/schedule', { body: { startTime: form.startTime, attempts: Number(form.attempts), intervalMinutes: Number(form.intervalMinutes) } }).catch(() => null);
    setBusy(false);
    if (!r) { setMsg({ type: 'error', text: 'The DocuFlow server could not be reached.' }); return; }
    if (!r.ok) { setErrors(r.data?.errors || []); setMsg({ type: 'error', text: r.message }); return; }
    setView(r.data);
    setMsg({ type: 'success', text: 'Saved - not active until approved. Changes take effect from the next day (IST).' });
  };

  const slots = (s) => (s && s.slots ? s.slots.join(', ') : '-');
  return (
    <Card title="Automation Schedule" subtitle="Times are India Standard Time (IST)" icon={Clock}>
      {view && view.mode === 'fixed' && (
        <Notice type="warning">Production schedule in use: {(view.production?.slots || ['10:00', '11:00', '12:00', '13:00']).join(', ')} IST ({view.production?.attempts ?? 4} attempts).</Notice>
      )}
      {view && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="border border-slate-200 rounded-md p-3"><div className="font-bold text-slate-800 mb-1">Current (saved)</div>
            <div>{view.current ? `${view.current.startTime}, ${view.current.attempts} attempt(s), every ${view.current.intervalMinutes} min` : '-'}</div>
            <div className="text-slate-500">Slots: {slots(view.current)}</div>
            {view.mode === 'fixed' && <div className="text-amber-700 font-bold mt-1">Saved - not active until approved</div>}</div>
          <div className="border border-slate-200 rounded-md p-3"><div className="font-bold text-slate-800 mb-1">Pending</div>
            {view.pending ? (<><div>{`${view.pending.startTime}, ${view.pending.attempts} attempt(s), every ${view.pending.intervalMinutes} min`}</div>
              <div className="text-slate-500">Slots: {slots(view.pending)}</div><div className="text-slate-500">Effective from: {view.pending.effectiveFrom}</div>
              {view.mode === 'fixed' && <div className="text-amber-700 font-bold mt-1">Saved - not active until approved</div>}</>) : <div>-</div>}</div>
        </div>
      )}
      {can.admin ? (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] font-bold text-slate-600">Start time (IST)<input type="time" className={inputCls} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
            <label className="text-[10px] font-bold text-slate-600">Attempts (1-6)<input type="number" min="1" max="6" className={inputCls} value={form.attempts} onChange={(e) => setForm({ ...form, attempts: e.target.value })} /></label>
            <label className="text-[10px] font-bold text-slate-600">Interval (15-240 min)<input type="number" min="15" max="240" className={inputCls} value={form.intervalMinutes} onChange={(e) => setForm({ ...form, intervalMinutes: e.target.value })} /></label>
          </div>
          <p className="text-[11px] text-slate-600">Preview: {preview ? preview.join(', ') + ' IST' : 'invalid values (the last attempt must be before 23:59 IST)'}</p>
          <p className="text-[10px] text-slate-500">Saving does not change production. Saved values apply from the next day (IST), and only after the configurable scheduler is approved.</p>
          {errors.length > 0 && <ul className="text-[11px] text-red-700 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <Btn busy={busy} disabled={!preview} onClick={save}>Save Schedule</Btn>
        </div>
      ) : <p className="text-[10px] text-slate-500">Changing the schedule needs the cfms:admin permission.</p>}
      <Notice type={msg?.type}>{msg?.text}</Notice>
    </Card>
  );
}

// ---------------------------------------------------------------- 3. Salesforce Login (cfms:admin)
const LOGIN_RESULT = {
  SESSION_VALID: ['success', 'The saved Salesforce session is valid.'],
  LOGIN_VERIFIED: ['success', 'Logged in to Salesforce with the saved credentials.'],
  MFA_REQUIRED: ['warning', 'Salesforce is asking for a verification code. Complete login over RDP (OTP).'],
  PASSWORD_REJECTED: ['error', 'Salesforce rejected the saved password.'],
  BUSY: ['warning', 'An automation run is using the Salesforce profile. Try again later.'],
  ERROR: ['error', 'The login test could not be completed.']
};

function SalesforceLogin({ settings }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const poller = useJobPoller(useCallback((j) => {
    const code = j.result?.result || 'ERROR';
    const [type, text] = LOGIN_RESULT[code] || LOGIN_RESULT.ERROR;
    setMsg({ type, text: `${code}: ${text}${j.detail ? ` ${j.detail}` : ''}` });
  }, []));

  const mismatch = confirm.length > 0 && pw !== confirm;
  const savePassword = async () => {
    const key = newKey();
    setBusy('pw'); setMsg(null);
    try {
      const r = await cfmsApi('PUT', '/salesforce/password', { body: { newPassword: pw, confirmPassword: confirm }, idempotencyKey: key });
      setMsg(r.ok ? { type: 'success', text: 'Salesforce password saved. Use "Test Salesforce Login" to verify it.' } : { type: 'error', text: r.message });
    } catch { setMsg({ type: 'error', text: 'The DocuFlow server could not be reached. The password may not have been saved.' }); } finally {
      setPw(''); setConfirm(''); setBusy(null); // never kept after a response
    }
  };
  const test = async () => {
    const key = newKey();
    setBusy('test'); setMsg(null);
    try {
      const r = await cfmsApi('POST', '/salesforce/login-test', { idempotencyKey: key });
      if (r.ok) { setMsg({ type: 'info', text: 'Login test started. Checking every 5 seconds...' }); poller.start(r.data.jobId); } else setMsg({ type: 'error', text: r.message });
    } catch { setMsg({ type: 'error', text: 'The DocuFlow server could not be reached.' }); } finally { setBusy(null); }
  };
  const sf = settings?.salesforce || {};
  const running = poller.job && !TERMINAL.has(poller.job.status);
  return (
    <Card title="Salesforce Login" subtitle="Super Admin only. The password is sent to CFMS and never stored in the browser." icon={KeyRound}>
      <label className="block text-[10px] font-bold text-slate-600">Username<input className={`${inputCls} bg-slate-50`} value={sf.username || ''} readOnly /></label>
      <div className="text-[10px] text-slate-500">
        {sf.passwordUpdatedAt ? `Password last changed by ${sf.passwordUpdatedBy || '-'} on ${fmtIst(sf.passwordUpdatedAt)}.` : 'Password change date unknown.'}
        {sf.lastLoginTest ? ` Last login test: ${sf.lastLoginTest.result} (${fmtIst(sf.lastLoginTest.at)}, ${sf.lastLoginTest.by || '-'}).` : ''}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="text-[10px] font-bold text-slate-600">New password<input type="password" autoComplete="new-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} maxLength={256} /></label>
        <label className="text-[10px] font-bold text-slate-600">Confirm password<input type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={256} /></label>
      </div>
      {mismatch && <p className="text-[11px] text-red-700">The passwords do not match.</p>}
      <div className="flex flex-wrap gap-2">
        <Btn busy={busy === 'pw'} disabled={Boolean(busy) || !pw || pw !== confirm || pw.length < 8} onClick={savePassword}>Save Password</Btn>
        <Btn variant="secondary" busy={busy === 'test' || running} disabled={Boolean(busy) || running} onClick={test}>Test Salesforce Login</Btn>
      </div>
      <Notice type={msg?.type}>{msg?.text}</Notice>
    </Card>
  );
}

// ---------------------------------------------------------------- 4. Email Settings (cfms:settings)
function EmailSettings({ settings, reload }) {
  const email = settings?.email || {};
  const [sender, setSender] = useState(email.sender || '');
  const [addText, setAddText] = useState('');
  const [editAll, setEditAll] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { setSender(email.sender || ''); }, [email.sender]);
  const recipients = email.recipients || [];

  const run = async (id, fn) => {
    setBusy(id); setMsg(null);
    try { await fn(); } catch { setMsg({ type: 'error', text: 'The DocuFlow server could not be reached.' }); } finally { setBusy(null); }
  };
  const saveSender = () => run('sender', async () => {
    const r = await cfmsApi('PUT', '/email/sender', { body: { sender: sender.trim() } });
    setMsg(r.ok ? { type: 'success', text: `Sender saved: ${r.data.sender}.` } : { type: 'error', text: r.message });
    if (r.ok) reload();
  });
  const add = () => run('add', async () => {
    const p = splitAddresses(addText);
    if (p.invalid.length) { setMsg({ type: 'error', text: `Invalid address(es): ${p.invalid.join(', ')}` }); return; }
    if (!p.valid.length) { setMsg({ type: 'error', text: 'Enter at least one address.' }); return; }
    const r = await cfmsApi('POST', '/email/recipients', { body: { recipients: p.valid } });
    if (!r.ok) { setMsg({ type: 'error', text: r.message }); return; }
    const skipped = [...p.duplicates, ...(r.data.skipped || [])];
    setMsg({ type: 'success', text: `Added ${r.data.added.length}. ${skipped.length ? `Skipped (already listed / duplicate): ${skipped.join(', ')}. ` : ''}${r.data.total} in total.` });
    setAddText(''); reload();
  });
  const saveAll = () => run('all', async () => {
    const p = splitAddresses(editAll);
    if (p.invalid.length) { setMsg({ type: 'error', text: `Invalid address(es): ${p.invalid.join(', ')}` }); return; }
    if (!p.valid.length) { setMsg({ type: 'error', text: 'At least one recipient is required.' }); return; }
    if (p.valid.length > 500) { setMsg({ type: 'error', text: 'At most 500 recipients are allowed.' }); return; }
    const r = await cfmsApi('PUT', '/email/recipients', { body: { recipients: p.valid } });
    if (!r.ok) { setMsg({ type: 'error', text: r.message }); return; }
    const dups = [...p.duplicates, ...(r.data.removedDuplicates || [])];
    setMsg({ type: 'success', text: `Saved ${r.data.recipients.length} recipient(s).${dups.length ? ` Removed duplicates: ${dups.join(', ')}.` : ''}` });
    setEditAll(null); reload();
  });
  const remove = (e) => run(`rm:${e}`, async () => {
    const r = await cfmsApi('DELETE', `/email/recipients/${encodeURIComponent(e)}`);
    setMsg(r.ok ? { type: 'success', text: `Removed ${e}. ${r.data.total} remain.` } : { type: 'error', text: r.message });
    if (r.ok) reload();
  });

  return (
    <Card title="Email Settings" subtitle={`Daily report and alert e-mails. SMTP ${email.smtpConfigured ? 'configured' : 'NOT configured'} on the CFMS server.`} icon={Mail}>
      <div className="flex gap-2 items-end">
        <label className="flex-1 text-[10px] font-bold text-slate-600">Sender<input type="email" className={inputCls} value={sender} onChange={(e) => setSender(e.target.value)} maxLength={254} /></label>
        <Btn busy={busy === 'sender'} disabled={Boolean(busy) || !EMAIL_RE.test(sender.trim())} onClick={saveSender}>Save Sender</Btn>
      </div>
      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between"><h4 className="text-[11px] font-bold text-slate-800">Recipients</h4><span className="text-[10px] text-slate-500">{recipients.length} saved</span></div>
        <ul className="mt-2 divide-y divide-slate-100 border border-slate-200 rounded-md max-h-56 overflow-y-auto">
          {recipients.length === 0 && <li className="px-3 py-2 text-[11px] text-slate-500">No recipients configured.</li>}
          {recipients.map((e) => (
            <li key={e} className="px-3 py-1.5 flex items-center justify-between text-[11px]"><span>{e}</span>
              <button type="button" aria-label={`Remove ${e}`} disabled={Boolean(busy) || recipients.length <= 1} title={recipients.length <= 1 ? 'At least one recipient must remain' : 'Remove'} onClick={() => remove(e)} className="text-red-600 hover:text-red-800 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button></li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 items-end">
        <label className="flex-1 text-[10px] font-bold text-slate-600">Add recipients (comma or space separated)<input className={inputCls} value={addText} onChange={(e) => setAddText(e.target.value)} /></label>
        <Btn busy={busy === 'add'} disabled={Boolean(busy) || !addText.trim()} onClick={add}>Add</Btn>
      </div>
      {editAll === null ? <Btn variant="secondary" onClick={() => setEditAll(recipients.join('\n'))}>Edit all</Btn> : (
        <div className="space-y-2">
          <textarea className={`${inputCls} h-32 font-mono`} value={editAll} onChange={(e) => setEditAll(e.target.value)} aria-label="All recipients" />
          {(() => { const p = splitAddresses(editAll); return <p className="text-[10px] text-slate-500">{p.valid.length} valid{p.invalid.length ? `, ${p.invalid.length} invalid: ${p.invalid.slice(0, 5).join(', ')}` : ''}{p.duplicates.length ? `, ${p.duplicates.length} duplicate(s)` : ''}</p>; })()}
          <div className="flex gap-2"><Btn busy={busy === 'all'} onClick={saveAll}>Save List</Btn><Btn variant="secondary" onClick={() => setEditAll(null)}>Cancel</Btn></div>
        </div>
      )}
      <Notice type={msg?.type}>{msg?.text}</Notice>
    </Card>
  );
}

// ---------------------------------------------------------------- 5. Audit Logs (cfms:view)
function AuditLogs({ refreshToken }) {
  const [filters, setFilters] = useState({ from: '', to: '', status: '', type: '', q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ total: 0, rows: [], pageSize: 50 });
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page: String(p), pageSize: '50' });
    const r = await cfmsApi('GET', `/audit?${qs.toString()}`).catch(() => null);
    setLoading(false);
    if (r && r.ok) { setData(r.data); setMsg(null); } else setMsg({ type: 'error', text: r ? r.message : 'The DocuFlow server could not be reached.' });
  }, [filters, page]);
  useEffect(() => { load(page); }, [page, refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 50)));
  const v = (x) => (x === null || x === undefined || x === '' ? '-' : x);
  return (
    <Card title="Audit Logs" subtitle="Scheduled and manual automation runs" icon={ScrollText}>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
        <label className="text-[10px] font-bold text-slate-600">From<input type="date" className={inputCls} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
        <label className="text-[10px] font-bold text-slate-600">To<input type="date" className={inputCls} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
        <label className="text-[10px] font-bold text-slate-600">Status<select className={inputCls} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All</option>{['SUCCESS', 'NO_RECORDS', 'PARTIAL', 'FAILED', 'RUNNING', 'INTERRUPTED'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="text-[10px] font-bold text-slate-600">Type<select className={inputCls} value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All</option><option value="SCHEDULED">SCHEDULED</option><option value="MANUAL">MANUAL</option></select></label>
        <label className="text-[10px] font-bold text-slate-600">Search<input className={inputCls} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} maxLength={100} /></label>
        <Btn busy={loading} onClick={() => { setPage(1); load(1); }}>Apply</Btn>
      </div>
      <Notice type={msg?.type}>{msg?.text}</Notice>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr className="text-left text-[10px] text-slate-500 border-b border-slate-200">
            {['Executed (IST)', 'Report date', 'Type / source', 'Attempt', 'Records found', 'Synced', 'Failed', 'Images uploaded', 'Image failures', 'Status', 'Error'].map((h) => <th key={h} className="py-1.5 pr-2 whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan={11} className="py-3 text-center text-slate-500">No runs match the filters.</td></tr>}
            {data.rows.map((r, i) => (
              <tr key={`${r.executedAt}-${i}`} className="border-b border-slate-100 align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{r.executedAt ? fmtIst(r.executedAt) : v(r.executedAtIst)}</td><td className="pr-2">{v(r.reportDate)}</td>
                <td className="pr-2">{v(r.type)}{r.source ? ` / ${r.source}` : ''}</td><td className="pr-2">{v(r.attempt)}</td><td className="pr-2">{v(r.recordsFound)}</td>
                <td className="pr-2">{v(r.recordsSynced)}</td><td className="pr-2">{v(r.recordsFailed)}</td><td className="pr-2">{v(r.imagesUploaded)}</td><td className="pr-2">{v(r.imagesFailed)}</td>
                <td className="pr-2 font-bold">{v(r.status)}</td><td className="pr-2 text-slate-600 max-w-xs">{v(r.error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>{data.total} run(s)</span>
        <div className="flex items-center gap-1"><Btn variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn><span>Page {page} / {pages}</span><Btn variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Btn></div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- container
const SECTIONS = [
  { id: 'calendar', label: 'Calendar & Sync', icon: CalendarDays, perm: 'cfms:view' },
  { id: 'schedule', label: 'Automation Schedule', icon: Clock, perm: 'cfms:view' },
  { id: 'salesforce', label: 'Salesforce Login', icon: KeyRound, perm: 'cfms:admin' },
  { id: 'email', label: 'Email Settings', icon: Mail, perm: 'cfms:settings' },
  { id: 'audit', label: 'Audit Logs', icon: ScrollText, perm: 'cfms:view' }
];

export default function CustomerFeedbackSettings({ permissions = [] }) {
  const can = useMemo(() => ({ view: permissions.includes('cfms:view'), sync: permissions.includes('cfms:sync'), settings: permissions.includes('cfms:settings'), admin: permissions.includes('cfms:admin') }), [permissions]);
  const visible = SECTIONS.filter((s) => permissions.includes(s.perm));
  const [section, setSection] = useState(visible[0]?.id || null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [auditToken, setAuditToken] = useState(0);

  const loadSettings = useCallback(async () => {
    if (!can.view) return;
    const r = await cfmsApi('GET', '/settings').catch(() => null);
    if (r && r.ok) { setSettings(r.data); setError(null); } else setError(r ? r.message : 'The DocuFlow server could not be reached.');
  }, [can.view]);
  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (section && !visible.some((s) => s.id === section)) setSection(visible[0]?.id || null); }, [visible, section]);

  if (!visible.length) {
    return <Notice type="warning"><ShieldAlert className="inline h-3.5 w-3.5 mr-1" />You do not have access to Customer Feedback settings.</Notice>;
  }
  return (
    <div className="space-y-3 pb-6">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Customer Feedback sections">
        {visible.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id} onClick={() => setSection(s.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${section === s.id ? 'bg-[#FFBF00] text-[#002F20] shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <s.icon className="h-3.5 w-3.5" />{s.label}
          </button>
        ))}
      </div>
      {error && <Notice type="error"><AlertTriangle className="inline h-3.5 w-3.5 mr-1" />{error}</Notice>}
      {!error && settings && section === 'calendar' && settings.schedule?.mode === 'fixed' && (
        <Notice><CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />Daily automation: {(settings.schedule.production?.slots || []).join(', ')} IST.</Notice>
      )}
      {section === 'calendar' && <CalendarSync can={can} onChanged={() => setAuditToken((t) => t + 1)} />}
      {section === 'schedule' && <AutomationSchedule can={can} />}
      {section === 'salesforce' && can.admin && <SalesforceLogin settings={settings} />}
      {section === 'email' && can.settings && <EmailSettings settings={settings} reload={loadSettings} />}
      {section === 'audit' && <AuditLogs refreshToken={auditToken} />}
    </div>
  );
}
