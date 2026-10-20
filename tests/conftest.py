import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.config.settings import settings
from app.database import connection
from app.database.connection import get_db, SessionLocal
from app.database.models import User
from app.main import app
from app.auth import create_access_token

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
    "validate_test_database",
    "is_production_database",
    "is_approved_test_database",
]


@pytest.fixture(scope="session")
def client():
    """Shared FastAPI TestClient instance."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def db_session():
    """Read-only database session for read checks."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def isolated_db():
    """
    Transactional Rollback Fixture:
    Wraps the test inside an isolated database savepoint transaction.
    Any updates or inserts are completely rolled back upon teardown,
    guaranteeing zero test data pollution in live business records.
    """
    conn = connection.engine.connect()
    outer_trans = conn.begin()

    TestSession = sessionmaker(bind=conn)
    session = TestSession()

    conn.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(db_sess, transaction):
        if not conn.in_nested_transaction():
            conn.begin_nested()

    app.dependency_overrides[get_db] = lambda: session

    yield session

    session.close()
    if outer_trans.is_active:
        outer_trans.rollback()
    conn.close()
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture(scope="session")
def auth_tokens(db_session):
    """
    Fetches real users or generates valid signed JWT tokens for testing:
    - Admin
    - Employee
    - Approver / Manager
    """
    admin = db_session.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = db_session.query(User).filter(User.role == "admin").first()

    employee = db_session.query(User).filter(User.username == "YUVASREE").first()
    if not employee:
        employee = db_session.query(User).filter(User.role == "employee", User.is_active == True).first()

    approver = db_session.query(User).filter(User.username == "VIGNESH").first()
    if not approver:
        approver = db_session.query(User).filter(User.role == "manager", User.is_active == True).first()

    token_admin = create_access_token({"sub": admin.username if admin else "admin", "role": admin.role if admin else "admin"})
    token_emp = create_access_token({"sub": employee.username if employee else "YUVASREE", "role": employee.role if employee else "employee"})
    token_approver = create_access_token({"sub": approver.username if approver else "VIGNESH", "role": approver.role if approver else "manager"})

    return {
        "admin_user": admin,
        "employee_user": employee,
        "approver_user": approver,
        "admin_token": token_admin,
        "employee_token": token_emp,
        "approver_token": token_approver,
        "admin_headers": {"Authorization": f"Bearer {token_admin}"},
        "employee_headers": {"Authorization": f"Bearer {token_emp}"},
        "approver_headers": {"Authorization": f"Bearer {token_approver}"},
        "service_api_key_headers": {"X-API-Key": settings.SERVICE_API_KEY},
    }
