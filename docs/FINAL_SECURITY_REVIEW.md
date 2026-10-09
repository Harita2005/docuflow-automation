# DocuFlow Automation — Final Security Review & Independent Re-Verification

**Date of Verification:** 2026-10-09  
**Branch:** `security-hardening`  
**Commit Range Evaluated:** `454c5df` through `348bfcb`  
**Evaluation Nature:** Read-Only Source Code Audit, Automated Endpoint Matrix & Static Analysis  

---

## 1. Executive Summary

An independent, evidence-based security verification was performed across the entire application after completing Security Hardening Items 0 through 6. The review evaluated every architectural domain: authentication, object-level authorization (BOLA/IDOR), file security, third-party integrations, database integrity, rate limiting, transport security, containerization, and frontend defenses.

### Verification Status by Domain

| Domain | Section | Status | Key Findings |
| :--- | :---: | :---: | :--- |
| **Baseline & Dependencies** | `0` | **FAIL** | Clean dependencies (0 npm/pip audit CVEs), but test suite mutates local database in place (no rollback fixture), causing test pollution. |
| **Endpoint Access Matrix** | `A` | **FAIL** | 238 routes cataloged; 8 private API routes accessible anonymously without credentials; Swagger `/docs` enabled in production. |
| **Authentication & Sessions** | `B` | **FAIL** | Generic 401 login errors verified; OTP masking verified; but account-level brute-force lockout is missing, and `/api/auth/logout` does not invalidate active JWTs. |
| **Object-Level Authorization** | `C` | **FAIL** | Locks, SSE, and file replacement are hardened; but `PUT /api/documents/{id}` lacks object-level authorization (IDOR), and FLAC is not enforced server-side. |
| **File Security & Signed URLs** | `D` | **PASS** | Static mounts removed; HMAC-SHA256 signed URLs strictly verified; path traversal, dotfiles, and active PDF scripts (`/JavaScript`, `/Launch`) blocked. |
| **Service & ERP Integrations** | `E` | **FAIL** | Service keys strictly scoped to `data:sync`; but SSRF module crashes on missing `import urllib.parse`, and runtime `ALTER TABLE` in `sync.py` creates DoS risks. |
| **Database & SQL Security** | `F` | **FAIL** | Parameterized queries prevent SQL injection; but connection string sets `TrustServerCertificate=yes`, and SMTP password is stored in plaintext. |
| **Performance & Indexing** | `G` | **FAIL** | OCR concurrency semaphore verified; but `GET /api/invoices` lacks pagination (`.all()`), contains N+1 queries, and executes `db.commit()` writes in GET handlers. |
| **Rate Limiting & Abuse** | `H` | **FAIL** | Proxy-aware IP extraction verified; but state is stored entirely in single-process memory, making multi-worker / clustered deployment unsafe. |
| **Transport, Headers & Docker** | `I` | **PASS** | Non-root container (`appuser`), HEALTHCHECK, `reload=False` in production, and standard security headers (`nosniff`, HSTS, XFO) verified. |
| **Secrets & Logging** | `J` | **FAIL** | Detailed audit trails verified; but default placeholder service keys and database credentials exist in repository history and must be rotated. |
| **Frontend Security** | `K` | **PASS** | No `dangerouslySetInnerHTML` sinks found; PDF iframes sandboxed; token stored in `localStorage` with standard client-side routing. |

---

## 2. Table of Previous Audit Findings

Status Legend:
- **FIXED and VERIFIED**: Code changes inspected in the tree and confirmed via passing automated tests or manual code trace.
- **FIXED BUT UNTESTED**: Remediation code exists, but cannot execute in this environment (e.g. requires live SQL Server instance or Docker daemon).
- **NOT FIXED**: Identified vulnerability still present in the application codebase.

