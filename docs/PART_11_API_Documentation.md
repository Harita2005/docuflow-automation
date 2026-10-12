# PART 11: API Documentation

This document provides the complete, exhaustive catalog of all **249 REST API endpoints and route aliases** defined across [`backend/app/routers/`](file:///backend/app/routers/).

## 11.1 Global Standards & Security Headers

- **Base Path**: `/api` (or `/m2m` for direct machine integrations)
- **Authentication Headers**:
  - User Session: `Authorization: Bearer <JWT_ACCESS_TOKEN>`
  - Machine / ERP Ingestion: `X-Service-API-Key: <SERVICE_API_KEY>`
  - Webhook Delivery Signature: `X-DocuFlow-Signature: sha256=<HMAC_HEX>`
- **Standard Response Format**: JSON
- **Rate Limiting**: Enforced via `RateLimiterMiddleware` (120 req/min general, 10 req/min auth).

## 11.2 Authentication & SSO (/api/auth, /m2m/auth) (10 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/login` | `login_get_info` | `None` | `None` | Endpoint handler |
| `POST` | `/api/auth/login` | `login` | `None` | `background_tasks, req` | Endpoint handler |
| `POST` | `/api/auth/logout` | `logout` | `current_user:get_current_user` | `req` | Endpoint handler |
| `GET` | `/api/auth/me` | `get_me` | `current_user:get_current_user` | `None` | Endpoint handler |
| `POST` | `/api/auth/mfa/send-otp` | `send_otp` | `None` | `None` | Endpoint handler |
| `POST` | `/api/auth/mfa/setup-totp` | `setup_totp` | `None` | `None` | Endpoint handler |
| `POST` | `/api/auth/mfa/verify` | `verify_mfa` | `None` | `req` | Endpoint handler |
| `GET` | `/api/auth/token` | `login_get_info` | `None` | `None` | Endpoint handler |
| `POST` | `/api/auth/token` | `login` | `None` | `background_tasks, req` | Endpoint handler |
| `POST` | `/m2m/auth/login` | `m2m_login` | `None` | `body` | Endpoint handler |

---

## 11.3 Document Management & Review (/api/documents, /api/records, /api/invoices, /api/v1) (79 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | `root` | `None` | `None` | Endpoint handler |
| `DELETE` | `/api/categories/{category_name}` | `delete_category_endpoint` | `current_user:get_current_active_user` | `category_name` | Endpoint handler |
| `GET` | `/api/document-types/{document_type}/available-fields` | `get_document_type_available_fields` | `current_user:get_current_active_user` | `document_type` | Returns available fields catalogue for a given document type. |
| `GET` | `/api/document-types/{document_type}/more-info/config` | `get_doc_type_more_info_config` | `current_user:get_current_user_optional` | `document_type` | Endpoint handler |
| `PUT` | `/api/document-types/{document_type}/more-info/config` | `save_doc_type_more_info_config` | `current_user:get_current_active_user` | `document_type, payload` | Endpoint handler |
| `GET` | `/api/documents` | `get_all_invoices` | `current_user:get_current_active_user` | `status` | Endpoint handler |
| `GET` | `/api/documents/approved` | `get_approved_invoices` | `current_user:get_current_active_user` | `year, month, date, from_date, to_date` | Endpoint handler |
| `GET` | `/api/documents/approved/filter-options` | `get_filter_options` | `current_user:get_current_active_user` | `document_type, year, month` | Return dynamic cascading filter options strictly based on actual approved records in the database. |
| `POST` | `/api/documents/compress-pdf` | `compress_pdf_standalone` | `current_user:get_current_active_user` | `file` | Standalone PDF Auto-Compress Endpoint: |
| `POST` | `/api/documents/confirm-ingest` | `confirm_and_ingest_document` | `current_user:get_current_active_user` | `temp_file_id, file, vendor_name, invoice_number, invoice_date` | Path A Stage 3: Human Verification Confirmed -> Ingestion -> Condition Engine -> Routing. |
| `POST` | `/api/documents/extract-preview` | `extract_document_preview` | `current_user:get_current_active_user` | `file` | Path A Stage 1: Document Upload -> OCR -> LLM Data Extraction. |
| `GET` | `/api/documents/filter-options` | `get_filter_options` | `current_user:get_current_active_user` | `document_type, year, month` | Return dynamic cascading filter options strictly based on actual approved records in the database. |
| `GET` | `/api/documents/synced-pending` | `get_synced_pending_documents` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/documents/temp-preview/{filename}` | `serve_temp_preview` | `current_user:get_current_user_optional` | `filename, token` | Secure preview streaming of temporarily staged PDF/image during human verification and feedback review. |
| `POST` | `/api/documents/trigger-workflow/excel` | `trigger_workflow_from_excel` | `current_user:get_current_active_user` | `file` | Excel-driven Workflow Trigger Engine: |
| `POST` | `/api/documents/upload` | `upload_document` | `current_user:get_current_active_user` | `file, division, plant, document_type, workflow_profile` | Endpoint handler |
| `POST` | `/api/documents/upload-and-route/{synced_doc_id}` | `upload_and_route` | `current_user:get_current_active_user` | `synced_doc_id, file, document_type, vendorName, invoiceNumber` | Endpoint handler |
| `GET` | `/api/documents/work-tracker` | `get_work_tracker_documents` | `current_user:get_current_active_user` | `status` | Work Tracker endpoint: Returns strictly IN-PROGRESS, non-terminal documents. |
| `GET` | `/api/documents/{document_id}/more-info/config` | `get_document_more_info_config` | `current_user:get_current_user_optional` | `document_id` | Retrieves the effective More Info field configuration for a given document. |
| `PUT` | `/api/documents/{document_id}/more-info/config` | `save_document_more_info_config` | `current_user:get_current_active_user` | `document_id, payload` | Saves More Info field configuration for a document type via document_id. |
| `GET` | `/api/documents/{id}/comments` | `get_document_comments` | `current_user:get_current_active_user` | `id` | Endpoint handler |
| `POST` | `/api/documents/{id}/comments` | `add_document_comment` | `current_user:get_current_active_user` | `id, payload` | Endpoint handler |
| `GET` | `/api/documents/{id}/versions` | `get_document_versions` | `current_user:get_current_active_user` | `id` | Endpoint handler |
| `GET` | `/api/documents/{invoice_id}` | `get_invoice_by_id` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `PUT` | `/api/documents/{invoice_id}` | `update_invoice` | `user:get_current_active_user` | `invoice_id, payload, req` | Endpoint handler |
| `POST` | `/api/documents/{invoice_id}/approve` | `approve_invoice_url` | `user:get_current_active_user` | `invoice_id, action, payload` | Endpoint handler |
| `GET` | `/api/documents/{invoice_id}/file` | `stream_document_file` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `POST` | `/api/documents/{invoice_id}/hold` | `hold_invoice_url` | `user:get_current_user` | `invoice_id, action, payload` | Endpoint handler |
| `POST` | `/api/documents/{invoice_id}/lock/acquire` | `acquire_document_lock` | `current_user:get_current_active_user` | `invoice_id, payload` | Acquires an exclusive review lock on a document for the current authenticated user. |
| `POST` | `/api/documents/{invoice_id}/lock/heartbeat` | `renew_document_lock` | `current_user:get_current_active_user` | `invoice_id, payload` | Renews the active review lock lease for the authenticated user. |
| `POST` | `/api/documents/{invoice_id}/lock/release` | `release_document_lock` | `current_user:get_current_active_user` | `invoice_id, payload` | Releases the review lock on a document. |
| `GET` | `/api/documents/{invoice_id}/lock/status` | `get_document_lock_status` | `current_user:get_current_active_user` | `invoice_id` | Gets the current lock status of a document for the authenticated user. |
| `POST` | `/api/documents/{invoice_id}/reject` | `reject_invoice_url` | `user:get_current_user` | `invoice_id, action, payload` | Endpoint handler |
| `GET` | `/api/documents/{invoice_id}/signed-url` | `get_document_signed_url` | `current_user:get_current_active_user` | `invoice_id, disp` | Endpoint handler |
| `POST` | `/api/documents/{invoice_id}/step-action` | `invoice_step_action` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |
| `POST` | `/api/documents/{invoice_id}/version` | `upload_invoice_version` | `current_user:get_current_active_user` | `invoice_id, file` | Endpoint handler |
| `GET` | `/api/files/signed/{document_id}` | `serve_signed_document_file` | `None` | `document_id, expires, sig, uid, disp` | Endpoint handler |
| `GET` | `/api/invoices` | `get_all_invoices` | `current_user:get_current_active_user` | `status` | Endpoint handler |
| `GET` | `/api/invoices/approved` | `get_approved_invoices` | `current_user:get_current_active_user` | `year, month, date, from_date, to_date` | Endpoint handler |
| `POST` | `/api/invoices/compress-pdf` | `compress_pdf_standalone` | `current_user:get_current_active_user` | `file` | Standalone PDF Auto-Compress Endpoint: |
| `GET` | `/api/invoices/synced-pending` | `get_synced_pending_documents` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/invoices/work-tracker` | `get_work_tracker_documents` | `current_user:get_current_active_user` | `status` | Work Tracker endpoint: Returns strictly IN-PROGRESS, non-terminal documents. |
| `GET` | `/api/invoices/{document_id}/more-info/config` | `get_document_more_info_config` | `current_user:get_current_user_optional` | `document_id` | Retrieves the effective More Info field configuration for a given document. |
| `PUT` | `/api/invoices/{document_id}/more-info/config` | `save_document_more_info_config` | `current_user:get_current_active_user` | `document_id, payload` | Saves More Info field configuration for a document type via document_id. |
| `POST` | `/api/invoices/{id}/comments` | `add_document_comment` | `current_user:get_current_active_user` | `id, payload` | Endpoint handler |
| `GET` | `/api/invoices/{id}/versions` | `get_document_versions` | `current_user:get_current_active_user` | `id` | Endpoint handler |
| `GET` | `/api/invoices/{invoice_id}` | `get_invoice_by_id` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `PUT` | `/api/invoices/{invoice_id}` | `update_invoice` | `user:get_current_active_user` | `invoice_id, payload, req` | Endpoint handler |
| `POST` | `/api/invoices/{invoice_id}/approve` | `approve_invoice_url` | `user:get_current_active_user` | `invoice_id, action, payload` | Endpoint handler |
| `POST` | `/api/invoices/{invoice_id}/cancel` | `workflow_cancel_route` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |
| `GET` | `/api/invoices/{invoice_id}/file` | `stream_document_file` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `POST` | `/api/invoices/{invoice_id}/hold` | `hold_invoice_url` | `user:get_current_user` | `invoice_id, action, payload` | Endpoint handler |
| `POST` | `/api/invoices/{invoice_id}/lock/acquire` | `acquire_document_lock` | `current_user:get_current_active_user` | `invoice_id, payload` | Acquires an exclusive review lock on a document for the current authenticated user. |
| `POST` | `/api/invoices/{invoice_id}/lock/heartbeat` | `renew_document_lock` | `current_user:get_current_active_user` | `invoice_id, payload` | Renews the active review lock lease for the authenticated user. |
| `POST` | `/api/invoices/{invoice_id}/lock/release` | `release_document_lock` | `current_user:get_current_active_user` | `invoice_id, payload` | Releases the review lock on a document. |
| `GET` | `/api/invoices/{invoice_id}/lock/status` | `get_document_lock_status` | `current_user:get_current_active_user` | `invoice_id` | Gets the current lock status of a document for the authenticated user. |
| `POST` | `/api/invoices/{invoice_id}/reject` | `reject_invoice_url` | `user:get_current_user` | `invoice_id, action, payload` | Endpoint handler |
| `POST` | `/api/invoices/{invoice_id}/step-action` | `invoice_step_action` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |
| `POST` | `/api/invoices/{invoice_id}/version` | `upload_invoice_version` | `current_user:get_current_active_user` | `invoice_id, file` | Endpoint handler |
| `GET` | `/api/records` | `get_all_invoices` | `current_user:get_current_active_user` | `status` | Endpoint handler |
| `GET` | `/api/records/approved` | `get_approved_invoices` | `current_user:get_current_active_user` | `year, month, date, from_date, to_date` | Endpoint handler |
| `GET` | `/api/records/approved/filter-options` | `get_filter_options` | `current_user:get_current_active_user` | `document_type, year, month` | Return dynamic cascading filter options strictly based on actual approved records in the database. |
| `POST` | `/api/records/compress-pdf` | `compress_pdf_standalone` | `current_user:get_current_active_user` | `file` | Standalone PDF Auto-Compress Endpoint: |
| `GET` | `/api/records/synced-pending` | `get_synced_pending_documents` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/records/work-tracker` | `get_work_tracker_documents` | `current_user:get_current_active_user` | `status` | Work Tracker endpoint: Returns strictly IN-PROGRESS, non-terminal documents. |
| `GET` | `/api/records/{id}/comments` | `get_document_comments` | `current_user:get_current_active_user` | `id` | Endpoint handler |
| `POST` | `/api/records/{id}/comments` | `add_document_comment` | `current_user:get_current_active_user` | `id, payload` | Endpoint handler |
| `GET` | `/api/records/{id}/versions` | `get_document_versions` | `current_user:get_current_active_user` | `id` | Endpoint handler |
| `GET` | `/api/records/{invoice_id}` | `get_invoice_by_id` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `PUT` | `/api/records/{invoice_id}` | `update_invoice` | `user:get_current_active_user` | `invoice_id, payload, req` | Endpoint handler |
| `POST` | `/api/records/{invoice_id}/approve` | `approve_invoice_url` | `user:get_current_active_user` | `invoice_id, action, payload` | Endpoint handler |
| `POST` | `/api/records/{invoice_id}/cancel` | `workflow_cancel_route` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |
| `GET` | `/api/records/{invoice_id}/file` | `stream_document_file` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `POST` | `/api/records/{invoice_id}/hold` | `hold_invoice_url` | `user:get_current_user` | `invoice_id, action, payload` | Endpoint handler |
| `POST` | `/api/records/{invoice_id}/reject` | `reject_invoice_url` | `user:get_current_user` | `invoice_id, action, payload` | Endpoint handler |
| `POST` | `/api/records/{invoice_id}/step-action` | `invoice_step_action` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |
| `POST` | `/api/records/{invoice_id}/version` | `upload_invoice_version` | `current_user:get_current_active_user` | `invoice_id, file` | Endpoint handler |
| `GET` | `/api/templates` | `get_templates` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/v1/approved-documents` | `get_approved_documents` | `current_user:get_current_active_user` | `None` | Dedicated endpoint for demo & 3rd-party integration reading: |

---

## 11.4 ERP Inbound & Batch Sync (/api/sync, /m2m/record, /api/erp) (17 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/erp/{po_number}` | `get_erp_po_details` | `current_user:get_current_active_user` | `po_number` | Endpoint handler |
| `POST` | `/api/sync/attachment/base64` | `sync_attachment_base64` | `api_key:verify_service_api_key` | `payload` | Base64 encoded attachment synchronizer for JSON-only enterprise ESB pipelines (SAP PI/PO, MuleSoft, WebMethods). |
| `POST` | `/api/sync/attachment/upload` | `sync_attachment_upload` | `api_key:verify_service_api_key` | `file, doc_key, record_id, invoice_id, attachment_type` | Multipart file attachment synchronization. |
| `POST` | `/api/sync/batch` | `sync_batch_documents` | `api_key:verify_service_api_key` | `payload` | High-throughput bulk synchronization endpoint for scheduled ERP batch cron jobs (up to 500 records per call). |
| `POST` | `/api/sync/cancel` | `cancel_synced_document` | `api_key:verify_service_api_key` | `record_id, payload` | Endpoint handler |
| `POST` | `/api/sync/document` | `sync_single_document` | `api_key:verify_service_api_key` | `payload` | Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally. |
| `POST` | `/api/sync/documents` | `sync_single_document` | `api_key:verify_service_api_key` | `payload` | Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally. |
| `POST` | `/api/sync/invoice` | `sync_single_document` | `api_key:verify_service_api_key` | `payload` | Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally. |
| `POST` | `/api/sync/invoices` | `sync_single_document` | `api_key:verify_service_api_key` | `payload` | Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally. |
| `POST` | `/api/sync/invoices/batch` | `sync_batch_documents` | `api_key:verify_service_api_key` | `payload` | High-throughput bulk synchronization endpoint for scheduled ERP batch cron jobs (up to 500 records per call). |
| `POST` | `/api/sync/record` | `sync_single_document` | `api_key:verify_service_api_key` | `payload` | Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally. |
| `POST` | `/api/sync/record/{record_id}/attachment` | `sync_record_attachment_by_pk` | `api_key:verify_service_api_key` | `record_id, file, attachment_type, uploaded_by` | Synchronizes a binary attachment to a record identified by its primary key (id). |
| `POST` | `/api/sync/record/{record_id}/attachment/base64` | `sync_record_attachment_by_pk_base64` | `api_key:verify_service_api_key` | `record_id, payload` | Synchronizes a Base64-encoded attachment to a record identified by its primary key (id). |
| `POST` | `/api/sync/record/{record_id}/cancel` | `cancel_synced_document` | `api_key:verify_service_api_key` | `record_id, payload` | Endpoint handler |
| `POST` | `/api/sync/records` | `sync_single_document` | `api_key:verify_service_api_key` | `payload` | Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally. |
| `POST` | `/api/sync/records/batch` | `sync_batch_documents` | `api_key:verify_service_api_key` | `payload` | High-throughput bulk synchronization endpoint for scheduled ERP batch cron jobs (up to 500 records per call). |
| `POST` | `/m2m/record` | `ingest_record` | `_:verify_m2m_token` | `payload` | Endpoint handler |

---

## 11.5 Workflow & Step Definitions (/api/workflows, /api/workflow) (15 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/workflow/approve` | `workflow_approve_payload` | `user:get_current_active_user` | `payload` | Endpoint handler |
| `POST` | `/api/workflow/hold` | `workflow_hold_payload` | `user:get_current_user` | `payload` | Endpoint handler |
| `POST` | `/api/workflow/reject` | `workflow_reject_payload` | `user:get_current_user` | `payload` | Endpoint handler |
| `POST` | `/api/workflow/sendback` | `workflow_sendback_payload` | `user:get_current_user` | `payload` | Endpoint handler |
| `GET` | `/api/workflows` | `get_all_workflow_profiles` | `_auth:get_current_user_or_service_key` | `None` | Endpoint handler |
| `POST` | `/api/workflows/approve` | `workflow_approve_payload` | `user:get_current_active_user` | `payload` | Endpoint handler |
| `POST` | `/api/workflows/cancel` | `workflow_cancel_route` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |
| `POST` | `/api/workflows/hold` | `workflow_hold_payload` | `user:get_current_user` | `payload` | Endpoint handler |
| `DELETE` | `/api/workflows/profiles/{profile_name}` | `delete_workflow_profile` | `current_user:get_current_active_user` | `profile_name` | Endpoint handler |
| `POST` | `/api/workflows/reject` | `workflow_reject_payload` | `user:get_current_user` | `payload` | Endpoint handler |
| `POST` | `/api/workflows/sendback` | `workflow_sendback_payload` | `user:get_current_user` | `payload` | Endpoint handler |
| `POST` | `/api/workflows/{invoice_id}/escalate` | `execute_invoice_escalation` | `current_user:get_current_active_user` | `invoice_id, payload` | Endpoint handler |
| `GET` | `/api/workflows/{invoice_id}/escalate-check` | `check_invoice_escalation_status` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `DELETE` | `/api/workflows/{profile_name}` | `delete_workflow_profile` | `current_user:get_current_active_user` | `profile_name` | Endpoint handler |
| `GET` | `/api/workflows/{profile_name}` | `get_single_workflow_profile_user` | `_auth:get_current_user_or_service_key` | `profile_name` | Endpoint handler |

---

## 11.6 Business Rules & Conditions (/api/conditions) (2 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/conditions` | `get_business_rules` | `_auth:get_current_user_or_service_key` | `None` | Endpoint handler |
| `POST` | `/api/conditions` | `save_business_rule` | `current_user:dependency` | `payload` | Endpoint handler |

---

## 11.7 Checklists & More-Info (/api/checklist-templates, /api/invoices/*/checklist) (10 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/checklist-rules` | `get_checklist_templates` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/checklist-rules` | `save_checklist_template` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `DELETE` | `/api/admin/checklist-rules/{rule_id}` | `delete_checklist_template` | `current_user:get_current_active_user` | `rule_id` | Endpoint handler |
| `GET` | `/api/checklist-templates` | `get_checklist_templates` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/checklist-templates` | `save_checklist_template` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `DELETE` | `/api/checklist-templates/{rule_id}` | `delete_checklist_template` | `current_user:get_current_active_user` | `rule_id` | Endpoint handler |
| `GET` | `/api/documents/{invoice_id}/checklist` | `get_invoice_checklist` | `current_user:get_current_active_user` | `invoice_id, stage_num, stage_name` | Endpoint handler |
| `POST` | `/api/documents/{invoice_id}/checklist` | `update_invoice_checklist` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |
| `GET` | `/api/invoices/{invoice_id}/checklist` | `get_invoice_checklist` | `current_user:get_current_active_user` | `invoice_id, stage_num, stage_name` | Endpoint handler |
| `POST` | `/api/invoices/{invoice_id}/checklist` | `update_invoice_checklist` | `user:get_current_user` | `invoice_id, payload` | Endpoint handler |

---

## 11.8 Integrations & Webhooks (/api/integrations) (32 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/integrations/documents/{document_id}/retry-push` | `retry_document_push` | `current_user:get_current_active_user` | `document_id, background_tasks` | Manually re-triggers outgoing webhook push for a specific document. |
| `GET` | `/api/integrations/failed-syncs` | `get_failed_sync_documents` | `current_user:get_current_active_user` | `limit` | Returns documents that failed or are pending external synchronization. |
| `GET` | `/api/integrations/sync-logs` | `get_integration_sync_logs` | `current_user:get_current_active_user` | `limit` | Returns recent integration sync logs (both PUSH and PULL) for system auditing. |
| `GET` | `/api/integrations/v1/approved-documents` | `get_approved_documents` | `_auth:verify_service_api_key` | `division, plant, sync_status, since, limit` | [PULL API] Polling endpoint for SAP, Oracle, Tally, or external ERPs to query newly approved documents. |
| `GET` | `/api/integrations/v1/documents/{document_id}` | `get_single_document_export` | `_auth:verify_service_api_key` | `document_id` | [PULL API] Fetches full serialized export details for a single document. |
| `POST` | `/api/integrations/v1/documents/{document_id}/acknowledge` | `acknowledge_document_sync` | `_auth:verify_service_api_key` | `document_id, body` | [PULL API] Called by 3rd-party ERP after successfully ingesting the document. |
| `GET` | `/api/integrations/v1/documents/{document_id}/download-pdf` | `download_approved_document_pdf` | `_auth:verify_service_api_key` | `document_id` | [PULL API] Streams the physical or stamped PDF of the approved document directly to 3rd-party systems. |
| `POST` | `/api/integrations/v1/documents/{document_id}/retry-push` | `retry_document_push` | `current_user:get_current_active_user` | `document_id, background_tasks` | Manually re-triggers outgoing webhook push for a specific document. |
| `GET` | `/api/integrations/v1/failed-syncs` | `get_failed_sync_documents` | `current_user:get_current_active_user` | `limit` | Returns documents that failed or are pending external synchronization. |
| `GET` | `/api/integrations/v1/sync-logs` | `get_integration_sync_logs` | `current_user:get_current_active_user` | `limit` | Returns recent integration sync logs (both PUSH and PULL) for system auditing. |
| `GET` | `/api/integrations/v1/webhook-config` | `get_webhook_config` | `current_user:get_current_active_user` | `None` | Returns current outbound webhook configuration with masked secrets. |
| `POST` | `/api/integrations/v1/webhook-config` | `save_webhook_config` | `current_user:get_current_active_user` | `body` | Creates or updates the outbound webhook endpoint for real-time pushing. |
| `POST` | `/api/integrations/v1/webhook-test` | `test_webhook_connection` | `current_user:get_current_active_user` | `body` | Sends a test ping event to the target webhook URL to verify network connectivity and authentication. |
| `GET` | `/api/integrations/v2/applications` | `list_applications` | `_require_callback_admin` | `None` | Returns list of configured third-party applications with rule counts and last activity. |
| `POST` | `/api/integrations/v2/applications` | `create_application` | `_require_callback_admin` | `body` | Creates a new third-party application configuration. |
| `DELETE` | `/api/integrations/v2/applications/{app_id}` | `delete_application` | `_require_callback_admin` | `app_id` | Endpoint handler |
| `GET` | `/api/integrations/v2/applications/{app_id}` | `get_application` | `_require_callback_admin` | `app_id` | Endpoint handler |
| `PUT` | `/api/integrations/v2/applications/{app_id}` | `update_application` | `_require_callback_admin` | `app_id, body` | Endpoint handler |
| `POST` | `/api/integrations/v2/applications/{app_id}/toggle-status` | `toggle_application_status` | `_require_callback_admin` | `app_id` | Endpoint handler |
| `GET` | `/api/integrations/v2/audit-history` | `get_audit_history` | `_require_callback_admin` | `limit` | Returns configuration change audit history for integration settings. |
| `GET` | `/api/integrations/v2/logs` | `list_integration_logs` | `_require_callback_admin` | `application_id, rule_id, status_filter, decision, search` | Returns real-time CallbackEvent logs for auditing and monitoring. |
| `POST` | `/api/integrations/v2/logs/bulk-retry` | `bulk_retry_failed_callbacks` | `_require_callback_admin` | `None` | Bulk re-dispatches all failed callback events using idempotency safety. |
| `GET` | `/api/integrations/v2/logs/{event_id}` | `get_integration_log_detail` | `_require_callback_admin` | `event_id` | Returns detailed information for a specific CallbackEvent including all retry attempts. |
| `POST` | `/api/integrations/v2/logs/{event_id}/retry` | `manual_retry_callback` | `_require_callback_admin` | `event_id` | Manually retries a failed or pending callback event using the EXACT SAME event_id for idempotency safety. |
| `GET` | `/api/integrations/v2/rules` | `list_callback_rules` | `_require_callback_admin` | `application_id` | Lists all configured callback rules. |
| `POST` | `/api/integrations/v2/rules` | `create_callback_rule` | `_require_callback_admin` | `body` | Endpoint handler |
| `DELETE` | `/api/integrations/v2/rules/{rule_id}` | `delete_callback_rule` | `_require_callback_admin` | `rule_id` | Endpoint handler |
| `GET` | `/api/integrations/v2/rules/{rule_id}` | `get_callback_rule` | `_require_callback_admin` | `rule_id` | Endpoint handler |
| `PUT` | `/api/integrations/v2/rules/{rule_id}` | `update_callback_rule` | `_require_callback_admin` | `rule_id, body` | Endpoint handler |
| `POST` | `/api/integrations/v2/rules/{rule_id}/duplicate` | `duplicate_callback_rule` | `_require_callback_admin` | `rule_id` | Endpoint handler |
| `POST` | `/api/integrations/v2/rules/{rule_id}/toggle-status` | `toggle_rule_status` | `_require_callback_admin` | `rule_id` | Endpoint handler |
| `POST` | `/api/integrations/v2/test` | `execute_test_callback` | `_require_callback_admin` | `body` | Executes a test callback against a real or sample endpoint without modifying database rules. |

---

## 11.9 User Administration & RBAC (/api/users, /api/admin) (69 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/approved-documents` | `get_approved_documents` | `current_user:get_current_active_user` | `None` | Dedicated endpoint for demo & 3rd-party integration reading: |
| `GET` | `/api/admin/audit-logs` | `get_audit_logs` | `current_user:get_current_active_user` | `invoice_id, include_expired` | Endpoint handler |
| `POST` | `/api/admin/audit-logs/cleanup` | `manual_cleanup_logs` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/admin/audit-logs/retention` | `get_retention_status` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/audit-logs/retention` | `update_retention_status` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `GET` | `/api/admin/backup/history` | `get_admin_backup_history` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/backup/trigger` | `trigger_admin_backup` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `DELETE` | `/api/admin/categories/{category_name}` | `delete_category_endpoint` | `current_user:get_current_active_user` | `category_name` | Endpoint handler |
| `GET` | `/api/admin/conditions` | `get_business_rules_admin` | `_auth:_perm_dependency` | `None` | Endpoint handler |
| `POST` | `/api/admin/conditions` | `save_business_rule` | `current_user:dependency` | `payload` | Endpoint handler |
| `POST` | `/api/admin/conditions/save` | `save_business_rule` | `current_user:dependency` | `payload` | Endpoint handler |
| `DELETE` | `/api/admin/conditions/{rule_id}` | `delete_business_rule` | `current_user:dependency` | `rule_id` | Endpoint handler |
| `GET` | `/api/admin/config` | `get_admin_config` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/config` | `post_admin_config` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `POST` | `/api/admin/documents/remap-unrouted` | `trigger_unrouted_documents_remap` | `current_user:get_current_active_user` | `None` | Manually triggers evaluation and re-mapping of all unrouted documents against active business rules. |
| `GET` | `/api/admin/erp-master` | `get_admin_erp_master` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/erp-master` | `post_admin_erp_master` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `POST` | `/api/admin/erp-master/bulk` | `post_admin_erp_master_bulk` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `DELETE` | `/api/admin/erp-master/{po}` | `delete_admin_erp_master` | `current_user:get_current_active_user` | `po` | Endpoint handler |
| `GET` | `/api/admin/notifications/inapp-config` | `get_admin_notifications_inapp_config` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/notifications/inapp-config` | `save_admin_notifications_inapp_config` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/admin/notifications/inapp-config/` | `get_admin_notifications_inapp_config` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/notifications/inapp-config/` | `save_admin_notifications_inapp_config` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/admin/notifications/provider` | `get_admin_notifications_provider` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/notifications/provider` | `save_admin_notifications_provider` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `GET` | `/api/admin/notifications/raci` | `get_admin_notifications_raci` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `POST` | `/api/admin/notifications/raci` | `save_admin_notifications_raci` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `POST` | `/api/admin/notifications/test` | `test_admin_notifications_smtp` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `GET` | `/api/admin/permissions` | `get_all_permissions` | `get_current_active_user, current_user:get_current_active_user` | `module, is_active, is_custom, include_legacy` | List all system and custom permissions with filtering. |
| `POST` | `/api/admin/permissions` | `create_custom_permission` | `get_current_active_user, current_user:get_current_active_user` | `payload` | Creates a new custom permission. |
| `GET` | `/api/admin/permissions/registry` | `get_permissions_registry` | `get_current_active_user, current_user:get_current_active_user` | `None` | Returns application-registered Modules, Subpages, Actions, and Scopes dynamically from the permissions table. |
| `DELETE` | `/api/admin/permissions/{permission_id}` | `delete_custom_permission` | `get_current_active_user, current_user:get_current_active_user` | `permission_id` | Deletes a custom permission only if it is unused (not assigned to any role). |
| `PUT` | `/api/admin/permissions/{permission_id}` | `update_custom_permission` | `get_current_active_user, current_user:get_current_active_user` | `permission_id, payload` | Updates display metadata of a custom permission. |
| `PUT` | `/api/admin/permissions/{permission_id}/toggle-active` | `toggle_permission_active` | `get_current_active_user, current_user:get_current_active_user` | `permission_id` | Toggles is_active status of a permission. |
| `POST` | `/api/admin/publish` | `publish_configurations` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `GET` | `/api/admin/recycle-bin` | `get_admin_recycle_bin` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `GET` | `/api/admin/roles` | `get_all_roles` | `get_current_active_user, current_user:get_current_active_user` | `None` | List all roles and their assigned permissions for application RBAC mapping. |
| `POST` | `/api/admin/roles` | `create_role` | `get_current_active_user, current_user:get_current_active_user` | `payload` | Create a new role and optionally assign initial permissions. |
| `PUT` | `/api/admin/roles/{role_id}/permissions` | `update_role_permissions` | `get_current_active_user, current_user:get_current_active_user` | `role_id, payload` | Update permissions assigned to a role. |
| `GET` | `/api/admin/routing-rules` | `get_business_rules_admin` | `_auth:_perm_dependency` | `None` | Endpoint handler |
| `POST` | `/api/admin/routing-rules` | `save_business_rule` | `current_user:dependency` | `payload` | Endpoint handler |
| `DELETE` | `/api/admin/routing-rules/{rule_id}` | `delete_business_rule` | `current_user:dependency` | `rule_id` | Endpoint handler |
| `GET` | `/api/admin/rules/conflicts` | `detect_conflicts_endpoint` | `_auth:_perm_dependency` | `payload` | Detects duplicate condition signatures, priority ties, and shadowed rules across the Policy Matrix. |
| `POST` | `/api/admin/rules/detect-conflicts` | `detect_conflicts_endpoint` | `_auth:_perm_dependency` | `payload` | Detects duplicate condition signatures, priority ties, and shadowed rules across the Policy Matrix. |
| `POST` | `/api/admin/rules/simulate` | `simulate_rule_routing` | `_auth:_perm_dependency` | `payload` | Simulation sandbox for Policy Matrix rules. |
| `GET` | `/api/admin/users` | `get_users` | `current_user:get_current_active_user` | `include_inactive, role, search` | Endpoint handler |
| `POST` | `/api/admin/users` | `create_user_master` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `DELETE` | `/api/admin/users/{user_id}` | `delete_user` | `current_user:get_current_active_user` | `user_id` | Endpoint handler |
| `PUT` | `/api/admin/users/{user_id}` | `update_user_master` | `current_user:get_current_active_user` | `user_id, payload` | Endpoint handler |
| `PATCH` | `/api/admin/users/{user_id}/status` | `toggle_user_status` | `current_user:get_current_active_user` | `user_id, payload` | Endpoint handler |
| `POST` | `/api/admin/users/{user_id}/unlock` | `unlock_user` | `current_user:get_current_active_user` | `user_id` | SEC-10 Admin Account Unlock: |
| `GET` | `/api/admin/workflow-steps` | `get_workflow_steps` | `_auth:_perm_dependency` | `None` | Endpoint handler |
| `POST` | `/api/admin/workflow-steps` | `save_workflow_step` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `DELETE` | `/api/admin/workflow-steps/{step_id}` | `delete_workflow_step` | `current_user:get_current_active_user` | `step_id` | Endpoint handler |
| `GET` | `/api/admin/workflows` | `get_all_workflow_profiles_admin` | `_auth:_perm_dependency` | `None` | Endpoint handler |
| `POST` | `/api/admin/workflows` | `save_workflow_profile` | `current_user:dependency` | `payload` | Endpoint handler |
| `POST` | `/api/admin/workflows/save` | `save_workflow_profile` | `current_user:dependency` | `payload` | Endpoint handler |
| `GET` | `/api/admin/workflows/stuck-documents` | `list_documents_stuck_with_inactive_approver` | `current_user:get_current_active_user` | `None` | List documents stuck at an in-progress workflow stage because their assigned approver |
| `POST` | `/api/admin/workflows/sync-approvers` | `sync_all_workflow_approvers` | `_auth:_perm_dependency` | `None` | Endpoint handler |
| `POST` | `/api/admin/workflows/{invoice_id}/fallback-reassign` | `fallback_reassign_or_override` | `current_user:get_current_active_user` | `invoice_id, payload` | Fallback mechanism for stuck documents: |
| `DELETE` | `/api/admin/workflows/{profile_name}` | `delete_workflow_profile` | `current_user:get_current_active_user` | `profile_name` | Endpoint handler |
| `GET` | `/api/admin/workflows/{profile_name}` | `get_single_workflow_profile_admin` | `_auth:_perm_dependency` | `profile_name` | Endpoint handler |
| `GET` | `/api/users` | `get_users` | `current_user:get_current_active_user` | `include_inactive, role, search` | Endpoint handler |
| `POST` | `/api/users` | `create_user_master` | `current_user:get_current_active_user` | `payload` | Endpoint handler |
| `GET` | `/api/users/{user_identifier}` | `get_user_by_id` | `current_user:get_current_active_user` | `user_identifier` | Endpoint handler |
| `DELETE` | `/api/users/{user_id}` | `delete_user` | `current_user:get_current_active_user` | `user_id` | Endpoint handler |
| `PUT` | `/api/users/{user_id}` | `update_user_master` | `current_user:get_current_active_user` | `user_id, payload` | Endpoint handler |
| `PATCH` | `/api/users/{user_id}/status` | `toggle_user_status` | `current_user:get_current_active_user` | `user_id, payload` | Endpoint handler |
| `POST` | `/api/users/{user_id}/unlock` | `unlock_user` | `current_user:get_current_active_user` | `user_id` | SEC-10 Admin Account Unlock: |

---

## 11.10 System Monitoring, Audit & Events (/api/audit-logs, /api/system-logs, /api/events, /api/notifications, /api/dashboard, /api/stats, /health) (15 Endpoints)

| Method | HTTP Path | Route Function | Auth Dependency | Parameters / Body | Description |
| :---: | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/audit-logs` | `get_audit_logs` | `current_user:get_current_active_user` | `invoice_id, include_expired` | Endpoint handler |
| `GET` | `/api/dashboard/stats` | `get_dashboard_stats` | `current_user:get_current_user` | `None` | Endpoint handler |
| `GET` | `/api/events/stream` | `event_stream` | `get_current_user_for_stream, current_user:get_current_user_for_stream` | `None` | Server-Sent Events (SSE) endpoint. |
| `POST` | `/api/events/stream-ticket` | `issue_stream_ticket` | `current_user:get_current_active_user` | `None` | Issues a short-lived (30s) single-use ticket for connecting to the SSE stream. |
| `GET` | `/api/health` | `health` | `None` | `None` | Endpoint handler |
| `GET` | `/api/notifications` | `get_notifications` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `PUT` | `/api/notifications/read-all` | `mark_all_notifications_read` | `current_user:get_current_active_user` | `None` | Endpoint handler |
| `PUT` | `/api/notifications/{notification_id}/read` | `mark_notification_read` | `current_user:get_current_active_user` | `notification_id` | Endpoint handler |
| `GET` | `/api/openapi.json` | `openapi` | `None` | `req` | Endpoint handler |
| `GET` | `/api/stats` | `get_dashboard_stats` | `current_user:get_current_user` | `None` | Endpoint handler |
| `GET` | `/api/system-logs` | `get_system_logs` | `current_user:get_current_active_user` | `invoice_id` | Endpoint handler |
| `GET` | `/docs` | `swagger_ui_html` | `None` | `req` | Endpoint handler |
| `GET` | `/docs/oauth2-redirect` | `swagger_ui_redirect` | `None` | `req` | Endpoint handler |
| `GET` | `/health` | `health` | `None` | `None` | Endpoint handler |
| `GET` | `/redoc` | `redoc_html` | `None` | `req` | Endpoint handler |

---

## 11.11 Standard HTTP Status Codes

| Status Code | Code Identifier | Trigger Condition |
| :---: | :--- | :--- |
| `200` | OK | Request processed successfully. |
| `201` | Created | Resource successfully created (document upload, user creation). |
| `400` | Bad Request | Validation error, invalid state transition requested. |
| `401` | Unauthorized | Missing, expired, or invalid JWT bearer token or M2M API key. |
| `403` | Forbidden | Insufficient RBAC permission, maker-checker policy violation. |
| `404` | Not Found | Requested entity (document, user, profile) does not exist. |
| `409` | Conflict | Optimistic version collision (`expected_version` mismatch). |
| `422` | Unprocessable Entity | Pydantic payload schema violation or empty approver target (AUD-01). |
| `423` | Locked | Document is currently locked by another active reviewer. |
| `500` | Internal Server Error | Unhandled database or OS filesystem failure. |

---

**Verified against source**: [`backend/app/main.py`](file:///backend/app/main.py), [`backend/app/routers/auth.py`](file:///backend/app/routers/auth.py), [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py), [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py), [`backend/app/routers/sync_router.py`](file:///backend/app/routers/sync_router.py), [`backend/app/routers/workflows.py`](file:///backend/app/routers/workflows.py), [`backend/app/routers/conditions.py`](file:///backend/app/routers/conditions.py), [`backend/app/routers/integrations.py`](file:///backend/app/routers/integrations.py), [`backend/app/routers/more_info.py`](file:///backend/app/routers/more_info.py), [`backend/app/routers/roles.py`](file:///backend/app/routers/roles.py), [`backend/app/routers/users.py`](file:///backend/app/routers/users.py), [`backend/app/routers/audit.py`](file:///backend/app/routers/audit.py), [`backend/app/routers/events.py`](file:///backend/app/routers/events.py).
