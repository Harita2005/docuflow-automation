import sys
import json
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import WorkflowStepDefinition, ChecklistRule, ChecklistTemplate, Document, DocumentChecklistState
from sqlalchemy import text

db = SessionLocal()

wf_name = "VCC - Vendor Payment Workflow"
stage = "Attachment Status"

# The exact 5 checklist items specified by the user in Screenshot 2
five_items = [
    "Documents Attached",
    "Bill Name Verified",
    "Bill Date Verified",
    "Party Name & Total Amount Verified",
    "Vendor GST no, Signaure Verified"
]

print("==========================================================")
print("  UPDATING CHECKLIST ITEMS TO MATCH EXACT 5 USER ITEMS")
print("==========================================================")

# 1. Update WorkflowStepDefinition.checklist_json
step = db.query(WorkflowStepDefinition).filter(
    WorkflowStepDefinition.profile_name == wf_name,
    WorkflowStepDefinition.stage_number == 1
).first()

if step:
    step.checklist_json = json.dumps(five_items)
    print(f"[Success] Updated WorkflowStepDefinition.checklist_json with {len(five_items)} items.")

# 2. Update ChecklistRule table
db.query(ChecklistRule).filter(ChecklistRule.workflow_profile == wf_name).delete()
for idx, item in enumerate(five_items, 1):
    rule = ChecklistRule(
        rule_name=wf_name,
        division="VCC",
        category="Vendor Payment Workflows",
        workflow_profile=wf_name,
        stage_name=stage,
        item_text=item,
        is_mandatory=True,
        is_active=True,
        sequence_order=idx
    )
    db.add(rule)

print(f"[Success] Saved {len(five_items)} rules in ChecklistRule table.")

# 3. Update ChecklistTemplate table
db.query(ChecklistTemplate).filter(ChecklistTemplate.workflow_profile == wf_name).delete()
for idx, item in enumerate(five_items, 1):
    tmpl = ChecklistTemplate(
        workflow_profile=wf_name,
        stage_name=stage,
        item_text=item,
        is_mandatory=True,
        is_active=True,
        sequence_order=idx
    )
    db.add(tmpl)

print(f"[Success] Saved {len(five_items)} templates in ChecklistTemplate table.")

# 4. Reset & Sync DocumentChecklistState for DOC-VCC-001
db.query(DocumentChecklistState).filter(DocumentChecklistState.invoice_id == "DOC-VCC-001").delete()
for item in five_items:
    st = DocumentChecklistState(
        invoice_id="DOC-VCC-001",
        stage_name=stage,
        item_text=item,
        is_checked=False
    )
    db.add(st)

doc = db.query(Document).filter(Document.id == "DOC-VCC-001").first()
if doc:
    doc.checklist_state = json.dumps({item: False for item in five_items})

db.commit()
db.close()

print(f"\n[COMPLETE SUCCESS] Updated DOC-VCC-001 checklist to display EXACTLY {len(five_items)} items!")
