import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Role, Permission, RolePermission
from app.auth import create_access_token
from app.services.rbac_service import check_permission

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
        normal_user = db_session.query(User).filter(User.role.notin_(["admin", "administrator", "system_admin", "superadmin"])).first()
    assert normal_user is not None, "Normal user must exist in test database"

    # Ensure normal user has a non-admin role attached for role tests
    manager_role = db_session.query(Role).filter(Role.code == "manager").first()
    if manager_role and normal_user.role_id != manager_role.id:
        normal_user.role_id = manager_role.id
        db_session.commit()
        db_session.refresh(normal_user)

    return {
        "admin": admin_user,
        "token_admin": create_access_token({"sub": admin_user.username, "role": admin_user.role}),
        "normal": normal_user,
        "token_normal": create_access_token({"sub": normal_user.username, "role": normal_user.role}),
    }


def test_get_permissions_registry(auth_tokens):
    """1. Validates structure of registry endpoint."""
    res = client.get(
        "/api/admin/permissions/registry",
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "modules" in data
    assert "subpages" in data
    assert "actions" in data
    assert "scopes" in data
    assert "DOC" in data["modules"]
    assert "detail" in data["subpages"]["DOC"]
    assert "VIEW" in data["actions"]
    assert "ALL" in data["scopes"]


def test_create_custom_permission_success(auth_tokens, db_session):
    """2. Validates server-side code generation and creation."""
    # Ensure cleanup of any previous test artifact
    test_code = "doc:verification:export"
    old = db_session.query(Permission).filter(Permission.code == test_code).first()
    if old:
        db_session.query(RolePermission).filter(RolePermission.permission_id == old.id).delete()
        db_session.delete(old)
        db_session.commit()

    payload = {
        "name": "Export OCR Verification Batch",
        "description": "Export OCR field verification data to spreadsheet",
        "module": "DOC",
        "subpage": "verification",
        "action": "EXPORT",
        "supported_scopes": ["DIVISION", "ALL"]
    }
    res = client.post(
        "/api/admin/permissions",
        json=payload,
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 201, res.text
    data = res.json()
    assert data["code"] == "doc:verification:export"
    assert data["is_custom"] is True
    assert data["is_active"] is True
    assert data["supported_scopes"] == "DIVISION,ALL"

    # Verify present in DB
    perm = db_session.query(Permission).filter(Permission.code == "doc:verification:export").first()
    assert perm is not None
    assert perm.is_custom is True


def test_create_custom_permission_duplicate(auth_tokens):
    """3. Validates duplicate code rejection (409 Conflict)."""
    payload = {
        "name": "Export OCR Verification Batch Duplicate",
        "module": "DOC",
        "subpage": "verification",
        "action": "EXPORT",
        "supported_scopes": ["ALL"]
    }
    res = client.post(
        "/api/admin/permissions",
        json=payload,
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 409
    assert "already exists" in res.json()["detail"].lower()


def test_create_custom_permission_invalid_registry(auth_tokens):
    """4. Validates rejection of unregistered modules, subpages, actions, and empty scopes."""
    # Invalid module
    res = client.post(
        "/api/admin/permissions",
        json={"name": "Test", "module": "NONEXISTENT", "subpage": "detail", "action": "VIEW", "supported_scopes": ["ALL"]},
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 422
    assert "Invalid module" in res.json()["detail"]

    # Invalid subpage
    res = client.post(
        "/api/admin/permissions",
        json={"name": "Test", "module": "DOC", "subpage": "fake_subpage", "action": "VIEW", "supported_scopes": ["ALL"]},
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 422
    assert "Invalid subpage" in res.json()["detail"]

    # Invalid action
    res = client.post(
        "/api/admin/permissions",
        json={"name": "Test", "module": "DOC", "subpage": "detail", "action": "HACK", "supported_scopes": ["ALL"]},
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 422
    assert "Invalid action" in res.json()["detail"]

    # Empty scopes
    res = client.post(
        "/api/admin/permissions",
        json={"name": "Test", "module": "DOC", "subpage": "detail", "action": "VIEW", "supported_scopes": []},
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 422


def test_toggle_permission_deactivate_reactivate(auth_tokens, db_session):
    """5. Validates is_active toggling and authorization revocation."""
    perm = db_session.query(Permission).filter(Permission.code == "doc:verification:export").first()
    assert perm is not None

    # Deactivate
    res = client.put(
        f"/api/admin/permissions/{perm.id}/toggle-active",
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # Check that check_permission rejects deactivated permission for a non-admin user
    normal_user = auth_tokens["normal"]
    assert normal_user.role_id is not None
    rp = db_session.query(RolePermission).filter(
        RolePermission.role_id == normal_user.role_id,
        RolePermission.permission_id == perm.id
    ).first()
    if not rp:
        rp = RolePermission(role_id=normal_user.role_id, permission_id=perm.id, scope="ALL")
        db_session.add(rp)
        db_session.commit()

    # Permission is deactivated, check_permission must return False
    assert check_permission(normal_user, "doc:verification:export", db_session) is False

    # Reactivate
    res2 = client.put(
        f"/api/admin/permissions/{perm.id}/toggle-active",
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res2.status_code == 200
    assert res2.json()["is_active"] is True
    # Permission is now active, check_permission must return True
    assert check_permission(normal_user, "doc:verification:export", db_session) is True

    # Clean up temporary assignment
    db_session.delete(rp)
    db_session.commit()


def test_builtin_permission_immutability(auth_tokens, db_session):
    """6. Validates that built-in permissions cannot be modified or deleted, and admin:rbac cannot be deactivated."""
    builtin = db_session.query(Permission).filter(Permission.code == "doc:view").first()
    assert builtin is not None
    assert builtin.is_custom is False

    # Attempt to edit built-in
    res = client.put(
        f"/api/admin/permissions/{builtin.id}",
        json={"name": "Hacked Name"},
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 400
    assert "Built-in system permissions cannot be modified" in res.json()["detail"]

    # Attempt to delete built-in
    res_del = client.delete(
        f"/api/admin/permissions/{builtin.id}",
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res_del.status_code == 400
    assert "Built-in system permissions cannot be deleted" in res_del.json()["detail"]

    # Attempt to deactivate admin:rbac
    root_rbac = db_session.query(Permission).filter(Permission.code == "admin:rbac").first()
    if root_rbac:
        res_toggle = client.put(
            f"/api/admin/permissions/{root_rbac.id}/toggle-active",
            headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
        )
        assert res_toggle.status_code == 400
        assert "Cannot deactivate" in res_toggle.json()["detail"]


def test_delete_permission_protection(auth_tokens, db_session):
    """7. Validates that custom permissions assigned to roles cannot be deleted."""
    perm = db_session.query(Permission).filter(Permission.code == "doc:verification:export").first()
    assert perm is not None

    admin_role = db_session.query(Role).filter(Role.code.ilike("admin")).first()
    assert admin_role is not None

    # Assign to admin role
    rp = RolePermission(role_id=admin_role.id, permission_id=perm.id, scope="ALL")
    db_session.add(rp)
    db_session.commit()

    # Try to delete while assigned -> must fail
    res = client.delete(
        f"/api/admin/permissions/{perm.id}",
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res.status_code == 400
    assert "currently assigned to" in res.json()["detail"]

    # Remove assignment -> delete must succeed
    db_session.delete(rp)
    db_session.commit()

    res_success = client.delete(
        f"/api/admin/permissions/{perm.id}",
        headers={"Authorization": f"Bearer {auth_tokens['token_admin']}"}
    )
    assert res_success.status_code == 200
    assert res_success.json()["success"] is True

    # Confirm removed from DB
    deleted = db_session.query(Permission).filter(Permission.code == "doc:verification:export").first()
    assert deleted is None


def test_admin_authorization_enforced(auth_tokens):
    """8. Validates non-admin access to permission endpoints is rejected with 403 Forbidden."""
    res = client.post(
        "/api/admin/permissions",
        json={"name": "Unauthorized Test", "module": "DOC", "subpage": "detail", "action": "VIEW", "supported_scopes": ["ALL"]},
        headers={"Authorization": f"Bearer {auth_tokens['token_normal']}"}
    )
    assert res.status_code == 403
    assert "Access Denied" in res.json()["detail"]


def test_legacy_permission_compatibility(db_session, auth_tokens):
    """9. Validates that legacy codes (doc:create, doc:read, workflow:write) resolve correctly via fallback."""
    normal_user = auth_tokens["normal"]
    if normal_user.role_id:
        # Find permission with legacy_code='doc:create'
        perm_upload = db_session.query(Permission).filter(Permission.legacy_code == "doc:create").first()
        assert perm_upload is not None

        # Assign to user's role
        rp = db_session.query(RolePermission).filter(
            RolePermission.role_id == normal_user.role_id,
            RolePermission.permission_id == perm_upload.id
        ).first()
        added = False
        if not rp:
            rp = RolePermission(role_id=normal_user.role_id, permission_id=perm_upload.id, scope="ALL")
            db_session.add(rp)
            db_session.commit()
            added = True

        # Check by legacy code 'doc:create'
        assert check_permission(normal_user, "doc:create", db_session) is True
        # Check by canonical code
        assert check_permission(normal_user, perm_upload.code, db_session) is True

        if added:
            db_session.delete(rp)
            db_session.commit()
