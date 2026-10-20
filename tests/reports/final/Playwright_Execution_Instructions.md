# DocuFlow Automation — Playwright Test Execution Instructions

This guide provides reproducible, step-by-step instructions for running the complete Playwright automated end-to-end testing suite for **DocuFlow Automation / FlowApprove**.

---

## 1. Environment Prerequisites

Ensure the following runtimes and services are operational prior to executing tests:

| Component | Minimum Version | Verified Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` | `v24.16.0` | Test runner and frontend runtime |
| **npm** | `>= 9.0.0` | `10.8.2` | Dependency management |
| **Python** | `>= 3.10.0` | `3.12.7` | FastAPI backend execution |
| **SQL Server** | MSSQL 2019+ | MSSQL 2022 Express | Relational database (`DocuFlowDB`) |
| **Playwright** | `>= 1.40.0` | `1.58.2` | Browser automation engine |

---

## 2. Service Verification & Startup

The automated test suite runs against the live local application stack.

### Step 2.1: Start the FastAPI Backend
Open a PowerShell terminal and navigate to the backend directory:
```powershell
cd c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend

# Set environment variables for end-to-end automated testing
$env:UVICORN_RELOAD = "false"
$env:SHOW_OTP_IN_UI = "true"
$env:E2E_TESTING = "true"

# Launch backend on port 3000
python run.py
```
*Verify health check at: `http://127.0.0.1:3000/health` (Status: HTTP 200 OK)*

### Step 2.2: Start the Vite React Frontend
Open a separate PowerShell terminal in the project root:
```powershell
cd c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation

# Launch Vite dev server on port 5173
npm run dev
```
*Verify UI availability at: `http://localhost:5173`*

---

## 3. Test Execution Commands

All Playwright tests are stored in `playwright-tests/` and configured via [playwright.config.ts](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright.config.ts).

### 3.1 Run Full Suite (Headless Mode)
To run all 27 tests across all 9 modules sequentially:
```powershell
npx playwright test
```

### 3.2 Run a Specific Module
To execute an individual module spec file:
```powershell
# Module A: Authentication & Session Management
npx playwright test playwright-tests/01_auth.spec.ts

# Module B: Dashboard & Navigation
npx playwright test playwright-tests/02_dashboard_nav.spec.ts

# Module C: Document Management
npx playwright test playwright-tests/03_document_management.spec.ts

# Module D: Invoice Upload & AI Ingestion
npx playwright test playwright-tests/04_invoice_upload_ai.spec.ts

# Module E: Workflow Configuration & Rules
npx playwright test playwright-tests/05_workflow_config.spec.ts

# Module F: Approval Processing & Audit History
npx playwright test playwright-tests/06_approval_processing.spec.ts

# Module G: User Management & RBAC Permissions
npx playwright test playwright-tests/07_user_management_rbac.spec.ts

# Module H: Integration & Synchronization (DAPI Sync Hub)
npx playwright test playwright-tests/08_integration_sync.spec.ts

# Module I: End-to-End User Journey
npx playwright test playwright-tests/09_end_to_end_journey.spec.ts
```

### 3.3 Run in Headed / Interactive Mode (UI Inspection)
To visually observe browser interactions in real-time:
```powershell
npx playwright test --headed
```

### 3.4 Run in Debug / Step-Through Mode
To step through test executions breakpoint-by-breakpoint:
```powershell
npx playwright test --debug
```

### 3.5 View HTML Test Report and Traces
After test completion, launch Playwright's interactive report viewer:
```powershell
npx playwright show-report
```

---

## 4. Test Fixtures and Credentials

### Accounts Used in Testing
- **System Administrator**: Employee ID `EMP001` (Unrestricted access to all dashboards, workflows, control settings, user matrices, and DAPI hub)
- **Standard Employee / Approver**: Employee ID `EMP003` (Restricted access enforcing departmental isolation, no administrative control menus)

### Sample Files
- `playwright-tests/fixtures/sample_invoice.pdf`: Synthetic invoice PDF used for ingestion and dropzone validation.
- `playwright-tests/fixtures/invalid_script.exe`: Synthetic executable file used for file rejection and mime-type security validation.

---

## 5. Automated CI/CD Execution Script

For unattended batch testing or CI/CD pipelines, save the following PowerShell script as `run_e2e_ci.ps1`:

```powershell
# run_e2e_ci.ps1
Write-Host "=== DocuFlow Playwright Automated Test Runner ===" -ForegroundColor Cyan

# 1. Health check backend
try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:3000/health" -Method Get -TimeoutSec 5
    Write-Host "Backend is healthy: $($response.status)" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Backend is not reachable at http://127.0.0.1:3000" -ForegroundColor Red
    exit 1
}

# 2. Run Playwright
Write-Host "Executing Playwright End-to-End Suite..." -ForegroundColor Yellow
npx playwright test --reporter=list,json:tests/reports/final/playwright_test_results.json,html

if ($LASTEXITCODE -eq 0) {
    Write-Host "All tests passed successfully!" -ForegroundColor Green
} else {
    Write-Host "One or more tests failed. Check report." -ForegroundColor Red
}
exit $LASTEXITCODE
```