| # | Previous Finding | Previous Severity | Current Status | Evidence & Verification Notes |
| :-: | :--- | :-: | :---: | :--- |
| **0.1** | Static mounts `/uploads` and `/stored_pdfs` directly exposed | Critical | **FIXED and VERIFIED** | Static mounts removed from `backend/app/main.py`. `test_signed_document_urls.py` passes 15/15 checks. Direct URLs return 404. |
| **0.2** | JWT passed in query string (`?token=...`) for file viewing | High | **FIXED and VERIFIED** | Removed query parameter JWTs across frontend (`DocumentDetails.tsx`, `CustomerFeedbackDetails.tsx`). Replaced with HMAC signed URL endpoints. |
| **0.3** | Plaintext OTP stored in disk ticket cache | Critical | **FIXED and VERIFIED** | `mfa_service.py:168` hashes OTP using SHA-256 before writing to in-memory tickets or disk cache. Plaintext OTP is never persisted. |
| **0.4** | OTP leaked in server console and terminal output | High | **FIXED and VERIFIED** | `SHOW_OTP_IN_UI=False` in `settings.py`; print statements removed from `auth.py`. |
| **1.1** | Unauthenticated Document Locks (`/api/documents/{id}/lock/*`) | High | **FIXED and VERIFIED** | `events.py:348-435` enforces `get_current_active_user`, validates document division/approver access, binds locks to `user.id`, and caps lease duration to 15–300s. |
| **2.1** | SSE Stream (`/api/events/stream`) unauthenticated or token in URL | Critical | **FIXED and VERIFIED** | `events.py:220-330` rejects JWT in query params (HTTP 400), supports `Authorization` header or 30s single-use stream tickets (`POST /api/events/stream-ticket`), and filters events by document access. |
| **3.1** | User enumeration on login (distinct errors for missing/inactive) | Medium | **FIXED and VERIFIED** | `auth.py:136,160,186` returns uniform HTTP 401 `{"detail": "Invalid username or password"}` for unknown users, wrong passwords, and deactivated accounts. |
| **4.1** | Uvicorn `reload=True` active regardless of environment | Medium | **FIXED and VERIFIED** | `backend/run.py:9-17` sets `reload=False` when `ENVIRONMENT=production`. `test_devops_security.py` passes. |
| **4.2** | Docker container runs as `root` without healthcheck | High | **FIXED and VERIFIED** | `backend/Dockerfile:25-40` creates non-root user `appuser` (UID 10001), adds `HEALTHCHECK` with curl to `/api/health`. |
| **4.3** | Hardcoded database password and IP in `docker-compose.yml` | High | **FIXED and VERIFIED** | `docker-compose.yml:11-20` stripped hardcoded passwords; now requires `.env` variables (`${DB_HOST}`, `${DB_PASSWORD}`). |
| **5.1** | Synchronous OCR/LLM extraction blocks event loop | High | **FIXED and VERIFIED** | `documents.py:2710` offloads extraction via `run_in_threadpool` and gates concurrent processing with `asyncio.Semaphore(settings.MAX_CONCURRENT_OCR)`. |
| **6.1** | Object-level authorization missing on file replacement / re-routing | High | **FIXED and VERIFIED** | `documents.py:2885,3041` enforces `check_document_owner_or_assigned(current_user, inv, db)`. Display-name matching removed; strictly matches unique `id`, `employee_id`, `username`. |
| **6.2** | User-isolated staging previews (`temp-preview/{filename}`) | High | **FIXED and VERIFIED** | `documents.py:2410-2440` binds preview uploads to `TEMP_STAGE_U{user.id}_...`. Tested and verified that cross-user preview reading and filename forging are rejected. |
| **A.1** | Admin role list exposed to unauthenticated callers | High | **NOT FIXED** | `roles.py:433` uses `Depends(get_current_user_optional)`. Anonymous requests to `GET /api/admin/roles` return HTTP 200 with full RBAC role and permission catalogues. |
| **A.2** | More Info field catalogues exposed anonymously | Medium | **NOT FIXED** | `more_info.py:825,1390` exposes document field configurations and sample database queries without requiring authentication (returns HTTP 200). |
| **A.3** | ERP PO details exposed anonymously | High | **NOT FIXED** | `documents.py:3578` (`GET /api/erp/{po_number}`) has no auth dependency; returns vendor and amount for any PO from the real invoices table. |
| **A.4** | In-app notification routes unauthenticated | Medium | **NOT FIXED** | `documents.py:3260,3280,3290` allow anonymous callers to read notifications (HTTP 200 `[]`) and mark arbitrary notification IDs as read without auth. |
| **B.1** | Account-level brute-force lockout missing | High | **NOT FIXED** | `auth.py:61-186` only tracks login failures in access logs. No counter exists on `User` to lock accounts after consecutive invalid password attempts. |
| **B.2** | Tokens not revoked upon logout | High | **NOT FIXED** | `auth.py:550` sets `user.active_session_id = None`, but `get_current_user` in `auth.py:93-142` does not validate `active_session_id` against the JWT. Tokens remain valid until expiry (480 min). |
| **C.1** | IDOR on document modification (`PUT /api/documents/{id}`) | Critical | **NOT FIXED** | `documents.py:1207` accepts `user: Optional[User]` but performs no division, ownership, or approver check before updating invoice fields. Any user can modify any document. |
| **C.2** | Field-level access control (FLAC) enforced only on frontend | Medium | **NOT FIXED** | `documents.py:1074` returns all document table columns in the API response. Restricted fields are hidden in the React UI but visible in raw network payloads. |
| **E.1** | SSRF validation crashes due to missing import | High | **NOT FIXED** | `security_service.py:42` calls `urllib.parse.urlparse`, but `urllib` is not imported. Calling outbound webhook validation raises `NameError`. |
| **E.2** | Runtime `ALTER TABLE` DDL executed during sync | High | **NOT FIXED** | `sync.py:176,183` dynamically executes `ALTER TABLE dbo.documents ADD [{col_name}]` during data sync HTTP requests. Risk of table schema locking and column limit exhaustion (max 1024). |
| **F.1** | Database connection disables TLS certificate verification | Medium | **NOT FIXED** | `settings.py:46,70` sets `DB_TRUST_SERVER_CERTIFICATE = True` (`TrustServerCertificate=yes`), exposing database traffic to MitM. |
| **F.2** | Plaintext SMTP password in database | High | **NOT FIXED** | `notification_provider_config.encrypted_password` stores the SMTP password in plaintext despite its column name. |
| **G.1** | Unbounded queries and N+1 database queries on list endpoints | High | **NOT FIXED** | `GET /api/invoices` and `GET /api/work-tracker` load all records via `.all()` without pagination, then execute `sync_document_approver_from_workflow` per record. |
| **G.2** | Database writes (`db.commit()`) executed inside GET handlers | Medium | **NOT FIXED** | `sync_document_approver_from_workflow` is called during `GET /api/invoices` and executes `db.commit()` on the database. |
| **H.1** | Multi-worker and multi-instance concurrency unsafe | High | **NOT FIXED** | Rate limiter, document locks, SSE tickets, and OCR semaphores reside in single-process Python memory; running multiple workers creates state partitioning. |
| **I.1** | OpenAPI and Swagger docs exposed in production | Medium | **NOT FIXED** | `main.py:129-134` does not disable `docs_url`, `redoc_url`, or `openapi_url` when `ENVIRONMENT=production`. |

