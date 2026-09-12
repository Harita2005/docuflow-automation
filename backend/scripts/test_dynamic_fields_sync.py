import json
from app.database.connection import SessionLocal
from app.database.models import Invoice, InvoiceChecklistState
from app.schemas.schemas import DocumentSyncRequest
from app.routers.sync import _upsert_single_document
from app.services.rules_engine import match_condition

def test_dynamic_fields():
    db = SessionLocal()
    print("=================================================================")
    print("Testing Dynamic Third-Party Field Sync & Evaluation")
    print("=================================================================")

    test_doc_key = "DYNAMIC-FIELD-TEST-001"

    # Clean up previous test
    prev = db.query(Invoice).filter(Invoice.doc_key == test_doc_key).first()
    if prev:
        db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == prev.id).delete()
        db.delete(prev)
        db.commit()

    # Dynamic third-party payload with arbitrary custom fields
    payload_dict = {
        "DocKey": test_doc_key,
        "DocNum": "DYN-1001",
        "DocRefNo": "INV-DYN-1001",
        "CardName": "DYNAMIC AUTOMATION SUPPLIERS",
        "DocTotal": 11800.0,
        "base_amount": 10000.0,
        "CompanyCode": "VCC",
        "TransType": "AP INVOICE",
        # Arbitrary dynamic fields sent by third-party
        "VehicleNo": "TN-01-AB-1234",
        "GatePassNumber": "GP-9988",
        "DriverName": "Ramesh Kumar",
        "ProjectName": "Solar Plant Phase 1",
        "CustomTaxCode": "EXEMPT-2026",
        "CustomRemarks": "Urgent site delivery"
    }

    print("\n[1] Parsing third-party payload through DocumentSyncRequest...")
    req = DocumentSyncRequest(**payload_dict)
    
    assert req.custom_data is not None, "custom_data should be populated with dynamic fields!"
    print(" -> Captured custom_data:", req.custom_data)
    assert req.custom_data.get("VehicleNo") == "TN-01-AB-1234"
    assert req.custom_data.get("GatePassNumber") == "GP-9988"
    assert req.custom_data.get("ProjectName") == "Solar Plant Phase 1"
    print(" [PASS] DocumentSyncRequest automatically captured unmapped fields into custom_data.")

    print("\n[2] Ingesting into database via _upsert_single_document...")
    inv = _upsert_single_document(req, db)
    db.commit()
    db.refresh(inv)

    assert inv.custom_data is not None, "Invoice custom_data should not be null!"
    stored_custom = json.loads(inv.custom_data)
    print(" -> Persisted custom_data in SQL:", stored_custom)
    assert stored_custom.get("VehicleNo") == "TN-01-AB-1234"
    assert stored_custom.get("DriverName") == "Ramesh Kumar"
    assert stored_custom.get("CustomRemarks") == "Urgent site delivery"
    print(" [PASS] All dynamic fields persisted into DocuFlowDB.")

    print("\n[3] Evaluating rules on dynamic fields...")
    # Exact field condition
    rule_cond_1 = {"field": "VehicleNo", "operator": "equals", "value": "TN-01-AB-1234"}
    match_1 = match_condition(rule_cond_1, inv)
    print(f" -> Condition: VehicleNo equals 'TN-01-AB-1234' -> Matched: {match_1}")
    assert match_1 is True

    # Case-insensitive / normalized field condition (e.g. gate_pass_number vs GatePassNumber)
    rule_cond_2 = {"field": "gate_pass_number", "operator": "equals", "value": "GP-9988"}
    match_2 = match_condition(rule_cond_2, inv)
    print(f" -> Condition: gate_pass_number equals 'GP-9988' -> Matched: {match_2}")
    assert match_2 is True

    # Substring / contains condition
    rule_cond_3 = {"field": "ProjectName", "operator": "contains", "value": "Solar Plant"}
    match_3 = match_condition(rule_cond_3, inv)
    print(f" -> Condition: ProjectName contains 'Solar Plant' -> Matched: {match_3}")
    assert match_3 is True

    print(" [PASS] Rules Engine successfully evaluated dynamic third-party fields.")

    # Clean up test
    db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id).delete()
    db.delete(inv)
    db.commit()
    db.close()

    print("\n=================================================================")
    print("DYNAMIC FIELD SYNC & EVALUATION: ALL TESTS PASSED!")
    print("=================================================================")

if __name__ == "__main__":
    test_dynamic_fields()
