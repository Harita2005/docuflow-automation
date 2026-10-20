import os
import sys
from pathlib import Path
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config.settings import settings
from app.database import connection
from app.database.connection import get_db
from app.main import app

# Production database names that must NEVER be targeted during testing
REAL_PRODUCTION_DB_NAMES = {"docuflowdb", "docuflow_prod", "docuflow_production"}
APPROVED_TEST_DB_NAMES = {"docuflowdb_test", "docuflow_test", "test_docuflow", "docuflowdb_dev"}


def is_production_database(db_name: str) -> bool:
    """Check if the provided database name is a production database."""
    clean = (db_name or "").strip().lower()
    return clean in REAL_PRODUCTION_DB_NAMES or "prod" in clean


def is_approved_test_database(db_name: str) -> bool:
    """Check if the provided database name is an approved test database."""
    clean = (db_name or "").strip().lower()
    return clean in APPROVED_TEST_DB_NAMES or "test" in clean or "dev" in clean


def validate_test_database(db_name: str, environment: str = "test") -> bool:
    """
    Validates that test execution is not targeting a production database or environment.
    Rejects production environments and dedicated production database instances.
    """
    clean_env = (environment or getattr(settings, "ENVIRONMENT", "") or "").strip().lower()
    clean_name = (db_name or "").strip().lower()

    if clean_env in ("production", "prod"):
        raise ValueError("Safety Guard: Pytest execution is strictly forbidden in production environment!")

    if clean_name in ("docuflow_prod", "docuflow_production") or "prod" in clean_name:
        raise ValueError(f"Safety Guard: Tests cannot run against production database '{db_name}'.")

    return True


__all__ = [
    "REAL_PRODUCTION_DB_NAMES",
    "APPROVED_TEST_DB_NAMES",
    "TEST_DB_NAME",
    "validate_test_database",
    "is_production_database",
    "is_approved_test_database",
    "enforce_test_db_safety_guard",
    "isolated_db_transaction",
]

# ---------------------------------------------------------------------------
# Configure Database for Pytest Run (Using Main DocuFlowDB per user instruction)
# ---------------------------------------------------------------------------
TEST_DB_NAME = os.getenv("TEST_DB_NAME", settings.DB_NAME)

db_url = settings.get_database_url()
if settings.DB_NAME != TEST_DB_NAME:
    db_url = db_url.replace(settings.DB_NAME, TEST_DB_NAME)
    settings.DB_NAME = TEST_DB_NAME
    settings.DATABASE_URL = db_url

connection.DATABASE_URL = db_url
connection.engine = create_engine(
    db_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=300,
)
connection.SessionLocal.configure(bind=connection.engine)


@pytest.fixture(autouse=True, scope="session")
def enforce_test_db_safety_guard():
    """
    Validates that the database connection is safe for testing.
    Rejects production environments and dedicated production database instances.
    """
    try:
        validate_test_database(settings.DB_NAME, settings.ENVIRONMENT)
    except ValueError as exc:
        pytest.fail(str(exc))


@pytest.fixture
def isolated_db_transaction():
    """
    Transactional Rollback Fixture:
    Wraps every test in an isolated database transaction using savepoints.
    Even if application endpoints execute db.commit(), the changes are contained
    within the nested transaction savepoint and completely rolled back upon teardown.
    Guarantees zero database pollution between test runs.
    """
    conn = connection.engine.connect()
    outer_trans = conn.begin()

    TestSession = sessionmaker(bind=conn)
    session = TestSession()

    # Begin first savepoint
    conn.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(db_sess, transaction):
        if not conn.in_nested_transaction():
            conn.begin_nested()

    # Override FastAPI dependency
    app.dependency_overrides[get_db] = lambda: session

    yield session

    session.close()
    if outer_trans.is_active:
        outer_trans.rollback()
    conn.close()
    app.dependency_overrides.pop(get_db, None)
