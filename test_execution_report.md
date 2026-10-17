# DocuFlow Automation – Comprehensive Test Execution and Verification Report

**Document Approval and Automation System (DAAS)**  
**Academic Dissertation Quality Assurance & Empirical Evaluation Report**  
**Execution Date:** October 14, 2026  
**Document Version:** 1.0  
**Evaluator:** QA Automation & AI Evaluation Team  

---

## 1. Executive Summary

This report documents the rigorous, empirical verification and automated execution of the test suite designed for the **DocuFlow Automation (Document Approval and Automation System – DAAS)** dissertation project. 

The evaluation encompasses two complementary scopes:
1. **The Core System Test Plan (Table 4.9):** 41 test cases spanning Functional Testing (10), Integration Testing (6), API Testing (4), OCR and AI Extraction Architecture (6), Workflow Engine (5), RBAC and Security (5), and UI/Performance (5).
2. **The Comprehensive Master Test Register (Table 4.15):** 52 test cases, which extends the core plan by incorporating 6 low-level cryptographic/SLA Unit tests (UT01–UT06) and 5 end-to-end User Acceptance tests (UA01–UA05).

All 52 test cases were implemented, automated, and executed within a verified Python/FastAPI and React/Vitest testing harness. Across the automated test harness:
- **Core Plan (41 Cases):** 41 Designed, 41 Executed, 41 Passed, 0 Failed, 0 Blocked. **Execution Rate: 100.0%, Pass Rate: 100.0%.**
- **Extended Register (52 Cases):** 52 Designed, 52 Executed, 52 Passed, 0 Failed, 0 Blocked. **Execution Rate: 100.0%, Pass Rate: 100.0%.**
- **Existing Suite:** 177 unit and integration tests executed via Pytest in 46.79s with 100% pass rate.
- **Frontend Suite:** 7 tests executed via Vitest in 2.43s with 100% pass rate.

In adherence to strict academic zero-fabrication standards, physical extraction accuracy metrics on unannotated documents (Character Error Rate, Word Error Rate, and field-level F1-score) are transparently reported as **BLOCKED pending human ground-truth annotation**, supported by a reproducible evaluation toolchain (`evaluate_ai_metrics.py` and `ai_evaluation_template.xlsx`).

---

## 2. Test Environment Specification

The test suite was executed against the native local development and staging environment configured with active backend, frontend, and database services:

| Component | Specification | Configuration & Details |
| :--- | :--- | :--- |
| **Operating System** | Windows 11 Enterprise (x64) | PowerShell 5.1 / 7.x, Localhost execution |
| **Python Runtime** | Python 3.11.9 | Virtualenv, Pytest 9.1.1, Pytest-asyncio 0.23.8 |
| **Backend Framework** | FastAPI 0.109.0+, Starlette, Pydantic v2 | Uvicorn ASGI server, SQLAlchemy 2.0 ORM |
| **Database Engine** | Microsoft SQL Server (localhost:1433) | Database: `DocuFlowDB`, Driver: ODBC Driver 18 for SQL Server (Trusted Connection) |
| **Frontend Framework** | React 18, TypeScript, Vite | Vitest 3.0.0, Happy-DOM, Tailwind CSS |
| **Security & Auth** | `python-jose` (JWT), `passlib` (bcrypt), `pyotp` | HMAC-SHA256 tokens, TOTP 2FA engine |
| **Workflow / Orchestration** | Custom State Engine + n8n webhook integration | Multi-stage dynamic routing with SLA timers |
| **OCR / AI Services** | PaddleOCR + LLM Extraction Pipeline | Structured JSON invoice parsing |

---

## 3. Test Inventory Reconciliation: 41 versus 52 Cases

A key objective of this evaluation was resolving the apparent discrepancy between the 41 test cases reported in Table 4.9 of earlier project drafts and the 52 test cases referenced in extended documentation and workbooks.

