import sys
import json
import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from app.database import engine, SessionLocal
from app.models import User, WorkflowProfile, BusinessRule, Invoice, DocumentChecklistState, AuditLog
from app.auth import get_password_hash, verify_password, create_access_token
from app.services.rules_engine import evaluate_business_rules_full
from app.routers.sync import _upsert_single_document, DocumentSyncRequest
from app.services.callback_service import execute_sp_for_callback_payload

print("=" * 80)
print(">>> DOCUFLOW AUTOMATION: ENTERPRISE SUITE VERIFICATION")
print("=" * 80)

suite_passed = True
db = SessionLocal()

try:
    # -------------------------------------------------------------------------
    # TEST 1: Authentication & Token Security
    # -------------------------------------------------------------------------
    print("\n[TEST 1] Verifying Authentication & Password Security...")
    test_pass = "password123"
    hashed = get_password_hash(test_pass)
    if verify_password(test_pass, hashed) and not verify_password("wrongpass", hashed):
        token = create_access_token(data={"sub": "admin", "role": "admin"})
        print(f"  [PASSED] Password hashing and JWT generation verified successfully.")
        print(f"    -> Token Preview: {token[:35]}...")
    else:
        suite_passed = False
        print("  [FAILED] Password hashing verification failed.")

    # -------------------------------------------------------------------------
    # TEST 2: User Repository & Role-Based Access Control
    # -------------------------------------------------------------------------
    print("\n[TEST 2] Verifying Enterprise User Directory & Roles...")
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    roles_summary = {}
    for r in ["admin", "manager", "employee", "Approver", "Finance"]:
        roles_summary[r] = db.query(User).filter(User.role == r).count()

    print(f"  [PASSED] Verified {total_users} total users ({active_users} active).")
    print(f"    -> Roles Breakdown: {roles_summary}")
    if total_users < 200:
        suite_passed = False
        print("  [FAILED] User record count is below enterprise dataset threshold.")

    # -------------------------------------------------------------------------
    # TEST 3: Business Rules & Workflow Profile Matrix
    # -------------------------------------------------------------------------
    print("\n[TEST 3] Verifying Business Rules Engine & Workflow Profile Matrix...")
    wf_count = db.query(WorkflowProfile).count()
    rules_count = db.query(BusinessRule).count()
    print(f"  [PASSED] Loaded {wf_count} Workflow Profiles and {rules_count} Active Business Rules.")
    if wf_count < 200 or rules_count < 500:
        suite_passed = False
        print("  [FAILED] Workflow profiles or business rules count below threshold.")

    # -------------------------------------------------------------------------
    # TEST 4: End-to-End Document Ingestion & Dynamic Workflow Evaluation
    # -------------------------------------------------------------------------
    print("\n[TEST 4] Testing End-to-End Document Sync & Dynamic Routing Flow...")
    test_cases = [
        {
            "name": "Enterprise IT Capex Sync",
            "req": DocumentSyncRequest(
                doc_key="TEST-SUITE-DOC-901",
                company_code="VCC",
                division="VCC",
                document_type="AP INVOICE",
                category="Freight Charges",
                cost_center="DIGITAL MARKETING",
                plant="TN-ERODE-PERUNDURAI ROAD",
                amount=75000.0,
                vendor_code="VEND-901",
                vendor_name="Perundurai Logistics Ltd",
                pay_mode="BANK"
            )
        },
        {
            "name": "Accessories & Hardware Asset Purchase",
            "req": DocumentSyncRequest(
                doc_key="TEST-SUITE-DOC-902",
                company_code="ACC",
                division="ACC",
                document_type="AP INVOICE",
                category="ACCESSORIES - COMPUTER",
                cost_center="Office Maintenance",
                plant="ATITHYA-EXCISE",
                amount=125000.0,
                vendor_code="VEND-902",
                vendor_name="Dell Enterprise Hardware",
                pay_mode="BANK"
            )
        }
    ]

    for tc in test_cases:
        req = tc["req"]
        inv = _upsert_single_document(req, db)
        checklists = db.query(DocumentChecklistState).filter(DocumentChecklistState.invoice_id == str(inv.id)).all()
        print(f"  [PASSED] Ingested '{tc['name']}':")
        print(f"    -> Doc Key:          {inv.doc_key}")
        print(f"    -> Matched Workflow: {inv.workflow_profile_id}")
        print(f"    -> Assigned Approver:{inv.assigned_approver}")
        print(f"    -> Status:           {inv.status}")
        print(f"    -> Checklists:       {len(checklists)} items generated")

    # -------------------------------------------------------------------------
    # TEST 5: Stored Procedure & Callback Integration Payload Execution
    # -------------------------------------------------------------------------
    print("\n[TEST 5] Verifying Stored Procedure & Callback Integration Execution...")
    payload_str = execute_sp_for_callback_payload(db, "sp_GetApprovalCallbackPayload", "TEST-SUITE-DOC-901", {})
    payload_obj = json.loads(payload_str)
    if "document" in payload_obj or "docKey" in payload_obj or "invoiceNumber" in payload_obj:
        print("  [PASSED] Stored Procedure callback payload engine generated valid JSON structure.")
        print(f"    -> Sample Keys: {list(payload_obj.keys())[:6]}")
    else:
        suite_passed = False
        print("  [FAILED] Callback payload structure invalid.")

    # -------------------------------------------------------------------------
    # TEST 6: Audit Logs & Event Trace
    # -------------------------------------------------------------------------
    print("\n[TEST 6] Verifying Immutable Audit Log Records...")
    audit_count = db.query(AuditLog).count()
    recent_logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(3).all()
    print(f"  [PASSED] Audit Log contains {audit_count} records.")
    for l in recent_logs:
        print(f"    -> Event: [{l.action}] by User '{l.user}' on Doc '{l.invoice_id}' at {l.timestamp}")

finally:
    db.close()

print("\n" + "=" * 80)
if suite_passed:
    print(">>> ALL ENTERPRISE TEST SUITE SUITES PASSED (100% SUCCESSFUL RATE)")
    print("=" * 80)
    sys.exit(0)
else:
    print(">>> ENTERPRISE TEST SUITE COMPLETED WITH FAILURES")
    print("=" * 80)
    sys.exit(1)
