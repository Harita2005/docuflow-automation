import json
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import Invoice, InvoiceChecklistState, ChecklistTemplate

client = TestClient(app)

print("==================================================================")
print("             DOCUFLOW CHECKLISTS VERIFICATION TEST                ")
print("==================================================================")

# 1. Verification Test Setup
print("\n[1] Bypassing explicit auth headers (using default admin context)...")
headers = {}
print("Setup ready.")

# 2. Sync a new invoice to trigger checklist creation
print("\n[2] Ingesting test invoice...")
import time
unique_key = int(time.time())
sync_payload = {
    "doc_key": unique_key,
    "doc_num": f"INV/2026/VCC/{unique_key}",
    "vendor_name": "LMW TEXTILE MACHINERY LTD",
    "amount": 250000.0,
    "division": "VCC",
    "category": "Asset with Cost Center",
    "plant": "TN-SIVAKASI"
}
sync_res = client.post("/api/sync/document", json=sync_payload)
assert sync_res.status_code == 200
inv_data = sync_res.json()
invoice_id = inv_data["document_id"]
print(f"Synced invoice: {invoice_id}")
print(f"Workflow Profile assigned: {inv_data['workflow_profile_id']}")
print(f"Status: {inv_data['status']}")

# 3. GET Checklist
print("\n[3] Fetching checklist items from GET /api/invoices/{invoice_id}/checklist...")
checklist_res = client.get(f"/api/invoices/{invoice_id}/checklist", headers=headers)
assert checklist_res.status_code == 200
items = checklist_res.json()
print(f"Found {len(items)} checklist items for Stage 1:")
for item in items:
    print(f" - {item['item_text']}: Checked={item['is_checked']}")
    assert item['is_checked'] == False

# 4a. Attempt to approve without document attachment (should fail with 400)
print("\n[4a] Attempting approval without document attached in Stage 1...")
approve_res = client.post("/api/workflows/approve", json={
    "invoiceId": invoice_id,
    "comments": "Testing approval without attachment"
}, headers=headers)
print(f"Approval status code: {approve_res.status_code}")
print(f"Response: {approve_res.json()}")
assert approve_res.status_code == 400
assert "Document Attachment Required" in approve_res.json()["detail"]
print("Correctly blocked: Document attachment is strictly required for Stage 1.")

# 4b. Attach a physical document to this invoice
print("\n[4b] Attaching physical document to invoice...")
import io
dummy_pdf = io.BytesIO(b"%PDF-1.4 dummy pdf content")
attach_res = client.post(
    f"/api/invoices/{invoice_id}/version",
    files={"file": ("invoice_8801.pdf", dummy_pdf, "application/pdf")},
    headers=headers
)
assert attach_res.status_code == 200
print("Document attached successfully.")

# 4c. Attempt to approve with document attached but with unchecked checklist items (should fail with 400)
print("\n[4c] Attempting approval with unchecked checklist items...")
approve_res2 = client.post("/api/workflows/approve", json={
    "invoiceId": invoice_id,
    "comments": "Testing approval without checking checklist"
}, headers=headers)
print(f"Approval status code: {approve_res2.status_code}")
print(f"Response: {approve_res2.json()}")
assert approve_res2.status_code == 400
assert "Compliance Checklist Incomplete" in approve_res2.json()["detail"]
print("Correctly blocked: All checklist items must be checked before approving.")

# 5. Check all items for Stage 1
print("\n[5] Toggling all checklist items to Checked for Stage 1...")
checked_names = [item["item_text"] for item in items]
toggle_res = client.post(f"/api/invoices/{invoice_id}/checklist", json={
    "checked_items": checked_names
}, headers=headers)
assert toggle_res.status_code == 200
print("Toggled items on server successfully.")

# Verify they are checked
checklist_res = client.get(f"/api/invoices/{invoice_id}/checklist", headers=headers)
items = checklist_res.json()
for item in items:
    assert item["is_checked"] == True
print("Verified all items are now Checked in database for Stage 1.")

