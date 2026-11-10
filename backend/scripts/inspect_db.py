import sys
sys.path.insert(0, 'backend')

from app.database.connection import SessionLocal
from sqlalchemy import text, inspect

db = SessionLocal()

# Inspect all tables in DB and find foreign keys referencing documents
inspector = inspect(db.bind)

doc_referencing_tables = []
for t in inspector.get_table_names():
    fks = inspector.get_foreign_keys(t)
    for fk in fks:
        if fk.get('referred_table') in ['documents', 'invoices']:
            doc_referencing_tables.append((t, fk))

print('Tables referencing documents table:')
for t, fk in doc_referencing_tables:
    print(f"  Table: {t} | Columns: {fk.get('constrained_columns')}")

# Count records in documents and related transaction tables
doc_count = db.execute(text("SELECT COUNT(id) FROM documents")).scalar()
print(f"\nTotal records in documents table: {doc_count}")

related_tables = [
    'document_line_items', 
    'document_checklist_states', 
    'document_approval_logs', 
    'approval_assignments', 
    'integration_sync_logs', 
    'audit_logs', 
    'document_versions', 
    'system_engine_logs'
]

counts = {}
for rt in related_tables:
    try:
        cnt = db.execute(text(f"SELECT COUNT(*) FROM {rt}")).scalar()
        counts[rt] = cnt
        print(f"  Dependent Table '{rt}': {cnt} records")
    except Exception as e:
        print(f"  Dependent Table '{rt}': not present ({e})")

# Check users, roles, workflow_profiles, workflow_step_definitions
print("\nSystem / Configuration Tables (PROTECTED - WILL NOT BE DELETED):")
for st in ['users', 'roles', 'workflow_profiles', 'workflow_step_definitions', 'document_type_field_configurations']:
    try:
        cnt = db.execute(text(f"SELECT COUNT(*) FROM {st}")).scalar()
        print(f"  Protected Table '{st}': {cnt} records")
    except Exception as e:
        print(f"  Protected Table '{st}': error ({e})")

db.close()