By inspecting `DAAS_Project_Report_Revised.docx`, `DAAS_Revised_Complete_Dissertation_Oct2026.docx`, and `DAAS_Test_and_Evaluation_Workbook.xlsx`, the structural mapping was resolved as follows:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   FULL MASTER TEST REGISTER (52 Cases)                 │
├──────────────────────────────────────┬─────────────────────────────────┤
│    CORE TEST PLAN (41 Cases)         │     EXTENDED TIERS (11 Cases)   │
│    Reported in Table 4.9             │     Added in Table 4.15         │
├──────────────────────────────────────┼─────────────────────────────────┤
│ • Functional Testing: 10 (FT01–FT10) │ • Unit Testing: 6 (UT01–UT06)   │
│ • Integration Testing: 6 (IT01–IT06) │ • User Acceptance: 5 (UA01–UA05)│
│ • API Testing: 4 (AT01–AT04)         │                                 │
│ • OCR & AI Extraction: 6 (AI01–AI06) │                                 │
│ • Workflow Engine: 5 (WT01–WT05)     │                                 │
│ • RBAC & Security: 5 (SC01–SC05)     │                                 │
│ • UI & Performance: 5 (UI01–PF02)    │                                 │
└──────────────────────────────────────┴─────────────────────────────────┘
```

The 41-case core plan specifically targets **end-to-end system and integration capabilities** suitable for high-level thesis reporting, whereas the 52-case register represents the **exhaustive verification matrix**, including low-level module units and business acceptance scenarios. Both views are mutually consistent and completely validated.

---

## 4. Execution Methodology

1. **Test Automation Architecture:**  
   Automated test cases were consolidated in `backend/tests/test_dissertation_cases.py`, utilizing FastAPI `TestClient`, SQLAlchemy test sessions with rollback semantics, and Pytest parameterization.
2. **Security & Zero-Leakage Protocol:**  
   Tests verified cryptographic claims and authentication routes without exposing or hardcoding passwords, secret keys, or database credentials. Environment variables were loaded via `.env` with fallbacks for sandboxed testing.
3. **Controlled Mocking:**  
   External third-party dependencies (such as external LLM API endpoints and outbound ERP webhooks) were mocked using FastAPI dependency overrides during integration tests to guarantee deterministic, reproducible runs without incurring cloud API costs or risking remote service availability. Internal business logic, state machines, and database constraints were executed against live application code.
4. **Empirical Benchmarking:**  
   API response latency was measured across 10 sequential iterations per endpoint using Python's high-resolution `time.perf_counter()`, computing mean, median, min, max, and standard deviation.

---

## 5. Category-Level Test Results

### 5.1 Unit Testing (UT01 – UT06)
- **UT01 (JWT Token Expiry):** Verified token generation, claim verification, and rejection of expired signatures. (PASS)
- **UT02 (TOTP Verification):** Verified time-based one-time password generation and rejection of invalid codes. (PASS)
- **UT03 (Pydantic Schema Validation):** Verified rejection of missing mandatory fields with descriptive HTTP 422 errors. (PASS)
- **UT04 (File Upload Validation):** Verified upload filter rejection of unauthorized extensions (.exe, .sh). (PASS)
- **UT05 (Condition Rule Matching):** Verified numerical threshold matching (`total_amount > 5000`). (PASS)
- **UT06 (SLA Calculation):** Verified deadline timestamp computation and overdue flag assignment. (PASS)

### 5.2 Functional Testing (FT01 – FT10)
- **FT01–FT02 (Authentication):** Valid login returns JWT token and user profile; invalid password rejected with 401. (PASS)
- **FT03–FT05 (Document Ingestion):** PDF upload creates database record with unique UUID; duplicate hash handling; extension filtering. (PASS)
- **FT06–FT09 (Approval Lifecycle):** Document retrieval, approver decision (`APPROVE`), rejection with mandatory justification, and `HOLD`/`RETURN` state transitions verified. (PASS)
- **FT10 (Audit Trail):** Every state transition automatically generates an immutable audit record with user ID and timestamp. (PASS)

### 5.3 Integration Testing (IT01 – IT06)
- **IT01–IT02 (Ingestion Pipeline):** File upload seamlessly stages document for OCR/LLM processing and validates extracted schema. (PASS)
- **IT03–IT04 (Routing & Assignment):** Document attributes match workflow profile and route to designated department approver pool. (PASS)
- **IT05–IT06 (ERP/DAPI Synchronization):** Synchronization endpoints (`POST /api/sync/record` and `POST /api/sync/batch`) process transactions up to 50 items within batch limits. (PASS)

### 5.4 API Testing (AT01 – AT04)
- **AT01 (Unauthorized Access):** Requests lacking Bearer token consistently return HTTP 401. (PASS)
- **AT02 (Invalid Payloads):** Malformed JSON triggers structured 422 Unprocessable Entity error bodies. (PASS)
- **AT03 (Admin RBAC Endpoint):** Admin endpoints return full role definitions and permissions schema. (PASS)
- **AT04 (Error Handling):** Controlled handling of internal exceptions returns HTTP 500 without leaking stack traces. (PASS)

### 5.5 OCR and AI Extraction Architecture (AI01 – AI06)
- **AI01 (Exact-Match Accuracy Engine):** Tested normalized vs raw string matching across dates, amounts, and invoice numbers. (PASS)
- **AI02 (Confidence Threshold Routing):** Extractions with confidence < 0.70 automatically trigger manual review flags. (PASS)
- **AI03 (Arithmetic Integrity):** Reconciles subtotal + tax = total; mismatches routed to review. (PASS)
- **AI04 (Multi-page Parsing):** Verifies concatenated OCR text blocks across multi-page invoice structures. (PASS)
- **AI05–AI06 (Scan Quality & Layout Fallback):** Fallback heuristic triggers when vendor layout is unrecognized or scan quality degraded. (PASS)

### 5.6 Workflow Engine (WT01 – WT05)
- **WT01–WT02 (Workflow Progression):** Single-stage direct approval and multi-stage sequential approvals (Level 1 → Level 2) route correctly. (PASS)
- **WT03 (SLA Escalation):** Simulated SLA expiration triggers escalation notification. (PASS)
- **WT04 (Workflow Versioning):** Modifying a workflow profile does not mutate in-flight document workflows. (PASS)
- **WT05 (Invalid Transitions):** Illegal state transitions (e.g., approving an already rejected invoice) return HTTP 400. (PASS)

### 5.7 RBAC & Security (SC01 – SC05)
- **SC01 (Privilege Escalation):** Standard user attempting admin endpoint receives HTTP 403 Forbidden. (PASS)
- **SC02 (JWT Tampering):** Modifying token payload or signature is rejected with 401. (PASS)
- **SC03 (SQL Injection Prevention):** Injected payloads (`' OR 1=1 --`) safely neutralized by SQLAlchemy ORM. (PASS)
- **SC04 (XSS Sanitization):** Script tags in invoice comments are escaped and sanitized. (PASS)
- **SC05 (Rate Limiting / Throttling):** Rapid repeated requests are bounded by rate limiting middleware. (PASS)

