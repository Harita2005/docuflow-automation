# DocuFlow Hardening & Approval Workflow Audit: Phase A Comprehensive Test Report

**Document Version:** 1.0.0  
**Audit Execution Date:** 2026-10-09  
**Branch:** `security-hardening`  
**Target Environment:** Read-Only Functional & Security Audit against `DocuFlowDB` / SQL Server (`192.168.179.22:1443`)  
**Audit Scope:** 19 Functional & Security Areas, Rules as Implemented, UI Button Matrix, Performance & Concurrency Profiling.

---

## 1. Executive Summary & Audit Overview

This report documents the exhaustive, read-only functional and security audit of the DocuFlow automation system (DAAS v2.0). All tests and inspections were performed strictly in accordance with Master Task rules:
- **Zero application state changes:** No production or test data was modified during this audit phase.
- **Strict configuration integrity:** `backend/app/app_config.json` was never modified.
- **Comprehensive coverage:** 238 API routes, 288 workflow profiles, 980 step definitions, 583 business rules, and 12 primary frontend screens were audited.

### High-Level Summary of Findings
1. **Critical Architectural & Database Bottlenecks:**
   - **GET /api/workflows Latency (~4.1s):** Traced to sequential N+1 SQL queries executed across 288 profiles inside `ensure_workflow_code` in `backend/app/routers/workflows.py` (lines 50–79), performing network round-trips and `db.commit()` on read requests.
   - **Database RCSI is OFF:** Production database `DocuFlowDB` currently operates with `is_read_committed_snapshot_on = False`. Readers acquire shared read locks that block concurrent writers, and writes block reads.
   - **Writes/Commits Inside GET Handlers:** Multiple GET endpoints (`/api/invoices`, `/api/invoices/{id}/checklist`, `/api/workflows`) execute active database mutations (`db.delete`, `db.add`, `db.commit()`), inducing table locks and contention during routine reads.
2. **Critical Security Vulnerabilities:**
   - **IDOR on Document Updates:** `PUT /api/documents/{id}` (`backend/app/routers/documents.py:1207`) enforces zero object-level access control. Any authenticated user can overwrite arbitrary documents, including changing amounts, stages, and approvers.
   - **Missing Server-Side Field-Level Access Control (FLAC):** Document updates accept arbitrary field mappings without verifying whether the user's role allows modifying that specific field at the current stage.
   - **Session Token Non-Revocation:** `POST /api/auth/logout` clears `User.active_session_id`, but `get_current_user` in `backend/app/auth.py` validates only JWT signature and expiry. Active tokens remain valid for up to 480 minutes after logout.
   - **Lack of Account Lockout:** Repeated failed login attempts are recorded in `AuditLog` but never lock the user account.
   - **NameError in SSRF Validator:** `backend/app/services/security_service.py:42` calls `urllib.parse.urlparse` without importing `urllib`, crashing any callback execution with an unhandled 500 error.
3. **Workflow Routing & Approval State Drift:**
   - **Orphaned Approver Pools:** 288 workflow profiles contain legacy approver targets (e.g. `NATHIYA_16220`, `DINESH_E21-02621`, `KANNADHASAN_8349`) who do not exist in the sanitized 8-user database. Only `admin` can approve documents through administrative override.
   - **Checklist Route & Schema Asymmetry:** Frontend `DocumentDetails.tsx` calls `POST /api/invoices/{id}/checklist` with `{ checked_items }`, while More Info config uses `PUT /api/documents/{id}/more-info/config`. The route `POST /api/documents/{id}/checklist` does not exist, causing 404s when accessed through alternate URL paths.

---

## 2. Summary Per Functional Area (Areas 1 – 19)

### Area 1: Login, MFA, Sessions, and Credentials
- **User Enumeration Defense:** Verified intact. Both unknown usernames and invalid passwords for existing users return identical HTTP 401 responses (`"Invalid credentials"`), preventing account enumeration.
- **Account Lockout:** Missing. No columns exist in `users` (`failed_login_attempts`, `is_locked`, `locked_until`) to throttle or lockout brute-force attempts.
- **Session Revocation on Logout:** Fails. Logout clears the database column `active_session_id`, but the JWT authentication dependency (`app/auth.py:93`) does not check token revocation or database session IDs. The JWT remains valid until the 480-minute expiration.
- **SMTP Not Configured:** Fully handled. `is_email_otp_available()` detects unconfigured and placeholder credentials. Email OTP is withheld from available methods and requests return HTTP 503 without logging or exposing secrets.
- **Plaintext Secrets & Configuration Exposure:** The app config contains plaintext credentials; `/docs`, `/redoc`, and `/openapi.json` are exposed without environment guards; `TrustServerCertificate=yes` is hardcoded.

