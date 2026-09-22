import sys
import json
import logging
logging.basicConfig(level=logging.INFO)

sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.connection import SessionLocal
from app.schemas import DocumentSyncRequest
from app.routers.sync import sync_single_document
from sqlalchemy import text

def run_test():
    db = SessionLocal()
    try:
        # Test 1: Post new record with fields in top-level and/or custom_data
        test_key = "SYNC-TEST-REAL-COLS-001"
        payload_data = {
            "DocKey": test_key,
            "DocTotal": 2500.00,
            "CompanyCode": "VCC",
            "TransType": "CUSTOMER COMPLAINT",
            "Account Name": "A.P.S & Co",
            "BP Code": "BP-777",
            "Employee Name": "Sarah Connor",
            "Expense Type": "Office Supplies",
            "Department": "Operations",
            "custom_data": {
                "Account Name": "A.P.S & Co",
                "BP Code": "BP-777",
                "Employee Name": "Sarah Connor",
                "Expense Type": "Office Supplies",
                "Department": "Operations",
                "legacy_meta_field": "legacy_val_123"
            }
        }
        
        req = DocumentSyncRequest(**payload_data)
        res = sync_single_document(payload=req, db=db, api_key=True)
        print("Sync Response:", res)
        
        # Verify directly in SQL Server table documents
        query = text("""
            SELECT id, account_name, bp_code, employee_name, expense_type, department, custom_data
            FROM documents
            WHERE doc_key = :key
        """)
        row = db.execute(query, {"key": test_key}).fetchone()
        assert row is not None, "Record was not inserted into database!"
        
        doc_id, account_name, bp_code, employee_name, expense_type, department, custom_data_raw = row
        print(f"\n[DATABASE VERIFICATION FOR RECORD {doc_id}]:")
        print(f"  1. account_name  : '{account_name}'")
        print(f"  2. bp_code       : '{bp_code}'")
        print(f"  3. employee_name : '{employee_name}'")
        print(f"  4. expense_type  : '{expense_type}'")
        print(f"  5. department    : '{department}'")
        print(f"  6. custom_data   : {custom_data_raw}")
        
        # Assertions
        assert account_name == "A.P.S & Co", f"Expected 'A.P.S & Co', got '{account_name}'"
        assert bp_code == "BP-777", f"Expected 'BP-777', got '{bp_code}'"
        assert employee_name == "Sarah Connor", f"Expected 'Sarah Connor', got '{employee_name}'"
        assert expense_type == "Office Supplies", f"Expected 'Office Supplies', got '{expense_type}'"
        assert department == "Operations", f"Expected 'Operations', got '{department}'"
        
        # Verify custom_data does NOT contain the mapped real column fields
        if custom_data_raw:
            cdata = json.loads(custom_data_raw) if isinstance(custom_data_raw, str) else custom_data_raw
            for forbidden_field in ["Account Name", "BP Code", "Employee Name", "Expense Type", "Department", "account_name", "bp_code", "employee_name", "expense_type", "department"]:
                assert forbidden_field not in cdata, f"Field '{forbidden_field}' should NOT be in custom_data!"
            print(f"  -> Verified: Real column fields are NOT duplicated inside custom_data!")
            print(f"  -> Remaining custom_data contains only legacy metadata: {cdata}")
        else:
            print("  -> Verified: custom_data is clean / None!")
            
        print("\n[PASSED] All field mapping assertions verified successfully!")
        
    finally:
        db.close()

if __name__ == "__main__":
    run_test()
