import datetime
import uuid
import pytest
import jwt
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User
from app.auth import get_password_hash
from app.config.settings import settings

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_test_users():
    db = SessionLocal()
    # Clean up any preexisting test users
    db.query(User).filter(User.username.in_(["zero_day_admin", "zero_day_nomfa"])).delete()
    db.commit()

    # User 1: Admin user with MFA enabled
    admin_user = User(
        user_uid=str(uuid.uuid4()),
        employee_id="ZD_EMP_01",
        employee_name="Zero Day Admin",
        name="Zero Day Admin",
        username="zero_day_admin",
        email="zd_admin@example.com",
        role="admin",
        division="VCC",
        password_hash=get_password_hash("SecretPassword123!"),
        must_change_password=False,
        mfa_enabled=True,
        is_active=True,
    )
    # User 2: Standard user with MFA disabled
    nomfa_user = User(
        user_uid=str(uuid.uuid4()),
        employee_id="ZD_EMP_02",
        employee_name="Zero Day NoMFA",
        name="Zero Day NoMFA",
        username="zero_day_nomfa",
        email="zd_nomfa@example.com",
        role="employee",
        division="VCC",
        password_hash=get_password_hash("SecretPassword123!"),
        must_change_password=False,
        mfa_enabled=False,
        is_active=True,
    )
    db.add(admin_user)
    db.add(nomfa_user)
    db.commit()
    db.refresh(admin_user)
    db.refresh(nomfa_user)

    yield {
        "admin_id": admin_user.id,
        "admin_username": admin_user.username,
        "nomfa_id": nomfa_user.id,
        "nomfa_username": nomfa_user.username,
    }

    # Teardown
    db.query(User).filter(User.username.in_(["zero_day_admin", "zero_day_nomfa"])).delete()
    db.commit()
    db.close()


def test_zero_day_empty_password_bypass_blocked(setup_test_users):
    """
    CRITICAL: Verify that sending an empty password string with force_login=True
    CANNOT bypass authentication and never returns an access token.
    Instead, it returns an MFA challenge ticket.
    """
    res = client.post("/api/auth/login", json={
        "username": setup_test_users["admin_username"],
        "password": "",
        "force_login": True,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("token") is None, "Zero-day bypass exploit! Access token must NEVER be returned for empty password."
    assert data.get("access_token") is None
    assert data.get("mfa_required") is True
    assert data.get("mfa_ticket") is not None

    # Verify that trying to verify with empty password or invalid password fails
    verify_res = client.post("/api/auth/mfa/verify", json={
        "ticket": data["mfa_ticket"],
        "method": "PASSWORD",
        "code": "WrongPassword!",
    })
    assert verify_res.status_code == 400


def test_zero_day_whitespace_password_blocked(setup_test_users):
    """Verify whitespace password never returns an access token."""
    res = client.post("/api/auth/login", json={
        "username": setup_test_users["admin_username"],
        "password": "   ",
        "force_login": True,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("token") is None
    assert data.get("mfa_required") is True


def test_zero_day_force_login_cannot_bypass_mfa(setup_test_users):
    """
    Verify that providing the correct password with force_login=True for an MFA-enabled
    user returns an MFA challenge ticket, NOT a direct access token.
    """
    res = client.post("/api/auth/login", json={
        "username": setup_test_users["admin_username"],
        "password": "SecretPassword123!",
        "force_login": True,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("mfa_required") is True
    assert data.get("token") is None
    assert data.get("access_token") is None
    assert data.get("mfa_ticket") is not None


def test_jwt_unsigned_alg_none_rejected(setup_test_users):
    """
    Verify that an unsigned JWT with alg='none' is strictly rejected.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    unsigned_token = jwt.encode(
        {
            "sub": setup_test_users["admin_username"],
            "exp": now + datetime.timedelta(hours=1),
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
        },
        key="",
        algorithm="none",
    )
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {unsigned_token}"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_jwt_wrong_secret_signature_rejected(setup_test_users):
    """
    Verify that a JWT signed with a forged or wrong secret key is rejected.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    forged_token = jwt.encode(
        {
            "sub": setup_test_users["admin_username"],
            "exp": now + datetime.timedelta(hours=1),
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
        },
        key="wrong-secret-key-12345678901234567890",
        algorithm="HS256",
    )
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged_token}"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_jwt_expired_token_rejected(setup_test_users):
    """
    Verify that an expired JWT is strictly rejected.
    """
    past = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2)
    expired_token = jwt.encode(
        {
            "sub": setup_test_users["admin_username"],
            "exp": past,
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
        },
        key=settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_jwt_wrong_issuer_or_audience_rejected(setup_test_users):
    """
    Verify that a JWT with incorrect issuer or audience claim is rejected.
    """
    now = datetime.datetime.now(datetime.timezone.utc)
    bad_iss_token = jwt.encode(
        {
            "sub": setup_test_users["admin_username"],
            "exp": now + datetime.timedelta(hours=1),
            "iss": "rogue-issuer",
            "aud": settings.JWT_AUDIENCE,
        },
        key=settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad_iss_token}"})
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"


def test_jwt_session_id_enforcement_and_valid_login(setup_test_users):
    """
    Verify legitimate login produces valid JWT that successfully authenticates,
    and stripping session_id from the token is rejected when user has an active session.
    """
    res = client.post("/api/auth/login", json={
        "username": setup_test_users["nomfa_username"],
        "password": "SecretPassword123!",
    })
    assert res.status_code == 200, res.text
    data = res.json()
    valid_token = data["token"]
    assert valid_token is not None

    # Verify legitimate token succeeds
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {valid_token}"})
    assert me_res.status_code == 200, me_res.text
    assert me_res.json()["username"] == setup_test_users["nomfa_username"]

    # Now craft a token for this user without session_id
    now = datetime.datetime.now(datetime.timezone.utc)
    token_without_session = jwt.encode(
        {
            "sub": setup_test_users["nomfa_username"],
            "exp": now + datetime.timedelta(hours=1),
            "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE,
        },
        key=settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    no_sess_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_without_session}"})
    assert no_sess_res.status_code == 401, "Expected 401 for token missing required active session_id"


def test_forgot_password_does_not_leak_reset_token(setup_test_users):
    """
    LOOP-CR-02: Verify that forgot-password does NOT expose reset_token in JSON response.
    """
    res = client.post("/api/auth/forgot-password", json={
        "identifier": setup_test_users["nomfa_username"]
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("success") is True
    assert "reset_token" not in data
