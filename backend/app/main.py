import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response

from .config.settings import (
    settings,
    validate_production_service_api_key,
    validate_production_file_url_signing_secret,
)
from .database.connection import SessionLocal, engine
from .services.mfa_service import invalidate_legacy_and_all_tickets
from sqlalchemy import text
from .database.models import Base
from .routers.audit import prune_expired_audit_logs, router as audit_router
from .routers.auth import router as auth_router
from .routers.callback_integrations import router as callback_integrations_router
from .routers.conditions import router as conditions_router
from .routers.documents import router as documents_router
from .routers.events import router as events_router
from .routers.integrations import router as integrations_router, alias_router as integrations_alias_router
from .routers.more_info import router as more_info_router
from .routers.roles import permission_router as permissions_router, router as roles_router
from .routers.sync import router as sync_router
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

    if (settings.ENVIRONMENT or "").strip().lower() != "production":
        logger.warning(
            "SECURITY WARNING: Server running in non-production mode (ENVIRONMENT='%s'). "
            "Ensure ENVIRONMENT=production and strict credentials are set in production deployments.",
            settings.ENVIRONMENT,
        )

    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            # Automatic retention pruning for audit logs on startup
            try:
                with SessionLocal() as db_session:
                    prune_expired_audit_logs(db_session)
            except Exception as prune_err:
                logger.warning(f"Audit log retention pruning deferred: {prune_err}")

            # Invalidate legacy MFA tickets from public uploads/ and clear ticket store
            try:
                invalidate_legacy_and_all_tickets()
            except Exception as mfa_clean_err:
                logger.warning(f"MFA cache invalidation on startup deferred: {mfa_clean_err}")

            # Start background outbound sync retry worker
            try:
                from .services.integration_service import start_background_retry_worker
                start_background_retry_worker(poll_interval=60)
            except Exception as retry_err:
                logger.warning(f"Starting background retry worker deferred: {retry_err}")
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
app.include_router(m2m_sync_router)

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