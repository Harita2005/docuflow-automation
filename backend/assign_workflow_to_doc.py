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
print("  EXPLAINING & ASSIGNING WORKFLOW TO DOC-VCC-001")
print("==========================================================")

# 1. Ensure Workflow Profile Exists
wf_name = "VCC - Vendor Payment Workflow"
wf_profile = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_name).first()

if not wf_profile:
    wf_profile = WorkflowProfile(
        profile_name=wf_name,
        workflow_code="WF-001",
        workflow_category="Vendor Payment Workflows",
        workflow_type="General Records",
        status="Active"
    )
    db.add(wf_profile)

    step1 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="Attachment Status",
        approver_type="Specific Employee",
        approver_target="YUVASREE",
        permissions="Approve Only",
        action_required="Approve"
    )
    step2 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=2,
        step_name="First Approval",
        approver_type="Specific Employee",
        approver_target="Nattudurai",
        permissions="Approve Only",
        action_required="Approve"
    )
    db.add(step1)
    db.add(step2)
    db.commit()
    print("[Success] Created Workflow Profile 'VCC - Vendor Payment Workflow' (WF-001).")
else:
    print("[Info] Workflow Profile 'VCC - Vendor Payment Workflow' already exists.")

# 2. Ensure Condition Rule Exists
rule = db.query(BusinessRule).filter(BusinessRule.rule_name == wf_name).first()
if not rule:
    conditions = [
        {"field": "Division", "operator": "EQUALS", "value": "VCC"},
        {"field": "Cost Center", "operator": "EQUALS", "value": "Finance & Admin"},
        {"field": "Total Amount", "operator": "GREATER_THAN", "value": "0"}
    ]
    rule = BusinessRule(
        rule_name=wf_name,
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
    print("[Success] Created Condition Rule for Division=VCC & Cost Center=Finance & Admin.")

# 3. Ensure Checklist Rule Exists
chk = db.query(ChecklistRule).filter(ChecklistRule.rule_name == wf_name).first()
if not chk:
    chk = ChecklistRule(
        rule_name=wf_name,
        division="VCC",
        category="Vendor Payment Workflows",
        workflow_profile=wf_name,
        stage_name="Attachment Status",
        item_text="Verify PO & Line Items Match Invoice for VCC",
        is_mandatory=True,
        is_active=True,
        sequence_order=1
    )
    db.add(chk)
    db.commit()

# 4. Evaluate & Assign Workflow to DOC-VCC-001
doc = db.query(Document).filter(Document.id == "DOC-VCC-001").first()
if doc:
    eval_res = evaluate_business_rules(db, doc)
    doc.workflow_profile_id = wf_name
    doc.assigned_approver = "YUVASREE"
    doc.current_stage = 1
    doc.status = "Initiated (Attachment Status)"
    
    # Add stage 1 checklist state
    existing_state = db.query(DocumentChecklistState).filter(
        DocumentChecklistState.invoice_id == "DOC-VCC-001",
        DocumentChecklistState.stage_name == "Attachment Status"
    ).first()
    
    if not existing_state:
        st = DocumentChecklistState(
            invoice_id="DOC-VCC-001",
            stage_name="Attachment Status",
            item_text="Verify PO & Line Items Match Invoice for VCC",
            is_checked=False
        )
        db.add(st)

    db.commit()
    print(f"\n[Assignment Success] Assigned Workflow '{doc.workflow_profile_id}' to DOC-VCC-001!")
    print(f" -> Assigned Approver: {doc.assigned_approver}")
    print(f" -> Current Stage: Stage 1 ({doc.status})")

db.close()
print("\n[COMPLETE SUCCESS] Workflow assigned to DOC-VCC-001!")
