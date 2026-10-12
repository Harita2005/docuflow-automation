import asyncio
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token
from app.database.connection import SessionLocal, engine, get_db
from app.database.models import User, Role, Document
from app.routers.events import (
    broadcast_event,
    stream_ticket_manager,
    SSEListener,
    _active_listeners,
    _listeners_mutex,
)

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
def sse_test_setup(db_session):
    role_emp = db_session.query(Role).filter(Role.code == "TEST_SSE_EMP").first()
    if not role_emp:
        role_emp = Role(code="TEST_SSE_EMP", name="TestSseEmployeeRole", description="Test sse employee")
        db_session.add(role_emp)
        db_session.flush()

    role_admin = db_session.query(Role).filter(Role.code == "TEST_SSE_ADMIN").first()
    if not role_admin:
        role_admin = Role(code="TEST_SSE_ADMIN", name="TestSseAdminRole", description="Test sse admin")
        db_session.add(role_admin)
        db_session.flush()

    # User 1: Authorized Approver on doc
    user_approver = db_session.query(User).filter(User.username == "sse_alice_approver").first()
    if not user_approver:
        user_approver = User(
            user_uid=f"SUID_{uuid.uuid4().hex[:12]}",
            username="sse_alice_approver",
            email="alice_sse@company.com",
            employee_id="SSE_EMP_01",
            employee_name="Alice Approver",
            name="Alice Approver",
            password_hash="testhash",
            division="BRANCH_A",
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_approver)

    # User 2: Outsider with different division and not assigned
    user_outsider = db_session.query(User).filter(User.username == "sse_bob_outsider").first()
    if not user_outsider:
        user_outsider = User(
            user_uid=f"SUID_{uuid.uuid4().hex[:12]}",
            username="sse_bob_outsider",
            email="bob_sse@other.com",
            employee_id="SSE_EMP_02",
            employee_name="Bob Outsider",
            name="Bob Outsider",
            password_hash="testhash",
            division="BRANCH_B",
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_outsider)

    # User 3: Admin
    user_admin = db_session.query(User).filter(User.username == "sse_carol_admin").first()
    if not user_admin:
        user_admin = User(
            user_uid=f"SUID_{uuid.uuid4().hex[:12]}",
            username="sse_carol_admin",
            email="carol_sse@admin.com",
            employee_id="SSE_EMP_03",
            employee_name="Carol Admin",
            name="Carol Admin",
            password_hash="testhash",
            role="admin",
            role_id=role_admin.id,
            is_active=True,
        )
        db_session.add(user_admin)

    db_session.commit()

    # Test document assigned to alice
    doc = db_session.query(Document).filter(Document.id == "TEST-DOC-SSE-001").first()
    if not doc:
        doc = Document(
            id="TEST-DOC-SSE-001",
            doc_key="TEST-DOC-SSE-001",
            document_type="AP INVOICE",
            division="BRANCH_A",
            current_stage=1,
            total_stages=2,
            assigned_approver="sse_alice_approver",
            status="Pending Approval",
            is_deleted=False,
        )
        db_session.add(doc)
        db_session.commit()
    else:
        doc.division = "BRANCH_A"
        doc.assigned_approver = "sse_alice_approver"
        db_session.commit()

    tokens = {
        "approver": create_access_token(data={"sub": user_approver.username}),
        "outsider": create_access_token(data={"sub": user_outsider.username}),
        "admin": create_access_token(data={"sub": user_admin.username}),
    }

    yield {
        "doc_id": "TEST-DOC-SSE-001",
        "tokens": tokens,
        "users": {
            "approver": user_approver,
            "outsider": user_outsider,
            "admin": user_admin,
        },
    }


def test_sse_endpoints_require_authentication(sse_test_setup):
    """Anonymous requests to stream-ticket and stream must be rejected with 401."""
    res_ticket = client.post("/api/events/stream-ticket")
    assert res_ticket.status_code == 401

    res_stream = client.get("/api/events/stream")
    assert res_stream.status_code == 401


def test_sse_stream_prohibits_jwt_in_query_params(sse_test_setup):
    """Passing tokens directly in query parameters (token= or access_token=) must return 400 Bad Request."""
    token = sse_test_setup["tokens"]["approver"]

    res1 = client.get(f"/api/events/stream?token={token}")
    assert res1.status_code == 400
    assert "forbidden" in res1.json()["detail"].lower()

    res2 = client.get(f"/api/events/stream?access_token={token}")
    assert res2.status_code == 400
    assert "forbidden" in res2.json()["detail"].lower()


