import os
import sys
import datetime
import pytest

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture
def sec03_user():
    db = SessionLocal()
    # Find active user
    user = db.query(User).filter(User.is_active == True, User.is_deleted == False).first()
    assert user is not None
    user.active_session_id = "initial-session-12345"
    db.commit()
    db.refresh(user)
    username = user.username
    db.close()
    return username

def test_token_with_valid_session_id_accepted(sec03_user):
    """Verify that a token with matching active_session_id is accepted."""
    token = create_access_token(data={"sub": sec03_user, "session_id": "initial-session-12345"})
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json().get("username") == sec03_user

def test_token_invalidated_when_session_displaced(sec03_user):
    """Verify that when active_session_id changes (new login), old token is rejected with 401."""
    token_old = create_access_token(data={"sub": sec03_user, "session_id": "initial-session-12345"})
    
    # Verify works before displacement
    res1 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_old}"})
    assert res1.status_code == 200

    # Displace session in DB
    db = SessionLocal()
    user = db.query(User).filter(User.username == sec03_user).first()
    user.active_session_id = "displaced-session-99999"
    db.commit()
    db.close()

    # Old token must now be rejected
    res2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token_old}"})
    assert res2.status_code == 401
    assert "session" in res2.json().get("detail", "").lower()

def test_token_invalidated_on_logout(sec03_user):
    """Verify that logout clears active_session_id and invalidates the token."""
    db = SessionLocal()
    user = db.query(User).filter(User.username == sec03_user).first()
    user.active_session_id = "logout-test-session"
    db.commit()
    db.close()

    token = create_access_token(data={"sub": sec03_user, "session_id": "logout-test-session"})
    
    # Logout using this token
    res_logout = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert res_logout.status_code == 200

    # Token must now be rejected because active_session_id is None
    res_after = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res_after.status_code == 401

def test_expired_token_rejected_with_401(sec03_user):
    """Verify that expired tokens are strictly rejected."""
    expired_token = create_access_token(
        data={"sub": sec03_user, "session_id": "initial-session-12345"},
        expires_delta=datetime.timedelta(seconds=-10)
    )
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert res.status_code == 401
