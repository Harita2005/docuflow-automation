# PART 16: Testing

## 16.1 Automated Test Suite Inventory

DocuFlow maintains a comprehensive automated testing suite consisting of **17 backend Python test suites (123+ automated test functions)** executed via Pytest, and **2 frontend TypeScript test suites** executed via Vitest.

### Backend Test Files Catalog (`backend/tests/`)

| # | Test File Path | Test Count | Exact Test Scope & Verified Behaviors |
| :-: | :--- | :-: | :--- |
| 1 | [`backend/tests/test_audit_approval_fixes.py`](file:///backend/tests/test_audit_approval_fixes.py) | 17 | Verifies the core approval fixes: AUD-01 (workflow save and approval execution block when `approver_target` is empty, raising 422), AUD-02 (concurrent thread racing where second identical approval gets 409 and avoids duplicate audit log), AUD-03 (idempotent `complete_document_lifecycle`, archiving preceding back-sync), and AUD-07 (exponential retry engine and status lifecycle). |
| 2 | [`backend/tests/test_file_replacement_security.py`](file:///backend/tests/test_file_replacement_security.py) | 21 | Tests upload authorization, anonymous rejection, path traversal rejection (`..` scrubbing), magic-byte MIME validation, and file owner modification rights. |
| 3 | [`backend/tests/test_signed_document_urls.py`](file:///backend/tests/test_signed_document_urls.py) | 16 | Tests ephemeral HMAC-SHA256 signed document URLs: 401 for unauthenticated requests, 403 for unauthorized users, signature parameter tampering detection, and 90-second TTL expiration. |
| 4 | [`backend/tests/test_workflows_conditions_auth.py`](file:///backend/tests/test_workflows_conditions_auth.py) | 15 | Verifies RBAC permission guards (`WORKFLOW:CREATE`, `RULE:UPDATE`), service key isolation, and read-only user access bounds. |
| 5 | [`backend/tests/security/test_ssrf_validator.py`](file:///backend/tests/security/test_ssrf_validator.py) | 9 | Tests outbound webhook SSRF defenses: blocks loopback (`127.0.0.1`), RFC 1918 private subnets (`10.0.0.0/8`, `192.168.0.0/16`), AWS/Azure cloud metadata (`169.254.169.254`), and invalid schemes (`file://`, `ftp://`). |
| 6 | [`backend/tests/security/test_smtp_not_configured.py`](file:///backend/tests/security/test_smtp_not_configured.py) | 7 | Verifies system behavior when SMTP credentials are unset or placeholders: omits email factor from MFA challenge response, returns 503 on send attempt without corrupting database state. |
| 7 | [`backend/tests/test_rate_limiter_security.py`](file:///backend/tests/test_rate_limiter_security.py) | 7 | Tests IP rate limiter memory bucket pruning, brute-force rate limit thresholds on `/api/auth/login`, and trusted proxy header evaluation (`X-Forwarded-For`). |
| 8 | [`backend/tests/test_document_locks_security.py`](file:///backend/tests/test_document_locks_security.py) | 6 | Tests document lease locking: auth requirements, unauthorized user lock rejection, token lease duration capping, and prevention of lock release by non-owners. |
| 9 | [`backend/tests/test_sse_security.py`](file:///backend/tests/test_sse_security.py) | 6 | Tests Server-Sent Events (SSE): prohibits JWT in URL query strings, enforces single-use stream tickets, and verifies event stream permissions. |
| 10 | [`backend/tests/test_checklist_and_more_info_routes.py`](file:///backend/tests/test_checklist_and_more_info_routes.py) | 5 | Tests checklist route mounting on invoices, personal configuration persistence, and rejection of non-admin global default edits. |
| 11 | [`backend/tests/test_ocr_concurrency_security.py`](file:///backend/tests/test_ocr_concurrency_security.py) | 5 | Tests OCR concurrency bounding via `asyncio.Semaphore`, slot release on error, 503 response on queue saturation, and document upload fallback. |
| 12 | [`backend/tests/test_mfa_ticket_security.py`](file:///backend/tests/test_mfa_ticket_security.py) | 4 | Tests MFA tickets: ensures tickets are not written to public uploads, checks bcrypt hashing of OTPs in database, and blocks dotfile exposure. |
| 13 | [`backend/tests/test_database_safety_guard.py`](file:///backend/tests/test_database_safety_guard.py) | 3 | Verifies safety guard preventing tests from connecting to real production databases, and verifies test transaction rollback preservation. |
| 14 | [`backend/tests/test_devops_security.py`](file:///backend/tests/test_devops_security.py) | 3 | Verifies `/api/health` and `/health` endpoints, and ensures Uvicorn `reload` flag is disabled in production environments. |
| 15 | [`backend/tests/test_service_api_key_auth.py`](file:///backend/tests/test_service_api_key_auth.py) | 2 | Verifies `X-Service-API-Key` machine-to-machine authentication on `/api/sync/*` and validates that service keys cannot alter workflow rules. |
| 16 | [`backend/tests/test_login_enumeration_security.py`](file:///backend/tests/test_login_enumeration_security.py) | 2 | Proves that login error responses are indistinguishable between non-existent users and invalid passwords, preventing user enumeration. |
| 17 | [`backend/tests/test_unrouted_auto_remap.py`](file:///backend/tests/test_unrouted_auto_remap.py) | 1 | Tests the unrouted document lifecycle: ensures documents with no matching rule fall back to the default profile. |

### Frontend Test Files Catalog (`frontend/`)

| # | Test File Path | Test Scope |
| :-: | :--- | :--- |
| 18 | [`frontend/src/utils/formatters.test.ts`](file:///frontend/src/utils/formatters.test.ts) | Tests currency formatting (`formatCurrency`), date localization, and workflow status badge class mappings. |
| 19 | [`frontend/sample.test.ts`](file:///frontend/sample.test.ts) | Baseline Vitest DOM integration and test suite sanity check. |

---

## 16.2 Test Execution Guide

### Backend Test Execution
From the `backend` folder with your virtual environment active:
```bash
# Run all 17 backend test suites
pytest -v

# Run the core approval lifecycle & concurrency test suite
pytest -v tests/test_audit_approval_fixes.py

# Run all security test suites
pytest -v tests/test_*_security.py tests/security/

# Generate terminal code coverage report
pytest --cov=app --cov-report=term-missing tests/
```

### Frontend Test Execution
From the `frontend` folder:
```bash
# Run Vitest test runner
npm run test
```

---

## 16.3 Fixtures & Test Database Architecture

Defined in [`backend/tests/conftest.py`](file:///backend/tests/conftest.py):
- **Transactional Rollback Guard**: Each test runs within an isolated database transaction that is automatically rolled back after test completion, ensuring pristine test state across test runs.
- **`client` Fixture**: Configures FastAPI `TestClient` with mocked storage directories and in-memory test databases.
- **Pre-Configured Role Fixtures**: Generates valid bearer tokens for `admin_token`, `approver_token`, and `requester_token`.

---

**Verified against source**: [`backend/tests/test_audit_approval_fixes.py`](file:///backend/tests/test_audit_approval_fixes.py), [`backend/tests/test_file_replacement_security.py`](file:///backend/tests/test_file_replacement_security.py), [`backend/tests/test_signed_document_urls.py`](file:///backend/tests/test_signed_document_urls.py), [`backend/tests/test_workflows_conditions_auth.py`](file:///backend/tests/test_workflows_conditions_auth.py), [`backend/tests/security/test_ssrf_validator.py`](file:///backend/tests/security/test_ssrf_validator.py), [`backend/tests/security/test_smtp_not_configured.py`](file:///backend/tests/security/test_smtp_not_configured.py), [`backend/tests/test_rate_limiter_security.py`](file:///backend/tests/test_rate_limiter_security.py), [`backend/tests/test_document_locks_security.py`](file:///backend/tests/test_document_locks_security.py), [`backend/tests/test_sse_security.py`](file:///backend/tests/test_sse_security.py), [`backend/tests/test_checklist_and_more_info_routes.py`](file:///backend/tests/test_checklist_and_more_info_routes.py), [`backend/tests/test_ocr_concurrency_security.py`](file:///backend/tests/test_ocr_concurrency_security.py), [`backend/tests/test_mfa_ticket_security.py`](file:///backend/tests/test_mfa_ticket_security.py), [`backend/tests/test_database_safety_guard.py`](file:///backend/tests/test_database_safety_guard.py), [`backend/tests/test_devops_security.py`](file:///backend/tests/test_devops_security.py), [`backend/tests/test_service_api_key_auth.py`](file:///backend/tests/test_service_api_key_auth.py), [`backend/tests/test_login_enumeration_security.py`](file:///backend/tests/test_login_enumeration_security.py), [`backend/tests/test_unrouted_auto_remap.py`](file:///backend/tests/test_unrouted_auto_remap.py), [`frontend/src/utils/formatters.test.ts`](file:///frontend/src/utils/formatters.test.ts), [`frontend/sample.test.ts`](file:///frontend/sample.test.ts).
