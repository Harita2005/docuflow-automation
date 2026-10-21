import pytest
import uuid
from app.database.connection import SessionLocal
from app.database.models import Invoice, User, AuditLog
from app.routers.documents import get_all_invoices, get_invoice_by_id, get_work_tracker_documents


@pytest.fixture(scope="module")
def db_session():
    session = SessionLocal()
    yield session
    session.close()


def test_issue6_get_endpoints_do_not_mutate_document(db_session):
    """
    ISSUE 6 Verification:
    Calling GET endpoints twice changes NO database column (status, assigned_approver, current_stage, version).
    """
    uid_suffix = uuid.uuid4().hex[:6]
    doc_id = f"TEST_DOC_GET_{uid_suffix}"

    user = User(
        user_uid=f"TEST_USR_{uid_suffix}",
        username=f"TEST_user_{uid_suffix}",
        employee_id=f"TEST_EMP_{uid_suffix}",
        employee_name="Readonly User",
        name="Readonly User",
        email=f"readonly_{uid_suffix}@test.com",
        password_hash="test_hash",
        role="admin",
        division="VCC",
        is_active=True
    )

    inv = Invoice(
        id=doc_id,
        invoice_number=f"TEST_INV_{uid_suffix}",
        vendor_name="Readonly Vendor",
        amount=2500.0,
        status="Pending Approval",
        current_stage=1,
        total_stages=3,
        assigned_approver="original_approver",
        workflow_profile_id=None,
        division="VCC",
        version=1,
        is_deleted=False
    )

    try:
        db_session.add(user)
        db_session.add(inv)
        db_session.commit()

        # Snapshot before calling GET
        db_session.refresh(inv)
        before_state = (inv.status, inv.assigned_approver, inv.current_stage, inv.version)

        # 1. Call GET /api/documents twice
        get_all_invoices(status=None, db=db_session, current_user=user)
        get_all_invoices(status=None, db=db_session, current_user=user)

        # 2. Call GET /api/documents/{id} twice
        get_invoice_by_id(invoice_id=doc_id, db=db_session, current_user=user)
        get_invoice_by_id(invoice_id=doc_id, db=db_session, current_user=user)

        # 3. Call GET /work-tracker twice
        get_work_tracker_documents(status=None, db=db_session, current_user=user)
        get_work_tracker_documents(status=None, db=db_session, current_user=user)

        # Query database row directly (bypass session cache)
        fresh_inv = db_session.query(Invoice).filter(Invoice.id == doc_id).first()
        after_state = (fresh_inv.status, fresh_inv.assigned_approver, fresh_inv.current_stage, fresh_inv.version)

        assert before_state == after_state, f"Database row was mutated during GET! Before: {before_state}, After: {after_state}"
    finally:
        db_session.rollback()
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete(synchronize_session=False)
        db_session.query(Invoice).filter(Invoice.id == doc_id).delete(synchronize_session=False)
        if user.id:
            db_session.query(User).filter(User.id == user.id).delete(synchronize_session=False)
        else:
            db_session.query(User).filter(User.username == user.username).delete(synchronize_session=False)
        db_session.commit()
