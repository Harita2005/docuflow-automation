# PART 18: Known Issues and Improvements

## 18.1 Codebase Audit Findings & Technical Debt

A comprehensive audit of the code, configuration, and architectural layers identified the following technical debt and improvement opportunities:

| Area | Description | Severity | Impacted File(s) |
| :--- | :--- | :--- | :--- |
| **Database Migrations** | Schema migrations currently use `Base.metadata.create_all()` via [`run_db_migrations.py`](file:///backend/scripts/migrations/run_db_migrations.py) rather than an incremental versioned migration framework like Alembic. Schema column alterations require manual scripting. | Medium | [`backend/scripts/migrations/run_db_migrations.py`](file:///backend/scripts/migrations/run_db_migrations.py) |
| **In-Memory Rate Limiting** | [`RateLimiterMiddleware`](file:///backend/app/services/security_middleware.py) stores client IP request counters in local Python memory. When scaling to multiple Uvicorn worker processes or containers, rate limit buckets are not shared. | Medium | [`backend/app/services/security_middleware.py`](file:///backend/app/services/security_middleware.py) |
| **Base64 Memory Buffering** | The [`/api/sync/base64-attachment`](file:///backend/app/routers/sync.py) endpoint loads entire base64 string payloads into RAM before decoding to disk, creating high memory spikes under concurrent large document ingestion. | Medium | [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py) |
| **Hardcoded Default IP** | Default SQL Server host `192.168.179.22` is hardcoded as default in [`backend/app/config/settings.py`](file:///backend/app/config/settings.py#L37). While it has network ping failover to `localhost`, it should ideally require explicit environment configuration. | Low | [`backend/app/config/settings.py`](file:///backend/app/config/settings.py) |
| **Multi-Worker Retry Coordination** | The background sync retry loop (`process_pending_sync_retries`) relies on database state. Under multi-node deployments, row-level locking (`SELECT ... WITH (UPDLOCK, ROWLOCK)`) should be strictly enforced to avoid worker race conditions. | Medium | [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py) |

---

## 18.2 Prioritized Improvement Roadmap

```
+----------------------------------------------------------------------------------------------------+
| P1 (Highest Priority) - Critical Architecture & Reliability Improvements                          |
| - Introduce Alembic migration repository for repeatable, reversible schema versioning.            |
| - Enforce strict SQL Server row locking (UPDLOCK) during sync retry queue item claiming.           |
| - Migrate streaming file uploads to chunked multipart to deprecate high-RAM base64 payloads.       |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
| P2 (Medium Priority) - Scalability & Distributed Infrastructure                                   |
| - Introduce Redis (or distributed SQL cache) for shared rate limiting across clustered workers.    |
| - Implement automated dead-letter alerting notifications (email/Slack) for sync logs marked DEAD.  |
| - Add Cypress or Playwright end-to-end browser test suites for the ReactFlow workflow canvas.     |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
| P3 (Low Priority) - Developer Experience & Performance Polish                                     |
| - Eliminate hardcoded IP fallback in settings.py in favor of strict configuration.                 |
| - Add PDF thumbnail caching in Redis or persistent volume to speed up repeated UI modal loads.    |
| - Implement user vacation delegation mode (auto-reassign approvals when user is on leave).         |
+----------------------------------------------------------------------------------------------------+
```

---

**Verified against source**: [`backend/app/config/settings.py`](file:///backend/app/config/settings.py), [`backend/app/services/security_middleware.py`](file:///backend/app/services/security_middleware.py), [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py), [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py), [`backend/scripts/migrations/run_db_migrations.py`](file:///backend/scripts/migrations/run_db_migrations.py).

