import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document
from app.services.rules_engine import evaluate_business_rules

db = SessionLocal()

doc2 = db.query(Document).filter(Document.id == "DOC-VCC-002").first()
if doc2:
    res = evaluate_business_rules(db, doc2)
    if isinstance(res, tuple):
        matched_rule = res[0]
        target_wf = res[1] if len(res) > 1 else None
    else:
        matched_rule = res
        target_wf = getattr(matched_rule, "target_workflow_id", None)

    print(f"[Policy Rules Engine Evaluation for DOC-VCC-002]")
    print(f" -> Matched Rule: {matched_rule}")
    print(f" -> Target Workflow: {target_wf}")

    if target_wf:
        doc2.workflow_profile_id = target_wf
        db.commit()
        print(f"[Updated] Set DOC-VCC-002 workflow_profile_id = '{doc2.workflow_profile_id}'")

db.close()
