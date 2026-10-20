import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ============================================================================
// SCENARIO F: CONTROLLED AI & OCR DOCUMENT PROCESSING
// Measures resource-intensive OCR & AI pipeline in isolation.
// Backend enforces MAX_CONCURRENT_OCR = 3 to protect server resources.
// Concurrency: 1 to 3 VUs
// ============================================================================

const customFailureRate = new Rate('ocr_failure_rate');
const ocrTrend = new Trend('trend_ocr_duration');

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';
let token = __ENV.DOCUFLOW_TOKEN || '';
if (!token) {
    try {
        token = open('../token.txt').trim();
    } catch (e) {
        token = '';
    }
}

// Minimal valid PDF binary representation
const pdfData = open('../../../playwright-tests/fixtures/sample_invoice.pdf', 'b');

export const options = {
    scenarios: {
        ocr_controlled: {
            executor: 'constant-vus',
            vus: 2,
            duration: '20s',
        },
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(50)', 'p(90)', 'p(95)', 'p(99)'],
    thresholds: {
        http_req_failed: ['rate<0.10'],
        ocr_failure_rate: ['rate<0.10'],
    },
};

export default function () {
    const data = {
        file: http.file(pdfData, 'perf_test_invoice.pdf', 'application/pdf'),
        document_type: 'AP INVOICE',
        division: 'HQ',
        workflow_profile: 'Default Standard Flow',
        invoice_number: `PERF-INV-${Date.now()}-${__VU}`,
        amount: '12500.00',
        vendor_name: 'Performance Test Vendor',
    };

    const params = {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
        timeout: '30s',
    };

    const start = new Date();
    const res = http.post(`${BASE_URL}/api/documents/upload`, data, params);
    ocrTrend.add(new Date() - start);

    const ok = check(res, {
        'upload status 200 or 201': (r) => r.status === 200 || r.status === 201,
        'upload returns success and document_id': (r) => {
            try {
                const b = JSON.parse(r.body);
                return Boolean(b.success || b.document_id || b.id);
            } catch (e) {
                return false;
            }
        },
    });

    customFailureRate.add(!ok);
    sleep(2.0);
}
