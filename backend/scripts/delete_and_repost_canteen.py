import sys
import os
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document, DocumentChecklistState, DocumentApprovalLog

db = SessionLocal()

print("==========================================================")
print("  DELETING OLD CANTEEN DOC & POSTING NEW RECORD:")
print("==========================================================")

# 1. Delete document INV-43998 (INV-VCC-CANTEEN-001)
doc = db.query(Document).filter((Document.id == "INV-43998") | (Document.invoice_number == "INV-VCC-CANTEEN-001")).first()
if doc:
    doc_id = doc.id
    db.query(DocumentChecklistState).filter(DocumentChecklistState.invoice_id == doc_id).delete()
    db.query(DocumentApprovalLog).filter(DocumentApprovalLog.invoice_id == doc_id).delete()
    db.query(Document).filter(Document.id == doc_id).delete()
    db.commit()
    print(f"[Cleanup] Deleted old record {doc_id} ('INV-VCC-CANTEEN-001').")

db.close()

# 2. Post new document INV-VCC-CANTEEN-002
url = "http://127.0.0.1:3000/api/sync/document"
payload = {
    "invoice_number": "INV-VCC-CANTEEN-002",
    "vendor_name": "SODEXO INDIA SERVICES PVT LTD",
    "vendor_code": "V-SODEXO-001",
    "vendor_gstin": "33AAACS9876G1Z2",
    "amount": 55000.0,
    "division": "VCC",
    "cost_center": "CANTEEN MAINTENANCE",
    "category": "Local GST18% Purchase",
    "po_number": "PO-VCC-CANT-2026-02",
    "invoice_date": "2026-09-03",
    "payment_terms": "Net 30",
    "pay_mode": "BANK"
}

req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"}
)

try:
    with urllib.request.urlopen(req) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        print("\n[SUCCESS] New document record posted successfully:")
        print(json.dumps(res_data, indent=2))
except Exception as e:
    print(f"[ERROR] Post failed: {e}")
