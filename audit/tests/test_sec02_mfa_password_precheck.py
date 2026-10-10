import os
import sys
import pytest

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User
from app.auth import get_password_hash

client = TestClient(app)

@pytest.fixture(scope="module")
def sec02_setup():
    db = SessionLocal()
    # Find or create a test user with mfa_enabled = True
    mfa_user = db.query(User).filter(User.mfa_enabled == True, User.is_active == True, User.is_deleted == False).first()
    if not mfa_user:
        # Update or pick an active user to have mfa_enabled = True
        mfa_user = db.query(User).filter(User.is_active == True, User.is_deleted == False).first()
        if mfa_user:
            mfa_user.mfa_enabled = True
            db.commit()
            db.refresh(mfa_user)

    username = mfa_user.username if mfa_user else "admin"
    db.close()
    return {"username": username}

def test_empty_password_rejected_with_401(sec02_setup):
    """Verify login with empty string password returns HTTP 401 and NO mfa_ticket."""
    res = client.post("/api/auth/login", json={"username": sec02_setup["username"], "password": ""})
    assert res.status_code == 401
    data = res.json()
    assert data.get("detail") == "Invalid username or password"
    assert "mfa_ticket" not in data
    assert "access_token" not in data

def test_missing_password_rejected_with_401(sec02_setup):
    """Verify login with None / omitted password returns HTTP 401 and NO mfa_ticket."""
    res = client.post("/api/auth/login", json={"username": sec02_setup["username"]})
    assert res.status_code == 401
    data = res.json()
    assert data.get("detail") == "Invalid username or password"
    assert "mfa_ticket" not in data
    assert "access_token" not in data

def test_wrong_password_rejected_with_uniform_error(sec02_setup):
    """Verify login with wrong password returns uniform HTTP 401 error message."""
    res = client.post("/api/auth/login", json={"username": sec02_setup["username"], "password": "WrongPassword!999"})
    assert res.status_code == 401
    assert res.json().get("detail") == "Invalid username or password"

def test_unknown_user_rejected_with_uniform_error():
    """Verify login for nonexistent user returns identical HTTP 401 error message."""
    res = client.post("/api/auth/login", json={"username": "totally_nonexistent_user_999", "password": "AnyPassword123!"})
    assert res.status_code == 401
    assert res.json().get("detail") == "Invalid username or password"
