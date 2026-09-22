import sys
import json
import logging
logging.basicConfig(level=logging.ERROR)

sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.connection import SessionLocal
from app.schemas import DocumentSyncRequest
from app.routers.sync import sync_single_document
from sqlalchemy import text

def test_all_types():
    db = SessionLocal()
    try:
        doc_tests = [
            {
                "type": "AP INVOICE",
                "key": "TEST-AP-INV-001",
                "data": {
                    "DocKey": "TEST-AP-INV-001",
                    "DocTotal": 10000.00,
                    "CompanyCode": "VCC",
                    "TransType": "AP INVOICE",
                    "CardName": "ACME Supplies Pvt Ltd",
                    "CardCode": "VEND-001",
                    "DocRefNo": "INV-2026-999",
                    "DocDate": "2026-09-20",
                    "PONumber": "PO-888"
                }
            },
            {
                "type": "AR CREDITNOTE",
                "key": "TEST-CREDIT-NOTE-001",
                "data": {
                    "DocKey": "TEST-CREDIT-NOTE-001",
                    "DocTotal": 5000.00,
                    "CompanyCode": "VCC",
                    "TransType": "AR CREDITNOTE",
                    "Credit Note Number": "CN-2026-101",
                    "Reason For Credit": "Goods Damaged in Transit",
                    "Original Invoice Ref": "INV-2026-999"
                }
            },
            {
                "type": "HR EXPENSE",
                "key": "TEST-HR-EXPENSE-001",
                "data": {
                    "DocKey": "TEST-HR-EXPENSE-001",
                    "DocTotal": 3200.00,
                    "CompanyCode": "VCC",
                    "TransType": "HR EXPENSE",
                    "Employee Name": "Robert Langdon",
                    "Employee ID": "EMP-404",
                    "Expense Type": "Travel Reimbursement",
                    "Department": "Human Resources"
                }
            },
            {
                "type": "CUSTOMER COMPLAINT",
                "key": "TEST-FEEDBACK-001",
                "data": {
                    "DocKey": "TEST-FEEDBACK-001",
                    "DocTotal": 100.00,
                    "CompanyCode": "VCC",
                    "TransType": "CUSTOMER COMPLAINT",
                    "Account Name": "Titan Industries",
                    "BP Code": "BP-303",
                    "Feedback Date": "2026-09-21"
                }
            }
        ]

        print("Testing Sync for all Document Types:")
        for t in doc_tests:
            req = DocumentSyncRequest(**t["data"])
            res = sync_single_document(payload=req, db=db, api_key=True)
            print(f"  [SUCCESS] {t['type']} synced with ID: {res.document_id}, Status: {res.status}")

        # Check DB values for Credit Note, HR Expense, and Feedback
        cn_row = db.execute(text("SELECT credit_note_number, reason_for_credit, original_invoice_ref, custom_data FROM documents WHERE doc_key = 'TEST-CREDIT-NOTE-001'")).fetchone()
        print("\nCredit Note DB check:")
        print(f"  credit_note_number: {cn_row[0]}")
        print(f"  reason_for_credit  : {cn_row[1]}")
        print(f"  original_invoice_ref: {cn_row[2]}")
        print(f"  custom_data        : {cn_row[3]}")
        assert cn_row[0] == "CN-2026-101"
        assert cn_row[1] == "Goods Damaged in Transit"
        assert cn_row[2] == "INV-2026-999"
        assert cn_row[3] is None

        hr_row = db.execute(text("SELECT employee_name, employee_id, expense_type, department, custom_data FROM documents WHERE doc_key = 'TEST-HR-EXPENSE-001'")).fetchone()
        print("\nHR Expense DB check:")
        print(f"  employee_name: {hr_row[0]}")
        print(f"  employee_id  : {hr_row[1]}")
        print(f"  expense_type : {hr_row[2]}")
        print(f"  department   : {hr_row[3]}")
        print(f"  custom_data  : {hr_row[4]}")
        assert hr_row[0] == "Robert Langdon"
        assert hr_row[1] == "EMP-404"
        assert hr_row[2] == "Travel Reimbursement"
        assert hr_row[3] == "Human Resources"
        assert hr_row[4] is None

        fb_row = db.execute(text("SELECT account_name, bp_code, feedback_date, custom_data FROM documents WHERE doc_key = 'TEST-FEEDBACK-001'")).fetchone()
        print("\nCustomer Complaint DB check:")
        print(f"  account_name : {fb_row[0]}")
        print(f"  bp_code      : {fb_row[1]}")
        print(f"  feedback_date: {fb_row[2]}")
        print(f"  custom_data  : {fb_row[3]}")
        assert fb_row[0] == "Titan Industries"
        assert fb_row[1] == "BP-303"
        assert fb_row[2] == "2026-09-21"
        assert fb_row[3] is None

        print("\n[PASSED] All document types synced to REAL columns with zero custom_data pollution!")

    finally:
        db.close()

if __name__ == "__main__":
    test_all_types()
