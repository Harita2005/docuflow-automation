import io
import os
import uuid
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token
from app.config.settings import settings
from app.database.connection import SessionLocal, engine, get_db
from app.database.models import User, Role, Document, Permission, RolePermission

client = TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    """Module-level transactional session that rolls back all test changes."""
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    session.commit = session.flush

    app.dependency_overrides[get_db] = lambda: session
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="module")
def file_security_setup(db_session):
    # Ensure doc:create permission exists
    perm_doc_create = db_session.query(Permission).filter(Permission.code == "doc:create").first()
    if not perm_doc_create:
        perm_doc_create = Permission(code="doc:create", name="Create Documents", module="documents")
        db_session.add(perm_doc_create)
        db_session.flush()

    # Role with doc:create
    role_creator = db_session.query(Role).filter(Role.code == "TEST_FILE_CREATOR").first()
    if not role_creator:
        role_creator = Role(code="TEST_FILE_CREATOR", name="Test File Creator Role", description="Role with doc:create")
        db_session.add(role_creator)
        db_session.flush()

    rp = db_session.query(RolePermission).filter(
        RolePermission.role_id == role_creator.id,
        RolePermission.permission_id == perm_doc_create.id
    ).first()
    if not rp:
        db_session.add(RolePermission(role_id=role_creator.id, permission_id=perm_doc_create.id))
        db_session.flush()

    # Role without doc:create
    role_readonly = db_session.query(Role).filter(Role.code == "TEST_FILE_READONLY").first()
    if not role_readonly:
        role_readonly = Role(code="TEST_FILE_READONLY", name="Test Readonly Role", description="Role without doc:create")
        db_session.add(role_readonly)
        db_session.flush()

    # Role admin
    role_admin = db_session.query(Role).filter(Role.code == "TEST_FILE_ADMIN").first()
    if not role_admin:
        role_admin = Role(code="TEST_FILE_ADMIN", name="Test Admin Role", description="Role for admin")
        db_session.add(role_admin)
        db_session.flush()

    uid = uuid.uuid4().hex[:8]

    # User 1: Document Owner (has doc:create)
    user_owner = User(
        user_uid=f"UID_OWNER_{uid}",
        username=f"owner_{uid}",
        email=f"owner_{uid}@example.com",
        employee_id=f"EMP_OWNER_{uid}",
        employee_name=f"Owner User {uid}",
        name=f"Owner User {uid}",
        password_hash="fakehash",
        division="DIV_A",
        role="employee",
        role_id=role_creator.id,
        is_active=True,
    )
    db_session.add(user_owner)

    # User 2: Assigned Approver (has doc:create)
    user_approver = User(
        user_uid=f"UID_APPR_{uid}",
        username=f"approver_{uid}",
        email=f"approver_{uid}@example.com",
        employee_id=f"EMP_APPR_{uid}",
        employee_name=f"Approver User {uid}",
        name=f"Approver User {uid}",
        password_hash="fakehash",
        division="DIV_A",
        role="employee",
        role_id=role_creator.id,
        is_active=True,
    )
    db_session.add(user_approver)

    # User 3: Unrelated User with doc:create (not owner, not assigned)
    user_unrelated = User(
        user_uid=f"UID_OTHER_{uid}",
        username=f"unrelated_{uid}",
        email=f"unrelated_{uid}@example.com",
        employee_id=f"EMP_OTHER_{uid}",
        employee_name=f"Unrelated User {uid}",
        name=f"Unrelated User {uid}",
        password_hash="fakehash",
        division="DIV_A",
        role="employee",
        role_id=role_creator.id,
        is_active=True,
    )
    db_session.add(user_unrelated)

    # User 4: User without doc:create
    user_noperm = User(
        user_uid=f"UID_NOPERM_{uid}",
        username=f"noperm_{uid}",
        email=f"noperm_{uid}@example.com",
        employee_id=f"EMP_NOPERM_{uid}",
        employee_name=f"No Perm User {uid}",
        name=f"No Perm User {uid}",
        password_hash="fakehash",
        division="DIV_A",
        role="employee",
        role_id=role_readonly.id,
        is_active=True,
    )
    db_session.add(user_noperm)

    # User 5: Administrator
    user_admin = User(
        user_uid=f"UID_ADMIN_{uid}",
        username=f"admin_{uid}",
        email=f"admin_{uid}@example.com",
        employee_id=f"EMP_ADMIN_{uid}",
        employee_name=f"Admin User {uid}",
        name=f"Admin User {uid}",
        password_hash="fakehash",
        division="HQ",
        role="admin",
        role_id=role_admin.id,
        is_active=True,
    )
    db_session.add(user_admin)

    db_session.flush()

    # Create target documents
    # Document 1: Owned by user_owner, assigned to user_approver
    doc1 = Document(
        id=f"DOC_TEST_REPLACE_1_{uid}",
        doc_key=f"DOCKEY_1_{uid}",
        invoice_number=f"INV_1_{uid}",
        vendor_name="Acme Corporation",
        amount=1000.0,
        base_amount=847.46,
        tax_amount=152.54,
        division="DIV_A",
        status="Pending Approval",
        current_stage=1,
        total_stages=2,
        contact_person=user_owner.username,
        employee_id=user_owner.employee_id,
        employee_name=user_owner.employee_name,
        assigned_approver=user_approver.username,
        document_type="AP INVOICE",
    )
    db_session.add(doc1)

    # Document 2: Synced staging document (file_url is None) owned by user_owner, assigned to user_approver
    doc_sync = Document(
        id=f"DOC_TEST_SYNC_1_{uid}",
        doc_key=f"DOCKEY_SYNC_{uid}",
        invoice_number=f"INV_SYNC_{uid}",
        vendor_name="Acme Corporation",
        amount=2500.0,
        base_amount=2118.64,
        tax_amount=381.36,
        division="DIV_A",
        status="Pending Approval",
        current_stage=1,
        total_stages=2,
        contact_person=user_owner.username,
        employee_id=user_owner.employee_id,
        employee_name=user_owner.employee_name,
        assigned_approver=user_approver.username,
        document_type="AP INVOICE",
        file_url=None,
    )
    db_session.add(doc_sync)
    db_session.flush()

    # Generate JWT tokens
    tokens = {
        "owner": create_access_token({"sub": user_owner.username, "user_id": user_owner.id, "role": user_owner.role}),
        "approver": create_access_token({"sub": user_approver.username, "user_id": user_approver.id, "role": user_approver.role}),
        "unrelated": create_access_token({"sub": user_unrelated.username, "user_id": user_unrelated.id, "role": user_unrelated.role}),
        "noperm": create_access_token({"sub": user_noperm.username, "user_id": user_noperm.id, "role": user_noperm.role}),
        "admin": create_access_token({"sub": user_admin.username, "user_id": user_admin.id, "role": user_admin.role}),
    }

    return {
        "users": {
            "owner": user_owner,
            "approver": user_approver,
            "unrelated": user_unrelated,
            "noperm": user_noperm,
            "admin": user_admin,
        },
        "tokens": tokens,
        "doc1": doc1,
        "doc_sync": doc_sync,
    }


