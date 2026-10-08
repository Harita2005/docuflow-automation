import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials

from app.main import app
from app.auth import (
    create_access_token,
    get_current_user_or_service_key,
    require_permission_or_service,
)
from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import User, Role, Permission, RolePermission, Document
from app.routers.workflows import verify_escalation_authorization

client = TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def test_setup(db_session):
    """Seed test roles, permissions, users, and a test document."""
    # 1. Seed permissions
    perm_wf_read = db_session.query(Permission).filter(Permission.code == "workflow:read").first()
    if not perm_wf_read:
        perm_wf_read = Permission(code="workflow:read", name="Read Workflows", module="WORKFLOW")
        db_session.add(perm_wf_read)

    perm_wf_write = db_session.query(Permission).filter(Permission.code == "workflow:write").first()
    if not perm_wf_write:
        perm_wf_write = Permission(code="workflow:write", name="Write Workflows", module="WORKFLOW")
        db_session.add(perm_wf_write)

    perm_wf_esc = db_session.query(Permission).filter(Permission.code == "workflow:escalate").first()
    if not perm_wf_esc:
        perm_wf_esc = Permission(code="workflow:escalate", name="Escalate Workflows", module="WORKFLOW")
        db_session.add(perm_wf_esc)

    perm_cond_read = db_session.query(Permission).filter(Permission.code == "condition:read").first()
    if not perm_cond_read:
        perm_cond_read = Permission(code="condition:read", name="Read Conditions", module="CONDITION")
        db_session.add(perm_cond_read)

    perm_cond_write = db_session.query(Permission).filter(Permission.code == "condition:write").first()
    if not perm_cond_write:
        perm_cond_write = Permission(code="condition:write", name="Write Conditions", module="CONDITION")
        db_session.add(perm_cond_write)

    db_session.commit()

    # 2. Seed roles
    role_workflow_viewer = db_session.query(Role).filter(Role.code == "TEST_WF_VIEWER").first()
    if not role_workflow_viewer:
        role_workflow_viewer = Role(code="TEST_WF_VIEWER", name="TestWorkflowViewerRole", description="Test role for workflow viewing")
        db_session.add(role_workflow_viewer)
        db_session.flush()
        db_session.add(RolePermission(role_id=role_workflow_viewer.id, permission_id=perm_wf_read.id))

    role_plain_employee = db_session.query(Role).filter(Role.code == "TEST_PLAIN_EMP").first()
    if not role_plain_employee:
        role_plain_employee = Role(code="TEST_PLAIN_EMP", name="TestPlainEmployeeRole", description="Test role without admin permissions")
        db_session.add(role_plain_employee)

    db_session.commit()

    import uuid

    # 3. Seed users
    plain_user = db_session.query(User).filter(User.username == "test_wf_plain_user").first()
    if not plain_user:
        plain_user = User(
            user_uid=f"WF_UID_{uuid.uuid4().hex[:12]}",
            username="test_wf_plain_user",
            email="test_wf_plain@example.com",
            employee_id="WF_EMP_001",
            employee_name="Plain Employee",
            name="Plain Employee",
            password_hash="testhash",
            role="employee",
            role_id=role_plain_employee.id,
            is_active=True,
        )
        db_session.add(plain_user)

    viewer_user = db_session.query(User).filter(User.username == "test_wf_viewer_user").first()
    if not viewer_user:
        viewer_user = User(
            user_uid=f"WF_UID_{uuid.uuid4().hex[:12]}",
            username="test_wf_viewer_user",
            email="test_wf_viewer@example.com",
            employee_id="WF_EMP_002",
            employee_name="Workflow Viewer",
            name="Workflow Viewer",
            password_hash="testhash",
            role="employee",
            role_id=role_workflow_viewer.id,
            is_active=True,
        )
        db_session.add(viewer_user)

    admin_user = db_session.query(User).filter(User.username == "test_wf_admin_user").first()
    if not admin_user:
        admin_user = User(
            user_uid=f"WF_UID_{uuid.uuid4().hex[:12]}",
            username="test_wf_admin_user",
            email="test_wf_admin@example.com",
            employee_id="WF_EMP_003",
            employee_name="Workflow Admin",
            name="Workflow Admin",
            password_hash="testhash",
            role="admin",
            is_active=True,
        )
        db_session.add(admin_user)

    assigned_user = db_session.query(User).filter(User.username == "test_assigned_approver").first()
    if not assigned_user:
        assigned_user = User(
            user_uid=f"WF_UID_{uuid.uuid4().hex[:12]}",
            username="test_assigned_approver",
            email="test_assigned_approver@example.com",
            employee_id="WF_EMP_004",
            employee_name="Assigned Approver",
            name="Assigned Approver",
            password_hash="testhash",
            role="employee",
            role_id=role_plain_employee.id,
            is_active=True,
        )
        db_session.add(assigned_user)

    db_session.commit()

    # 4. Seed test document
    doc = db_session.query(Document).filter(Document.id == "TEST-DOC-ESC-001").first()
    if not doc:
        doc = Document(
            id="TEST-DOC-ESC-001",
            doc_key="TEST-DOC-ESC-001",
            document_type="AP INVOICE",
            current_stage=1,
            total_stages=2,
            assigned_approver="test_assigned_approver",
            status="Pending Approval",
            is_deleted=False,
        )
        db_session.add(doc)
        db_session.commit()
    try:
        yield {
            "plain_user": plain_user,
            "viewer_user": viewer_user,
            "admin_user": admin_user,
            "assigned_user": assigned_user,
            "doc_id": "TEST-DOC-ESC-001",
        }
    finally:
        try:
            db_session.query(Document).filter(Document.id == "TEST-DOC-ESC-001").delete()
            db_session.query(User).filter(User.username.in_([
                "test_wf_plain_user", "test_wf_viewer_user", "test_wf_admin_user", "test_assigned_approver"
            ])).delete()
            roles = db_session.query(Role).filter(Role.code.in_(["TEST_WF_VIEWER", "TEST_PLAIN_EMP"])).all()
            for r in roles:
                db_session.query(RolePermission).filter(RolePermission.role_id == r.id).delete()
                db_session.delete(r)
            db_session.commit()
        except Exception:
            db_session.rollback()


