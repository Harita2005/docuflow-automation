import io
import json
import base64
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

print("==================================================================")
print("     TESTING ERP SYNC ERRORS AND PRIMARY KEY ATTACHMENTS          ")
print("==================================================================")

# 1. Test Sync Failure Catching
print("\n[1/3] Testing Sync Failure Capture...")
# Trigger a ValueError inside sync_single_document by sending an invalid float value.
payload = {
    "doc_key": 9999,
    "invoice_number": "INV-FAIL-TEST-100",
    "amount": 10000.0,
    "division": "VCC",
    "line_items": [
        {"quantity": "NOT_A_NUMBER", "unit_price": 500}
    ],
    "auto_route": True
}

res = client.post("/api/sync/record", json=payload)
print(f"Status Code: {res.status_code}")
if res.status_code != 200:
    print(f"Error Details: {res.text}")
data = res.json()
print(f"Success Flag: {data.get('success')}")
print(f"Response Message: {data.get('message')}")
print(f"Saved Document ID: {data.get('document_id')}")
print(f"Saved Status: {data.get('status')}")

# Verify database saved record status is indeed "Sync Failed"
doc_id = data.get("document_id")
if doc_id:
    # 2. Test Attachment Synchronization via Primary Key (Binary upload)
    print(f"\n[2/3] Testing Attachment Upload via Primary Key (Binary): {doc_id}...")
    pdf_stream = io.BytesIO(b"%PDF-1.4 Binary invoice attachment linked via primary key")
    files = {"file": ("invoice_proof.pdf", pdf_stream, "application/pdf")}
    data_form = {
        "attachment_type": "Supporting Ledger Docs",
        "uploaded_by": "Tally Connector"
    }
    att_res = client.post(f"/api/sync/record/{doc_id}/attachment", files=files, data=data_form)
    print(f"Status Code: {att_res.status_code}")
    att_data = att_res.json()
    print(f"Success: {att_data.get('success')}")
    print(f"File URL: {att_data.get('file_url')}")
    print(f"OCR Extracted: {att_data.get('ocr_extracted_fields')}")

    # 3. Test Attachment Synchronization via Primary Key (Base64)
    print(f"\n[3/3] Testing Attachment Upload via Primary Key (Base64): {doc_id}...")
    base64_str = base64.b64encode(b"%PDF-1.4 Base64 decoded test file").decode("utf-8")
    b64_payload = {
        "file_name": "sap_ledger.pdf",
        "file_content_base64": base64_str,
        "attachment_type": "SAP Ledger Reference",
        "uploaded_by": "SAP PI/PO"
    }
    b64_res = client.post(f"/api/sync/record/{doc_id}/attachment/base64", json=b64_payload)
    print(f"Status Code: {b64_res.status_code}")
    b64_data = b64_res.json()
    print(f"Success: {b64_data.get('success')}")
    print(f"Linked File URL: {b64_data.get('file_url')}")

print("\n==================================================================")
print("                   TEST EXECUTION COMPLETE                        ")
print("==================================================================")
