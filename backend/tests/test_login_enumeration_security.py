import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import get_password_hash
from app.database.connection import SessionLocal, engine, get_db
from app.database.models import User, Role, AuditLog, UserAccessLog

client = TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    """Module-level transactional session that rolls back all test changes."""
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    session.commit = session.flush

    app.dependency_overrides[get_db] = lambda: session
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="module")
def login_test_setup(db_session):
    role_emp = db_session.query(Role).filter(Role.code == "TEST_LOGIN_EMP").first()
    if not role_emp:
        role_emp = Role(code="TEST_LOGIN_EMP", name="TestLoginEmployeeRole", description="Test role")
        db_session.add(role_emp)
        db_session.flush()

    # 1. Active valid user
    user_active = db_session.query(User).filter(User.username == "enum_test_active_user").first()
    if not user_active:
        user_active = User(
            user_uid=f"EUID_{uuid.uuid4().hex[:12]}",
            username="enum_test_active_user",
            email="enum_active@company.com",
            employee_id="ENUM_EMP_01",
            employee_name="Enum Active User",
            name="Enum Active User",
            password_hash=get_password_hash("CorrectPassword123!"),
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_active)

    # 2. Deactivated user
    user_deactivated = db_session.query(User).filter(User.username == "enum_test_deactivated_user").first()
    if not user_deactivated:
        user_deactivated = User(
            user_uid=f"EUID_{uuid.uuid4().hex[:12]}",
            username="enum_test_deactivated_user",
            email="enum_deactivated@company.com",
            employee_id="ENUM_EMP_02",
            employee_name="Enum Deactivated User",
            name="Enum Deactivated User",
            password_hash=get_password_hash("CorrectPassword123!"),
            role="employee",
            role_id=role_emp.id,
            is_active=False,
        )
        db_session.add(user_deactivated)
    else:
        user_deactivated.is_active = False

    db_session.commit()

    yield {
        "active_user": user_active,
        "deactivated_user": user_deactivated,
    }


def test_login_responses_are_identical_across_failure_modes(login_test_setup):
    """
    To prevent user enumeration, unknown user, deactivated user, and wrong password
    must return identical HTTP 401 status codes and identical error messages.
    """
    generic_error = "Invalid username or password"

    # Case 1: Unknown user
    res_unknown = client.post(
        "/api/auth/login",
        json={"username": "totally_nonexistent_user_xyz", "password": "AnyPassword123!"},
    )
    assert res_unknown.status_code == 401
    assert res_unknown.json() == {"detail": generic_error}

    # Case 2: Deactivated user
    res_deactivated = client.post(
        "/api/auth/login",
        json={"username": "enum_test_deactivated_user", "password": "CorrectPassword123!"},
    )
    assert res_deactivated.status_code == 401
    assert res_deactivated.json() == {"detail": generic_error}

    # Case 3: Wrong password for active user
    res_wrong_pw = client.post(
        "/api/auth/login",
        json={"username": "enum_test_active_user", "password": "WrongPassword999!"},
    )
    assert res_wrong_pw.status_code == 401
    assert res_wrong_pw.json() == {"detail": generic_error}

    # Verify that all 3 responses are completely indistinguishable
    assert res_unknown.status_code == res_deactivated.status_code == res_wrong_pw.status_code
    assert res_unknown.json() == res_deactivated.json() == res_wrong_pw.json()


def test_internal_audit_logs_record_real_failure_reasons(login_test_setup, db_session):
    """
    While client receives identical generic errors, internal audit logs
    (AuditLog and UserAccessLog) must preserve the precise failure reason.
    """
    # 1. Test Unknown user audit log
    unknown_name = f"unknown_{uuid.uuid4().hex[:8]}"
    client.post("/api/auth/login", json={"username": unknown_name, "password": "password"})

    access_log_unknown = (
        db_session.query(UserAccessLog)
        .filter(UserAccessLog.username == unknown_name)
        .order_by(UserAccessLog.id.desc())
        .first()
    )
    assert access_log_unknown is not None
    assert access_log_unknown.status == "FAILED"
    assert "not found in system" in access_log_unknown.failure_reason

    # 2. Test Deactivated user audit log
    client.post(
        "/api/auth/login",
        json={"username": "enum_test_deactivated_user", "password": "password"},
    )
    access_log_deact = (
        db_session.query(UserAccessLog)
        .filter(UserAccessLog.username == "enum_test_deactivated_user")
        .order_by(UserAccessLog.id.desc())
        .first()
    )
    assert access_log_deact is not None
    assert access_log_deact.status == "FAILED"
    assert "deactivated" in access_log_deact.failure_reason.lower()

    # 3. Test Wrong password audit log
    client.post(
        "/api/auth/login",
        json={"username": "enum_test_active_user", "password": "WrongPassword999!"},
    )
    access_log_wrong = (
        db_session.query(UserAccessLog)
        .filter(UserAccessLog.username == "enum_test_active_user")
        .order_by(UserAccessLog.id.desc())
        .first()
    )
    assert access_log_wrong is not None
    assert access_log_wrong.status == "FAILED"
    assert "Invalid credentials" in access_log_wrong.failure_reason
