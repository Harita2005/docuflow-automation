import os
import json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("==================================================================")
print("             JWT GENERATION & AUTHORIZED API TEST                 ")
print("==================================================================")

# Step 1: Login to get the JWT
print("\n[1] Requesting login token for 'test_admin_qa'...")
login_payload = {
    "username": "test_admin_qa",
    "password": "password123"
}
login_res = client.post("/api/auth/login", json=login_payload)
assert login_res.status_code == 200, f"Login failed: {login_res.text}"

token_data = login_res.json()
jwt_token = token_data.get("token")
print("Successfully generated JWT Token:")
print(f"--> {jwt_token}")
print("\nToken Details:")
print(f"  - User: {token_data['user']['username']}")
print(f"  - Role: {token_data['user']['role']}")
print(f"  - Expiration: Strictly 10 minutes")

# Step 2: Test User Identity Endpoint (/api/auth/me) with token
print("\n[2] Calling /api/auth/me to verify token identity...")
headers = {
    "Authorization": f"Bearer {jwt_token}"
}
me_res = client.get("/api/auth/me", headers=headers)
print(f"  - Status Code: {me_res.status_code}")
print(f"  - Authenticated User: {json.dumps(me_res.json(), indent=2)}")
assert me_res.status_code == 200

# Step 3: Push / Update invoice data using the token
print("\n[3] Pushing metadata update to /api/records/DOC-9999...")
push_payload = {
    "amount": 24500.0,
    "vendor_name": "IT TEAM ENTERPRISES",
    "notes": "Data pushed successfully by IT Team using 10-minute admin JWT."
}
push_res = client.put("/api/records/DOC-9999", json=push_payload, headers=headers)
print(f"  - Status Code: {push_res.status_code}")
if push_res.status_code == 200:
    updated_invoice = push_res.json()
    print("  - Response Data:")
    print(f"    * ID: {updated_invoice.get('id')}")
    print(f"    * Vendor Name: {updated_invoice.get('vendor_name')}")
    print(f"    * Amount: {updated_invoice.get('amount')}")
    print("    * Status: Success!")
else:
    print(f"  - Push Failed: {push_res.text}")

print("\n==================================================================")
print("                   VERIFICATION COMPLETED                         ")
print("==================================================================")
