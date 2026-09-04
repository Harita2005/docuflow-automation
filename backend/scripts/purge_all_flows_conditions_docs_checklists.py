import sys
import os
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal, engine
from app.config import settings
from app.models import (
    Document, DocumentLineItem, DocumentChecklistState, DocumentApprovalLog,
    SystemEngineLog, IntegrationSyncLog, InAppNotification,
    WorkflowProfile, WorkflowStepDefinition, BusinessRule,
    ChecklistRule, ChecklistTemplate, NotificationRaciMatrix,
    CallbackEvent, CallbackAttempt
)

db = SessionLocal()

print("=========================================================================")
print("  PURGING ALL WORKFLOW FLOWS, CONDITIONS, CHECKLISTS, DOCUMENTS & FILES")
print("=========================================================================")

try:
    # 1. Purge Callback Events & Attempts
    cnt_cb_att = db.query(CallbackAttempt).delete()
    cnt_cb_evt = db.query(CallbackEvent).delete()
    print(f"[Purge Callbacks] Deleted {cnt_cb_evt} callback events and {cnt_cb_att} callback attempts.")

    # 2. Purge Document Line Items, Checklist States, Logs, Notifications, Documents
    cnt_line = db.query(DocumentLineItem).delete()
    cnt_chk_state = db.query(DocumentChecklistState).delete()
    cnt_app_log = db.query(DocumentApprovalLog).delete()
    cnt_sys_log = db.query(SystemEngineLog).delete()
    cnt_sync_log = db.query(IntegrationSyncLog).delete()
    cnt_notif = db.query(InAppNotification).delete()
    cnt_doc = db.query(Document).delete()
    print(f"[Purge Documents] Deleted {cnt_doc} documents, {cnt_line} line items, {cnt_chk_state} checklist states, {cnt_app_log} approval logs, {cnt_notif} notifications.")

    # 3. Purge Conditions / Business Decision Rules
    cnt_rules = db.query(BusinessRule).delete()
    print(f"[Purge Conditions] Deleted {cnt_rules} business condition rules.")

    # 4. Purge Checklists (Rules & Templates)
    cnt_chk_rules = db.query(ChecklistRule).delete()
    cnt_chk_tmpl = db.query(ChecklistTemplate).delete()
    cnt_raci = db.query(NotificationRaciMatrix).delete()
    print(f"[Purge Checklists] Deleted {cnt_chk_rules} checklist rules, {cnt_chk_tmpl} checklist templates, {cnt_raci} RACI matrices.")

    # 5. Purge Workflows & Step Definitions
    cnt_steps = db.query(WorkflowStepDefinition).delete()
    cnt_flows = db.query(WorkflowProfile).delete()
    print(f"[Purge Workflows] Deleted {cnt_flows} workflow profiles and {cnt_steps} step definitions.")

    db.commit()
    print("\n[Database Clean] All workflow flows, condition rules, checklists, documents, and logs successfully deleted from database!")

except Exception as e:
    db.rollback()
    print(f"[Database Purge Error] {e}")

finally:
    db.close()

# 6. Clear Physical File Storage Directories
storage_dirs = [
    settings.UPLOAD_DIR,
    settings.PDF_STORAGE_DIR,
    settings.APPROVED_PDF_DIR
]

deleted_file_count = 0
for folder in storage_dirs:
    if os.path.exists(folder):
        for root, dirs, files in os.walk(folder):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    os.remove(file_path)
                    deleted_file_count += 1
                except Exception as e:
                    print(f"[File Removal Notice] Could not delete {file_path}: {e}")

print(f"[Storage Clean] Removed {deleted_file_count} physical document files from storage directories.")
print("\n=========================================================================")
print("  COMPLETE SUCCESS: System flows, conditions, checklists, and documents purged!")
print("=========================================================================")
