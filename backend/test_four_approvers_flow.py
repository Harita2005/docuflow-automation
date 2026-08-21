import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.main import app
from app.database import SessionLocal
from app.models import User, Invoice, WorkflowProfile, WorkflowStepDefinition, InAppNotification, InvoiceChecklistState

client = TestClient(app)

print("==================================================================")
print("     TESTING FULL 4-STAGE SEQUENTIAL WORKFLOW (YUVASREE -> NATTUDURAI -> VIGNESH -> VARUNAN)")
print("==================================================================")

db = SessionLocal()
try:
    # Reset DOC-101 to Stage 1 for testing
    doc_id = "DOC-101"
    doc_db = db.query(Invoice).filter(Invoice.id == doc_id).first()
    if doc_db:
        doc_db.current_stage = 1
        doc_db.total_stages = 4
        doc_db.file_url = "/uploads/DOC-101_Tax_Invoice.pdf"
        doc_db.assigned_approver = "YUVASREE (E24-04070)"
        doc_db.status = "In Progress (Attachment Status)"
        db.commit()

    # 1. Login all 4 Approvers
    token_yuva = client.post("/api/auth/login", json={"username": "YUVASREE (E24-04070)", "password": "password123"}).json()["token"]
    headers_yuva = {"Authorization": f"Bearer {token_yuva}"}

    token_nattu = client.post("/api/auth/login", json={"username": "Nattudurai", "password": "password123"}).json()["token"]
    headers_nattu = {"Authorization": f"Bearer {token_nattu}"}

    token_vignesh = client.post("/api/auth/login", json={"username": "VIGNESH_E25-01583", "password": "password123"}).json()["token"]
    headers_vignesh = {"Authorization": f"Bearer {token_vignesh}"}

    token_varunan = client.post("/api/auth/login", json={"username": "VARUNAN (E22_02046)", "password": "password123"}).json()["token"]
    headers_varunan = {"Authorization": f"Bearer {token_varunan}"}

    # 2. Pick sample document (DOC-101)
    doc_res = client.get(f"/api/documents/{doc_id}", headers=headers_yuva).json()
    print(f"\n[Stage 1 Initial] Doc {doc_id} is at Stage {doc_res['current_stage']}/4, assigned to: {doc_res['assigned_approver']}")

    # Stage 2, 3, 4 should NOT see it in their pending queue
    nattu_docs = [d["id"] for d in client.get("/api/documents", headers=headers_nattu).json() if d.get("is_current_approver")]
    print(f" -> Is in Nattudurai pending queue at Stage 1? {doc_id in nattu_docs} (Expected: False)")
    assert doc_id not in nattu_docs

    def check_stage_compliance(stage_name):
        items = db.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == doc_id,
            InvoiceChecklistState.stage_name == stage_name
        ).all()
        for it in items:
            it.is_checked = True
        db.commit()

    # 3. YUVASREE approves Stage 1 (Attachment Status)
    check_stage_compliance("Attachment Status")
    res_stg1 = client.post("/api/workflows/approve", json={"invoiceId": doc_id, "comments": "Stage 1 Verified by Yuvasree"}, headers=headers_yuva)
    print(f"\n[Step 1] YUVASREE Approves Stage 1 -> Status: {res_stg1.status_code}, Current Stage: {res_stg1.json().get('current_stage')}")
    assert res_stg1.status_code == 200
    assert res_stg1.json().get("current_stage") == 2

    # Now Nattudurai should see it in pending queue!
    nattu_docs_after = [d["id"] for d in client.get("/api/documents", headers=headers_nattu).json() if d.get("is_current_approver")]
    print(f" -> Is in Nattudurai pending queue at Stage 2? {doc_id in nattu_docs_after} (Expected: True)")
    assert doc_id in nattu_docs_after

    # 4. NATTUDURAI approves Stage 2 (Second Approval)
    check_stage_compliance("Second Approval")
    res_stg2 = client.post("/api/workflows/approve", json={"invoiceId": doc_id, "comments": "Stage 2 Verified by Nattudurai"}, headers=headers_nattu)
    print(f"\n[Step 2] NATTUDURAI Approves Stage 2 -> Status: {res_stg2.status_code}, Current Stage: {res_stg2.json().get('current_stage')}")
    assert res_stg2.status_code == 200
    assert res_stg2.json().get("current_stage") == 3

    # Now Vignesh should see it in pending queue!
    vignesh_docs_after = [d["id"] for d in client.get("/api/documents", headers=headers_vignesh).json() if d.get("is_current_approver")]
    print(f" -> Is in Vignesh pending queue at Stage 3? {doc_id in vignesh_docs_after} (Expected: True)")
    assert doc_id in vignesh_docs_after

    # 5. VIGNESH approves Stage 3 (Third Approval)
    check_stage_compliance("Third Approval")
    res_stg3 = client.post("/api/workflows/approve", json={"invoiceId": doc_id, "comments": "Stage 3 Verified by Vignesh"}, headers=headers_vignesh)
    print(f"\n[Step 3] VIGNESH Approves Stage 3 -> Status: {res_stg3.status_code}, Current Stage: {res_stg3.json().get('current_stage')}")
    assert res_stg3.status_code == 200
    assert res_stg3.json().get("current_stage") == 4

    # Now Varunan should see it in pending queue!
    varunan_docs_after = [d["id"] for d in client.get("/api/documents", headers=headers_varunan).json() if d.get("is_current_approver")]
    print(f" -> Is in Varunan pending queue at Stage 4? {doc_id in varunan_docs_after} (Expected: True)")
    assert doc_id in varunan_docs_after

    # 6. VARUNAN approves Final Stage 4 (Final Approval)
    check_stage_compliance("Final Approval")
    res_stg4 = client.post("/api/workflows/approve", json={"invoiceId": doc_id, "comments": "Final Approval by Varunan"}, headers=headers_varunan)
    print(f"\n[Step 4] VARUNAN Approves Stage 4 -> Status: {res_stg4.status_code}, Doc Status: {res_stg4.json().get('status')}")
    assert res_stg4.status_code == 200
    assert res_stg4.json().get("status") == "Settled"

    print("\n==================================================================")
    print(">>> 100% SUCCESS: 4-STAGE APPROVAL WORKFLOW FULLY VERIFIED!")
    print("==================================================================")

finally:
    db.close()
