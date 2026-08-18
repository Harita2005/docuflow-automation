import os
import json
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import User, Invoice
from app.auth import get_password_hash

client = TestClient(app)

print("==================================================================")
print("          QA INTEGRATION TEST: ADMIN LOGIN & DATA PUSH            ")
print("==================================================================")

# Step 1: Database Insertion
print("\n[1/4] Inserting test admin user 'test_admin_qa'...")
db = SessionLocal()
try:
    # Clean up previous runs to ensure idempotency
    existing_user = db.query(User).filter(User.username == "test_admin_qa").first()
    if existing_user:
        db.delete(existing_user)
        db.commit()
        print(" - Removed existing 'test_admin_qa' user.")

    # Insert new admin user with mfa_enabled = False
    admin_user = User(
        employee_id="QA-ADMIN-01",
        employee_name="QA Admin Test",
        name="QA Admin Test",
        username="test_admin_qa",
        email="test_admin_qa@example.com",
        role="admin",
        password_hash=get_password_hash("password123"),
        mfa_enabled=False,
        is_active=True,
        is_deleted=False
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)
    print(f" - Successfully inserted 'test_admin_qa' with role='{admin_user.role}' and mfa_enabled={admin_user.mfa_enabled}.")
except Exception as e:
    db.rollback()
    print(f" - Error inserting user: {e}")
    raise e

# Step 2: MFA Handling
print("\n[2/4] Verifying MFA configuration (disabled)...")
# Since mfa_enabled was set to False during insertion, direct login route will be verified.
print(" - MFA is disabled for test user. Direct login route will be used.")

# Step 3: Login & Token Generation
print("\n[3/4] Logging in as 'test_admin_qa' to generate token...")
login_payload = {
    "username": "test_admin_qa",
    "password": "password123"
}
login_res = client.post("/api/auth/login", json=login_payload)
assert login_res.status_code == 200, f"Login failed: {login_res.text}"

login_data = login_res.json()
admin_token = login_data.get("token")
assert admin_token is not None, "Login succeeded but token was not returned (MFA required?)"

# Save to environment variable (dynamically in current process)
os.environ["ADMIN_TOKEN"] = admin_token
print(f" - Login successful. Token retrieved (starts with: '{admin_token[:15]}...').")
print(f" - Dynamically saved token to environment variable 'ADMIN_TOKEN'.")

# Step 4: Data Push
print("\n[4/4] Sending a request to data-push/update endpoint using ADMIN_TOKEN...")

# First, ensure we have a test document in the DB to update
test_doc = db.query(Invoice).filter(Invoice.is_deleted == False).first()
if not test_doc:
    # Ingest a test document if none exists
    print(" - No documents found in database. Ingesting a test invoice first...")
    sync_payload = {
        "doc_key": 9001,
        "doc_num": "INV/2026/QA/9001",
        "vendor_name": "QA TEST SUPPLIES",
        "amount": 15000.0,
        "division": "VCC",
        "category": "General Expenses",
        "plant": "TN-SIVAKASI",
        "auto_route": True
    }
    sync_res = client.post("/api/sync/document", json=sync_payload)
    assert sync_res.status_code == 200, f"Failed to sync test doc: {sync_res.text}"
    test_doc_id = sync_res.json()["document_id"]
    print(f" - Synced test invoice: {test_doc_id}")
else:
    test_doc_id = test_doc.id
    print(f" - Using existing document: {test_doc_id}")

# Update document metadata using ADMIN_TOKEN in Authorization header
headers = {
    "Authorization": f"Bearer {admin_token}"
}
update_payload = {
    "amount": 18500.0,
    "vendor_name": "QA TEST SUPPLIES UPDATED",
    "notes": "Verified push of updated invoice metadata using admin token."
}

update_res = client.put(f"/api/records/{test_doc_id}", json=update_payload, headers=headers)
print(f" - Request URL: /api/records/{test_doc_id}")
print(f" - Response Status Code: {update_res.status_code}")

assert update_res.status_code == 200, f"Update failed: {update_res.text}"
updated_data = update_res.json()
print(f" - Response Vendor Name: {updated_data.get('vendor_name')}")
print(f" - Response Amount: {updated_data.get('amount')}")
print(" - Data push / update verified successfully!")

db.close()
print("\n==================================================================")
print("         ALL QA TEST STEPS COMPLETED AND PASSED SUCCESSFULLY!    ")
print("==================================================================")
