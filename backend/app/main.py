import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config.settings import (
    settings,
    validate_production_service_api_key,
    validate_production_file_url_signing_secret,
)
from .services.mfa_service import invalidate_legacy_and_all_tickets
from .routers.audit import router as audit_router
from .routers.auth import router as auth_router
from .routers.callback_integrations import router as callback_integrations_router
from .routers.cfms_admin import router as cfms_admin_router, install_exception_handlers as install_cfms_handlers
from .routers.conditions import router as conditions_router
from .routers.documents import router as documents_router
from .routers.events import router as events_router
from .routers.integrations import router as integrations_router, alias_router as integrations_alias_router
from .routers.more_info import router as more_info_router
from .routers.roles import permission_router as permissions_router, router as roles_router
from .routers.sync import alias_router as sync_alias_router, router as sync_router
from .routers.sync_router import router as m2m_sync_router
from .routers.users import admin_router as admin_users_router, router as users_router
from .routers.workflows import router as workflows_router
from .services.security_middleware import RateLimiterMiddleware, SecurityHeadersMiddleware


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Enforce production security invariants (refuse to start if keys/secrets insecure)
    validate_production_service_api_key(settings.SERVICE_API_KEY, settings.ENVIRONMENT)
    validate_production_file_url_signing_secret(
        settings.FILE_URL_SIGNING_SECRET, settings.ENVIRONMENT, settings.SECRET_KEY
    )

    # Multi-worker readiness guard (Issue 10)
    signing_secret = (getattr(settings, "FILE_URL_SIGNING_SECRET", None) or os.getenv("FILE_URL_SIGNING_SECRET", "")).strip()
    workers_num = int(os.getenv("WEB_CONCURRENCY", "1") or os.getenv("UVICORN_WORKERS", "1"))
    if not signing_secret:
        logger.warning("SECURITY WARNING: FILE_URL_SIGNING_SECRET is unset. Shared signed file URLs cannot be verified across worker instances.")
        if workers_num > 1:
            raise RuntimeError("FATAL: FILE_URL_SIGNING_SECRET must be configured when running with more than 1 worker.")

    if (settings.ENVIRONMENT or "").strip().lower() != "production":
        logger.warning(
            "SECURITY WARNING: Server running in non-production mode (ENVIRONMENT='%s'). "
            "Ensure ENVIRONMENT=production and strict credentials are set in production deployments.",
            settings.ENVIRONMENT,
        )

    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            # Audit log retention pruning on startup disabled to prevent unintended data loss (Issue 7).
            # Retention pruning is now managed via explicit admin operations / scheduled jobs with archival.

            # Ensure auth schema columns exist (must_change_password, reset_token_hash, reset_token_expires_at)
            try:
                from .database.connection import engine
                raw_conn = engine.raw_connection()
                try:
                    cursor = raw_conn.cursor()
                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'must_change_password')
                        BEGIN
                            ALTER TABLE users ADD must_change_password BIT NOT NULL CONSTRAINT DF_users_must_change_password DEFAULT 1;
                        END
                    """)
                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'reset_token_hash')
                        BEGIN
                            ALTER TABLE users ADD reset_token_hash NVARCHAR(255) NULL;
                        END
                    """)
                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'reset_token_expires_at')
                        BEGIN
                            ALTER TABLE users ADD reset_token_expires_at DATETIME NULL;
                        END
                    """)
                    raw_conn.commit()
                finally:
                    raw_conn.close()
            except Exception as schema_err:
                logger.warning(f"Auth schema migration on startup deferred: {schema_err}")

            # Invalidate legacy MFA tickets from public uploads/ and clear ticket store
            try:
                invalidate_legacy_and_all_tickets()
            except Exception as mfa_clean_err:
                logger.warning(f"MFA cache invalidation on startup deferred: {mfa_clean_err}")

            # Start background workers only when explicitly enabled (Issue 10)
            run_bg = os.getenv("RUN_BACKGROUND_JOBS", "false").strip().lower() in ("true", "1", "yes")
            if run_bg:
                try:
                    from .services.integration_service import start_background_retry_worker
                    start_background_retry_worker(poll_interval=60)
                except Exception as retry_err:
                    logger.warning(f"Starting background retry worker deferred: {retry_err}")

                try:
                    from .services.archive_service import start_archive_scheduler
                    start_archive_scheduler()
                except Exception as arch_err:
                    logger.warning(f"Starting database archival scheduler deferred: {arch_err}")

                try:
                    from .services.cfms_scheduler import start_cfms_scheduler
                    start_cfms_scheduler(check_interval=30)
                except Exception as cfms_sched_err:
                    logger.warning(f"Starting CFMS scheduler deferred: {cfms_sched_err}")
            else:
                logger.info("Background jobs (sync retry, archive scheduler & CFMS scheduler) disabled (set RUN_BACKGROUND_JOBS=true to enable).")
            # Non-blocking pre-warm of PaddleOCR and Ollama for instant first-upload response
            def _warm_up_ai():
                try:
                    import httpx
                    from .services.ocr_service import get_ocr_engine
                    get_ocr_engine()
                    ollama_url = getattr(settings, "OLLAMA_URL", "")
                    ollama_model = getattr(settings, "OLLAMA_MODEL", "llama3.2:latest")
                    with httpx.Client(timeout=10.0) as client:
                        client.post(ollama_url, json={"model": ollama_model, "prompt": "ping", "stream": False})
                    logger.info("[AI Startup] PaddleOCR and Ollama (%s) pre-warmed successfully.", ollama_model)
                except Exception as warm_err:
                    logger.debug("[AI Startup] AI warm-up deferred: %s", warm_err)

            import threading
            threading.Thread(target=_warm_up_ai, daemon=True).start()

            # Tune AnyIO thread limiter to 200 tokens for 150+ concurrent requests
            try:
                from anyio.to_thread import current_default_thread_limiter
                current_default_thread_limiter().total_tokens = 200
                logger.info("Configured AnyIO default thread limiter tokens to 200 for high concurrency.")
            except Exception as thread_err:
                logger.debug(f"AnyIO thread limiter configuration deferred: {thread_err}")
        except Exception as exc: 
            logger.warning(f"Startup tasks deferred: {exc}")
    yield

    # Graceful shutdown tasks
    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            from .services.integration_service import stop_background_retry_worker
            stop_background_retry_worker()
        except Exception as shutdown_err:
            logger.warning(f"Shutdown retry worker cleanup: {shutdown_err}")

        try:
            from .services.archive_service import stop_archive_scheduler
            stop_archive_scheduler()
        except Exception as arch_stop_err:
            logger.warning(f"Shutdown archive scheduler cleanup: {arch_stop_err}")

        try:
            from .services.cfms_scheduler import stop_cfms_scheduler
            stop_cfms_scheduler()
        except Exception as cfms_stop_err:
            logger.warning(f"Shutdown CFMS scheduler cleanup: {cfms_stop_err}")


is_production = (settings.ENVIRONMENT or "").strip().lower() in ("production", "prod")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=None if is_production else f"{settings.API_V1_STR}/openapi.json",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware Configuration
# ---------------------------------------------------------------------------

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimiterMiddleware, max_auth_requests=15, window_seconds=60)

origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count", "Content-Disposition"],
)

# ---------------------------------------------------------------------------
# Router Ingestion
# ---------------------------------------------------------------------------

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_users_router)
app.include_router(roles_router)
app.include_router(permissions_router)
app.include_router(documents_router)
app.include_router(more_info_router)
app.include_router(workflows_router)
app.include_router(conditions_router)
app.include_router(events_router)
app.include_router(audit_router)
app.include_router(integrations_router)
app.include_router(integrations_alias_router)
app.include_router(callback_integrations_router)
app.include_router(sync_router)
app.include_router(sync_alias_router)
app.include_router(m2m_sync_router)
# Customer Feedback (CFMS) administration proxy: /api/admin/cfms/* -> CFMS internal API (server-side only)
app.include_router(cfms_admin_router)
install_cfms_handlers(app)

# ---------------------------------------------------------------------------
# Root Health Endpoint
# ---------------------------------------------------------------------------


@app.get("/")
def root():
    resp = {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }
    if not is_production:
        resp["docs_url"] = "/docs"
    return resp


@app.get("/health")
@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
    }