def test_issue_stream_ticket_and_single_use(sse_test_setup):
    """
    Users can issue a short-lived stream ticket.
    The ticket must be single-use: subsequent consumption attempts must fail with 401.
    """
    headers = {"Authorization": f"Bearer {sse_test_setup['tokens']['approver']}"}

    res = client.post("/api/events/stream-ticket", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "ticket" in data
    assert data["expires_in"] == 30
    ticket = data["ticket"]

    # 1. First consumption consumes the ticket
    user_id = stream_ticket_manager.consume_ticket(ticket)
    assert user_id == sse_test_setup["users"]["approver"].id

    # 2. Second consumption fails because ticket is single-use
    assert stream_ticket_manager.consume_ticket(ticket) is None

    # Connecting with the consumed ticket returns 401
    res_consumed = client.get(f"/api/events/stream?ticket={ticket}")
    assert res_consumed.status_code == 401


def test_get_current_user_for_stream_authentication(sse_test_setup, db_session):
    """
    get_current_user_for_stream must authenticate users via Bearer header or single-use ticket,
    and reject reused tickets or invalid credentials.
    """
    from fastapi import Request
    from app.routers.events import get_current_user_for_stream

    user_approver = sse_test_setup["users"]["approver"]
    token = sse_test_setup["tokens"]["approver"]

    # 1. Bearer header authentication succeeds
    req_header = Request(scope={
        "type": "http",
        "headers": [(b"authorization", f"Bearer {token}".encode("utf-8"))],
        "query_string": b"",
    })
    user_from_header = get_current_user_for_stream(
        request=req_header,
        ticket=None,
        token=None,
        access_token=None,
        db=db_session,
    )
    assert user_from_header.id == user_approver.id

    # 2. Ticket authentication succeeds and consumes the ticket
    fresh_ticket = stream_ticket_manager.create_ticket(user_approver)
    req_ticket = Request(scope={
        "type": "http",
        "headers": [],
        "query_string": f"ticket={fresh_ticket}".encode("utf-8"),
    })
    user_from_ticket = get_current_user_for_stream(
        request=req_ticket,
        ticket=fresh_ticket,
        token=None,
        access_token=None,
        db=db_session,
    )
    assert user_from_ticket.id == user_approver.id

    # 3. Reusing that same ticket immediately fails with 401
    with pytest.raises(Exception) as exc_info:
        get_current_user_for_stream(
            request=req_ticket,
            ticket=fresh_ticket,
            token=None,
            access_token=None,
            db=db_session,
        )
    assert "401" in str(exc_info.value)


def test_event_filtering_per_document_access(sse_test_setup, db_session):
    """
    Events with a document_id must only be delivered to listeners authorized
    for that document (approver and admin). Unauthorized outsiders must NOT receive the event.
    """
    queue_approver = asyncio.Queue()
    queue_outsider = asyncio.Queue()
    queue_admin = asyncio.Queue()

    listener_approver = SSEListener(queue_approver, sse_test_setup["users"]["approver"])
    listener_outsider = SSEListener(queue_outsider, sse_test_setup["users"]["outsider"])
    listener_admin = SSEListener(queue_admin, sse_test_setup["users"]["admin"])

    with _listeners_mutex:
        _active_listeners.clear()
        _active_listeners.add(listener_approver)
        _active_listeners.add(listener_outsider)
        _active_listeners.add(listener_admin)

    try:
        # Broadcast document update for document assigned to Alice (approver)
        broadcast_event(
            "DOCUMENT_UPDATED",
            {
                "document_id": sse_test_setup["doc_id"],
                "status": "Under Review",
                "current_stage": 1,
            },
            db=db_session,
        )

        # Approver and Admin must receive the event
        assert not queue_approver.empty(), "Approver should have received document event"
        assert not queue_admin.empty(), "Admin should have received document event"

        # Outsider MUST NOT receive the event
        assert queue_outsider.empty(), "Outsider must NOT receive document event"

        # Verify payload content received by approver
        msg = queue_approver.get_nowait()
        assert "DOCUMENT_UPDATED" in msg
        assert sse_test_setup["doc_id"] in msg

    finally:
        with _listeners_mutex:
            _active_listeners.clear()


def test_targeted_session_kicked_filtering(sse_test_setup, db_session):
    """
    SESSION_KICKED notifications must only be sent to the specific user whose session was terminated,
    and never to other connected users.
    """
    queue_alice = asyncio.Queue()
    queue_bob = asyncio.Queue()

    listener_alice = SSEListener(queue_alice, sse_test_setup["users"]["approver"])
    listener_bob = SSEListener(queue_bob, sse_test_setup["users"]["outsider"])

    with _listeners_mutex:
        _active_listeners.clear()
        _active_listeners.add(listener_alice)
        _active_listeners.add(listener_bob)

    try:
        # Kick Alice's session
        broadcast_event(
            "SESSION_KICKED",
            {
                "user_id": sse_test_setup["users"]["approver"].id,
                "username": sse_test_setup["users"]["approver"].username,
                "new_device": "Chrome on Windows",
            },
            db=db_session,
        )

        # Alice receives her kick notification
        assert not queue_alice.empty(), "Targeted user must receive SESSION_KICKED"
        kick_msg = queue_alice.get_nowait()
        assert "SESSION_KICKED" in kick_msg

        # Bob must NOT receive Alice's kick notification
        assert queue_bob.empty(), "Other users must NOT receive SESSION_KICKED"

    finally:
        with _listeners_mutex:
            _active_listeners.clear()
