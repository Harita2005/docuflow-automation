import os
import json
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("==================================================================")
print("             M2M API & AUTHORIZED DATA SYNC TEST                  ")
print("==================================================================")

# Step 1: Login via M2M auth to get the Bearer JWT token
print("\n[1] Requesting M2M authentication token...")
m2m_payload = {
    "username": "backend_sync_client",
    "password": "SecretPassword987654321!"
}
login_res = client.post("/m2m/auth/login", json=m2m_payload)
assert login_res.status_code == 200, f"M2M Login failed: {login_res.text}"

token_data = login_res.json()
jwt_token = token_data.get("access_token")
print("Successfully generated M2M JWT Token:")
print(f"--> {jwt_token}")
print(f"  - Expiration: {token_data.get('expires_in')} seconds")

# Step 2: Test M2M Data Ingestion (/m2m/record) with token
print("\n[2] Ingesting test payload to /m2m/record...")
headers = {
    "Authorization": f"Bearer {jwt_token}",
    "Content-Type": "application/json"
}
payload = {
    "DOC-9999": {
        "amount": 24500.0,
        "vendor_name": "IT TEAM ENTERPRISES",
        "notes": "M2M data sync verification"
    }
}
ingest_res = client.post("/m2m/record", json=payload, headers=headers)
print(f"  - Status Code: {ingest_res.status_code}")
print(f"  - Response: {json.dumps(ingest_res.json(), indent=2)}")
assert ingest_res.status_code == 200

print("\n==================================================================")
print("                   VERIFICATION COMPLETED                         ")
print("==================================================================")
