import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failureRate = new Rate('custom_failure_rate');
const latencyTrend = new Trend('trend_duration');

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const STAGE_RAMP = __ENV.STAGE_RAMP || '30s';

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
        stress_ramp: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: STAGE_RAMP, target: 20 },   // Warm up
                { duration: STAGE_RAMP, target: 50 },   // Normal load
                { duration: STAGE_RAMP, target: 100 },  // High load
                { duration: STAGE_RAMP, target: 150 },  // Stress threshold
                { duration: '15s', target: 0 },         // Cool down
            ],
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        // Gracefully abort the test if the failure rate exceeds 10%
        'http_req_failed': [{ threshold: 'rate<0.10', abortOnFail: true, delayAbortEval: '10s' }],
        'http_req_duration': ['p(95)<3500'],
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
        `${BASE_URL}/api/invoices/CMP-00000172`,
        `${BASE_URL}/api/admin/roles`,
        `${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`,
        `${BASE_URL}/api/documents/work-tracker`,
    ];

    const targetUrl = endpoints[Math.floor(Math.random() * endpoints.length)];
    const start = new Date();
    const res = http.get(targetUrl, { headers: authHeaders });
    latencyTrend.add(new Date() - start);

    const ok = check(res, {
        'status is 200': (r) => r.status === 200,
    });
    failureRate.add(!ok);

    sleep(0.3);
}

export function handleSummary(data) {
    const metrics = data.metrics;
    const summary = {
        timestamp: new Date().toISOString(),
        total_requests: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.count) || 0,
        throughput_rps: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.rate) || 0,
        avg_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values.avg) || 0,
        p50_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && (metrics.http_req_duration.values['p(50)'] || metrics.http_req_duration.values.med)) || 0,
        p90_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(90)']) || 0,
        p95_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(95)']) || 0,
        p99_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(99)']) || 0,
        failure_rate_pct: (metrics.http_req_failed && metrics.http_req_failed.values && metrics.http_req_failed.values.rate) ? metrics.http_req_failed.values.rate * 100 : 0,
    };

    const markdown = `# DocuFlow k6 Stress Test Summary

- **Timestamp**: ${summary.timestamp}
- **Ramp Duration per Stage**: ${STAGE_RAMP}
- **Peak Virtual Users**: 150 VUs
- **Total Requests**: ${summary.total_requests}
- **Throughput**: ${summary.throughput_rps.toFixed(2)} req/sec
- **Average Latency**: ${summary.avg_latency_ms.toFixed(2)} ms
- **P50 Latency**: ${summary.p50_latency_ms.toFixed(2)} ms
- **P90 Latency**: ${summary.p90_latency_ms.toFixed(2)} ms
- **P95 Latency**: ${summary.p95_latency_ms.toFixed(2)} ms
- **P99 Latency**: ${summary.p99_latency_ms.toFixed(2)} ms
- **HTTP Failure Rate**: ${summary.failure_rate_pct.toFixed(2)}%
`;

    return {
        'tests/reports/stress_test_summary.json': JSON.stringify(data, null, 2),
        'tests/reports/stress_test_summary.md': markdown,
        stdout: `\n=== Stress Test Complete ===\nRequests: ${summary.total_requests}\nThroughput: ${summary.throughput_rps.toFixed(2)} req/s\nP95: ${summary.p95_latency_ms.toFixed(2)} ms\nFailures: ${summary.failure_rate_pct.toFixed(2)}%\n`,
    };
}
