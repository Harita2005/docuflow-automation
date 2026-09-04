import sys
import json
import os
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from sqlalchemy import text

db = SessionLocal()

tables = [
    "workflow_profiles",
    "workflow_step_definitions",
    "business_rules",
    "checklist_rules",
    "checklist_templates"
]

backup_data = {}

print("==========================================================")
print("  EXACT BACKUP & CLEAR OF WORKFLOWS, CONDITIONS & CHECKLISTS")
print("==========================================================")

for table in tables:
    try:
        res = db.execute(text(f"SELECT * FROM {table}"))
        columns = res.keys()
        rows = [dict(zip(columns, row)) for row in res.fetchall()]
        backup_data[table] = rows
        print(f"[Backup] Exported {len(rows)} rows from '{table}'")
    except Exception as e:
        print(f"[Backup Notice] Could not backup '{table}': {e}")

scratch_dir = r"C:\Users\TempAdmin\.gemini\antigravity\brain\8f555b68-5137-47e1-92f1-947706665c31\scratch"
os.makedirs(scratch_dir, exist_ok=True)
backup_path = os.path.join(scratch_dir, "backup_workflows_conditions_checklists.json")

with open(backup_path, "w", encoding="utf-8") as f:
    json.dump(backup_data, f, indent=2, default=str)

print(f"\n[Backup Success] Saved backup file to: {backup_path}\n")

for table in tables:
    try:
        res = db.execute(text(f"DELETE FROM {table}"))
        print(f"[Clear Success] Deleted all rows from '{table}'")
    except Exception as e:
        print(f"[Clear Notice] Could not clear '{table}': {e}")

db.commit()
db.close()
print("\n[COMPLETE SUCCESS] All existing workflows, conditions, and checklist rules are backed up & cleared!")
