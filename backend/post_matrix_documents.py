import sys
import os
import time
import json

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import SessionLocal
from app.database.models import WorkflowProfile, WorkflowStepDefinition, BusinessRule, Invoice
from app.schemas.schemas import DocumentSyncRequest
from app.routers.sync import _upsert_single_document

def setup_workflows_and_rules(db):
    profiles_data = [
        {
            "profile_name": "ACM_KARUMATHAMPATTY_PURCHASE ACCOUNTS",
            "workflow_code": "WF-ACM-001",
            "description": "Workflow for ACM_KARUMATHAMPATTY Purchase Accounts",
            "steps": [
                {"stage_number": 1, "step_name": "First Approval", "approver_type": "Specific Employee", "approver_target": "GOKILAVANI_E23-02049"},
                {"stage_number": 2, "step_name": "Final Approval", "approver_type": "Specific Employee", "approver_target": "EDVINRAJ_E25-00206,NANDHAKUMAR_E25-04023"}
            ],
            "rule_name": "ACM_KARUMATHAMPATTY_PURCHASE ACCOUNTS",
            "conditions": [
                {"field": "Division", "operator": "equals", "value": "ACM_KARUMATHAMPATTY"},
                {"field": "Category", "operator": "equals", "value": "ACCESSORIES AND CONSUMABLES"},
                {"field": "Cost Center", "operator": "equals", "value": "PACKING MATERIAL PURCHASE"}
            ]
        },
        {
            "profile_name": "ACM_SALEM_PURCHASE ACCOUNTS",
            "workflow_code": "WF-ACM-002",
            "description": "Workflow for ACM_SALEM Purchase Accounts",
            "steps": [
                {"stage_number": 1, "step_name": "First Approval", "approver_type": "Specific Employee", "approver_target": "PRIYATHARSHINI_E24-05621"},
                {"stage_number": 2, "step_name": "Final Approval", "approver_type": "Specific Employee", "approver_target": "EDVINRAJ_E25-00206,NANDHAKUMAR_E25-04023"}
            ],
            "rule_name": "ACM_SALEM_PURCHASE ACCOUNTS",
            "conditions": [
                {"field": "Division", "operator": "equals", "value": "ACM_UDAYAPATTY"},
                {"field": "Category", "operator": "equals", "value": "ACCESSORIES AND CONSUMABLES"},
                {"field": "Cost Center", "operator": "equals", "value": "PACKING MATERIAL PURCHASE"}
            ]
        }
    ]

    for data in profiles_data:
        # 1. Profile
        wf = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == data["profile_name"]).first()
        if not wf:
            wf = WorkflowProfile(
                profile_name=data["profile_name"],
                workflow_code=data["workflow_code"],
                description=data["description"],
                workflow_type="PURCHASE INVOICE",
                status="ACTIVE",
                is_deleted=False
            )
            db.add(wf)
            db.commit()
            print(f"[WORKFLOW] Created profile: {data['profile_name']}")
        else:
            wf.status = "ACTIVE"
            wf.is_deleted = False
            db.commit()
            print(f"[WORKFLOW] Profile exists: {data['profile_name']}")

        # 2. Steps
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == data["profile_name"]).delete()
        for s in data["steps"]:
            step_def = WorkflowStepDefinition(
                profile_name=data["profile_name"],
                stage_number=s["stage_number"],
                step_name=s["step_name"],
                approver_type=s["approver_type"],
                approver_target=s["approver_target"],
                document_type="PURCHASE INVOICE",
                action_required="APPROVE"
            )
            db.add(step_def)
        db.commit()
        print(f"[STEPS] Configured steps for {data['profile_name']}")

        # 3. Rule
        cond_json = {
            "match_type": "ALL",
            "condition_type": "Combination Condition",
            "conditions": [
                {**c, "logicalOperator": "AND"} for c in data["conditions"]
            ],
            "settings": {"case_sensitive": False, "null_handling": "Consider as False"}
        }
        br = db.query(BusinessRule).filter(BusinessRule.rule_name == data["rule_name"]).first()
        if not br:
            br = BusinessRule(
                rule_name=data["rule_name"],
                rule_category="WORKFLOW_ROUTING",
                document_type="AP INVOICE",
                priority=100,
                target_workflow_id=data["profile_name"],
                conditions_json=json.dumps(cond_json),
                rule_action="WORKFLOW_ROUTE",
                is_active=True,
                is_deleted=False
            )
            db.add(br)
            print(f"[RULE] Created business rule: {data['rule_name']}")
        else:
            br.target_workflow_id = data["profile_name"]
            br.conditions_json = json.dumps(cond_json)
            br.priority = 100
            br.is_active = True
            br.is_deleted = False
            print(f"[RULE] Updated business rule: {data['rule_name']}")
        db.commit()

