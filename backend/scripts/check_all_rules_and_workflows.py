import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import WorkflowProfile, BusinessRule, Document

db = SessionLocal()

print("==========================================================")
print("  CURRENT WORKFLOW PROFILES IN DB:")
print("==========================================================")
wfs = db.query(WorkflowProfile).all()
for w in wfs:
    print(f" -> Workflow: '{w.profile_name}' (Code: {w.workflow_code})")

print("\n==========================================================")
print("  CURRENT CONDITION RULES IN DB:")
print("==========================================================")
rules = db.query(BusinessRule).all()
for r in rules:
    print(f" -> Rule Name: '{r.rule_name}' | Target Workflow: '{r.target_workflow_id}' | Conditions: {r.conditions_json}")

print("\n==========================================================")
print("  CURRENT DOCUMENTS IN DB:")
print("==========================================================")
docs = db.query(Document).all()
for d in docs:
    print(f" -> Doc ID: {d.id} | Division: {d.division} | Cost Center: {d.cost_center} | Workflow: {d.workflow_profile_id}")

db.close()