# 6. Approve Stage 1 (should succeed and advance stage)
print("\n[6] Approving Stage 1 invoice after document attachment & checklist verification...")
approve_res3 = client.post("/api/workflows/approve", json={
    "invoiceId": invoice_id,
    "comments": "Stage 1 Document & Checklist verified."
}, headers=headers)
assert approve_res3.status_code == 200
print(f"Approval successful! Status is now: {approve_res3.json()['status']}")
print(f"Current stage is now: {approve_res3.json()['current_stage']}")

# 7. Check if next stage checklists are initialized fresh and UNCHECKED
print("\n[7] Checking if Stage 2 checklists are initialized fresh and unchecked...")
checklist_res = client.get(f"/api/invoices/{invoice_id}/checklist", headers=headers)
assert checklist_res.status_code == 200
next_items = checklist_res.json()
print(f"Found {len(next_items)} checklist items for Stage 2:")
for item in next_items:
    print(f" - {item['item_text']}: Checked={item['is_checked']}")
    assert item["is_checked"] == False, f"Expected item {item['item_text']} to be unchecked for next approver, but got {item['is_checked']}"

print("Verified: Stage 2 checklist is 100% FRESH and UNCHECKED for the next approver!")

# 8. Test Step-Down Rejection (Returning from Stage 3 -> Stage 2 -> Stage 1)
print("\n[8] Testing rejection at current stage -> Should step down progressively to Stage 1...")
curr = approve_res3.json()['current_stage']
while curr > 1:
    print(f"Rejecting at Stage {curr}...")
    rej_res = client.post("/api/workflows/reject", json={
        "invoiceId": invoice_id,
        "user": "FinanceApprover",
        "comments": f"Returning from Stage {curr} to Stage {curr - 1}"
    }, headers=headers)
    assert rej_res.status_code == 200
    new_curr = rej_res.json()['current_stage']
    print(f"Stepped down from Stage {curr} to Stage {new_curr} (Status: {rej_res.json()['status']})")
    assert new_curr == curr - 1
    curr = new_curr

assert curr == 1
assert "Attachment Status" in rej_res.json()['status']
print("Verified: Document stepped down stage-by-stage all the way back to Stage 1 (Initiator / Attachment Status)!")

# 9. Initiator re-verifies checklist at Stage 1 and re-approves -> Advances forward again
print("\n[9] Initiator re-checks and re-approves at Stage 1...")
chk_re = client.get(f"/api/invoices/{invoice_id}/checklist", headers=headers).json()
checked_names_re = [it["item_text"] for it in chk_re]
client.post(f"/api/invoices/{invoice_id}/checklist", json={"checked_items": checked_names_re}, headers=headers)

app_re = client.post("/api/workflows/approve", json={"invoiceId": invoice_id, "comments": "Stage 1 re-verified & forwarded"}, headers=headers)
assert app_re.status_code == 200
print(f"Re-approval successful: {app_re.json()['status']}")
assert app_re.json()['current_stage'] > 1

# 10. Rejection back to Stage 1 followed by Process Cancellation
print("\n[10] Returning back to Stage 1 and testing cancellation...")
client.post("/api/workflows/reject", json={"invoiceId": invoice_id, "comments": "Returning to Stage 1"}, headers=headers)
if app_re.json()['current_stage'] > 2:
    client.post("/api/workflows/reject", json={"invoiceId": invoice_id, "comments": "Returning to Stage 1"}, headers=headers)

cancel_res = client.post("/api/workflows/cancel", json={"invoiceId": invoice_id, "comments": "Invoice invalid - duplicate billing"}, headers=headers)
assert cancel_res.status_code == 200
assert cancel_res.json()["status"] == "Cancelled"
print("Verified: Process successfully cancelled and voided at Stage 1!")

print("\n==================================================================")
print("  ALL CHECKLIST & REJECTION STEP-DOWN TESTS PASSED SUCCESSFULLY!  ")
print("==================================================================")
