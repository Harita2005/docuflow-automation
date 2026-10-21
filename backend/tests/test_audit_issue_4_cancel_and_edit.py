import pytest
import uuid
from fastapi import HTTPException
from app.database.connection import SessionLocal
from app.database.models import Invoice, User, AuditLog
from app.routers.documents import workflow_cancel_route, update_invoice
from app.schemas.schemas import InvoiceUpdate
from unittest.mock import MagicMock


@pytest.fixture(scope="module")
def db_session():
    session = SessionLocal()
    yield session
    session.close()


def test_issue4_non_owner_cancel_gets_403(db_session):
    """A non-owner non-admin user attempting to cancel at stage 1 or beyond must get 403."""
    doc_id = f"TEST_DOC_CANCEL_{uuid.uuid4().hex[:6]}"
    owner_user = User(
        user_uid=f"TEST_USR_{uuid.uuid4().hex[:6]}",
        username=f"TEST_owner_{uuid.uuid4().hex[:4]}",
        employee_id=f"TEST_EMP_{uuid.uuid4().hex[:4]}",
        employee_name="Document Owner",
        name="Document Owner",
        email=f"owner_{uuid.uuid4().hex[:4]}@test.com",
        password_hash="test_hash",
        role="employee",
        division="VCC",
        is_active=True
    )
    attacker_user = User(
        user_uid=f"TEST_USR_{uuid.uuid4().hex[:6]}",
        username=f"TEST_attacker_{uuid.uuid4().hex[:4]}",
        employee_id=f"TEST_EMP_{uuid.uuid4().hex[:4]}",
        employee_name="Other User",
        name="Other User",
        email=f"other_{uuid.uuid4().hex[:4]}@test.com",
        password_hash="test_hash",
        role="employee",
        division="VCC",
        is_active=True
    )
    db_session.add_all([owner_user, attacker_user])
    db_session.commit()

    inv = Invoice(
        id=doc_id,
        invoice_number=f"TEST_INV_{uuid.uuid4().hex[:4]}",
        vendor_name="Test Vendor",
        amount=1000.0,
        status="Pending Approval",
        current_stage=1,
        employee_id=owner_user.employee_id,
        employee_name=owner_user.username,
        division="VCC",
        version=1
    )
    db_session.add(inv)
    db_session.commit()

    created_ids = {"users": [owner_user.id, attacker_user.id], "doc_id": doc_id}

    try:
        with pytest.raises(HTTPException) as exc_info:
            workflow_cancel_route(
                invoice_id=doc_id,
                payload={"expected_version": 1},
                db=db_session,
                user=attacker_user
            )
        assert exc_info.value.status_code == 403
        assert "Access Denied" in exc_info.value.detail
    finally:
        # Strict teardown
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete(synchronize_session=False)
        db_session.query(Invoice).filter(Invoice.id == doc_id).delete(synchronize_session=False)
        db_session.query(User).filter(User.id.in_(created_ids["users"])).delete(synchronize_session=False)
        db_session.commit()


def test_issue4_cancel_missing_expected_version_gets_422(db_session):
    """Cancelling without expected_version must fail with 422 Unprocessable Entity."""
    doc_id = f"TEST_DOC_CANCEL_{uuid.uuid4().hex[:6]}"
    admin_user = User(
        user_uid=f"TEST_USR_{uuid.uuid4().hex[:6]}",
        username=f"TEST_admin_{uuid.uuid4().hex[:4]}",
        employee_id=f"TEST_EMP_{uuid.uuid4().hex[:4]}",
        employee_name="Admin User",
        name="Admin User",
        email=f"admin_{uuid.uuid4().hex[:4]}@test.com",
        password_hash="test_hash",
        role="admin",
        division="VCC",
        is_active=True
    )
    db_session.add(admin_user)
    db_session.commit()

    inv = Invoice(
        id=doc_id,
        invoice_number=f"TEST_INV_{uuid.uuid4().hex[:4]}",
        vendor_name="Test Vendor",
        amount=1000.0,
        status="Pending Approval",
        current_stage=1,
        division="VCC",
        version=1
    )
    db_session.add(inv)
    db_session.commit()

    try:
        with pytest.raises(HTTPException) as exc_info:
            workflow_cancel_route(
                invoice_id=doc_id,
                payload={},
                db=db_session,
                user=admin_user
            )
        assert exc_info.value.status_code == 422
        assert "expected_version" in exc_info.value.detail
    finally:
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete(synchronize_session=False)
        db_session.query(Invoice).filter(Invoice.id == doc_id).delete(synchronize_session=False)
        db_session.query(User).filter(User.id == admin_user.id).delete(synchronize_session=False)
        db_session.commit()


