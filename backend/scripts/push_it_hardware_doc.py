import sys
import os
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

url = "http://127.0.0.1:3000/api/sync/document"
payload = {
    "invoice_number": "INV-VCC-2026-001",
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
        print("[SUCCESS] Ingested document successfully:")
        print(json.dumps(res_data, indent=2))
except Exception as e:
    print(f"[ERROR] Ingestion failed: {e}")
