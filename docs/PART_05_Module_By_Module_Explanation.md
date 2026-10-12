# PART 5: Module-by-Module Explanation

This document provides a comprehensive technical breakdown of every major module in the DocuFlow codebase.

---

## 5.1 Approval Flow & Document Lifecycle Module

### Purpose
Executes the document state machine: transitions documents across approval stages, manages optimistic versioning, enforces row locks, executes multi-level steps, archives documents upon final approval, and triggers outbound ERP back-sync.

### Key Files
- Router: [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py)
- Lifecycle Service: [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py#L1800-L1950) (`complete_document_lifecycle`)
- Lock Service: [`backend/app/services/lock_service.py`](file:///backend/app/services/lock_service.py) (`DocumentLockManager`)
- Escalation Service: [`backend/app/services/escalation_service.py`](file:///backend/app/services/escalation_service.py)

### Tables Used
- `documents`: Primary record, fields `status`, `version`, `current_step_id`, `workflow_profile_id`, `storage_path`, `external_sync_status`.
- `workflow_step_definitions`: Step configurations (`step_order`, `approver_target`, `is_final_step`, `sla_hours`).
- `document_locks`: Concurrency locks (`document_id`, `user_id`, `token`, `expires_at`).
- `document_approval_logs`: Historical record of approval actions (`action`, `actor_id`, `comments`, `created_at`).
- `audit_logs`: Immutable security audit log.

### APIs Used
- `POST /api/documents/{id}/approve` (also `/api/workflows/approve` and `/api/records/{id}/step-action`)
- `POST /api/documents/{id}/reject`
- `POST /api/documents/{id}/hold`
- `POST /api/documents/{id}/sendback`
- `POST /api/documents/{id}/lock` & `DELETE /api/documents/{id}/lock`

### Inputs & Outputs
- **Inputs**: Document ID, `expected_version` (integer), `comments` (string), optional dynamic form answers.
- **Outputs**: Updated document state, next step assignment, HTTP 200 OK or HTTP 409 Conflict if version mismatch.

### Step-by-Step Logic
1. **Lock Verification**: Checks `DocumentLockManager.acquire_lock()`. If leased by another user, returns HTTP 423 Locked.
2. **Version Verification**: Evaluates `expected_version`. If `expected_version != document.version`, raises HTTP 409 Conflict to prevent double-click or simultaneous approvals.
3. **Step Resolution**:
   - Queries `WorkflowStepDefinition` where `workflow_profile_id == doc.workflow_profile_id` and `step_order > current_step.step_order`.
   - **AUD-01 Guard**: If a subsequent step exists in sequence but has an empty or unconfigured `approver_target`, the system **blocks** state advancement, raises HTTP 422 Unprocessable Entity, and keeps the document at the current step (preventing accidental skipped stages).
   - If a valid next step exists, assigns `doc.current_step_id = next_step.id`, increments `doc.version += 1`, and logs the step progression.
   - If no subsequent step exists (or `is_final_step == True`), triggers `complete_document_lifecycle()`.
4. **`complete_document_lifecycle()` Sequence**:
   - Step 4a: Archives physical PDF to canonical directory `/stored_pdfs/approved/{YYYY}/{MM}/{doc_id}/`. If archiving encounters an OS failure, marks `doc.storage_path = 'PENDING_STORAGE'` while committing approval state to protect business data.
   - Step 4b: Sets `doc.status = 'APPROVED'` and increments `doc.version += 1`.
   - Step 4c: Triggers `trigger_async_integration_push()` to push status to external ERP.
   - Step 4d: Dispatches notifications and writes immutable `AuditLog` row.
5. **Lock Release**: Releases the document lock upon transaction completion.

### Edge Cases & Fragile Areas
- **Maker-Checker Policy Violation** ([`documents.py#L1830-L1868`](file:///backend/app/routers/documents.py)): The creator or submitter of a document cannot approve their own document. Checks creator ID, employee ID, and initial audit log handles, returning HTTP 403 Forbidden on violation.
- **Duplicate Approval Prevention** ([`documents.py#L1869-L1880`](file:///backend/app/routers/documents.py)): A user who has already approved an invoice in an earlier step cannot approve it again in a subsequent step (returns HTTP 400).
- **Physical Attachment Compulsory** ([`documents.py#L1916-L1950`](file:///backend/app/routers/documents.py)): For non-feedback documents at Stage 1, a physical PDF file must exist on disk with `file_size > 0` before approval can proceed (returns HTTP 400).
- **Simultaneous Approvals**: Mitigated by optimistic locking (`expected_version`) and database-level row checks returning HTTP 409 Conflict.
- **Unreachable Approver**: Handled by supervisor override (`/api/documents/{id}/override-approve`) which enforces RBAC `OVERRIDE_APPROVE` and logs the override event.

---

## 5.2 Workflow Routing & Business Rules Engine Module

### Purpose
Evaluates document attributes (e.g., invoice amount, vendor code, department, customer type) against configured rules to dynamically route documents to specific workflow profiles or trigger Straight-Through Processing (STP).

### Key Files
- Service: [`backend/app/services/rules_engine.py`](file:///backend/app/services/rules_engine.py) (`RulesEngine`)
- Routers: [`backend/app/routers/workflows.py`](file:///backend/app/routers/workflows.py), [`backend/app/routers/conditions.py`](file:///backend/app/routers/conditions.py)

### Tables Used
- `business_rules`: Stores rule definitions (`priority`, `rule_type`, `workflow_profile_id`, `conditions_json`, `is_active`).
- `workflow_profiles`: Header definitions for workflows (`code`, `name`, `document_type`, `is_active`).
- `workflow_step_definitions`: Sequential steps within a profile.

### Step-by-Step Logic
1. When a document is ingested or re-routed, `RulesEngine.evaluate_workflow(db, document)` is invoked.
2. Active business rules matching `document.document_type` are fetched, sorted deterministically by `priority.desc()`, then `id.asc()`.
3. Conditions inside `conditions_json` are evaluated against document fields using supported operators:
   - Numerical: `=`, `!=`, `>`, `>=`, `<`, `<=`
   - String: `equals`, `contains`, `starts_with`, `in`, `not_in`
   - Presence: `is_empty`, `is_not_empty`
4. The first rule whose conditions all evaluate to `True` wins.
5. If the winning rule is flagged as `STP` (Straight-Through Processing), the document skips human review and is immediately approved.
6. If no rule matches, the document is assigned to a default fallback profile or marked `UNROUTED` for administrator intervention.

### Fragile / Risky Areas
- In-flight documents: Modifying a workflow profile definition while documents are currently pending in its steps could orphan documents if a step ID is deleted. The backend implements validation blocking step deletion if active documents reference `current_step_id`.

---

## 5.3 Data Ingestion & Inbound Sync Module

### Purpose
Receives financial and operational documents from third-party ERPs, SAP, or automation tools via REST APIs and batch Excel imports.

### Key Files
- Router: [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py)
- Excel Ingestion: [`backend/app/services/excel_trigger_service.py`](file:///backend/app/services/excel_trigger_service.py)
- Auto-Attachment Engine: [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py#L350-L420)

### Tables Used
- `documents`: Stores header fields, metadata JSON, external IDs, and raw payloads.
- `document_line_items`: Line-item breakdown (PO number, item code, quantity, unit price, tax).

### Key Features & Inbound Logic
1. **Authentication**: All `/api/sync/*` endpoints require the header `X-Service-API-Key: <SERVICE_API_KEY>`.
2. **Payload Parsing**: Accepts JSON metadata, embedded base64 file payloads, or multipart uploads.
3. **Customer Feedback Auto-Attachment**:
   - When a record of type `CUSTOMER_FEEDBACK` or `FEEDBACK` is ingested, it contains a reference `invoice_number` in its feedback fields.
   - The sync engine automatically queries the `documents` table for an existing approved document where `invoice_number == feedback.invoice_number` and `status == 'APPROVED'`.
   - If found, it automatically links and attaches the approved invoice's PDF file path to the feedback ticket, allowing customer service reviewers to inspect the original invoice immediately without manual searching.

### Fragile Areas
- Large base64 payloads: High memory consumption if hundreds of megabytes are ingested concurrently. The system sets request size limits (50MB) via Nginx and streaming file parsers.

---

## 5.4 Outbound Integrations & ERP Back-Sync Module

### Purpose
Pushes document status changes (Approval, Rejection, Return) back to third-party ERP webhooks, ensuring bidirectional synchronization with exponential backoff retries.

### Key Files
- Service: [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py)
- Callback Dispatcher: [`backend/app/services/callback_service.py`](file:///backend/app/services/callback_service.py)
- Admin Router: [`backend/app/routers/integrations.py`](file:///backend/app/routers/integrations.py)

### Tables Used
- `third_party_webhook_configs`: Webhook endpoints, target URLs, encrypted secret tokens, retry policies.
- `integration_sync_logs`: Tracks every outbound push attempt (`status`, `payload`, `response_code`, `retry_count`, `next_retry_at`, `error_message`).

### Retry Engine Logic
1. When an outbound webhook call fails (network timeout, ERP returns 5xx), the attempt is recorded with `status = 'FAILED'`, `retry_count = 1`, and `next_retry_at = now() + 60s`.
2. The background worker `process_pending_sync_retries()` runs periodically, fetching rows where `status IN ('PENDING', 'FAILED')` and `next_retry_at <= now()`.
3. Backoff intervals: 1 minute &rarr; 5 minutes &rarr; 15 minutes &rarr; 1 hour.
4. After maximum retries (default: 5) are exhausted, status is permanently set to `DEAD` or `NEEDS_ATTENTION`.
5. Administrators can view failed syncs in the UI and trigger manual retries via `POST /api/integrations/logs/{id}/retry`.

---

## 5.5 Authentication, MFA & RBAC Module

### Purpose
Manages user authentication, session security, multi-factor authentication (MFA), Azure Active Directory SSO, and granular role-based permissions.

### Key Files
- Router: [`backend/app/routers/auth.py`](file:///backend/app/routers/auth.py), [`backend/app/routers/users.py`](file:///backend/app/routers/users.py), [`backend/app/routers/roles.py`](file:///backend/app/routers/roles.py)
- MFA Service: [`backend/app/services/mfa_service.py`](file:///backend/app/services/mfa_service.py)
- RBAC Service: [`backend/app/services/rbac_service.py`](file:///backend/app/services/rbac_service.py)
- Security Service: [`backend/app/services/security_service.py`](file:///backend/app/services/security_service.py)

### Authentication Flow
1. **Password Verification**: Local credentials verified with `bcrypt`.
2. **MFA Enforcement**: If `user.mfa_enabled == True`, returns a short-lived MFA challenge ticket (`mfa_ticket`, TTL 5 minutes) instead of an access token.
3. **MFA Verification**: User submits TOTP code or email/SMS OTP to `/api/auth/mfa/verify`.
4. **JWT Issuance**: Upon successful verification, issues an HMAC-SHA256 JWT containing `sub` (user_id), `role`, `division_id`, and `exp`.

---

## 5.6 Dynamic Checklists & More-Info Module

### Purpose
Allows workflow steps to require structured questionnaires, checklist validation, or conditional field requests ("More Info") before approval can be granted.

### Key Files
- Router: [`backend/app/routers/more_info.py`](file:///backend/app/routers/more_info.py)
- Models: `ChecklistTemplate`, `ChecklistRule`, `DocumentChecklistState`

### Logic
- Checklists can be defined globally or tied to specific workflow steps.
- When an approver requests "More Info", the document status changes to `MORE_INFO_REQUESTED`, routing back to the initiator with mandatory input fields.
- Initiator submits responses, automatically restoring document to `PENDING` for the approver.

---

**Verified against source**: [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py), [`backend/app/services/rules_engine.py`](file:///backend/app/services/rules_engine.py), [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py), [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py), [`backend/app/routers/auth.py`](file:///backend/app/routers/auth.py), [`backend/app/routers/more_info.py`](file:///backend/app/routers/more_info.py), [`backend/app/services/lock_service.py`](file:///backend/app/services/lock_service.py).

