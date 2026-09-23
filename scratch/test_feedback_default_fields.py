import sys

sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.connection import SessionLocal
from app.routers.more_info import get_doc_type_more_info_config, normalize_doc_type

def test_feedback_defaults():
    db = SessionLocal()
    try:
        print("Testing normalize_doc_type:")
        for dt in ["FEEDBACK", "FEED BACK", "Customer Feedback", "CUSTOMER COMPLAINT"]:
            norm = normalize_doc_type(dt)
            print(f"  '{dt}' -> '{norm}'")
            assert norm == "CUSTOMER COMPLAINT"

        config = get_doc_type_more_info_config("FEEDBACK", current_user=None, db=db)
        admin_fields = [f.field_key for f in config.admin_default_fields]
        print(f"\nDefault Admin Fields for FEEDBACK ({len(admin_fields)}):")
        for idx, key in enumerate(admin_fields, 1):
            print(f"  {idx}. {key}")

        expected = [
            "account_name", "bp_code", "employee_name", "employee_id",
            "employee_division", "employee_segment", "survey_date",
            "subtype_of_complaint", "additional_comments", "dealer_name",
            "bp_type", "type_of_complaint", "customer_code", "invoice_number",
            "image_1", "image_2", "image_3", "image_4", "image_5"
        ]

        assert admin_fields == expected, f"Expected {expected}, got {admin_fields}"
        print("\n[PASSED] All 19 default fields for FEEDBACK / FEED BACK / CUSTOMER COMPLAINT are correctly configured!")

    finally:
        db.close()

if __name__ == "__main__":
    test_feedback_defaults()
