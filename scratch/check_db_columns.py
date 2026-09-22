import sys
sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.connection import SessionLocal
from sqlalchemy import text

def check_documents_columns():
    db = SessionLocal()
    try:
        query = text("""
            SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'documents'
            ORDER BY ORDINAL_POSITION
        """)
        rows = db.execute(query).fetchall()
        print(f"Total Columns in SQL Server `dbo.documents` table: {len(rows)}\n")
        for idx, r in enumerate(rows, 1):
            print(f"{idx:2d}. {r[0]:<25} ({r[1]})")
    finally:
        db.close()

if __name__ == "__main__":
    check_documents_columns()