---

## 3. Prioritized Remaining Issues

### Critical Severity

#### 1. IDOR / Missing Object-Level Authorization on Document Update (`PUT /api/documents/{invoice_id}`)
- **Evidence:** `backend/app/routers/documents.py:1204-1236`
- **Description:** The `update_invoice` endpoint (`PUT /api/documents/{invoice_id}`, `PUT /api/records/{invoice_id}`, `PUT /api/invoices/{invoice_id}`) validates that the user is authenticated, but **never checks whether the user owns the document, belongs to the document's division, or is assigned to review it**. Any authenticated employee can issue a PUT request to update core fields on any document in the system.
- **Recommended Fix:** Add `authorize_document_access(user, inv)` and `check_document_owner_or_assigned(user, inv, db)` before applying updates in `update_invoice`.

---

### High Severity

#### 2. Stateless Logout / Extended Token Lifetime Without Server-Side Revocation
- **Evidence:** `backend/app/auth.py:110-142`, `backend/app/routers/auth.py:550-569`, `backend/app/config/settings.py:80`
- **Description:** Tokens have a lifetime of 480 minutes (8 hours). When `/api/auth/logout` is called, it clears `user.active_session_id` in the database, but `get_current_user()` in `auth.py` **never verifies the session ID against the database or a token blacklist**. A compromised JWT remains usable for up to 8 hours after logout.
- **Recommended Fix:** Implement Item 7: issue short-lived access tokens (15m) and rotating refresh tokens with session validation against `user.active_session_id`.

