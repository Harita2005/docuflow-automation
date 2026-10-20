import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Metrics
const syncFailureRate = new Rate('sync_failure_rate');
const syncSingleTrend = new Trend('trend_sync_single');
const syncBatchTrend = new Trend('trend_sync_batch');
const successfulRecords = new Counter('successful_sync_records');
const failedRecords = new Counter('failed_sync_records');

// Environment variables
const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
const STAGE_RAMP = __ENV.STAGE_RAMP || '10s';
const SERVICE_KEY = __ENV.SERVICE_API_KEY || 'DocuFlow-M2M-Integration-Secret-2026';

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
        // Staged concurrency testing from 10 up to 1000 Virtual Users
        staged_sync_concurrency: {
            executor: 'ramping-vus',
            startVUs: 1,
            stages: [
                { duration: STAGE_RAMP, target: 10 },    // Tier 1: 10 VUs
                { duration: STAGE_RAMP, target: 50 },    // Tier 2: 50 VUs
                { duration: STAGE_RAMP, target: 100 },   // Tier 3: 100 VUs
                { duration: STAGE_RAMP, target: 250 },   // Tier 4: 250 VUs
                { duration: STAGE_RAMP, target: 500 },   // Tier 5: 500 VUs
                { duration: STAGE_RAMP, target: 1000 },  // Tier 6: 1,000 VUs peak
                { duration: '10s', target: 0 },          // Cool down
            ],
            gracefulRampDown: '15s',
            tags: { test_type: 'sync_concurrency' },
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        // Abort safely if error rate exceeds 15%
        http_req_failed: [{ threshold: 'rate<0.15', abortOnFail: true, delayAbortEval: '10s' }],
        trend_sync_single: ['p(95)<4000'], // P95 latency under 4 seconds under peak load
    },
};

export default function () {
    const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': SERVICE_KEY,
        'Authorization': `Bearer ${token}`,
    };

    const uniqueId = `PERF_SYNC_${__VU}_${__ITER}_${Date.now()}`;
    const payload = JSON.stringify({
        doc_key: uniqueId,
        doc_num: `DOC-${__VU}-${__ITER}`,
        invoice_number: `INV-PERF-${__VU}-${__ITER}`,
        document_number: `DOC-PERF-${__VU}-${__ITER}`,
        company_code: 'VCC',
        division: 'VCC',
        document_type: 'AP INVOICE',
        category: 'AP INVOICE',
        vendor_name: 'Apex Precision Tools Pvt Ltd',
        vendor_code: 'V-APEX-01',
        amount: 25000.00,
        currency: 'INR',
        payment_terms: 'Net 30',
        line_items: [
            { item_code: 'TOOL-01', description: 'Carbide Drill Bit 10mm', quantity: 10, unit_price: 2000.00, amount: 20000.00 },
            { item_code: 'TOOL-02', description: 'Collet Chuck ER32', quantity: 1, unit_price: 5000.00, amount: 5000.00 },
        ],
    });

    const tStart = new Date();
    const res = http.post(`${BASE_URL}/api/sync/record`, payload, { headers: headers });
    syncSingleTrend.add(new Date() - tStart);

    const ok = check(res, {
        'sync record status is 200': (r) => r.status === 200,
        'sync record returns success true': (r) => {
            try {
                const b = JSON.parse(r.body);
                return b.success === true && b.document_id !== undefined;
            } catch (e) {
                return false;
            }
        },
    });

    syncFailureRate.add(!ok);
    if (ok) {
        successfulRecords.add(1);
    } else {
        failedRecords.add(1);
    }

    // Every 20 iterations, also run a batch sync test
    if (__ITER % 20 === 0 && __VU <= 25) {
        const batchPayload = JSON.stringify({
            sync_source: 'Performance Batch Load Job',
            documents: [
                {
                    doc_key: `BATCH_A_${uniqueId}`,
                    document_number: `BATCH-DOC-A-${__VU}-${__ITER}`,
                    invoice_number: `BATCH-INV-A-${__VU}-${__ITER}`,
                    vendor_name: 'Batch Vendor A',
                    amount: 12000.00,
                    division: 'VCC',
                    document_type: 'AP INVOICE',
                },
                {
                    doc_key: `BATCH_B_${uniqueId}`,
                    document_number: `BATCH-DOC-B-${__VU}-${__ITER}`,
                    invoice_number: `BATCH-INV-B-${__VU}-${__ITER}`,
                    vendor_name: 'Batch Vendor B',
                    amount: 8500.00,
                    division: 'VCC',
                    document_type: 'AP INVOICE',
                },
            ],
        });

        const tBatchStart = new Date();
        const resBatch = http.post(`${BASE_URL}/api/sync/batch`, batchPayload, { headers: headers });
        syncBatchTrend.add(new Date() - tBatchStart);
        check(resBatch, {
            'batch sync status is 200': (r) => r.status === 200,
            'batch sync has successful_count': (r) => {
                try {
                    return JSON.parse(r.body).successful_count >= 1;
                } catch (e) {
                    return false;
                }
            },
        });
    }

    sleep(0.5);
}

