import sys
import os

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Role, Permission, RolePermission
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
    db.close()

@pytest.fixture(scope="module")
def auth_tokens(db_session):
    admin_user = db_session.query(User).filter(User.username == "admin").first()
    if not admin_user:
        admin_user = db_session.query(User).filter(User.role.in_(["admin", "administrator", "system_admin"])).first()
    assert admin_user is not None, "Admin user must exist in test database"

    normal_user = db_session.query(User).filter(User.username == "Nattudurai").first()
    if not normal_user:
        normal_user = db_session.query(User).filter(User.role.notin_(["admin", "administrator", "system_admin"])).first()
    assert normal_user is not None, "Normal user must exist in test database"

    return {
        "admin": admin_user,
        "token_admin": create_access_token({"sub": admin_user.username, "role": admin_user.role}),
        "normal": normal_user,
        "token_normal": create_access_token({"sub": normal_user.username, "role": normal_user.role}),
    }


def test_1_get_roles_list(auth_tokens):
    """1. Verify GET /api/admin/roles returns role list."""
    res = client.get(
        "/api/admin/roles",
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    codes = [r["code"] for r in data]
    assert "admin" in codes
    assert "employee" in codes


def test_2_post_create_custom_role(auth_tokens, db_session):
    """2. Verify POST /api/admin/roles creates custom role in database."""
    test_code = "account_uploader_test"
    # Cleanup if pre-exists
    existing = db_session.query(Role).filter(Role.code == test_code).first()
    if existing:
        db_session.query(User).filter(User.role_id == existing.id).update({User.role_id: None})
        db_session.query(RolePermission).filter(RolePermission.role_id == existing.id).delete()
        db_session.delete(existing)
        db_session.commit()

    payload = {
        "code": test_code,
        "name": "Account Uploader Test",
        "description": "Test custom role created by test suite",
        "permissions": ["doc:view", "doc:upload"]
    }
    res = client.post(
        "/api/admin/roles",
        json=payload,
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["code"] == test_code
    assert data["name"] == "Account Uploader Test"

    # Verify present in dbo.roles SQL Server database
    role_in_db = db_session.query(Role).filter(Role.code == test_code).first()
    assert role_in_db is not None
    assert role_in_db.name == "Account Uploader Test"


def test_3_post_duplicate_role_code(auth_tokens):
    """3. Verify POST /api/admin/roles rejects duplicate role codes."""
    payload = {
        "code": "account_uploader_test",
        "name": "Account Uploader Duplicate",
        "description": "Duplicate attempt",
        "permissions": []
    }
    res = client.post(
        "/api/admin/roles",
        json=payload,
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 400
    assert "already exists" in res.json()["detail"].lower()


def test_4_put_role_permissions(auth_tokens, db_session):
    """4. Verify PUT /api/admin/roles/{role_id}/permissions updates permission assignments."""
    role_in_db = db_session.query(Role).filter(Role.code == "account_uploader_test").first()
    assert role_in_db is not None

    payload = {
        "permission_codes": ["doc:view", "doc:upload"]
    }
    res = client.put(
        f"/api/admin/roles/{role_in_db.id}/permissions",
        json=payload,
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 200, res.text

    # Check dbo.role_permissions in database
    assigned_perm_ids = [rp.permission_id for rp in db_session.query(RolePermission).filter(RolePermission.role_id == role_in_db.id).all()]
    assigned_perms = db_session.query(Permission).filter(Permission.id.in_(assigned_perm_ids)).all()
    assigned_codes = [p.code for p in assigned_perms]

    assert "doc:view" in assigned_codes
    assert "doc:upload" in assigned_codes


def test_5_cleanup_test_role(db_session):
    """5. Cleanup test role from database after test run."""
    role_in_db = db_session.query(Role).filter(Role.code == "account_uploader_test").first()
    if role_in_db:
        db_session.query(User).filter(User.role_id == role_in_db.id).update({User.role_id: None})
        db_session.query(RolePermission).filter(RolePermission.role_id == role_in_db.id).delete()
        db_session.delete(role_in_db)
        db_session.commit()
    print("Test cleanup completed successfully.")
