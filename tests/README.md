# DocuFlow Automation — Complete Performance & Automated Testing Suite

Comprehensive, automated test suite designed for **DocuFlow Automation** (FastAPI backend + Microsoft SQL Server + React frontend + OCR/Extraction engine + Workflow Approval Engine).

---

## 1. Directory Structure

```
tests/
├── run-all-tests.ps1            # Master test orchestrator for all performance & integrity tests
├── conftest.py                  # Pytest fixtures, DB transaction isolation, authentication tokens
├── test_api.py                  # Functional API test suite (CRUD, auth, status codes, schemas)
├── test_security.py             # Security suite (RBAC, SQL injection, path traversal, tokens)
├── test_duplicates.py           # Concurrency, idempotency & duplicate prevention
├── test_workflows.py            # Workflow transitions, optimistic locking & audit trails
├── accuracy/
│   ├── evaluator.py             # OCR/AI extraction accuracy evaluator (CER, WER, Exact/Norm Match)
│   ├── ground_truth_template.csv# Ground truth test definitions
│   └── sample_invoice.txt       # Sample extracted OCR payload for offline accuracy validation
├── performance/
│   ├── real-api-load.js         # Test A: Real document API load test (10, 25, 50, 100 VUs)
│   ├── sync-concurrency.js      # Test B: 1,000 concurrent synchronization requests (Staged 10-1,000 VUs)
│   ├── endurance-test.js        # Test C: Sustained endurance test on real document endpoints
│   ├── stress-test.js           # Test D: Ramping stress test with failure abort thresholds
│   └── token.txt                # Live JWT token for k6 performance executions
├── monitoring/
│   └── monitor.ps1              # Test E: PowerShell monitor for CPU %, RAM (MB), and process metrics
├── database/
│   └── verify-sync-results.py   # Test F: Read-only database concurrency & integrity audit
└── reports/                     # Output destination for all JSON, Markdown, and CSV test reports
```

---

## 2. Prerequisites & Setup

### Environment Requirements
- **Python**: 3.11+
- **Database**: Microsoft SQL Server running with `DocuFlowDB` schema migrated
- **FastAPI Service**: Running locally on `http://127.0.0.1:3000` (for live k6 tests)
- **k6**: Grafana k6 v0.45+ (installed at `C:\Program Files\k6\k6.exe` or available in system `PATH`)
- **PowerShell**: Windows PowerShell 5.1+ or PowerShell 7+

### Python Dependencies Installation
From the project root:
```bash
pip install pytest pytest-asyncio httpx requests python-dotenv pyodbc sqlalchemy
```

---

## 3. Environment Variables Reference

Configure these in `backend/.env` or export them in your terminal session:

| Variable | Description | Default Value |
|---|---|---|
| `BASE_URL` | Live backend API URL for k6 & monitoring | `http://127.0.0.1:3000` |
| `DOCUFLOW_TOKEN` | Bearer JWT token for authenticated requests | Read from `tests/performance/token.txt` |
| `SERVICE_API_KEY` | Machine-to-machine internal integration API key | `DocuFlow-M2M-Integration-Secret-2026` |
| `DATABASE_URL` | SQL Server connection string | Read from `backend/.env` |

---

## 4. Running Test Suites Individually

### A. Real Document API Load Test (`real-api-load.js`)
Tests actual document routes (`GET /api/invoices`, `GET /api/invoices/{id}`, `GET /api/document-types/.../config`) alongside health baseline:
```bash
k6 run tests/performance/real-api-load.js
# Or for fast verification:
k6 run -e STAGE_DURATION=5s tests/performance/real-api-load.js
```
Outputs:
- `tests/reports/real_api_load_summary.json`
- `tests/reports/real_api_load_summary.md`

### B. 1,000 Concurrent Synchronization Requests (`sync-concurrency.js`)
Tests `POST /api/sync/record` and `POST /api/sync/batch` under staged concurrency (10 &rarr; 50 &rarr; 100 &rarr; 250 &rarr; 500 &rarr; 1,000 VUs):
```bash
k6 run tests/performance/sync-concurrency.js
# Or for fast verification:
k6 run -e STAGE_RAMP=5s tests/performance/sync-concurrency.js
```
Outputs:
- `tests/reports/sync_concurrency_summary.json`
- `tests/reports/sync_concurrency_summary.md`

### C. Sustained Endurance Test (`endurance-test.js`)
Tests long-term stability across real document and configuration endpoints:
```bash
k6 run -e DURATION=15m -e VUS=25 tests/performance/endurance-test.js
```
Outputs:
- `tests/reports/endurance_test_summary.json`
- `tests/reports/endurance_test_summary.md`

### D. Ramping Stress Test (`stress-test.js`)
Pushes virtual user concurrency until reaching configured thresholds (aborts if failure rate > 10%):
```bash
k6 run -e STAGE_RAMP=30s tests/performance/stress-test.js
```
Outputs:
- `tests/reports/stress_test_summary.json`
- `tests/reports/stress_test_summary.md`

### E. Windows Process CPU & RAM Monitoring (`monitor.ps1`)
Monitors overall system CPU, RAM, and specific DocuFlow backend processes:
```powershell
powershell -ExecutionPolicy Bypass -File tests/monitoring/monitor.ps1 -IntervalSeconds 1 -MaxSamples 60
```
Outputs:
- `tests/reports/system_resources.csv`

### F. Database Concurrency & Integrity Audit (`verify-sync-results.py`)
Queries SQL Server to audit persisted test records, verify zero duplicate keys, validate required fields, and verify idempotency:
```bash
python tests/database/verify-sync-results.py
# Add --cleanup flag to safely remove test records after verification:
python tests/database/verify-sync-results.py --cleanup
```
Outputs:
- `tests/reports/db_integrity_report.json`
- `tests/reports/db_integrity_report.md`

---

## 5. Master Automated Orchestration (`run-all-tests.ps1`)

To execute the entire suite end-to-end in safe sequential order with resource monitoring and database audit:
```powershell
powershell -ExecutionPolicy Bypass -File tests/run-all-tests.ps1
```
For quick smoke/verification runs:
```powershell
powershell -ExecutionPolicy Bypass -File tests/run-all-tests.ps1 -FastRun -CleanAfter
```
