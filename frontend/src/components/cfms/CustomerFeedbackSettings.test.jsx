import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent as domFireEvent, waitFor, within } from '@testing-library/dom';
import CustomerFeedbackSettings, { monthGrid, previewSlots, splitAddresses, shiftMonth, istToday, cfmsApi, generateUUIDv4 } from './CustomerFeedbackSettings.jsx';

// The npm workspace hoists React 18 (with @testing-library/react) to the repository root while the frontend
// uses React 19, so these tests render with the frontend's own react-dom and query with @testing-library/dom.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root = null;
let container = null;
function render(ui) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(ui); });
}
function cleanup() {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  root = null; container = null;
}
const fireEvent = new Proxy({}, { get: (_t, name) => (...args) => { let r; act(() => { r = domFireEvent[name](...args); }); return r; } });

const ALL = ['cfms:admin', 'cfms:settings', 'cfms:sync', 'cfms:view'];
const SETTINGS = {
  salesforce: { username: 'svc@ramrajcotton.net', passwordUpdatedAt: null, passwordUpdatedBy: null, lastLoginTest: null },
  email: { sender: 'communication@ramrajcotton.net', recipients: ['it@ramrajcotton.net'], smtpConfigured: true },
  schedule: { timezone: 'Asia/Kolkata', mode: 'fixed', production: { slots: ['10:00', '11:00', '12:00', '13:00'], attempts: 4 }, current: { startTime: '10:00', attempts: 3, intervalMinutes: 60, slots: ['10:00', '11:00', '12:00'] }, pending: null }
};

let calls;
function mockFetch(routes = {}) {
  calls = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const path = String(url).replace('/api/admin/cfms', '');
    const key = `${init.method || 'GET'} ${path.split('?')[0]}`;
    calls.push({ key, url: String(url), init, body: init.body ? JSON.parse(init.body) : undefined });
    const h = routes[key] || routes[`${init.method || 'GET'} *`];
    const [status, body] = h ? h(path, init) : [200, {}];
    return { ok: status < 400, status, json: async () => body };
  });
}

