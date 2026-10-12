# PART 17: Maintenance

## 17.1 Routine Operational Schedule

| Cadence | Operational Task | Procedures / Diagnostic Queries | Key Consuming File |
| :--- | :--- | :--- | :--- |
| **Daily** | **Inspect Dead Outbound Syncs** | Check for webhooks marked `DEAD` or `NEEDS_ATTENTION`:<br>`SELECT * FROM integration_sync_logs WHERE status IN ('DEAD', 'FAILED');` | [`integration_service.py`](file:///backend/app/services/integration_service.py) |
| **Daily** | **Monitor Stale Document Locks** | Verify lock reaper is clearing expired leases:<br>`SELECT * FROM document_locks WHERE expires_at < GETUTCDATE();` | [`lock_service.py`](file:///backend/app/services/lock_service.py) |
| **Daily** | **Storage Volume Utilization** | Ensure `/app/stored_pdfs` and `/app/uploads` have adequate disk capacity (`df -h`). | [`settings.py`](file:///backend/app/config/settings.py) |
| **Weekly** | **Audit Log Pruning** | Ensure `audit_logs` older than `AUDIT_LOG_RETENTION_DAYS` (7 days) are cleared: | [`models.py`](file:///backend/app/database/models.py) |
| **Weekly** | **Database Index Defragmentation** | Rebuild indexes on high-churn tables: `documents`, `integration_sync_logs`, `document_locks`. | SQL Server SSMS |
| **Monthly** | **Secret & API Key Rotation** | Rotate `SERVICE_API_KEY` and `FILE_URL_SIGNING_SECRET` following safe rotation protocol. | [`.env`](file:///.env) |
| **Quarterly**| **TLS Certificate Renewal** | Review expiry of TLS certificates on Nginx ingress and SQL Server connection. | Nginx / Host OS |

---

## 17.2 Database Maintenance & Reindexing Scripts

Execute the following T-SQL maintenance script periodically to optimize query performance on large installations:

```sql
-- Rebuild indexes on high-traffic DocuFlow tables
ALTER INDEX ALL ON documents REBUILD WITH (ONLINE = ON);
ALTER INDEX ALL ON integration_sync_logs REBUILD WITH (ONLINE = ON);
ALTER INDEX ALL ON document_approval_logs REBUILD WITH (ONLINE = ON);
ALTER INDEX ALL ON document_locks REBUILD WITH (ONLINE = ON);

-- Update statistics for query optimizer
UPDATE STATISTICS documents;
UPDATE STATISTICS workflow_step_definitions;
UPDATE STATISTICS business_rules;
```

---

## 17.3 Safe Modification Protocol: What NEVER to Touch

To preserve system stability, compliance, and data integrity, adhering to the following strict prohibitions is mandatory:

> [!CAUTION]
> **STRICT PROHIBITIONS FOR DEVELOPERS AND MAINTAINERS**:
> 1. **NEVER bypass `expected_version`**:
>    Do not remove or make optional the `expected_version` parameter in [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py). Bypassing this will immediately reintroduce concurrency bugs, allowing two approvers to act simultaneously or double-approve requests.
> 2. **NEVER alter the lifecycle execution sequence in `complete_document_lifecycle()`**:
>    The execution order must remain strictly:
>    1. Archive physical PDF &rarr; 2. Commit DB status (`APPROVED`) &rarr; 3. Outbound back-sync push &rarr; 4. Dispatch notifications & audit logs.
>    Reversing this sequence causes external ERPs to be notified of approvals before files are physically secured on disk.
> 3. **NEVER disable production startup guards**:
>    Do not remove or weaken `validate_production_service_api_key()` or `validate_production_file_url_signing_secret()` in [`backend/app/config/settings.py`](file:///backend/app/config/settings.py).
> 4. **NEVER delete workflow steps referenced by in-flight documents**:
>    Always check if active documents have `current_step_id == step.id` before deleting workflow steps; otherwise, documents will become permanently orphaned.
> 5. **NEVER write un-sanitized file paths to disk**:
>    Always pass incoming filenames through `resolve_safe_path()` in [`backend/app/services/file_security.py`](file:///backend/app/services/file_security.py) to prevent directory traversal attacks.

---

**Verified against source**: [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py), [`backend/app/services/lock_service.py`](file:///backend/app/services/lock_service.py), [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py), [`backend/app/services/file_security.py`](file:///backend/app/services/file_security.py), [`backend/app/config/settings.py`](file:///backend/app/config/settings.py).