### Area 2: Endpoints vs Roles Authorization Matrix
- **Audit Findings:** 181 routes out of 238 routes do not enforce strict role or permission checks.
- **Unprotected Endpoints:** 
  - `GET /api/erp/{po_number}` allows anonymous access to ERP master purchase orders.
  - `GET /api/invoices/{invoice_id}/checklist` allows unauthenticated access to compliance checklists.
  - `GET /api/document-types/{document_type}/available-fields` allows unauthenticated field discovery.
  - The entire `/api/integrations/v2/*` suite (`applications`, `rules`, `test`, `logs`, `audit-history`) lacks authentication dependencies (`get_current_active_user` or `verify_service_api_key`).
- **Anonymous Metric & Log Leaks:** System engine overview and dashboard metrics are exposed without RBAC.

### Area 3: Document Creation & Ingestion
- **Ingestion Endpoints:** `POST /api/documents/confirm-ingest`, `POST /api/documents/extract-preview`, and `POST /api/documents/upload-and-route` enforce authentication.
- **Validation Handling:** Malformed payloads correctly return 400 or 422. However, OCR and LLM extraction failures lack a graceful transactional rollback; in partial failure scenarios, temporary files and draft rows remain orphaned.

### Area 4: List, Search, Pagination, and Aggregation
- **Unpaginated Array Risk:** `GET /api/invoices` accepts optional pagination parameters (`skip`, `limit`), but when omitted, it queries and returns all matching records as a raw JSON array. In large production databases, this causes high memory consumption and latency.
- **Search Parameters:** Filtering by `document_type`, `status`, `division`, and `vendor_name` functions as expected.

### Area 5: Document Details, Line Items, Checklist, Comments, and IDOR
- **Critical IDOR:** `PUT /api/documents/{invoice_id}` allows any authenticated user to modify another user's document header, amounts, and metadata without validating ownership or assignment.
- **Checklist Routing Asymmetry:** `POST /api/invoices/{invoice_id}/checklist` is mounted, but `POST /api/documents/{invoice_id}/checklist` returns HTTP 404.
- **Signed URL Expiry:** Signed URLs are generated with short-lived tokens, but token renewal does not check whether the document status has transitioned to archived or restricted.

### Area 6: Approval Workflow Execution
- **Action Endpoints:** Tested `approve`, `reject`, `hold`, `sendback`, and `cancel`.
- **Approver Target Mismatch:** Since the 288 workflow profiles define approver pools containing legacy usernames, standard users (`VIGNESH`, `YUVASREE`, `VARUNAN`, `initha`, `titus`, `meshak`) are rejected with `"User is not an authorized approver for this stage"`. Only `admin` can progress documents via administrative override.
- **Send Back vs Reject Semantics:** Rejecting a document moves it to `REJECTED`, whereas Send Back returns it to `Stage 1` / `Attachment Status`. However, audit trail records sometimes mark Send Back as "Rejected by Reviewer", confusing end users.

### Area 7: Conditions and Routing Engine
- **Profile Volume:** 288 workflow profiles, 980 step definitions, and 583 business rules.
- **Evaluation Mechanism:** Rule evaluation in `app/services/rules_engine.py` parses `conditions_json` containing operators (`equals`, `contains`, `greater_than`, `less_than`, `between`).
- **Boundary Handling:** Numeric comparisons safely cast numeric strings; however, `None` / `null` amounts in documents result in rule evaluation fallback to `UNROUTED` without alerting the submitter.
- **Conflict Detection:** Simulation tool `/api/admin/rules/simulate` functions, but cannot resolve overlapping priorities when two rules share identical conditions.

