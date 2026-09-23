import sys
sys.path.insert(0, 'backend')

from app.database.connection import SessionLocal
from app.database.models import Document
from app.routers.sync import _upsert_single_document
from app.schemas.schemas import DocumentSyncRequest

db = SessionLocal()

# Customer Complaint test payload matching /api/sync/record
payload = {
    "DocKey": "TEST-MINIMAL-COMPLAINT-999",
    "TransType": "CUSTOMER COMPLAINT",
    "Account Name": "A.P.S & Co",
    "Business Partner Code": "BP-9988",
    "Employee Name": "John Doe",
    "Employee ID": "EMP-101",
    "Employee Division": "VCC",
    "Employee Segment": "Retail",
    "Survey Date": "2026-03-21",
    "Subtype of complaint": "Defect",
    "Additional Comments": "Urgent minimal sync test",
    "Dealer/Distributor Name": "Metro Distributors",
    "BP Type": "Vendor",
    "Type of Complaint": "Product Quality",
    "Customer Code": "CUST-99",
    "Invoice Number": "INV-MINIMAL-999",
    "DocTotal": 5000.00,
    "CompanyCode": "VCC",
    "Image 1": "https://storage.docuflow.internal/img1.jpg",
    "Image 2": "https://storage.docuflow.internal/img2.jpg",
    "Image 3": "https://storage.docuflow.internal/img3.jpg",
    "Image 4": "https://storage.docuflow.internal/img4.jpg",
    "Image 5": "https://storage.docuflow.internal/img5.jpg"
}

req = DocumentSyncRequest.model_validate(payload)
doc = _upsert_single_document(req, db)
db.commit()

print("==================================================")
print("VERIFICATION RESULTS FOR /api/sync/record")
print("==================================================")
print(f"Record Created in Documents table -> ID: {doc.id} | Document Type: {doc.document_type} | Status: {doc.status}")

fields_to_check = [
    ("account_name", doc.account_name),
    ("bp_code", doc.bp_code),
    ("employee_name", doc.employee_name),
    ("employee_id", doc.employee_id),
    ("employee_division", doc.employee_division),
    ("employee_segment", doc.employee_segment),
    ("survey_date", doc.survey_date),
    ("subtype_of_complaint", doc.subtype_of_complaint),
    ("additional_comments", doc.additional_comments),
    ("dealer_name", doc.dealer_name),
    ("bp_type", doc.bp_type),
    ("type_of_complaint", doc.type_of_complaint),
    ("customer_code", doc.customer_code),
    ("invoice_number", doc.invoice_number),
    ("image_1", doc.image_1),
    ("image_2", doc.image_2),
    ("image_3", doc.image_3),
    ("image_4", doc.image_4),
    ("image_5", doc.image_5),
]

all_real_ok = True
print("\n1. REAL COLUMNS POPULATION CHECK:")
for field_name, val in fields_to_check:
    if val is not None and str(val).strip() != "":
        print(f"  [OK] REAL column '{field_name}' = '{val}'")
    else:
        print(f"  [FAIL] REAL column '{field_name}' is empty")
        all_real_ok = False

print("\n2. CUSTOM_DATA DUPLICATION CHECK:")
raw_custom = doc.custom_data
print(f"  custom_data value: {raw_custom}")
if raw_custom is None or raw_custom == "" or raw_custom == "{}":
    print("  [OK] custom_data is None/clean. Zero duplicate fields stored.")
else:
    print(f"  [WARNING] custom_data is not empty: {raw_custom}")

print("\n3. DOCUMENTS TABLE INTEGRITY CHECK:")
db_record = db.query(Document).filter(Document.id == doc.id).first()
if db_record and db_record.is_deleted == False:
    print(f"  [OK] Document record '{doc.id}' appears normally in Documents query.")

db.close()
