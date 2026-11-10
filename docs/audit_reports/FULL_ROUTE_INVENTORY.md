# Full API Route Inventory Table

**Total Mounted Routes:** 243

| Method | Path | Auth Dependency | Permission Check | Intentionally Public? |
| :--- | :--- | :--- | :--- | :---: |
| GET | / | None | - | Yes |
| GET | /api/admin/approved-documents | get_db, get_current_active_user | - | No |
| GET | /api/admin/audit-logs | get_db, get_current_active_user | - | No |
| POST | /api/admin/audit-logs/cleanup | get_db, get_current_active_user | - | No |
| GET | /api/admin/audit-logs/retention | get_db, get_current_active_user | - | No |
| POST | /api/admin/audit-logs/retention | get_db, get_current_active_user | - | No |
| GET | /api/admin/backup/history | get_db, get_current_active_user | - | No |
| POST | /api/admin/backup/trigger | get_db, get_current_active_user | - | No |
| DELETE | /api/admin/categories/{category_name} | get_db, get_current_active_user | - | No |
| GET | /api/admin/checklist-rules | get_db, get_current_active_user | - | No |
| POST | /api/admin/checklist-rules | get_db, get_current_active_user | - | No |
| DELETE | /api/admin/checklist-rules/{rule_id} | get_db, get_current_active_user | - | No |
| GET | /api/admin/conditions | get_db, _perm_dependency | condition:read | No |
| POST | /api/admin/conditions | get_db, dependency | condition:write | No |
| POST | /api/admin/conditions/save | get_db, dependency | condition:write | No |
| DELETE | /api/admin/conditions/{rule_id} | get_db, dependency | condition:write | No |
| GET | /api/admin/config | get_db, get_current_active_user | - | No |
| POST | /api/admin/config | get_db, get_current_active_user | - | No |
| POST | /api/admin/documents/remap-unrouted | get_db, get_current_active_user | - | No |
| GET | /api/admin/erp-master | get_db, get_current_active_user | - | No |
| POST | /api/admin/erp-master | get_db, get_current_active_user | - | No |
| POST | /api/admin/erp-master/bulk | get_db, get_current_active_user | - | No |
| DELETE | /api/admin/erp-master/{po} | get_db, get_current_active_user | - | No |
| GET | /api/admin/notifications/inapp-config | get_db, get_current_active_user | - | No |
| POST | /api/admin/notifications/inapp-config | get_db, get_current_active_user | - | No |
| GET | /api/admin/notifications/inapp-config/ | get_db, get_current_active_user | - | No |
| POST | /api/admin/notifications/inapp-config/ | get_db, get_current_active_user | - | No |
| GET | /api/admin/notifications/provider | get_db, get_current_active_user | - | No |
| POST | /api/admin/notifications/provider | get_db, get_current_active_user | - | No |
| GET | /api/admin/notifications/raci | get_db, get_current_active_user | - | No |
| POST | /api/admin/notifications/raci | get_db, get_current_active_user | - | No |
| POST | /api/admin/notifications/test | get_db, get_current_active_user | - | No |
| GET | /api/admin/permissions | get_current_active_user, get_current_active_user, get_db | - | No |
| POST | /api/admin/permissions | get_current_active_user, get_current_active_user, get_db | - | No |
| GET | /api/admin/permissions/registry | get_current_active_user, get_current_active_user, get_db | - | No |
| DELETE | /api/admin/permissions/{permission_id} | get_current_active_user, get_current_active_user, get_db | - | No |
| PUT | /api/admin/permissions/{permission_id} | get_current_active_user, get_current_active_user, get_db | - | No |
| PUT | /api/admin/permissions/{permission_id}/toggle-active | get_current_active_user, get_current_active_user, get_db | - | No |
| POST | /api/admin/publish | get_db, get_current_active_user | - | No |
| GET | /api/admin/recycle-bin | get_db, get_current_active_user | - | No |
| GET | /api/admin/roles | get_current_active_user, get_current_active_user, get_db | - | No |
| POST | /api/admin/roles | get_current_active_user, get_current_active_user, get_db | - | No |
| PUT | /api/admin/roles/{role_id}/permissions | get_current_active_user, get_current_active_user, get_db | - | No |
| GET | /api/admin/routing-rules | get_db, _perm_dependency | condition:read | No |
| POST | /api/admin/routing-rules | get_db, dependency | condition:write | No |
| DELETE | /api/admin/routing-rules/{rule_id} | get_db, dependency | condition:write | No |
| GET | /api/admin/rules/conflicts | get_db, _perm_dependency | condition:read | No |
| POST | /api/admin/rules/detect-conflicts | get_db, _perm_dependency | condition:read | No |
| POST | /api/admin/rules/simulate | get_db, _perm_dependency | condition:read | No |
| GET | /api/admin/users | get_current_active_user, get_db | - | No |
| POST | /api/admin/users | get_current_active_user, get_db | - | No |
| DELETE | /api/admin/users/{user_id} | get_current_active_user, get_db | - | No |
| PUT | /api/admin/users/{user_id} | get_current_active_user, get_db | - | No |
| PATCH | /api/admin/users/{user_id}/status | get_current_active_user, get_db | - | No |
| POST | /api/admin/users/{user_id}/unlock | get_current_active_user, get_db | - | No |
| GET | /api/admin/workflow-steps | get_db, _perm_dependency | workflow:read | No |
| POST | /api/admin/workflow-steps | get_db, get_current_active_user | - | No |
| DELETE | /api/admin/workflow-steps/{step_id} | get_db, get_current_active_user | - | No |
| GET | /api/admin/workflows | get_db, _perm_dependency | workflow:read | No |
| POST | /api/admin/workflows | get_db, dependency | workflow:write | No |
| POST | /api/admin/workflows/save | get_db, dependency | workflow:write | No |
| POST | /api/admin/workflows/sync-approvers | get_db, _perm_dependency | workflow:write | No |
| DELETE | /api/admin/workflows/{profile_name} | get_db, get_current_active_user | - | No |
| GET | /api/admin/workflows/{profile_name} | get_db, _perm_dependency | workflow:read | No |
| GET | /api/audit-logs | get_db, get_current_active_user | - | No |
| GET | /api/auth/login | None | - | Yes |
| POST | /api/auth/login | get_db | - | Yes |
| POST | /api/auth/logout | get_db, get_current_user | - | No |
| GET | /api/auth/me | get_current_user | - | No |
| POST | /api/auth/mfa/send-otp | get_db | - | Yes |
| POST | /api/auth/mfa/setup-totp | get_db | - | Yes |
| POST | /api/auth/mfa/verify | get_db | - | Yes |
| GET | /api/auth/token | None | - | Yes |
| POST | /api/auth/token | get_db | - | Yes |
| DELETE | /api/categories/{category_name} | get_db, get_current_active_user | - | No |
| GET | /api/checklist-templates | get_db, get_current_active_user | - | No |
| POST | /api/checklist-templates | get_db, get_current_active_user | - | No |
| DELETE | /api/checklist-templates/{rule_id} | get_db, get_current_active_user | - | No |
| GET | /api/conditions | get_db, get_current_user_or_service_key | - | No |
| POST | /api/conditions | get_db, dependency | condition:write | No |
| GET | /api/dashboard/stats | get_db, get_current_user | - | No |
| GET | /api/document-types/{document_type}/available-fields | get_db, get_current_active_user | - | No |
| GET | /api/document-types/{document_type}/more-info/config | get_current_user_optional, get_db | - | No |
| PUT | /api/document-types/{document_type}/more-info/config | get_current_active_user, get_db | - | No |
| GET | /api/documents | get_db, get_current_active_user | - | No |
| GET | /api/documents/approved | get_db, get_current_active_user | - | No |
| GET | /api/documents/approved/filter-options | get_db, get_current_active_user | - | No |
| POST | /api/documents/compress-pdf | get_db, get_current_active_user | - | No |
| POST | /api/documents/confirm-ingest | get_db, get_current_active_user | - | No |
| POST | /api/documents/extract-preview | get_db, get_current_active_user | - | No |
| GET | /api/documents/filter-options | get_db, get_current_active_user | - | No |
| GET | /api/documents/synced-pending | get_db, get_current_active_user | - | No |
| GET | /api/documents/temp-preview/{filename} | get_current_active_user | - | No |
| POST | /api/documents/trigger-workflow/excel | get_db, get_current_active_user | - | No |
| POST | /api/documents/upload | get_db, get_current_active_user | - | No |
| POST | /api/documents/upload-and-route/{synced_doc_id} | get_db, get_current_active_user | - | No |
| GET | /api/documents/work-tracker | get_db, get_current_active_user | - | No |
| GET | /api/documents/{document_id}/more-info/config | get_current_user_optional, get_db | - | No |
| PUT | /api/documents/{document_id}/more-info/config | get_current_active_user, get_db | - | No |
| GET | /api/documents/{id}/comments | get_db, get_current_active_user | - | No |
| POST | /api/documents/{id}/comments | get_db, get_current_active_user | - | No |
| GET | /api/documents/{id}/versions | get_db, get_current_active_user | - | No |
| GET | /api/documents/{invoice_id} | get_db, get_current_active_user | - | No |
| PUT | /api/documents/{invoice_id} | get_db, get_current_active_user | - | No |
| POST | /api/documents/{invoice_id}/approve | get_db, get_current_active_user | - | No |
| GET | /api/documents/{invoice_id}/checklist | get_db, get_current_active_user | - | No |
| POST | /api/documents/{invoice_id}/checklist | get_db, get_current_user | - | No |
| GET | /api/documents/{invoice_id}/file | get_db, get_current_active_user | - | No |
| POST | /api/documents/{invoice_id}/hold | get_db, get_current_user | - | No |
| POST | /api/documents/{invoice_id}/lock/acquire | get_current_active_user, get_db | - | No |
| POST | /api/documents/{invoice_id}/lock/heartbeat | get_current_active_user, get_db | - | No |
| POST | /api/documents/{invoice_id}/lock/release | get_current_active_user, get_db | - | No |
| GET | /api/documents/{invoice_id}/lock/status | get_current_active_user, get_db | - | No |
| POST | /api/documents/{invoice_id}/reject | get_db, get_current_user | - | No |
| GET | /api/documents/{invoice_id}/signed-url | get_db, get_current_active_user | - | No |
| POST | /api/documents/{invoice_id}/step-action | get_db, get_current_user | - | No |
| POST | /api/documents/{invoice_id}/version | get_db, get_current_active_user | - | No |
| GET | /api/erp/{po_number} | get_db, get_current_active_user | - | No |
| GET | /api/events/stream | get_current_user_for_stream, get_current_user_for_stream | - | No |
| POST | /api/events/stream-ticket | get_current_active_user | - | No |
| GET | /api/files/signed/{document_id} | get_db | - | Yes |
| GET | /api/health | None | - | Yes |
| GET | /api/integrations/v1/approved-documents | get_db, verify_service_api_key | - | No |
| GET | /api/integrations/v1/documents/{document_id} | get_db, verify_service_api_key | - | No |
| POST | /api/integrations/v1/documents/{document_id}/acknowledge | get_db, verify_service_api_key | - | No |
| GET | /api/integrations/v1/documents/{document_id}/download-pdf | get_db, verify_service_api_key | - | No |
| POST | /api/integrations/v1/documents/{document_id}/retry-push | get_db, get_current_active_user | - | No |
| GET | /api/integrations/v1/sync-logs | get_db, get_current_active_user | - | No |
| GET | /api/integrations/v1/webhook-config | get_db, get_current_active_user | - | No |
| POST | /api/integrations/v1/webhook-config | get_db, get_current_active_user | - | No |
| POST | /api/integrations/v1/webhook-test | get_db, get_current_active_user | - | No |
| GET | /api/integrations/v2/applications | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/applications | _require_callback_admin, get_db | - | No |
| DELETE | /api/integrations/v2/applications/{app_id} | _require_callback_admin, get_db | - | No |
| GET | /api/integrations/v2/applications/{app_id} | _require_callback_admin, get_db | - | No |
| PUT | /api/integrations/v2/applications/{app_id} | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/applications/{app_id}/toggle-status | _require_callback_admin, get_db | - | No |
| GET | /api/integrations/v2/audit-history | _require_callback_admin, get_db | - | No |
| GET | /api/integrations/v2/logs | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/logs/bulk-retry | _require_callback_admin, get_db | - | No |
| GET | /api/integrations/v2/logs/{event_id} | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/logs/{event_id}/retry | _require_callback_admin, get_db | - | No |
| GET | /api/integrations/v2/rules | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/rules | _require_callback_admin, get_db | - | No |
| DELETE | /api/integrations/v2/rules/{rule_id} | _require_callback_admin, get_db | - | No |
| GET | /api/integrations/v2/rules/{rule_id} | _require_callback_admin, get_db | - | No |
| PUT | /api/integrations/v2/rules/{rule_id} | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/rules/{rule_id}/duplicate | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/rules/{rule_id}/toggle-status | _require_callback_admin, get_db | - | No |
| POST | /api/integrations/v2/test | _require_callback_admin, get_db | - | No |
| GET | /api/invoices | get_db, get_current_active_user | - | No |
| GET | /api/invoices/approved | get_db, get_current_active_user | - | No |
| POST | /api/invoices/compress-pdf | get_db, get_current_active_user | - | No |
| GET | /api/invoices/synced-pending | get_db, get_current_active_user | - | No |
| GET | /api/invoices/work-tracker | get_db, get_current_active_user | - | No |
| GET | /api/invoices/{document_id}/more-info/config | get_current_user_optional, get_db | - | No |
| PUT | /api/invoices/{document_id}/more-info/config | get_current_active_user, get_db | - | No |
| POST | /api/invoices/{id}/comments | get_db, get_current_active_user | - | No |
| GET | /api/invoices/{id}/versions | get_db, get_current_active_user | - | No |
| GET | /api/invoices/{invoice_id} | get_db, get_current_active_user | - | No |
| PUT | /api/invoices/{invoice_id} | get_db, get_current_active_user | - | No |
| POST | /api/invoices/{invoice_id}/approve | get_db, get_current_active_user | - | No |
| POST | /api/invoices/{invoice_id}/cancel | get_db, get_current_user | - | No |
| GET | /api/invoices/{invoice_id}/checklist | get_db, get_current_active_user | - | No |
| POST | /api/invoices/{invoice_id}/checklist | get_db, get_current_user | - | No |
| GET | /api/invoices/{invoice_id}/file | get_db, get_current_active_user | - | No |
| POST | /api/invoices/{invoice_id}/hold | get_db, get_current_user | - | No |
| POST | /api/invoices/{invoice_id}/lock/acquire | get_current_active_user, get_db | - | No |
| POST | /api/invoices/{invoice_id}/lock/heartbeat | get_current_active_user, get_db | - | No |
| POST | /api/invoices/{invoice_id}/lock/release | get_current_active_user, get_db | - | No |
| GET | /api/invoices/{invoice_id}/lock/status | get_current_active_user, get_db | - | No |
| POST | /api/invoices/{invoice_id}/reject | get_db, get_current_user | - | No |
| POST | /api/invoices/{invoice_id}/step-action | get_db, get_current_user | - | No |
| POST | /api/invoices/{invoice_id}/version | get_db, get_current_active_user | - | No |
| GET | /api/notifications | get_db, get_current_active_user | - | No |
| PUT | /api/notifications/read-all | get_db, get_current_active_user | - | No |
| PUT | /api/notifications/{notification_id}/read | get_db, get_current_active_user | - | No |
| GET | /api/openapi.json | None | - | Yes |
| GET | /api/records | get_db, get_current_active_user | - | No |
| GET | /api/records/approved | get_db, get_current_active_user | - | No |
| GET | /api/records/approved/filter-options | get_db, get_current_active_user | - | No |
| POST | /api/records/compress-pdf | get_db, get_current_active_user | - | No |
| GET | /api/records/synced-pending | get_db, get_current_active_user | - | No |
| GET | /api/records/work-tracker | get_db, get_current_active_user | - | No |
| GET | /api/records/{id}/comments | get_db, get_current_active_user | - | No |
| POST | /api/records/{id}/comments | get_db, get_current_active_user | - | No |
| GET | /api/records/{id}/versions | get_db, get_current_active_user | - | No |
| GET | /api/records/{invoice_id} | get_db, get_current_active_user | - | No |
| PUT | /api/records/{invoice_id} | get_db, get_current_active_user | - | No |
| POST | /api/records/{invoice_id}/approve | get_db, get_current_active_user | - | No |
| POST | /api/records/{invoice_id}/cancel | get_db, get_current_user | - | No |
| GET | /api/records/{invoice_id}/file | get_db, get_current_active_user | - | No |
| POST | /api/records/{invoice_id}/hold | get_db, get_current_user | - | No |
| POST | /api/records/{invoice_id}/reject | get_db, get_current_user | - | No |
| POST | /api/records/{invoice_id}/step-action | get_db, get_current_user | - | No |
| POST | /api/records/{invoice_id}/version | get_db, get_current_active_user | - | No |
| GET | /api/stats | get_db, get_current_user | - | No |
| POST | /api/sync/attachment/base64 | get_db, verify_service_api_key | - | No |
| POST | /api/sync/attachment/upload | get_db, verify_service_api_key | - | No |
| POST | /api/sync/batch | get_db, verify_service_api_key | - | No |
| POST | /api/sync/cancel | get_db, verify_service_api_key | - | No |
| POST | /api/sync/document | get_db, verify_service_api_key | - | No |
| POST | /api/sync/documents | get_db, verify_service_api_key | - | No |
| POST | /api/sync/invoice | get_db, verify_service_api_key | - | No |
| POST | /api/sync/invoices | get_db, verify_service_api_key | - | No |
| POST | /api/sync/invoices/batch | get_db, verify_service_api_key | - | No |
| POST | /api/sync/record | get_db, verify_service_api_key | - | No |
| POST | /api/sync/record/{record_id}/attachment | get_db, verify_service_api_key | - | No |
| POST | /api/sync/record/{record_id}/attachment/base64 | get_db, verify_service_api_key | - | No |
| POST | /api/sync/record/{record_id}/cancel | get_db, verify_service_api_key | - | No |
| POST | /api/sync/records | get_db, verify_service_api_key | - | No |
| POST | /api/sync/records/batch | get_db, verify_service_api_key | - | No |
| GET | /api/system-logs | get_db, get_current_active_user | - | No |
| GET | /api/templates | get_db, get_current_active_user | - | No |
| GET | /api/users | get_current_active_user, get_db | - | No |
| POST | /api/users | get_current_active_user, get_db | - | No |
| GET | /api/users/{user_identifier} | get_current_active_user, get_db | - | No |
| DELETE | /api/users/{user_id} | get_current_active_user, get_db | - | No |
| PUT | /api/users/{user_id} | get_current_active_user, get_db | - | No |
| PATCH | /api/users/{user_id}/status | get_current_active_user, get_db | - | No |
| POST | /api/users/{user_id}/unlock | get_current_active_user, get_db | - | No |
| GET | /api/v1/approved-documents | get_db, get_current_active_user | - | No |
| POST | /api/workflow/approve | get_db, get_current_active_user | - | No |
| POST | /api/workflow/hold | get_db, get_current_user | - | No |
| POST | /api/workflow/reject | get_db, get_current_user | - | No |
| POST | /api/workflow/sendback | get_db, get_current_user | - | No |
| GET | /api/workflows | get_db, get_current_user_or_service_key | - | No |
| POST | /api/workflows/approve | get_db, get_current_active_user | - | No |
| POST | /api/workflows/cancel | get_db, get_current_user | - | No |
| POST | /api/workflows/hold | get_db, get_current_user | - | No |
| DELETE | /api/workflows/profiles/{profile_name} | get_db, get_current_active_user | - | No |
| POST | /api/workflows/reject | get_db, get_current_user | - | No |
| POST | /api/workflows/sendback | get_db, get_current_user | - | No |
| POST | /api/workflows/{invoice_id}/escalate | get_db, get_current_active_user | - | No |
| GET | /api/workflows/{invoice_id}/escalate-check | get_db, get_current_active_user | - | No |
| DELETE | /api/workflows/{profile_name} | get_db, get_current_active_user | - | No |
| GET | /api/workflows/{profile_name} | get_db, get_current_user_or_service_key | - | No |
| GET | /docs | None | - | Yes |
| GET | /docs/oauth2-redirect | None | - | Yes |
| GET | /health | None | - | Yes |
| POST | /m2m/auth/login | None | - | Yes |
| POST | /m2m/record | get_db, verify_m2m_token | - | No |
| GET | /redoc | None | - | Yes |
