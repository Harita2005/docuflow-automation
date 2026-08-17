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
sync_payload = {
    "doc_key": 8801,
    "doc_num": "INV/2026/VCC/8801",
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
print(f"Found {len(items)} checklist items for current stage:")
for item in items:
    print(f" - {item['item_text']}: Checked={item['is_checked']}")

# 4. Attempt to approve invoice without checking items (should fail with 400)
print("\n[4] Attempting approval with unchecked checklist items...")
approve_res = client.post("/api/workflows/approve", json={
    "invoiceId": invoice_id,
    "comments": "Testing approval"
}, headers=headers)
print(f"Approval status code: {approve_res.status_code}")
print(f"Response: {approve_res.json()}")
assert approve_res.status_code == 400
assert "Compliance Checklist Incomplete" in approve_res.json()["detail"]
print("Rejecting approval on unchecked checklist was successful!")

# 5. Check all items
print("\n[5] Toggling all checklist items to Checked...")
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
print("Verified all items are now Checked in database.")

# 6. Approve again (should succeed and advance stage)
print("\n[6] Approving invoice again after checklist verification...")
approve_res = client.post("/api/workflows/approve", json={
    "invoiceId": invoice_id,
    "comments": "Compliance verified."
}, headers=headers)
assert approve_res.status_code == 200
print(f"Approval successful! Status is now: {approve_res.json()['status']}")
print(f"Current stage is now: {approve_res.json()['current_stage']}")

# 7. Check if next stage checklists are initialized
print("\n[7] Checking if next stage checklists are initialized...")
checklist_res = client.get(f"/api/invoices/{invoice_id}/checklist", headers=headers)
assert checklist_res.status_code == 200
next_items = checklist_res.json()
print(f"Found {len(next_items)} checklist items for Stage 2:")
for item in next_items:
    print(f" - {item['item_text']}: Checked={item['is_checked']}")

print("\n==================================================================")
print("         ALL CHECKLIST VERIFICATION TESTS PASSED SUCCESSFULLY!    ")
print("==================================================================")
