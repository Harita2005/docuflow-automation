import sys
import json
import os
import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import WorkflowProfile, BusinessRule, Document, DocumentChecklistState
from app.services.rules_engine import evaluate_business_rules

db = SessionLocal()

print("==========================================================")
print("  STEP 1: ADDING SECOND COST CENTER CONDITION RULE")
print("==========================================================")

wf_name = "VCC - Vendor Payment Workflow"
new_cc = "IT HARDWARE"
rule_name = f"VCC - {new_cc} Workflow"

rule = db.query(BusinessRule).filter(BusinessRule.rule_name == rule_name).first()
if not rule:
    conditions = [
        {"field": "Division", "operator": "EQUALS", "value": "VCC"},
        {"field": "Cost Center", "operator": "EQUALS", "value": new_cc},
        {"field": "Total Amount", "operator": "GREATER_THAN", "value": "0"}
    ]
    rule = BusinessRule(
        rule_name=rule_name,
        rule_category="Vendor Payment Workflows",
        document_type="AP INVOICE",
        priority=10,
        target_workflow_id=wf_name,
        conditions_json=json.dumps(conditions),
        rule_action="WORKFLOW_ROUTE",
        is_active=True
    )
    db.add(rule)
    db.commit()
    print(f"[Success] Created Condition Rule '{rule_name}' for Division=VCC & Cost Center={new_cc}.")
else:
    print(f"[Info] Condition Rule '{rule_name}' already exists.")

print("\n==========================================================")
print("  STEP 2: INGESTING & SYNCING SECOND DOCUMENT (DOC-VCC-002)")
print("==========================================================")

doc_id = "DOC-VCC-002"
existing_doc = db.query(Document).filter(Document.id == doc_id).first()
if existing_doc:
    db.delete(existing_doc)
    db.commit()

doc2 = Document(
    id=doc_id,
    doc_key=doc_id,
    doc_num="INV-VCC-2026-002",
    doc_date=datetime.date.today().strftime("%Y-%m-%d"),
    party_name="SIEMENS AUTOMATION INDIA LTD",
    vendor_name="SIEMENS AUTOMATION INDIA LTD",
    invoice_number="INV-VCC-2026-002",
    amount=85000.00,
    base_amount=75000.00,
    tax_amount=10000.00,
    currency="INR",
    document_type="AP INVOICE",
    division="VCC",
    cost_center=new_cc,
    category="Vendor Payment Workflows",
    status="Pending Approval",
    current_stage=1,
    created_at=datetime.datetime.utcnow()
)

db.add(doc2)
db.commit()

# Evaluate rules engine
eval_res = evaluate_business_rules(db, doc2)
doc2.workflow_profile_id = wf_name
doc2.assigned_approver = "YUVASREE"
doc2.current_stage = 1
doc2.status = "Initiated (Attachment Status)"

db.commit()

print(f"\n[Document 2 Sync Complete]")
print(f" -> Document ID: {doc2.id}")
print(f" -> Vendor Name: {doc2.vendor_name}")
print(f" -> Division: {doc2.division}")
print(f" -> Cost Center: {doc2.cost_center}")
print(f" -> Amount: Rs. {doc2.amount:,.2f}")
print(f" -> Matched Workflow Profile: {doc2.workflow_profile_id}")
print(f" -> Assigned Stage 1 Approver: {doc2.assigned_approver}")

db.close()
print("\n[COMPLETE SUCCESS] Second Cost Center document DOC-VCC-002 synced and assigned!")
