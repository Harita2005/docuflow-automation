import sys
import os
import json
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

url = "http://127.0.0.1:3000/api/sync/document"
payload = {
    "invoice_number": "INV-VCC-CANTEEN-001",
    "vendor_name": "SODEXO INDIA SERVICES PVT LTD",
    "vendor_code": "V-SODEXO-001",
    "vendor_gstin": "33AAACS9876G1Z2",
    "amount": 42500.0,
    "division": "VCC",
    "cost_center": "CANTEEN MAINTENANCE",
    "category": "Local GST18% Purchase",
    "po_number": "PO-VCC-CANT-2026",
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
