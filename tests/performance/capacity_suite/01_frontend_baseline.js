import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================================
// SCENARIO A: FRONTEND BASELINE (FRONTEND-ONLY TEST)
// Targets the React/Vite web server directly without invoking backend APIs.
// Measures static asset delivery, connection handling, and web server capacity.
// ============================================================================

const failureRate = new Rate('frontend_failure_rate');
const indexHtmlTrend = new Trend('trend_index_html_duration');

const FRONTEND_URL = __ENV.FRONTEND_URL || 'http://127.0.0.1:8085';
const STAGE_DURATION = __ENV.STAGE_DURATION || '15s';

export const options = {
    scenarios: {
        stage_10_vus: {
            executor: 'constant-vus',
            vus: 10,
            duration: STAGE_DURATION,
            startTime: '0s',
            tags: { scenario: 'frontend_10_vus' },
        },
        stage_25_vus: {
            executor: 'constant-vus',
            vus: 25,
            duration: STAGE_DURATION,
            startTime: STAGE_DURATION,
            tags: { scenario: 'frontend_25_vus' },
        },
        stage_50_vus: {
            executor: 'constant-vus',
            vus: 50,
            duration: STAGE_DURATION,
            startTime: `${parseInt(STAGE_DURATION) * 2}s`,
            tags: { scenario: 'frontend_50_vus' },
        },
        stage_100_vus: {
            executor: 'constant-vus',
            vus: 100,
            duration: STAGE_DURATION,
            startTime: `${parseInt(STAGE_DURATION) * 3}s`,
            tags: { scenario: 'frontend_100_vus' },
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        http_req_failed: ['rate<0.01'], // Stricter <1% failure rate
        trend_index_html_duration: ['p(95)<300'], // P95 < 300ms for static HTML
    },
};

export default function () {
    const res = http.get(`${FRONTEND_URL}/`, {
        tags: { type: 'frontend_static' },
    });

    const isOk = check(res, {
        'status is 200': (r) => r.status === 200,
        'contains HTML root container': (r) => r.body && (r.body.includes('<div id="root">') || r.body.includes('<!doctype html>')),
        'content-type is text/html': (r) => r.headers['Content-Type'] && r.headers['Content-Type'].includes('text/html'),
    });

    indexHtmlTrend.add(res.timings.duration);
    failureRate.add(!isOk);

    sleep(0.5);
}
