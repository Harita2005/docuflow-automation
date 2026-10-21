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
from app.auth import get_password_hash
from app.services.mfa_service import get_mfa_ticket
from app.config.settings import settings

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def mfa_user(db_session):
    """Find or ensure a user with mfa_enabled == True."""
    user = db_session.query(User).filter(User.username == "admin").first()
    assert user is not None, "Admin user must exist"
    user.mfa_enabled = True
    user.password_hash = get_password_hash("password123")
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture(scope="module")
def non_mfa_user(db_session):
    """Find or configure a user with mfa_enabled == False."""
    user = db_session.query(User).filter(User.username != "admin", User.is_active == True, User.is_deleted == False).first()
    assert user is not None, "Active non-admin user must exist"
    user.mfa_enabled = False
    user.password_hash = get_password_hash("testpassword123")
    db_session.commit()
    db_session.refresh(user)
    return user

def test_1_mfa_enabled_user_password_does_not_return_jwt_and_requires_mfa(mfa_user):
    """1. MFA-enabled user submitting valid username + password must receive an MFA challenge, NOT a JWT."""
    res = client.post(
        "/api/auth/login",
        json={"username": mfa_user.username, "password": "password123"}
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # CRITICAL: No JWT must be returned
    assert data.get("token") is None, "Security Violation: JWT returned before completing MFA"
    assert data.get("access_token") is None, "Security Violation: access_token returned before completing MFA"

    # MFA challenge must be enforced
    assert data.get("mfa_required") is True
    assert data.get("mfa_ticket") is not None
    assert isinstance(data.get("available_methods"), list)
    assert len(data.get("available_methods")) > 0

def test_2_mfa_enabled_user_completes_mfa_and_receives_jwt(mfa_user):
    """2. MFA-enabled user receives final JWT only AFTER completing MFA verification."""
    # Step 1: Submit password and receive MFA ticket
    res_login = client.post(
        "/api/auth/login",
        json={"username": mfa_user.username, "password": "password123"}
    )
    assert res_login.status_code == 200
    ticket = res_login.json().get("mfa_ticket")
    assert ticket is not None

    # Step 2: Request OTP dispatch with patched generator
    from unittest.mock import patch
    with patch("app.routers.auth.generate_numeric_otp", return_value="654321"):
        res_send = client.post(
            "/api/auth/mfa/send-otp",
            json={"ticket": ticket, "method": "EMAIL"}
        )
        assert res_send.status_code == 200
        assert "otp" not in res_send.json()  # Issue 1 preservation: No OTP in response

        # Step 3: Verify ticket data stores hashed OTP and NO plaintext OTP
        ticket_data = get_mfa_ticket(ticket)
        assert ticket_data is not None
        assert ticket_data.get("otp") is None, "Security violation: Plaintext OTP present in ticket"
        assert ticket_data.get("otp_hash") is not None, "otp_hash must be stored"

        # Step 4: Verify MFA
        res_verify = client.post(
            "/api/auth/mfa/verify",
            json={"ticket": ticket, "method": "EMAIL", "code": "654321", "force_login": True}
        )
        assert res_verify.status_code == 200, res_verify.text
        verify_data = res_verify.json()

        # JWT must be successfully issued upon completing MFA
        assert verify_data.get("access_token") is not None
        assert verify_data.get("token_type") == "bearer"
        assert verify_data.get("user") is not None
        assert verify_data["user"]["username"] == mfa_user.username

def test_3_mfa_enabled_user_wrong_password_rejected(mfa_user):
    """3. Invalid password for MFA-enabled user is rejected with HTTP 401."""
    res = client.post(
        "/api/auth/login",
        json={"username": mfa_user.username, "password": "incorrect_password_999"}
    )
    assert res.status_code == 401
    assert "invalid" in res.json().get("detail", "").lower()

def test_4_non_mfa_user_password_returns_jwt_directly(non_mfa_user):
    """4. Non-MFA user submitting valid password retains the direct password -> JWT flow."""
    res = client.post(
        "/api/auth/login",
        json={"username": non_mfa_user.username, "password": "testpassword123"}
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # Direct JWT issuance for non-MFA users
    assert data.get("mfa_required") is False
    assert data.get("access_token") is not None
    assert data.get("token_type") == "bearer"
    assert data.get("user") is not None
    assert data["user"]["username"] == non_mfa_user.username

def test_5_non_mfa_user_wrong_password_rejected(non_mfa_user):
    """5. Invalid password for non-MFA user is rejected with HTTP 401."""
    res = client.post(
        "/api/auth/login",
        json={"username": non_mfa_user.username, "password": "incorrect_password_999"}
    )
    assert res.status_code == 401
    assert "invalid" in res.json().get("detail", "").lower()

def test_6_frontend_identifier_only_flow_preserved(non_mfa_user):
    """6. Submitting username without password preserves the existing frontend MFA challenge flow."""
    res = client.post(
        "/api/auth/login",
        json={"username": non_mfa_user.username}
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data.get("mfa_required") is True
    assert data.get("mfa_ticket") is not None
    assert data.get("token") is None

def test_7_m2m_service_auth_preserved():
    """7. M2M service authentication via X-API-Key header remains completely intact."""
    service_key = settings.SERVICE_API_KEY
    res = client.post(
        "/api/sync/record",
        headers={"X-API-Key": service_key},
        json={
            "document_number": "TEST-M2M-PRESERVED-001",
            "invoice_number": "TEST-M2M-PRESERVED-001",
            "document_type": "AP INVOICE",
            "vendor_name": "Test M2M Vendor",
            "amount": 1000.0
        }
    )
    # The endpoint must recognize the service credentials (HTTP 200 or 201)
    assert res.status_code in [200, 201], f"M2M auth failed with status {res.status_code}: {res.text}"
