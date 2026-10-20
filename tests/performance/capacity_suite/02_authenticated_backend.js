import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================================
// SCENARIO B: AUTHENTICATED BACKEND WORKLOAD
// Exercises all verified application read APIs with Bearer authentication.
// Validates response payloads (JSON schemas, non-empty structures, absence of auth errors).
// ============================================================================

const customFailureRate = new Rate('api_failure_rate');
const trendDashboard = new Trend('trend_api_dashboard');
const trendInvoices = new Trend('trend_api_invoices');
const trendApproved = new Trend('trend_api_approved');
const trendWorkTracker = new Trend('trend_api_work_tracker');
const trendWorkflows = new Trend('trend_api_workflows');
const trendNotifications = new Trend('trend_api_notifications');
const trendAuthMe = new Trend('trend_api_auth_me');
const trendMoreInfo = new Trend('trend_api_more_info');

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const STAGE_DURATION = __ENV.STAGE_DURATION || '20s';

let token = __ENV.DOCUFLOW_TOKEN || '';
if (!token) {
    try {
        token = open('../token.txt').trim();
    } catch (e) {
        token = '';
    }
}

export const options = {
    scenarios: {
        stage_10_vus: {
            executor: 'constant-vus',
            vus: 10,
            duration: STAGE_DURATION,
            startTime: '0s',
            tags: { tier: '10_vus' },
        },
        stage_25_vus: {
            executor: 'constant-vus',
            vus: 25,
            duration: STAGE_DURATION,
            startTime: STAGE_DURATION,
            tags: { tier: '25_vus' },
        },
        stage_50_vus: {
            executor: 'constant-vus',
            vus: 50,
            duration: STAGE_DURATION,
            startTime: `${parseInt(STAGE_DURATION) * 2}s`,
            tags: { tier: '50_vus' },
        },
        stage_100_vus: {
            executor: 'constant-vus',
            vus: 100,
            duration: STAGE_DURATION,
            startTime: `${parseInt(STAGE_DURATION) * 3}s`,
            tags: { tier: '100_vus' },
        },
        stage_150_vus: {
            executor: 'constant-vus',
            vus: 150,
            duration: STAGE_DURATION,
            startTime: `${parseInt(STAGE_DURATION) * 4}s`,
            tags: { tier: '150_vus' },
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        http_req_failed: ['rate<0.01'], // Acceptance criteria: < 1% HTTP failures
        api_failure_rate: ['rate<0.01'], // Acceptance criteria: < 1% functional payload check failures
        'http_req_duration': ['p(95)<500'], // Acceptance criteria: P95 < 500ms
    },
};

export default function () {
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    // 1. Dashboard Statistics (/api/dashboard/stats)
    const t0 = new Date();
    const resStats = http.get(`${BASE_URL}/api/dashboard/stats`, { headers: authHeaders });
    trendDashboard.add(new Date() - t0);
    const statsOk = check(resStats, {
        'dashboard stats 200': (r) => r.status === 200,
        'dashboard stats has totalDocuments': (r) => {
            try {
                const b = JSON.parse(r.body);
                return typeof b.totalDocuments === 'number' && !b.detail;
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!statsOk);

    // 2. Document & Invoice Listing (/api/invoices)
    const t1 = new Date();
    const resInvoices = http.get(`${BASE_URL}/api/invoices`, { headers: authHeaders });
    trendInvoices.add(new Date() - t1);
    const invoicesOk = check(resInvoices, {
        'invoices list 200': (r) => r.status === 200,
        'invoices returns array': (r) => {
            try {
                const b = JSON.parse(r.body);
                return Array.isArray(b) && !b.detail;
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!invoicesOk);

    // 3. Approved Documents (/api/invoices/approved)
    const t2 = new Date();
    const resApproved = http.get(`${BASE_URL}/api/invoices/approved`, { headers: authHeaders });
    trendApproved.add(new Date() - t2);
    const approvedOk = check(resApproved, {
        'approved documents 200': (r) => r.status === 200,
        'approved returns array': (r) => {
            try {
                return Array.isArray(JSON.parse(r.body));
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!approvedOk);

    // 4. Work Tracker (/api/documents/work-tracker)
    const t3 = new Date();
    const resWorkTracker = http.get(`${BASE_URL}/api/documents/work-tracker`, { headers: authHeaders });
    trendWorkTracker.add(new Date() - t3);
    const trackerOk = check(resWorkTracker, {
        'work tracker 200': (r) => r.status === 200,
        'work tracker returns list': (r) => {
            try {
                const b = JSON.parse(r.body);
                return Array.isArray(b) && !b.detail;
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!trackerOk);

    // 5. Workflow Profiles (/api/workflows)
    const t4 = new Date();
    const resWorkflows = http.get(`${BASE_URL}/api/workflows`, { headers: authHeaders });
    trendWorkflows.add(new Date() - t4);
    const workflowsOk = check(resWorkflows, {
        'workflows 200': (r) => r.status === 200,
        'workflows returns list': (r) => {
            try {
                return Array.isArray(JSON.parse(r.body));
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!workflowsOk);

    // 6. Notifications (/api/notifications)
    const t5 = new Date();
    const resNotifs = http.get(`${BASE_URL}/api/notifications`, { headers: authHeaders });
    trendNotifications.add(new Date() - t5);
    const notifsOk = check(resNotifs, {
        'notifications 200': (r) => r.status === 200,
        'notifications returns list': (r) => {
            try {
                return Array.isArray(JSON.parse(r.body));
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!notifsOk);

    // 7. Session User Profile (/api/auth/me)
    const t6 = new Date();
    const resMe = http.get(`${BASE_URL}/api/auth/me`, { headers: authHeaders });
    trendAuthMe.add(new Date() - t6);
    const meOk = check(resMe, {
        'auth me 200': (r) => r.status === 200,
        'auth me has valid email and role': (r) => {
            try {
                const b = JSON.parse(r.body);
                return Boolean(b.email && b.role && !b.detail);
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!meOk);

    // 8. More-Info Field Config (/api/document-types/AP%20INVOICE/more-info/config)
    const t7 = new Date();
    const resMoreInfo = http.get(`${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`, { headers: authHeaders });
    trendMoreInfo.add(new Date() - t7);
    const moreInfoOk = check(resMoreInfo, {
        'more-info config 200': (r) => r.status === 200,
        'more-info returns selected_fields': (r) => {
            try {
                const b = JSON.parse(r.body);
                return Array.isArray(b.selected_fields) && !b.detail;
            } catch (e) {
                return false;
            }
        },
    });
    customFailureRate.add(!moreInfoOk);

    sleep(0.3);
}
