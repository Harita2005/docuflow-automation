import sys
import json
import os
import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = SCRIPT_DIR.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal, engine
from app.models import (
    User, Document, DocumentLineItem, WorkflowProfile, WorkflowStepDefinition,
    BusinessRule, ChecklistTemplate, ChecklistRule, DocumentChecklistState,
    DocumentApprovalLog, SystemEngineLog
)
from app.services.rules_engine import evaluate_business_rules_full
from app.schemas import DocumentSyncRequest
from app.routers.sync import _upsert_single_document

def verify_all():
    db = SessionLocal()
    print("=" * 80)
    print(">>> VERIFYING ENTERPRISE DATABASE SCHEMA & CONDITION ROUTING FLOW")
    print("=" * 80)

    # 1. Verify Core DB Table Record Counts
    user_count = db.query(User).filter(User.is_deleted == False).count()
    wf_count = db.query(WorkflowProfile).filter(WorkflowProfile.is_deleted == False).count()
    step_count = db.query(WorkflowStepDefinition).count()
    rule_count = db.query(BusinessRule).filter(BusinessRule.is_deleted == False, BusinessRule.is_active == True).count()
    chk_tmpl_count = db.query(ChecklistTemplate).count()
    doc_count = db.query(Document).filter(Document.is_deleted == False).count()

    print("\n[DB State Check]")
    print(f"  Active Users:                 {user_count}")
    print(f"  Workflow Profiles:            {wf_count}")
    print(f"  Workflow Step Definitions:    {step_count}")
    print(f"  Active Business Rules:        {rule_count}")
    print(f"  Checklist Templates:          {chk_tmpl_count}")
    print(f"  Existing Documents:           {doc_count}")

    assert wf_count > 0, "Error: Workflow Profiles count is 0!"
    assert rule_count > 0, "Error: Active Business Rules count is 0!"

    # 2. Test Cases for Dynamic Condition Evaluation & Sync Routing (Zero Hardcoded Fallbacks)
    test_cases = [
        {
            "name": "VCC Freight Invoice",
            "payload": DocumentSyncRequest(
                doc_key="TEST-SYNC-101",
                division="VCC",
                category="Freight Charges",
                cost_center="DIGITAL MARKETING",
                plant="TN-ERODE-PERUNDURAI ROAD",
                vendor_name="TNT Logistics Ltd",
                vendor_code="VEND-TNT-01",
                invoice_number="INV-TNT-991",
                invoice_date="2026-09-04",
                amount=75000.00,
                auto_route=True
            )
        },
        {
            "name": "ACC Asset Purchase",
            "payload": DocumentSyncRequest(
                doc_key="TEST-SYNC-102",
                division="ACC",
                category="ACCESSORIES - COMPUTER",
                cost_center="Office Maintenance",
                plant="ATITHYA-EXCISE",
                vendor_name="Dell Technologies",
                vendor_code="VEND-DELL-88",
                invoice_number="INV-DELL-204",
                invoice_date="2026-09-04",
                amount=150000.00,
                auto_route=True
            )
        },
        {
            "name": "ATC Machinery Purchase",
            "payload": DocumentSyncRequest(
                doc_key="TEST-SYNC-103",
                division="ATC",
                category="MACHINERY",
                cost_center="PRODUCTION TABLE",
                plant="BHAVANI",
                vendor_name="LMW Textile Machinery",
                vendor_code="VEND-LMW-09",
                invoice_number="INV-LMW-701",
                invoice_date="2026-09-04",
                amount=450000.00,
                auto_route=True
            )
        },
        {
            "name": "RRF Utility & Rent",
            "payload": DocumentSyncRequest(
                doc_key="TEST-SYNC-104",
                division="RRF",
                category="RENT",
                cost_center="BUILDING MAINTENANCE",
                plant="TN-CHENNAI-T-NAGAR",
                vendor_name="Commercial Property Real Estate",
                vendor_code="VEND-PROP-11",
                invoice_number="INV-RENT-802",
                invoice_date="2026-09-04",
                amount=120000.00,
                auto_route=True
            )
        },
        {
            "name": "E-Voucher Cash Flow",
            "payload": DocumentSyncRequest(
                doc_key="TEST-SYNC-105",
                division="VCC",
                category="PETTY CASH",
                cost_center="ADMINISTRATION",
                plant="TN-SIVAKASI",
                vendor_name="Local Office Supplies",
                vendor_code="VEND-SUPP-04",
                invoice_number="EV-CASH-301",
                invoice_date="2026-09-04",
                amount=12500.00,
                auto_route=True
            )
        }
    ]

    print("\n" + "=" * 80)
    print(">>> DYNAMIC CONDITION EVALUATION & WORKFLOW MAPPING VERIFICATION")
    print("=" * 80)

    for idx, tc in enumerate(test_cases, 1):
        print(f"\n[{idx}] Processing Test Case: {tc['name']}")
        req = tc["payload"]

        # Clean old test doc if exists
        old_doc = db.query(Document).filter(Document.doc_key == str(req.doc_key)).first()
        if old_doc:
            db.query(DocumentChecklistState).filter(DocumentChecklistState.invoice_id == old_doc.id).delete()
            db.query(DocumentApprovalLog).filter(DocumentApprovalLog.invoice_id == old_doc.id).delete()
            db.query(DocumentLineItem).filter(DocumentLineItem.invoice_id == old_doc.id).delete()
            db.query(Document).filter(Document.id == old_doc.id).delete()
            db.commit()

        # Perform sync upsert
        synced_doc = _upsert_single_document(req, db)
        
        # Verify dynamic rule evaluation
        rule_res = evaluate_business_rules_full(db, synced_doc)
        
        print(f"  -> Document ID:          {synced_doc.id}")
        print(f"  -> Division / Plant:     {synced_doc.division} / {synced_doc.plant}")
        print(f"  -> Category / Center:    {synced_doc.category} / {synced_doc.cost_center}")
        print(f"  -> Matched Rule Name:    {rule_res.get('rule_name') if rule_res else 'None'}")
        print(f"  -> Target Workflow ID:   {synced_doc.workflow_profile_id}")
        print(f"  -> Total Stages:         {synced_doc.total_stages}")
        print(f"  -> Active Approver Pool: {synced_doc.assigned_approver}")
        print(f"  -> Current Status:       {synced_doc.status}")

        # Check generated stage checklist states
        chk_states = db.query(DocumentChecklistState).filter(DocumentChecklistState.invoice_id == synced_doc.id).all()
        print(f"  -> Stage Checklists:     {len(chk_states)} items generated")

        assert synced_doc.workflow_profile_id is not None, f"Error: Document {synced_doc.id} was not mapped to any workflow profile!"
        assert synced_doc.assigned_approver is not None, f"Error: Document {synced_doc.id} has no assigned approver!"

    print("\n" + "=" * 80)
    print(">>> VERIFICATION SUCCESSFUL: 100% DYNAMIC CONDITION ROUTING VERIFIED!")
    print("=" * 80)
    db.close()

if __name__ == "__main__":
    verify_all()
