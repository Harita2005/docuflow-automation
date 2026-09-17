import json
import pytest
import datetime
from fastapi.testclient import TestClient

from app.main import app
from app.database.connection import SessionLocal
from app.database.models import (
    Invoice,
    User,
    WorkflowProfile,
    WorkflowStepDefinition,
    AuditLog,
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
def test_setup(db_session):
    # Ensure test users exist
    admin_user = db_session.query(User).filter(User.username == "admin").first()
    if not admin_user:
        admin_user = db_session.query(User).filter(User.role == "admin").first()

    approver_1 = db_session.query(User).filter(User.username == "VIGNESH").first()
    if not approver_1:
        approver_1 = User(
            username="VIGNESH",
            employee_name="Vignesh Approver",
            email="vignesh@enterprise.com",
            role="manager",
            division="HQ",
            is_active=True
        )
        db_session.add(approver_1)
        db_session.commit()
        db_session.refresh(approver_1)

    approver_2 = db_session.query(User).filter(User.username == "Nattudurai").first()
    if not approver_2:
        approver_2 = User(
            username="Nattudurai",
            employee_name="Nattudurai Senior",
            email="nattu@enterprise.com",
            role="gm",
            division="HQ",
            is_active=True
        )
        db_session.add(approver_2)
        db_session.commit()
        db_session.refresh(approver_2)

    # Ensure 2-stage workflow profile exists
    wf_profile_name = "TEST_MULTI_STAGE_WF"
    profile = db_session.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_profile_name).first()
    if not profile:
        profile = WorkflowProfile(profile_name=wf_profile_name, description="Test 2-Stage Workflow")
        db_session.add(profile)
        db_session.commit()

    db_session.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_profile_name).delete()
    step1 = WorkflowStepDefinition(
        profile_name=wf_profile_name,
        stage_number=1,
        step_name="Initial Verification",
        approver_target=approver_1.username,
        action_required="Approve"
    )
    step2 = WorkflowStepDefinition(
        profile_name=wf_profile_name,
        stage_number=2,
        step_name="Senior Sign-Off",
        approver_target=approver_2.username,
        action_required="Approve"
    )
    db_session.add_all([step1, step2])
    db_session.commit()

    token_1 = create_access_token({"sub": approver_1.username, "role": approver_1.role})
    token_2 = create_access_token({"sub": approver_2.username, "role": approver_2.role})
    token_admin = create_access_token({"sub": admin_user.username, "role": admin_user.role})

    return {
        "approver_1": approver_1,
        "token_1": token_1,
        "approver_2": approver_2,
        "token_2": token_2,
        "token_admin": token_admin,
        "wf_profile_name": wf_profile_name,
    }


