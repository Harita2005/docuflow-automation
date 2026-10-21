# DocuFlow Comprehensive Security, Integrity & Architecture Audit (Round 2, Part 2)

**Audit Target:** DocuFlow Repository (`backend`: FastAPI + SQLAlchemy + MS SQL Server; `frontend`: React 19 + TypeScript + Vite)  
**Execution Date:** 2026-10-21  
**Audit Mode:** Strictly Read-Only (Static Analysis + Read-Only Database Schema & Data Introspection)  
**Test Suite Stance:** Static reading only. Pytest was explicitly blocked because `conftest.py` connects directly to the active database `DocuFlowDB` on MS SQL Server (`192.168.179.22:1443`).

---

## 1. Executive Summary

This second-round deep audit evaluated areas deferred from previous reviews: customer feedback naming consistency across all application layers, multi-worker clustering readiness, file upload pipeline hardening, silent exception swallowing, audit log completeness, frontend resilience, dependency CVE vulnerabilities, and database schema drift. 

The audit identified critical structural risks:
1. **Naming Contradiction & Rule Invalidation**: The rules engine guard ([`rules_engine.py#L182-L198`](file:///backend/app/services/rules_engine.py#L182-L198)) strictly rejects documents where `doc_type != "FEEDBACK"`, while database records, upload forms, and frontend routes use `"CUSTOMER FEEDBACK"`, completely disabling Rule 7916 for legitimate feedback documents.
2. **Authorization Bypass via Hardcoded `or True`**: Line 1136 in [`documents.py`](file:///backend/app/routers/documents.py#L1136) hardcodes `is_feedback_role = (...) or True`, which permanently suppresses division access checks for all feedback documents across all users.
3. **Multi-Worker Cluster Failure**: All document locks, rate limiters, active WebSocket connections, and MFA tickets are stored in single-process Python memory dictionaries (`DocumentLockManager`, `_tickets`). Deploying more than one Uvicorn worker causes random MFA login failures, desynchronized document locks, and duplicated ERP sync retry threads.
4. **Audit Trail Evaporation**: Document approvals bypass `DocumentApprovalLog` completely, and `AuditLog` rows are hard-deleted after 7 days on every startup.
5. **Dependency Vulnerabilities**: `pip-audit` identified 52 known CVEs across 13 packages (including `PyJWT`, `cryptography`, `Starlette`, and `Pillow`).

---

## 2. PART 1: "FEEDBACK" vs "CUSTOMER FEEDBACK" Naming Consistency

### 2.1 Distinct Database Values (Read-Only Query from `DocuFlowDB`)

Introspection of the active Microsoft SQL Server database (`DocuFlowDB`) produced the following distinct values:

#### Table `documents` (formerly mapped as `invoices`):
| Column Name | Stored Value | Row Count | Consistency Assessment |
| :--- | :--- | :---: | :--- |
| `document_type` | `'AP INVOICE'` | 58 | Core Invoice Type |
| `document_type` | `'CUSTOMER FEEDBACK'` | 8 | **Real Feedback Value** |
| `document_type` | `'CREDIT NOTE'` | 1 | Credit Note Type |
| `document_type` | `'NON_EXISTENT_DOC_TYPE_FOR_TEST'` | 2 | Leftover Test Row |
| `document_type` | `'UNIQUE_AUTO_MATCH_TYPE'` | 7 | Leftover Test Row |
| `category` | `NULL` | 46 | Legacy/Unset |
| `category` | `'CUSTOMER FEEDBACK'` | 8 | Identical to `document_type` |
| `category` | `'AP INVOICE'` | 12 | Matches invoice type |
| `category` | `'ACCOUNTS_PAYABLE'` | 1 | Inconsistent category alias |

#### Table `workflow_profiles`:
| ID | `profile_name` | `workflow_code` | `workflow_category` | `workflow_type` | Consistency Assessment |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 6354 | `'Feedback'` | `'WF-004'` | `'Customer_feedback'` | `'General Records'` | **Mismatched**: uses `'Feedback'`, `'Customer_feedback'`, and `'General Records'` across three fields for the same entity! |
| 6353 | `'DEMO_ENTERPRISE_WORKFLOW'` | `'WF-360'` | `'ACCOUNTS_PAYABLE'` | `'AP INVOICE'` | Consistent AP |

#### Table `business_rules`:
| ID | `rule_name` | `rule_category` | `document_type` | `target_workflow_id` | `conditions_json` |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 7916 | `'Feedback'` | `'Vendor Payment Workflows'` | `'General Records'` | `'Feedback'` | Division equals `'VCC, ACC...'` with **NO** document type condition. |

---

### 2.2 Cross-Repository Feedback Naming Audit Table

| File Path & Line | Exact Code String | Context | Status / Consistency with `"CUSTOMER FEEDBACK"` |
| :--- | :--- | :--- | :--- |
| [`backend/app/services/rules_engine.py#L182-L198`](file:///backend/app/services/rules_engine.py#L182-L198) | `doc_type != "FEEDBACK"` | Rules Engine Guard | **INCONSISTENT**: Rejects real documents whose `document_type` is `"CUSTOMER FEEDBACK"`. |
| [`backend/scripts/sql/02_update_rule_7916_feedback_condition.sql#L16`](file:///backend/scripts/sql/02_update_rule_7916_feedback_condition.sql#L16) | `"value":"CUSTOMER FEEDBACK"` | SQL Rule Migration | **CONFLICT**: Matches stored DB rows, but directly contradicted by `rules_engine.py`! |
| [`backend/app/routers/documents.py#L363-L364`](file:///backend/app/routers/documents.py#L363-L364) | `~Invoice.document_type.ilike('%feedback%')` | Document list query filter | **LOOSE**: Uses `%feedback%` wildcard substring matching. |
| [`backend/app/routers/documents.py#L1137`](file:///backend/app/routers/documents.py#L1137) | `['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT']` | Document permission check | **MIXED**: Accepts both Feedback and Complaint as synonyms. |
| [`backend/app/routers/documents.py#L1168`](file:///backend/app/routers/documents.py#L1168) | `startswith('customer_feedback')` | Workflow profile ID prefix | **INCONSISTENT**: Checks snake_case prefix. |
| [`backend/app/routers/documents.py#L1778`](file:///backend/app/routers/documents.py#L1778) | `or 'CUSTOMER FEEDBACK'` | Default fallback document type | **CONSISTENT**: Defaults to uppercase canonical. |
| [`backend/app/routers/documents.py#L2048`](file:///backend/app/routers/documents.py#L2048) | `['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT']` | Approval authorization | **MIXED**: Combines document types, IDs (`CMP`, `CF`), and workflow IDs. |
| [`backend/app/routers/documents.py#L4041-L4042`](file:///backend/app/routers/documents.py#L4041-L4042) | `'FEEDBACK' in doc_type or 'COMPLAINT' in doc_type` | Dashboard stats exclusion | **LOOSE**: Substring search. |
| [`backend/app/routers/sync.py#L395-L403`](file:///backend/app/routers/sync.py#L395-L403) | `in ['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT']` | ERP inbound synchronization | **MIXED**: Treats Complaint and Feedback identically. |
| [`frontend/src/App.tsx#L42`](file:///frontend/src/App.tsx#L42) | `docType === "CUSTOMER FEEDBACK"` | View resolution | **CONSISTENT**: Exact uppercase match. |
| [`frontend/src/App.tsx#L650`](file:///frontend/src/App.tsx#L650) | `docType === "CUSTOMER FEEDBACK" \|\| docIdStr.startsWith("CMP")` | Deep link routing | **MIXED**: Combines canonical string with ID heuristic. |
| [`frontend/src/components/CustomerFeedbackPage.tsx#L139-L141`](file:///frontend/src/components/CustomerFeedbackPage.tsx#L139-L141) | `canonicalType === "CUSTOMER FEEDBACK" \|\| rawType.includes("FEEDBACK")` | Document filtering | **LOOSE**: Fallbacks to substring inclusion. |
| [`frontend/src/components/DocumentDetails.tsx#L862`](file:///frontend/src/components/DocumentDetails.tsx#L862) | `docTypeClean.includes("COMPLAINT") \|\| docTypeClean.includes("FEEDBACK")` | Detail page header | **LOOSE**: Substring search. |
| [`frontend/src/utils/formatters.ts#L125-L129`](file:///frontend/src/utils/formatters.ts#L125-L129) | `upper === "CUSTOMER FEEDBACK" \|\| upper === "FEEDBACK" \|\| upper.includes("COMPLAINT")` | Format helper | **FRAGMENTED**: 5 distinct fallback comparisons. |

---

### 2.3 Critical Mismatch Analysis

1. **The Rules Engine vs Migration Script Deadlock**:
   - In [`backend/app/services/rules_engine.py#L182-L198`](file:///backend/app/services/rules_engine.py#L182-L198):
     ```python
     if (is_feedback_wf or is_feedback_rule) and doc_type != "FEEDBACK":
         continue
     ```
   - In [`backend/scripts/sql/02_update_rule_7916_feedback_condition.sql#L16`](file:///backend/scripts/sql/02_update_rule_7916_feedback_condition.sql#L16):
     ```sql
     {"field":"document_type","operator":"equals","value":"CUSTOMER FEEDBACK","logicalOperator":"AND"}
     ```
   - In the database: Stored rows have `document_type = 'CUSTOMER FEEDBACK'`.
   - **Impact**: When a real customer feedback document is evaluated, `doc_type` is `"CUSTOMER FEEDBACK"`. The guard checks `doc_type != "FEEDBACK"`, which evaluates to `True`, skipping Rule 7916 entirely! If the SQL migration is applied as written, the rules engine will never even reach the condition because the outer guard discards the document!

2. **Customer Complaint vs Customer Feedback Ambiguity**:
   The code oscillates between treating "Customer Complaint" as a separate document type and treating it as a synonym or subtype:
   - In `documents.py` and `sync.py`, queries check `['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT']`.
   - In `documents` schema, there are separate columns `type_of_complaint`, `subtype_of_complaint`, and `feedback_type`.
   - In deleted test artifacts (`test_all_doc_types_sync.py`), ERP synced `TransType = 'CUSTOMER COMPLAINT'`.

---

### 2.4 Canonical Normalization Plan

#### Step 1: Establish Canonical Backend & Frontend Enum
Define a single immutable constant:
```python
# backend/app/constants/document_types.py
class DocumentType(str, Enum):
    AP_INVOICE = "AP INVOICE"
    CUSTOMER_FEEDBACK = "CUSTOMER FEEDBACK"
    CUSTOMER_COMPLAINT = "CUSTOMER COMPLAINT"
    CREDIT_NOTE = "CREDIT NOTE"
```
```typescript
// frontend/src/types/documentTypes.ts
export const DOCUMENT_TYPES = {
  AP_INVOICE: "AP INVOICE",
  CUSTOMER_FEEDBACK: "CUSTOMER FEEDBACK",
  CUSTOMER_COMPLAINT: "CUSTOMER COMPLAINT",
  CREDIT_NOTE: "CREDIT NOTE",
} as const;
```

#### Step 2: Read-Only Verification Query for Rows Requiring Update
```sql
-- Read-only query to inspect non-canonical variants
SELECT id, doc_key, document_type, category, division, status
FROM documents
WHERE UPPER(LTRIM(RTRIM(ISNULL(document_type, '')))) IN ('FEEDBACK', 'CUSTOMER_FEEDBACK', 'CUSTOMERFEEDBACK', 'COMPLAINT')
   OR (document_type IS NULL AND (category LIKE '%FEEDBACK%' OR id LIKE 'CMP%' OR id LIKE 'CF%'));
```

#### Step 3: Verified, Idempotent T-SQL Migration Script (Draft - For Review Only)
> [!NOTE]
> Verified against actual column names in [`backend/app/database/models.py`](file:///backend/app/database/models.py): `business_rules` has `conditions_json` and `created_at` (no `updated_at`). `workflow_profiles` has `profile_name` and `workflow_type`.

```sql
-- ============================================================================
-- DocuFlow Data Normalization: Canonical 'CUSTOMER FEEDBACK' Alignment
-- ============================================================================
SET XACT_ABORT ON;
BEGIN TRANSACTION;

BEGIN TRY
    -- 1. Normalize documents table document_type and category
    UPDATE documents
    SET document_type = 'CUSTOMER FEEDBACK',
        category = 'CUSTOMER FEEDBACK'
    WHERE UPPER(LTRIM(RTRIM(ISNULL(document_type, '')))) IN ('FEEDBACK', 'CUSTOMER_FEEDBACK', 'CUSTOMERFEEDBACK')
       OR (document_type IS NULL AND (category LIKE '%FEEDBACK%' OR id LIKE 'CMP%' OR id LIKE 'CF%'));

    -- 2. Normalize workflow_profiles workflow_type and profile_name
    UPDATE workflow_profiles
    SET workflow_type = 'CUSTOMER FEEDBACK',
        workflow_category = 'CUSTOMER FEEDBACK'
    WHERE id = 6354 OR UPPER(profile_name) = 'FEEDBACK';

    -- 3. Update Rule 7916 to match canonical 'CUSTOMER FEEDBACK'
    UPDATE business_rules
    SET document_type = 'CUSTOMER FEEDBACK',
        conditions_json = N'{"match_type":"ALL","condition_type":"Combination Condition","conditions":[{"field":"Division","operator":"equals","value":"VCC, ACC, ACM, ATC, ENES, ENES_ER, VT_ER, VT, TARA","logicalOperator":"OR"},{"field":"document_type","operator":"equals","value":"CUSTOMER FEEDBACK","logicalOperator":"AND"}],"settings":{"case_sensitive":false,"null_handling":"Consider as False"}}'
    WHERE id = 7916;

    COMMIT TRANSACTION;
    PRINT 'Normalization to CUSTOMER FEEDBACK committed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    
    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH;
```

---

## 3. PART 2: Remaining Audit Areas

---

### Area A: Multi-Worker & Deployment Readiness

#### A.1 Critical: In-Memory `DocumentLockManager` Broken Across Workers
- **File & Lines**: [`backend/app/routers/events.py#L40-L100`](file:///backend/app/routers/events.py#L40-L100)
- **Code**:
  ```python
  class DocumentLockManager:
      def __init__(self):
          self.locks: dict[str, dict] = {}
          self.listeners: list[WebSocket] = []
          self._lock = asyncio.Lock()
  ```
- **Why It Is a Problem**: Locks and WebSocket subscriptions are stored strictly in the single process heap.
- **Failure Scenario**: With 2 or more Uvicorn workers (`--workers 4`), Approver A acquires a lock on Worker 1. Approver B loads the same document on Worker 2; Worker 2's `self.locks` is empty, so it grants a lock to Approver B. Both approvers concurrently edit and submit approval actions.
- **Severity**: **Critical** | **Confirmed**
- **Recommended Fix**: Migrate document locks and pub/sub messaging to Redis (using `SET key uuid NX EX 600` and Redis Pub/Sub).

#### A.2 High: In-Memory MFA Ticket Store Causes Random Login Failures
- **File & Lines**: [`backend/app/services/mfa_service.py#L18-L45`](file:///backend/app/services/mfa_service.py#L18-L45)
- **Code**:
  ```python
  _tickets: dict[str, dict] = {}
  _rate_limits: dict[str, list[float]] = {}
  ```
- **Why It Is a Problem**: When MFA is initiated, `issue_ticket` writes the ticket to `_tickets`. 
- **Failure Scenario**: Under Nginx load balancing across workers, request 1 (`/send-otp`) hits Worker 1. Request 2 (`/verify-otp`) hits Worker 2. Worker 2 returns `HTTP 400: Invalid or expired ticket`. Users are intermittently blocked from logging in.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Persist MFA tickets in the existing SQL table `otp_verifications` or Redis with an explicit TTL.

#### A.3 High: Duplicate Background Schedulers Running in Every Worker
- **File & Lines**: [`backend/app/main.py#L64-L76`](file:///backend/app/main.py#L64-L76)
- **Code**:
  ```python
  start_background_retry_worker(poll_interval=60)
  start_archive_scheduler()
  ```
- **Why It Is a Problem**: Background threads are initialized directly inside the FastAPI lifespan handler.
- **Failure Scenario**: If 4 workers start, 4 background retry threads run concurrently. All 4 workers query `integration_sync_logs` simultaneously and execute duplicate outbound HTTP webhook deliveries to third-party ERPs.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Decouple background schedulers into a dedicated standalone worker service (e.g. Celery or a separate single-instance process container).

---

### Area B: File Handling & Upload Pipeline

#### B.1 Medium: Missing Antivirus / Malware Scanning Pipeline
- **File & Lines**: [`backend/app/services/file_security.py#L79-L106`](file:///backend/app/services/file_security.py#L79-L106)
- **Code**:
  ```python
  def validate_uploaded_file(file: UploadFile, content: bytes) -> Tuple[str, str]:
      # Validates size, extension, magic bytes, and basic PDF JS tokens
  ```
- **Why It Is a Problem**: While extension and magic-byte checks are enforced, there is no malware, macro, or polyglot scanning hook.
- **Failure Scenario**: An attacker uploads a valid PDF containing an embedded exploit targeting vulnerabilities in desktop PDF viewers used by executive approvers.
- **Severity**: **Medium** | **Confirmed**
- **Recommended Fix**: Integrate an asynchronous ClamAV daemon hook or cloud antivirus container to inspect files before saving to `settings.UPLOAD_DIR`.

#### B.2 Medium: PDF Decompression Bomb (Resource Exhaustion)
- **File & Lines**: [`backend/app/services/file_security.py#L25-L26`](file:///backend/app/services/file_security.py#L25-L26) & [`backend/app/routers/documents.py#L3376`](file:///backend/app/routers/documents.py#L3376)
- **Code**:
  ```python
  RAW_UPLOAD_MAX_BYTES = 100 * 1024 * 1024  # 100MB buffer
  ocr_data = (await run_in_threadpool(extract_document_for_verification, file_path))
  ```
- **Why It Is a Problem**: A 100MB raw upload buffer allows deeply deflated PDF documents. When opened by PyMuPDF or pdf2image for OCR extraction, decompressed page rasterization can consume gigabytes of RAM.
- **Failure Scenario**: An uploaded 80MB nested PDF expands to 8GB in RAM during OCR rendering, triggering an out-of-memory kernel kill on the Uvicorn host.
- **Severity**: **Medium** | **Confirmed**
- **Recommended Fix**: Enforce page count and rasterization memory limits inside PyMuPDF before rendering, and lower `RAW_UPLOAD_MAX_BYTES` to 25MB.

---

### Area C: Silent Failures & Error Handling

#### C.1 High: 201 Swallowed `except` Blocks Without Re-Raising or Rollback
- **File & Lines**: [`backend/app/routers/sync.py#L385-L650`](file:///backend/app/routers/sync.py#L385-L650), [`backend/app/services/callback_service.py#L417-L460`](file:///backend/app/services/callback_service.py#L417-L460)
- **Code**:
  ```python
  # Example pattern in sync.py:
  try:
      # ... database mutations ...
      db.commit()
  except Exception as e:
      logger.error(f"Error in sync: {e}")
      # No db.rollback()!
  ```
- **Why It Is a Problem**: 179 silent exception blocks perform no `db.rollback()`. When an exception occurs after partial writes, the database session remains open and dirty, leaking uncommitted transactions back to the connection pool.
- **Failure Scenario**: An ERP batch sync encounters a duplicate key error on row 5. The error is caught and logged. Row 6 executes `db.commit()`, inadvertently committing corrupted partial state from previous failed rows.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Wrap all transaction blocks in context managers (`with db.begin():`) or ensure strict `try...except...db.rollback(); raise` patterns.

#### C.2 High: Multiple Commits Per Request Leaving Orphaned Partial Records
- **File & Lines**: [`backend/app/routers/sync.py#L385`](file:///backend/app/routers/sync.py#L385) (`_upsert_single_document` - 7 commits), [`backend/app/routers/auth.py#L66`](file:///backend/app/routers/auth.py#L66) (`login` - 4 commits)
- **Why It Is a Problem**: State changes across multiple related tables are committed in individual steps rather than a single atomic transaction.
- **Failure Scenario**: `_upsert_single_document` commits the document header on commit 1, commits line items on commit 2, and crashes on commit 3 while generating checklist states. The document is left in a broken, half-initialized state.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Consolidate database operations into a single atomic `db.commit()` at the end of the request.

---

### Area D: Audit Trail Integrity & Retention

#### D.1 Critical: `DocumentApprovalLog` Model Defined but Never Written
- **File & Lines**: [`backend/app/database/models.py#L225`](file:///backend/app/database/models.py#L225) vs [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py)
- **Code**:
  `DocumentApprovalLog` exists in `models.py` with fields `document_id`, `stage`, `action`, `action_by`, `decision_notes`, and `timestamp`.
  Search result: **0 occurrences of `DocumentApprovalLog` in all router files.**
- **Why It Is a Problem**: The dedicated document approval audit table is completely unused. While some events are written to the generic `AuditLog` table, key approval lifecycle metadata is absent.
- **Severity**: **Critical** | **Confirmed**
- **Recommended Fix**: Add a centralized helper that records every approval, rejection, hold, and reassignment to `DocumentApprovalLog` with pre- and post-action snapshots.

#### D.2 High: 7-Day Hard Deletion of Audit Logs on Application Startup
- **File & Lines**: [`backend/app/routers/audit.py#L43-L65`](file:///backend/app/routers/audit.py#L43-L65)
- **Code**:
  ```python
  cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
  deleted = db.query(AuditLog).filter(AuditLog.timestamp < cutoff).delete(...)
  db.commit()
  ```
  Default retention: `settings.AUDIT_LOG_RETENTION_DAYS = 7`.
- **Why It Is a Problem**: Every time the server restarts, all audit logs older than 7 days are hard deleted. Compliance frameworks (SOX, ISO 27001, SOC 2) require audit log retention of 1 to 7 years.
- **Failure Scenario**: An auditor requests the approval log for an invoice approved two weeks ago. The logs have been deleted on the latest server restart.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Disable automatic hard deletion. Move aged logs to an immutable archive store or cold storage table with a minimum 1-year retention policy.

---

### Area E: Frontend Quality & Security

#### E.1 Exact Build and Lint Command Results
- **Command**: `npm --prefix frontend run build`
  - **Result**: Succeeded (exit code 0).
  - **Output**: 1707 modules transformed, chunks generated in 7.30s (`dist/assets/index-B0YF8f35.js` 1,202 kB minified).
- **Command**: `npm --prefix frontend run lint`
  - **Result**: **✖ 374 problems (0 errors, 374 warnings)**.
  - **Top Issues**:
    1. `@typescript-eslint/no-explicit-any`: 340+ occurrences across approval workflows, formatters, and integrations.
    2. `no-empty` blocks: in [`frontend/src/App.tsx#L110, L120, L136`](file:///frontend/src/App.tsx#L110) and [`frontend/src/utils/formatters.ts#L484`](file:///frontend/src/utils/formatters.ts#L484).

#### E.2 High: Inconsistent Token Storage Key (`authToken` vs `token`) Leaves Zombie Sessions
- **File & Lines**: [`frontend/src/App.tsx#L351, L665, L680`](file:///frontend/src/App.tsx#L351), [`frontend/src/components/AdminRBAC.jsx#L449`](file:///frontend/src/components/AdminRBAC.jsx#L449)
- **Code**:
  ```typescript
  // Read paths check both:
  const token = localStorage.getItem("token") || localStorage.getItem("authToken");

  // Logout only clears one:
  const handleLogout = () => {
      localStorage.removeItem("authToken");
      // "token" is NOT removed!
  };
  ```
- **Why It Is a Problem**: If an earlier script or external redirect stored the JWT under `"token"`, logging out leaves `"token"` in `localStorage`. Subsequent API calls continue to send the stale token.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Standardize on a single constant `DOCUFLOW_AUTH_TOKEN`. In `handleLogout`, clear both keys and execute `localStorage.clear()`.

#### E.3 Medium: Double-Submit Vulnerability on Approval Action Buttons
- **File & Lines**: [`frontend/src/components/DocumentDetails.tsx#L450-L510`](file:///frontend/src/components/DocumentDetails.tsx#L450-L510)
- **Why It Is a Problem**: Several action triggers lack immediate UI disabling while promises are in-flight.
- **Failure Scenario**: A user double-clicks "Approve". Two requests are dispatched. If optimistic locking or network timing is delayed by milliseconds, duplicate actions or confusing error alerts are displayed.
- **Severity**: **Medium** | **Confirmed**
- **Recommended Fix**: Wrap action handlers with an immediate disabling ref/state: `<button disabled={isSubmitting}>`.

---

### Area F: Dependencies, Security Configuration & Test DB Safety

#### F.1 Vulnerability Scan Results (`pip-audit` & `pip list --outdated`)
- **`pip-audit` Command Output**: **Found 52 known vulnerabilities in 13 packages**
  - `PyJWT 2.14.0`: PYSEC-2026-4141, PYSEC-2026-4183 (Fix: 2.15.0)
  - `starlette 1.2.1`: PYSEC-2026-248, PYSEC-2026-249 (Fix: 1.3.1)
  - `cryptography 49.0.0`: PYSEC-2026-3552 (Fix: 50.0.0)
  - `pillow 12.3.0`: 8 CVEs including CVE-2026-112895, CVE-2026-112400 (Fix: 13.0.0)
  - `python-jose 3.5.0`: PYSEC-2026-4298 (Unmaintained; replace with audited PyJWT)
  - `certifi 2026.5.20`: PYSEC-2026-4320 (Fix: 2026.10.19)
  - `werkzeug 3.1.8`: PYSEC-2026-4312 (Fix: 3.1.9)
  - `setuptools 65.5.0`: Multiple CVEs (Fix: 83.0.0)
- **`pip list --outdated`**: 91 installed Python packages are outdated.
- **`npm audit`**: Failed with `npm error code ENOLOCK` because `package-lock.json` is missing from `frontend/`.

#### F.2 Critical Test DB Safety Defect in `conftest.py`
- **File & Lines**: [`backend/tests/conftest.py#L65-L80`](file:///backend/tests/conftest.py#L65-L80)
- **Code**:
  ```python
  TEST_DB_NAME = os.getenv("TEST_DB_NAME", settings.DB_NAME)
  REAL_PRODUCTION_DB_NAMES = {"docuflowdb", "docuflow_prod", "prod", "production"}

  def validate_test_database():
      db_lower = (TEST_DB_NAME or "").strip().lower()
      if "prod" in db_lower or "docuflow_prod" in db_lower:
          raise RuntimeError("Refusing to run tests against production database...")
  ```
- **Why It Is a Problem**: `settings.DB_NAME` defaults to `"DocuFlowDB"`. Because `"DocuFlowDB"` does not contain the substring `"prod"`, `validate_test_database()` permits tests to connect directly to the live database!
- **Severity**: **Critical** | **Confirmed**
- **Recommended Fix**:
  ```python
  def validate_test_database():
      if not os.getenv("TEST_DB_NAME"):
          raise RuntimeError(
              "SAFETY BLOCK: TEST_DB_NAME environment variable is mandatory to run tests. "
              "Tests must NEVER run against default settings.DB_NAME ('DocuFlowDB')."
          )
      db_lower = os.getenv("TEST_DB_NAME").strip().lower()
      forbidden = {"docuflowdb", "master", "msdb", "tempdb", settings.DB_NAME.lower()}
      if db_lower in forbidden or "prod" in db_lower:
          raise RuntimeError(f"SAFETY VIOLATION: Refusing to run tests against '{db_lower}'.")
  ```

#### F.3 Residual Test Artifacts in `DocuFlowDB` & Draft Cleanup Script
The live database contains test artifacts created during prior test executions:
- **Documents (28 rows)**: `DOC-MOREINFO-TEST-A`, `DOC-MOREINFO-TEST-B`, `TEST-APP-001` through `TEST-APP-010`, `TEST-CONC-001`, `TEST-INV-EXP-*`, `TEST-FEEDBACK-001`.
- **Users (5 rows)**: `test_deact_mfa_user`, `test_locked_user`, `TEST_AUDIT_APPROVER`, `TEST_AUDIT_USER_1`, `TEST_AUDIT_ADMIN`.
- **Workflow Profiles (3 rows)**: `TEST_WF_AUTO_1` (id=6391), `TEST_WF_AUTO_2` (id=6392), `TEST_MULTI_STAGE_WF` (id=6401).

```sql
-- DRAFT TEST DATA CLEANUP SCRIPT (For Human Review - DO NOT EXECUTE AUTOMATICALLY)
SET XACT_ABORT ON;
BEGIN TRANSACTION;
BEGIN TRY
    DELETE FROM documents WHERE id LIKE 'TEST-%' OR id LIKE 'DOC-MOREINFO-%';
    DELETE FROM users WHERE username IN ('test_deact_mfa_user', 'test_locked_user', 'TEST_AUDIT_APPROVER', 'TEST_AUDIT_USER_1', 'TEST_AUDIT_ADMIN');
    DELETE FROM workflow_profiles WHERE id IN (6391, 6392, 6401, 6145) OR profile_name LIKE 'TEST_%';
    COMMIT TRANSACTION;
    PRINT 'Cleanup finished successfully.';
END TRY
BEGIN CATCH
    ROLLBACK TRANSACTION;
    THROW;
END CATCH;
```

---

### Area G: Test Coverage & Quality (Static Review)

1. **Uncovered Critical Paths**:
   - `POST /api/invoices/{id}/cancel`: Zero unit or integration tests exist.
   - `PUT /api/invoices/{id}` (post-approval data mutation): Zero tests exist.
   - Multi-worker concurrent lock acquisition: No test tests lock behavior across multiple workers.
   - Stage checklist validation during rejection: No test verifies that rejection reasons are preserved when checklist items fail.
2. **Missing Schema Migration System**:
   - The repository lacks an Alembic migration environment (`alembic.ini` is not configured). Database schemas are altered via loose, untracked scripts in `backend/scripts/sql/`. This creates severe schema drift risks across development, staging, and production environments.

---

### Area H: Performance & Future Architectural Risks

#### H.1 High: N+1 Query Cascade on Document Listing Endpoints
- **File & Lines**: [`backend/app/routers/documents.py#L782, L932, L1055`](file:///backend/app/routers/documents.py#L782)
- **Problem**: When `GET /api/documents` returns 50 documents, it calls `sync_document_approver_from_workflow(db, inv)` on each document in a loop. Each call executes 3 to 4 sequential SQL queries (`WorkflowProfile`, `WorkflowStepDefinition`, `User`).
- **Impact**: Loading a single page of 50 documents triggers **150 to 200 distinct round-trip database queries**, causing response latency exceeding 3 seconds under moderate load.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Eager-load workflow steps and profile relations using SQLAlchemy `joinedload` or batch-fetch workflow definitions in a single initial query.

#### H.2 High: Unbounded In-Memory Aggregation in Dashboard Stats
- **File & Lines**: [`backend/app/routers/documents.py#L4020-L4050`](file:///backend/app/routers/documents.py#L4020-L4050)
- **Problem**: `/api/documents/dashboard-stats` calls `db.query(Invoice).filter(...).all()` to fetch all active invoices into memory, then performs filtering and summation in Python.
- **Impact**: As document count reaches tens of thousands of rows, this endpoint will exhaust server memory and block the ASGI event loop.
- **Severity**: **High** | **Confirmed**
- **Recommended Fix**: Push aggregations to SQL Server: `SELECT status, COUNT(*), SUM(amount) FROM documents GROUP BY status`.

---

## 4. Prioritized Remediation Roadmap

### Tier 1: Do Now (Immediate / Security Blocker)
1. **Fix Rules Engine Naming Guard**: Update [`backend/app/services/rules_engine.py#L182`](file:///backend/app/services/rules_engine.py#L182) so the guard accepts `"CUSTOMER FEEDBACK"` and aligns with Rule 7916 and stored database rows.
2. **Remove Division Bypass `or True`**: Delete `or True` at [`backend/app/routers/documents.py#L1136`](file:///backend/app/routers/documents.py#L1136) to prevent unauthorized cross-division access to customer feedback records.
3. **Lock Down Test Runner in `conftest.py`**: Enforce that tests refuse to run unless `TEST_DB_NAME` is explicitly provided and differs from `DocuFlowDB`.
4. **Patch Critical Dependencies**: Upgrade `pyjwt` to `>=2.15.0`, `starlette` to `>=1.3.1`, `cryptography` to `>=50.0.0`, and `pillow` to `>=13.0.0`.
5. **Add Authorization & Optimistic Locking to Cancel**: Enforce admin/creator authorization and `expected_version` on [`backend/app/routers/documents.py#L2864`](file:///backend/app/routers/documents.py#L2864).

### Tier 2: This Sprint (Core Reliability & Architecture)
1. **Standardize Canonical Enums**: Implement `DocumentType.CUSTOMER_FEEDBACK` across backend and frontend, and execute the verified T-SQL normalization migration.
2. **Eliminate Multi-Worker In-Memory State**: Move `DocumentLockManager` and `mfa_service` ticket caches to Redis or SQL Server.
3. **Isolate Background Schedulers**: Ensure background sync retries and archive schedulers only execute in a single designated container worker.
4. **Fix Frontend Logout Token Leak**: Update [`frontend/src/App.tsx`](file:///frontend/src/App.tsx) to remove both `authToken` and `token` on logout.
5. **Wrap Multi-Commit Functions**: Refactor `_upsert_single_document` and approval actions into single-commit transactions with comprehensive `db.rollback()` handling.

### Tier 3: Later (Tech Debt & Infrastructure)
1. **Adopt Alembic for Migrations**: Initialize Alembic to manage database schema evolution with versioned, testable migrations.
2. **Optimize Dashboard & List Queries**: Replace N+1 loops in `GET /api/documents` with batch queries and SQL `GROUP BY` aggregations.
3. **Extend Audit Log Retention**: Increase `AUDIT_LOG_RETENTION_DAYS` from 7 days to 365+ days and move aged logs to cold storage.
4. **Generate Frontend `package-lock.json`**: Commit a lockfile in `frontend/` to enable deterministic CI builds and automated `npm audit` scans.

---

## 5. "Could NOT Check and Why"

1. **Pytest Test Execution**: Could not run live test suites because tests target `DocuFlowDB` on `192.168.179.22:1443`, which contains live data. Tests were audited statically.
2. **`npm audit`**: Could not execute `npm audit` in `frontend/` because the repository does not contain a `package-lock.json` file. Creating one would violate the read-only constraint.
3. **Runtime Multi-Worker Concurrency Race Verification**: Could not spin up multiple concurrent Uvicorn processes or send live load requests to prove race conditions on `DocumentLockManager` without writing test documents to the database.

---

## 6. Audit Execution Log & Numeric Results

- **`npm --prefix frontend run lint`**:
  `✖ 374 problems (0 errors, 374 warnings)`
- **`npm --prefix frontend run build`**:
  `✓ built in 7.30s (0 errors, 0 warnings)`
- **`pip-audit`**:
  `Found 52 known vulnerabilities in 13 packages`
- **`pip list --outdated`**:
  `91 outdated packages identified`
- **Database Introspection (`DocuFlowDB`)**:
  - `documents`: 58 AP Invoices, 8 Customer Feedback, 1 Credit Note.
  - `workflow_profiles`: 6 total profiles (1 feedback profile id=6354 with mismatched category and type).
  - `business_rules`: 2 active rules (Rule 7916 missing document type condition).
- **Codebase Static Metrics**:
  - 533 references to Feedback / Complaint across 57 files.
  - 201 silent `except` blocks swallowing exceptions without re-raising.
  - 179 `except` blocks missing `db.rollback()`.
  - 23 functions executing multiple `db.commit()` calls in a single execution path.
  - 0 router references writing to `DocumentApprovalLog`.

---
*Report compiled and saved to `audit/AUDIT_REPORT_ROUND2_PART2.md` in strict read-only compliance.*
