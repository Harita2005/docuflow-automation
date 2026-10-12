import pytest
from io import BytesIO
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Invoice, BusinessRule, WorkflowProfile, WorkflowStepDefinition
from app.auth import create_access_token
import datetime
import json

client = TestClient(app)

def create_dummy_pdf_bytes():
    pdf_content = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
        b"xref\n"
        b"0 4\n"
        b"0000000000 65535 f \n"
        b"0000000010 00000 n \n"
        b"0000000060 00000 n \n"
        b"0000000117 00000 n \n"
        b"trailer<</Size 4/Root 1 0 R>>\n"
        b"startxref\n"
        b"198\n"
        b"%%EOF\n"
    )
    return pdf_content

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def test_env(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    assert admin is not None, "Admin user must exist"
    
    token = create_access_token({"sub": admin.username, "role": admin.role})
    headers = {"Authorization": f"Bearer {token}"}
    
    # Create or retrieve test workflow 1
    wf1 = db_session.query(WorkflowProfile).filter(WorkflowProfile.profile_name == "TEST_WF_AUTO_1").first()
    if not wf1:
        wf1 = WorkflowProfile(
            profile_name="TEST_WF_AUTO_1",
            status="Active",
            description="Test Workflow 1"
        )
        db_session.add(wf1)
        db_session.flush()
        
        step1 = WorkflowStepDefinition(
            profile_name=wf1.profile_name,
            stage_number=1,
            step_name="Stage 1 Admin Approval",
            approver_type="User",
            approver_target=admin.username
        )
        db_session.add(step1)
        db_session.commit()
        db_session.refresh(wf1)

    # Create or retrieve test workflow 2
    wf2 = db_session.query(WorkflowProfile).filter(WorkflowProfile.profile_name == "TEST_WF_AUTO_2").first()
    if not wf2:
        wf2 = WorkflowProfile(
            profile_name="TEST_WF_AUTO_2",
            status="Active",
            description="Test Workflow 2"
        )
        db_session.add(wf2)
        db_session.flush()
        
        step2 = WorkflowStepDefinition(
            profile_name=wf2.profile_name,
            stage_number=1,
            step_name="Stage 1 Admin Approval 2",
            approver_type="User",
            approver_target=admin.username
        )
        db_session.add(step2)
        db_session.commit()
        db_session.refresh(wf2)

    return {
        "admin": admin,
        "token": token,
        "headers": headers,
        "wf1": wf1,
        "wf2": wf2
    }

def test_1_manual_mode_extract_preview_and_confirm(test_env, db_session):
    """Verify manual mode: extract-preview produces staged document, confirm-ingest completes manual workflow start."""
    headers = test_env["headers"]
    pdf_bytes = create_dummy_pdf_bytes()
    
    files = {"file": ("manual_test_doc.pdf", BytesIO(pdf_bytes), "application/pdf")}
    data = {
        "workflow_profile": test_env["wf1"].profile_name,
        "document_type": "AP INVOICE",
        "division": "VCC"
    }
    
    res = client.post("/api/documents/extract-preview", headers=headers, files=files, data=data)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("success") is True
    assert "temp_file_id" in body
    assert "extracted_data" in body
    temp_id = body["temp_file_id"]

    # Now verify confirm-ingest completes the manual workflow start using form data
    confirm_form = {
        "temp_file_id": temp_id,
        "document_type": "AP INVOICE",
        "workflow_profile": test_env["wf1"].profile_name,
        "invoice_number": f"INV-MAN-{int(datetime.datetime.utcnow().timestamp()) % 100000}",
        "vendor_name": "Manual Mode Vendor",
        "amount": "12500.0",
        "division": "VCC"
    }
    res_confirm = client.post("/api/documents/confirm-ingest", headers=headers, data=confirm_form)
    assert res_confirm.status_code == 200, res_confirm.text
    conf_body = res_confirm.json()
    assert conf_body.get("success") is True
    assert "invoice" in conf_body
    assert (conf_body["invoice"].get("workflow_profile_id") == test_env["wf1"].profile_name or conf_body["invoice"].get("workflow_profile") == test_env["wf1"].profile_name)


def test_2_auto_mode_no_matching_rule_returns_422(test_env, db_session):
    """Verify automatic mode: when no business rule matches document criteria, returns 422 with clear error."""
    headers = test_env["headers"]
    pdf_bytes = create_dummy_pdf_bytes()
    
    files = {"file": ("auto_unmatched.pdf", BytesIO(pdf_bytes), "application/pdf")}
    data = {"document_type": "NON_EXISTENT_DOC_TYPE_FOR_TEST"}
    
    res = client.post("/api/documents/auto-workflow", headers=headers, files=files, data=data)
    assert res.status_code == 422, res.text
    detail = res.json().get("detail", "")
    assert "No active business rule matched document criteria" in detail


def test_3_auto_mode_ambiguous_matches_returns_409(test_env, db_session):
    """Verify automatic mode: when multiple rules match at equal top priority pointing to different workflows, returns 409."""
    headers = test_env["headers"]
    
    doc_type_ambig = "AMBIGUOUS_TEST_TYPE"
    
    rule1 = BusinessRule(
        rule_name="Ambig Rule 1",
        description="Ambig Rule 1",
        priority=99,
        is_active=True,
        document_type=doc_type_ambig,
        target_workflow_id=test_env["wf1"].profile_name,
        rule_action="WORKFLOW_ROUTE",
        conditions_json="{}",
        is_deleted=False
    )
    rule2 = BusinessRule(
        rule_name="Ambig Rule 2",
        description="Ambig Rule 2",
        priority=99,
        is_active=True,
        document_type=doc_type_ambig,
        target_workflow_id=test_env["wf2"].profile_name,
        rule_action="WORKFLOW_ROUTE",
        conditions_json="{}",
        is_deleted=False
    )
    db_session.add_all([rule1, rule2])
    db_session.commit()
    
    try:
        pdf_bytes = create_dummy_pdf_bytes()
        files = {"file": ("auto_ambiguous.pdf", BytesIO(pdf_bytes), "application/pdf")}
        data = {"document_type": doc_type_ambig}
        
        res = client.post("/api/documents/auto-workflow", headers=headers, files=files, data=data)
        assert res.status_code == 409, res.text
        detail = res.json().get("detail", "")
        assert "Ambiguous Workflow Match" in detail
        assert "Multiple conflicting business rules" in detail
    finally:
        # Cleanup rules
        db_session.delete(rule1)
        db_session.delete(rule2)
        db_session.commit()


def test_4_auto_mode_unique_match_success(test_env, db_session):
    """Verify automatic mode: unique matching rule routes document, creates Invoice, and assigns Stage 1 approver."""
    headers = test_env["headers"]
    unique_type = "UNIQUE_AUTO_MATCH_TYPE"
    
    rule = BusinessRule(
        rule_name="Unique Auto Rule",
        description="Unique Auto Rule",
        priority=99,
        is_active=True,
        document_type=unique_type,
        target_workflow_id=test_env["wf1"].profile_name,
        rule_action="WORKFLOW_ROUTE",
        conditions_json="{}",
        is_deleted=False
    )
    db_session.add(rule)
    db_session.commit()
    
    try:
        pdf_bytes = create_dummy_pdf_bytes()
        files = {"file": ("auto_success.pdf", BytesIO(pdf_bytes), "application/pdf")}
        data = {"document_type": unique_type}
        
        res = client.post("/api/documents/auto-workflow", headers=headers, files=files, data=data)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body.get("success") is True
        assert body["matched_rule"] == "Unique Auto Rule"
        assert body["matched_workflow"] == test_env["wf1"].profile_name
        assert "invoice" in body
        assert body["invoice"]["current_stage"] == 1
        assert body["invoice"]["assigned_approver"] == test_env["admin"].username
    finally:
        db_session.delete(rule)
        db_session.commit()
