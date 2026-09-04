import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.database import engine

print("==========================================================")
print("  MIGRATING CHECKLIST RULES TABLE ON SQL SERVER:")
print("==========================================================")

with engine.connect() as conn:
    try:
        conn.execute(text("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='checklist_rules' AND COLUMN_NAME='cost_center') ALTER TABLE checklist_rules ADD cost_center VARCHAR(200) NULL;"))
        conn.commit()
        print("[Migration] Added 'cost_center' column to 'checklist_rules' table successfully.")
    except Exception as e:
        print(f"[Migration Notice] {e}")