# ===========================================================================
# 1. DUAL AUTH DEPENDENCY DIRECT TESTS
# ===========================================================================

@pytest.mark.anyio
async def test_dual_auth_no_credentials_raises_401(db_session):
    """Missing both X-API-Key and Bearer credentials must raise 401."""
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_or_service_key(
            x_api_key=None,
            credentials=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_dual_auth_bad_api_key_raises_401(db_session):
    """Invalid X-API-Key with no Bearer token must raise 401."""
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_or_service_key(
            x_api_key="bad-api-key",
            credentials=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_dual_auth_bad_jwt_raises_401(db_session):
    """Invalid Bearer token with no X-API-Key must raise 401."""
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid.jwt.token")
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_or_service_key(
            x_api_key=None,
            credentials=creds,
            db=db_session,
        )
    assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_dual_auth_both_invalid_raises_401(db_session):
    """Both bad X-API-Key and bad Bearer token must raise 401."""
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid.jwt.token")
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_or_service_key(
            x_api_key="bad-api-key",
            credentials=creds,
            db=db_session,
        )
    assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_dual_auth_valid_api_key_succeeds(db_session):
    """Valid X-API-Key succeeds and returns service caller dict."""
    result = await get_current_user_or_service_key(
        x_api_key=settings.SERVICE_API_KEY,
        credentials=None,
        db=db_session,
    )
    assert isinstance(result, dict)
    assert result.get("is_service") is True


@pytest.mark.anyio
async def test_dual_auth_valid_user_jwt_succeeds(db_session, test_setup):
    """Valid user JWT succeeds and returns User model instance."""
    token = create_access_token({"sub": test_setup["plain_user"].username})
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    result = await get_current_user_or_service_key(
        x_api_key=None,
        credentials=creds,
        db=db_session,
    )
    assert isinstance(result, User)
    assert result.username == test_setup["plain_user"].username


# ===========================================================================
# 2. PERMISSION DEPENDENCY DIRECT TESTS
# ===========================================================================

@pytest.mark.anyio
async def test_permission_service_key_allowed(db_session):
    """Valid service key caller is permitted through require_permission_or_service."""
    dep = require_permission_or_service("workflow:write")
    auth_entity = {"is_service": True, "identity": "service"}
    result = await dep(auth_entity=auth_entity, db=db_session)
    assert result == auth_entity


@pytest.mark.anyio
async def test_permission_admin_user_allowed(db_session, test_setup):
    """Admin user is permitted through require_permission_or_service."""
    dep = require_permission_or_service("workflow:write")
    result = await dep(auth_entity=test_setup["admin_user"], db=db_session)
    assert result == test_setup["admin_user"]


@pytest.mark.anyio
async def test_permission_user_without_permission_raises_403(db_session, test_setup):
    """User without permission raises 403 Forbidden."""
    dep = require_permission_or_service("workflow:write")
    with pytest.raises(HTTPException) as exc_info:
        await dep(auth_entity=test_setup["plain_user"], db=db_session)
    assert exc_info.value.status_code == 403
    assert "access denied" in exc_info.value.detail.lower()


@pytest.mark.anyio
async def test_permission_user_with_permission_allowed(db_session, test_setup):
    """User with granted role permission is allowed."""
    dep = require_permission_or_service("workflow:read")
    result = await dep(auth_entity=test_setup["viewer_user"], db=db_session)
    assert result == test_setup["viewer_user"]


# ===========================================================================
# 3. ENDPOINT INTEGRATION: ANONYMOUS ACCESS BLOCKED (401)
# ===========================================================================

@pytest.mark.parametrize("endpoint,method", [
    ("/api/admin/workflows/sync-approvers", "post"),
    ("/api/admin/rules/simulate", "post"),
    ("/api/admin/rules/detect-conflicts", "post"),
    ("/api/admin/workflow-steps", "get"),
    ("/api/workflows", "get"),
    ("/api/admin/workflows", "get"),
    ("/api/conditions", "get"),
    ("/api/admin/conditions", "get"),
    ("/api/admin/routing-rules", "get"),
    ("/api/workflows/TEST-DOC-ESC-001/escalate-check", "get"),
    ("/api/workflows/TEST-DOC-ESC-001/escalate", "post"),
])
def test_anonymous_access_returns_401(endpoint, method):
    """Verify that all unauthenticated write and read requests return 401."""
    if method == "get":
        res = client.get(endpoint)
    else:
        res = client.post(endpoint, json={})
    assert res.status_code == 401, f"Expected 401 on {endpoint}, got {res.status_code}: {res.text}"


# ===========================================================================
# 4. ENDPOINT INTEGRATION: SERVICE KEY ACCESS (200)
# ===========================================================================

def test_service_key_access_workflows_and_conditions():
    """Verify valid X-API-Key provides access to read and write endpoints."""
    headers = {"X-API-Key": settings.SERVICE_API_KEY}

    res_wf = client.get("/api/workflows", headers=headers)
    assert res_wf.status_code == 200

    res_cond = client.get("/api/conditions", headers=headers)
    assert res_cond.status_code == 200

    res_admin_wf = client.get("/api/admin/workflows", headers=headers)
    assert res_admin_wf.status_code == 200

    res_sync = client.post("/api/admin/workflows/sync-approvers", headers=headers)
    assert res_sync.status_code == 200

    res_conflicts = client.post("/api/admin/rules/detect-conflicts", headers=headers, json={"rules": []})
    assert res_conflicts.status_code == 200


# ===========================================================================
# 5. ENDPOINT INTEGRATION: USER PERMISSIONS (200 vs 403)
# ===========================================================================

def test_plain_user_can_access_read_only_endpoints(test_setup):
    """Logged in user can read /api/workflows and /api/conditions without special permissions."""
    token = create_access_token({"sub": test_setup["plain_user"].username})
    headers = {"Authorization": f"Bearer {token}"}

    res_wf = client.get("/api/workflows", headers=headers)
    assert res_wf.status_code == 200

    res_cond = client.get("/api/conditions", headers=headers)
    assert res_cond.status_code == 200


def test_plain_user_forbidden_on_admin_endpoints(test_setup):
    """Logged in user without workflow:read/write or condition:read/write is denied on /api/admin/*."""
    token = create_access_token({"sub": test_setup["plain_user"].username})
    headers = {"Authorization": f"Bearer {token}"}

    res_admin_wf = client.get("/api/admin/workflows", headers=headers)
    assert res_admin_wf.status_code == 403

    res_steps = client.get("/api/admin/workflow-steps", headers=headers)
    assert res_steps.status_code == 403

    res_admin_cond = client.get("/api/admin/conditions", headers=headers)
    assert res_admin_cond.status_code == 403

    res_sim = client.post("/api/admin/rules/simulate", headers=headers, json={})
    assert res_sim.status_code == 403

    res_sync = client.post("/api/admin/workflows/sync-approvers", headers=headers)
    assert res_sync.status_code == 403


def test_workflow_viewer_permitted_on_workflow_read(test_setup):
    """User with workflow:read can read /api/admin/workflows and /api/admin/workflow-steps."""
    token = create_access_token({"sub": test_setup["viewer_user"].username})
    headers = {"Authorization": f"Bearer {token}"}

    res_admin_wf = client.get("/api/admin/workflows", headers=headers)
    assert res_admin_wf.status_code == 200

    res_steps = client.get("/api/admin/workflow-steps", headers=headers)
    assert res_steps.status_code == 200

    # But still forbidden on condition:read or workflow:write
    res_cond = client.get("/api/admin/conditions", headers=headers)
    assert res_cond.status_code == 403

    res_sync = client.post("/api/admin/workflows/sync-approvers", headers=headers)
    assert res_sync.status_code == 403


# ===========================================================================
# 6. ESCALATION OBJECT-LEVEL AUTHORIZATION
# ===========================================================================

def test_escalation_object_level_unauthorized_user_forbidden(test_setup, db_session):
    """A user who is not assigned, not an admin, and lacks escalation permission gets 403."""
    doc = db_session.query(Document).filter(Document.id == test_setup["doc_id"]).first()
    assert doc is not None

    with pytest.raises(HTTPException) as exc_info:
        verify_escalation_authorization(test_setup["plain_user"], doc, db_session)
    assert exc_info.value.status_code == 403
    assert "not assigned" in exc_info.value.detail.lower()


def test_escalation_object_level_assigned_user_allowed(test_setup, db_session):
    """The assigned approver for the invoice is authorized."""
    doc = db_session.query(Document).filter(Document.id == test_setup["doc_id"]).first()
    # Should not raise exception
    verify_escalation_authorization(test_setup["assigned_user"], doc, db_session)


def test_escalation_object_level_admin_allowed(test_setup, db_session):
    """An admin user is authorized to escalate any document."""
    doc = db_session.query(Document).filter(Document.id == test_setup["doc_id"]).first()
    # Should not raise exception
    verify_escalation_authorization(test_setup["admin_user"], doc, db_session)


def test_escalation_endpoint_returns_403_for_unrelated_user(test_setup):
    """Integration check: calling /escalate-check as an unrelated user returns 403."""
    token = create_access_token({"sub": test_setup["plain_user"].username})
    res = client.get(
        f"/api/workflows/{test_setup['doc_id']}/escalate-check",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403
    assert "not assigned" in res.text.lower()
