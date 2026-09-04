import sys
import os
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document, DocumentLineItem, DocumentApprovalLog, SystemEngineLog, WorkflowStepDefinition
from app.services.rules_engine import evaluate_business_rules_full

db = SessionLocal()

doc_id = "DOC-VCC-ITHW-002"

# Clean prior instance if exists
db.query(DocumentLineItem).filter(DocumentLineItem.invoice_id == doc_id).delete()
db.query(DocumentApprovalLog).filter(DocumentApprovalLog.invoice_id == doc_id).delete()
db.query(SystemEngineLog).filter(SystemEngineLog.invoice_id == doc_id).delete()
db.query(Document).filter(Document.id == doc_id).delete()
db.commit()

# Create new document with lowercase/case-insensitive values: "vcc" and "it-hardware"
doc = Document(
    id=doc_id,
    doc_key="ERP-VCC-ITHW-1002",
    doc_num="VCC-ITHW-002",
    doc_date="2026-09-03",
    party_name="DELL INDIA PRIVATE LIMITED",
    party_code="V-DELL-002",
    party_tax_id="29AAACD2026E1Z5",
    vendor_name="DELL INDIA PRIVATE LIMITED",
    vendor_code="V-DELL-002",
    vendor_gstin="29AAACD2026E1Z5",
    invoice_number="INV-VCC-ITHW-002",
    invoice_date="2026-09-03",
    po_number="PO-VCC-ITHW-2026",
    amount=85000.00,
    base_amount=72033.90,
    tax_amount=12966.10,
    cgst=6483.05,
    sgst=6483.05,
    currency="INR",
    document_type="AP INVOICE",
    division="vcc",              # Case-insensitive test: lowercase vcc
    category="IT Hardware Purchase",
    cost_center="it-hardware",   # Case-insensitive test: lowercase it-hardware
    plant="HO-CHENNAI",
    payment_terms="Net 30",
    pay_mode="BANK",
    status="Pending Approval",
    current_stage=1,
    is_deleted=False,
    created_at=datetime.datetime.utcnow()
)

# Evaluate rule mapping
rule_eval = evaluate_business_rules_full(db, doc)
if rule_eval and rule_eval.get("target_workflow_id"):
    wf_name = rule_eval["target_workflow_id"]
    doc.workflow_profile_id = wf_name
    steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).order_by(WorkflowStepDefinition.stage_number.asc()).all()
    doc.total_stages = len(steps) if steps else 3
    if steps:
        doc.assigned_approver = steps[0].approver_target

db.add(doc)

line1 = DocumentLineItem(
    invoice_id=doc_id,
    description="Dell OptiPlex 7090 Desktop & Peripherals",
    quantity=1.0,
    unit_price=72033.90,
    amount=72033.90,
    item_code="HW-DELL-01"
)
db.add(line1)

audit = DocumentApprovalLog(
    invoice_id=doc_id,
    user="System Ingestion",
    action="DOCUMENT_CREATED",
    stage="Stage 1 - Attachment Status",
    notes=f"Ingested document Division: vcc, Cost Center: it-hardware. Matched Rule: {rule_eval.get('rule_name') if rule_eval else 'None'}"
)
db.add(audit)

db.commit()

print("==========================================================")
print("  NEW VCC IT-HARDWARE RECORD INGESTED SUCCESSFULLY")
print("==========================================================")
print(f"Document ID: {doc.id}")
print(f"Invoice Number: {doc.invoice_number}")
print(f"Division: {doc.division} (Input: 'vcc')")
print(f"Cost Center: {doc.cost_center} (Input: 'it-hardware')")
print(f"Matched Rule: {rule_eval.get('rule_name') if rule_eval else 'None'}")
print(f"Mapped Workflow: {doc.workflow_profile_id}")
print(f"Total Stages: {doc.total_stages}")
print(f"Stage 1 Assigned Approver: {doc.assigned_approver}")
print("==========================================================")

db.close()
