# PART 14: Logging and Error Handling

## 14.1 Logging Architecture & Storage Locations

DocuFlow employs a dual logging architecture: standard container-native application logging (stdout/stderr) and structured relational database logging for compliance, security auditing, and external integration diagnostics.

| Log Stream | Target Storage | Retention Policy | Primary Consuming File |
| :--- | :--- | :--- | :--- |
| **Application stdout/stderr** | Docker container log stream (`docker logs`) | Managed by Docker daemon log-rotation | [`backend/app/main.py`](file:///backend/app/main.py) |
| **Security Audit Logs** | SQL Server table `audit_logs` | Controlled by `settings.AUDIT_LOG_RETENTION_DAYS` (default: 7 days) | [`backend/app/routers/audit.py`](file:///backend/app/routers/audit.py) |
| **Document Approval Logs** | SQL Server table `document_approval_logs` | Permanent (retained for document lifecycle) | [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py) |
| **ERP Integration Logs** | SQL Server table `integration_sync_logs` | 30 days / indefinite for audit compliance | [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py) |
| **System Engine Logs** | SQL Server table `system_engine_logs` | Pruned periodically | [`backend/app/services/escalation_service.py`](file:///backend/app/services/escalation_service.py) |

---

## 14.2 Log Levels & Event Severity

| Level | Usage Context | Example Code Occurrence |
| :--- | :--- | :--- |
| `DEBUG` | Detailed internal state, rule condition evaluations | Evaluation of individual string operators in `RulesEngine` |
| `INFO` | Standard lifecycle events, logins, document uploads | Document successfully ingested, user logged in |
| `WARNING` | Lock contention, soft rate limits, non-critical retries | User attempted to acquire locked document; OTP retry delay |
| `ERROR` | Sync failures, database rollbacks, webhook HTTP 5xx | Outbound ERP push failed in `integration_service.py` |
| `CRITICAL` / `FATAL` | Startup validation failures, database unreachable | Insecure placeholder secrets detected in production in `settings.py` |

---

## 14.3 Exception Handling & Transaction Rollback Patterns

### 1. Database Transaction Guarding
Every mutation across routers follows strict ACID transaction boundaries:
```python
try:
    # Business mutations
    doc.status = "APPROVED"
    db.commit()
    db.refresh(doc)
except Exception as exc:
    db.rollback()
    logger.error("Transaction failed during approval for doc %s: %s", doc_id, str(exc))
    raise HTTPException(status_code=500, detail="Database transaction failed")
```

### 2. Standardized Error Response Envelope
Handled by global exception handlers in [`backend/app/main.py`](file:///backend/app/main.py):
```json
{
  "detail": "Descriptive human-readable explanation of error",
  "error_code": "RESOURCE_CONFLICT",
  "timestamp": "2026-10-10T12:00:00Z"
}
```

### 3. HTTP Status Codes Standards
- `400 Bad Request`: Payload validation failed, invalid status transition requested.
- `401 Unauthorized`: Missing or expired JWT token, invalid credentials.
- `403 Forbidden`: User lacks necessary RBAC permission for action or document is outside user's division scope.
- `404 Not Found`: Document, user, or workflow profile does not exist.
- `409 Conflict`: Concurrency conflict (`expected_version` mismatch) or duplicate document ID.
- `422 Unprocessable Entity`: Workflow configuration error (e.g., missing approver target on next step).
- `423 Locked`: Document is actively leased by another user.
- `500 Internal Server Error`: Unhandled database or OS filesystem failure.

---

**Verified against source**: [`backend/app/main.py`](file:///backend/app/main.py), [`backend/app/database/models.py`](file:///backend/app/database/models.py), [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py), [`backend/app/routers/audit.py`](file:///backend/app/routers/audit.py), [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py), [`backend/app/services/escalation_service.py`](file:///backend/app/services/escalation_service.py).

