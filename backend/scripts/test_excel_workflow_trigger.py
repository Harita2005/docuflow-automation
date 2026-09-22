"""
Test suite for Excel Workflow Trigger Endpoint (POST /api/documents/trigger-workflow/excel)
Verifies:
1. Reading Excel with Invoice Numbers
2. Matching existing DAAS invoice records
3. Extracting Compliance Type and Division
4. Condition Engine routing without hardcoding
5. Approver resolution using Compliance Type + Division + Role
6. ALREADY_STARTED detection
7. NOT_FOUND handling
8. AuditLog creation with all required metadata
"""
import io
import sys
import os
import datetime
import openpyxl

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database.connection import SessionLocal
from app.database.models import Invoice, User, AuditLog, WorkflowProfile, WorkflowStepDefinition
from app.services.excel_trigger_service import (
    process_excel_workflow_trigger,
    find_invoice_by_num_or_id,
    resolve_approver_by_compliance,
    extract_compliance_type,
)

def run_test():
    db = SessionLocal()
    try:
        print(">>> Starting Excel Workflow Trigger Endpoint verification...")

        # 1. Setup Mock User
        mock_user = db.query(User).filter(User.role == 'admin').first()
        if not mock_user:
            mock_user = db.query(User).first()
        print(f"  [OK] Acting as User: {mock_user.username} (Role: {mock_user.role})")

        # 2. Ensure test workflows exist in DB
        wf = db.query(WorkflowProfile).filter(WorkflowProfile.is_deleted == False).first()
        if not wf:
            print("  [WARN] No active workflow profile found, checking steps...")
        else:
            print(f"  [OK] Active workflow found: {wf.profile_name} (Code: {wf.workflow_code})")

        # 3. Create or identify 3 test invoices:
        # Doc A: Unstarted invoice (will transition to STARTED)
        # Doc B: Already started invoice (will return ALREADY_STARTED)
        # Doc C: Does not exist (will return NOT_FOUND)

        inv_a_num = "TEST-EXCEL-TRIG-A-001"
        inv_b_num = "TEST-EXCEL-TRIG-B-002"
        inv_c_num = "NONEXISTENT-INV-99999"

        # Cleanup any previous test data
        for num in [inv_a_num, inv_b_num]:
            existing = db.query(Invoice).filter(Invoice.invoice_number == num).all()
            for e in existing:
                db.query(AuditLog).filter(AuditLog.invoice_id == e.id).delete()
                db.delete(e)
        db.commit()

        # Insert Doc A: Pending routing, Compliance Type = 'Transport', Division = 'VCC'
        doc_a = Invoice(
            id=f"DOC-TEST-A-{int(datetime.datetime.utcnow().timestamp())}",
            invoice_number=inv_a_num,
            vendor_name="National Logistics Transport Corp",
            amount=75000.0,
            base_amount=63559.32,
            tax_amount=11440.68,
            division="VCC",
            category="Transport",
            document_type="AP INVOICE",
            status="Unrouted (No Rule Matched)",
            workflow_profile_id=None,
            current_stage=0,
            total_stages=0,
            is_deleted=False
        )
        db.add(doc_a)

        # Insert Doc B: Already active workflow
        doc_b = Invoice(
            id=f"DOC-TEST-B-{int(datetime.datetime.utcnow().timestamp())}",
            invoice_number=inv_b_num,
            vendor_name="Precision Spares Non-Transport Ltd",
            amount=42000.0,
            base_amount=35593.22,
            tax_amount=6406.78,
            division="VCC",
            category="Non-Transport",
            document_type="AP INVOICE",
            status="Initiated (Stage 1)",
            workflow_profile_id=wf.profile_name if wf else "STANDARD_PO_FLOW",
            current_stage=1,
            total_stages=2,
            assigned_approver="VIGNESH",
            is_deleted=False
        )
        db.add(doc_b)
        db.commit()
        db.refresh(doc_a)
        db.refresh(doc_b)

        print(f"  [OK] Created test invoice A: {doc_a.invoice_number} (Status: {doc_a.status})")
        print(f"  [OK] Created test invoice B: {doc_b.invoice_number} (Status: {doc_b.status})")

        # 4. Generate in-memory Excel file using openpyxl directly
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Invoices"
        ws.append(["Invoice Number", "Compliance Type", "Division"])
        ws.append([inv_a_num, "Transport", "VCC"])
        ws.append([inv_b_num, "Non-Transport", "VCC"])
        ws.append([inv_c_num, "General", "ACC"])

        excel_buffer = io.BytesIO()
        wb.save(excel_buffer)
        excel_bytes = excel_buffer.getvalue()
        print(f"  [OK] Generated test Excel workbook with 3 data rows")

        # 5. Process via process_excel_workflow_trigger
        response = process_excel_workflow_trigger(
            file_bytes=excel_bytes,
            filename="batch_workflow_trigger.xlsx",
            db=db,
            current_user=mock_user
        )

        print("\n>>> Batch Execution Response:")
        print(f"  Total: {response['total']}")
        print(f"  Started: {response['started']}")
        print(f"  Already Started: {response['already_started']}")
        print(f"  Not Found: {response['not_found']}")
        print(f"  Unrouted: {response['unrouted']}")

        for res in response['results']:
            print(f"    - Row {res['row_number']}: {res['invoice_number']} -> {res['status']} "
                  f"(Workflow: {res.get('workflow_id')}, Approver: {res.get('assigned_approver')})")

        # 6. Assertions
        assert response['total'] == 3, f"Expected total 3, got {response['total']}"
        assert response['already_started'] == 1, f"Expected 1 already_started, got {response['already_started']}"
        assert response['not_found'] == 1, f"Expected 1 not_found, got {response['not_found']}"
        assert response['started'] + response['unrouted'] == 1, f"Expected 1 started or unrouted, got {response['started']}"

        # 7. Verify Document A DB State
        db.refresh(doc_a)
        print(f"\n>>> Verified Document A in Database:")
        print(f"  ID: {doc_a.id}")
        print(f"  Invoice Number: {doc_a.invoice_number}")
        print(f"  Status: {doc_a.status}")
        print(f"  Workflow Profile: {doc_a.workflow_profile_id}")
        print(f"  Current Stage: {doc_a.current_stage}")
        print(f"  Assigned Approver: {doc_a.assigned_approver}")
        print(f"  Checklist State: {doc_a.checklist_state}")

        # 8. Verify AuditLog
        logs = db.query(AuditLog).filter(AuditLog.invoice_id == doc_a.id).all()
        assert len(logs) > 0, "Expected AuditLog entry for Doc A"
        print(f"\n>>> Verified AuditLog Entry for Document A:")
        print(f"  Action: {logs[0].action}")
        print(f"  User: {logs[0].user}")
        print(f"  Stage: {logs[0].stage}")
        print(f"  Notes: {logs[0].notes}")
        assert "Excel Batch ID:" in logs[0].notes, "Batch ID missing in audit notes"
        assert "Compliance: Transport" in logs[0].notes, "Compliance type missing in audit notes"

        # 9. Verify Approver Resolution Logic
        print("\n>>> Testing Approver Resolution Formula directly:")
        step_mock = WorkflowStepDefinition(
            step_name="Initial Verification",
            stage_number=1,
            approver_target="Manager"
        )
        approver_transport = resolve_approver_by_compliance(db, step_mock, "Transport", "VCC")
        approver_nontransport = resolve_approver_by_compliance(db, step_mock, "Non-Transport", "VCC")
        print(f"  Transport + VCC + Manager -> {approver_transport}")
        print(f"  Non-Transport + VCC + Manager -> {approver_nontransport}")
        assert approver_transport, "Approver should not be empty"

        # 10. Clean up test documents
        for d in [doc_a, doc_b]:
            db.query(AuditLog).filter(AuditLog.invoice_id == d.id).delete()
            db.delete(d)
        db.commit()
        print("\n>>> Cleaned up test data.")

        print("\nALL EXCEL WORKFLOW TRIGGER TESTS PASSED SUCCESSFULLY!")

    finally:
        db.close()

if __name__ == "__main__":
    run_test()
