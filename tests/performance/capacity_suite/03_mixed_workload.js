import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================================
// SCENARIO C: MIXED BUSINESS WORKLOAD
// Models realistic enterprise daily usage with weighted probabilistic routing:
// - 25% Work Tracker: Pending approval queue monitoring
// - 25% Dashboard Stats: Executive KPI and operational dashboard overview
// - 20% Invoice Listing: Document search and record exploration
// - 10% Document Details: Single-document inspection drill-down
// - 10% Field Config: Dynamic document more-info schemas
// - 5% Notifications: Unread alert checking
// - 5% User Session: Authentication token verification
// ============================================================================

const customFailureRate = new Rate('mixed_failure_rate');
const trendMixedLatency = new Trend('trend_mixed_latency');

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
        http_req_failed: ['rate<0.01'],
        mixed_failure_rate: ['rate<0.01'],
        'http_req_duration': ['p(95)<500'],
    },
};

export default function () {
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    const rand = Math.random() * 100;
    let res;
    let checkOk = false;
    const start = new Date();

    if (rand < 25) {
        // 25% Work Tracker
        res = http.get(`${BASE_URL}/api/documents/work-tracker`, { headers: authHeaders, tags: { route: 'work_tracker' } });
        checkOk = check(res, {
            'work-tracker 200': (r) => r.status === 200,
            'work-tracker returns array': (r) => {
                try { return Array.isArray(JSON.parse(r.body)); } catch (e) { return false; }
            },
        });
    } else if (rand < 50) {
        // 25% Dashboard Stats
        res = http.get(`${BASE_URL}/api/dashboard/stats`, { headers: authHeaders, tags: { route: 'dashboard_stats' } });
        checkOk = check(res, {
            'dashboard 200': (r) => r.status === 200,
            'dashboard has totalDocuments': (r) => {
                try { return typeof JSON.parse(r.body).totalDocuments === 'number'; } catch (e) { return false; }
            },
        });
    } else if (rand < 70) {
        // 20% Invoice Listing
        res = http.get(`${BASE_URL}/api/invoices`, { headers: authHeaders, tags: { route: 'invoices_list' } });
        checkOk = check(res, {
            'invoices 200': (r) => r.status === 200,
            'invoices returns array': (r) => {
                try { return Array.isArray(JSON.parse(r.body)); } catch (e) { return false; }
            },
        });
    } else if (rand < 80) {
        // 10% Single Invoice Detail
        res = http.get(`${BASE_URL}/api/invoices/CMP-00000172`, { headers: authHeaders, tags: { route: 'invoice_detail' } });
        checkOk = check(res, {
            'invoice detail 200': (r) => r.status === 200,
            'invoice detail returns valid object': (r) => {
                try { const b = JSON.parse(r.body); return b.id !== undefined || b.invoice_number !== undefined; } catch (e) { return false; }
            },
        });
    } else if (rand < 90) {
        // 10% More Info Configuration
        res = http.get(`${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`, { headers: authHeaders, tags: { route: 'more_info_config' } });
        checkOk = check(res, {
            'more-info 200': (r) => r.status === 200,
            'more-info returns selected_fields': (r) => {
                try { return Array.isArray(JSON.parse(r.body).selected_fields); } catch (e) { return false; }
            },
        });
    } else if (rand < 95) {
        // 5% Notifications
        res = http.get(`${BASE_URL}/api/notifications`, { headers: authHeaders, tags: { route: 'notifications' } });
        checkOk = check(res, {
            'notifications 200': (r) => r.status === 200,
            'notifications returns array': (r) => {
                try { return Array.isArray(JSON.parse(r.body)); } catch (e) { return false; }
            },
        });
    } else {
        // 5% Auth Me
        res = http.get(`${BASE_URL}/api/auth/me`, { headers: authHeaders, tags: { route: 'auth_me' } });
        checkOk = check(res, {
            'auth me 200': (r) => r.status === 200,
            'auth me has role': (r) => {
                try { return Boolean(JSON.parse(r.body).role); } catch (e) { return false; }
            },
        });
    }

    trendMixedLatency.add(new Date() - start);
    customFailureRate.add(!checkOk);

    sleep(0.2);
}
