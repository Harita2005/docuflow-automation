import time
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token
from app.database.connection import SessionLocal, engine, get_db
from app.database.models import User, Role, Document
from app.services.lock_service import lock_manager

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
def lock_test_setup(db_session):
    # 1. Plain employee role
    role_emp = db_session.query(Role).filter(Role.code == "TEST_LOCK_EMP").first()
    if not role_emp:
        role_emp = Role(code="TEST_LOCK_EMP", name="TestLockEmployeeRole", description="Test lock employee")
        db_session.add(role_emp)
        db_session.flush()

    # 2. Admin role
    role_admin = db_session.query(Role).filter(Role.code == "TEST_LOCK_ADMIN").first()
    if not role_admin:
        role_admin = Role(code="TEST_LOCK_ADMIN", name="TestLockAdminRole", description="Test lock admin")
        db_session.add(role_admin)
        db_session.flush()

    # 3. Test users
    # User 1: Assigned approver (authorized)
    user_approver = db_session.query(User).filter(User.username == "alicia_approver").first()
    if not user_approver:
        user_approver = User(
            user_uid=f"LUID_{uuid.uuid4().hex[:12]}",
            username="alicia_approver",
            email="alicia@companydomain.com",
            employee_id="EMP_ALICIA_01",
            employee_name="Alicia Smith",
            name="Alicia Smith",
            password_hash="testhash",
            division="BRANCH_A",
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_approver)

    # User 2: Second user with document access (peer in approver list)
    user_peer = db_session.query(User).filter(User.username == "bruno_peer").first()
    if not user_peer:
        user_peer = User(
            user_uid=f"LUID_{uuid.uuid4().hex[:12]}",
            username="bruno_peer",
            email="bruno@companydomain.com",
            employee_id="EMP_BRUNO_02",
            employee_name="Bruno Diaz",
            name="Bruno Diaz",
            password_hash="testhash",
            division="BRANCH_A",
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_peer)

    # User 3: Unauthorized user (different division, not assigned, distinct tokens)
    user_unauthorized = db_session.query(User).filter(User.username == "clara_outsider").first()
    if not user_unauthorized:
        user_unauthorized = User(
            user_uid=f"LUID_{uuid.uuid4().hex[:12]}",
            username="clara_outsider",
            email="clara@othercorp.net",
            employee_id="EMP_CLARA_03",
            employee_name="Clara Zetkin",
            name="Clara Zetkin",
            password_hash="testhash",
            division="BRANCH_B",
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_unauthorized)

    # User 4: Admin user
    user_admin = db_session.query(User).filter(User.username == "derek_admin").first()
    if not user_admin:
        user_admin = User(
            user_uid=f"LUID_{uuid.uuid4().hex[:12]}",
            username="derek_admin",
            email="derek@companydomain.com",
            employee_id="EMP_DEREK_ADMIN",
            employee_name="Derek Chief",
            name="Derek Chief",
            password_hash="testhash",
            role="admin",
            role_id=role_admin.id,
            is_active=True,
        )
        db_session.add(user_admin)

    db_session.commit()

    # 4. Test document
    doc = db_session.query(Document).filter(Document.id == "TEST-DOC-LOCK-001").first()
    if not doc:
        doc = Document(
            id="TEST-DOC-LOCK-001",
            doc_key="TEST-DOC-LOCK-001",
            document_type="AP INVOICE",
            division="BRANCH_A",
            current_stage=1,
            total_stages=2,
            assigned_approver="alicia_approver,bruno_peer",
            status="Pending Approval",
            is_deleted=False,
        )
        db_session.add(doc)
        db_session.commit()
    else:
        doc.division = "BRANCH_A"
        doc.assigned_approver = "alicia_approver,bruno_peer"
        db_session.commit()

    tokens = {
        "approver": create_access_token(data={"sub": user_approver.username}),
        "peer": create_access_token(data={"sub": user_peer.username}),
        "unauth": create_access_token(data={"sub": user_unauthorized.username}),
        "admin": create_access_token(data={"sub": user_admin.username}),
    }

    yield {
        "doc_id": "TEST-DOC-LOCK-001",
        "tokens": tokens,
        "users": {
            "approver": user_approver,
            "peer": user_peer,
            "unauth": user_unauthorized,
            "admin": user_admin,
        },
    }

    # Clean up lock manager state
    lock_manager.release_lock("TEST-DOC-LOCK-001", is_admin=True)


def test_lock_endpoints_require_authentication(lock_test_setup):
    """Anonymous requests to lock endpoints must return 401."""
    doc_id = lock_test_setup["doc_id"]

    for route in [f"/api/invoices/{doc_id}/lock/acquire", f"/api/documents/{doc_id}/lock/acquire"]:
        res = client.post(route, json={"lease_seconds": 60})
        assert res.status_code == 401, f"Expected 401 on {route}, got {res.status_code}"

    for route in [f"/api/invoices/{doc_id}/lock/heartbeat", f"/api/documents/{doc_id}/lock/heartbeat"]:
        res = client.post(route, json={"lease_seconds": 60})
        assert res.status_code == 401, f"Expected 401 on {route}, got {res.status_code}"

    for route in [f"/api/invoices/{doc_id}/lock/release", f"/api/documents/{doc_id}/lock/release"]:
        res = client.post(route, json={})
        assert res.status_code == 401, f"Expected 401 on {route}, got {res.status_code}"

    for route in [f"/api/invoices/{doc_id}/lock/status", f"/api/documents/{doc_id}/lock/status"]:
        res = client.get(route)
        assert res.status_code == 401, f"Expected 401 on {route}, got {res.status_code}"


