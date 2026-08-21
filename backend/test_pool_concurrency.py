import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.main import app
from app.database import SessionLocal
from app.models import User, Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog
from app.auth import get_password_hash

client = TestClient(app)

print("==================================================================")
print("   TESTING MULTI-APPROVER POOL SEMANTICS & CONCURRENCY CONTROL   ")
print("==================================================================")

db = SessionLocal()
try:
    # 1. Setup Test Users (Sibitha and Vivek in Stage 1 Pool, Gokulavasan in Stage 2)
    def ensure_user(uname, emp_id, emp_name):
        u = db.query(User).filter(User.username == uname).first()
        if not u:
            u = User(
                user_uid=f"USR-{emp_id}",
                employee_id=emp_id,
                employee_name=emp_name,
                name=emp_name,
                username=uname,
                email=f"{uname}@test.com",
                role="employee",
                password_hash=get_password_hash("password123"),
                is_active=True
            )
            db.add(u)
        return u

    ensure_user("SIBITHA", "SIBITHA", "SIBITHA")
    ensure_user("VIVEK_00336", "00336", "VIVEK_00336")
    ensure_user("GOKULAVASAN_00219", "00219", "GOKULAVASAN_00219")
    db.commit()

    token_sibitha = client.post("/api/auth/login", json={"username": "SIBITHA", "password": "password123"}).json()["token"]
    headers_sibitha = {"Authorization": f"Bearer {token_sibitha}"}

    token_vivek = client.post("/api/auth/login", json={"username": "VIVEK_00336", "password": "password123"}).json()["token"]
    headers_vivek = {"Authorization": f"Bearer {token_vivek}"}

    token_gokul = client.post("/api/auth/login", json={"username": "GOKULAVASAN_00219", "password": "password123"}).json()["token"]
    headers_gokul = {"Authorization": f"Bearer {token_gokul}"}

    # 2. Setup 2-Stage Pool Workflow
    wf_name = "POOL_TEST_FLOW"
    doc_id = "DOC-POOL-TEST-01"

    db.query(Invoice).filter(Invoice.id == doc_id).delete()
    db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).delete()
    db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_name).delete()
    db.commit()

    db.add(WorkflowProfile(
        profile_name=wf_name,
        workflow_code="WF-POOL",
        workflow_category="Pool Tests",
        workflow_type="AP INVOICE",
        description="Pool Concurrency Workflow",
        status="Active",
        approval_threshold=100
    ))
    db.add(WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="First Approval",
        approver_type="Approval Pool",
        approver_target="SIBITHA, VIVEK_00336",
        document_type="AP INVOICE",
        action_required="Approve",
        permissions="Approve / Reject",
        sla_hours=48
    ))
    db.add(WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=2,
        step_name="IA Approval",
        approver_type="Approval Pool",
        approver_target="GOKULAVASAN_00219, PRADEEP_01867",
        document_type="AP INVOICE",
        action_required="Approve",
        permissions="Approve / Reject",
        sla_hours=48
    ))

    # Add Invoice at Stage 1
    db.add(Invoice(
        id=doc_id,
        invoice_number="INV-POOL-101",
        vendor_name="ABC SUPPLIERS",
        amount=75000.0,
        division="VCC",
        category="General",
        workflow_profile_id=wf_name,
        current_stage=1,
        total_stages=2,
        assigned_approver="SIBITHA, VIVEK_00336",
        status="Initiated (First Approval)",
        file_url="/uploads/sample.pdf"
    ))
    db.commit()

    print("\n[Stage 1 Initial State] Document created and assigned to pool: SIBITHA, VIVEK_00336")

    # 3. Check visibility: BOTH Sibitha and Vivek MUST see it and have is_current_approver=True
    res1 = client.get(f"/api/documents/{doc_id}", headers=headers_sibitha).json()
    res2 = client.get(f"/api/documents/{doc_id}", headers=headers_vivek).json()
    print(f" - SIBITHA can view? {res1.get('id') == doc_id} | is_current_approver: {res1.get('is_current_approver')}")
    print(f" - VIVEK can view? {res2.get('id') == doc_id} | is_current_approver: {res2.get('is_current_approver')}")
    assert res1.get("is_current_approver") == True
    assert res2.get("is_current_approver") == True

    # 4. SIBITHA signs off & approves first
    appr_res1 = client.post("/api/workflows/approve", json={
        "invoiceId": doc_id,
        "comments": "Signed off by Sibitha"
    }, headers=headers_sibitha)
    print(f"\n[Action] SIBITHA approves -> Status Code: {appr_res1.status_code}, Current Stage is now: {appr_res1.json().get('current_stage')}")
    assert appr_res1.status_code == 200
    assert appr_res1.json().get("current_stage") == 2

    # 5. VIVEK attempts to approve after Sibitha (Race Condition / Second Approval Prevention)
    appr_res2 = client.post("/api/workflows/approve", json={
        "invoiceId": doc_id,
        "comments": "Vivek trying to approve"
    }, headers=headers_vivek)
    print(f"\n[Protection Check] VIVEK tries to approve already-advanced Stage 1:")
    print(f" -> Status Code: {appr_res2.status_code} (Expected: 403 Forbidden)")
    print(f" -> Detail: {appr_res2.json().get('detail')}")
    assert appr_res2.status_code == 403

    # 6. Post-Approval Visibility: VIVEK MUST still be able to VIEW the document in Read-Only mode
    doc_view_vivek = client.get(f"/api/documents/{doc_id}", headers=headers_vivek)
    print(f"\n[Read-Only Check] VIVEK views document after Stage 1 completed:")
    print(f" -> View Status Code: {doc_view_vivek.status_code} (Expected: 200 OK)")
    print(f" -> is_current_approver for Vivek: {doc_view_vivek.json().get('is_current_approver')} (Expected: False - Read Only)")
    assert doc_view_vivek.status_code == 200
    assert doc_view_vivek.json().get("is_current_approver") == False

    # 7. GOKULAVASAN (Stage 2 Approver) now has the document in active queue
    doc_view_gokul = client.get(f"/api/documents/{doc_id}", headers=headers_gokul)
    print(f"\n[Stage 2 Check] GOKULAVASAN (Stage 2) accesses document:")
    print(f" -> View Status Code: {doc_view_gokul.status_code} (Expected: 200 OK)")
    print(f" -> is_current_approver for Gokul: {doc_view_gokul.json().get('is_current_approver')} (Expected: True - Actionable)")
    assert doc_view_gokul.status_code == 200
    assert doc_view_gokul.json().get("is_current_approver") == True

    print("\n==================================================================")
    print(">>> 100% SUCCESS: APPROVAL POOL & RACE-CONDITION PREVENTION TESTED!")
    print("==================================================================")

finally:
    db.close()