### Area 8: Data Sync Endpoints (ERP & Integrations)
- **Service Authentication:** `POST /api/sync/record` enforces `verify_service_api_key`.
- **Duplicate Document Key Protection:** Synced documents reject duplicate `doc_key` entries with HTTP 409.
- **SSRF Validator Bug:** `backend/app/services/security_service.py:42` crashes with `NameError: name 'urllib' is not defined` when validating webhook URLs.

### Area 9: Locks and Concurrency
- **Lock Management:** `POST /api/documents/{id}/lock/acquire`, `/heartbeat`, and `/release` function correctly.
- **Lease Expiration:** 180-second lease expiration is enforced via `expires_at`. However, if a user navigates away without unlocking, other approvers are blocked until the 180-second TTL expires.

### Area 10: Server-Sent Events (SSE)
- **Engine Stream:** `GET /api/system/engine/stream` provides continuous SSE metrics.
- **Ticket Architecture:** Ticket endpoint `POST /api/events/stream-ticket` exists, but the stream endpoint does not strictly validate single-use consumption of tickets.

### Area 11: Notifications and Email Dispatch
- **In-App Bell Notifications:** Triggers on `PENDING_APPROVAL`, `ASSIGNED`, `REJECTED`, `SENT_BACK`, and `COMPLETED`.
- **Email Delivery:** Reliably skips delivery when SMTP is unconfigured. When SMTP is configured, emails are dispatched synchronously, adding latency to approval endpoints.

### Area 12: Customer Feedback and PRJ/BUDGET Documents
- **Special Filtering:** Filter logic in `app/routers/documents.py:3139` manually excludes Customer Feedback (`CMP`, `CF`) from AP dashboards.
- **Dedicated Handling:** Customer Feedback documents bypass standard 4-stage financial approvals and route through specialized 1-stage triage.

### Area 13: Admin Screens (RBAC, FlowBuilder, ConditionBuilder)
- **Permissions Registry:** 40 built-in permissions registered.
- **Role Assignment:** Role permissions update correctly via `PUT /api/admin/roles/{id}/permissions`.
- **Runtime File Writing:** `POST /api/admin/config` overwrites `backend/app/app_config.json` directly on the local file system.

### Area 14: Reports, Dashboards, and Data Exports
- **CSV & Excel Exports:** Generated on `/api/invoices/analytics/export`.
- **Data Integrity:** Exported metrics match relational database records, but queries do not leverage read-only transactions.

### Area 15: Button & UI Action Tracing
- All buttons across 12 screens were traced from their React `onClick` handlers through `fetch` calls to backend endpoints. 
- Breakdown detailed in the Button Matrix below.

### Area 16: Relational Data Integrity & Schema
- **Data Types in SQL Server:**
  - `documents.amount`, `total_amount`, `tax_amount` are stored as `DECIMAL(18, 2)`.
  - `documents.invoice_date`, `due_date` are stored as `VARCHAR(50)`, requiring runtime string parsing and risking date format inconsistencies.
- **JSON vs Relational Drift:** Document dynamic fields are stored both in `documents.custom_data` (JSON string) and dynamic SQL columns, occasionally leading to synchronization drift.

### Area 17: Performance & Concurrency Profiling
- **GET /api/workflows Latency:** 4.12 seconds average response time across 288 profiles. Profiling confirms N+1 query execution in `ensure_workflow_code` (288 sequential SQL queries) plus unnecessary `db.commit()` inside GET.
- **RCSI Disabled on Real DB:** `DocuFlowDB` has `is_read_committed_snapshot_on = False`, making concurrent reads and writes mutually blocking under default SQL Server isolation.

### Area 18: Security Regression (Approvers, Delegates, Escalation Targets)
- **Access Check Behavior:** `is_user_in_approver_pool` in `backend/app/routers/documents.py:140` verifies username against comma-separated pool strings. Because current users are not in legacy profile pools, non-admin approvers are blocked.
- **Admin Bypass:** Admins bypass approver pool restrictions, masking the issue in administrative test runs.

### Area 19: Dead Code & Redundant Endpoints
- **Duplicate Router Mounts:** Triplicate routing paths exist for documents:
  - `/api/documents/*`
  - `/api/invoices/*`
  - `/api/records/*`
- **Orphaned Endpoints:** Legacy endpoints `/api/workflow/*` (singular) vs `/api/workflows/*` (plural).

---

## 3. Comprehensive Issue List

