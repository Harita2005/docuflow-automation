import sys
import os
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document, DocumentChecklistState, DocumentApprovalLog, BusinessRule

db = SessionLocal()

print("==========================================================")
print("  FIXING CONDITION RULE & RE-POSTING DOCUMENT:")
print("==========================================================")

# 1. Delete existing document record
doc = db.query(Document).filter(Document.invoice_number == "INV-VCC-2026-001").first()
if doc:
    doc_id = doc.id
    db.query(DocumentChecklistState).filter(DocumentChecklistState.invoice_id == doc_id).delete()
    db.query(DocumentApprovalLog).filter(DocumentApprovalLog.invoice_id == doc_id).delete()
    db.query(Document).filter(Document.id == doc_id).delete()
    db.commit()
    print(f"[Cleanup] Deleted existing document {doc_id} ('INV-VCC-2026-001').")

# 2. Update Condition Rule VCC_FLOW to accept both 'IT HARDWARE' and 'IT-HARDWARE'
rule = db.query(BusinessRule).filter(BusinessRule.rule_name == "VCC_FLOW").first()
if rule:
    try:
        conds = json.loads(rule.conditions_json)
        for c in conds.get("conditions", []):
            if c.get("field") == "Cost Center":
                c["value"] = "IT HARDWARE, IT-HARDWARE"
                c["operator"] = "contains any of"
        rule.conditions_json = json.dumps(conds)
        db.commit()
        print(f"[Rule Updated] Updated VCC_FLOW Cost Center condition value to 'IT HARDWARE, IT-HARDWARE'.")
    except Exception as e:
        print(f"[Rule Update Notice] {e}")

db.close()

# 3. Re-post new test document
url = "http://127.0.0.1:3000/api/sync/document"
payload = {
    "invoice_number": "INV-VCC-2026-002",
    "vendor_name": "SIEMENS AUTOMATION INDIA LTD",
    "vendor_code": "V-SIEMENS-001",
    "vendor_gstin": "33AAACS1234F1Z5",
    "amount": 85000.0,
    "division": "VCC",
    "cost_center": "IT HARDWARE",
    "category": "Interstate GST18% Purchase",
    "po_number": "PO-VCC-ITHW-2026",
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
        print("\n[SUCCESS] Re-posted document result:")
        print(json.dumps(res_data, indent=2))
except Exception as e:
    print(f"[ERROR] Re-post failed: {e}")
