import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document
from app.services.rules_engine import evaluate_business_rules

db = SessionLocal()

print("==========================================================")
print("  TESTING ULTRA-FLEXIBLE TEXT MATCHING IN RULES ENGINE:")
print("==========================================================")

variations = [
    "IT HARDWARE",
    "IT-HARDWARE",
    "IT_HARDWARE",
    "ITHARDWARE",
    "it hardware",
    "IT/HARDWARE"
]

for v in variations:
    doc = Document(division="VCC", cost_center=v, category="Interstate GST18% Purchase")
    wf = evaluate_business_rules(db, doc)
    print(f"  Cost Center '{v}' -> Matched Workflow: {wf}")

db.close()