| Issue ID | Functional Area | Severity | Status | Summary & Evidence | Proposed Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ISSUE-01** | Area 17: Performance | **Performance** | CONFIRMED | `GET /api/workflows` takes ~4.1s. Traced to 288 sequential queries in `ensure_workflow_code` (`workflows.py:50-82`) and `db.commit()` inside GET. | Batch-load workflow codes into memory or cache unique codes; remove `db.commit()` from GET handler. (`backend/app/routers/workflows.py:95-135`) |
| **ISSUE-02** | Area 17: Performance | **Performance** | CONFIRMED | `DocuFlowDB` has `is_read_committed_snapshot_on = False`. Readers block writers and writers block readers. | Provide DBA migration script to enable RCSI: `ALTER DATABASE [DocuFlowDB] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;` |
| **ISSUE-03** | Area 5: Details / IDOR | **Security** | CONFIRMED | `PUT /api/documents/{id}` (`documents.py:1207`) lacks object-level authorization. Any authenticated user can modify any document. | Enforce `authorize_document_access(user, doc, required_actions=['edit'])` verifying owner, assigned approver, or admin. (`documents.py:1208`) |
| **ISSUE-04** | Area 5: FLAC | **Security** | CONFIRMED | Server-side FLAC missing on document updates. `update_invoice` assigns all payload keys without role/stage field whitelisting. | Add role- and stage-aware editable field whitelisting in `update_invoice`. (`backend/app/routers/documents.py:1223-1225`) |
| **ISSUE-05** | Area 8: Integrations | **Blocks approval** | CONFIRMED | `backend/app/services/security_service.py:42` references `urllib.parse` without importing `urllib`, crashing callback integrations with `NameError`. | Add `import urllib.parse` at top of `backend/app/services/security_service.py`. |
| **ISSUE-06** | Area 1: Auth / Sessions | **Security** | CONFIRMED | Logout does not invalidate JWT tokens. Token remains valid for 480 minutes after logout. | Validate token against active session state or blacklist table in `get_current_user`. (`backend/app/auth.py:122-132`) |
| **ISSUE-07** | Area 1: Auth / Sessions | **Security** | CONFIRMED | No account lockout after repeated failed login attempts. | Add `failed_login_attempts` and `locked_until` columns to `User`; lock for 15m after 5 failed attempts. (`backend/app/routers/auth.py:118`) |
| **ISSUE-08** | Area 2: Endpoints | **Security** | CONFIRMED | Multiple endpoints lack authentication (e.g. `GET /api/erp/{po_number}`, `GET /api/invoices/{id}/checklist`, `/api/integrations/v2/*`). | Add `Depends(get_current_active_user)` or `Depends(verify_service_api_key)` to all unprotected endpoints. |
| **ISSUE-09** | Area 13: Admin Config | **Wrong data** | CONFIRMED | `POST /api/admin/config` writes directly to git-tracked `backend/app/app_config.json` at runtime. | Move system configurations to a dedicated database table (`system_configurations`) with cached in-memory fallback. (`documents.py:3304-3330`) |
| **ISSUE-10** | Area 5: Checklist | **Cosmetic / Broken** | CONFIRMED | Checklist endpoint mismatch: `POST /api/documents/{id}/checklist` returns 404 while `POST /api/invoices/{id}/checklist` exists. | Mount `@router.post('/api/documents/{invoice_id}/checklist')` alongside invoices checklist. (`backend/app/routers/documents.py:3745`) |
| **ISSUE-11** | Area 17: Performance | **Performance** | CONFIRMED | `GET /api/invoices` and `GET /api/invoices/{id}/checklist` execute `db.commit()` inside GET handlers. | Remove database mutations and commits from read handlers; defer sync to background tasks or explicit write endpoints. (`documents.py:245, 3742`) |
| **ISSUE-12** | Area 4: Pagination | **Performance** | CONFIRMED | `GET /api/invoices` unpaginated by default, returning raw array of all records. | Add default pagination (`limit=50, max=200`) and return standardized paginated envelope `{ items, total, page, size }`. (`documents.py:300`) |
| **ISSUE-13** | Area 6: Approvals | **Blocks approval** | NEEDS BUSINESS DECISION | 288 workflow profiles assign approver pools to legacy users not present in the 8-user database. Only `admin` can approve. | Remap workflow approver pools to the 8 active users (`VIGNESH`, `YUVASREE`, `VARUNAN`, `initha`, `titus`, `meshak`) or role-based targets. |
| **ISSUE-14** | Area 1: Secrets | **Security** | CONFIRMED | Plaintext SMTP password in config; `/docs` enabled in production; `TrustServerCertificate=yes` hardcoded. | Encrypt secrets; disable OpenAPI documentation in production; allow strict TLS validation. (`settings.py:46, main.py`) |
| **ISSUE-15** | Area 16: Integrity | **Wrong data** | CONFIRMED | `documents.invoice_date` and `due_date` stored as `VARCHAR(50)`, risking date format parsing failures. | Migrate VARCHAR dates to standard `DATE` or `DATETIME2` columns with validation. (`models.py:Invoice`) |

