import sys
import pyodbc

# Add backend directory to sys.path
sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.session import SessionLocal
from app.schemas.schemas import DocumentSyncRequest
from app.routers.sync import _upsert_single_document

test_cases = [
    {"doc_key": "TEST-CLASSIFY-01", "document_type": "AP INVOICE", "amount": 1500.0, "vendor_name": "Test Vendor 1"},
    {"doc_key": "TEST-CLASSIFY-02", "document_type": "CAPEX / FIXED ASSET", "amount": 250000.0, "vendor_name": "Test Asset Co"},
    {"doc_key": "TEST-CLASSIFY-03", "document_type": "CASH VOUCHER", "amount": 450.0, "vendor_name": "Petty Cash Admin"},
    {"doc_key": "TEST-CLASSIFY-04", "document_type": "E-VOUCHER", "amount": 1200.0, "vendor_name": "Digital Voucher System"},
    {"doc_key": "TEST-CLASSIFY-05", "document_type": "General Records", "amount": 0.0, "vendor_name": "General Admin"},
    {"doc_key": "TEST-CLASSIFY-06", "document_type": "PURCHASE INVOICE", "amount": 8900.0, "vendor_name": "Supply Chain Corp"},
    {"doc_key": "TEST-CLASSIFY-07", "document_type": "STAFF & HR EXPENSE", "amount": 3400.0, "vendor_name": "John Doe Employee"},
    {"doc_key": "TEST-CLASSIFY-08", "document_type": "UTILITY & RENT", "amount": 45000.0, "vendor_name": "State Electricity Board"},
    {"doc_key": "TEST-CLASSIFY-09", "document_type": "CUSTOMER FEEDBACK", "amount": 0.0, "account_name": "Acme Retail Ltd", "type_of_complaint": "Product Damage"},
]

def main():
    db = SessionLocal()
    print("=" * 70)
    print("STARTING GLOBAL DOCUMENT CLASSIFICATION PIPELINE TEST")
    print("=" * 70)
    
    success_count = 0
    
    for case in test_cases:
        expected_type = case["document_type"]
        req = DocumentSyncRequest(**case)
        
        try:
            res = _upsert_single_document(req, db)
            doc_id = res.get("id")
            print(f"Processing doc_id: {doc_id}")
            
            # Query DB directly to verify source of truth column
            conn = pyodbc.connect('Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=DocuFlowDB;Trusted_Connection=yes;')
            cursor = conn.cursor()
            cursor.execute("SELECT id, document_type, invoice_number, status FROM documents WHERE doc_key = ?", (str(case["doc_key"]),))
            row = cursor.fetchone()
            conn.close()
            
            if not row:
                print(f"❌ FAIL: Record {case['doc_key']} not found in DB!")
                continue
                
            db_id, db_doc_type, db_inv_num, db_status = row
            
            if db_doc_type == expected_type:
                print(f"✅ PASS: [{case['doc_key']}] DB document_type='{db_doc_type}' | id='{db_id}' | inv_num='{db_inv_num}'")
                success_count += 1
            else:
                print(f"❌ FAIL: [{case['doc_key']}] Expected '{expected_type}', but DB has '{db_doc_type}'")
                
        except Exception as e:
            print(f"❌ ERROR processing {case['doc_key']}: {e}")
            import traceback
            traceback.print_exc()

    db.close()
    print("=" * 70)
    print(f"TEST COMPLETE: {success_count}/{len(test_cases)} Passed Successfully")
    print("=" * 70)
    if success_count == len(test_cases):
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