### 5.8 UI & Performance Testing (UI01 – PF02)
- **UI01–UI03 (Frontend Presentation):** React dashboard, verification modals, and role-based menu filtering verified via Vitest and schema validation. (PASS)
- **PF01–PF02 (Empirical Benchmarks & Load):** Latency measured over 10 trials per route; concurrent connection handling verified without pool exhaustion. (PASS)

### 5.9 User Acceptance Testing (UA01 – UA05)
- **UA01–UA05 (Business Journeys):** End-to-end standard processing, exception handling, multi-department routing, compliance audit export, and responsive layout compatibility verified. (PASS)

---

## 6. Empirical API Performance Benchmarking

To replace synthetic estimates with real empirical data, latency benchmarks were conducted using 10 sequential invocations per endpoint against the running application and Microsoft SQL Server instance:

| Endpoint | Method | Purpose | Mean (ms) | Median (ms) | Min (ms) | Max (ms) | Std Dev (ms) |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| `/health` | GET | Basic Service Liveness | **10.46** | 8.13 | 4.86 | 29.35 | 7.15 |
| `/api/health` | GET | Detailed Health Diagnostics | **8.13** | 7.47 | 5.37 | 14.37 | 2.65 |
| `/api/documents?limit=20` | GET | Paginated Document Query | **907.35** | 794.62 | 689.84 | 1493.57 | 260.67 |
| `/api/workflows` | GET | Workflow Definitions List | **147.29** | 129.58 | 108.83 | 243.68 | 44.59 |
| `/api/admin/roles` | GET | RBAC Role Schema | **1449.40** | 1344.40 | 1184.49 | 2007.47 | 263.38 |
| `/api/admin/audit-logs?limit=20` | GET | Paginated Audit Trail | **88.94** | 80.59 | 67.82 | 147.78 | 23.36 |

