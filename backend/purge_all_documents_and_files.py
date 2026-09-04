import sys
import json
import os
import shutil
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.config import settings
from sqlalchemy import text

db = SessionLocal()

doc_tables = [
    "document_checklist_states",
    "document_approval_logs",
    "system_engine_logs",
    "invoices",
    "documents"
]

backup_data = {}

print("==========================================================")
print("  PURGE ALL INGRESTED DOCUMENTS & PHYSICAL FILES")
print("==========================================================")

for table in doc_tables:
    try:
        res = db.execute(text(f"SELECT * FROM {table}"))
        columns = res.keys()
        rows = [dict(zip(columns, row)) for row in res.fetchall()]
        backup_data[table] = rows
        print(f"[Backup] Exported {len(rows)} records from '{table}'")
    except Exception as e:
        print(f"[Backup Notice] Could not backup '{table}': {e}")

scratch_dir = r"C:\Users\TempAdmin\.gemini\antigravity\brain\8f555b68-5137-47e1-92f1-947706665c31\scratch"
os.makedirs(scratch_dir, exist_ok=True)
backup_path = os.path.join(scratch_dir, "backup_documents_and_files.json")

with open(backup_path, "w", encoding="utf-8") as f:
    json.dump(backup_data, f, indent=2, default=str)

print(f"\n[Backup Success] Document records backed up to: {backup_path}\n")

# Clear database records
for table in doc_tables:
    try:
        res = db.execute(text(f"DELETE FROM {table}"))
        print(f"[Clear DB] Deleted all records from '{table}'")
    except Exception as e:
        print(f"[Clear Notice] Could not clear '{table}': {e}")

db.commit()
db.close()

# Clear physical file storage folders
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

print(f"\n[Storage Purge] Removed {deleted_file_count} physical document files from storage directories.")
print("\n[COMPLETE SUCCESS] All document records and physical files have been completely purged!")
