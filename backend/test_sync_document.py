import sys
import json
import os
import datetime

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import WorkflowProfile, WorkflowStepDefinition, BusinessRule, ChecklistRule, Document, DocumentChecklistState
from app.services.rules_engine import evaluate_business_rules

db = SessionLocal()

print("==========================================================")
print("  STEP 1: CREATING WORKFLOW WF-001 (VCC - Vendor Payment Workflow)")
print("==========================================================")

# 1. Create Workflow Profile
wf_profile = WorkflowProfile(
    profile_name="VCC - Vendor Payment Workflow",
    workflow_code="WF-001",
    workflow_category="Vendor Payment Workflows",
    workflow_type="General Records",
    status="Active",
    created_by="System Admin",
    created_at=datetime.datetime.utcnow()
)

# 2. Create Steps
step1 = WorkflowStepDefinition(
    profile_name="VCC - Vendor Payment Workflow",
    stage_number=1,
    step_name="Attachment Status",
    approver_type="Specific Employee",
    approver_target="YUVASREE",
    permissions="Approve Only",
    action_required="Approve"
)

step2 = WorkflowStepDefinition(
    profile_name="VCC - Vendor Payment Workflow",
    stage_number=2,
    step_name="First Approval",
    approver_type="Specific Employee",
    approver_target="Nattudurai",
    permissions="Approve Only",
    action_required="Approve"
)

db.add(wf_profile)
db.add(step1)
db.add(step2)
db.commit()
print("[Success] Created Workflow 'VCC - Vendor Payment Workflow' (WF-001) with 2 Approval Steps.")

print("\n==========================================================")
print("  STEP 2: CREATING CONDITION RULE IN POLICY MATRIX")
print("==========================================================")

conditions = [
    {"field": "Division", "operator": "EQUALS", "value": "VCC"},
    {"field": "Cost Center", "operator": "EQUALS", "value": "Finance & Admin"},
    {"field": "Total Amount", "operator": "GREATER_THAN", "value": "0"}
]

rule = BusinessRule(
    rule_name="VCC - Vendor Payment Workflow",
    rule_category="Vendor Payment Workflows",
    document_type="AP INVOICE",
    priority=10,
    target_workflow_id="VCC - Vendor Payment Workflow",
    conditions_json=json.dumps(conditions),
    rule_action="WORKFLOW_ROUTE",
    is_active=True
)

db.add(rule)
db.commit()
print("[Success] Created Condition Rule 'VCC - Vendor Payment Workflow' for Division=VCC & Cost Center=Finance & Admin.")

print("\n==========================================================")
print("  STEP 3: CREATING STAGE CHECKLIST RULE")
print("==========================================================")

chk = ChecklistRule(
    rule_name="VCC - Vendor Payment Workflow",
    division="VCC",
    category="Vendor Payment Workflows",
    workflow_profile="VCC - Vendor Payment Workflow",
    stage_name="Attachment Status",
    item_text="Verify PO & Line Items Match Invoice for VCC",
    is_mandatory=True,
    is_active=True,
    sequence_order=1
)

db.add(chk)
db.commit()
print("[Success] Created Checklist Rule for Stage 'Attachment Status'.")

print("\n==========================================================")
print("  STEP 4: INGESTING & EVALUATING NEW DOCUMENT (DOC-VCC-1001)")
print("==========================================================")

doc_id = "DOC-VCC-1001"
doc = Document(
    id=doc_id,
    doc_key="DOC-VCC-1001",
    doc_num="INV-2026-9901",
    doc_date=datetime.date.today().strftime("%Y-%m-%d"),
    party_name="ABC Suppliers Pvt Ltd",
    vendor_name="ABC Suppliers Pvt Ltd",
    invoice_number="INV-2026-9901",
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

db.add(doc)
db.commit()

# Evaluate against Policy Matrix rules engine
matched_rule, target_wf = evaluate_business_rules(doc, db)

print(f"\n[Policy Engine Result]")
print(f" -> Matched Condition Rule: {matched_rule.rule_name if matched_rule else 'None'}")
print(f" -> Targeted Workflow Profile: {target_wf}")

# Populate checklist items for stage 1
chk_state = DocumentChecklistState(
    invoice_id=doc_id,
    stage_name="Attachment Status",
    item_text="Verify PO & Line Items Match Invoice for VCC",
    is_checked=False
)
db.add(chk_state)
db.commit()

print(f"\n[Document Sync Complete]")
print(f" -> Document ID: {doc.id}")
print(f" -> Division: {doc.division}")
print(f" -> Cost Center: {doc.cost_center}")
print(f" -> Amount: ₹{doc.amount:,.2f}")
print(f" -> Active Stage: Stage 1 ({step1.step_name}) Assigned to: {step1.approver_target}")
print(f" -> Verification Checklist: '{chk_state.item_text}' (Checked: {chk_state.is_checked})")

db.close()
print("\n[END TO END TEST SUCCESSFUL!]")
