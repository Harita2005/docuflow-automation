import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config.settings import settings
from app.database.connection import engine
from app.database.models import Base
from app.routers.audit import router as audit_router
from app.routers.auth import router as auth_router
from app.routers.callback_integrations import router as callback_integrations_router
from app.routers.conditions import router as conditions_router
from app.routers.documents import router as documents_router
from app.routers.events import router as events_router
from app.routers.integrations import router as integrations_router
from app.routers.sync import router as sync_router
from app.routers.sync_router import router as m2m_sync_router
from app.routers.users import admin_router as admin_users_router, router as users_router
from app.routers.workflows import router as workflows_router
from app.services.security_middleware import RateLimiterMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database schema initialized successfully.")
    except Exception as exc:
        logger.warning(f"Database schema initialization deferred: {exc}")
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Middleware Configuration
# ---------------------------------------------------------------------------

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimiterMiddleware, max_auth_requests=15, window_seconds=60)

allowed_origins = [
    origin.strip()
    for origin in getattr(settings, "ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Router Ingestion
# ---------------------------------------------------------------------------

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_users_router)
app.include_router(documents_router)
app.include_router(workflows_router)
app.include_router(conditions_router)
app.include_router(events_router)
app.include_router(audit_router)
app.include_router(integrations_router)
app.include_router(callback_integrations_router)
app.include_router(sync_router)
app.include_router(m2m_sync_router)

# ---------------------------------------------------------------------------
# Static Directories
# ---------------------------------------------------------------------------

if settings.UPLOAD_DIR.exists():
    app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

if settings.PDF_STORAGE_DIR.exists():
    app.mount("/stored_pdfs", StaticFiles(directory=str(settings.PDF_STORAGE_DIR)), name="stored_pdfs")


@app.get("/")
def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs_url": "/docs",
    }