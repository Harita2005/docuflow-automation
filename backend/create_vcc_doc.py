import sys
import os
import json
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document, DocumentLineItem, DocumentApprovalLog, SystemEngineLog

db = SessionLocal()

doc_id = "DOC-VCC-CANTEEN-001"

# Clean prior instance if exists
db.query(DocumentLineItem).filter(DocumentLineItem.invoice_id == doc_id).delete()
db.query(DocumentApprovalLog).filter(DocumentApprovalLog.invoice_id == doc_id).delete()
db.query(SystemEngineLog).filter(SystemEngineLog.invoice_id == doc_id).delete()
db.query(Document).filter(Document.id == doc_id).delete()
db.commit()

doc = Document(
    id=doc_id,
    doc_key="ERP-VCC-CANT-9901",
    doc_num="VCC-CANT-001",
    doc_date="2026-09-03",
    party_name="SODEXO INDIA SERVICES PVT LTD",
    party_code="V-SODEXO-001",
    party_tax_id="33AAACS9876G1Z2",
    vendor_name="SODEXO INDIA SERVICES PVT LTD",
    vendor_code="V-SODEXO-001",
    vendor_gstin="33AAACS9876G1Z2",
    invoice_number="INV-VCC-CANTEEN-001",
    invoice_date="2026-09-03",
    po_number="PO-VCC-CANT-2026",
    amount=42500.00,
    base_amount=36016.95,
    tax_amount=6483.05,
    cgst=3241.53,
    sgst=3241.52,
    currency="INR",
    document_type="AP INVOICE",
    division="VCC",
    category="Local GST18% Purchase",
    cost_center="CANTEEN MAINTENANCE",
    plant="HO-CHENNAI",
    payment_terms="Net 30",
    pay_mode="BANK",
    status="Pending Approval",
    current_stage=1,
    total_stages=2,
    assigned_approver="Nattudurai,VIGNESH",
    is_deleted=False,
    created_at=datetime.datetime.utcnow()
)

db.add(doc)

# Add sample line items
line1 = DocumentLineItem(
    invoice_id=doc_id,
    description="Monthly Canteen Catering & Maintenance Services",
    quantity=1.0,
    unit_price=36016.95,
    amount=36016.95,
    item_code="SRV-CANT-01"
)
db.add(line1)

# Add audit log entry
audit = DocumentApprovalLog(
    invoice_id=doc_id,
    user="System Ingestion",
    action="DOCUMENT_CREATED",
    stage="Stage 1 - Initial Submission",
    notes="Document ingested with Division: VCC, Cost Center: CANTEEN MAINTENANCE"
)
db.add(audit)

db.commit()

print("==========================================================")
print("  VCC DOCUMENT CREATED SUCCESSFULLY")
print("==========================================================")
print(f"Document ID: {doc.id}")
print(f"Invoice Number: {doc.invoice_number}")
print(f"Division: {doc.division}")
print(f"Cost Center: {doc.cost_center}")
print(f"Vendor Name: {doc.vendor_name}")
print(f"Total Amount: INR {doc.amount:,.2f}")
print(f"Status: {doc.status}")
print("==========================================================")

db.close()
