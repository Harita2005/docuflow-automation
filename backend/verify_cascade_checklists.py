import sys
from pathlib import Path
from sqlalchemy.orm import Session

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from app.database import SessionLocal
from app.models import Invoice, ChecklistRule, ChecklistTemplate
from app.routers.invoices import resolve_checklist_items

def test_cascading_checklists():
    db: Session = SessionLocal()
    try:
        print("==================================================================")
        print("      TESTING 3-TIER HIERARCHICAL CASCADING CHECKLIST RESOLUTION ")
        print("==================================================================")

        # Test Case 1: Specific Condition Match (Company=ACM, Category=GRN Header, Stage=Attachment Status)
        inv1 = Invoice(
            id="TEST-ACM-GRN",
            division="ACM",
            category="GRN Header",
            document_type="GRN Header",
            workflow_profile_id="ACM_GRN_Header_2stages"
        )
        items1 = resolve_checklist_items(db, inv1, "Attachment Status")
        print(f"\n[Test 1] Company: ACM | Category: GRN Header | Stage: Attachment Status")
        print(f"-> Resolved {len(items1)} items (Specific Category/Company Condition Rules):")
        for it in items1[:5]:
            print(f"   [OK] {it}")
        if len(items1) > 5:
            print(f"   ... and {len(items1)-5} more items")
        assert len(items1) > 0

        # Test Case 2: Specific Condition Match for VCC (Company=VCC, Category=Freight Charges, Stage=Attachment Status)
        inv2 = Invoice(
            id="TEST-VCC-FREIGHT",
            division="VCC",
            category="Freight Charges",
            document_type="Freight Charges",
            workflow_profile_id="VCC_DA_IA_FLOW"
        )
        items2 = resolve_checklist_items(db, inv2, "Attachment Status")
        print(f"\n[Test 2] Company: VCC | Category: Freight Charges | Stage: Attachment Status")
        print(f"-> Resolved {len(items2)} items (VCC Category Condition Rules):")
        for it in items2[:5]:
            print(f"   [OK] {it}")
        if len(items2) > 5:
            print(f"   ... and {len(items2)-5} more items")
        assert len(items2) > 0

        # Test Case 3: Workflow Fallback Match (Unmatched Category, matching Workflow Profile template)
        inv3 = Invoice(
            id="TEST-WF-FALLBACK",
            division="XYZ_UNKNOWN",
            category="Nonexistent_Category_ABC",
            document_type="Nonexistent_Category_ABC",
            workflow_profile_id="AP_Inv_DocAppFlow_DA_IA_FA_3_W-C"
        )
        items3 = resolve_checklist_items(db, inv3, "Final Approval")
        print(f"\n[Test 3] Unknown Category | Workflow: AP_Inv_DocAppFlow_DA_IA_FA_3_W-C | Stage: Final Approval")
        print(f"-> Resolved {len(items3)} items (Workflow Default Fallback from Sheet 4):")
        for it in items3:
            print(f"   [OK] {it}")
        assert len(items3) > 0

        print("\n==================================================================")
        print(">>> ALL 3 CASCADING CHECKLIST RESOLUTION TESTS PASSED 100%!")
        print("==================================================================")

    finally:
        db.close()

if __name__ == "__main__":
    test_cascading_checklists()