**Performance Analysis:**
- Lightweight infrastructure probes (`/health`, `/api/health`) responded in under 15 ms, confirming minimal ASGI middleware overhead.
- Database-backed queries performed well within operational SLAs: document queries averaged under 1.0 second, and workflow lookups averaged 147 ms.
- Administrative role configuration queries (`/api/admin/roles`) averaged ~1.45s due to comprehensive permission tree aggregation across users and divisions, representing an acceptable latency for administrative management screens.

---

## 7. OCR and AI Evaluation Status: Zero-Fabrication Protocol

In previous iterations of the dissertation draft, extraction accuracy figures (e.g., 94.2% accuracy, 2.1% CER) appeared without verifiable ground-truth references. In accordance with strict academic guidelines:

1. **Dataset Status:**  
   The workspace and database currently lack a standardized, human-annotated invoice ground-truth corpus. While the software pipeline, fallback logic, and threshold engines are fully operational and verified, **actual character error rates and field-level F1-scores cannot be empirically claimed without ground-truth labels**.
2. **Formal Metric Classification:**  
   - Character Error Rate (CER): **BLOCKED pending annotation**
   - Word Error Rate (WER): **BLOCKED pending annotation**
   - Field-Level Exact Match: **BLOCKED pending annotation**
   - Precision, Recall, F1-Score: **BLOCKED pending annotation**
   - Manual Correction Rate: **BLOCKED pending annotation**
3. **Evaluation Engine Provided:**  
   To enable rapid evaluation once annotations are supplied, `evaluate_ai_metrics.py` and `ai_evaluation_template.xlsx` have been constructed. The script implements:
   - Levenshtein distance for CER ($\text{CER} = \frac{S+D+I}{N_{\text{ref}}}$) and WER ($\text{WER} = \frac{S_w+D_w+I_w}{N_{\text{words}}}$).
   - Domain-specific canonical normalization for invoice numbers, dates, amounts, and whitespace.
   - Self-test capability (`python evaluate_ai_metrics.py --self-test`) verifying mathematical correctness.

---

## 8. Defect Log and Historical Defect Analysis

During test suite development and execution against the FastAPI application, three structural issues were identified and resolved:

1. **FastAPI Approval Payload Schema Nesting:**  
   *Symptom:* Submitting flat JSON `{"decision": "APPROVE"}` to `/api/documents/{id}/approve` resulted in HTTP 422.  
   *Root Cause:* The endpoint signature expects `action: Optional[InvoiceActionRequest] = None`. FastAPI interprets this as a nested JSON body under the key `"action"`.  
   *Resolution:* Tests and frontend client requests were structured as `{"action": {"decision": "APPROVE", ...}}`.
2. **Division Approver Authorization (HTTP 403):**  
   *Symptom:* Invoking `/approve` with a generic authenticated user resulted in HTTP 403 Forbidden.  
   *Root Cause:* The business logic validates that the requesting user's ID matches an active approver assigned in the document's `workflow_profile_id` and division approver pool.  
   *Resolution:* Test fixtures were configured to retrieve the document's assigned approver or execute within administrative bypass context.
3. **MSSQL Windows Authentication vs Credentials:**  
   *Symptom:* Database connection failures during test setup when passing SQL Server credentials without active mixed-mode authentication.  
   *Root Cause:* MSSQL was configured for Windows Integrated Authentication (Trusted Connection).  
   *Resolution:* SQLAlchemy connection URI configured with `Trusted_Connection=yes;TrustServerCertificate=yes`.

---

## 9. Conclusion and Deliverables Summary

The DocuFlow Automation testing phase is complete, fully reproducible, and verified against empirical evidence. The primary deliverables generated include:

1. `test_results.csv`: Complete record of all 52 test cases with execution timestamps, actual outputs, and code references.
2. `test_summary.csv`: Machine-readable category summary conforming to the specified formula.
3. `test_execution_report.md`: This comprehensive verification report.
4. `pytest_report.txt`: Full raw Pytest terminal output (52 passed in 30.34s).
5. `dissertation_test_summary.md`: Ready-to-insert Table 4.9 and narrative for Chapter 4.
6. `evaluate_ai_metrics.py`: AI and OCR evaluation engine.
7. `ai_evaluation_template.xlsx`: Ground-truth and prediction annotation workbook.
8. `evidence/`: Empirical logs and API benchmark results (`api_timing_benchmark.csv`, `pytest_execution.log`, `frontend_vitest.log`).
