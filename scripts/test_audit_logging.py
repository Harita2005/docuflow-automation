import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def test_audit_logs():
    print("==================================================================")
    print(">>> TESTING COMPREHENSIVE AUDIT TRAIL LOGGING")
    print("==================================================================")

    # 1. User Login
    print("\n[1] Testing User Login Audit Logging...")
    r_login = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "anbu", "password": "defaultpassword123"})
    print("Login Status:", r_login.status_code)
    token = r_login.json().get("token")
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    # 2. Document Field Edit & Metadata Changes
    print("\n[2] Testing Document Metadata Changes Audit Logging...")
    r_edit = requests.put(
        f"{BASE_URL}/api/invoices/DOC-9901",
        json={"amount": 265000.0, "notes": "Adjusted freight & handling surcharge based on revised PO"},
        headers=headers
    )
    print("Edit Status:", r_edit.status_code)

    # 3. User Logout
    print("\n[3] Testing User Logout Audit Logging...")
    r_logout = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers)
    print("Logout Status:", r_logout.status_code)

    # 4. Fetch and display Audit Log entries
    print("\n[4] Querying Audit Trail from MS SQL Server DocuFlowDB...")
    r_logs = requests.get(f"{BASE_URL}/api/audit-logs")
    logs = r_logs.json()
    print(f"Total Audit Entries Found: {len(logs)}\n")
    for log in logs[:10]:
        print(f"[{log['timestamp']}] User: {log['user']} | Action: {log['action']} | Stage: {log.get('stage')}")
        print(f"   Details: {log['notes']}\n")

if __name__ == "__main__":
    test_audit_logs()
