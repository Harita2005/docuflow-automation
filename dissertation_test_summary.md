# DocuFlow Automation – Dissertation Test Summary (Table 4.9 & Explanatory Text)

## 4.4.8 Test Execution Summary

The quantitative testing of the DocuFlow Automation (Document Approval and Automation System – DAAS) was conducted across all core architectural tiers, validating functional behaviour, system integration, API contract conformity, OCR/AI pipeline routing, dynamic workflow orchestration, role-based access controls (RBAC), and user interface performance. Table 4.9 summarizes the empirical execution outcomes across the seven designated core testing categories (41 test cases), alongside Table 4.15 providing the extended register encompassing unit and user acceptance suites (52 test cases).

### Table 4.9: Test Execution Summary (Core System Test Plan – 41 Cases)

| Test Category | Designed | Executed | Pass | Pass with Exceptions | Fail | Blocked | Not Executed | Execution Rate (%) | Pass Rate (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Functional Testing** | 10 | 10 | 10 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **Integration Testing** | 6 | 6 | 6 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **API Testing** | 4 | 4 | 4 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **OCR and AI Extraction** | 6 | 6 | 6 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **Workflow Engine** | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **RBAC and Security** | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **UI and Performance** | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **Total (Core Plan)** | **41** | **41** | **41** | **0** | **0** | **0** | **0** | **100.0%** | **100.0%** |

*Note: Execution Rate = Executed / Designed × 100. Pass Rate = Pass / Executed × 100. Blocked and unexecuted cases are excluded from the pass-rate denominator.*

---

### Table 4.15: Extended Master Test Execution Summary (Comprehensive Register – 52 Cases)

| Test Category | Designed | Executed | Pass | Pass with Exceptions | Fail | Blocked | Not Executed | Execution Rate (%) | Pass Rate (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Core Subtotal (Table 4.9)** | 41 | 41 | 41 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **Unit Testing (Extended)** | 6 | 6 | 6 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **User Acceptance Testing (Extended)** | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 100.0% | 100.0% |
| **Grand Total (Master Register)** | **52** | **52** | **52** | **0** | **0** | **0** | **0** | **100.0%** | **100.0%** |

---

### Explanatory Paragraph for Section 4.4.8

> As presented in Table 4.9, the primary test suite comprising 41 core test cases achieved an execution rate of 100.0% (41/41) and a pass rate of 100.0% (41/41) across the automated test execution environment. When expanded to the comprehensive 52-case master test register (Table 4.15)—which incorporates low-level cryptographic/SLA unit validations (UT01–UT06) and end-to-end user acceptance workflows (UA01–UA05)—all 52 tests similarly completed with a 100.0% pass rate. Functional verification confirmed robust user authentication via JWT tokens, controlled handling of malformed and disallowed file uploads (e.g., immediate rejection of unapproved extensions), and consistent document status progression. Integration testing demonstrated seamless interoperability between document ingestion, Pydantic data schema validation, multi-tier condition-based routing, approver pool assignment, and ERP/DAPI synchronization endpoints (`POST /api/sync/record` and `POST /api/sync/batch` supporting batch processing up to 50 items). RBAC security controls effectively thwarted horizontal and vertical privilege escalation attempts, enforcing HTTP 403 Forbidden on administrative endpoints for non-admin accounts and neutralizing injection attacks through parameterized SQLAlchemy ORM queries. 
>
> In evaluating the OCR and AI extraction pipeline within the automated test harness, all six architectural test cases (AI01–AI06) passed successfully, confirming proper routing on low confidence thresholds (< 0.70), arithmetic reconciliation between subtotal and line items, multi-page PDF text concatenation, and fallback mechanisms for low-quality or unrecognized vendor layouts. However, in accordance with rigorous academic integrity standards, field-level extraction metrics on production documents (Character Error Rate, Word Error Rate, and field-level Precision/Recall/F1) are formally categorized as **BLOCKED pending human ground-truth annotation**, as no pre-annotated reference dataset was available during test execution. A reproducible evaluation framework (`evaluate_ai_metrics.py` and `ai_evaluation_template.xlsx`) has been deployed to compute these values upon dataset annotation. System performance was empirically benchmarked over 10 consecutive trials per endpoint against Microsoft SQL Server: the health check probe averaged 8.13 ms (standard deviation 1.25 ms), workflow retrieval averaged 147.29 ms, and paginated document list queries averaged 907.35 ms, confirming sub-second operational responsiveness under baseline load conditions.
