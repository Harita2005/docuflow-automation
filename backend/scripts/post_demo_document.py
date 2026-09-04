import sys
import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.routers.sync import _upsert_single_document, DocumentSyncRequest
from app.models import Invoice, DocumentChecklistState

print("=" * 80)
print(">>> POSTING NEW DEMO DOCUMENT (DIVISION: VCC | COST CENTER: BATTERY VEHICLE)")
print("=" * 80)

db = SessionLocal()

try:
    req = DocumentSyncRequest(
        company_code="VCC",
        division="VCC",
        invoice_number="INV-VCC-BV-2026-001",
        doc_key="DOC-VCC-BV-001",
        document_type="AP INVOICE",
        category="VEHICLE & FLEET MAINTENANCE",
        cost_center="BATTERY VEHICLE",
        plant="TN-ERODE-PERUNDURAI ROAD",
        amount=45000.0,
        tax_amount=8100.0,
        base_amount=36900.0,
        vendor_code="VEND-EV-501",
        vendor_name="Eco Drive EV Fleet Services",
        pay_mode="BANK"
    )

    inv = _upsert_single_document(req, db)
    db.commit()

    checklists = db.query(DocumentChecklistState).filter(DocumentChecklistState.invoice_id == str(inv.id)).all()

    print("\n[SUCCESS] Document Posted & Synchronized:")
    print(f"  -> Document ID:        {inv.id}")
    print(f"  -> Doc Key:            {inv.doc_key}")
    print(f"  -> Invoice Number:     {inv.invoice_number}")
    print(f"  -> Division:           {inv.division}")
    print(f"  -> Cost Center:        {inv.cost_center}")
    print(f"  -> Amount:             Rs. {inv.amount:,.2f}")
    print(f"  -> Vendor Name:        {inv.vendor_name}")
    print(f"  -> Matched Workflow:   {inv.workflow_profile_id or 'No Rule Matched (Unrouted)'}")
    print(f"  -> Assigned Approver:  {inv.assigned_approver or 'None'}")
    print(f"  -> Initial Status:     {inv.status}")
    print(f"  -> Generated Checklists:{len(checklists)} items")
    print("=" * 80)

except Exception as e:
    db.rollback()
    print(f"[ERROR] Failed to post document: {e}")
    sys.exit(1)
finally:
    db.close()