export function handleSummary(data) {
    const metrics = data.metrics;

    const summary = {
        timestamp: new Date().toISOString(),
        total_requests: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.count) || 0,
        throughput_rps: (metrics.http_reqs && metrics.http_reqs.values && metrics.http_reqs.values.rate) || 0,
        avg_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values.avg) || 0,
        p90_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(90)']) || 0,
        p95_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(95)']) || 0,
        p99_latency_ms: (metrics.http_req_duration && metrics.http_req_duration.values && metrics.http_req_duration.values['p(99)']) || 0,
        failure_rate_pct: (metrics.http_req_failed && metrics.http_req_failed.values && metrics.http_req_failed.values.rate) ? metrics.http_req_failed.values.rate * 100 : 0,
        successful_records: (metrics.successful_sync_records && metrics.successful_sync_records.values && metrics.successful_sync_records.values.count) || 0,
        failed_records: (metrics.failed_sync_records && metrics.failed_sync_records.values && metrics.failed_sync_records.values.count) || 0,
    };

    const markdown = `# 1,000 Concurrent Synchronization Load Test Summary

- **Timestamp**: ${summary.timestamp}
- **Target Concurrency**: Up to 1,000 Virtual Users
- **Staged Tiers**: 10 &rarr; 50 &rarr; 100 &rarr; 250 &rarr; 500 &rarr; 1,000 VUs
- **Total Ingestion Requests Attempted**: ${summary.total_requests}
- **Successfully Ingested Records (HTTP 200)**: ${summary.successful_records}
- **Failed Ingestion Requests**: ${summary.failed_records}
- **HTTP Failure Rate**: ${summary.failure_rate_pct.toFixed(2)}%
- **Throughput**: ${summary.throughput_rps.toFixed(2)} req/sec
- **Average Latency**: ${summary.avg_latency_ms.toFixed(2)} ms
- **P90 Latency**: ${summary.p90_latency_ms.toFixed(2)} ms
- **P95 Latency**: ${summary.p95_latency_ms.toFixed(2)} ms
- **P99 Latency**: ${summary.p99_latency_ms.toFixed(2)} ms

## Verification Note
This summary measures HTTP API ingestion performance. Physical database persistence and duplicate verification are separately audited via \`tests/database/verify-sync-results.py\`.
`;

    return {
        'tests/reports/sync_concurrency_summary.json': JSON.stringify(data, null, 2),
        'tests/reports/sync_concurrency_summary.md': markdown,
        stdout: `\n=== Sync Concurrency Test Finished ===\nTotal Req: ${summary.total_requests}\nSuccessful Ingests: ${summary.successful_records}\nFailures: ${summary.failed_records}\nThroughput: ${summary.throughput_rps.toFixed(2)} req/s\nP95 Latency: ${summary.p95_latency_ms.toFixed(2)} ms\nFailure Rate: ${summary.failure_rate_pct.toFixed(2)}%\n`,
    };
}
