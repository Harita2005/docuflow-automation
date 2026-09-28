import sys
import os
import json
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))

from app.database.connection import SessionLocal
from app.database.models import Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog

db = SessionLocal()

# Create 2 fresh unapproved documents in "Initiated (Stage 1)" status
timestamp_id = int(time.time())

doc1_id = f"INV-SYNC-2026-001"
doc2_id = f"CMP-SYNC-2026-002"

# Remove existing if any
db.query(Invoice).filter(Invoice.id.in_([doc1_id, doc2_id])).delete()
db.commit()

inv1 = Invoice(
    id=doc1_id,
    doc_key=f"DOC-KEY-{timestamp_id}-1",
    invoice_number=doc1_id,
    doc_num=doc1_id,
    vendor_name="Sri V Electricals",
    amount=59000.00,
    base_amount=50000.00,
    tax_amount=9000.00,
    currency="INR",
    document_type="AP INVOICE",
    division="ENES",
    category="AP INVOICE",
    workflow_profile_id="AP_invoice_1",
    status="Initiated (Stage 1)",
    current_stage=1,
    total_stages=3,
    assigned_approver="Meshak",
    is_deleted=False
)

inv2 = Invoice(
    id=doc2_id,
    doc_key=f"DOC-KEY-{timestamp_id}-2",
    invoice_number=doc2_id,
    doc_num=doc2_id,
    vendor_name="Apex Global Electronics",
    account_name="Apex Global Electronics",
    amount=24500.00,
    base_amount=24500.00,
    tax_amount=0.00,
    currency="INR",
    document_type="CUSTOMER FEEDBACK",
    division="VCC",
    category="CUSTOMER FEEDBACK",
    type_of_complaint="Product Quality Issue",
    subtype_of_complaint="PCB Connector Loose",
    additional_comments="Fresh complaint logged from distributor inspection. Requires Stage 1 investigation.",
    employee_name="Ramesh V",
    employee_id="EMP-4012",
    workflow_profile_id="Customer_feedback",
    status="Initiated (Stage 1)",
    current_stage=1,
    total_stages=2,
    assigned_approver="Quality Inspector",
    is_deleted=False
)

db.add(inv1)
db.add(inv2)
db.commit()

db.add(AuditLog(
    invoice_id=inv1.id,
    user="ERP Sync Engine",
    action="DATA_SYNCED",
    stage="Intake (ERP)",
    notes="Fresh document synced into workflow system. Status: Initiated (Stage 1)."
))

db.add(AuditLog(
    invoice_id=inv2.id,
    user="Customer Portal Sync",
    action="FEEDBACK_SYNCED",
    stage="Intake",
    notes="Fresh customer complaint record synced. Status: Initiated (Stage 1)."
))

db.commit()

print(f"[CREATED] Document 1: {inv1.id} | Type: {inv1.document_type} | Status: {inv1.status} | Stage: {inv1.current_stage}/{inv1.total_stages}")
print(f"[CREATED] Document 2: {inv2.id} | Type: {inv2.document_type} | Status: {inv2.status} | Stage: {inv2.current_stage}/{inv2.total_stages}")

db.close()
