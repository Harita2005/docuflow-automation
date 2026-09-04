import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import BusinessRule, Document

db = SessionLocal()

rule = db.query(BusinessRule).filter(BusinessRule.rule_name == "VCC_Sample").first()
if rule:
    rule.target_workflow_id = "VCC_Sample"
    db.commit()
    print("[Success] Updated BusinessRule 'VCC_Sample' target_workflow_id = 'VCC_Sample'")

doc2 = db.query(Document).filter(Document.id == "DOC-VCC-002").first()
if doc2:
    doc2.workflow_profile_id = "VCC_Sample"
    db.commit()
    print(f"[Success] Updated DOC-VCC-002 workflow_profile_id = '{doc2.workflow_profile_id}'")

db.close()
