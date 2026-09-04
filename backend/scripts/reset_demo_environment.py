import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal, engine
from app.models import (
    BusinessRule, WorkflowProfile, WorkflowStepDefinition,
    ChecklistTemplate, ChecklistRule, DocumentChecklistState,
    Invoice, DocumentLineItem, DocumentApprovalLog
)

print("=" * 80)
print(">>> RESETTING DEMO ENVIRONMENT (CLEARING FLOWS, CONDITIONS, CHECKLISTS & DOCS)")
print("=" * 80)

db = SessionLocal()

try:
    # 1. Clear Document Lifecycle & Logs
    deleted_states = db.query(DocumentChecklistState).delete(synchronize_session=False)
    deleted_logs = db.query(DocumentApprovalLog).delete(synchronize_session=False)
    deleted_items = db.query(DocumentLineItem).delete(synchronize_session=False)
    deleted_docs = db.query(Invoice).delete(synchronize_session=False)
    print(f"  [1/4] Cleared Documents & Logs:")
    print(f"        -> {deleted_docs} documents deleted")
    print(f"        -> {deleted_items} line items deleted")
    print(f"        -> {deleted_logs} approval logs deleted")
    print(f"        -> {deleted_states} document checklist states deleted")

    # 2. Clear Business Rules (Conditions)
    deleted_rules = db.query(BusinessRule).delete(synchronize_session=False)
    print(f"  [2/4] Cleared Business Rules (Conditions):")
    print(f"        -> {deleted_rules} business rules deleted")

    # 3. Clear Workflow Profiles & Step Definitions
    deleted_steps = db.query(WorkflowStepDefinition).delete(synchronize_session=False)
    deleted_profiles = db.query(WorkflowProfile).delete(synchronize_session=False)
    print(f"  [3/4] Cleared Workflows & Step Definitions:")
    print(f"        -> {deleted_steps} step definitions deleted")
    print(f"        -> {deleted_profiles} workflow profiles deleted")

    # 4. Clear Checklist Templates & Rules
    deleted_ck_rules = db.query(ChecklistRule).delete(synchronize_session=False)
    deleted_ck_templates = db.query(ChecklistTemplate).delete(synchronize_session=False)
    print(f"  [4/4] Cleared Checklist Templates & Rules:")
    print(f"        -> {deleted_ck_rules} checklist rules deleted")
    print(f"        -> {deleted_ck_templates} checklist templates deleted")

    db.commit()
    print("\n" + "=" * 80)
    print(">>> DEMO ENVIRONMENT RESET COMPLETE! (Users catalog preserved)")
    print("=" * 80)

except Exception as e:
    db.rollback()
    print(f"\n[ERROR] Failed to reset demo environment: {e}")
    sys.exit(1)
finally:
    db.close()
