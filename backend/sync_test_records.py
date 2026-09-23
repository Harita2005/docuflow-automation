import sys
sys.path.insert(0, 'backend')

from app.database.connection import SessionLocal
from app.routers.sync import _upsert_single_document
from app.schemas.schemas import DocumentSyncRequest

db = SessionLocal()

test_payloads = [
    # 1. AP Invoice 1
    {
        "DocKey": "TEST-AP-001",
        "TransType": "AP INVOICE",
        "DocRefNo": "INV-AP-1001",
        "CardName": "Supreme Logistics Ltd",
        "CardCode": "VEND-AP-001",
        "GSTIN": "27AAACS1234A1Z5",
        "DocTotal": 45000.00,
        "CompanyCode": "VCC",
        "PaymentTerms": "Net 30 Days"
    },
    # 2. AP Invoice 2
    {
        "DocKey": "TEST-AP-002",
        "TransType": "AP INVOICE",
        "DocRefNo": "INV-AP-1002",
        "CardName": "Acme Industrial Supplies",
        "CardCode": "VEND-AP-002",
        "GSTIN": "27AAACS5678B1Z6",
        "DocTotal": 125000.00,
        "CompanyCode": "VCC",
        "PaymentTerms": "Net 45 Days"
    },
    # 3. Credit Note 1
    {
        "DocKey": "TEST-CRN-001",
        "TransType": "CREDIT NOTE",
        "DocRefNo": "CRN-2026-001",
        "credit_note_number": "CRN-2026-001",
        "reason_for_credit": "Damaged Goods Return",
        "original_invoice_ref": "INV-AP-1001",
        "DocTotal": 15000.00,
        "CompanyCode": "VCC",
        "CardName": "Supreme Logistics Ltd"
    },
    # 4. Credit Note 2
    {
        "DocKey": "TEST-CRN-002",
        "TransType": "CREDIT NOTE",
        "DocRefNo": "CRN-2026-002",
        "credit_note_number": "CRN-2026-002",
        "reason_for_credit": "Pricing Rebate Adjustment",
        "original_invoice_ref": "INV-AP-1002",
        "DocTotal": 8500.00,
        "CompanyCode": "VCC",
        "CardName": "Acme Industrial Supplies"
    },
    # 5. HR Expense 1
    {
        "DocKey": "TEST-HR-001",
        "TransType": "HR EXPENSE",
        "DocRefNo": "EXP-2026-501",
        "employee_name": "Jane Smith",
        "expense_type": "Travel & Lodging Allowance",
        "department": "Sales & Operations",
        "DocTotal": 18500.00,
        "CompanyCode": "VCC"
    },
    # 6. Customer Complaint (All 19 required fields tested!)
    {
        "DocKey": "TEST-CC-COMPLAINT-001",
        "TransType": "CUSTOMER COMPLAINT",
        "Account Name": "A.P.S & Co",
        "Business Partner Code": "BP-9988",
        "Employee Name": "John Doe",
        "Employee ID": "EMP-101",
        "Employee Division": "VCC",
        "Employee Segment": "Retail",
        "Survey Date": "2026-03-21",
        "Subtype of complaint": "Defect",
        "Additional Comments": "Urgent resolution required",
        "Dealer/Distributor Name": "Metro Distributors",
        "BP Type": "Vendor",
        "Type of Complaint": "Product Quality",
        "Customer Code": "CUST-99",
        "Invoice Number": "INV-FEEDBACK-999",
        "DocTotal": 5000.00,
        "CompanyCode": "VCC",
        "Image 1": "https://storage.docuflow.internal/img1.jpg",
        "Image 2": "https://storage.docuflow.internal/img2.jpg",
        "Image 3": "https://storage.docuflow.internal/img3.jpg",
        "Image 4": "https://storage.docuflow.internal/img4.jpg",
        "Image 5": "https://storage.docuflow.internal/img5.jpg"
    }
]

synced_docs = []
for p in test_payloads:
    req = DocumentSyncRequest.model_validate(p)
    doc = _upsert_single_document(req, db)
    synced_docs.append(doc)
    print(f"Synced [{doc.document_type}] ID: {doc.id} | Key: {doc.doc_key} | Status: {doc.status}")

db.close()
