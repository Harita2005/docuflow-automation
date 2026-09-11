"""
DocuFlow Automation System - Clean Slate Utility
Clears documents, workflow profiles, business rules, conditions, checklists, and uploaded PDFs
while safely keeping users, credentials, roles, divisions, and core configuration intact.
"""

import os
import sys
from sqlalchemy import text
from app.database.connection import SessionLocal

def clean_database():
    print("Connecting to database...")
    db = SessionLocal()
    try:
        with db.begin():
            print("1. Clearing callback events & attempts...")
            db.execute(text("DELETE FROM callback_attempts WHERE callback_event_id IN (SELECT id FROM callback_events WHERE document_id IS NOT NULL)"))
            db.execute(text("DELETE FROM callback_events WHERE document_id IS NOT NULL"))

            print("2. Clearing integration logs, document locks & system logs...")
            db.execute(text("DELETE FROM integration_sync_logs"))
            db.execute(text("DELETE FROM document_locks"))
            db.execute(text("DELETE FROM system_engine_logs WHERE invoice_id IS NOT NULL"))

            print("3. Clearing document line items, checklist states, approval logs & in-app notifications...")
            db.execute(text("DELETE FROM document_line_items"))
            db.execute(text("DELETE FROM document_checklist_states"))
            db.execute(text("DELETE FROM document_approval_logs"))
            db.execute(text("DELETE FROM in_app_notifications"))

            print("4. Clearing all documents...")
            docs_deleted = db.execute(text("DELETE FROM documents")).rowcount

            print("5. Clearing workflow step definitions, profiles, business rules & checklists...")
            steps_deleted = db.execute(text("DELETE FROM workflow_step_definitions")).rowcount
            wf_deleted = db.execute(text("DELETE FROM workflow_profiles")).rowcount
            rules_deleted = db.execute(text("DELETE FROM business_rules")).rowcount
            db.execute(text("DELETE FROM checklist_rules"))
            db.execute(text("DELETE FROM checklist_templates"))
            db.execute(text("DELETE FROM notification_raci_matrices"))

        print("\n[SUCCESS] Database cleaned successfully!")
        print(f"   - Documents removed: {docs_deleted}")
        print(f"   - Workflow profiles removed: {wf_deleted}")
        print(f"   - Workflow steps removed: {steps_deleted}")
        print(f"   - Business rules & conditions removed: {rules_deleted}")
        print("   - Users, Roles, Divisions & Departments preserved!")
    except Exception as e:
        print(f"\n[ERROR] Error during database cleanup: {e}")
        sys.exit(1)
    finally:
        db.close()

def clean_file_storage():
    print("\nCleaning stored PDF files...")
    target_dirs = [
        os.path.abspath("../stored_pdfs"),
        os.path.abspath("../stored_pdfs/approved"),
        os.path.abspath("./uploads"),
    ]

    for directory in target_dirs:
        if not os.path.exists(directory):
            continue
        for item in os.listdir(directory):
            item_path = os.path.join(directory, item)
            if os.path.isfile(item_path) and not item.startswith("."):
                try:
                    os.remove(item_path)
                    print(f"   - Removed file: {item}")
                except Exception as err:
                    print(f"   - Could not remove {item}: {err}")

    print("[SUCCESS] Stored PDFs and uploads cleaned!")

if __name__ == "__main__":
    force = len(sys.argv) > 1 and sys.argv[1] in ["--force", "-y"]
    if not force:
        confirm = input("Are you sure you want to delete all workflows, conditions, and documents? (y/N): ").strip().lower()
        if confirm not in ["y", "yes"]:
            print("Operation cancelled.")
            sys.exit(0)

    clean_database()
    clean_file_storage()
    print("\n[DONE] System is fresh and ready for new document sync and workflow creation!")
