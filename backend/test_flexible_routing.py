import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document
from app.services.rules_engine import evaluate_business_rules

db = SessionLocal()

print("==========================================================")
print("  TESTING FLEXIBLE AUTO-ROUTING EVALUATION:")
print("==========================================================")

# Document 1: Cost Center with Space ("IT HARDWARE")
doc_space = Document(division="VCC", cost_center="IT HARDWARE", category="Interstate GST18% Purchase")
matched_wf_space = evaluate_business_rules(db, doc_space)
print(f"Document with 'IT HARDWARE' (Space) -> Matched Workflow: {matched_wf_space}")

# Document 2: Cost Center with Hyphen ("IT-HARDWARE")
doc_hyphen = Document(division="VCC", cost_center="IT-HARDWARE", category="Interstate GST18% Purchase")
matched_wf_hyphen = evaluate_business_rules(db, doc_hyphen)
print(f"Document with 'IT-HARDWARE' (Hyphen) -> Matched Workflow: {matched_wf_hyphen}")

db.close()
