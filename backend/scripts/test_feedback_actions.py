import pytest
import uuid
from fastapi.testclient import TestClient

from app.main import app
from app.database.connection import SessionLocal
from app.database.models import (
    Invoice,
    User,
    WorkflowProfile,
    WorkflowStepDefinition,
)
from app.auth import create_access_token


@pytest.fixture(scope="module")
def db_session():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def feedback_setup(db_session):
    # Ensure feedback approver user
    approver = db_session.query(User).filter(User.username == "warehouse_manager").first()
    if not approver:
        approver = User(
            user_uid=f"U-{uuid.uuid4().hex[:6].upper()}",
            username="warehouse_manager",
            employee_id="EMP-WM-01",
            employee_name="Warehouse Manager",
            name="Warehouse Manager",
            email="wm@enterprise.com",
            role="manager",
            division="HQ",
            password_hash="test_hash",
            is_active=True
        )
        db_session.add(approver)
        db_session.commit()
        db_session.refresh(approver)

    unauthorized_user = db_session.query(User).filter(User.username == "unauthorized_user").first()
    if not unauthorized_user:
        unauthorized_user = User(
            user_uid=f"U-{uuid.uuid4().hex[:6].upper()}",
            username="unauthorized_user",
            employee_id="EMP-UNAUTH-01",
            employee_name="Unauthorized User",
            name="Unauthorized User",
            email="unauth@enterprise.com",
            role="employee",
            division="HQ",
            password_hash="test_hash",
            is_active=True
        )
        db_session.add(unauthorized_user)
        db_session.commit()
        db_session.refresh(unauthorized_user)

    wf_profile_name = "test_feedback"
    profile = db_session.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_profile_name).first()
    if not profile:
        profile = WorkflowProfile(profile_name=wf_profile_name, description="Test Feedback Profile")
        db_session.add(profile)
        db_session.commit()

    db_session.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_profile_name).delete()
    step1 = WorkflowStepDefinition(
        profile_name=wf_profile_name,
        stage_number=1,
        step_name="Feedback Inspection",
        approver_target=approver.username,
        action_required="Approve"
    )
    db_session.add(step1)
    db_session.commit()

    token_approver = create_access_token({"sub": approver.username, "role": approver.role})
    token_unauth = create_access_token({"sub": unauthorized_user.username, "role": unauthorized_user.role})

    return {
        "approver": approver,
        "unauthorized_user": unauthorized_user,
        "token_approver": token_approver,
        "token_unauth": token_unauth,
        "wf_profile": wf_profile_name,
    }


def test_feedback_hold_authorization(client, db_session, feedback_setup):
    """Verify holding a feedback document requires authorization and non-terminal status."""
    doc_id = f"CMP-HOLD-{uuid.uuid4().hex[:6].upper()}"

    doc = Invoice(
        id=doc_id,
        doc_key=doc_id,
        invoice_number=doc_id,
        document_number=doc_id,
        document_type="CUSTOMER FEEDBACK",
        category="CUSTOMER FEEDBACK",
        status="Initiated (Stage 1)",
        current_stage=1,
        assigned_approver=feedback_setup["approver"].username,
        workflow_profile_id=feedback_setup["wf_profile"],
        type_of_complaint="Product Quality Issues",
    )
    db_session.add(doc)
    db_session.commit()

    # 1. Unauthorized user attempt to hold
    res_unauth = client.post(
        f"/api/documents/{doc_id}/hold",
        headers={"Authorization": f"Bearer {feedback_setup['token_unauth']}"},
        json={"remarks": "Attempting unauthorized hold"}
    )
    assert res_unauth.status_code in [403, 401], f"Expected 403/401 for unauthorized hold, got {res_unauth.status_code}: {res_unauth.text}"

    # 2. Authorized approver hold
    res_auth = client.post(
        f"/api/documents/{doc_id}/hold",
        headers={"Authorization": f"Bearer {feedback_setup['token_approver']}"},
        json={"remarks": "Placing feedback complaint on hold for lab investigation"}
    )
    assert res_auth.status_code == 200, res_auth.text
    db_session.refresh(doc)
    assert doc.status == "On Hold"