def make_dummy_pdf():
    return ("test_doc.pdf", b"%PDF-1.4 test dummy content for security verification\n%%EOF", "application/pdf")


# ---------------------------------------------------------------------------
# 1. Tests for POST /api/documents/upload-and-route/{synced_doc_id}
# ---------------------------------------------------------------------------

def test_upload_and_route_anonymous_rejected(file_security_setup):
    doc_id = file_security_setup["doc_sync"].id
    files = {"file": make_dummy_pdf()}
    res = client.post(f"/api/documents/upload-and-route/{doc_id}", files=files)
    assert res.status_code == 401


def test_upload_and_route_no_permission_rejected(file_security_setup):
    doc_id = file_security_setup["doc_sync"].id
    token = file_security_setup["tokens"]["noperm"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/upload-and-route/{doc_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "Missing required permission 'doc:create'" in res.json()["detail"]


def test_upload_and_route_unrelated_user_rejected_403(file_security_setup):
    """User has doc:create, but does NOT own the document and is NOT assigned to it."""
    doc_id = file_security_setup["doc_sync"].id
    token = file_security_setup["tokens"]["unrelated"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/upload-and-route/{doc_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "Only the document owner, assigned approver, or administrator" in res.json()["detail"]


def test_upload_and_route_owner_allowed(file_security_setup):
    doc_id = file_security_setup["doc_sync"].id
    token = file_security_setup["tokens"]["owner"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/upload-and-route/{doc_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True


def test_upload_and_route_assigned_approver_allowed(file_security_setup):
    doc_id = file_security_setup["doc_sync"].id
    token = file_security_setup["tokens"]["approver"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/upload-and-route/{doc_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True


def test_upload_and_route_admin_allowed(file_security_setup):
    doc_id = file_security_setup["doc_sync"].id
    token = file_security_setup["tokens"]["admin"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/upload-and-route/{doc_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True


# ---------------------------------------------------------------------------
# 2. Tests for POST /api/documents/{invoice_id}/version
# ---------------------------------------------------------------------------

def test_version_replacement_anonymous_rejected(file_security_setup):
    doc_id = file_security_setup["doc1"].id
    files = {"file": make_dummy_pdf()}
    res = client.post(f"/api/documents/{doc_id}/version", files=files)
    assert res.status_code == 401


def test_version_replacement_no_permission_rejected(file_security_setup):
    doc_id = file_security_setup["doc1"].id
    token = file_security_setup["tokens"]["noperm"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/{doc_id}/version",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "Missing required permission 'doc:create'" in res.json()["detail"]


def test_version_replacement_unrelated_user_rejected_403(file_security_setup):
    """User has doc:create, but does not own and is not assigned to the document."""
    doc_id = file_security_setup["doc1"].id
    token = file_security_setup["tokens"]["unrelated"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/{doc_id}/version",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 403
    assert "Only the document owner, assigned approver, or administrator" in res.json()["detail"]


def test_version_replacement_owner_allowed(file_security_setup):
    doc_id = file_security_setup["doc1"].id
    token = file_security_setup["tokens"]["owner"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/{doc_id}/version",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_version_replacement_assigned_approver_allowed(file_security_setup):
    doc_id = file_security_setup["doc1"].id
    token = file_security_setup["tokens"]["approver"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/{doc_id}/version",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


def test_version_replacement_admin_allowed(file_security_setup):
    doc_id = file_security_setup["doc1"].id
    token = file_security_setup["tokens"]["admin"]
    files = {"file": make_dummy_pdf()}
    res = client.post(
        f"/api/documents/{doc_id}/version",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    assert res.json()["success"] is True


# ---------------------------------------------------------------------------
# 3. Tests for GET /api/documents/temp-preview/{filename}
# ---------------------------------------------------------------------------

@pytest.fixture
def staged_preview_file(file_security_setup):
    owner_id = file_security_setup["users"]["owner"].id
    filename = f"TEMP_STAGE_U{owner_id}_abc12345_sample_preview.pdf"
    file_path = settings.UPLOAD_DIR / filename
    with open(file_path, "wb") as f:
        f.write(b"%PDF-1.4 staged preview content\n%%EOF")
    yield filename
    try:
        if file_path.exists():
            file_path.unlink()
    except Exception:
        pass


def test_temp_preview_anonymous_rejected(staged_preview_file):
    res = client.get(f"/api/documents/temp-preview/{staged_preview_file}")
    assert res.status_code == 401


def test_temp_preview_path_traversal_rejected(file_security_setup):
    token = file_security_setup["tokens"]["owner"]
    res = client.get(
        "/api/documents/temp-preview/..%2F..%2Fetc%2Fpasswd",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code in (400, 404)


def test_temp_preview_wrong_user_rejected_403(file_security_setup, staged_preview_file):
    """User B attempts to view staged preview file belonging to User A (owner)."""
    token_unrelated = file_security_setup["tokens"]["unrelated"]
    res = client.get(
        f"/api/documents/temp-preview/{staged_preview_file}",
        headers={"Authorization": f"Bearer {token_unrelated}"}
    )
    assert res.status_code == 403
    assert "You do not have permission to view this staged document preview" in res.json()["detail"]


def test_temp_preview_owner_allowed(file_security_setup, staged_preview_file):
    """User A (owner) views their own staged preview file."""
    token_owner = file_security_setup["tokens"]["owner"]
    res = client.get(
        f"/api/documents/temp-preview/{staged_preview_file}",
        headers={"Authorization": f"Bearer {token_owner}"}
    )
    assert res.status_code == 200
    assert res.headers.get("content-type") == "application/pdf"
    assert "sandbox allow-scripts" in res.headers.get("Content-Security-Policy", "")


def test_temp_preview_admin_allowed(file_security_setup, staged_preview_file):
    """Admin views staged preview file belonging to another user."""
    token_admin = file_security_setup["tokens"]["admin"]
    res = client.get(
        f"/api/documents/temp-preview/{staged_preview_file}",
        headers={"Authorization": f"Bearer {token_admin}"}
    )
    assert res.status_code == 200
    assert res.headers.get("content-type") == "application/pdf"
