import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================================
// SCENARIO D: GRADUAL CONCURRENCY AND STRESS TEST
// Progresses through discrete load stages:
// 10 -> 25 -> 50 -> 75 -> 100 -> 150 -> 200 -> 250 -> 300 Virtual Users
// Determines:
// 1. Verified stable concurrency
// 2. First failing concurrency
// 3. Observed failure mode (latency surge, connection limits, error rate)
// ============================================================================

const customFailureRate = new Rate('stress_failure_rate');
const stressLatencyTrend = new Trend('trend_stress_duration');

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
        concurrency_stress_ramp: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: '10s', target: 10 },
                { duration: STAGE_DURATION, target: 10 },
                { duration: '5s', target: 25 },
                { duration: STAGE_DURATION, target: 25 },
                { duration: '5s', target: 50 },
                { duration: STAGE_DURATION, target: 50 },
                { duration: '5s', target: 75 },
                { duration: STAGE_DURATION, target: 75 },
                { duration: '5s', target: 100 },
                { duration: STAGE_DURATION, target: 100 },
                { duration: '5s', target: 150 },
                { duration: STAGE_DURATION, target: 150 },
                { duration: '5s', target: 200 },
                { duration: STAGE_DURATION, target: 200 },
                { duration: '5s', target: 250 },
                { duration: STAGE_DURATION, target: 250 },
                { duration: '5s', target: 300 },
                { duration: STAGE_DURATION, target: 300 },
                { duration: '10s', target: 0 }, // Cool down
            ],
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '15s' }],
        trend_stress_duration: ['p(95)<3000'],
    },
};

export default function () {
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    // Realistic mixed business endpoint selection
    const endpoints = [
        `${BASE_URL}/api/dashboard/stats`,
        `${BASE_URL}/api/documents/work-tracker`,
        `${BASE_URL}/api/invoices`,
        `${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`,
        `${BASE_URL}/api/notifications`,
        `${BASE_URL}/api/workflows`,
    ];

    const targetUrl = endpoints[Math.floor(Math.random() * endpoints.length)];
    const start = new Date();
    const res = http.get(targetUrl, { headers: authHeaders });

    const ok = check(res, {
        'status is 200': (r) => r.status === 200,
        'response is non-empty': (r) => r.body && r.body.length > 2,
        'no server error': (r) => r.status < 500,
    });

    stressLatencyTrend.add(new Date() - start);
    customFailureRate.add(!ok);

    sleep(0.2);
}
