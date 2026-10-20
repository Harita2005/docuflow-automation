import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================================
// SCENARIO E: SUSTAINED ENDURANCE TEST
// Runs a continuous sustained concurrent workload (50 VUs) for 5 minutes.
// Detects:
// - Memory leaks / gradual working set expansion
// - Connection pool leakage or saturation
// - SQL Server latency degradation over time
// - Error rate spikes or worker instability
// ============================================================================

const customFailureRate = new Rate('endurance_failure_rate');
const enduranceLatencyTrend = new Trend('trend_endurance_duration');

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const DURATION = __ENV.DURATION || '5m';
const VUS = parseInt(__ENV.VUS || '50');

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
        sustained_endurance: {
            executor: 'constant-vus',
            vus: VUS,
            duration: DURATION,
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        http_req_failed: ['rate<0.01'], // Stricter <1% failure rate
        endurance_failure_rate: ['rate<0.01'],
        trend_endurance_duration: ['p(95)<1000'],
    },
};

export default function () {
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    const endpoints = [
        `${BASE_URL}/api/dashboard/stats`,
        `${BASE_URL}/api/documents/work-tracker`,
        `${BASE_URL}/api/invoices`,
        `${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`,
        `${BASE_URL}/api/notifications`,
    ];

    const targetUrl = endpoints[Math.floor(Math.random() * endpoints.length)];
    const start = new Date();
    const res = http.get(targetUrl, { headers: authHeaders });

    const ok = check(res, {
        'status is 200': (r) => r.status === 200,
        'response is valid': (r) => r.body && r.body.length > 2,
    });

    enduranceLatencyTrend.add(new Date() - start);
    customFailureRate.add(!ok);

    sleep(0.3);
}
