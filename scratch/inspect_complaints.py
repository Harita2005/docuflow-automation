import sys
sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.connection import SessionLocal
from sqlalchemy import text

def inspect_records():
    db = SessionLocal()
    try:
        query = text("""
            SELECT id, doc_key, document_type, account_name, type_of_complaint, dealer_name, bp_code, employee_name, custom_data
            FROM documents
            WHERE document_type LIKE '%COMPLAINT%' OR document_type LIKE '%FEEDBACK%'
        """)
        rows = db.execute(query).fetchall()
        print(f"Found {len(rows)} Customer Complaint / Feedback records in DB:")
        for r in rows:
            print(f"ID: {r[0]} | DocKey: {r[1]} | Type: {r[2]}")
            print(f"  account_name     : {r[3]}")
            print(f"  type_of_complaint: {r[4]}")
            print(f"  dealer_name      : {r[5]}")
            print(f"  bp_code          : {r[6]}")
            print(f"  employee_name    : {r[7]}")
            print(f"  custom_data      : {r[8]}")
            print("-" * 50)
    finally:
        db.close()

if __name__ == "__main__":
    inspect_records()
