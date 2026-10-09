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

REAL_PRODUCTION_DB_NAMES = {"docuflowdb", "docuflow_prod", "docuflow_production"}

# ---------------------------------------------------------------------------
# Configure Isolated Test Database for Pytest Run
# ---------------------------------------------------------------------------
TEST_DB_NAME = os.getenv("TEST_DB_NAME", "DocuFlowDB_Test")

# Reconfigure settings and connection to use the isolated test database
test_url = settings.get_database_url().replace(settings.DB_NAME, TEST_DB_NAME)
settings.DB_NAME = TEST_DB_NAME
settings.DATABASE_URL = test_url

connection.DATABASE_URL = test_url
connection.engine = create_engine(
    test_url,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=300,
)
connection.SessionLocal.configure(bind=connection.engine)


@pytest.fixture(autouse=True, scope="session")
def enforce_test_db_safety_guard():
    """
    Safety Guard: Fails the test suite immediately if tests attempt to execute
    against the real production database name.
    """
    current_db = getattr(settings, "DB_NAME", "").strip().lower()
    env = getattr(settings, "ENVIRONMENT", "").strip().lower()

    if env in ("production", "prod"):
        pytest.fail("Safety Guard Violation: Pytest execution is strictly forbidden in production environment!")

    if current_db in REAL_PRODUCTION_DB_NAMES:
        pytest.fail(
            f"Safety Guard Violation: Tests cannot run against the real database '{settings.DB_NAME}'. "
            "Tests must run against a separate test database (e.g. DocuFlowDB_Test)."
        )


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
    nested = conn.begin_nested()

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