def test_lock_endpoints_reject_unauthorized_document_access(lock_test_setup):
    """Users without access to the document must receive 403."""
    doc_id = lock_test_setup["doc_id"]
    headers = {"Authorization": f"Bearer {lock_test_setup['tokens']['unauth']}"}

    res_acq = client.post(f"/api/documents/{doc_id}/lock/acquire", headers=headers, json={"lease_seconds": 60})
    assert res_acq.status_code == 403

    res_hb = client.post(f"/api/documents/{doc_id}/lock/heartbeat", headers=headers, json={"lease_seconds": 60})
    assert res_hb.status_code == 403

    res_rel = client.post(f"/api/documents/{doc_id}/lock/release", headers=headers, json={})
    assert res_rel.status_code == 403

    res_stat = client.get(f"/api/documents/{doc_id}/lock/status", headers=headers)
    assert res_stat.status_code == 403


def test_lock_acquire_binds_handle_and_caps_lease(lock_test_setup):
    """
    Lock acquire must bind handle to authenticated user and ignore spoofed payload handle.
    Lease seconds must be capped to MAX_LOCK_LEASE_SECONDS (300).
    """
    doc_id = lock_test_setup["doc_id"]
    headers = {"Authorization": f"Bearer {lock_test_setup['tokens']['approver']}"}

    # Clean any leftover lock
    lock_manager.release_lock(doc_id, is_admin=True)

    # Attempt spoofing user_handle to someone else and requesting 999999s lease
    res = client.post(
        f"/api/documents/{doc_id}/lock/acquire",
        headers=headers,
        json={"user_handle": "spoofed_admin", "lease_seconds": 999999},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["acquired"] is True
    # Server must bind to authenticated user handle, NOT spoofed_admin
    assert data["user_handle"] == "alicia_approver"
    # Lease must be capped at 300
    assert data["expires_in"] == 300


def test_other_user_cannot_release_lock(lock_test_setup):
    """A non-admin user cannot release another user's active lock (returns 403)."""
    doc_id = lock_test_setup["doc_id"]
    headers_peer = {"Authorization": f"Bearer {lock_test_setup['tokens']['peer']}"}

    # Peer tries to release approver's lock
    res = client.post(f"/api/documents/{doc_id}/lock/release", headers=headers_peer, json={})
    assert res.status_code == 403
    assert "Cannot release lock owned by another user" in res.json()["detail"] or "Not lock owner" in res.json()["detail"]


def test_admin_can_release_any_lock(lock_test_setup):
    """An admin can release any user's lock."""
    doc_id = lock_test_setup["doc_id"]
    headers_admin = {"Authorization": f"Bearer {lock_test_setup['tokens']['admin']}"}

    res = client.post(f"/api/documents/{doc_id}/lock/release", headers=headers_admin, json={})
    assert res.status_code == 200
    assert res.json()["released"] is True

    # Confirm lock status is now unlocked
    headers_approver = {"Authorization": f"Bearer {lock_test_setup['tokens']['approver']}"}
    res_status = client.get(f"/api/documents/{doc_id}/lock/status", headers=headers_approver)
    assert res_status.status_code == 200
    assert res_status.json()["is_locked"] is False


def test_lock_owner_can_acquire_renew_and_release(lock_test_setup):
    """The lock owner can acquire, renew via heartbeat, and release successfully."""
    doc_id = lock_test_setup["doc_id"]
    headers = {"Authorization": f"Bearer {lock_test_setup['tokens']['approver']}"}

    # 1. Acquire
    res_acq = client.post(f"/api/documents/{doc_id}/lock/acquire", headers=headers, json={"lease_seconds": 120})
    assert res_acq.status_code == 200
    assert res_acq.json()["acquired"] is True

    # 2. Heartbeat
    res_hb = client.post(f"/api/documents/{doc_id}/lock/heartbeat", headers=headers, json={"lease_seconds": 60})
    assert res_hb.status_code == 200
    assert res_hb.json()["renewed"] is True

    # 3. Status check indicates self
    res_stat = client.get(f"/api/documents/{doc_id}/lock/status", headers=headers)
    assert res_stat.status_code == 200
    assert res_stat.json()["is_self"] is True
    assert res_stat.json()["is_locked"] is False

    # 4. Release
    res_rel = client.post(f"/api/documents/{doc_id}/lock/release", headers=headers, json={})
    assert res_rel.status_code == 200
    assert res_rel.json()["released"] is True