def test_issue4_cancel_stale_version_gets_409(db_session):
    """Cancelling with a stale expected_version must fail with 409 Conflict."""
    doc_id = f"TEST_DOC_CANCEL_{uuid.uuid4().hex[:6]}"
    admin_user = User(
        user_uid=f"TEST_USR_{uuid.uuid4().hex[:6]}",
        username=f"TEST_admin_{uuid.uuid4().hex[:4]}",
        employee_id=f"TEST_EMP_{uuid.uuid4().hex[:4]}",
        employee_name="Admin User",
        name="Admin User",
        email=f"admin_{uuid.uuid4().hex[:4]}@test.com",
        password_hash="test_hash",
        role="admin",
        division="VCC",
        is_active=True
    )
    db_session.add(admin_user)
    db_session.commit()

    inv = Invoice(
        id=doc_id,
        invoice_number=f"TEST_INV_{uuid.uuid4().hex[:4]}",
        vendor_name="Test Vendor",
        amount=1000.0,
        status="Pending Approval",
        current_stage=1,
        division="VCC",
        version=2  # DB version is 2
    )
    db_session.add(inv)
    db_session.commit()

    try:
        with pytest.raises(HTTPException) as exc_info:
            workflow_cancel_route(
                invoice_id=doc_id,
                payload={"expected_version": 1},  # Stale version
                db=db_session,
                user=admin_user
            )
        assert exc_info.value.status_code == 409
        assert "modified by another" in exc_info.value.detail
    finally:
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete(synchronize_session=False)
        db_session.query(Invoice).filter(Invoice.id == doc_id).delete(synchronize_session=False)
        db_session.query(User).filter(User.id == admin_user.id).delete(synchronize_session=False)
        db_session.commit()


def test_issue4_edit_after_approval_gets_409(db_session):
    """Editing a document that has already been Approved must fail with 409 Conflict."""
    import asyncio
    doc_id = f"TEST_DOC_EDIT_{uuid.uuid4().hex[:6]}"
    admin_user = User(
        user_uid=f"TEST_USR_{uuid.uuid4().hex[:6]}",
        username=f"TEST_admin_{uuid.uuid4().hex[:4]}",
        employee_id=f"TEST_EMP_{uuid.uuid4().hex[:4]}",
        employee_name="Admin User",
        name="Admin User",
        email=f"admin_{uuid.uuid4().hex[:4]}@test.com",
        password_hash="test_hash",
        role="admin",
        division="VCC",
        is_active=True
    )
    db_session.add(admin_user)
    db_session.commit()

    inv = Invoice(
        id=doc_id,
        invoice_number=f"TEST_INV_{uuid.uuid4().hex[:4]}",
        vendor_name="Approved Vendor",
        amount=5000.0,
        status="Approved",
        current_stage=3,
        division="VCC",
        version=1
    )
    db_session.add(inv)
    db_session.commit()

    mock_request = MagicMock()
    async def mock_json():
        return {"amount": 6000.0, "expected_version": 1}
    mock_request.json = mock_json

    try:
        payload = InvoiceUpdate(amount=6000.0, expected_version=1)
        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(update_invoice(
                invoice_id=doc_id,
                payload=payload,
                req=mock_request,
                db=db_session,
                user=admin_user
            ))
        assert exc_info.value.status_code == 409
        assert "Approved" in exc_info.value.detail or "locked" in exc_info.value.detail
    finally:
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete(synchronize_session=False)
        db_session.query(Invoice).filter(Invoice.id == doc_id).delete(synchronize_session=False)
        db_session.query(User).filter(User.id == admin_user.id).delete(synchronize_session=False)
        db_session.commit()
