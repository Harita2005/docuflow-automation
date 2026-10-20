import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('custom_failure_rate');
const latencyTrend = new Trend('trend_duration');

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const DURATION = __ENV.DURATION || '15m';
const VUS = parseInt(__ENV.VUS || '25');

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
        endurance_sustained: {
            executor: 'constant-vus',
            vus: VUS,
            duration: DURATION,
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        'http_req_failed': ['rate<0.02'], // Zero or near-zero error rate (<2%)
        'http_req_duration': ['p(95)<1500'], // P95 under 1500ms
    },
};

export default function () {
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    const endpoints = [
        `${BASE_URL}/health`,
        `${BASE_URL}/api/invoices`,
        `${BASE_URL}/api/admin/roles`,
        `${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`,
    ];

    const targetUrl = endpoints[Math.floor(Math.random() * endpoints.length)];
    const start = new Date();
    const res = http.get(targetUrl, { headers: authHeaders });
    latencyTrend.add(new Date() - start);

    const ok = check(res, {
        'status is 200': (r) => r.status === 200,
    });
    failureRate.add(!ok);

    sleep(1.0);
}

export function handleSummary(data) {
    const metrics = data.metrics;
    const summary = {
        timestamp: new Date().toISOString(),
        total_requests: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.count) || 0,
        throughput_rps: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.rate) || 0,
        avg_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values.avg) || 0,
        p95_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(95)']) || 0,
        failure_rate_pct: (metrics.http_req_failed && metrics.http_req_failed.values && metrics.http_req_failed.values.rate) ? metrics.http_req_failed.values.rate * 100 : 0,
    };

    const markdown = `# DocuFlow k6 Endurance Test Summary

- **Timestamp**: ${summary.timestamp}
- **Duration**: ${DURATION}
- **Virtual Users**: ${VUS}
- **Total Requests**: ${summary.total_requests}
- **Throughput**: ${summary.throughput_rps.toFixed(2)} req/sec
- **Average Latency**: ${summary.avg_latency_ms.toFixed(2)} ms
- **P95 Latency**: ${summary.p95_latency_ms.toFixed(2)} ms
- **Failure Rate**: ${summary.failure_rate_pct.toFixed(2)}%
`;

    return {
        'tests/reports/endurance_test_summary.json': JSON.stringify(data, null, 2),
        'tests/reports/endurance_test_summary.md': markdown,
        stdout: `\n=== Endurance Test Complete ===\nRequests: ${summary.total_requests}\nP95: ${summary.p95_latency_ms.toFixed(2)} ms\nFailures: ${summary.failure_rate_pct.toFixed(2)}%\n`,
    };
}
