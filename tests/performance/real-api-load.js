import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom Metrics separating real document APIs from health endpoint
const failureRate = new Rate('custom_failure_rate');
const healthTrend = new Trend('trend_health');
const queueTrend = new Trend('trend_doc_queue');
const detailTrend = new Trend('trend_doc_detail');
const configTrend = new Trend('trend_more_info_config');

// Configurable environment parameters
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const STAGE_DURATION = __ENV.STAGE_DURATION || '15s';

// Read token
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
            duration: STAGE_DURATION,
            startTime: '0s',
            tags: { tier: '10_vus' },
        },
        scenario_25_vus: {
            executor: 'constant-vus',
            vus: 25,
            duration: STAGE_DURATION,
            startTime: STAGE_DURATION,
            tags: { tier: '25_vus' },
        },
        scenario_50_vus: {
            executor: 'constant-vus',
            vus: 50,
            duration: STAGE_DURATION,
            startTime: `${parseInt(STAGE_DURATION) * 2}s`,
            tags: { tier: '50_vus' },
        },
        scenario_100_vus: {
            executor: 'constant-vus',
            vus: 100,
            duration: STAGE_DURATION,
            startTime: `${parseInt(STAGE_DURATION) * 3}s`,
            tags: { tier: '100_vus' },
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        http_req_failed: ['rate<0.05'], // Max 5% HTTP failure rate
        trend_doc_queue: ['p(95)<3000'], // P95 queue latency under 3s
        trend_doc_detail: ['p(95)<2500'], // P95 detail latency under 2.5s
    },
};

