import sys
sys.path.insert(0, 'backend')

from app.database.connection import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("Starting safe cleanup of test document records and dependent transactional records...")

# Delete dependent transactional tables
tables_to_clear = [
    'document_line_items',
    'document_checklist_states',
    'document_approval_logs',
    'approval_assignments',
    'integration_sync_logs',
    'system_engine_logs',
    'document_locks',
    'callback_events',
]

for t in tables_to_clear:
    try:
        res = db.execute(text(f"DELETE FROM {t}"))
        print(f"  Cleared {res.rowcount} records from '{t}'")
    except Exception as e:
        print(f"  Note clearing '{t}': {e}")

# Delete document records
res_docs = db.execute(text("DELETE FROM documents"))
print(f"Cleared {res_docs.rowcount} records from 'documents'")

db.commit()

# Verification
final_count = db.execute(text("SELECT COUNT(*) FROM documents")).scalar()
print(f"\nVerification: SELECT COUNT(*) FROM documents = {final_count}")

db.close()