#### 3. Missing Account-Level Brute-Force Lockout
- **Evidence:** `backend/app/routers/auth.py:61-186`
- **Description:** Login attempts are rate-limited solely by IP address in `RateLimiterMiddleware`. There is no tracking of failed attempts per user account. An attacker using distributed IP addresses or proxy services can execute credential stuffing attacks without triggering IP-based rate limits.
- **Recommended Fix:** Add `failed_login_attempts: int` and `locked_until: datetime` to the `User` model; lock accounts for 15 minutes after 5 consecutive failed attempts.

#### 4. SSRF Validation Crash on Missing `urllib.parse` Import
- **Evidence:** `backend/app/services/security_service.py:42`
- **Command Output:** `NameError: name 'urllib' is not defined`
- **Description:** Outbound webhook and callback validation calls `validate_and_reconstruct_url()`, which invokes `urllib.parse.urlparse()`. However, `urllib` is not imported at the top of `security_service.py`. Any callback test or execution raises an unhandled `NameError`.
- **Recommended Fix:** Add `import urllib.parse` at the top of `backend/app/services/security_service.py`.

#### 5. Unauthenticated Administrative and Information-Leaking Endpoints
- **Evidence:**
  - `backend/app/routers/roles.py:433` (`GET /api/admin/roles` returns 200 anonymously)
  - `backend/app/routers/documents.py:3578` (`GET /api/erp/{po_number}` returns 200 anonymously)
  - `backend/app/routers/more_info.py:825,1390` (field configuration endpoints return 200 anonymously)
  - `backend/app/routers/documents.py:3280` (`PUT /api/notifications/{notification_id}/read` modifies notification status anonymously)
- **Recommended Fix:** Replace `get_current_user_optional` with `get_current_active_user` and add RBAC permission checks on all role, ERP, more-info, and notification endpoints.

#### 6. Runtime Schema Alteration (`ALTER TABLE`) in Data Sync
- **Evidence:** `backend/app/routers/sync.py:176,183`
- **Description:** During incoming data synchronization, unmapped payload fields trigger `ALTER TABLE dbo.documents ADD [{col_name}] {sql_type}`. While column names are sanitized, an adversary sending requests with arbitrary field names can exhaust SQL Server's 1,024 column limit or acquire exclusive table locks that stall production operations.
- **Recommended Fix:** Deprecate dynamic column creation. Store extensible/custom attributes in the existing `custom_data` JSON column or `core.document_metadata` key-value table.

#### 7. Plaintext SMTP Password in Database Table
- **Evidence:** `backend/app/routers/documents.py:3435-3446`, `backend/app/routers/auth.py:330`
- **Description:** The `notification_provider_config` table contains a column named `encrypted_password`, but user input from the admin UI is stored directly as plaintext.
- **Recommended Fix:** Encrypt SMTP credentials at rest using AES-GCM (Fernet or PyCryptodome) with a key derived from `SECRET_KEY`.

#### 8. In-Memory State Breaks Multi-Worker / Multi-Instance Deployments
- **Evidence:**
  - `app/services/security_middleware.py:117` (`auth_requests` dict)
  - `app/services/lock_service.py:37` (`_locks` dict)
  - `app/services/ocr_service.py:37` (`asyncio.Semaphore`)
  - `app/routers/events.py:31,82` (`_tickets` dict, `_active_listeners` set)
- **Description:** All locks, rate limiting windows, SSE stream tickets, active listeners, and concurrency semaphores are held in single-process Python memory. When running under multiple Uvicorn/Gunicorn workers or across multiple server containers, requests hitting different workers will fail authorization or encounter desynchronized state.
- **Recommended Fix:** Migrate rate limiting, distributed document locking, and SSE ticket validation to a centralized Redis cache.

---

### Medium Severity

