import os
from fastapi import HTTPException
from app.database.connection import SessionLocal
from app.database.models import Invoice, InvoiceChecklistState, User
from app.schemas.schemas import DocumentSyncRequest
from app.routers.sync import _upsert_single_document
from app.routers.documents import (
    check_approval_authorization,
    update_invoice,
    get_all_invoices,
)
from app.schemas.schemas import InvoiceUpdate
from app.services.escalation_service import can_stage_escalate, is_physical_attachment_present

def run_verification():
    db = SessionLocal()
    print("=================================================================")
    print("DocuFlow Pipeline Verification: Sync, Routing, Checklist, RBAC")
    print("=================================================================")

    test_doc_key = "TEST-MASS-SYNC-99001"
    
    # 1. Clean up any previous test record
    prev = db.query(Invoice).filter(Invoice.doc_key == test_doc_key).first()
    if prev:
        db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == prev.id).delete()
        db.delete(prev)
        db.commit()

    # 2. Simulate mass sync / incoming third-party JSON payload
    sync_payload = DocumentSyncRequest(
        DocKey=test_doc_key,
        DocNum="SAP-99001",
        DocRefNo="INV-SAP-99001",
        CardName="TECHNO SUPPLIES LTD",
        DocTotal=11800.0,
        base_amount=10000.0,
        tax_amount=1800.0,
        CompanyCode="VCC",
        TransType="AP INVOICE",
        Category="Technical Services",
        CostCenter="ENG-01",
        Branch="TN-SIVAKASI",
        line_items=[
            {"item_description": "Annual Maintenance Contract", "quantity": 1, "amount": 10000.0}
        ]
    )

    print(f"\n[Step 1] Ingesting third-party JSON payload for doc_key: {test_doc_key}")
    inv = _upsert_single_document(sync_payload, db)
    db.commit()
    db.refresh(inv)

    print(f" -> Document ID: {inv.id}")
    print(f" -> Amount: Gross INR {inv.amount}, Base INR {inv.base_amount}")
    print(f" -> Matched Workflow Profile: {inv.workflow_profile_id}")
    print(f" -> Assigned Approver: {inv.assigned_approver}")
    print(f" -> Total Stages: {inv.total_stages}")
    print(f" -> Current Stage: {inv.current_stage}")
    print(f" -> Status: {inv.status}")

    assert inv.workflow_profile_id == "VCC-test", f"Expected VCC-test, got {inv.workflow_profile_id}"
    assert inv.assigned_approver == "YUVASREE", f"Expected YUVASREE, got {inv.assigned_approver}"
    print(" [PASS] Rule Engine correctly mapped third-party JSON to 'VCC-test' and Stage 1 approver 'YUVASREE'.")

    # 3. Verify Checklist Mapping
    checklist_rows = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id).all()
    chk_items = [c.item_text for c in checklist_rows]
    print(f"\n[Step 2] Checklist auto-resolved for Stage 1: {chk_items}")
    assert len(chk_items) > 0, "Checklist items should not be empty!"
    assert "Attachement" in chk_items or "Attachment" in chk_items, f"Attachment check required in {chk_items}"
    print(" [PASS] Checklist items correctly resolved and stored in SQL.")

    # 4. Verify Escalation Guard when Document File is NOT uploaded
    print("\n[Step 3] Checking escalation eligibility when physical PDF is missing...")
    can_esc, esc_reason = can_stage_escalate(inv, db)
    print(f" -> can_escalate: {can_esc}")
    print(f" -> reason: {esc_reason}")
    assert can_esc is False, "Escalation should be blocked when document is not uploaded!"
    assert "Escalation Suppressed" in esc_reason or "not yet been uploaded" in esc_reason
    print(" [PASS] Escalation is correctly suppressed/blocked because physical file is not uploaded.")

    # 5. Verify Approval Blocking when Document File is NOT uploaded
    print("\n[Step 4] Attempting approval without physical PDF attachment...")
    approver_user = db.query(User).filter(User.username == "YUVASREE").first()
    if not approver_user:
        approver_user = User(username="YUVASREE", employee_name="YUVASREE", role="ap_specialist", is_active=True, division="VCC")
        db.add(approver_user)
        db.commit()

    try:
        check_approval_authorization(inv, approver_user, db=db, require_compliance=True)
        print(" [FAIL] Should have raised HTTPException for missing attachment!")
        assert False, "Should fail without attachment"
    except HTTPException as e:
        print(f" -> Caught expected 400 error: {e.detail}")
        assert "Physical PDF Attachment Compulsory" in str(e.detail)
        print(" [PASS] Approval strictly blocked when physical PDF attachment is missing.")

    # 6. Verify Read-Only Protection of Synced ERP Data during Attachment Status
    print("\n[Step 5] Attempting to edit synced ERP amount during Attachment Status...")
    try:
        update_invoice(str(inv.id), InvoiceUpdate(amount=250000.0), db=db, user=approver_user)
        print(" [FAIL] Should have raised HTTPException for editing synced data!")
        assert False, "Should fail editing synced data"
    except HTTPException as e:
        print(f" -> Caught expected error: {e.detail}")
        assert "Data Sync Protection" in str(e.detail)
        print(" [PASS] Synced ERP fields are locked and protected from editing during Attachment Status.")

    # 7. Simulate Physical PDF Attachment
    print("\n[Step 6] Simulating physical PDF attachment upload...")
    from app.config.settings import settings
    dummy_pdf_name = f"{inv.id}_test.pdf"
    dummy_pdf_path = settings.UPLOAD_DIR / dummy_pdf_name
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(dummy_pdf_path, "wb") as f:
        f.write(b"%PDF-1.4 test document content for DocuFlow verification")

    inv.file_url = f"/uploads/{dummy_pdf_name}"
    inv.file_path = str(dummy_pdf_path)
    db.commit()
    db.refresh(inv)

    assert is_physical_attachment_present(inv) is True
    print(f" -> File attached: {inv.file_url} (exists on disk: True)")

    # 8. Verify Approval Blocking when Checklist is incomplete
    print("\n[Step 7] Attempting approval with PDF attached but checklist unchecked...")
    try:
        check_approval_authorization(inv, approver_user, db=db, require_compliance=True)
        print(" [FAIL] Should have raised HTTPException for unchecked checklist!")
        assert False, "Should fail without checklist verified"
    except HTTPException as e:
        print(f" -> Caught expected error: {e.detail}")
        assert "Compliance Checklist Incomplete" in str(e.detail)
        print(" [PASS] Approval strictly blocked when checklist items are incomplete.")

    # 9. Verify that with PDF attached, Escalation is now allowed
    print("\n[Step 8] Checking escalation eligibility after PDF is attached...")
    can_esc_now, esc_reason_now = can_stage_escalate(inv, db)
    print(f" -> can_escalate: {can_esc_now}")
    assert can_esc_now is True, "Escalation should be enabled once PDF is attached!"
    print(" [PASS] Escalation becomes permitted once physical PDF is present.")

    # 10. Check off all checklist items and verify approval succeeds
    print("\n[Step 9] Ticking all checklist items and performing Stage 1 Approval...")
    for item in checklist_rows:
        item.is_checked = True
    db.commit()

    check_approval_authorization(inv, approver_user, db=db, require_compliance=True)
    print(" [PASS] check_approval_authorization succeeded with PDF attached and checklist completed!")

    # Advance to Stage 2
    inv.current_stage = 2
    inv.status = "In Progress (Stage 2)"
    # Stage 2 approver for VCC-test is YUVASREE, Stage 3 is VIGNESH, Stage 4 is VARUNAN
    inv.assigned_approver = "YUVASREE"
    db.commit()

    # 11. Strict Document Access Verification
    print("\n[Step 10] Testing strict stage-by-stage visibility...")
    # Test user VIGNESH (assigned only to Stage 3)
    vignesh_user = db.query(User).filter(User.username == "VIGNESH").first()
    if not vignesh_user:
        vignesh_user = User(username="VIGNESH", employee_name="VIGNESH", role="manager", is_active=True, division="VCC")
        db.add(vignesh_user)
        db.commit()

    # Document is at Stage 2 (assigned to YUVASREE). VIGNESH (Stage 3) MUST NOT see it!
    vignesh_docs = get_all_invoices(status=None, db=db, current_user=vignesh_user)
    vignesh_doc_ids = [d.id for d in vignesh_docs]
    assert inv.id not in vignesh_doc_ids, f"VIGNESH (Stage 3) should NOT see document at Stage 2! Found in {vignesh_doc_ids}"
    print(f" -> VIGNESH (Stage 3 approver) cannot see document while it is at Stage 2: CONFIRMED.")

    # YUVASREE (current assigned approver for Stage 2) CAN see it
    yuvasree_docs = get_all_invoices(status=None, db=db, current_user=approver_user)
    yuvasree_doc_ids = [d.id for d in yuvasree_docs]
    assert inv.id in yuvasree_doc_ids, f"YUVASREE should see document at Stage 2!"
    print(f" -> YUVASREE (Stage 2 approver) can see document: CONFIRMED.")

    # Now simulate YUVASREE approving Stage 2 -> Document advances to Stage 3 (VIGNESH)
    inv.current_stage = 3
    inv.assigned_approver = "VIGNESH"
    inv.status = "In Progress (Stage 3)"
    db.commit()

    # NOW VIGNESH should see it!
    vignesh_docs_after = get_all_invoices(status=None, db=db, current_user=vignesh_user)
    vignesh_doc_ids_after = [d.id for d in vignesh_docs_after]
    assert inv.id in vignesh_doc_ids_after, f"VIGNESH should now see document at Stage 3!"
    print(f" -> Once approved to Stage 3, VIGNESH can now view and act on it: CONFIRMED.")

    # Cleanup test file
    if os.path.exists(dummy_pdf_path):
        os.remove(dummy_pdf_path)

    # Clean up test doc
    db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id).delete()
    db.delete(inv)
    db.commit()
    db.close()

    print("\n=================================================================")
    print("ALL 10 VERIFICATION STEPS PASSED SUCCESSFULLY!")
    print("=================================================================")

if __name__ == "__main__":
    run_verification()
