import sys
import os
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests
SYNC_API_URL = "http://localhost:3000/api/sync/record"
SERVICE_API_KEY = "DocuFlow-M2M-Integration-Secret-2026"

timestamp_id = int(time.time())

fresh_docs_payload = [
    {
        "doc_key": f"FRESH-AP-{timestamp_id}-1",
        "doc_num": f"INV-2026-{timestamp_id % 10000}-A",
        "invoice_number": f"INV-2026-{timestamp_id % 10000}-A",
        "vendor_name": "Apex Industrial Supplies Ltd",
        "vendor_code": "VEND-APEX-001",
        "amount": 88500.00,
        "base_amount": 75000.00,
        "tax_amount": 13500.00,
        "currency": "INR",
        "document_type": "AP INVOICE",
        "division": "VCC",
        "category": "AP INVOICE",
        "plant": "Chennai Plant 1",
        "cost_center": "CC-PROD-01",
        "payment_terms": "Net 30 Days",
        "auto_route": True
    },
    {
        "doc_key": f"FRESH-CF-{timestamp_id}-2",
        "doc_num": f"CMP-2026-{timestamp_id % 10000}-B",
        "invoice_number": f"CMP-2026-{timestamp_id % 10000}-B",
        "vendor_name": "Metro Retailers Corp",
        "account_name": "Metro Retailers Corp",
        "amount": 15000.00,
        "base_amount": 15000.00,
        "tax_amount": 0.00,
        "currency": "INR",
        "document_type": "CUSTOMER FEEDBACK",
        "division": "VCC",
        "category": "CUSTOMER FEEDBACK",
        "type_of_complaint": "Product Packaging Damage",
        "subtype_of_complaint": "Sealing Defect",
        "additional_comments": "Outer container seal was torn during transit shipment. Requires QA review.",
        "employee_name": "Ramesh V",
        "employee_id": "EMP-4012",
        "employee_division": "VCC",
        "dealer_name": "Metro Distributors Ltd",
        "bp_code": "BP-METRO-88",
        "customer_code": "CUST-8821",
        "auto_route": True
    }
]

synced = False
try:
    for p in fresh_docs_payload:
        res = requests.post(
            SYNC_API_URL,
            json=p,
            headers={"X-API-Key": SERVICE_API_KEY, "Content-Type": "application/json"},
            timeout=3
        )
        if res.status_code == 200:
            data = res.json()
            print(f"[SYNCED HTTP] Doc ID: {data.get('document_id')} | Status: {data.get('status')} | Profile: {data.get('workflow_profile_id')}")
            synced = True
except Exception as e:
    print(f"HTTP Server not available on port 3000: {e}")

if not synced:
    print("Connecting directly to Database ORM...")
    from app.database.connection import SessionLocal
    db = SessionLocal()

    from app.schemas.schemas import DocumentSyncRequest
    from app.routers.sync import _upsert_single_document

    for p in fresh_docs_payload:
        req = DocumentSyncRequest.model_validate(p)
        doc = _upsert_single_document(req, db)
        print(f"[SYNCED DB] Doc ID: {doc.id} | Status: {doc.status} | Stage: {doc.current_stage}/{doc.total_stages} | Workflow: {doc.workflow_profile_id} | Approver: {doc.assigned_approver}")

    db.close()
