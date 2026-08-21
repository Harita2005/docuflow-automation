import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.main import app
from app.database import SessionLocal
from app.models import User, Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog

client = TestClient(app)

print("==================================================================")
print("     TESTING SEQUENTIAL WORKFLOW ROLE-BASED DOCUMENT VISIBILITY   ")
print("==================================================================")

db = SessionLocal()
try:
    # 1. Setup Test Users
    # Stage 1 Approver
    u1 = db.query(User).filter(User.username == "approver_stage1").first()
    if not u1:
        from app.auth import get_password_hash
        u1 = User(
            user_uid="USR-TST-001",
            employee_id="EMP_STG1",
            employee_name="STAGE1_APPROVER",
            name="Stage 1 Approver",
            username="approver_stage1",
            email="stg1@test.com",
            role="employee",
            password_hash=get_password_hash("password123"),
            is_active=True
        )
        db.add(u1)

    # Stage 2 Approver
    u2 = db.query(User).filter(User.username == "approver_stage2").first()
    if not u2:
        from app.auth import get_password_hash
        u2 = User(
            user_uid="USR-TST-002",
            employee_id="EMP_STG2",
            employee_name="STAGE2_APPROVER",
            name="Stage 2 Approver",
            username="approver_stage2",
            email="stg2@test.com",
            role="employee",
            password_hash=get_password_hash("password123"),
            is_active=True
        )
        db.add(u2)

    db.commit()

    # Get JWT tokens for both users
    token1 = client.post("/api/auth/login", json={"username": "approver_stage1", "password": "password123"}).json()["token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    token2 = client.post("/api/auth/login", json={"username": "approver_stage2", "password": "password123"}).json()["token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    # 2. Ingest/Create Test Document with a 2-stage flow
    test_doc_id = "DOC-SEQ-TEST-99"
    db.query(Invoice).filter(Invoice.id == test_doc_id).delete()
    db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == "TEST_2STAGE_FLOW").delete()
    db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == "TEST_2STAGE_FLOW").delete()
    db.commit()

    db.add(WorkflowProfile(
        profile_name="TEST_2STAGE_FLOW",
        workflow_code="TST-2STG",
        workflow_category="Test Category",
        workflow_type="AP INVOICE",
        description="Sequential Test Workflow",
        status="Active",
        approval_threshold=100
    ))
    db.commit()

    # Add Step 1 and Step 2 definitions
    db.add(WorkflowStepDefinition(
        profile_name="TEST_2STAGE_FLOW",
        stage_number=1,
        step_name="First Approval",
        approver_type="Specific Employee",
        approver_target="STAGE1_APPROVER",
        document_type="AP INVOICE",
        action_required="Approve",
        permissions="Approve / Reject",
        sla_hours=48
    ))
    db.add(WorkflowStepDefinition(
        profile_name="TEST_2STAGE_FLOW",
        stage_number=2,
        step_name="Final Approval",
        approver_type="Specific Employee",
        approver_target="STAGE2_APPROVER",
        document_type="AP INVOICE",
        action_required="Approve",
        permissions="Approve / Reject",
        sla_hours=48
    ))

    # Add Invoice at Stage 1
    test_inv = Invoice(
        id=test_doc_id,
        invoice_number="INV-SEQ-999",
        vendor_name="TEST VENDOR CORP",
        amount=50000.0,
        division="VCC",
        category="General",
        workflow_profile_id="TEST_2STAGE_FLOW",
        current_stage=1,
        total_stages=2,
        assigned_approver="STAGE1_APPROVER",
        status="Initiated (First Approval)",
        file_url="/uploads/test.pdf"
    )
    db.add(test_inv)
    db.commit()

    print("\n[Step 1] Created Document DOC-SEQ-TEST-99 at Stage 1 (Assigned to: STAGE1_APPROVER)")

    # 3. Check Stage 2 Approver's visibility (MUST NOT SEE IT)
    docs_u2 = client.get("/api/documents", headers=headers2).json()
    u2_doc_ids = [d["id"] for d in docs_u2]
    print(f"[Step 2] Stage 2 Approver list check: Document in queue? -> {test_doc_id in u2_doc_ids} (Expected: False)")
    assert test_doc_id not in u2_doc_ids

    # Try direct GET by Stage 2 Approver (MUST RETURN 403 Forbidden)
    res_direct = client.get(f"/api/documents/{test_doc_id}", headers=headers2)
    print(f"[Step 3] Stage 2 Approver direct access: Status Code {res_direct.status_code} (Expected: 403 Forbidden)")
    assert res_direct.status_code == 403

    # 4. Check Stage 1 Approver's visibility (MUST SEE IT)
    docs_u1 = client.get("/api/documents", headers=headers1).json()
    u1_doc_ids = [d["id"] for d in docs_u1]
    print(f"[Step 4] Stage 1 Approver list check: Document in queue? -> {test_doc_id in u1_doc_ids} (Expected: True)")
    assert test_doc_id in u1_doc_ids

    # 5. Stage 1 Approves the document
    appr_res = client.post("/api/workflows/approve", json={
        "invoiceId": test_doc_id,
        "comments": "Stage 1 approved."
    }, headers=headers1)
    print(f"[Step 5] Stage 1 approves: Status Code {appr_res.status_code}, Current Stage: {appr_res.json().get('current_stage')}")
    assert appr_res.status_code == 200

    # 6. Now check Stage 2 Approver's visibility (NOW MUST SEE IT!)
    docs_u2_after = client.get("/api/documents", headers=headers2).json()
    u2_after_ids = [d["id"] for d in docs_u2_after]
    print(f"[Step 6] Stage 2 Approver list check after Stage 1 approved: Document in queue? -> {test_doc_id in u2_after_ids} (Expected: True)")
    assert test_doc_id in u2_after_ids

    # Stage 2 Approver direct access (NOW MUST SUCCEED 200 OK)
    res_direct_after = client.get(f"/api/documents/{test_doc_id}", headers=headers2)
    print(f"[Step 7] Stage 2 Approver direct access after Stage 1 approved: Status Code {res_direct_after.status_code} (Expected: 200 OK)")
    assert res_direct_after.status_code == 200

    print("\n==================================================================")
    print(">>> 100% SUCCESS: SEQUENTIAL WORKFLOW DOCUMENT VISIBILITY VERIFIED!")
    print("==================================================================")

finally:
    db.close()