#### 9. Production Swagger / OpenAPI Schema Exposure
- **Evidence:** `backend/app/main.py:129-134`
- **Description:** `/docs`, `/redoc`, and `/api/openapi.json` are enabled by default and are not conditionally disabled when `ENVIRONMENT=production`. This exposes the entire API surface and data models to unauthenticated network reconnaissance.
- **Recommended Fix:** Set `docs_url=None`, `redoc_url=None`, and `openapi_url=None` when `settings.ENVIRONMENT.lower() in ("production", "prod")`.

#### 10. Database Connection Disables TLS Certificate Verification
- **Evidence:** `backend/app/config/settings.py:46,70`
- **Description:** Database connection strings append `TrustServerCertificate=yes` when `DB_TRUST_SERVER_CERTIFICATE = True`. In an intranet environment, this permits machine-in-the-middle attacks on the database connection.
- **Recommended Fix:** Supply CA certificates to the container and set `TrustServerCertificate=no` in production.

#### 11. Unbounded Queries and Database Mutations Inside GET Handlers
- **Evidence:** `backend/app/routers/documents.py:803,837,245`
- **Description:** `GET /api/invoices` executes `.all()` without database pagination. In the loop, it invokes `sync_document_approver_from_workflow`, which executes N+1 database queries and calls `db.commit()` inside an HTTP GET handler.
- **Recommended Fix:** Implement mandatory `limit` and `offset` pagination; move approver synchronization out of GET requests and into workflow transition events.

#### 12. Field-Level Access Control (FLAC) Enforced Only on Client
- **Evidence:** `backend/app/routers/documents.py:1163-1172`, `backend/app/routers/documents.py:3343`
- **Description:** The FLAC configuration is fetched by the client, which hides fields in the UI. However, `GET /api/documents/{id}` returns all columns and `custom_data` fields directly from the database table.
- **Recommended Fix:** Implement server-side response filtering in `get_invoice_by_id` based on the caller's role and the configured FLAC matrix.

#### 13. Test Suite Lacks Isolation and Mutates Shared Database
- **Evidence:** `backend/tests/test_mfa_ticket_security.py:39`, `backend/tests/test_rate_limiter_security.py:150`
- **Description:** Automated tests write directly to `SessionLocal()` without transactional rollbacks. During execution, test runs deactivated and deleted `User.id == 1`, contaminating the database and causing subsequent tests to fail with 403 Forbidden.
- **Recommended Fix:** Implement a pytest fixture that wraps each test in a database transaction and rolls it back upon teardown, or use an isolated SQLite test database.

---

### Low Severity

#### 14. Hardcoded Fallback IP in Settings
- **Evidence:** `backend/app/config/settings.py:59` (`192.168.179.22:1443`)
- **Description:** While `docker-compose.yml` was cleaned up, `settings.py` still contains a hardcoded fallback IP `192.168.179.22` if `DB_HOST` is omitted.
- **Recommended Fix:** Require `DB_HOST` to be explicitly provided in production and raise a configuration error if absent.

#### 15. Default Service Key Placeholder in Settings
- **Evidence:** `backend/app/config/settings.py:78`
- **Description:** `SERVICE_API_KEY` defaults to `"DocuFlow-M2M-Integration-Secret-2026"`. While production startup validation blocks this key in production mode, having it as a default in source code risks accidental usage in non-production environments.
- **Recommended Fix:** Leave default empty (`""`) and require explicit configuration.

---

## 4. Go / No-Go Statements

### (a) Internal Intranet Production: **CONDITIONAL GO**
The application is **acceptable for internal intranet production** provided the following conditions are met:
1. **Single-Worker Mode:** The backend must be run as a single Uvicorn process (1 worker) due to in-memory locking, rate limiting, and SSE ticket state.
2. **P0 Hotfix:** Apply the authorization check on `PUT /api/documents/{invoice_id}` (Item 1 above) to prevent IDOR among internal employees.
3. **SSRF Fix:** Add `import urllib.parse` to `security_service.py`.
4. **Environment Secrets:** Supply strong, randomly generated values for `SECRET_KEY`, `FILE_URL_SIGNING_SECRET`, and `SERVICE_API_KEY` in `.env`.