def post_matrix_documents(db):
    ts = int(time.time())
    docs_to_post = [
        # Row 1: ACM_KARUMATHAMPATTY (2 docs)
        {
            "doc_key": f"DOC-ACM-KAR-001-{ts}",
            "doc_num": f"INV-ACM-KAR-001-{ts % 10000}",
            "invoice_number": f"INV-ACM-KAR-001-{ts % 10000}",
            "vendor_name": "Apex Industrial Accessories Ltd",
            "vendor_code": "VEND-ACM-001",
            "amount": 45000.00,
            "base_amount": 38135.59,
            "tax_amount": 6864.41,
            "currency": "INR",
            "document_type": "AP INVOICE",
            "division": "ACM_KARUMATHAMPATTY",
            "category": "ACCESSORIES AND CONSUMABLES",
            "cost_center": "PACKING MATERIAL PURCHASE",
            "plant": "ALL",
            "payment_terms": "BANK",
            "auto_route": True
        },
        {
            "doc_key": f"DOC-ACM-KAR-002-{ts}",
            "doc_num": f"INV-ACM-KAR-002-{ts % 10000}",
            "invoice_number": f"INV-ACM-KAR-002-{ts % 10000}",
            "vendor_name": "Apex Industrial Accessories Ltd",
            "vendor_code": "VEND-ACM-001",
            "amount": 72500.00,
            "base_amount": 61440.68,
            "tax_amount": 11059.32,
            "currency": "INR",
            "document_type": "AP INVOICE",
            "division": "ACM_KARUMATHAMPATTY",
            "category": "ACCESSORIES AND CONSUMABLES",
            "cost_center": "PACKING MATERIAL PURCHASE",
            "plant": "ALL",
            "payment_terms": "BANK",
            "auto_route": True
        },
        # Row 2: ACM_SALEM / ACM_UDAYAPATTY (2 docs)
        {
            "doc_key": f"DOC-ACM-UDY-001-{ts}",
            "doc_num": f"INV-ACM-UDY-001-{ts % 10000}",
            "invoice_number": f"INV-ACM-UDY-001-{ts % 10000}",
            "vendor_name": "Salem Packing Supplies Corp",
            "vendor_code": "VEND-SLM-002",
            "amount": 62000.00,
            "base_amount": 52542.37,
            "tax_amount": 9457.63,
            "currency": "INR",
            "document_type": "AP INVOICE",
            "division": "ACM_UDAYAPATTY",
            "category": "ACCESSORIES AND CONSUMABLES",
            "cost_center": "PACKING MATERIAL PURCHASE",
            "plant": "ALL",
            "payment_terms": "BANK",
            "auto_route": True
        },
        {
            "doc_key": f"DOC-ACM-UDY-002-{ts}",
            "doc_num": f"INV-ACM-UDY-002-{ts % 10000}",
            "invoice_number": f"INV-ACM-UDY-002-{ts % 10000}",
            "vendor_name": "Salem Packing Supplies Corp",
            "vendor_code": "VEND-SLM-002",
            "amount": 89000.00,
            "base_amount": 75423.73,
            "tax_amount": 13576.27,
            "currency": "INR",
            "document_type": "AP INVOICE",
            "division": "ACM_UDAYAPATTY",
            "category": "ACCESSORIES AND CONSUMABLES",
            "cost_center": "PACKING MATERIAL PURCHASE",
            "plant": "ALL",
            "payment_terms": "BANK",
            "auto_route": True
        }
    ]

    print("\n--- Posting Matrix Documents ---")
    created_docs = []
    for d in docs_to_post:
        req = DocumentSyncRequest.model_validate(d)
        doc = _upsert_single_document(req, db)
        created_docs.append(doc)
        print(f"[SUCCESS] Doc ID: {doc.id} | Number: {doc.invoice_number} | Division: {doc.division} | Workflow: {doc.workflow_profile_id} | Status: {doc.status} | Stage: {doc.current_stage}/{doc.total_stages} | Approver: {doc.assigned_approver}")
    return created_docs

if __name__ == "__main__":
    db = SessionLocal()
    setup_workflows_and_rules(db)
    post_matrix_documents(db)
    db.close()
