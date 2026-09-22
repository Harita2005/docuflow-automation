import sys
import json
sys.path.insert(0, 'backend')

from app.database.connection import SessionLocal
from app.database.models import Document
from sqlalchemy import text

db = SessionLocal()

print("==================================================")
print("VERIFYING DATABASE RESULT FOR CUSTOMER COMPLAINT")
print("==================================================")

cc_doc = db.query(Document).filter(Document.doc_key == "TEST-CC-COMPLAINT-001").first()

if not cc_doc:
    print("ERROR: TEST-CC-COMPLAINT-001 not found!")
    sys.exit(1)

print(f"Document ID: {cc_doc.id} | Document Type: {cc_doc.document_type}")

req_fields = [
    "account_name", "bp_code", "employee_name", "employee_id",
    "employee_division", "employee_segment", "survey_date",
    "subtype_of_complaint", "additional_comments", "dealer_name",
    "bp_type", "type_of_complaint", "customer_code", "invoice_number",
    "image_1", "image_2", "image_3", "image_4", "image_5"
]

all_real_cols_populated = True
print("\n1. REAL COLUMNS CHECK:")
for field in req_fields:
    val = getattr(cc_doc, field, None)
    if val is not None and str(val).strip() != "":
        print(f"  [OK] REAL column '{field}': '{val}'")
    else:
        print(f"  [FAIL] REAL column '{field}': IS EMPTY/NONE")
        all_real_cols_populated = False

print("\n2. CUSTOM_DATA VERIFICATION:")
custom_data = cc_doc.custom_data
print(f"  Raw custom_data value: {custom_data}")

cd_clean = True
if custom_data:
    try:
        cd_obj = json.loads(custom_data) if isinstance(custom_data, str) else custom_data
        for field in req_fields:
            if field in cd_obj or field.replace('_', ' ') in cd_obj or field.replace('_', '').lower() in [k.replace('_', '').lower() for k in cd_obj.keys()]:
                print(f"  [FAIL] Found field '{field}' duplicated inside custom_data!")
                cd_clean = False
    except Exception as e:
        print(f"  Error parsing custom_data: {e}")

if cd_clean and (custom_data is None or custom_data == "" or custom_data == "{}"):
    print("  [OK] custom_data is CLEAN / NONE (No duplicate fields present).")

print("\n==================================================")
print("VERIFYING OTHER DOCUMENT TYPES")
print("==================================================")

other_keys = ["TEST-AP-001", "TEST-AP-002", "TEST-CRN-001", "TEST-CRN-002", "TEST-HR-001"]
for k in other_keys:
    d = db.query(Document).filter(Document.doc_key == k).first()
    if d:
        print(f"Document Key: {d.doc_key} | ID: {d.id} | Type: {d.document_type} | Vendor: {d.vendor_name} | Amount: {d.amount} | custom_data: {d.custom_data}")

db.close()
