import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.main import app
from app.database import SessionLocal
from app.models import User, Invoice, WorkflowProfile, WorkflowStepDefinition, InAppNotification
from app.auth import get_password_hash

client = TestClient(app)

print("==================================================================")
print("     TESTING REAL-TIME IN-APP NOTIFICATIONS ON STAGE APPROVALS    ")
print("==================================================================")

db = SessionLocal()
try:
    # Ensure users exist
    def ensure_user(uname, emp_id, emp_name):
        u = db.query(User).filter(User.username == uname).first()
        if not u:
            u = User(
                user_uid=f"USR-{emp_id}",
                employee_id=emp_id,
                employee_name=emp_name,
                name=emp_name,
                username=uname,
                email=f"{uname.lower()}@company.com",
                role="employee",
                password_hash=get_password_hash("password123"),
                is_active=True
            )
            db.add(u)
        return u

    ensure_user("SIBITHA", "SIBITHA", "SIBITHA")
    ensure_user("GOKULAVASAN_00219", "00219", "GOKULAVASAN_00219")
    db.commit()

    token_sibitha = client.post("/api/auth/login", json={"username": "SIBITHA", "password": "password123"}).json()["token"]
    headers_sibitha = {"Authorization": f"Bearer {token_sibitha}"}

    token_gokul = client.post("/api/auth/login", json={"username": "GOKULAVASAN_00219", "password": "password123"}).json()["token"]
    headers_gokul = {"Authorization": f"Bearer {token_gokul}"}

    # Setup workflow & document
    wf_name = "NOTIF_TEST_WF"
    doc_id = "DOC-NOTIF-99"

    db.query(Invoice).filter(Invoice.id == doc_id).delete()
    db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).delete()
    db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_name).delete()
    db.commit()

    db.add(WorkflowProfile(
        profile_name=wf_name,
        workflow_code="WF-NOTIF",
        workflow_category="Notif Test",
        workflow_type="AP INVOICE",
        description="Notification Test Flow",
        status="Active",
        approval_threshold=100
    ))
    db.add(WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="First Approval",
        approver_type="Specific Employee",
        approver_target="SIBITHA",
        document_type="AP INVOICE",
        action_required="Approve",
        permissions="Approve / Reject",
        sla_hours=48
    ))
    db.add(WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=2,
        step_name="IA Approval",
        approver_type="Specific Employee",
        approver_target="GOKULAVASAN_00219",
        document_type="AP INVOICE",
        action_required="Approve",
        permissions="Approve / Reject",
        sla_hours=48
    ))

    db.add(Invoice(
        id=doc_id,
        invoice_number="INV-NOTIF-777",
        vendor_name="GLOBAL LOGISTICS LTD",
        amount=125000.0,
        division="VCC",
        category="General",
        workflow_profile_id=wf_name,
        current_stage=1,
        total_stages=2,
        assigned_approver="SIBITHA",
        status="Initiated (First Approval)",
        file_url="/uploads/invoice.pdf"
    ))
    db.commit()

    print("\n[Step 1] Document DOC-NOTIF-99 created at Stage 1 (Assigned to: SIBITHA)")

    # 1. SIBITHA approves Stage 1
    appr_res = client.post("/api/workflows/approve", json={
        "invoiceId": doc_id,
        "comments": "Stage 1 items verified."
    }, headers=headers_sibitha)
    print(f"[Step 2] SIBITHA approves: Status {appr_res.status_code}, Current Stage: {appr_res.json().get('current_stage')}")
    assert appr_res.status_code == 200

    # 2. Check GOKULAVASAN_00219's notifications
    notifs_gokul = client.get("/api/notifications", headers=headers_gokul).json()
    print(f"\n[Step 3] GOKULAVASAN's Received Notifications: ({len(notifs_gokul)} total)")
    for n in notifs_gokul:
        print(f" - [{n['notification_type']}] {n['title']} (Unread: {not n['is_read']})")
        print(f"   Message: {n['message']}")

    # Verify notification received by Gokul
    matching = [n for n in notifs_gokul if n["document_id"] == doc_id]
    assert len(matching) > 0
    target_notif = matching[0]
    assert "Assigned to You" in target_notif["title"]
    assert "sibitha" in target_notif["message"].lower()
    assert "stage 1" in target_notif["message"].lower()
    assert "stage 2" in target_notif["message"].lower()

    # 3. Mark notification as read
    read_res = client.put(f"/api/notifications/{target_notif['notification_id']}/read", headers=headers_gokul)
    print(f"\n[Step 4] Mark Single as Read -> Status {read_res.status_code}")
    assert read_res.status_code == 200

    # 4. Mark all as read
    read_all_res = client.put("/api/notifications/read-all", headers=headers_gokul)
    print(f"[Step 5] Mark All as Read -> Status {read_all_res.status_code}")
    assert read_all_res.status_code == 200

    print("\n==================================================================")
    print(">>> 100% SUCCESS: REAL-TIME IN-APP NOTIFICATIONS VERIFIED!")
    print("==================================================================")

finally:
    db.close()
