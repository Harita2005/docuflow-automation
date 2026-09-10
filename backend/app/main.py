import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config.settings import settings
from .database.connection import engine
from sqlalchemy import text
from .database.models import Base
from .routers.audit import router as audit_router
from .routers.auth import router as auth_router
from .routers.callback_integrations import router as callback_integrations_router
from .routers.conditions import router as conditions_router
from .routers.documents import router as documents_router
from .routers.events import router as events_router
from .routers.integrations import router as integrations_router
from .routers.sync import router as sync_router
from .routers.sync_router import router as m2m_sync_router
from .routers.users import admin_router as admin_users_router, router as users_router
from .routers.workflows import router as workflows_router
from .services.security_middleware import RateLimiterMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        Base.metadata.create_all(bind=engine)
        # Ensure required columns exist
        with engine.begin() as conn:
            # role_id column on users
            conn.execute(text("IF COL_LENGTH('users', 'role_id') IS NULL ALTER TABLE users ADD role_id INT NULL;"))
            conn.execute(text("""IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'fk_users_role_id')
                ALTER TABLE users ADD CONSTRAINT fk_users_role_id FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;"""))
            # file_path column on documents
            conn.execute(text("IF COL_LENGTH('documents', 'file_path') IS NULL ALTER TABLE documents ADD file_path VARCHAR(500) NULL;"))
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

origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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