import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend'))
from app.database.connection import SessionLocal
from sqlalchemy import text, inspect

def run_migration():
    db = SessionLocal()
    
    print("=== STARTING MIGRATION: Convert documents.id and FKs to INTEGER ===")
    
    inspector = inspect(db.bind)
    
    # 1. Drop existing FKs if any are present
    for t in inspector.get_table_names():
        for fk in inspector.get_foreign_keys(t):
            if fk.get('referred_table') == 'documents':
                print(f"Dropping FK {fk['name']} on {t}...")
                db.execute(text(f"ALTER TABLE {t} DROP CONSTRAINT {fk['name']}"))
    db.commit()

    # 2. Add document_code column to documents if not exists and populate
    cols = [c['name'] for c in inspector.get_columns('documents')]
    if 'document_code' not in cols:
        print("Adding document_code column to documents...")
        db.execute(text("ALTER TABLE documents ADD document_code VARCHAR(100) NULL"))
        db.commit()

    db.execute(text("UPDATE documents SET document_code = id WHERE document_code IS NULL"))
    db.commit()

    rows = db.execute(text("SELECT id FROM documents")).fetchall()
    id_map = {}
    for r in rows:
        old_id = r[0]
        digits = ''.join(ch for ch in old_id if ch.isdigit())
        int_id = int(digits) if digits else 1
        id_map[old_id] = int_id
    print(f"ID Mapping: {id_map}")

    # Columns without 'id'
    non_id_cols = [c['name'] for c in inspector.get_columns('documents') if c['name'] != 'id']
    cols_str = ", ".join(f"[{c}]" for c in non_id_cols)
    print(f"Columns to copy ({len(non_id_cols)}): {non_id_cols[:5]}...")

    # 3. Create documents_new
    db.execute(text("IF OBJECT_ID('documents_new', 'U') IS NOT NULL DROP TABLE documents_new"))
    db.commit()

    print("Creating documents_new table structure...")
    db.execute(text(f"""
        SELECT 
            CAST(1 AS INT) AS id,
            {cols_str}
        INTO documents_new
        FROM documents
        WHERE 1 = 0
    """))
    db.commit()

    # Make id column INT NOT NULL IDENTITY(1,1) PRIMARY KEY
    print("Altering id to INT IDENTITY(1,1) PRIMARY KEY...")
    db.execute(text("ALTER TABLE documents_new DROP COLUMN id"))
    db.execute(text("ALTER TABLE documents_new ADD id INT IDENTITY(1,1) NOT NULL PRIMARY KEY"))
    db.commit()

    # 4. Copy data into documents_new
    print("Copying data into documents_new...")
    db.execute(text("SET IDENTITY_INSERT documents_new ON"))
    for old_id, new_int_id in id_map.items():
        db.execute(text(f"""
            INSERT INTO documents_new (id, {cols_str})
            SELECT {new_int_id}, {cols_str}
            FROM documents
            WHERE id = :old_id
        """), {"old_id": old_id})
    db.execute(text("SET IDENTITY_INSERT documents_new OFF"))
    db.commit()

    max_id = max(id_map.values()) if id_map else 0
    print(f"Reseeding documents_new to {max_id}...")
    db.execute(text(f"DBCC CHECKIDENT ('documents_new', RESEED, {max_id})"))
    db.commit()

    # Unique index on document_code
    print("Adding unique index on document_code...")
    db.execute(text("CREATE UNIQUE INDEX ix_documents_document_code ON documents_new(document_code) WHERE document_code IS NOT NULL"))
    db.commit()

    # 5. Swap tables
    print("Dropping old documents table...")
    db.execute(text("DROP TABLE documents"))
    db.commit()

    print("Renaming documents_new to documents...")
    db.execute(text("EXEC sp_rename 'documents_new', 'documents'"))
    db.commit()

    print("Recreating indexes on documents...")
    for idx_col in ['doc_key', 'doc_num', 'invoice_number', 'vendor_code', 'division', 'status', 'cost_center', 'plant', 'workflow_profile_id', 'is_deleted']:
        try:
            db.execute(text(f"CREATE INDEX ix_documents_{idx_col} ON documents([{idx_col}])"))
            db.commit()
        except Exception as e:
            print(f"Index note for {idx_col}: {e}")

    # 6. Update child tables
    child_fks = [
        ('approval_assignments', 'document_id', 'CASCADE'),
        ('audit_logs', 'invoice_id', 'CASCADE'),
        ('callback_events', 'document_id', 'NO ACTION'),
        ('document_approval_logs', 'invoice_id', 'CASCADE'),
        ('document_checklist_states', 'invoice_id', 'CASCADE'),
        ('document_line_items', 'invoice_id', 'CASCADE'),
        ('document_locks', 'document_id', 'CASCADE'),
        ('integration_sync_logs', 'document_id', 'CASCADE'),
        ('system_engine_logs', 'invoice_id', 'CASCADE'),
        ('system_logs', 'invoice_id', 'CASCADE'),
    ]

    for tbl, col, cascade in child_fks:
        print(f"\nMigrating {tbl}.{col} to INT...")
        # Update old values to new ints
        for old_id, new_int_id in id_map.items():
            db.execute(text(f"""
                UPDATE {tbl} 
                SET {col} = '{new_int_id}' 
                WHERE {col} = :old_id
            """), {"old_id": old_id})
        db.commit()

        # Set any non-numeric strings to NULL if table exists
        db.execute(text(f"""
            UPDATE {tbl}
            SET {col} = NULL
            WHERE {col} IS NOT NULL AND ISNUMERIC({col}) = 0
        """))
        db.commit()

        # Drop any existing index on this column
        try:
            idx_rows = db.execute(text(f"""
                SELECT i.name 
                FROM sys.indexes i
                JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                WHERE i.object_id = OBJECT_ID('{tbl}') AND c.name = '{col}' AND i.is_primary_key = 0
            """)).fetchall()
            for r in idx_rows:
                print(f"  Dropping index {r[0]} on {tbl}...")
                db.execute(text(f"DROP INDEX [{r[0]}] ON [{tbl}]"))
            db.commit()
        except Exception as e:
            print(f"  Note dropping index on {tbl}: {e}")

        # Check nullability
        col_meta = next((c for c in inspector.get_columns(tbl) if c['name'] == col), None)
        is_nullable = col_meta['nullable'] if col_meta else True
        null_clause = "NULL" if is_nullable else "NOT NULL"

        print(f"  Altering column {tbl}.{col} to INT {null_clause}...")
        db.execute(text(f"ALTER TABLE {tbl} ALTER COLUMN {col} INT {null_clause}"))
        db.commit()

        fk_name = f"FK_{tbl}_{col}_documents_id"
        cascade_clause = f"ON DELETE {cascade}" if cascade != 'NO ACTION' else ""
        print(f"  Adding FK constraint {fk_name}...")
        db.execute(text(f"""
            ALTER TABLE {tbl}
            ADD CONSTRAINT {fk_name}
            FOREIGN KEY ({col}) REFERENCES documents(id) {cascade_clause}
        """))
        db.commit()

        print(f"  Creating index ix_{tbl}_{col}...")
        try:
            db.execute(text(f"CREATE INDEX ix_{tbl}_{col} ON {tbl}({col})"))
            db.commit()
        except Exception as e:
            print(f"  Index note: {e}")

    # 7. Update in_app_notifications
    print("\nUpdating in_app_notifications...")
    for old_id, new_int_id in id_map.items():
        db.execute(text("""
            UPDATE in_app_notifications 
            SET document_id = :new_str 
            WHERE document_id = :old_id
        """), {"new_str": str(new_int_id), "old_id": old_id})
    db.commit()

    print("\n=== MIGRATION COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    run_migration()
