import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

def test_full_stage1_attachment_to_final_settlement():
    print("==================================================================")
    print(">>> TESTING FULL 4-STAGE LIFECYCLE: SYNC -> ATTACH -> APPROVE -> SETTLE")
    print("==================================================================")

    # 1. Sync Live ERP Data without attachment (Stage 1: ATTACHMENT STATUS)
    print("\n[Step 1] Syncing ERP Document without attachment...")
    sync_payload = {
        "doc_key": 9901,
        "doc_num": 59901,
        "vendor_name": "SOUTHERN TEXTILES & LOGISTICS",
        "vendor_code": "V-STL-001",
        "vendor_gstin": "33AAACS9901G1Z8",
        "invoice_number": "INV-ACC-2026-9901",
        "invoice_date": "2026-08-11",
        "po_number": "PO-ACC-44901",
        "amount": 250000.0,
        "division": "ACC",
        "plant": "TN-CBE-SULUR",
        "category": "ASSET WITH COST CENTER",
        "cost_center": "BATTERY VEHICLE"
    }
    res1 = requests.post(f"{BASE_URL}/api/sync/document", json=sync_payload)
    print("Sync Status Code:", res1.status_code)
    data1 = res1.json()
    print("Sync Response:", data1)
    doc_id = data1.get("document_id")
    assert res1.status_code == 200, "Failed to sync document"
    assert data1["current_stage"] == 1, f"Expected Stage 1, got {data1['current_stage']}"
    assert "ATTACHMENT" in data1["status"].upper(), f"Expected Attachment status, got {data1['status']}"
    print(f"[PASS] Document {doc_id} created in Stage 1 ({data1['status']}) assigned to {data1['assigned_approver']}")

    # 2. Assigned Member Attaches Physical Invoice PDF
    print(f"\n[Step 2] Assigned Member uploads and attaches physical PDF for {doc_id}...")
    sample_pdf_bytes = b"%PDF-1.4 Mock Scanned Invoice for Testing Battery Vehicle Purchase"
    files = {"file": ("Invoice_ACC_9901.pdf", sample_pdf_bytes, "application/pdf")}
    data = {"doc_key": 9901, "uploaded_by": "NATHIYA_16220"}
    res2 = requests.post(f"{BASE_URL}/api/sync/attachment/upload", files=files, data=data)
    print("Attachment Upload Status Code:", res2.status_code)
    data2 = res2.json()
    print("Attachment Response:", data2)
    assert res2.status_code == 200, "Failed to upload attachment"
    assert data2["file_url"] is not None, "File URL was not generated"
    print(f"[PASS] File stored locally at: {data2['file_url']}")

    # 3. Verify Document Inspector has the file and full 4-stage pipeline
    print(f"\n[Step 3] Fetching Document Details for {doc_id} to verify pipeline...")
    res3 = requests.get(f"{BASE_URL}/api/documents/{doc_id}")
    data3 = res3.json()
    print("Document Inspector Response:", {
        "id": data3["id"],
        "workflow": data3.get("workflow_profile_id"),
        "file_url": data3.get("file_url"),
        "current_stage": data3.get("current_stage"),
        "total_stages": data3.get("total_stages"),
        "assigned_approver": data3.get("assigned_approver"),
        "stages": [s["stage_name"] for s in data3.get("workflow_step_definitions", [])]
    })
    assert data3.get("file_url") is not None, "File URL not linked in document"
    print(f"[PASS] Document has {len(data3.get('workflow_step_definitions', []))} stages configured!")

    # 4. Advance through Approval Stages:
    # Stage 1: Upload & Verify Attachment (Nathiya, Revathi)
    print("\n[Step 4] Approving Stage 1 (Attachment Verification)...")
    res_app1 = requests.post(f"{BASE_URL}/api/invoices/{doc_id}/approve", json={
        "decision": "APPROVE",
        "remarks": "Attachment uploaded and verified against physical invoice copy."
    })
    print("Approval 1 Status:", res_app1.json().get("status"))

    # Stage 2: First Approval (Kannadhasan)
    print("\n[Step 5] Approving Stage 2 (First Approval)...")
    res_app2 = requests.post(f"{BASE_URL}/api/invoices/{doc_id}/approve", json={
        "decision": "APPROVE",
        "remarks": "First Approval signed off."
    })
    print("Approval 2 Status:", res_app2.json().get("status"))

    # Stage 3: IA Approval (Abinaya, Dinesh)
    print("\n[Step 6] Approving Stage 3 (Internal Audit Approval)...")
    res_app3 = requests.post(f"{BASE_URL}/api/invoices/{doc_id}/approve", json={
        "decision": "APPROVE",
        "remarks": "Internal Audit compliance checklist passed."
    })
    print("Approval 3 Status:", res_app3.json().get("status"))

    # Stage 4: Final Approval (Mohan, Rajavel)
    print("\n[Step 7] Approving Stage 4 (Final Approval & Settlement)...")
    res_app4 = requests.post(f"{BASE_URL}/api/invoices/{doc_id}/approve", json={
        "decision": "APPROVE",
        "remarks": "Executive Sign-Off. Ready for payment disbursement."
    })
    print("Approval 4 Status:", res_app4.json().get("status"))

    # 5. Verify Final Settled Document & Local Archival
    res_final = requests.get(f"{BASE_URL}/api/documents/{doc_id}")
    data_final = res_final.json()
    print("\n[Final Status Verification]:")
    print(f"  Status: {data_final['status']}")
    print(f"  Stage: {data_final['current_stage']} of {data_final['total_stages']}")
    print(f"  Archived File: {data_final['file_url']}")
    assert data_final['status'] == "Settled", f"Expected Settled, got {data_final['status']}"
    assert data_final['file_url'] is not None, "Archived file URL missing"

    print("\n==================================================================")
    print(">>> 100% COMPLETE: FULL ATTACHMENT & APPROVAL LIFECYCLE VERIFIED!")
    print("==================================================================")

if __name__ == "__main__":
    test_full_stage1_attachment_to_final_settlement()