### (b) Internet Exposure: **NO-GO**
The application **MUST NOT be exposed to the public Internet** in its current state. The following blockers must be remediated prior to Internet deployment:
1. **Public Information Disclosure:** Disable `/docs`, `/redoc`, and `/api/openapi.json` in production mode.
2. **Authentication Gaps:** Implement account-level brute-force lockout (Item 3) and server-side token revocation on logout (Item 2).
3. **Route Hardening:** Enforce authentication on currently unauthenticated routes (`/api/admin/roles`, `/api/erp/{po_number}`, `/api/notifications`).
4. **DDOS/DoS Mitigation:** Eliminate runtime `ALTER TABLE` in `sync.py` and enforce pagination on list endpoints.

### (c) Multi-Worker or Multi-Instance Deployment: **NO-GO**
The application **CANNOT run safely with multiple Uvicorn workers or across multiple container instances**:
- Document locks (`lock_manager`), SSE single-use tickets (`stream_ticket_manager`), sliding-window rate limiters, active SSE queues, and OCR semaphores are held in Python memory.
- Running multiple processes will cause intermittent 401s on SSE connections, concurrent lock collisions, and bypassing of rate limits.
- **Prerequisite for Multi-Worker:** Migrate all shared state (locks, rate limits, SSE tickets) to an external Redis instance.

---

## 5. Scope & Limitations of Testing

The following items could not be validated in this environment and require operational testing on dedicated infrastructure:

| Scope Item | Reason Not Fully Testable | Recommended Verification Action |
| :--- | :--- | :--- |
| **Live SQL Server Stored Procedures** | Local environment uses development database; production stored procedures (e.g., `sp_GetApprovalCallbackPayload`) are not present on local machine. | Run ERP callback tests on staging SQL Server instance. |
| **Docker Engine & Container Build** | The host machine lacks an active Docker daemon (`docker compose` cannot execute locally). | Execute `docker compose build` and verify container healthcheck on the target Linux host. |
| **Email (SMTP) Live Delivery** | Strict SMTP verification requires live connectivity to Office 365 (`smtp.office365.com:587`), which cannot be established from this offline environment. | Dispatch test email using the `/api/admin/notifications/test` endpoint on staging. |
| **High-Concurrency Load Testing** | Running load generators (k6/Locust) with 100 concurrent users requires a multi-threaded load testing environment and live database server. | Execute k6 script from `loadtests/` against staging cluster. |

---

## 6. Secrets & Credentials Requiring Rotation

The following credentials appear in repository commits, configuration files, or database tables and **must be immediately rotated** before production launch:

1. **`SERVICE_API_KEY`**: Default key `"DocuFlow-M2M-Integration-Secret-2026"` is present in git history and codebase defaults. Generate a 64-character random string for `.env`.
2. **`SECRET_KEY`**: JWT signing secret in local `.env` must be replaced with a freshly generated secret (`openssl rand -hex 32`).
3. **`FILE_URL_SIGNING_SECRET`**: Must be generated independently from `SECRET_KEY` with at least 32 random characters.
4. **Database Credentials (`DB_PASSWORD`)**: The SQL Server password in local `.env` should be rotated on the database server.
5. **SMTP Password (`Sqlalerts@ramrajcotton.net`)**: Present in plaintext in the local database table `notification_provider_config`. The Office 365 account password should be updated, and stored using encryption at rest.

---

## 7. Concluding Questions & Recommendations

1. **Would you like us to proceed directly with Item 7 (Refresh Tokens with Session Binding)?**  
   Implementing Item 7 will resolve the stateless logout issue, shorten access token lifetimes from 480 minutes to 15 minutes, and bind sessions to `active_session_id`.
2. **Should we implement the critical IDOR fix for `PUT /api/documents/{id}` before starting Item 7?**  
   This requires adding `authorize_document_access` and `check_document_owner_or_assigned` to `update_invoice` in `documents.py`.
3. **Do you plan to deploy Redis for multi-worker support, or will the production deployment run with a single worker per host?**  
   If Redis is available in your production environment, we can provide a patch to externalize locks, SSE tickets, and rate limiting to Redis.