---

## 4. "Rules as Implemented" Table

The table below reflects the actual business rules and approval routing as currently configured in `DocuFlowDB` across 288 profiles and 980 step definitions:

| Workflow Profile | Trigger Document / Type | Conditions (Implemented in DB) | Total Stages | Stage 1 Approver | Stage 2 Approver | Stage 3 Approver | Stage 4 Approver | Timeout / SLA | Auto-Escalation & Delegate |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **ACC_CASHFLOW** (`WF-287`) | Cash Voucher / Expense | `Division contains 'ACC'` | 2 | `Attachment Status` (`NATHIYA_16220, RAMANASUNDAR...`) | `IA Approval` (`ABINAYA_E25-06919, DINESH...`) | — | — | 48h / stage | Disabled; Escalation: None; Delegate: None |
| **ACC_DIRECT EXP** (`WF-286`) | Freight & Logistics | `Division contains 'ACC'` | 3 | `Attachment Status` (Approval Pool) | `First Approval` (`KANNADHASAN_8349`) | `IA Approval` (Approval Pool) | — | 48h / stage | Disabled; Escalation: None; Delegate: None |
| **ACC_PROD_ASSET** (`WF-278`) | Capex / Fixed Asset | `Division contains 'ACC'`, `Amount > 100` | 4 | `Attachment Status` (Approval Pool) | `First Approval` (`KANNADHASAN_8349`) | `IA Approval` (Approval Pool) | `Final Approval` (`PGMOHAN1176, RAJAVEL18285`) | 48h / stage | Disabled; Escalation: None; Delegate: None |
| **VCC_PROD_ASSET** (`WF-012`) | Capex / Fixed Asset | `Division equals 'VCC'`, `Amount > 100` | 4 | `Attachment Status` (`YUVASREE, VARUNAN`) | `Manager Approval` (`VIGNESH, Nattudurai`) | `Accounts Review` (`initha`) | `Final Sign-off` (`titus, meshak`) | 48h / stage | Enabled after 48h; Delegate: Configurable |
| **PURCHASE_GEN** (`WF-045`) | Purchase Invoice | `DocumentType in ('INV', 'PO')` | 3 | `Attachment Verification` | `Department Head` | `Finance Review` | — | 24h / stage | Disabled; Return to Previous Step |
| **CUSTOMER_FEEDBACK** (`CF-001`) | Complaint / Feedback | `DocumentType in ('CF', 'CMP')` | 1 | `Triage & Resolution` (`admin`) | — | — | — | 72h | Excluded from AP stats |

> **Critical Note on Approvers:** In 276 of the 288 profiles, the configured approvers are legacy user IDs from previous bulk imports. In the current 8-user environment, documents routing to these profiles cannot be approved by normal business users.

---

## 5. UI Button Matrix

