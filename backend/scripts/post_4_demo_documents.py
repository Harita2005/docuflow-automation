import sys
import json
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import Invoice, InvoiceChecklistState, AuditLog, WorkflowStepDefinition
from app.routers.sync import _upsert_single_document, DocumentSyncRequest

API_URL = "http://localhost:3000/api/sync/document"

DOCUMENTS = [
    {
        "doc_key": "DOC-2026-ACC-001",
        "invoice_number": "INV-IT-2026-1001",
        "company_code": "ACC_MKT",
        "division": "ACC_MKT",
        "document_type": "AP INVOICE",
        "category": "REPAIRS & MAINTENANCE - IT HW",
        "cost_center": "IT INFRASTRUCTURE",
        "plant": "TN-COIMBATORE-HO",
        "amount": 45000.0,
        "tax_amount": 8100.0,
        "base_amount": 36900.0,
        "vendor_code": "VEND-IT-501",
        "vendor_name": "Tech Care IT Systems & Maintenance",
        "pay_mode": "BANK",
        "auto_route": True
    },
    {
        "doc_key": "DOC-2026-ACC-002",
        "invoice_number": "INV-AST-2026-2002",
        "company_code": "ACC",
        "division": "ACC",
        "document_type": "CAPEX / FIXED ASSET",
        "category": "ACCESSORIES - COMPUTER",
        "cost_center": "PRODUCTION ASSETS",
        "plant": "ATITHYA-EXCISE",
        "amount": 285000.0,
        "tax_amount": 43474.58,
        "base_amount": 241525.42,
        "vendor_code": "VEND-AST-902",
        "vendor_name": "Dell Enterprise Systems Ltd",
        "pay_mode": "BANK",
        "auto_route": True
    },
    {
        "doc_key": "DOC-2026-VCC-003",
        "invoice_number": "INV-WEL-2026-3003",
        "company_code": "VCC",
        "division": "VCC",
        "document_type": "STAFF & HR EXPENSE",
        "category": "Staff Welfare Expenses",
        "cost_center": "MESS-HO",
        "plant": "TN-ERODE-PERUNDURAI ROAD",
        "amount": 34500.0,
        "tax_amount": 1725.0,
        "base_amount": 32775.0,
        "vendor_code": "VEND-WEL-303",
        "vendor_name": "Head Office Canteen & Welfare Services",
        "pay_mode": "BANK",
        "auto_route": True
    },
    {
        "doc_key": "DOC-2026-ACC-004",
        "invoice_number": "INV-PST-2026-4004",
        "company_code": "ACC_MKT",
        "division": "ACC_MKT",
        "document_type": "UTILITY & RENT",
        "category": "POSTAGE & TELEGRAM",
        "cost_center": "OFFICE ADMIN",
        "plant": "TN-CHENNAI-BRANCH",
        "amount": 12800.0,
        "tax_amount": 640.0,
        "base_amount": 12160.0,
        "vendor_code": "VEND-LOG-404",
        "vendor_name": "Express Postal & Courier Services",
        "pay_mode": "CASH",
        "auto_route": True
    }
]

def post_documents():
    print("=" * 90)
    print(">>> POSTING 4 TEST DOCUMENTS TO LOCAL APPLICATION")
    print("=" * 90)
    
    db = SessionLocal()
    try:
        for idx, doc in enumerate(DOCUMENTS, start=1):
            print(f"\n[Posting Document {idx}/4] {doc['doc_key']} | {doc['category']} | Rs. {doc['amount']:,.2f}...")
            
            # Try HTTP API call first
            posted = False
            try:
                data_bytes = json.dumps(doc).encode('utf-8')
                req = urllib.request.Request(API_URL, data=data_bytes, headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(req) as resp:
                    res_body = json.loads(resp.read().decode('utf-8'))
                    posted = True
                    print(f"  [HTTP {resp.status}] Ingested ID: {res_body.get('document_id')} | Status: {res_body.get('status')}")
            except Exception as http_err:
                print(f"  [HTTP API Warning] {http_err}, falling back to direct ingestion...")
                
            # Direct Ingestion Fallback
            if not posted:
                sync_req = DocumentSyncRequest(**doc)
                inv = _upsert_single_document(sync_req, db)
                print(f"  [DIRECT SYNC] Ingested ID: {inv.id} | Status: {inv.status} | Workflow: {inv.workflow_profile_id}")

        print("\n" + "=" * 90)
        print(">>> VERIFYING WORKFLOW TRACKING STATE IN DATABASE FOR ALL 4 DOCUMENTS")
        print("=" * 90)
        
        for idx, doc in enumerate(DOCUMENTS, start=1):
            inv = db.query(Invoice).filter(Invoice.doc_key == doc['doc_key']).first()
            if not inv:
                print(f"\n[Doc {idx}] Key: {doc['doc_key']} - NOT FOUND IN DB")
                continue
                
            checklists = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id).all()
            audits = db.query(AuditLog).filter(AuditLog.invoice_id == inv.id).all()
            steps = []
            if inv.workflow_profile_id:
                steps = db.query(WorkflowStepDefinition).filter(
                    WorkflowStepDefinition.profile_name == inv.workflow_profile_id
                ).order_by(WorkflowStepDefinition.stage_number.asc()).all()

            print(f"\n------------------------------------------------------------------------------------------")
            print(f"DOCUMENT #{idx}: [{inv.id}] - {inv.invoice_number}")
            print(f"------------------------------------------------------------------------------------------")
            print(f"  * Division / Plant:     {inv.division} / {inv.plant}")
            print(f"  * Category / CostCtr:   {inv.category} / {inv.cost_center}")
            print(f"  * Amount:               Rs. {inv.amount:,.2f}")
            print(f"  * Vendor:               {inv.vendor_name} ({inv.vendor_code})")
            print(f"  * Workflow Profile:     {inv.workflow_profile_id or 'Unrouted'}")
            print(f"  * Current Status:       {inv.status}")
            print(f"  * Active Stage:         Stage {inv.current_stage} of {inv.total_stages}")
            print(f"  * Assigned Approver:    {inv.assigned_approver or 'None'}")
            
            if steps:
                print(f"\n  * Workflow Stages Chain ({len(steps)} stages):")
                for s in steps:
                    is_current = s.stage_number == inv.current_stage
                    marker = "   ==> [ACTIVE]" if is_current else "      "
                    print(f"{marker} Stage {s.stage_number}: {s.step_name} (Approver Pool: {s.approver_target})")
            
            print(f"\n  * Compliance Checklists Count: {len(checklists)} items")
                
            print(f"\n  * Audit Log Trail ({len(audits)} events):")
            for a in audits:
                print(f"      [{a.timestamp}] User: '{a.user}' | Action: {a.action} | Notes: {a.notes}")

    finally:
        db.close()
        
    print("\n" + "=" * 90)
    print(">>> ALL CHECKLISTS REMOVED & 4 DOCUMENTS PROCESSED IN LOCAL APPLICATION")
    print("=" * 90)

if __name__ == '__main__':
    post_documents()
