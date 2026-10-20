# Playwright Testing Evidence Index — DocuFlow Automation

This index catalogs all evidence files, execution artifacts, logs, fixtures, and configuration records generated during the end-to-end browser automation testing of **DocuFlow Automation / FlowApprove**.

---

## 1. Primary Test Artifacts

| Artifact Name | Location | Description | Format |
| :--- | :--- | :--- | :--- |
| **Test Results JSON** | [`tests/reports/final/playwright_test_results.json`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/tests/reports/final/playwright_test_results.json) | Complete machine-generated Playwright test execution log containing raw timings, suite hierarchies, and pass statuses. | JSON |
| **Test Summary JSON** | [`tests/reports/final/Playwright_Test_Summary.json`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/tests/reports/final/Playwright_Test_Summary.json) | High-level structured summary metrics with module-by-module breakdown and pass percentages. | JSON |
| **Test Cases Register** | [`tests/reports/final/Playwright_Test_Cases.csv`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/tests/reports/final/Playwright_Test_Cases.csv) | Full tabular register of all 27 automated test cases including execution steps, expected results, and measured durations. | CSV |
| **Defect & Remediation Log** | [`tests/reports/final/Playwright_Defect_Log.csv`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/tests/reports/final/Playwright_Defect_Log.csv) | Register of issues discovered during automated testing (rate-limiting, locator drift, view transitions) and resolutions. | CSV |
| **Execution Instructions** | [`tests/reports/final/Playwright_Execution_Instructions.md`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/tests/reports/final/Playwright_Execution_Instructions.md) | Reproducible step-by-step instructions for running test suites, individual modules, headed debugging, and CI/CD runs. | Markdown |
| **Comprehensive Report** | [`tests/reports/final/Playwright_Functional_Test_Report.md`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/tests/reports/final/Playwright_Functional_Test_Report.md) | 14-section academic and enterprise-grade testing report structured for M.Sc. Artificial Intelligence & Machine Learning documentation. | Markdown |

---

## 2. Test Implementation Source Files

The test automation implementation is maintained under [`playwright-tests/`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests):

| File Path | Module Tested | Test Cases Covered |
| :--- | :--- | :--- |
| [`playwright.config.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright.config.ts) | Playwright Configuration | Global runner configuration (baseURL, single worker, reporters, timeouts) |
| [`playwright-tests/helpers/auth.helper.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/helpers/auth.helper.ts) | Reusable Auth Helpers | Multi-factor OTP automation, session token in-memory caching, logout routines |
| [`playwright-tests/01_auth.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/01_auth.spec.ts) | Module A: Auth & Session | `TC-AUTH-001` through `TC-AUTH-005` |
| [`playwright-tests/02_dashboard_nav.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/02_dashboard_nav.spec.ts) | Module B: Dashboard & Nav | `TC-DASH-001` through `TC-DASH-003` |
| [`playwright-tests/03_document_management.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/03_document_management.spec.ts) | Module C: Document Management | `TC-DOC-001` through `TC-DOC-004` |
| [`playwright-tests/04_invoice_upload_ai.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/04_invoice_upload_ai.spec.ts) | Module D: Upload & AI Ingest | `TC-UPL-001` through `TC-UPL-003` |
| [`playwright-tests/05_workflow_config.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/05_workflow_config.spec.ts) | Module E: Workflow & Rules | `TC-WF-001` through `TC-WF-003` |
| [`playwright-tests/06_approval_processing.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/06_approval_processing.spec.ts) | Module F: Approval Processing | `TC-APP-001` through `TC-APP-003` |
| [`playwright-tests/07_user_management_rbac.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/07_user_management_rbac.spec.ts) | Module G: User Mgmt & RBAC | `TC-RBAC-001` through `TC-RBAC-002` |
| [`playwright-tests/08_integration_sync.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/08_integration_sync.spec.ts) | Module H: Integration (DAPI) | `TC-INT-001` through `TC-INT-003` |
| [`playwright-tests/09_end_to_end_journey.spec.ts`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/09_end_to_end_journey.spec.ts) | Module I: Complete E2E Journey | `TC-E2E-001` |

---

## 3. Test Fixtures

| Fixture Path | Purpose | File Attributes |
| :--- | :--- | :--- |
| [`playwright-tests/fixtures/sample_invoice.pdf`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/fixtures/sample_invoice.pdf) | Positive upload testing & OCR ingestion | Standard PDF binary with invoice header, items, totals |
| [`playwright-tests/fixtures/invalid_script.exe`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/playwright-tests/fixtures/invalid_script.exe) | Negative upload & file extension validation | Binary executable payload designed to trigger validation rejection |

---

## 4. Live Verification Environment Details

- **Test Execution Timestamp**: 2026-10-20 05:41:44 UTC
- **Total Execution Duration**: 118,807.579 ms (~1 minute 58.8 seconds)
- **Host System**: Windows 11 Enterprise (x64)
- **Backend Service**: FastAPI daemon listening on `http://127.0.0.1:3000`
- **Frontend Service**: Vite React development server on `http://localhost:5173`
- **Database Connection**: Microsoft SQL Server `DocuFlowDB` verified active
- **Browser Context**: Chromium 145.0.7542.0 (Playwright bundled)
- **Result Status**: 27 Passed, 0 Failed, 0 Flaky, 0 Skipped (100.0% Pass Rate)