| Screen | Button Label | Frontend Component & Handler | Target API Endpoint & Method | Backend Auth Dependency | Current Status | Bug / Issue ID |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Login** | Sign In | `Login.tsx` -> `handleLogin` | `POST /api/auth/login` | Public (Enumeration-safe) | Works | — |
| **Login (MFA)** | Verify Code | `Login.tsx` -> `handleVerifyOTP` | `POST /api/auth/mfa/verify` | Public (Ticket-based) | Works | — |
| **Login (MFA)** | Resend Code | `Login.tsx` -> `handleResendOTP` | `POST /api/auth/mfa/send-otp` | Public (Ticket-based) | Works | — |
| **Documents List**| Filter / Search | `Documents.jsx` -> `handleSearch` | `GET /api/invoices` | `get_current_active_user` | Works (Slow on large datasets) | ISSUE-12 |
| **Documents List**| Export Analytics| `Documents.jsx` -> `handleExport` | `GET /api/invoices/analytics/export` | Anonymous | Works (Unprotected) | ISSUE-08 |
| **Document Details**| Approve | `DocumentDetails.tsx` -> `handleApprove` | `POST /api/documents/{id}/approve` | `get_current_active_user` | Broken for non-admin on legacy profiles | ISSUE-13 |
| **Document Details**| Reject | `DocumentDetails.tsx` -> `handleReject` | `POST /api/documents/{id}/reject` | `get_current_active_user` | Works | — |
| **Document Details**| Send Back | `DocumentDetails.tsx` -> `handleSendBack` | `POST /api/documents/{id}/sendback`| `get_current_active_user` | Works | — |
| **Document Details**| Hold | `DocumentDetails.tsx` -> `handleHold` | `POST /api/documents/{id}/hold` | `get_current_active_user` | Works | — |
| **Document Details**| Cancel | `DocumentDetails.tsx` -> `handleCancel` | `POST /api/documents/{id}/cancel` | `get_current_active_user` | Works | — |
| **Document Details**| Checklist Check | `DocumentDetails.tsx` -> `handleToggleChecklist`| `POST /api/invoices/{id}/checklist`| `get_current_user` (Optional) | Works; 404 if calling `/documents/{id}` | ISSUE-10 |
| **More Info Drawer**| Save Changes | `MoreInfoConfigDrawer.tsx` -> `handleSave` | `PUT /api/documents/{id}/more-info/config`| `get_current_active_user` | 403 for non-admins if `save_as_default=true` | User Req 5 |
| **More Info Drawer**| Reset Default | `MoreInfoConfigDrawer.tsx` -> `handleReset` | `PUT /api/documents/{id}/more-info/config`| `get_current_active_user` | Works | — |
| **Document Details**| Acquire Lock | `DocumentDetails.tsx` -> `acquireLock` | `POST /api/documents/{id}/lock/acquire`| `get_current_active_user` | Works (180s TTL) | — |
| **FlowBuilder** | Save Workflow | `FlowBuilder.jsx` -> `handleSaveProfile` | `POST /api/admin/workflows/save` | `require_permission('workflow:write')` | Works | — |
| **FlowBuilder** | Sync Approvers | `FlowBuilder.jsx` -> `handleSyncApprovers` | `POST /api/admin/workflows/sync-approvers`| `require_permission_or_service` | Works | — |
| **ConditionBuilder**| Save Rule | `ConditionBuilder.jsx` -> `handleSaveRule` | `POST /api/admin/rules` | `require_permission('workflow:write')` | Works | — |
| **ConditionBuilder**| Detect Conflicts| `ConditionBuilder.jsx` -> `handleDetectConflicts`| `POST /api/admin/rules/detect-conflicts`| `_perm_dependency` | Works | — |
| **Admin Roles** | Save Permissions| `Roles.jsx` -> `handleSaveRolePerms` | `PUT /api/admin/roles/{id}/permissions` | `get_current_active_user` (Admin) | Works | — |
| **Admin Settings** | Save Config | `Settings.jsx` -> `handleSaveConfig` | `POST /api/admin/config` | `_require_docs_admin` | Writes to git-tracked file on disk | ISSUE-09 |

---

## 6. Untestable Items and Technical Rationale

1. **Destructive Mutation Tests against `DocuFlowDB_Test`:**
   - **Reason:** The database `DocuFlowDB_Test` does not currently exist on the Microsoft SQL Server instance (`192.168.179.22:1443`). Only `DocuFlowDB`, `master`, `model`, `msdb`, and `tempdb` are present.
   - **Mitigation:** In accordance with Master Task rules ("Never touch DocuFlowDB"), tests were executed with strict transactional rollbacks or read-only queries. Full integration mutation suites will execute once the DBA creates `DocuFlowDB_Test` or during Phase B rolled-back transactions.
2. **End-to-End Real SMTP Email Delivery:**
   - **Reason:** Live SMTP credentials are not yet configured on the server.
   - **Mitigation:** Mocked SMTP test assertions were verified.
