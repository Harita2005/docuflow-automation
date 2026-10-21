"""
DocuFlow API Document Synchronization Utility
---------------------------------------------
Authenticates against DocuFlow API (/api/auth/login) with admin credentials,
receives a 60-minute JWT Bearer token, and syncs 2 sample documents to /api/sync/record.
"""

import sys
import argparse
import requests

def main():
    parser = argparse.ArgumentParser(description="DocuFlow API Document Synchronization Script")
    parser.add_argument("--host", default="http://192.168.179.22:3000", help="Base API URL (default: http://192.168.179.22:3000)")
    parser.add_argument("--username", default="backend_sync_client", help="Service or Admin username (default: backend_sync_client)")
    parser.add_argument("--password", default="SecretPassword987654321!", help="Service or Admin password")
    parser.add_argument("--timeout", type=int, default=15, help="Request timeout in seconds")
    args = parser.parse_args()

    base_url = args.host.rstrip("/")
    m2m_url = f"{base_url}/m2m/auth/login"
    login_url = f"{base_url}/api/auth/login"
    sync_url = f"{base_url}/api/sync/record"

    print("=" * 70)
    print(">>> DOCUFLOW SAMPLE DOCUMENTS SYNC UTILITY (Option 1: Direct M2M Token)")
    print("=" * 70)
    print(f"Target API Host: {base_url}")
    print(f"M2M Auth URL:    {m2m_url}")
    print(f"Sync Endpoint:   {sync_url}")
    print(f"Username:        {args.username}")
    print("=" * 70)

    # Step 1: Authenticate and obtain Bearer Token (Option 1: Direct Service Token)
    print("\n[*] Step 1: Authenticating via Option 1 (/m2m/auth/login) to obtain Bearer token...")
    token = None
    try:
        # First attempt Option 1 M2M Direct Token endpoint
        m2m_payload = {
            "username": args.username,
            "password": args.password,
        }
        resp = requests.post(m2m_url, json=m2m_payload, timeout=args.timeout)
        if resp.status_code == 200:
            auth_data = resp.json()
            token = auth_data.get("access_token") or auth_data.get("token")
    except requests.exceptions.RequestException:
        pass

    # If M2M endpoint not used or fallback needed, try standard login endpoint
    if not token:
        login_payload = {
            "username": args.username,
            "password": args.password,
            "expires_in_minutes": 60,
            "force_login": True,
        }
        try:
            login_resp = requests.post(login_url, json=login_payload, timeout=args.timeout)
            if login_resp.status_code == 200:
                auth_data = login_resp.json()
                token = auth_data.get("access_token") or auth_data.get("token")
        except requests.exceptions.RequestException as e:
            print(f"\n[!] Network / Connection Error connecting to {login_url}: {e}")
            sys.exit(1)

    if not token:
        print("[!] No access token returned in login response.")
        sys.exit(1)

    print("[+] Authentication successful! Direct access token acquired (no MFA challenge).")
    print(f"    Token snippet: {token[:25]}...{token[-10:]}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # Sample Documents Definition
    sample_documents = [
        {
            "doc_key": "SAP-INV-88001",
            "doc_num": "SAP-INV-88001",
            "invoice_number": "ACME/2026/089",
            "invoice_date": "2026-09-12",
            "vendor_name": "ACME Industrial Supplies Ltd",
            "vendor_code": "VND-4021",
            "vendor_gstin": "33AABCA1234F1Z5",
            "po_number": "PO-2026-9041",
            "amount": 59000.00,
            "base_amount": 50000.00,
            "tax_amount": 9000.00,
            "currency": "INR",
            "document_type": "AP INVOICE",
            "division": "VCC",
            "plant": "PLANT-01",
            "category": "Raw Materials",
            "payment_terms": "Net 30",
            "auto_route": True,
            "line_items": [
                {
                    "item_code": "ITM-001",
                    "description": "Industrial Cotton Yarn Spools - Grade A",
                    "quantity": 100,
                    "unit_price": 500.00,
                    "amount": 50000.00
                }
            ]
        },
        {
            "doc_key": "SAP-SRV-88002",
            "doc_num": "SAP-SRV-88002",
            "invoice_number": "TECH-SERV-4412",
            "invoice_date": "2026-09-12",
            "vendor_name": "Apex Machinery Solutions Pvt Ltd",
            "vendor_code": "VND-7712",
            "vendor_gstin": "33AABCA5678G2Z1",
            "po_number": "PO-2026-9042",
            "amount": 118000.00,
            "base_amount": 100000.00,
            "tax_amount": 18000.00,
            "currency": "INR",
            "document_type": "SERVICE & MAINTENANCE",
            "division": "VCC",
            "plant": "PLANT-02",
            "category": "Plant Maintenance",
            "payment_terms": "Net 15",
            "auto_route": True,
            "line_items": [
                {
                    "item_code": "SRV-002",
                    "description": "Quarterly Loom Machinery Maintenance & Calibration",
                    "quantity": 1,
                    "unit_price": 100000.00,
                    "amount": 100000.00
                }
            ]
        }
    ]

    print("\n[*] Step 2: Syncing 2 sample documents to /api/sync/record...")
    for idx, doc in enumerate(sample_documents, start=1):
        print(f"\n--- [Document {idx}/2] Ingesting {doc['doc_key']} ---")
        print(f"    Vendor:  {doc['vendor_name']}")
        print(f"    Invoice: {doc['invoice_number']}")
        print(f"    Amount:  {doc['currency']} {doc['amount']:,.2f}")
        try:
            sync_resp = requests.post(sync_url, json=doc, headers=headers, timeout=args.timeout)
            print(f"    HTTP Status: {sync_resp.status_code}")
            if sync_resp.status_code == 200:
                res_json = sync_resp.json()
                print("    [+] Sync Successful!")
                print(f"        Generated Doc ID: {res_json.get('document_id')}")
                print(f"        Doc Key:          {res_json.get('doc_key')}")
                print(f"        Assigned Status:  {res_json.get('status')}")
                print(f"        Assigned Approver:{res_json.get('assigned_approver')}")
                print(f"        Workflow Profile: {res_json.get('workflow_profile')}")
            else:
                print(f"    [!] Sync Failed ({sync_resp.status_code}): {sync_resp.text}")
        except Exception as e:
            print(f"    [!] Exception while posting document: {e}")

    print("\n" + "=" * 70)
    print(">>> SYNC EXECUTION COMPLETED")
    print("=" * 70)

if __name__ == "__main__":
    main()
