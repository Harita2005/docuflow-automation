import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import (
    Document, DocumentLineItem, DocumentChecklistState,
    DocumentApprovalLog, SystemEngineLog, IntegrationSyncLog, InAppNotification,
    WorkflowProfile, WorkflowStepDefinition, BusinessRule
)

db = SessionLocal()

print("==========================================================")
print("  PURGING ALL DOCUMENTS, WORKFLOW FLOWS & CONDITION RULES:")
print("==========================================================")

try:
    # 1. Purge all Documents & related activity logs
    cnt_line = db.query(DocumentLineItem).delete()
    cnt_chk = db.query(DocumentChecklistState).delete()
    cnt_app = db.query(DocumentApprovalLog).delete()
    cnt_sys = db.query(SystemEngineLog).delete()
    cnt_sync = db.query(IntegrationSyncLog).delete()
    cnt_notif = db.query(InAppNotification).delete()
    cnt_doc = db.query(Document).delete()
    print(f"[Purge Documents] Deleted {cnt_doc} documents, {cnt_chk} checklist states, {cnt_app} approval logs, {cnt_notif} notifications.")

    # 2. Purge Business Condition Rules
    cnt_rule = db.query(BusinessRule).delete()
    print(f"[Purge Conditions] Deleted {cnt_rule} business condition rules.")

    # 3. Purge Workflows & Steps
    cnt_step = db.query(WorkflowStepDefinition).delete()
    cnt_flow = db.query(WorkflowProfile).delete()
    print(f"[Purge Workflows] Deleted {cnt_flow} workflow profiles and {cnt_step} step definitions.")

    db.commit()
    print("\n[COMPLETE SUCCESS] System is 100% clean and ready for new workflows, condition rules, and documents!")

except Exception as e:
    db.rollback()
    print(f"[Error during purge] {e}")

db.close()
