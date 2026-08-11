import base64
import requests

BASE_URL = "http://127.0.0.1:8000/api/sync"

def run_tests():
    print("==================================================")
    print(">>> RUNNING PRODUCTION DATA & ATTACHMENT SYNC TESTS")
    print("==================================================")

    # TEST 1: Single Document Sync (with SAP / MS SQL DocTrans Aliases)
    print("\n--- Test 1: Single ERP Document Sync (TN-SIVAKASI) ---")
    doc_payload = {
        "DocKey": 8801,
        "DocNum": 108801,
        "CompanyCode": "VCC",
        "Branch": "TN-SIVAKASI",
        "CardName": "SRI BALAJI ENTERPRISES",
        "CardCode": "VEND-8812",
        "GSTIN": "33AAACB1234D1Z8",
        "DocRefNo": "INV-SVK-2026-001",
        "DocDate": "2026-08-11",
        "DocTotal": 94500.0,
        "Category": "ASSET WITH COST CENTER",
        "CostCenter": "IT-HARDWARE",
        "TransType": "AP INVOICE",
        "AutoRoute": True
    }
    r1 = requests.post(f"{BASE_URL}/document", json=doc_payload)
    print("Status Code:", r1.status_code)
    res1 = r1.json()
    print("Response:", res1)
    assert r1.status_code == 200, "Test 1 Failed"
    assert res1["workflow_profile_id"] == "EVOUCHER_INV SR10", "Auto-routing failed to match SR10"
    assert "SIBITHA" in res1["assigned_approver"], "Approver not set to Sibitha/Vivek"
    print("[PASS] Test 1: Single document synced and auto-routed to EVOUCHER_INV SR10!")

    # TEST 2: Idempotent Upsert Check
    print("\n--- Test 2: Idempotent Update on Same DocKey ---")
    doc_payload["DocTotal"] = 105000.0
    r2 = requests.post(f"{BASE_URL}/document", json=doc_payload)
    res2 = r2.json()
    print("Status Code:", r2.status_code)
    print("Updated Amount:", res2["amount"])
    assert res2["amount"] == 105000.0, "Idempotent update failed"
    print("[PASS] Test 2: Existing document cleanly updated without creating duplicate!")

    # TEST 3: Bulk Batch Sync (Multiple Invoices across Branches)
    print("\n--- Test 3: Batch Bulk Sync (Sulur & ACC Asset) ---")
    batch_payload = {
        "sync_source": "SAP Daily Cron Job",
        "documents": [
            {
                "DocKey": 8802,
                "CompanyCode": "VCC",
                "Branch": "TN-CBE-SULUR",
                "CardName": "COIMBATORE TEXTILE TOOLS",
                "DocRefNo": "INV-SLR-901",
                "DocDate": "2026-08-11",
                "DocTotal": 35000.0,
                "TransType": "AP INVOICE"
            },
            {
                "DocKey": 8803,
                "CompanyCode": "ACC",
                "CostCenter": "BATTERY VEHICLE",
                "CardName": "GREEN ENERGY VEHICLES LTD",
                "DocRefNo": "INV-ACC-441",
                "DocDate": "2026-08-11",
                "DocTotal": 240000.0,
                "TransType": "AP INVOICE"
            }
        ]
    }
    r3 = requests.post(f"{BASE_URL}/batch", json=batch_payload)
    res3 = r3.json()
    print("Status Code:", r3.status_code)
    print("Batch Results:", res3)
    assert res3["successful_count"] == 2, "Batch sync failed"
    print("[PASS] Test 3: Batch bulk sync processed 2 records successfully!")

    # TEST 4: Base64 Attachment Sync
    print("\n--- Test 4: Base64 PDF Attachment Sync ---")
    dummy_pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
    b64_content = base64.b64encode(dummy_pdf_bytes).decode("utf-8")
    
    attach_payload = {
        "DocKey": 8801,
        "file_name": "Invoice_SVK_2026_001.pdf",
        "file_content_base64": b64_content,
        "attachment_type": "Original Invoice",
        "uploaded_by": "SAP PI/PO Middleware"
    }
    r4 = requests.post(f"{BASE_URL}/attachment/base64", json=attach_payload)
    res4 = r4.json()
    print("Status Code:", r4.status_code)
    print("Attachment Response:", res4)
    assert r4.status_code == 200, "Base64 Attachment Sync Failed"
    assert res4["file_url"].endswith(".pdf"), "File URL not generated properly"
    print("[PASS] Test 4: Base64 PDF decoded, saved, and linked to DocKey 8801!")

    print("\n==================================================")
    print(">>> ALL PRODUCTION SYNC TEST CASES PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
