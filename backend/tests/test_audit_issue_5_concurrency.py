import pytest
import uuid
import threading
from fastapi import HTTPException
from app.database.connection import SessionLocal
from app.database.models import Invoice, User, AuditLog, WorkflowProfile, WorkflowStepDefinition
from app.routers.documents import workflow_approve_payload


@pytest.fixture(scope="module")
def db_session():
    session = SessionLocal()
    yield session
    session.close()


def test_issue5_concurrency_two_simultaneous_approvals(db_session):
    """
    ISSUE 5 Verification:
    Two simultaneous approvals with the same expected_version:
    Exactly one succeeds and the other gets 409 Conflict.
    """
    uid_suffix = uuid.uuid4().hex[:6]
    doc_id = f"TEST_CF_CONC_{uid_suffix}"
    profile_name = f"TEST_WF_{uid_suffix}"

    admin_username = f"TEST_admin_{uid_suffix}"

    admin_user = User(
        user_uid=f"TEST_USR_{uid_suffix}",
        username=admin_username,
        employee_id=f"TEST_EMP_{uid_suffix}",
        employee_name="Concurrency Admin",
        name="Concurrency Admin",
        email=f"admin_{uid_suffix}@test.com",
        password_hash="test_hash",
        role="admin",
        division="VCC",
        is_active=True
    )

    wf_profile = WorkflowProfile(
        profile_name=profile_name,
        workflow_type="CUSTOMER FEEDBACK",
        is_deleted=False
    )

    step1 = WorkflowStepDefinition(
        profile_name=profile_name,
        stage_number=1,
        step_name="Stage 1",
        approver_target=admin_username
    )
    step2 = WorkflowStepDefinition(
        profile_name=profile_name,
        stage_number=2,
        step_name="Stage 2",
        approver_target=admin_username
    )

    inv = Invoice(
        id=doc_id,
        invoice_number=f"TEST_INV_{uid_suffix}",
        document_type="CUSTOMER FEEDBACK",
        vendor_name="Concurrent Vendor",
        amount=1500.0,
        status="Pending Approval",
        current_stage=1,
        total_stages=2,
        assigned_approver=admin_username,
        workflow_profile_id=profile_name,
        division="VCC",
        version=1,
        is_deleted=False
    )

    results = []
    errors = []

    def approve_worker(name):
        worker_session = SessionLocal()
        try:
            worker_user = worker_session.query(User).filter(User.username == admin_username).first()
            payload = {
                "invoiceId": doc_id,
                "expected_version": 1,
                "expected_stage": 1,
                "comments": "Concurrent test approval"
            }
            res = workflow_approve_payload(
                payload=payload,
                db=worker_session,
                user=worker_user
            )
            results.append((name, res))
        except HTTPException as he:
            errors.append((name, he))
        except Exception as e:
            errors.append((name, e))
        finally:
            worker_session.close()

    try:
        db_session.add(admin_user)
        db_session.add(wf_profile)
        db_session.add_all([step1, step2])
        db_session.add(inv)
        db_session.commit()

        t1 = threading.Thread(target=approve_worker, args=("t1",))
        t2 = threading.Thread(target=approve_worker, args=("t2",))

        t1.start()
        t2.start()

        t1.join()
        t2.join()

        print("\nDEBUG RESULTS:", results)
        print("DEBUG ERRORS:", errors)

        # Exactly one succeeds and the other gets 409
        assert len(results) == 1, f"Expected 1 success, got {len(results)}: {results}. Errors: {errors}"
        assert len(errors) == 1, f"Expected 1 error, got {len(errors)}: {errors}"
        assert isinstance(errors[0][1], HTTPException)
        assert errors[0][1].status_code == 409
    finally:
        # Strict teardown of TEST_ rows
        db_session.rollback()
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete(synchronize_session=False)
        db_session.query(Invoice).filter(Invoice.id == doc_id).delete(synchronize_session=False)
        db_session.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == profile_name).delete(synchronize_session=False)
        db_session.query(WorkflowProfile).filter(WorkflowProfile.profile_name == profile_name).delete(synchronize_session=False)
        if admin_user.id:
            db_session.query(User).filter(User.id == admin_user.id).delete(synchronize_session=False)
        else:
            db_session.query(User).filter(User.username == admin_user.username).delete(synchronize_session=False)
        db_session.commit()
