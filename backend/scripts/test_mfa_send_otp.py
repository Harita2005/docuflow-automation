import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config.test_safety import enforce_test_database_safety
enforce_test_database_safety()

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User
from app.services.mfa_service import create_mfa_ticket, get_mfa_ticket

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def active_user(db_session):
    user = db_session.query(User).filter(User.is_active == True, User.is_deleted == False).first()
    assert user is not None, "Active test user must exist in database"
    return user

@pytest.fixture(scope="module")
def deactivated_user(db_session):
    user = db_session.query(User).filter(User.is_active == False).first()
    if not user:
        user = User(
            user_uid="UID_test_deactivated_mfa",
            username="test_deact_mfa_user",
            employee_id="TEST_DEACT_MFA",
            email="deact.mfa@example.com",
            employee_name="Deactivated MFA User",
            name="Deactivated MFA User",
            password_hash="testpasshash",
            is_active=False,
            is_deleted=False
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    return user

def test_1_mfa_send_otp_does_not_return_otp_in_response(active_user):
    """1. Verify POST /api/auth/mfa/send-otp does NOT return cleartext OTP in the API response."""
    ticket = create_mfa_ticket(active_user.id, active_user.username)
    res = client.post(
        "/api/auth/mfa/send-otp",
        json={"ticket": ticket, "method": "EMAIL"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("success") is True
    assert data.get("method") == "EMAIL"
    assert "destination" in data
    assert "expires_in_seconds" in data
    # Security requirement: Cleartext OTP must not be in the response
    assert "otp" not in data, f"Security Violation: Cleartext OTP was returned in API response: {data.get('otp')}"

def test_2_mfa_send_otp_invalid_ticket():
    """2. Verify POST /api/auth/mfa/send-otp rejects invalid or forged tickets."""
    res = client.post(
        "/api/auth/mfa/send-otp",
        json={"ticket": "non_existent_fake_ticket_12345", "method": "EMAIL"}
    )
    assert res.status_code == 400
    assert "expired or invalid" in res.json().get("detail", "").lower()

def test_3_mfa_send_otp_nonexistent_user():
    """3. Verify POST /api/auth/mfa/send-otp returns 404 if ticket references non-existent user."""
    ticket = create_mfa_ticket(99999999, "nonexistent_ghost_user")
    res = client.post(
        "/api/auth/mfa/send-otp",
        json={"ticket": ticket, "method": "EMAIL"}
    )
    assert res.status_code == 404
    assert "not found" in res.json().get("detail", "").lower()

def test_4_mfa_send_otp_deactivated_user(deactivated_user):
    """4. Verify POST /api/auth/mfa/send-otp denies access to deactivated accounts."""
    ticket = create_mfa_ticket(deactivated_user.id, deactivated_user.username)
    res = client.post(
        "/api/auth/mfa/send-otp",
        json={"ticket": ticket, "method": "EMAIL"}
    )
    assert res.status_code == 403
    assert "deactivated" in res.json().get("detail", "").lower()

def test_5_mfa_send_otp_rate_limiting(active_user):
    """5. Verify resending OTP within 60s is rate-limited with HTTP 429."""
    ticket = create_mfa_ticket(active_user.id, active_user.username)
    res1 = client.post(
        "/api/auth/mfa/send-otp",
        json={"ticket": ticket, "method": "EMAIL"}
    )
    assert res1.status_code == 200

    # Immediate second request on the same method
    res2 = client.post(
        "/api/auth/mfa/send-otp",
        json={"ticket": ticket, "method": "EMAIL"}
    )
    assert res2.status_code == 429
    assert "wait" in res2.json().get("detail", "").lower()

def test_6_mfa_verification_with_valid_and_invalid_code(active_user):
    """6. Verify OTP verification functions correctly without relying on plaintext OTP in response or ticket."""
    from unittest.mock import patch

    ticket = create_mfa_ticket(active_user.id, active_user.username)
    with patch("app.routers.auth.generate_numeric_otp", return_value="543210"):
        res_send = client.post(
            "/api/auth/mfa/send-otp",
            json={"ticket": ticket, "method": "EMAIL"}
        )
        assert res_send.status_code == 200
        assert "otp" not in res_send.json()

        # Ticket must store hashed OTP and NO plaintext OTP
        ticket_data = get_mfa_ticket(ticket)
        assert ticket_data is not None
        assert ticket_data.get("otp") is None, "Security violation: Plaintext OTP present in ticket"
        assert ticket_data.get("otp_hash") is not None, "otp_hash must be stored"

    # Test invalid code first
    res_bad = client.post(
        "/api/auth/mfa/verify",
        json={"ticket": ticket, "method": "EMAIL", "code": "000000"}
    )
    assert res_bad.status_code == 400
    assert "invalid verification code" in res_bad.json().get("detail", "").lower()

    # Test valid code
    res_good = client.post(
        "/api/auth/mfa/verify",
        json={"ticket": ticket, "method": "EMAIL", "code": "543210"}
    )
    assert res_good.status_code == 200, res_good.text
    token_data = res_good.json()
    assert "access_token" in token_data
    assert token_data.get("token_type") == "bearer"
