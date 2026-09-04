import sys
import os
import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document, DocumentChecklistState, DocumentApprovalLog, SystemEngineLog
from sqlalchemy import text

db = SessionLocal()

print("==========================================================")
print("  CLEAR ALL EXISTING DOCUMENTS & POST EXACTLY ONE DOC")
print("==========================================================")

# 1. Delete all existing documents and logs
db.execute(text("DELETE FROM document_checklist_states"))
db.execute(text("DELETE FROM document_approval_logs"))
db.execute(text("DELETE FROM system_engine_logs"))
try:
    db.execute(text("DELETE FROM invoices"))
except Exception as e:
    pass
db.execute(text("DELETE FROM documents"))
db.commit()

print("[Clear Success] Removed all existing documents and logs from database.")

# 2. Insert EXACTLY ONE clean test document
doc_id = "DOC-VCC-001"
one_doc = Document(
    id=doc_id,
    doc_key="DOC-VCC-001",
    doc_num="INV-VCC-2026-001",
    doc_date=datetime.date.today().strftime("%Y-%m-%d"),
    party_name="LAKSHMI MACHINE WORKS LTD",
    vendor_name="LAKSHMI MACHINE WORKS LTD",
    invoice_number="INV-VCC-2026-001",
    amount=50000.00,
    base_amount=45000.00,
    tax_amount=5000.00,
    currency="INR",
    document_type="AP INVOICE",
    division="VCC",
    cost_center="Finance & Admin",
    category="Vendor Payment Workflows",
    status="Pending Approval",
    current_stage=1,
    created_at=datetime.datetime.utcnow()
)

db.add(one_doc)
db.commit()

print(f"\n[Post Success] Created exactly ONE document:")
print(f" -> Document ID: {one_doc.id}")
print(f" -> Vendor Name: {one_doc.vendor_name}")
print(f" -> Invoice Number: {one_doc.invoice_number}")
print(f" -> Division: {one_doc.division}")
print(f" -> Cost Center: {one_doc.cost_center}")
print(f" -> Amount: Rs. {one_doc.amount:,.2f}")
print(f" -> Status: {one_doc.status}")

db.close()
print("\n[COMPLETE SUCCESS] Dashboard cleared and 1 single test document posted!")
