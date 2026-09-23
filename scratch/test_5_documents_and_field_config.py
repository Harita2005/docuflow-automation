import sys
import json
import logging

sys.path.insert(0, r"c:\Users\TempAdmin\OneDrive\Documents\docuflow-automation\backend")

from app.database.connection import SessionLocal
from app.schemas.schemas import DocumentSyncRequest, MoreInfoConfigSaveRequest, MoreInfoFieldSaveItem
from app.database.models import User
from app.routers.sync import _upsert_single_document
from app.routers.more_info import (
    get_doc_type_more_info_config,
    save_doc_type_more_info_config,
)
from app.services.rules_engine import match_condition
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_5_docs")

def run_tests():
    print("=" * 70)
    print("STARTING TEST: 5 DOCUMENTS INGESTION & FIELD CONFIGURATION")
    print("=" * 70)

    db = SessionLocal()
    try:
        # Create or fetch test users
        admin_user = db.query(User).filter(User.role == "admin").first()
        if not admin_user:
            admin_user = User(username="admin_test", role="admin", full_name="Admin Test")
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)

        regular_user = db.query(User).filter(User.role != "admin").first()
        if not regular_user:
            regular_user = User(username="user_test", role="user", full_name="Regular Test User")
            db.add(regular_user)
            db.commit()
            db.refresh(regular_user)

        # -------------------------------------------------------------
        # STEP 1: Sync 5 Documents across 3 Document Types
        # -------------------------------------------------------------
        print("\n--- STEP 1: Ingesting 5 Test Documents ---")
        
        # Document 1: AP Invoice #1
        ap1_data = {
            "DocKey": "TEST-AP-001",
            "invoice_number": "INV-2026-001",
            "invoice_date": "2026-09-01",
            "due_date": "2026-10-01",
            "document_type": "AP Invoice",
            "company_code": "COMP01",
            "vendor_name": "Acme Supplies Ltd",
            "amount": 12500.50,
            "po_number": "PO-9910",
            "tax_amount": 1250.00,
            "currency": "USD",
            "auto_route": False
        }
        # Document 2: AP Invoice #2
        ap2_data = {
            "DocKey": "TEST-AP-002",
            "invoice_number": "INV-2026-002",
            "invoice_date": "2026-09-05",
            "due_date": "2026-10-05",
            "document_type": "AP Invoice",
            "company_code": "COMP01",
            "vendor_name": "Global Tech Corp",
            "amount": 8400.00,
            "po_number": "PO-9911",
            "tax_amount": 840.00,
            "payment_terms": "Net 30",
            "auto_route": False
        }

        # Document 3: Credit Note #1
        cn1_data = {
            "DocKey": "TEST-CN-001",
            "credit_note_number": "CN-2026-001",
            "credit_note_date": "2026-09-10",
            "reason_for_credit": "Damaged Goods Refund",
            "document_type": "Credit Note",
            "company_code": "COMP01",
            "vendor_name": "Acme Supplies Ltd",
            "amount": 1500.00,
            "original_invoice_ref": "INV-2026-001",
            "auto_route": False
        }
        # Document 4: Credit Note #2
        cn2_data = {
            "DocKey": "TEST-CN-002",
            "credit_note_number": "CN-2026-002",
            "credit_note_date": "2026-09-12",
            "reason_for_credit": "Pricing Overcharge",
            "document_type": "Credit Note",
            "company_code": "COMP02",
            "vendor_name": "Delta Logistics",
            "amount": 350.00,
            "credit_status": "Approved",
            "auto_route": False
        }

        # Document 5: HR Expense #1
        hre1_data = {
            "DocKey": "TEST-HRE-001",
            "employee_name": "John Doe",
            "employee_id": "EMP-4092",
            "expense_type": "Travel & Meals",
            "expense_date": "2026-09-15",
            "department": "Engineering",
            "document_type": "HR Expense",
            "company_code": "COMP01",
            "vendor_name": "Airport Hotel & Diner",
            "amount": 420.75,
            "receipt_number": "REC-7731",
            "auto_route": False
        }

        doc_payloads = [
            ("AP Invoice #1", ap1_data),
            ("AP Invoice #2", ap2_data),
            ("Credit Note #1", cn1_data),
            ("Credit Note #2", cn2_data),
            ("HR Expense #1", hre1_data),
        ]

        synced_docs = []
        for label, payload in doc_payloads:
            req = DocumentSyncRequest(**payload)
            inv = _upsert_single_document(req, db)
            synced_docs.append(inv)
            print(f"  [SYNCED] {label} -> Document ID: {inv.id}, Type: '{inv.document_type}', Key: '{inv.invoice_number or inv.doc_key}'")

        assert len(synced_docs) == 5, f"Expected 5 synced documents, got {len(synced_docs)}"

        # -------------------------------------------------------------
        # STEP 2: Verify Real Column Creation in `dbo.documents`
        # -------------------------------------------------------------
        print("\n--- STEP 2: Verifying Real SQL Server Columns in `documents` ---")
        expected_new_columns = [
            "po_number", "tax_amount", "currency", "payment_terms",
            "credit_note_number", "credit_note_date", "reason_for_credit", "original_invoice_ref", "credit_status",
            "employee_name", "employee_id", "expense_type", "expense_date", "department", "receipt_number"
        ]

        dialect_name = db.bind.dialect.name if (db.bind and hasattr(db.bind, 'dialect')) else 'mssql'
        for col_name in expected_new_columns:
            if dialect_name == 'mssql':
                query = text("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'documents' AND LOWER(COLUMN_NAME) = LOWER(:col)")
            else:
                query = text("SELECT name, type FROM pragma_table_info('documents') WHERE LOWER(name) = LOWER(:col)")
            
            row = db.execute(query, {"col": col_name}).fetchone()
            if row:
                print(f"  [REAL COLUMN] {row[0]} (Type: {row[1]})")
            else:
                print(f"  [ERROR MISSING COLUMN] {col_name}")

        # Verify values stored directly in real columns & custom_data is empty/not used for them
        print("\n--- Checking database record values directly ---")
        hre_doc = synced_docs[4] # HR Expense #1
        query = text("SELECT id, employee_name, employee_id, expense_type, department, custom_data FROM documents WHERE id = :id")
        row = db.execute(query, {"id": hre_doc.id}).mappings().first()
        print(f"  HR Expense Row in DB: employee_name='{row['employee_name']}', employee_id='{row['employee_id']}', expense_type='{row['expense_type']}'")
        assert row["employee_name"] == "John Doe"
        assert row["employee_id"] == "EMP-4092"
        assert row["expense_type"] == "Travel & Meals"

        if row["custom_data"]:
            cd = json.loads(row["custom_data"])
            assert "employee_name" not in cd, "employee_name MUST NOT be inside custom_data JSON!"
            assert "expense_type" not in cd, "expense_type MUST NOT be inside custom_data JSON!"
        print("  [PASSED] Real columns populated directly; custom_data does not contain newly synced fields!")

        # -------------------------------------------------------------
        # STEP 3: Admin Field Configuration & User Field Selection
        # -------------------------------------------------------------
        print("\n--- STEP 3: Testing Field Configuration (Admin Default vs User Additional) ---")
        
        # A) Admin configures Default Fields for AP Invoice
        admin_ap_payload = MoreInfoConfigSaveRequest(
            save_as_default=True,
            fields=[
                MoreInfoFieldSaveItem(field_key="invoice_number", label="Invoice Number", category="INVOICE INFORMATION", source="Document", display_order=1, is_visible=True),
                MoreInfoFieldSaveItem(field_key="invoice_date", label="Invoice Date", category="INVOICE INFORMATION", source="Document", display_order=2, is_visible=True),
                MoreInfoFieldSaveItem(field_key="amount", label="Amount", category="FINANCIAL INFORMATION", source="Document", display_order=3, is_visible=True),
                MoreInfoFieldSaveItem(field_key="vendor_name", label="Vendor Name", category="VENDOR INFORMATION", source="Document", display_order=4, is_visible=True),
                MoreInfoFieldSaveItem(field_key="po_number", label="PO Number", category="PURCHASE ORDER", source="ERP", display_order=5, is_visible=True),
            ]
        )
        save_doc_type_more_info_config("AP Invoice", admin_ap_payload, current_user=admin_user, db=db)
        print("  [ADMIN] Saved 5 default fields for 'AP Invoice'")

        # B) Regular User selects additional fields for AP Invoice (e.g. payment_terms, tax_amount) + includes po_number (which is already an admin default)
        user_ap_payload = MoreInfoConfigSaveRequest(
            save_as_default=False,
            fields=[
                MoreInfoFieldSaveItem(field_key="po_number", label="PO Number", category="PURCHASE ORDER", source="ERP", display_order=1, is_visible=True), # duplicate attempt
                MoreInfoFieldSaveItem(field_key="payment_terms", label="Payment Terms", category="PAYMENT", source="ERP", display_order=2, is_visible=True),
                MoreInfoFieldSaveItem(field_key="tax_amount", label="Tax Amount", category="FINANCIAL INFORMATION", source="Document", display_order=3, is_visible=True),
            ]
        )
        save_doc_type_more_info_config("AP Invoice", user_ap_payload, current_user=regular_user, db=db)
        print("  [USER] Saved additional fields for 'AP Invoice' (with duplicate po_number)")

        # C) Retrieve More Info Config as Regular User
        config_resp = get_doc_type_more_info_config("AP Invoice", current_user=regular_user, db=db)
        print(f"  [CONFIG RESPONSE] Admin Default Fields ({len(config_resp.admin_default_fields)}): {[f.field_key for f in config_resp.admin_default_fields]}")
        print(f"  [CONFIG RESPONSE] User Selected Fields ({len(config_resp.user_selected_fields)}): {[f.field_key for f in config_resp.user_selected_fields]}")

        # Check deduplication: po_number must be in admin_default_fields, but NOT duplicated in user_selected_fields
        admin_keys = [f.field_key for f in config_resp.admin_default_fields]
        user_keys = [f.field_key for f in config_resp.user_selected_fields]

        assert "po_number" in admin_keys, "'po_number' should be in admin_default_fields"
        assert "po_number" not in user_keys, "'po_number' should be excluded from user_selected_fields as it is already an admin default!"
        assert "payment_terms" in user_keys, "'payment_terms' should be in user_selected_fields"
        assert "tax_amount" in user_keys, "'tax_amount' should be in user_selected_fields"

        # Verify all fields merged in total configuration:
        all_resolved = config_resp.selected_fields
        resolved_keys = [f.field_key for f in all_resolved]
        print(f"  [RESOLVED DOC FIELDS] Total visible fields for doc: {resolved_keys}")
        assert len(resolved_keys) == len(set(resolved_keys)), "Resolved fields list MUST contain unique field_keys without duplicates!"

        # -------------------------------------------------------------
        # STEP 4: Condition Builder / Rules Engine Evaluation
        # -------------------------------------------------------------
        print("\n--- STEP 4: Testing Condition Builder on Dynamic Real Columns ---")

        # Test condition on credit_note_number (Credit Note #1)
        cn1_doc = synced_docs[2]
        rule_condition_cn = {
            "field": "credit_note_number",
            "operator": "equals",
            "value": "CN-2026-001"
        }
        res_cn = match_condition(rule_condition_cn, cn1_doc)
        print(f"  Condition 'credit_note_number equals CN-2026-001' on CN #1 -> Result: {res_cn}")
        assert res_cn is True, "Condition evaluation on dynamic column 'credit_note_number' should return True"

        # Test condition on expense_type (HR Expense #1)
        rule_condition_hre = {
            "field": "expense_type",
            "operator": "contains",
            "value": "Travel"
        }
        res_hre = match_condition(rule_condition_hre, hre_doc)
        print(f"  Condition 'expense_type contains Travel' on HR Expense #1 -> Result: {res_hre}")
        assert res_hre is True, "Condition evaluation on dynamic column 'expense_type' should return True"

        # Test condition on amount > 10000 on AP Invoice #1
        ap1_doc = synced_docs[0]
        rule_condition_ap = {
            "field": "amount",
            "operator": "greater than",
            "value": 10000
        }
        res_ap = match_condition(rule_condition_ap, ap1_doc)
        print(f"  Condition 'amount > 10000' on AP Invoice #1 -> Result: {res_ap}")
        assert res_ap is True, "Condition evaluation on 'amount' should return True"

        print("\n" + "=" * 70)
        print("ALL TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    except Exception as e:
        print(f"\n[TEST ERROR]: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
