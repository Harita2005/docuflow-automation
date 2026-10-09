import os
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.mfa_service import (
    create_mfa_ticket,
    is_email_otp_available,
)
from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import User, OTPVerification

client = TestClient(app)


@pytest.fixture(autouse=True)
def ensure_hardened_production_mode(monkeypatch):
    """Ensure tests 1-5 test hardened production mode where SHOW_OTP_IN_UI is False."""
    monkeypatch.setattr(settings, "SHOW_OTP_IN_UI", False)


@pytest.fixture(scope="module")
def test_users():
    session = SessionLocal()
    try:
        # User with email only, no phone, no authenticator
        user_email_only = session.query(User).filter((User.username == "test_locked_user") | (User.username == "testapprover")).first()
        if not user_email_only:
            user_email_only = User(
                user_uid="UID_test_locked_01",
                username="test_locked_user",
                employee_id="TEST_LOCK_01",
                email="locked.user@example.com",
                employee_name="Locked User",
                password_hash="testhash",
                mfa_enabled=True,
                is_active=True,
                is_deleted=False,
            )
            session.add(user_email_only)
            session.commit()
            session.refresh(user_email_only)

        # Active user with email and credentials
        user_with_email = session.query(User).filter(
            User.email != None,
            User.email != "",
            User.is_active == True,
            User.is_deleted == False,
        ).first()

        return {
            "user_email_only": user_email_only,
            "user_with_email": user_with_email,
        }
    finally:
        session.close()


def test_1_is_email_otp_available_detects_placeholders_and_missing():
    """Verify is_email_otp_available returns True only when all settings are valid and not placeholders."""
    # Completely empty config
    assert is_email_otp_available(smtp_config={}) is False

    # Missing password
    assert is_email_otp_available(smtp_config={
        "smtp_server": "smtp.gmail.com",
        "port": 587,
        "username": "user@gmail.com",
        "encrypted_password": "",
        "sender_email": "user@gmail.com",
    }) is False

    # Placeholder angle brackets from .env.example
    assert is_email_otp_available(smtp_config={
        "smtp_server": "<company SMTP host>",
        "port": 587,
        "username": "<company email>",
        "encrypted_password": "<company email password>",
        "sender_email": "<company email>",
    }) is False

    # Placeholder domain
    assert is_email_otp_available(smtp_config={
        "smtp_server": "smtp.example.com",
        "port": 587,
        "username": "test@example.com",
        "encrypted_password": "secretpassword",
        "sender_email": "noreply@example.com",
    }) is False

    # Valid production-like config
    assert is_email_otp_available(smtp_config={
        "smtp_server": "smtp.office365.com",
        "port": 587,
        "username": "alerts@company.org",
        "encrypted_password": "RealComplexPassword99!",
        "sender_email": "alerts@company.org",
    }) is True


def test_2_login_mfa_response_omits_email_when_smtp_not_configured(test_users):
    """When SMTP is not configured, available_methods must omit EMAIL and email_otp_available must be False."""
    with patch("app.routers.auth.is_email_otp_available", return_value=False):
        res = client.post(
            "/api/auth/login",
            json={"username": test_users["user_with_email"].username},
        )
        assert res.status_code == 200
        data = res.json()
        assert data.get("mfa_required") is True
        assert data.get("email_otp_available") is False
        assert "EMAIL" not in data.get("available_methods", [])


def test_3_send_otp_email_returns_503_and_creates_no_record_when_smtp_unset(test_users):
    """When SMTP is not configured, requesting send-otp EMAIL returns 503 and creates no OTP database record."""
    user = test_users["user_with_email"]
    ticket = create_mfa_ticket(user.id, user.username)

    session = SessionLocal()
    try:
        count_before = session.query(OTPVerification).filter(OTPVerification.user_id == user.id).count()

        with patch("app.routers.auth.is_email_otp_available", return_value=False):
            res = client.post(
                "/api/auth/mfa/send-otp",
                json={"ticket": ticket, "method": "EMAIL"},
            )

        assert res.status_code == 503
        data = res.json()
        assert data.get("detail") == "Email verification is not available right now. Please use your authenticator app or contact your administrator."
        # Confirm no cleartext OTP or code in response
        assert "otp" not in data
        assert "code" not in data

        count_after = session.query(OTPVerification).filter(OTPVerification.user_id == user.id).count()
        assert count_after == count_before, "Security violation: OTP record created despite SMTP 503 unavailability"
    finally:
        session.close()


def test_4_send_otp_email_succeeds_when_smtp_is_configured(test_users):
    """When SMTP is configured, current email OTP delivery functions normally."""
    user = test_users["user_with_email"]
    ticket = create_mfa_ticket(user.id, user.username)

    with patch("app.routers.auth.is_email_otp_available", return_value=True):
        with patch("app.routers.auth.send_email_otp", return_value=(True, "Code sent to test")):
            res = client.post(
                "/api/auth/mfa/send-otp",
                json={"ticket": ticket, "method": "EMAIL"},
            )

    assert res.status_code == 200
    data = res.json()
    assert data.get("success") is True
    assert data.get("method") == "EMAIL"
    assert "destination" in data
    # Guarantee no cleartext OTP returned
    assert "otp" not in data


def test_5_user_with_only_email_has_empty_available_methods_when_smtp_missing(test_users):
    """Users who have MFA enabled but no authenticator secret and no phone have empty available_methods when SMTP is unset."""
    user = test_users["user_email_only"]
    with patch("app.routers.auth.is_email_otp_available", return_value=False):
        res = client.post(
            "/api/auth/login",
            json={"username": user.username},
        )
        assert res.status_code == 200
        data = res.json()
        assert data.get("mfa_required") is True
        assert data.get("email_otp_available") is False
        assert data.get("available_methods") == [], f"Expected empty available_methods for locked user, got {data.get('available_methods')}"


def test_6_dev_testing_mode_returns_otp_when_show_otp_in_ui_is_true(test_users):
    """When SHOW_OTP_IN_UI is True (testing mode), OTP is returned in send-otp for UI display."""
    user = test_users["user_with_email"]
    ticket = create_mfa_ticket(user.id, user.username)
    with patch("app.routers.auth.should_show_dev_otp", return_value=True):
        res = client.post(
            "/api/auth/mfa/send-otp",
            json={"ticket": ticket, "method": "EMAIL"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data.get("success") is True
        assert "otp" in data
        assert len(data["otp"]) == 6
