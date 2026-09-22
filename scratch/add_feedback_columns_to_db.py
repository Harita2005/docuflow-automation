import sys
sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.connection import SessionLocal
from app.routers.sync import ensure_dynamic_column_and_get_name

feedback_fields = [
    "account_name",
    "bp_code",
    "employee_name",
    "employee_id",
    "employee_division",
    "employee_segment",
    "survey_date",
    "subtype_of_complaint",
    "additional_comments",
    "dealer_name",
    "bp_type",
    "type_of_complaint",
    "customer_code",
    "invoice_number",
    "image_1",
    "image_2",
    "image_3",
    "image_4",
    "image_5"
]

def add_columns():
    db = SessionLocal()
    try:
        print("Ensuring real SQL Server columns exist in `dbo.documents` table:\n")
        created_cols = []
        for field in feedback_fields:
            col_name = ensure_dynamic_column_and_get_name(db, field, "sample_text")
            created_cols.append(col_name)
            print(f"  [REAL COLUMN IN dbo.documents] -> {col_name}")
        print(f"\nSuccessfully verified/created all {len(created_cols)} real columns in `dbo.documents`!")
    finally:
        db.close()

if __name__ == "__main__":
    add_columns()
