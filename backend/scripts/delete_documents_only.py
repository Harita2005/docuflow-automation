import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import text
from app.database import SessionLocal
from app.models import DocumentChecklistState, DocumentApprovalLog, DocumentLineItem, Invoice

print("=" * 80)
print(">>> DELETING ALL DOCUMENTS & DOCUMENT LOGS ONLY")
print("=" * 80)

db = SessionLocal()

try:
    # 1. Clear ORM Models
    deleted_states = db.query(DocumentChecklistState).delete(synchronize_session=False)
    deleted_logs = db.query(DocumentApprovalLog).delete(synchronize_session=False)
    deleted_items = db.query(DocumentLineItem).delete(synchronize_session=False)
    deleted_docs = db.query(Invoice).delete(synchronize_session=False)

    # 2. Clear SQL Server Core Schema tables if present
    try:
        db.execute(text("IF OBJECT_ID('core.document_metadata', 'U') IS NOT NULL DELETE FROM core.document_metadata;"))
        db.execute(text("IF OBJECT_ID('core.document_versions', 'U') IS NOT NULL DELETE FROM core.document_versions;"))
        db.execute(text("IF OBJECT_ID('core.documents', 'U') IS NOT NULL DELETE FROM core.documents;"))
        db.execute(text("IF OBJECT_ID('integration.source_record_versions', 'U') IS NOT NULL DELETE FROM integration.source_record_versions;"))
        db.execute(text("IF OBJECT_ID('integration.source_records', 'U') IS NOT NULL DELETE FROM integration.source_records;"))
        db.execute(text("IF OBJECT_ID('rules.rule_evaluation_runs', 'U') IS NOT NULL DELETE FROM rules.rule_evaluation_runs;"))
    except Exception as sql_err:
        print(f"  Notice regarding core schema tables: {sql_err}")

    db.commit()

    print(f"\nSUCCESSFULLY DELETED:")
    print(f"  -> {deleted_docs} Documents deleted")
    print(f"  -> {deleted_items} Line items deleted")
    print(f"  -> {deleted_logs} Approval logs deleted")
    print(f"  -> {deleted_states} Checklist states deleted")
    print("\nAll Business Rules, Workflow Profiles, Checklists, and Users remain untouched.")
    print("=" * 80)

except Exception as e:
    db.rollback()
    print(f"\n[ERROR] Failed to delete documents: {e}")
    sys.exit(1)
finally:
    db.close()
