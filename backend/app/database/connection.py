from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config.settings import settings


# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------

DATABASE_URL = settings.get_database_url()

# Print connection target on startup
_target_server = (settings.DB_SERVER or settings.DB_HOST or "localhost").strip()
_target_db = (settings.DB_NAME or "DocuFlowDB").strip()
if DATABASE_URL:
    import re
    _m = re.search(r"@([^:/]+)(?::\d+)?/([^?]+)", DATABASE_URL)
    if _m:
        _target_server, _target_db = _m.group(1), _m.group(2)
print(f"[DB] Connected to {_target_server}/{_target_db}")

if "sqlite" in DATABASE_URL.lower():
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        pool_pre_ping=True,
        pool_recycle=settings.DB_POOL_RECYCLE,
    )


# ---------------------------------------------------------------------------
# Database session
# ---------------------------------------------------------------------------

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ---------------------------------------------------------------------------
# Base model
# ---------------------------------------------------------------------------

Base = declarative_base()


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        try:
            db.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Public exports
# ---------------------------------------------------------------------------

__all__ = [
    "engine",
    "SessionLocal",
    "Base",
    "get_db",
]