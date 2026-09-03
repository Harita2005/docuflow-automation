"""
Seed 5 Fresh Demo Documents for Live Presentation
Creates 5 new invoices at Stage 1 (Initiated / Attachment Status) assigned to YUVASREE.
"""
import sys
import os
import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import Document, WorkflowProfile, WorkflowStepDefinition, AuditLog

def seed_five_demo_documents():
    db = SessionLocal()
    print("==================================================================")
    print(">>> SEEDING 5 NEW DEMO DOCUMENTS FOR STAGE 1 (YUVASREE)")
    print("==================================================================")

    # Get active workflow profile fallback
    wf_profile = db.query(WorkflowProfile).filter(WorkflowProfile.is_deleted == False).first()
    wf_profile_id = wf_profile.profile_name if wf_profile else "VCC_DocApprovalFlow_All5_W-A"

    today_str = datetime.date.today().strftime("%Y-%m-%d")
    timestamp_suffix = datetime.datetime.now().strftime("%M%S")

    demo_docs_data = [
        {
            "id": f"DEMO-DOC-101-{timestamp_suffix}",
            "doc_num": f"INV-2026-101-{timestamp_suffix}",
            "invoice_number": f"INV-2026-101-{timestamp_suffix}",
            "party_name": "Ramraj Cotton Mills Pvt Ltd",
            "vendor_name": "Ramraj Cotton Mills Pvt Ltd",
            "party_code": "V-1001",
            "vendor_code": "V-1001",
            "amount": 125000.00,
            "base_amount": 105932.20,
            "tax_amount": 19067.80,
            "document_type": "AP INVOICE",
            "category": "Raw Cotton Purchase",
            "division": "VCC",
            "cost_center": "CC-FABRIC",
            "plant": "TIRUPUR PLANT",
            "file_url": "/uploads/sample_invoice.pdf"
        },
        {
            "id": f"DEMO-DOC-102-{timestamp_suffix}",
            "doc_num": f"INV-2026-102-{timestamp_suffix}",
            "invoice_number": f"INV-2026-102-{timestamp_suffix}",
            "party_name": "TexTech Machinery Spares",
            "vendor_name": "TexTech Machinery Spares",
            "party_code": "V-1002",
            "vendor_code": "V-1002",
            "amount": 48500.00,
            "base_amount": 41101.69,
            "tax_amount": 7398.31,
            "document_type": "CAPEX / FIXED ASSET",
            "category": "Weaving Machine Spare Parts",
            "division": "VCC",
            "cost_center": "CC-MAINT",
            "plant": "COIMBATORE MILL",
            "file_url": "/uploads/sample_invoice.pdf"
        },
        {
            "id": f"DEMO-DOC-103-{timestamp_suffix}",
            "doc_num": f"INV-2026-103-{timestamp_suffix}",
            "invoice_number": f"INV-2026-103-{timestamp_suffix}",
            "party_name": "Express Logistics & Freight Solution",
            "vendor_name": "Express Logistics & Freight Solution",
            "party_code": "V-1003",
            "vendor_code": "V-1003",
            "amount": 32000.00,
            "base_amount": 27118.64,
            "tax_amount": 4881.36,
            "document_type": "FREIGHT & LOGISTICS",
            "category": "Inter-Unit Freight Charges",
            "division": "VCC",
            "cost_center": "CC-LOGISTICS",
            "plant": "ERODE WAREHOUSE",
            "file_url": "/uploads/sample_invoice.pdf"
        },
        {
            "id": f"DEMO-DOC-104-{timestamp_suffix}",
            "doc_num": f"INV-2026-104-{timestamp_suffix}",
            "invoice_number": f"INV-2026-104-{timestamp_suffix}",
            "party_name": "Tamil Nadu Electricity Board (TNEB)",
            "vendor_name": "Tamil Nadu Electricity Board (TNEB)",
            "party_code": "V-1004",
            "vendor_code": "V-1004",
            "amount": 89400.00,
            "base_amount": 89400.00,
            "tax_amount": 0.00,
            "document_type": "UTILITY & RENT",
            "category": "Factory Electricity Bill - Power",
            "division": "VCC",
            "cost_center": "CC-POWER",
            "plant": "MADURAI UNIT",
            "file_url": "/uploads/sample_invoice.pdf"
        },
        {
            "id": f"DEMO-DOC-105-{timestamp_suffix}",
            "doc_num": f"INV-2026-105-{timestamp_suffix}",
            "invoice_number": f"INV-2026-105-{timestamp_suffix}",
            "party_name": "Surya Packaging Solutions",
            "vendor_name": "Surya Packaging Solutions",
            "party_code": "V-1005",
            "vendor_code": "V-1005",
            "amount": 15600.00,
            "base_amount": 13220.34,
            "tax_amount": 2379.66,
            "document_type": "E-VOUCHER",
            "category": "Garment Corrugated Box Packing",
            "division": "VCC",
            "cost_center": "CC-PACKING",
            "plant": "TIRUPUR PLANT",
            "file_url": "/uploads/sample_invoice.pdf"
        }
    ]

    created_ids = []
    for data in demo_docs_data:
        doc = Document(
            id=data["id"],
            doc_key=data["id"],
            doc_num=data["doc_num"],
            invoice_number=data["invoice_number"],
            doc_date=today_str,
            invoice_date=today_str,
            party_name=data["party_name"],
            vendor_name=data["vendor_name"],
            party_code=data["party_code"],
            vendor_code=data["vendor_code"],
            amount=data["amount"],
            base_amount=data["base_amount"],
            tax_amount=data["tax_amount"],
            currency="INR",
            document_type=data["document_type"],
            category=data["category"],
            division=data["division"],
            cost_center=data["cost_center"],
            plant=data["plant"],
            status="Initiated (Attachment Status)",
            current_stage=1,
            total_stages=4,
            assigned_approver="YUVASREE",
            workflow_profile_id=wf_profile_id,
            is_deleted=False,
            file_url=data["file_url"]
        )
        db.add(doc)
        db.flush()

        # Add Audit Log
        db.add(AuditLog(
            invoice_id=doc.id,
            user="Document Uploader",
            action="Created & Uploaded",
            stage="Stage 1",
            notes=f"Demo document uploaded and assigned to Stage 1 pool 'YUVASREE' under workflow '{wf_profile_id}'."
        ))
        created_ids.append(doc.id)

    db.commit()
    db.close()

    print(f"[SUCCESS] Successfully created 5 new demo documents assigned to YUVASREE:")
    for doc_id in created_ids:
        print(f"  - Document ID: {doc_id}")

if __name__ == "__main__":
    seed_five_demo_documents()
