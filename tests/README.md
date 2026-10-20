# DocuFlow Automation — Automated Testing Suite

Comprehensive, automated test suite designed for **DocuFlow Automation** (FastAPI backend + Microsoft SQL Server + React frontend + OCR/Extraction engine + Workflow Approval Engine).

---

## 1. Directory Structure

```
tests/
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
│   ├── load-test.js             # k6 multi-tier load test (10, 25, 50, 100 VUs)
│   ├── endurance-test.js        # k6 sustained endurance test
│   ├── stress-test.js           # k6 ramping stress test with failure abort thresholds
│   └── token.txt                # Live JWT token for k6 performance executions
├── monitoring/
│   └── monitor.ps1              # PowerShell monitor for CPU %, RAM (MB), and process metrics
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
pip install pytest pytest-asyncio httpx requests python-dotenv
```

---

## 3. Environment Variables Reference

Configure these in `backend/.env` or export them in your terminal session:

| Variable | Description | Default Value |
|---|---|---|
| `BASE_URL` | Live backend API URL for k6 & monitoring | `http://127.0.0.1:3000` |
| `DOCUFLOW_TOKEN` | Bearer JWT token for authenticated requests | Read from `tests/performance/token.txt` |
| `SERVICE_API_KEY` | Machine-to-machine internal integration API key | Read from backend config / `.env` |
| `DATABASE_URL` | SQL Server connection string | `mssql+pyodbc://...` |

---

## 4. Running Test Suites Individually

### A. Functional API Tests (`test_api.py`)
Validates core endpoints across Authentication, Documents, Admin RBAC, and System Health.
```bash
pytest tests/test_api.py -v
```

### B. Security & Isolation Tests (`test_security.py`)
Validates token expiration, RBAC restrictions, division isolation, arbitrary file upload rejection, path traversal prevention, and password hash leakage protection.
```bash
pytest tests/test_security.py -v
```

### C. Duplicates & Idempotency Tests (`test_duplicates.py`)
Verifies single document sync, repeated submission idempotency, terminal state rejection, and concurrent write safety.
```bash
pytest tests/test_duplicates.py -v
```

### D. Workflow & Concurrency Tests (`test_workflows.py`)
Validates step transitions (Hold/Reject/Approve), audit logging completeness, and optimistic concurrency version conflict handling (HTTP 409).
```bash
pytest tests/test_workflows.py -v
```

### E. Extraction Accuracy Evaluation (`evaluator.py`)
Calculates field-level exact match %, normalized match %, Character Error Rate (CER), Word Error Rate (WER), and missing field rates against ground-truth data.
```bash
python tests/accuracy/evaluator.py
```
Outputs:
- `tests/reports/accuracy_report.json`
- `tests/reports/accuracy_report.md`

### F. Performance & Load Testing with k6

Ensure backend is running (`uvicorn app.main:app --port 3000`) before running k6:

#### 1. Multi-Tier Load Test (10, 25, 50, 100 Virtual Users)
```bash
k6 run tests/performance/load-test.js
```
*To customize stage duration (e.g. 5 seconds per stage for quick smoke test):*
```bash
k6 run -e DURATION_PER_STAGE=5s tests/performance/load-test.js
```
Outputs:
- `tests/reports/load_test_summary.json`
- `tests/reports/load_test_summary.md`

#### 2. Sustained Endurance Test
```bash
k6 run -e DURATION=5m -e VUS=25 tests/performance/endurance-test.js
```
Outputs:
- `tests/reports/endurance_test_summary.json`
- `tests/reports/endurance_test_summary.md`

#### 3. Ramping Stress Test
```bash
k6 run -e STAGE_RAMP=30s tests/performance/stress-test.js
```
Outputs:
- `tests/reports/stress_test_summary.json`
- `tests/reports/stress_test_summary.md`

### G. System Resource Monitoring (`monitor.ps1`)
Monitors overall system CPU, RAM, and specific DocuFlow backend processes.
```powershell
powershell -ExecutionPolicy Bypass -File tests/monitoring/monitor.ps1 -IntervalSeconds 1 -MaxSamples 60
```
Outputs:
- `tests/reports/system_resources.csv`

---

## 5. Running the Complete Consolidated Suite

To execute all unit, integration, security, and accuracy tests in sequence:
```bash
pytest tests/test_api.py tests/test_security.py tests/test_duplicates.py tests/test_workflows.py -v
python tests/accuracy/evaluator.py
```

---

## 6. Troubleshooting Common Issues

### 1. Database Connection Failures (`pyodbc.Error` / Connection Refused)
- **Cause**: SQL Server service is stopped or port `1433` is blocked.
- **Fix**: Check Windows Services (`Get-Service MSSQLSERVER` or `MSSQL$SQLEXPRESS`). Verify connection credentials in `backend/.env`.

### 2. Token Expired / HTTP 401 Unauthorized during k6 Tests
- **Cause**: JWT tokens have an expiration window.
- **Fix**: Run the login endpoint to fetch a fresh token and overwrite `tests/performance/token.txt`:
```bash
python -c "import requests; r = requests.post('http://127.0.0.1:3000/api/auth/login', json={'username':'admin','password':'Password123!'}); open('tests/performance/token.txt','w').write(r.json()['access_token'])"
```

### 3. Port Conflict (HTTP 3000 or 8000 already in use)
- **Cause**: An orphaned Uvicorn or Node process is occupying port 3000.
- **Fix**: Run `Get-NetTCPConnection -LocalPort 3000` in PowerShell and terminate the PID with `Stop-Process -Id <PID> -Force`.

### 4. Pytest Transaction Rollback vs Live State
- **Note**: The automated test suite leverages isolated DB transactions and cleans up any generated test records (`TEST_API_%`, `TEST_WF_%`) after execution, ensuring production and pre-existing records remain unaltered.