def test_feedback_approve_and_terminal_lock(client, db_session, feedback_setup):
    """Verify approving feedback complaint works and terminal status blocks further actions."""
    doc_id = f"CMP-APPR-{uuid.uuid4().hex[:6].upper()}"

    doc = Invoice(
        id=doc_id,
        doc_key=doc_id,
        invoice_number=doc_id,
        document_number=doc_id,
        document_type="CUSTOMER FEEDBACK",
        category="CUSTOMER FEEDBACK",
        status="Initiated (Stage 1)",
        current_stage=1,
        assigned_approver=feedback_setup["approver"].username,
        workflow_profile_id=feedback_setup["wf_profile"],
        type_of_complaint="Service Quality",
    )
    db_session.add(doc)
    db_session.commit()

    # 1. Approve complaint
    res_appr = client.post(
        "/api/workflows/approve",
        headers={"Authorization": f"Bearer {feedback_setup['token_approver']}"},
        json={
            "invoiceId": doc_id,
            "expected_stage": 1,
            "comments": "Approved customer feedback complaint"
        }
    )
    assert res_appr.status_code == 200, res_appr.text
    db_session.refresh(doc)
    assert doc.status == "Approved"

    # 2. Attempting to hold an already approved complaint must be blocked
    res_hold_after = client.post(
        f"/api/documents/{doc_id}/hold",
        headers={"Authorization": f"Bearer {feedback_setup['token_approver']}"},
        json={"remarks": "Attempting hold on approved doc"}
    )
    assert res_hold_after.status_code == 400, f"Expected 400 when holding approved doc, got {res_hold_after.status_code}: {res_hold_after.text}"

    # 3. Attempting to reject an already approved complaint must be blocked
    res_rej_after = client.post(
        f"/api/documents/{doc_id}/reject",
        headers={"Authorization": f"Bearer {feedback_setup['token_approver']}"},
        json={"remarks": "Attempting reject on approved doc"}
    )
    assert res_rej_after.status_code == 400, f"Expected 400 when rejecting approved doc, got {res_rej_after.status_code}: {res_rej_after.text}"


def test_feedback_reject_flow(client, db_session, feedback_setup):
    """Verify rejecting a feedback document cancels it at stage 1."""
    doc_id = f"CMP-REJ-{uuid.uuid4().hex[:6].upper()}"

    doc = Invoice(
        id=doc_id,
        doc_key=doc_id,
        invoice_number=doc_id,
        document_number=doc_id,
        document_type="CUSTOMER FEEDBACK",
        category="CUSTOMER FEEDBACK",
        status="Initiated (Stage 1)",
        current_stage=1,
        assigned_approver=feedback_setup["approver"].username,
        workflow_profile_id=feedback_setup["wf_profile"],
        type_of_complaint="Invalid Claim",
    )
    db_session.add(doc)
    db_session.commit()

    res_rej = client.post(
        f"/api/documents/{doc_id}/reject",
        headers={"Authorization": f"Bearer {feedback_setup['token_approver']}"},
        json={"remarks": "Invalid complaint claim - rejected."}
    )
    assert res_rej.status_code == 200, res_rej.text
    db_session.refresh(doc)
    assert doc.status == "Cancelled"


def test_workflow_hold_payload(client, db_session, feedback_setup):
    """Verify calling /api/workflows/hold sets status to On Hold and NEVER cancels the document."""
    doc_id = f"CMP-WFHOLD-{uuid.uuid4().hex[:6].upper()}"

    doc = Invoice(
        id=doc_id,
        doc_key=doc_id,
        invoice_number=doc_id,
        document_number=doc_id,
        document_type="CUSTOMER FEEDBACK",
        category="CUSTOMER FEEDBACK",
        status="Initiated (Stage 1)",
        current_stage=1,
        assigned_approver=feedback_setup["approver"].username,
        workflow_profile_id=feedback_setup["wf_profile"],
        type_of_complaint="Packaging Quality Issue",
    )
    db_session.add(doc)
    db_session.commit()

    res_hold = client.post(
        "/api/workflows/hold",
        headers={"Authorization": f"Bearer {feedback_setup['token_approver']}"},
        json={
            "invoiceId": doc_id,
            "comments": "Awaiting dealer response for photo clarification"
        }
    )
    assert res_hold.status_code == 200, res_hold.text
    db_session.refresh(doc)
    assert doc.status == "On Hold", f"Expected 'On Hold', got '{doc.status}'"
    assert doc.assigned_approver is not None, "Assigned approver should not be cleared on hold"

