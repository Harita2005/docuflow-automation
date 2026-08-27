import sys
import os
import json
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import create_engine, MetaData, text
from app.config import settings
from app.database import Base, engine

JSON_PATH = BASE_DIR / "seed_data.json"
if not JSON_PATH.exists():
    JSON_PATH = Path("/app/seed_data.json")

TABLES_ORDERED = [
    "users",
    "workflow_profiles",
    "workflow_step_definitions",
    "business_rules",
    "checklist_templates",
    "checklist_rules",
    "documents",
    "document_line_items",
    "document_checklist_states",
    "document_approval_logs",
    "in_app_notifications",
    "notification_provider_configs",
    "notification_raci_matrices"
]

def parse_val(v):
    if v is None:
        return None
    if isinstance(v, str):
        if len(v) >= 19 and (v[10] == 'T' or v[10] == ' ') and v[4] == '-' and v[7] == '-':
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                pass
    return v

def run_seeder():
    print("=" * 70)
    print(">>> DOCUFLOW DIRECT SNAPSHOT DATABASE SEEDER")
    print("=" * 70)
    print(f"[*] Target Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}")
    print(f"[*] Data Source:     {JSON_PATH}")
    print("=" * 70)

    if not JSON_PATH.exists():
        print(f"[ERROR] Snapshot file not found at: {JSON_PATH}")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 1. Create tables if not exist
    print("\n[Step 1/3] Ensuring database schema tables exist...")
    Base.metadata.create_all(bind=engine)
    print("    [OK] Schema initialized.")

    meta = MetaData()
    meta.reflect(bind=engine)

    # 2. Wipe existing tables cleanly
    print("\n[Step 2/3] Cleaning existing table records...")
    is_mssql = "mssql" in settings.DATABASE_URL.lower() or "sqlserver" in settings.DATABASE_URL.lower()

    with engine.connect() as conn:
        if is_mssql:
            conn.execute(text("EXEC sp_MSforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT all'"))
            for tbl in reversed(TABLES_ORDERED):
                try:
                    conn.execute(text(f"IF OBJECT_ID('{tbl}', 'U') IS NOT NULL DELETE FROM [{tbl}];"))
                except Exception as e:
                    print(f"    [Notice] Table {tbl}: {e}")
            conn.execute(text("EXEC sp_MSforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT all'"))
            conn.commit()
        else:
            for tbl in reversed(TABLES_ORDERED):
                try:
                    conn.execute(text(f"DELETE FROM {tbl};"))
                except Exception:
                    pass
            conn.commit()
    print("    [OK] Tables cleaned.")

    # 3. Insert records table by table
    print("\n[Step 3/3] Inserting records from snapshot...")
    with engine.connect() as conn:
        for tbl_name in TABLES_ORDERED:
            rows = data.get(tbl_name, [])
            if not rows:
                print(f"    - {tbl_name:30s} : 0 rows (skipped)")
                continue

            tbl = meta.tables.get(tbl_name)
            if tbl is None:
                print(f"    [Warning] Table {tbl_name} not found in metadata.")
                continue

            cleaned_rows = []
            for r in rows:
                row_dict = {}
                for col in tbl.columns.keys():
                    if col in r:
                        row_dict[col] = parse_val(r[col])
                cleaned_rows.append(row_dict)

            # Insert in chunks of 500
            chunk_size = 500
            for i in range(0, len(cleaned_rows), chunk_size):
                chunk = cleaned_rows[i:i + chunk_size]
                if is_mssql:
                    try:
                        conn.execute(text(f"SET IDENTITY_INSERT [{tbl_name}] ON"))
                    except Exception:
                        pass
                conn.execute(tbl.insert(), chunk)
                if is_mssql:
                    try:
                        conn.execute(text(f"SET IDENTITY_INSERT [{tbl_name}] OFF"))
                    except Exception:
                        pass
                conn.commit()

            print(f"    ✓ {tbl_name:30s} : {len(cleaned_rows):,} rows inserted")

    print("\n" + "=" * 70)
    print(">>> DATABASE SEEDING COMPLETED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_seeder()
