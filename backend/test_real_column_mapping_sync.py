import sys
from pathlib import Path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from app.database.connection import SessionLocal
from app.schemas.schemas import DocumentSyncRequest
from app.routers.sync import _upsert_single_document
from sqlalchemy import text

def test_real_column_sync_and_custom_data_purging():
    db = SessionLocal()
    try:
        # Create a test payload with real SQL columns passed at top-level AND inside custom_data, plus 1 genuinely unknown field
        payload_data = {
            "DocKey": "TEST-SYNC-REAL-COLS-001",
            "CompanyCode": "VCC",
            "TransType": "CUSTOMER FEEDBACK",
            "DocTotal": 5000.00,
            "account_name": "A.p.s Enterprise",
            "bp_code": "BP-998877",
            "employee_name": "Yuvasree Officer",
            "type_of_complaint": "Product Quality Issue",
            "dealer_name": "Sivakasi Distributors",
            "customer_code": "CUST-443322",
            "customer_name": "Apex Retail Pvt Ltd",
            "feedback_type": "Service Quality",
            "rating": "5 Star",
            "image_1": "https://storage.docuflow.local/images/img1.png",
            "custom_data": {
                "additional_comments": "Urgent review required by auditor",
                "survey_date": "2026-09-23",
                "genuinely_unknown_attribute_x": "Special Unstructured Value 123"
            }
        }

        req = DocumentSyncRequest(**payload_data)
        doc = _upsert_single_document(req, db)

        assert doc is not None, "Document creation failed"
        assert doc.document_type == "CUSTOMER FEEDBACK", f"Expected document_type 'CUSTOMER FEEDBACK', got '{doc.document_type}'"

        # Verify real SQL columns on ORM object
        assert doc.account_name == "A.p.s Enterprise", f"account_name failed: {doc.account_name}"
        assert doc.bp_code == "BP-998877", f"bp_code failed: {doc.bp_code}"
        assert doc.employee_name == "Yuvasree Officer", f"employee_name failed: {doc.employee_name}"
        assert doc.type_of_complaint == "Product Quality Issue", f"type_of_complaint failed: {doc.type_of_complaint}"
        assert doc.dealer_name == "Sivakasi Distributors", f"dealer_name failed: {doc.dealer_name}"
        assert doc.customer_code == "CUST-443322", f"customer_code failed: {doc.customer_code}"
        assert doc.customer_name == "Apex Retail Pvt Ltd", f"customer_name failed: {doc.customer_name}"
        assert doc.feedback_type == "Service Quality", f"feedback_type failed: {doc.feedback_type}"
        assert doc.rating == 5, f"rating failed: {doc.rating}"
        assert doc.image_1 == "https://storage.docuflow.local/images/img1.png", f"image_1 failed: {doc.image_1}"
        assert doc.additional_comments == "Urgent review required by auditor", f"additional_comments failed: {doc.additional_comments}"
        assert doc.survey_date == "2026-09-23", f"survey_date failed: {doc.survey_date}"

        # Verify SQL row directly in database
        row = db.execute(text("SELECT account_name, bp_code, employee_name, type_of_complaint, dealer_name, customer_code, customer_name, custom_data FROM documents WHERE id = :id"), {"id": doc.id}).mappings().first()

        assert row["account_name"] == "A.p.s Enterprise", "Database column account_name mismatch"
        assert row["bp_code"] == "BP-998877", "Database column bp_code mismatch"
        assert row["employee_name"] == "Yuvasree Officer", "Database column employee_name mismatch"
        assert row["type_of_complaint"] == "Product Quality Issue", "Database column type_of_complaint mismatch"
        assert row["dealer_name"] == "Sivakasi Distributors", "Database column dealer_name mismatch"
        assert row["customer_code"] == "CUST-443322", "Database column customer_code mismatch"

        # Check custom_data: must NOT contain real SQL column keys, ONLY genuinely_unknown_attribute_x
        custom_data_val = row["custom_data"]
        import json
        cd_dict = json.loads(custom_data_val) if isinstance(custom_data_val, str) else (custom_data_val or {})
        
        assert "account_name" not in cd_dict, "account_name should be purged from custom_data"
        assert "bp_code" not in cd_dict, "bp_code should be purged from custom_data"
        assert "employee_name" not in cd_dict, "employee_name should be purged from custom_data"
        assert "additional_comments" not in cd_dict, "additional_comments should be purged from custom_data"
        assert "survey_date" not in cd_dict, "survey_date should be purged from custom_data"
        assert "genuinely_unknown_attribute_x" in cd_dict, "genuinely_unknown_attribute_x missing from custom_data"
        assert cd_dict["genuinely_unknown_attribute_x"] == "Special Unstructured Value 123"

        print("SUCCESS: Real SQL column mapping and custom_data purging test passed perfectly!")

    finally:
        db.close()

if __name__ == "__main__":
    test_real_column_sync_and_custom_data_purging()
