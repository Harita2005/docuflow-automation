import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import Document

db = SessionLocal()

docs = db.query(Document).all()
print("==========================================================")
print("  CURRENT DATABASE STATUS OF DOCUMENTS:")
print("==========================================================")
for d in docs:
    print(f" -> ID: {d.id} | Status: '{d.status}' | Stage: {d.current_stage} | Approver: '{d.assigned_approver}'")

db.close()