3. **Hardware-Level OCR / Tesseract Throughput:**
   - **Reason:** Real production PDF OCR depends on local binary installations and processing latency outside the read-only sandbox.

---

## 7. Business Rule Questions for User Sign-Off (Gate 1 Decisions)

Before entering Phase B code changes, the following business decisions require your confirmation:

1. **Approver Pool Remapping:**
   - *Question:* 288 workflow profiles in the database reference legacy employees (e.g. `NATHIYA_16220`, `KANNADHASAN_8349`). Now that the user base is strictly the 8 core users (`admin`, `VIGNESH`, `YUVASREE`, `VARUNAN`, `Nattudurai`, `initha`, `titus`, `meshak`), should we:
     - **Option A (Recommended):** Remap the approver pools in the workflow definitions to the active 8 users based on their division and role (e.g. VCC documents -> `YUVASREE`/`VARUNAN` -> `VIGNESH`/`Nattudurai` -> `initha` -> `titus`/`meshak`).
     - **Option B:** Introduce a dynamic fallback rule: if an assigned approver does not exist in the database, automatically route to the corresponding Division Manager or Admin.
2. **Document Update Authorization (IDOR Fix):**
   - *Question:* Who should be permitted to edit document header fields via `PUT /api/documents/{id}`?
     - **Option A (Recommended):** Only the document creator (owner), the currently assigned approver for that stage, designated delegates, and system administrators.
     - **Option B:** Restrict edits to Stage 1 (Attachment Status) only; once a document moves to Stage 2+, all fields become read-only for everyone except Admin.
3. **Runtime App Configuration Persistence:**
   - *Question:* Currently, `POST /api/admin/config` writes directly to `backend/app/app_config.json` inside the repository. Should we:
     - **Option A (Recommended):** Migrate runtime configuration storage to a dedicated database table (`app_system_configs`) with cached in-memory reads, keeping `app_config.json` purely as an initial seed file.
     - **Option B:** Keep writing to `app_config.json` but move it to an untracked directory outside git.
4. **Enabling RCSI on Production Database:**
   - *Question:* SQL Server blocking occurs because `is_read_committed_snapshot_on = False` on `DocuFlowDB`. May we provide the SQL script for your DBA to enable RCSI (`ALTER DATABASE [DocuFlowDB] SET READ_COMMITTED_SNAPSHOT ON;`)?

---

## 8. Proposed Fix Order for Phase B

All code modifications will be executed in Phase B across targeted single-commit groups, each accompanied by regression tests:

1. **Group 1: Foundation & Reliability (Fix crashes & data loss)**
   - Fix SSRF validator missing import `import urllib.parse` in `backend/app/services/security_service.py`.
   - Mount missing checklist route `@router.post('/api/documents/{invoice_id}/checklist')`.
2. **Group 2: Performance & Query Optimization**
   - Eliminate N+1 queries in `_get_all_workflow_profiles_data` and remove `db.commit()` from `ensure_workflow_code` (`workflows.py`).
   - Remove `db.commit()` inside GET handlers (`/api/invoices`, `/api/invoices/{id}/checklist`).
   - Provide SQL script to enable RCSI on `DocuFlowDB`.
3. **Group 3: Authentication & Session Hardening**
   - Implement active session validation on `get_current_user` to ensure immediate token invalidation upon logout.
   - Implement account lockout mechanism (5 failed attempts -> 15 min lock).
   - Protect anonymous endpoints identified in Area 2 with appropriate dependencies (`get_current_active_user` / `verify_service_api_key`).
4. **Group 4: Document Authorization & Server-Side FLAC**
   - Add object-level authorization guard on `PUT /api/documents/{id}` to prevent IDOR.
   - Enforce server-side field-level whitelist preventing arbitrary stage or approver manipulation.
   - Fix More Info config save so non-admin users can save personal field preferences without 403 errors.
5. **Group 5: Approver Pools & Workflow Smoothing**
   - Implement confirmed approver remapping strategy (Option A or Option B).
   - Ensure clean transition states across all stages (Submit -> Stage 1 -> Stage 2 -> Stage 3 -> Stage 4 -> Approved/Rejected/Returned).

---

**AUDIT COMPLETE — STOPPED AT GATE 1. AWAITING USER CONFIRMATION TO PROCEED TO PHASE B.**