beforeEach(() => { localStorage.setItem('authToken', 'test-token'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

describe('helpers', () => {
  it('month grid is Monday-first and covers every day', () => {
    const g = monthGrid('2026-11'); // 1 Nov 2026 is a Sunday
    expect(g[0].slice(0, 6).every((c) => c === null)).toBe(true);
    expect(g[0][6]).toBe('2026-11-01');
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('schedule preview and limits', () => {
    expect(previewSlots('10:00', 3, 60)).toEqual(['10:00', '11:00', '12:00']);
    expect(previewSlots('10:00', 7, 60)).toBeNull();
    expect(previewSlots('10:00', 2, 10)).toBeNull();
    expect(previewSlots('23:30', 2, 60)).toBeNull();
  });
  it('address parsing reports invalid and duplicates', () => {
    expect(splitAddresses('a@x.com, b@x.com A@x.com bad')).toEqual({ valid: ['a@x.com', 'b@x.com'], invalid: ['bad'], duplicates: ['A@x.com'] });
  });
  it('istToday returns the India date', () => {
    expect(istToday(new Date('2026-11-10T20:00:00Z'))).toBe('2026-11-11');
  });
  it('cfmsApi sends Bearer token and the Idempotency-Key only on idempotent calls; retries a network error with the SAME key', async () => {
    let n = 0;
    global.fetch = vi.fn(async (_url, _init) => { n++; if (n === 1) throw new TypeError('network'); return { ok: true, status: 202, json: async () => ({ jobId: 'J-1' }) }; });
    const r = await cfmsApi('POST', '/sync/now', { body: { reportDate: '2026-11-01' }, idempotencyKey: 'k-1' });
    expect(r.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of global.fetch.mock.calls) {
      expect(init.headers.Authorization).toBe('Bearer test-token');
      expect(init.headers['Idempotency-Key']).toBe('k-1');
    }
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await cfmsApi('PUT', '/email/sender', { body: { sender: 'a@x.com' }, idempotencyKey: 'ignored' });
    expect(global.fetch.mock.calls[0][1].headers['Idempotency-Key']).toBeUndefined();
  });
  it('generateUUIDv4 produces RFC 4122 v4 compliant UUIDs across secure and insecure environments', () => {
    const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // 1. Standard execution
    const u1 = generateUUIDv4();
    const u2 = generateUUIDv4();
    expect(u1).toMatch(UUID_V4_RE);
    expect(u2).toMatch(UUID_V4_RE);
    expect(u1).not.toBe(u2);

    // 2. Insecure HTTP context simulation (crypto.randomUUID is undefined)
    const origRandomUUID = globalThis.crypto?.randomUUID;
    try {
      if (globalThis.crypto) {
        delete globalThis.crypto.randomUUID;
      }
      const uInsecure = generateUUIDv4();
      expect(uInsecure).toMatch(UUID_V4_RE);
    } finally {
      if (globalThis.crypto && origRandomUUID) {
        globalThis.crypto.randomUUID = origRandomUUID;
      }
    }
  });
});

describe('CustomerFeedbackSettings', () => {
  it('without cfms permissions shows no controls', () => {
    mockFetch();
    render(<CustomerFeedbackSettings permissions={[]} />);
    expect(screen.getByText(/do not have access/i)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('view-only users do not see Sync, Salesforce, Email or schedule editing controls', async () => {
    mockFetch({ 'GET /settings': () => [200, SETTINGS], 'GET /calendar': () => [200, { month: '2026-11', dates: {} }], 'GET /jobs': () => [200, { jobs: [] }] });
    render(<CustomerFeedbackSettings permissions={['cfms:view']} />);
    const tabs = screen.getByRole('tablist');
    expect(within(tabs).queryByText('Salesforce Login')).toBeNull();
    expect(within(tabs).queryByText('Email Settings')).toBeNull();
    const day = await screen.findByRole('button', { name: /^2026-11-01|.*-01$/ }).catch(() => null);
    if (day) fireEvent.click(day);
    expect(screen.queryByText('Sync Now')).toBeNull();
    fireEvent.click(within(tabs).getByText('Automation Schedule'));
    expect(screen.queryByText(/cfms:admin permission/)).toBeNull();
    expect(screen.queryByText('Save Schedule')).toBeNull();
  });

  it('future dates are disabled', async () => {
    mockFetch({ 'GET /settings': () => [200, SETTINGS], 'GET /calendar': () => [200, { month: istToday().slice(0, 7), dates: {} }], 'GET /jobs': () => [200, { jobs: [] }] });
    render(<CustomerFeedbackSettings permissions={ALL} />);
    const today = istToday();
    const [y, m] = today.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (Number(today.slice(8)) < last) {
      const future = `${today.slice(0, 8)}${String(last).padStart(2, '0')}`;
      expect((await screen.findByRole('button', { name: new RegExp(`^${future}`) })).disabled).toBe(true);
    }
    expect((await screen.findByRole('button', { name: new RegExp(`^${today}`) })).disabled).toBe(false);
  });

  it('Sync Now immediately triggers synchronization, sends ONE Idempotency-Key per click and polls the job', async () => {
    mockFetch({
      'GET /settings': () => [200, SETTINGS],
      'GET /calendar': () => [200, { month: istToday().slice(0, 7), dates: {} }],
      'GET /jobs': () => [200, { jobs: [] }],
      'GET /audit': () => [200, { total: 0, page: 1, pageSize: 1, rows: [] }],
      'POST /sync/now': () => [202, { jobId: 'J-7', status: 'PROCESSING' }],
      'GET /jobs/J-7': () => [200, { jobId: 'J-7', type: 'SYNC', reportDate: istToday(), status: 'COMPLETED', detail: 'done' }]
    });
    render(<CustomerFeedbackSettings permissions={ALL} />);
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^${istToday()}`) }));
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    fireEvent.click(screen.getByText('Sync Now'));
    await waitFor(() => expect(calls.some((c) => c.key === 'GET /jobs/J-7')).toBe(true));
    const posts = calls.filter((c) => c.key === 'POST /sync/now');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({ reportDate: istToday() });
    expect(posts[0].init.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    await screen.findByText(/COMPLETED/);
  });

  it('Automation Schedule contains ONLY Enable Automation, Execution Time, and Save Schedule', async () => {
    mockFetch({
      'GET /settings': () => [200, SETTINGS],
      'GET /calendar': () => [200, { month: '2026-11', dates: {} }],
      'GET /jobs': () => [200, { jobs: [] }],
      'GET /schedule': () => [200, { enabled: false, executionTime: '10:00', timezone: 'Asia/Kolkata' }],
      'PUT /schedule': () => [200, { enabled: true, executionTime: '14:30', timezone: 'Asia/Kolkata' }]
    });
    render(<CustomerFeedbackSettings permissions={ALL} />);
    fireEvent.click(within(screen.getByRole('tablist')).getByText('Automation Schedule'));

    await screen.findByRole('heading', { name: 'Automation Schedule' });
    expect(screen.getByText('Times are India Standard Time (IST)')).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Enable Automation' });
    expect(toggle.checked).toBe(false);
    const timeInput = screen.getByLabelText('Execution Time');
    expect(timeInput.value).toBe('10:00');
    const saveBtn = screen.getByText('Save Schedule');
    expect(saveBtn).toBeTruthy();

    expect(screen.queryByText(/Production schedule in use/i)).toBeNull();
    expect(screen.queryByText(/Current \(saved\)/i)).toBeNull();
    expect(screen.queryByText(/Pending/i)).toBeNull();
    expect(screen.queryByText(/Attempts/i)).toBeNull();
    expect(screen.queryByText(/Interval/i)).toBeNull();
    expect(screen.queryByText(/Frequency/i)).toBeNull();
    expect(screen.queryByText(/Weekday/i)).toBeNull();
    expect(screen.queryByText(/Next execution time/i)).toBeNull();

    fireEvent.click(toggle);
    await waitFor(() => expect(calls.some((c) => c.key === 'PUT /schedule' && c.body.enabled === true)).toBe(true));
    await screen.findByText('Automation enabled successfully.');
    expect(toggle.checked).toBe(true);

    fireEvent.change(timeInput, { target: { value: '14:30' } });
    fireEvent.click(saveBtn);

    await screen.findByText('Schedule saved successfully.');
    const puts = calls.filter((c) => c.key === 'PUT /schedule');
    expect(puts[puts.length - 1].body).toEqual({ enabled: true, executionTime: '14:30' });
  });

  it('Salesforce password: fields are cleared after the response and never stored', async () => {
    mockFetch({ 'GET /settings': () => [200, SETTINGS], 'GET /calendar': () => [200, { month: '2026-11', dates: {} }], 'GET /jobs': () => [200, { jobs: [] }], 'PUT /salesforce/password': () => [204, null] });
    render(<CustomerFeedbackSettings permissions={ALL} />);
    fireEvent.click(within(screen.getByRole('tablist')).getByText('Salesforce Login'));
    expect(screen.queryByLabelText(/Username/i)).toBeNull();
    const [pw, confirm] = screen.getAllByLabelText(/password/i).filter((e) => e.type === 'password');
    expect(pw.getAttribute('autocomplete')).toBe('new-password');
    fireEvent.change(pw, { target: { value: 'Secret-Pass-123' } });
    fireEvent.change(confirm, { target: { value: 'Secret-Pass-12' } });
    expect(screen.getByText('The passwords do not match.')).toBeTruthy();
    fireEvent.change(confirm, { target: { value: 'Secret-Pass-123' } });
    fireEvent.click(screen.getByText('Save Password'));
    await screen.findByText(/Salesforce password saved/);
    expect(pw.value).toBe('');
    expect(confirm.value).toBe('');
    const put = calls.find((c) => c.key === 'PUT /salesforce/password');
    expect(put.init.headers['Idempotency-Key']).toBeTruthy();
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain('Secret-Pass-123');
  });

  it('Email: adds recipients and shows SMTP 409 messages', async () => {
    mockFetch({
      'GET /settings': () => [200, SETTINGS], 'GET /calendar': () => [200, { month: '2026-11', dates: {} }], 'GET /jobs': () => [200, { jobs: [] }],
      'PUT /email/sender': () => [409, { error: { code: 'SMTP_REJECTED', message: 'The SMTP server refused this sender.' } }],
      'POST /email/recipients': () => [200, { added: ['b@ramrajcotton.net'], skipped: [], total: 2 }]
    });
    render(<CustomerFeedbackSettings permissions={ALL} />);
    fireEvent.click(within(screen.getByRole('tablist')).getByText('Email Settings'));
    fireEvent.change(screen.getByLabelText(/^Sender/), { target: { value: 'x@ramrajcotton.net' } });
    fireEvent.click(screen.getByText('Save Sender'));
    await screen.findByText('The SMTP server refused this sender.');
    fireEvent.change(screen.getByLabelText(/Add recipients/), { target: { value: 'b@ramrajcotton.net, bad' } });
    fireEvent.click(screen.getByText('Add'));
    await screen.findByText('Invalid address(es): bad');
    fireEvent.change(screen.getByLabelText(/Add recipients/), { target: { value: 'b@ramrajcotton.net' } });
    fireEvent.click(screen.getByText('Add'));
    await screen.findByText(/Added 1\./);
  });

  it('Audit logs render "-" for nulls and pass filters', async () => {
    mockFetch({
      'GET /settings': () => [200, SETTINGS], 'GET /calendar': () => [200, { month: '2026-11', dates: {} }], 'GET /jobs': () => [200, { jobs: [] }],
      'GET /audit': () => [200, { total: 1, page: 1, pageSize: 50, rows: [{ executedAt: '2026-11-10T04:30:00Z', executedAtIst: null, reportDate: '2026-11-09', type: 'SCHEDULED', source: null, attempt: 1, recordsFound: null, recordsSynced: null, recordsFailed: null, imagesUploaded: null, imagesFailed: null, status: 'NO_RECORDS', error: null }] }]
    });
    render(<CustomerFeedbackSettings permissions={ALL} />);
    fireEvent.click(within(screen.getByRole('tablist')).getByText('Audit Logs'));
    await screen.findByText('2026-11-09'); // the row itself ("NO_RECORDS" also exists in the status filter)
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(6);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'FAILED' } });
    fireEvent.click(screen.getByText('Apply'));
    await waitFor(() => expect(calls.some((c) => c.key === 'GET /audit' && c.url.includes('status=FAILED') && c.url.includes('pageSize=50'))).toBe(true));
  });

  it('does not display service not configured error banners on 503 and renders Automation Schedule tab', async () => {
    mockFetch({
      'GET /settings': () => [503, { error: { code: 'CFMS_NOT_CONFIGURED', message: 'The Customer Feedback service is not configured on this server.' } }],
      'GET /calendar': () => [503, { error: { code: 'CFMS_NOT_CONFIGURED', message: 'The Customer Feedback service is not configured on this server.' } }],
      'GET /jobs': () => [503, { error: { code: 'CFMS_NOT_CONFIGURED', message: 'The Customer Feedback service is not configured on this server.' } }],
      'GET /schedule': () => [503, { error: { code: 'CFMS_NOT_CONFIGURED', message: 'The Customer Feedback service is not configured on this server.' } }]
    });
    render(<CustomerFeedbackSettings permissions={ALL} />);
    const tabs = screen.getByRole('tablist');
    const scheduleTab = within(tabs).getByText('Automation Schedule');
    expect(scheduleTab).toBeTruthy();
    expect(screen.queryByText(/The Customer Feedback service is not configured on this server/i)).toBeNull();
    fireEvent.click(scheduleTab);
    expect(screen.queryByText(/The Customer Feedback service is not configured on this server/i)).toBeNull();
    expect(screen.queryByText(/cfms:admin permission/)).toBeNull();
  });
});