def test_workflow_lifecycle_progression(client, db_session, test_setup):
    token_1 = test_setup["token_1"]
    token_2 = test_setup["token_2"]
    appr_1 = test_setup["approver_1"]
    appr_2 = test_setup["approver_2"]
    wf_profile = test_setup["wf_profile_name"]

    # 1. Create a document in Stage 1 assigned to Approver 1
    doc_id = f"TEST-WF-{int(datetime.datetime.utcnow().timestamp())}"
    from app.config import settings
    pdf_file = settings.UPLOAD_DIR / f"{doc_id}.pdf"
    pdf_file.parent.mkdir(parents=True, exist_ok=True)
    pdf_file.write_bytes(b"%PDF-1.4 dummy invoice pdf content")

    test_doc = Invoice(
        id=doc_id,
        vendor_name="Acme Corporation",
        document_type="AP INVOICE",
        invoice_number="INV-WF-001",
        amount=50000.0,
        status="Pending Verification",
        current_stage=1,
        assigned_approver=appr_1.username,
        workflow_profile_id=wf_profile,
        division="HQ",
        file_url=f"/uploads/{doc_id}.pdf",
        file_path=str(pdf_file),
        is_deleted=False
    )
    db_session.add(test_doc)
    db_session.commit()
    db_session.refresh(test_doc)

    # 2. Before approval: Approver 1 sees document in Work Tracker & Pending
    headers_1 = {"Authorization": f"Bearer {token_1}"}
    res = client.get("/api/documents/work-tracker", headers=headers_1)
    assert res.status_code == 200
    docs = res.json()
    found_1 = next((d for d in docs if str(d["id"]) == doc_id), None)
    assert found_1 is not None, "Document must appear in Approver 1 Work Tracker at Stage 1"
    assert found_1["is_current_approver"] is True
    assert found_1["has_approved"] is False

    # Check status=pending filter
    res_pending = client.get("/api/documents/work-tracker?status=pending", headers=headers_1)
    assert res_pending.status_code == 200
    pending_ids = [str(d["id"]) for d in res_pending.json()]
    assert doc_id in pending_ids, "Document must be in Approver 1's pending queue"

    # Approver 2 should NOT have it in pending yet
    headers_2 = {"Authorization": f"Bearer {token_2}"}
    res_2_pending = client.get("/api/documents/work-tracker?status=pending", headers=headers_2)
    assert res_2_pending.status_code == 200
    assert doc_id not in [str(d["id"]) for d in res_2_pending.json()]

    # 3. Approver 1 approves Stage 1
    approve_payload = {
        "invoiceId": doc_id,
        "expected_stage": 1,
        "comments": "Stage 1 verified and passed.",
        "checklistVerified": True
    }
    appr_res = client.post(f"/api/records/{doc_id}/approve", headers=headers_1, json={"remarks": "Stage 1 approved"})
    if appr_res.status_code != 200:
        appr_res = client.post(f"/api/workflows/approve", headers=headers_1, json=approve_payload)
    assert appr_res.status_code == 200, f"Approval failed: {appr_res.text}"

    db_session.refresh(test_doc)
    assert test_doc.current_stage == 2
    assert "Stage 2" in test_doc.status
    assert appr_2.username in test_doc.assigned_approver

    # 4. After Stage 1 approval:
    # A) Approver 1 must NO LONGER see document in Pending
    res_pending_after = client.get("/api/documents/work-tracker?status=pending", headers=headers_1)
    assert res_pending_after.status_code == 200
    assert doc_id not in [str(d["id"]) for d in res_pending_after.json()], "Document must move OUT of Approver 1 pending queue"

    # B) Approver 1 MUST STILL see document in Work Tracker showing its ongoing progress
    res_tracker_after = client.get("/api/documents/work-tracker", headers=headers_1)
    assert res_tracker_after.status_code == 200
    tracker_doc_1 = next((d for d in res_tracker_after.json() if str(d["id"]) == doc_id), None)
    assert tracker_doc_1 is not None, "Document MUST move to Approver 1 Work Tracker to show progress"
    assert tracker_doc_1["has_approved"] is True
    assert tracker_doc_1["is_current_approver"] is False
    assert tracker_doc_1["current_stage"] == 2
    assert "Stage 2" in tracker_doc_1["status"]

    # C) Approver 2 now sees document in pending queue
    res_2_pending_after = client.get("/api/documents/work-tracker?status=pending", headers=headers_2)
    assert res_2_pending_after.status_code == 200
    assert doc_id in [str(d["id"]) for d in res_2_pending_after.json()], "Document must now be in Approver 2 pending queue"

    # 5. Approver 2 approves Stage 2 (Final Approval)
    appr_2_res = client.post(f"/api/records/{doc_id}/approve", headers=headers_2, json={"remarks": "Final approval completed"})
    if appr_2_res.status_code != 200:
        appr_2_res = client.post(f"/api/workflows/approve", headers=headers_2, json={"invoiceId": doc_id, "expected_stage": 2, "comments": "Final pass", "checklistVerified": True})
    assert appr_2_res.status_code == 200

    db_session.refresh(test_doc)
    assert test_doc.status == "Approved"

    # 6. After Final Approval:
    # A) Document MUST NOT appear in Work Tracker (strictly excludes approved docs)
    res_tracker_final = client.get("/api/documents/work-tracker", headers=headers_1)
    assert res_tracker_final.status_code == 200
    assert doc_id not in [str(d["id"]) for d in res_tracker_final.json()], "Approved document must leave Work Tracker"

    # B) Document MUST appear in Approved Documents
    res_approved = client.get("/api/documents/approved", headers=headers_1)
    assert res_approved.status_code == 200
    assert doc_id in [str(d["id"]) for d in res_approved.json()], "Approved document must be in Approved Documents"

    # Clean up test doc via soft delete
    test_doc.is_deleted = True
    db_session.commit()
