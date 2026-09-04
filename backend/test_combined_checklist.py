import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document, WorkflowStepDefinition
from app.routers.documents import resolve_checklist_items

db = SessionLocal()

print("==========================================================")
print("  TESTING COMBINED CHECKLIST RESOLUTION:")
print("==========================================================")

# Create/update a temporary test step definition with custom FlowBuilder item
step_def = db.query(WorkflowStepDefinition).filter(
    WorkflowStepDefinition.profile_name == "VCC_PURCHASE",
    WorkflowStepDefinition.step_name == "Attachment Status"
).first()

if step_def:
    step_def.checklist_json = '["Custom FlowBuilder Verification Item"]'
    db.commit()

vcc_doc = Document(id="TEST-VCC-COMBINED", division="VCC", category="Freight Charges", cost_center="ALL", plant="ALL", workflow_profile_id="VCC_PURCHASE")

items = resolve_checklist_items(db, vcc_doc, "Attachment Status")

print(f"\nTotal Merged Items Count: {len(items)}")
for idx, i in enumerate(items, start=1):
    print(f"  {idx}. {i}")

# Cleanup test custom item
if step_def:
    step_def.checklist_json = None
    db.commit()

db.close()