export default function () {
    const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };

    // 1. Health check endpoint (distinguished baseline)
    const tHealthStart = new Date();
    const resHealth = http.get(`${BASE_URL}/health`);
    healthTrend.add(new Date() - tHealthStart);
    const healthOk = check(resHealth, {
        'health status is 200': (r) => r.status === 200,
        'health response has healthy status': (r) => {
            try { return JSON.parse(r.body).status === 'healthy'; } catch (e) { return false; }
        },
    });
    failureRate.add(!healthOk);

    // 2. Real Document Queue (GET /api/invoices)
    const tQueueStart = new Date();
    const resQueue = http.get(`${BASE_URL}/api/invoices?page=1&page_size=10`, { headers: authHeaders });
    queueTrend.add(new Date() - tQueueStart);
    let sampleDocId = 'CMP-00000172';
    const queueOk = check(resQueue, {
        'invoice queue status is 200': (r) => r.status === 200,
        'invoice queue returns items array': (r) => {
            try {
                const b = JSON.parse(r.body);
                if (Array.isArray(b)) {
                    if (b.length > 0 && b[0].id) {
                        sampleDocId = b[0].id;
                    }
                    return true;
                }
                if (b.items && Array.isArray(b.items)) {
                    if (b.items.length > 0 && b.items[0].id) {
                        sampleDocId = b.items[0].id;
                    }
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        },
    });
    failureRate.add(!queueOk);

    // 3. Real Document Details (GET /api/invoices/{id})
    const tDetailStart = new Date();
    const resDetail = http.get(`${BASE_URL}/api/invoices/${sampleDocId}`, { headers: authHeaders });
    detailTrend.add(new Date() - tDetailStart);
    const detailOk = check(resDetail, {
        'invoice detail status is 200': (r) => r.status === 200,
        'invoice detail returns valid document': (r) => {
            try {
                const b = JSON.parse(r.body);
                return (b.id !== undefined || b.document_number !== undefined || b.invoice_number !== undefined);
            } catch (e) {
                return false;
            }
        },
    });
    failureRate.add(!detailOk);

    // 4. Real Document Type Field Configuration (GET /api/document-types/.../more-info/config)
    const tConfigStart = new Date();
    const resConfig = http.get(`${BASE_URL}/api/document-types/AP%20INVOICE/more-info/config`, { headers: authHeaders });
    configTrend.add(new Date() - tConfigStart);
    const configOk = check(resConfig, {
        'more-info config status is 200': (r) => r.status === 200,
        'more-info returns selected_fields array': (r) => {
            try {
                const b = JSON.parse(r.body);
                return Array.isArray(b.selected_fields);
            } catch (e) {
                return false;
            }
        },
    });
    failureRate.add(!configOk);

    sleep(0.5);
}

export function handleSummary(data) {
    const metrics = data.metrics;

    const summary = {
        timestamp: new Date().toISOString(),
        total_requests: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.count) || 0,
        throughput_rps: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.rate) || 0,
        failure_rate_pct: (metrics.http_req_failed && metrics.http_req_failed.values && metrics.http_req_failed.values.rate) ? metrics.http_req_failed.values.rate * 100 : 0,
        endpoints: {
            health: {
                avg_ms: (metrics.trend_health && metrics.trend_health.values && metrics.trend_health.values.avg) || 0,
                p90_ms: (metrics.trend_health && metrics.trend_health.values && metrics.trend_health.values['p(90)']) || 0,
                p95_ms: (metrics.trend_health && metrics.trend_health.values && metrics.trend_health.values['p(95)']) || 0,
            },
            doc_queue: {
                avg_ms: (metrics.trend_doc_queue && metrics.trend_doc_queue.values && metrics.trend_doc_queue.values.avg) || 0,
                p90_ms: (metrics.trend_doc_queue && metrics.trend_doc_queue.values && metrics.trend_doc_queue.values['p(90)']) || 0,
                p95_ms: (metrics.trend_doc_queue && metrics.trend_doc_queue.values && metrics.trend_doc_queue.values['p(95)']) || 0,
            },
            doc_detail: {
                avg_ms: (metrics.trend_doc_detail && metrics.trend_doc_detail.values && metrics.trend_doc_detail.values.avg) || 0,
                p90_ms: (metrics.trend_doc_detail && metrics.trend_doc_detail.values && metrics.trend_doc_detail.values['p(90)']) || 0,
                p95_ms: (metrics.trend_doc_detail && metrics.trend_doc_detail.values && metrics.trend_doc_detail.values['p(95)']) || 0,
            },
            more_info_config: {
                avg_ms: (metrics.trend_more_info_config && metrics.trend_more_info_config.values && metrics.trend_more_info_config.values.avg) || 0,
                p90_ms: (metrics.trend_more_info_config && metrics.trend_more_info_config.values && metrics.trend_more_info_config.values['p(90)']) || 0,
                p95_ms: (metrics.trend_more_info_config && metrics.trend_more_info_config.values && metrics.trend_more_info_config.values['p(95)']) || 0,
            },
        },
    };

    const markdown = `# Real Document API Load Test Summary

- **Timestamp**: ${summary.timestamp}
- **Total Requests**: ${summary.total_requests}
- **Throughput**: ${summary.throughput_rps.toFixed(2)} req/sec
- **Overall HTTP Failure Rate**: ${summary.failure_rate_pct.toFixed(2)}%

## Endpoint Performance Breakdown (Real Document APIs vs Health Baseline)

| Endpoint | Tested Operation | Avg Latency (ms) | P90 Latency (ms) | P95 Latency (ms) |
|---|---|---|---|---|
| \`GET /health\` | Lightweight Health Baseline | ${summary.endpoints.health.avg_ms.toFixed(2)} | ${summary.endpoints.health.p90_ms.toFixed(2)} | ${summary.endpoints.health.p95_ms.toFixed(2)} |
| \`GET /api/invoices\` | Real Paginated Invoice Queue | ${summary.endpoints.doc_queue.avg_ms.toFixed(2)} | ${summary.endpoints.doc_queue.p90_ms.toFixed(2)} | ${summary.endpoints.doc_queue.p95_ms.toFixed(2)} |
| \`GET /api/invoices/{id}\` | Real Document Details & Logs | ${summary.endpoints.doc_detail.avg_ms.toFixed(2)} | ${summary.endpoints.doc_detail.p90_ms.toFixed(2)} | ${summary.endpoints.doc_detail.p95_ms.toFixed(2)} |
| \`GET /api/document-types/.../config\` | More-Info Dynamic Config | ${summary.endpoints.more_info_config.avg_ms.toFixed(2)} | ${summary.endpoints.more_info_config.p90_ms.toFixed(2)} | ${summary.endpoints.more_info_config.p95_ms.toFixed(2)} |

## Concurrency Tiers Tested
- **Tier 1**: 10 Virtual Users
- **Tier 2**: 25 Virtual Users
- **Tier 3**: 50 Virtual Users
- **Tier 4**: 100 Virtual Users
`;

    return {
        'tests/reports/real_api_load_summary.json': JSON.stringify(data, null, 2),
        'tests/reports/real_api_load_summary.md': markdown,
        stdout: `\n=== Real Document API Load Test Finished ===\nTotal Req: ${summary.total_requests}\nThroughput: ${summary.throughput_rps.toFixed(2)} req/s\nDoc Queue P95: ${summary.endpoints.doc_queue.p95_ms.toFixed(2)} ms\nDoc Detail P95: ${summary.endpoints.doc_detail.p95_ms.toFixed(2)} ms\nFailure Rate: ${summary.failure_rate_pct.toFixed(2)}%\n`,
    };
}
