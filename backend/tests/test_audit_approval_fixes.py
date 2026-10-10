import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Invoice, WorkflowProfile, WorkflowStepDefinition
from app.auth import create_access_token

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
    admin = db_session.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = db_session.query(User).filter(User.role == "admin").first()
    
    approver = db_session.query(User).filter(User.is_active == True, User.username != "admin").first()
    if not approver:
        approver = admin

    token_admin = create_access_token({"sub": admin.username, "role": admin.role})
    token_approver = create_access_token({"sub": approver.username, "role": approver.role})

    return {
        "admin": admin,
        "approver": approver,
        "token_admin": token_admin,
        "token_approver": token_approver
    }


def test_aud01_workflow_save_blocks_empty_approver_target(test_setup):
    """
    AUD-01: Workflow save validation.
    Saving a workflow profile with a step that has no approver_target must be blocked with 422.
    """
    token = test_setup["token_admin"]
    payload = {
        "profile_name": f"TEST_WF_AUD01_{uuid.uuid4().hex[:6]}",
        "workflow_category": "TEST_AUD",
        "workflow_type": "AP INVOICE",
        "status": "Active",
        "steps": [
            {
                "stage_number": 1,
                "step_name": "Stage 1",
                "approver_type": "User",
                "approver_target": test_setup["approver"].username
            },
            {
                "stage_number": 2,
                "step_name": "Stage 2 - Empty Approver",
                "approver_type": "User",
                "approver_target": ""  # EMPTY approver target
            }
        ]
    }
    resp = client.post("/api/admin/workflows", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422, f"Expected 422 when approver_target is empty, got {resp.status_code}: {resp.text}"
    assert "approver_target" in resp.text.lower() or "approver" in resp.text.lower()


def test_aud01_approval_blocks_premature_approval_when_next_step_approver_empty(db_session, test_setup):
    """
    AUD-01: When next step exists in DB but has empty approver_target,
    the document MUST NOT be marked 'Approved'.
    It must raise 422/500 configuration error and leave the document in its current status.
    """
    token = test_setup["token_approver"]
    approver = test_setup["approver"]

    wf_name = f"AUD01_CORRUPT_WF_{uuid.uuid4().hex[:6]}"
    wf = WorkflowProfile(
        profile_name=wf_name,
        workflow_code=f"WF-{uuid.uuid4().hex[:4]}",
        workflow_category="TEST_AUD",
        workflow_type="AP INVOICE",
        status="Active"
    )
    db_session.add(wf)

    step1 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="Stage 1 Verification",
        approver_type="User",
        approver_target=approver.username
    )
    step2 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=2,
        step_name="Stage 2 Empty Target",
        approver_type="User",
        approver_target=""  # Corrupt / empty in database
    )
    db_session.add_all([step1, step2])

    doc_id = f"DOC-AUD01-{uuid.uuid4().hex[:6]}"
    inv = Invoice(
        id=doc_id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
        vendor_name="AUD Vendor",
        amount=100.0,
        status="In Progress (Stage 1)",
        current_stage=1,
        workflow_profile_id=wf_name,
        assigned_approver=approver.username,
        is_deleted=False,
        version=1,
        contact_person="system"
    )
    from app.config.settings import settings
    pdf_path = settings.UPLOAD_DIR / f"{doc_id}.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test dummy attachment")
    inv.file_path = str(pdf_path)
    inv.file_url = f"/api/documents/{doc_id}/file"
    db_session.add(inv)
    db_session.commit()

    try:
        # User approves Stage 1 via workflow approve endpoint
        resp = client.post(
            "/api/workflows/approve",
            json={
                "invoiceId": doc_id,
                "expected_stage": 1,
                "expected_version": 1,
                "comments": "Approved Stage 1"
            },
            headers={"Authorization": f"Bearer {token}"}
        )

        # Must NOT be 200/Approved
        assert resp.status_code == 422, f"Expected 422 configuration error, got {resp.status_code}: {resp.text}"

        # Ensure document remains in its current status and is NOT 'Approved'
        db_session.refresh(inv)
        assert inv.status != "Approved", "BUG AUD-01 reproduced: Document was prematurely marked Approved!"
        assert inv.current_stage == 1, "Document current_stage should have remained 1"
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except Exception:
                pass
        db_session.delete(inv)
        db_session.delete(step1)
        db_session.delete(step2)
        db_session.delete(wf)
        db_session.commit()
