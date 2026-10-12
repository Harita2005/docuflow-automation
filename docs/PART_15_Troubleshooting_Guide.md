# PART 15: Troubleshooting Guide

This guide covers the top 15 practical failure scenarios encountered across deployment, operation, and maintenance of DocuFlow.

---

## 15.1 Diagnostic & Incident Runbook (15 Scenarios)

### Scenario 1: Backend Fails to Start with `FATAL: SERVICE_API_KEY is missing or empty`
- **Symptom**: Docker container crashes immediately upon boot with exit code 1.
- **Root Cause**: Production security guard in [`backend/app/config/settings.py`](file:///backend/app/config/settings.py#L259) (`validate_production_service_api_key`) detects `SERVICE_API_KEY` is missing or is using a known placeholder string.
- **Exact File / Function**: [`settings.py`](file:///backend/app/config/settings.py) &rarr; `validate_production_service_api_key()`
- **Step-by-Step Fix**:
  1. Open `.env`.
  2. Set `SERVICE_API_KEY` to a cryptographically random string containing at least 32 characters.
  3. Restart container: `docker-compose restart backend`.

---

### Scenario 2: Startup Fails with `FATAL: FILE_URL_SIGNING_SECRET must be distinct from SECRET_KEY`
- **Symptom**: Server startup aborts with a runtime exception.
- **Root Cause**: Cryptographic key separation guard in [`backend/app/config/settings.py`](file:///backend/app/config/settings.py#L287) detects `FILE_URL_SIGNING_SECRET == SECRET_KEY`.
- **Exact File / Function**: [`settings.py`](file:///backend/app/config/settings.py) &rarr; `validate_production_file_url_signing_secret()`
- **Step-by-Step Fix**:
  1. Generate two separate random 32+ character secrets.
  2. Assign one to `SECRET_KEY` and the second to `FILE_URL_SIGNING_SECRET`.
  3. Restart the application.

---

### Scenario 3: Database Connection Failure (`08001: SQL Server Network Interfaces: Error Locating Server`)
- **Symptom**: API endpoints return 500; health check returns `{"status": "error", "database": "disconnected"}`.
- **Root Cause**: Remote SQL Server host `192.168.179.22:1443` is unreachable over the network, firewall blocked, or SQL Browser service is stopped.
- **Exact File / Function**: [`backend/app/database/connection.py`](file:///backend/app/database/connection.py), [`backend/app/config/settings.py`](file:///backend/app/config/settings.py#L60) (`get_database_url`)
- **Diagnostic Query / Command**:
  ```powershell
  Test-NetConnection -ComputerName 192.168.179.22 -Port 1443
  ```
- **Step-by-Step Fix**:
  1. If host is offline, start local SQL Server on `localhost:1433`. The backend will automatically fall back to localhost in dev environments.
  2. If in production, verify corporate network routing to `192.168.179.22:1443`.

---

### Scenario 4: ODBC Driver Not Found (`[IM002] Data source name not found`)
- **Symptom**: Python backend throws `pyodbc.Error: ('IM002', '[IM002] [Microsoft][ODBC Driver Manager]...')`.
- **Root Cause**: Host operating system does not have Microsoft ODBC Driver 17 for SQL Server installed.
- **Step-by-Step Fix**:
  1. **Windows**: Install `msodbcsql.msi` from official Microsoft download.
  2. **Linux/Docker**: Run `apt-get install -y msodbcsql17`.

---

### Scenario 5: Approval Request Fails with `409 Conflict: Version mismatch`
- **Symptom**: Approver clicks "Approve", but UI displays "Document was modified by another user".
- **Root Cause**: Optimistic concurrency check failed because `expected_version != doc.version`. Another user or automated process updated the document.
- **Exact File / Function**: [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py#L1810) (`approve_document`)
- **Diagnostic Query**:
  ```sql
  SELECT id, document_id, status, version FROM documents WHERE id = <doc_id>;
  ```
- **Step-by-Step Fix**:
  1. Refresh the document page in the UI to fetch the latest state and version.
  2. Re-submit approval with updated `expected_version`.

---

### Scenario 6: Approval Blocked with `422 Unprocessable Entity: Next step has no approver target` (AUD-01)
- **Symptom**: User clicks "Approve" but gets an error: "Workflow configuration error: Next step has no approver target assigned."
- **Root Cause**: Workflow step definition following the current step has `approver_target` set to `NULL` or empty string.
- **Exact File / Function**: [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py#L1850)
- **Diagnostic Query**:
  ```sql
  SELECT * FROM workflow_step_definitions WHERE workflow_profile_id = <profile_id> ORDER BY step_order;
  ```
- **Step-by-Step Fix**:
  1. Navigate to **Admin &rarr; Workflow Rules**.
  2. Edit the affected workflow profile and assign a valid user or role target to the empty step.
  3. Save profile. Re-attempt approval.

---

### Scenario 7: Document Editing Blocked with `423 Locked`
- **Symptom**: Approver cannot review document; receives message: "Document is locked by User X".
- **Root Cause**: An active lease exists in `document_locks` table.
- **Exact File / Function**: [`backend/app/services/lock_service.py`](file:///backend/app/services/lock_service.py) (`DocumentLockManager`)
- **Diagnostic Query**:
  ```sql
  SELECT * FROM document_locks WHERE document_id = <doc_id>;
  ```
- **Step-by-Step Fix**:
  1. The lock automatically expires after 10 minutes via `expires_at`.
  2. Immediate unlock via API: `DELETE /api/documents/{id}/lock` (requires admin or lock owner).
  3. Database direct fix: `DELETE FROM document_locks WHERE document_id = <doc_id>;`.

---

### Scenario 8: Outbound ERP Back-Sync Marked `FAILED` or `DEAD`
- **Symptom**: Document is `APPROVED` in DocuFlow, but status is missing in the ERP. `external_sync_status` shows `FAILED` or `DEAD`.
- **Root Cause**: Webhook destination returned HTTP 5xx or timed out beyond maximum retries.
- **Exact File / Function**: [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py)
- **Diagnostic Query**:
  ```sql
  SELECT id, status, retry_count, next_retry_at, response_code, error_message 
  FROM integration_sync_logs WHERE document_id = <doc_id> ORDER BY id DESC;
  ```
- **Step-by-Step Fix**:
  1. Verify the external ERP webhook endpoint is healthy and reachable.
  2. In DocuFlow Admin, navigate to **Integrations &rarr; Sync Logs**.
  3. Click **Retry** on the failed record, or call `POST /api/integrations/logs/{id}/retry`.

---

### Scenario 9: Customer Feedback Ingested Without Auto-Attached Invoice PDF
- **Symptom**: Feedback complaint ingested, but attached invoice PDF is missing.
- **Root Cause**: No document in the `documents` table had `status == 'APPROVED'` and matching `invoice_number`.
- **Exact File / Function**: [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py) (`auto_attach_feedback_invoice`)
- **Diagnostic Query**:
  ```sql
  SELECT id, invoice_number, status, storage_path FROM documents WHERE invoice_number = '<invoice_no>';
  ```
- **Step-by-Step Fix**:
  1. If the invoice is still `PENDING`, approve the invoice document first.
  2. Run the feedback attachment linking script or update the feedback document's `storage_path`.

---

### Scenario 10: PDF Preview Broken in Web Browser
- **Symptom**: White or blank square where PDF should display in `DocumentDetails.tsx`.
- **Root Cause**: Nginx MIME type missing for PDF worker `.mjs` files or signed file URL expired.
- **Exact File / Function**: [`frontend/nginx.conf`](file:///frontend/nginx.conf#L9), [`backend/app/services/signed_file_service.py`](file:///backend/app/services/signed_file_service.py)
- **Step-by-Step Fix**:
  1. Ensure `frontend/nginx.conf` contains `types { application/javascript mjs; }`.
  2. Verify browser console: if HTTP 403, regenerate signed URL by refreshing view.

---

### Scenario 11: Signed File URL Returns `403 Forbidden` (`Signature expired`)
- **Symptom**: User clicks download or preview link and gets HTTP 403.
- **Root Cause**: Signed URL TTL has expired (default: 90 seconds).
- **Exact File / Function**: [`backend/app/services/signed_file_service.py`](file:///backend/app/services/signed_file_service.py) (`verify_signed_url`)
- **Step-by-Step Fix**:
  1. Refresh the document page in the frontend; client automatically requests fresh signed URL.
  2. If needed, increase `FILE_URL_TTL_SECONDS` in `.env` (e.g., 300 seconds).

---

### Scenario 12: User Unable to Log In Due to Missing OTP Email
- **Symptom**: Login screen requests 6-digit OTP, but user receives no email.
- **Root Cause**: SMTP credentials invalid or SMTP server blocking outgoing traffic.
- **Exact File / Function**: [`backend/app/services/otp_service.py`](file:///backend/app/services/otp_service.py)
- **Step-by-Step Fix**:
  1. In development, check `SHOW_OTP_IN_UI=true` in `.env` to display the OTP in API response.
  2. In production, check `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` in `.env`.

---

### Scenario 13: OCR Processing Times Out
- **Symptom**: Document upload hangs or returns 504 Gateway Timeout.
- **Root Cause**: `MAX_CONCURRENT_OCR` semaphore reached capacity or large multi-page PDF exceeded memory limits.
- **Exact File / Function**: [`backend/app/services/ocr_service.py`](file:///backend/app/services/ocr_service.py)
- **Step-by-Step Fix**:
  1. Check `MAX_CONCURRENT_OCR` and `OCR_SEMAPHORE_TIMEOUT` in `.env`.
  2. Restart backend to release any stuck OCR threads.

---

### Scenario 14: Document Ingested but Marked `UNROUTED`
- **Symptom**: Document appears in admin unrouted queue; no workflow profile assigned.
- **Root Cause**: None of the active `business_rules` matched the document's attributes (amount, vendor, department).
- **Exact File / Function**: [`backend/app/services/rules_engine.py`](file:///backend/app/services/rules_engine.py)
- **Step-by-Step Fix**:
  1. Go to **Admin &rarr; Policy Matrix**.
  2. Add a fallback rule with broad criteria (e.g., amount >= 0) to catch all unrouted documents.
  3. Manually assign a workflow profile to the unrouted document.

---

### Scenario 15: Inbound ERP Ingestion Returns `401 Unauthorized`
- **Symptom**: 3rd-party ERP receives HTTP 401 when pushing to `/api/sync/documents`.
- **Root Cause**: Missing or mismatched `X-Service-API-Key` header.
- **Exact File / Function**: [`backend/app/services/security_service.py`](file:///backend/app/services/security_service.py#L90)
- **Step-by-Step Fix**:
  1. Ensure the calling ERP includes HTTP header: `X-Service-API-Key: <configured_key>`.
  2. Verify that the value matches `SERVICE_API_KEY` defined in the server's `.env`.

---

**Verified against source**: [`backend/app/config/settings.py`](file:///backend/app/config/settings.py), [`backend/app/database/connection.py`](file:///backend/app/database/connection.py), [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py), [`backend/app/services/lock_service.py`](file:///backend/app/services/lock_service.py), [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py), [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py), [`backend/app/services/signed_file_service.py`](file:///backend/app/services/signed_file_service.py), [`backend/app/services/otp_service.py`](file:///backend/app/services/otp_service.py), [`backend/app/services/ocr_service.py`](file:///backend/app/services/ocr_service.py), [`backend/app/services/rules_engine.py`](file:///backend/app/services/rules_engine.py).

