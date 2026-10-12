import pytest
import os
import sys
import json

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# Ensure we import the app
from app.main import app
from app.database.connection import get_db, SessionLocal
from app.database.models import User, Invoice, Role, Permission

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class TestAuthenticationAndSessions:
    """Audit tests for Phase 2.A: Authentication and Sessions"""

    def test_auth_empty_password_generates_mfa_ticket_flaw(self, db_session):
        """
        Finding A-01: Submitting login request with NO password returns an MFA ticket,
        allowing password-less progression if OTP is intercepted or dev mode enabled.
        """
        # Pick any active user
        user = db_session.query(User).filter(User.is_active == True, User.is_deleted == False).first()
        assert user is not None
        
        # Submit login with empty password
        res = client.post("/api/auth/login", json={"username": user.username, "password": ""})
        # If this returns 200 with mfa_ticket, this confirms the vulnerability
        if res.status_code == 200 and res.json().get("mfa_ticket"):
            pytest.fail(f"VULNERABILITY CONFIRMED: Empty password login returned MFA ticket: {res.json().get('mfa_ticket')}")
        assert res.status_code in [400, 401, 422], "Expected 401/422 rejection on empty password"

    def test_session_token_not_revoked_on_session_displacement(self, db_session):
        """
        Finding A-02: Old JWT access tokens remain fully accepted even after user.active_session_id changes or user logs out.
        """
        # Query admin user
        admin = db_session.query(User).filter(User.username == "admin", User.is_deleted == False).first()
        assert admin is not None
        
        # Perform login 1
        res1 = client.post("/api/auth/login", json={"username": "admin", "password": "password123", "force_login": True})
        if res1.status_code != 200 or not res1.json().get("access_token"):
            pytest.skip("Admin login requires MFA or different password in this environment")
            
        token1 = res1.json()["access_token"]
        session1 = res1.json().get("session_id")
        
        # Verify token 1 works
        res_me1 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token1}"})
        assert res_me1.status_code == 200
        
        # Simulate logout or new session
        admin.active_session_id = "new-displaced-session-uuid"
        db_session.commit()
        
        # Attempt to access /api/auth/me using token 1
        res_me_displaced = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token1}"})
        if res_me_displaced.status_code == 200:
            pytest.fail("VULNERABILITY CONFIRMED: Token 1 was still accepted after session_id was changed in DB!")


class TestAuthorizationAndIDOR:
    """Audit tests for Phase 2.B: Authorization and Access Control"""

    def test_anonymous_access_to_admin_roles(self):
        """
        Finding B-01: GET /api/admin/roles is completely unauthenticated.
        """
        res = client.get("/api/admin/roles")
        if res.status_code == 200:
            pytest.fail("VULNERABILITY CONFIRMED: Anonymous user was able to fetch roles from /api/admin/roles")
        assert res.status_code in [401, 403]

    def test_anonymous_access_to_workflows(self):
        """
        Finding B-02: GET /api/admin/workflows is unauthenticated.
        """
        res = client.get("/api/admin/workflows")
        if res.status_code == 200:
            pytest.fail("VULNERABILITY CONFIRMED: Anonymous user was able to fetch workflows from /api/admin/workflows")
        assert res.status_code in [401, 403]

    def test_anonymous_access_to_sse_events(self):
        """
        Finding B-03: GET /api/events/stream is unauthenticated.
        """
        # Testing route definition
        from app.main import app
        for route in app.routes:
            if getattr(route, "path", "") == "/api/events/stream":
                if not any("auth" in str(d).lower() or "user" in str(d).lower() for d in route.dependencies):
                    pytest.fail("VULNERABILITY CONFIRMED: /api/events/stream has no authentication dependencies")


class TestSSRFAndWebhooks:
    """Audit tests for Phase 2.E: SSRF and Webhooks"""

    def test_ssrf_validator_permits_localhost_and_internal_ips(self):
        """
        Finding E-01: validate_url_ssrf only checks protocol, allowing localhost and internal IPs.
        """
        from app.services.callback_service import validate_url_ssrf
        
        dangerous_urls = [
            "http://127.0.0.1:8000/api/admin/roles",
            "http://localhost:1433",
            "http://169.254.169.254/latest/meta-data/",
            "http://10.0.0.1/internal"
        ]
        
        for url in dangerous_urls:
            try:
                validate_url_ssrf(url)
                pytest.fail(f"VULNERABILITY CONFIRMED: validate_url_ssrf permitted dangerous internal URL: {url}")
            except (ValueError, Exception):
                pass
