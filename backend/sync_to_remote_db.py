"""
DocuFlow Database Migration & Remote Push Utility
-------------------------------------------------
Wipes target remote database, replicates the complete local schema,
and copies all tables and rows directly from Local DB -> Remote DB.
"""

import sys
import os
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import create_engine, inspect, text, MetaData, Table
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.database import Base, engine as local_engine
from app.models import (
    User, Document, Invoice, WorkflowProfile, WorkflowStepDefinition,
    BusinessRule, ChecklistTemplate, ChecklistRule, InvoiceChecklistState,
    AuditLog, SystemLog, InAppNotification, NotificationProviderConfig,
    NotificationRaciMatrix
)

# Table ordering to respect foreign key constraints during wipe & copy
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
    "system_engine_logs",
    "in_app_notifications",
    "notification_provider_configs",
    "notification_raci_matrices"
]

def push_local_to_remote(remote_db_url: str):
    print("=" * 70)
    print(">>> DOCUFLOW LOCAL -> REMOTE DATABASE SYNC & PUSH")
    print("=" * 70)
    print(f"[*] Source (Local):  {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}")
    print(f"[*] Target (Remote): {remote_db_url.split('@')[-1] if '@' in remote_db_url else remote_db_url}")
    print("=" * 70)

    # 1. Connect to both databases
    try:
        remote_engine = create_engine(remote_db_url, pool_pre_ping=True)
        with remote_engine.connect() as conn:
            print("[+] Successfully connected to Remote Database.")
    except Exception as e:
        print(f"[!] Error connecting to Remote Database: {e}")
        return False

    # 2. Wipe / Clean existing data in target remote database
    print("\n[Step 1/3] Cleaning existing tables & data on Remote Server...")
    with remote_engine.connect() as conn:
        # Disable foreign key checks for clean wipe
        if "mssql" in remote_db_url or "sqlserver" in remote_db_url:
            conn.execute(text("EXEC sp_MSforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT all'"))
            for tbl in reversed(TABLES_ORDERED):
                try:
                    conn.execute(text(f"IF OBJECT_ID('{tbl}', 'U') IS NOT NULL DELETE FROM [{tbl}];"))
                except Exception as wipe_err:
                    print(f"    [Notice] Table {tbl}: {wipe_err}")
            conn.execute(text("EXEC sp_MSforeachtable 'ALTER TABLE ? WITH CHECK CHECK CONSTRAINT all'"))
            conn.commit()
        else:
            # PostgreSQL / SQLite / MySQL wipe
            for tbl in reversed(TABLES_ORDERED):
                try:
                    conn.execute(text(f"DROP TABLE IF EXISTS {tbl} CASCADE;"))
                except Exception:
                    pass
            conn.commit()
    print("    [OK] Remote tables cleaned.")

    # 3. Create clean schema on remote database
    print("\n[Step 2/3] Re-creating complete database schema & tables on Remote...")
    Base.metadata.create_all(bind=remote_engine)
    print("    [OK] Remote schema initialized.")

    # 4. Copy all records table by table
    print("\n[Step 3/3] Transferring all data from Local -> Remote...")
    local_meta = MetaData()
    local_meta.reflect(bind=local_engine)

    remote_meta = MetaData()
    remote_meta.reflect(bind=remote_engine)

    LocalSession = sessionmaker(bind=local_engine)
    RemoteSession = sessionmaker(bind=remote_engine)

    local_session = LocalSession()
    remote_session = RemoteSession()

    for table_name in TABLES_ORDERED:
        if table_name not in local_meta.tables or table_name not in remote_meta.tables:
            continue

        local_table = local_meta.tables[table_name]
        remote_table = remote_meta.tables[table_name]

        # Fetch local records
        rows = local_session.execute(local_table.select()).fetchall()
        row_count = len(rows)

        if row_count > 0:
            dict_rows = [dict(row._mapping) for row in rows]
            
            with remote_engine.connect() as conn:
                # Handle IDENTITY_INSERT for MS SQL Server
                is_mssql = "mssql" in remote_db_url or "sqlserver" in remote_db_url
                has_identity = False
                
                if is_mssql:
                    try:
                        conn.execute(text(f"SET IDENTITY_INSERT [{table_name}] ON;"))
                        has_identity = True
                    except Exception:
                        has_identity = False

                # Bulk insert in batches of 500
                batch_size = 500
                for i in range(0, len(dict_rows), batch_size):
                    batch = dict_rows[i:i + batch_size]
                    conn.execute(remote_table.insert(), batch)

                if is_mssql and has_identity:
                    try:
                        conn.execute(text(f"SET IDENTITY_INSERT [{table_name}] OFF;"))
                    except Exception:
                        pass

                conn.commit()
            print(f"    -> {table_name.ljust(30)}: Transferred {str(row_count).rjust(6)} records [OK]")
        else:
            print(f"    -> {table_name.ljust(30)}: 0 records (skipped)")

    local_session.close()
    remote_session.close()

    print("\n" + "=" * 70)
    print("SUCCESS: Remote Database is fully cleaned, migrated, and synchronized!")
    print("=" * 70)
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        remote_url = sys.argv[1]
    else:
        remote_url = os.getenv("REMOTE_DATABASE_URL")

    if not remote_url:
        print("Usage:")
        print("  python sync_to_remote_db.py \"mssql+pymssql://sa:Password@server-ip:1433/DocuFlowDB\"")
        print("\nOr set environment variable: REMOTE_DATABASE_URL")
        sys.exit(1)

    push_local_to_remote(remote_url)
