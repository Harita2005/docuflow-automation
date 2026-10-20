import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom Metrics
const failureRate = new Rate('custom_failure_rate');
const invoiceQueueTrend = new Trend('trend_invoice_queue');
const rolesTrend = new Trend('trend_roles');
const moreInfoTrend = new Trend('trend_more_info');

// Environment Configuration
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const DURATION_PER_STAGE = __ENV.DURATION_PER_STAGE || '15s';

// Read token from environment or token.txt
let token = __ENV.DOCUFLOW_TOKEN || '';
if (!token) {
    try {
        token = open('./token.txt').trim();
    } catch (e) {
        token = '';
    }
}

export const options = {
    scenarios: {
        scenario_10_vus: {
            executor: 'constant-vus',
            vus: 10,
            duration: DURATION_PER_STAGE,
            startTime: '0s',
            tags: { scenario_tier: '10_vus' },
        },
        scenario_25_vus: {
            executor: 'constant-vus',
            vus: 25,
            duration: DURATION_PER_STAGE,
            startTime: DURATION_PER_STAGE,
            tags: { scenario_tier: '25_vus' },
        },
        scenario_50_vus: {
            executor: 'constant-vus',
            vus: 50,
            duration: DURATION_PER_STAGE,
            startTime: `${parseInt(DURATION_PER_STAGE) * 2}s`,
            tags: { scenario_tier: '50_vus' },
        },
        scenario_100_vus: {
            executor: 'constant-vus',
            vus: 100,
            duration: DURATION_PER_STAGE,
            startTime: `${parseInt(DURATION_PER_STAGE) * 3}s`,
            tags: { scenario_tier: '100_vus' },
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        'http_req_failed': ['rate<0.05'], // Max 5% HTTP failure rate
        'http_req_duration': ['p(90)<1200', 'p(95)<2500'], // P90 < 1.2s, P95 < 2.5s
    },
};

export default function () {
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    // 1. Health Endpoint
    const resHealth = http.get(`${BASE_URL}/health`);
    const healthOk = check(resHealth, {
        'health status is 200': (r) => r.status === 200,
        'health response has status healthy': (r) => {
            try {
                return JSON.parse(r.body).status === 'healthy';
            } catch (e) {
                return false;
            }
        },
    });
    failureRate.add(!healthOk);

    // 2. Invoice Queue (/api/invoices)
    const startInv = new Date();
    const resInvoices = http.get(`${BASE_URL}/api/invoices`, { headers: authHeaders });
    invoiceQueueTrend.add(new Date() - startInv);
    const invoicesOk = check(resInvoices, {
        'invoices status is 200': (r) => r.status === 200,
        'invoices returns array': (r) => {
            try {
                return Array.isArray(JSON.parse(r.body));
            } catch (e) {
                return false;
            }
        },
    });
    failureRate.add(!invoicesOk);

    // 3. Admin Roles (/api/admin/roles)
    const startRoles = new Date();
    const resRoles = http.get(`${BASE_URL}/api/admin/roles`, { headers: authHeaders });
    rolesTrend.add(new Date() - startRoles);
    const rolesOk = check(resRoles, {
        'roles status is 200': (r) => r.status === 200,
        'roles returns list': (r) => {
            try {
                return Array.isArray(JSON.parse(r.body));
            } catch (e) {
                return false;
            }
        },
    });
    failureRate.add(!rolesOk);

    // 4. More-Info Field Config (/api/document-types/AP%20INVOICE/more-info/config)
    const startMoreInfo = new Date();
    const resMoreInfo = http.get(`${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`, { headers: authHeaders });
    moreInfoTrend.add(new Date() - startMoreInfo);
    const moreInfoOk = check(resMoreInfo, {
        'more-info status is 200': (r) => r.status === 200,
        'more-info returns selected_fields': (r) => {
            try {
                const b = JSON.parse(r.body);
                return b.selected_fields && Array.isArray(b.selected_fields);
            } catch (e) {
                return false;
            }
        },
    });
    failureRate.add(!moreInfoOk);

    // Realistic user think time
    sleep(0.5);
}

export function handleSummary(data) {
    const metrics = data.metrics;

    const summaryData = {
        timestamp: new Date().toISOString(),
        total_requests: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.count) || 0,
        throughput_rps: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.rate) || 0,
        avg_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values.avg) || 0,
        p90_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(90)']) || 0,
        p95_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(95)']) || 0,
        p99_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(99)']) || 0,
        http_failure_rate_pct: (metrics.http_req_failed && metrics.http_req_failed.values && metrics.http_req_failed.values.rate) ? metrics.http_req_failed.values.rate * 100 : 0,
    };

    const markdownSummary = `# DocuFlow k6 Load Test Summary

- **Timestamp**: ${summaryData.timestamp}
- **Total Requests**: ${summaryData.total_requests}
- **Throughput**: ${summaryData.throughput_rps.toFixed(2)} req/sec
- **Average Latency**: ${summaryData.avg_latency_ms.toFixed(2)} ms
- **P90 Latency**: ${summaryData.p90_latency_ms.toFixed(2)} ms
- **P95 Latency**: ${summaryData.p95_latency_ms.toFixed(2)} ms
- **P99 Latency**: ${summaryData.p99_latency_ms.toFixed(2)} ms
- **HTTP Failure Rate**: ${summaryData.http_failure_rate_pct.toFixed(2)}%

## Scenarios Executed
- 10 Virtual Users (Tier 1)
- 25 Virtual Users (Tier 2)
- 50 Virtual Users (Tier 3)
- 100 Virtual Users (Tier 4)
`;

    return {
        'tests/reports/load_test_summary.json': JSON.stringify(data, null, 2),
        'tests/reports/load_test_summary.md': markdownSummary,
        stdout: `\n=== Load Test Finished ===\nTotal Req: ${summaryData.total_requests}\nThroughput: ${summaryData.throughput_rps.toFixed(2)} req/s\nP95 Latency: ${summaryData.p95_latency_ms.toFixed(2)} ms\nFailure Rate: ${summaryData.http_failure_rate_pct.toFixed(2)}%\n`,
    };
}
