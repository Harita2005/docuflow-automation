import json
from app.database.connection import SessionLocal
from app.database.models import Invoice, WorkflowProfile, WorkflowStepDefinition, BusinessRule, AuditLog
from app.services.rules_engine import remap_unrouted_documents

def test_unrouted_document_lifecycle_and_auto_remap():
    db = SessionLocal()
    test_doc_id = "TEST-DOC-UNROUTED-001"
    wf_name = "TEST_UNROUTED_AUTO_FLOW"
    rule_name = "TEST_UNROUTED_AUTO_RULE"
    
    try:
        # Clean up any leftover test data
        db.query(AuditLog).filter(AuditLog.invoice_id == test_doc_id).delete()
        db.query(Invoice).filter(Invoice.id == test_doc_id).delete()
        db.query(BusinessRule).filter(BusinessRule.rule_name == rule_name).delete()
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).delete()
        db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_name).delete()
        db.commit()

        # 1. Create an unrouted invoice (no rule currently matches this division/category)
        doc = Invoice(
            id=test_doc_id,
            doc_key="TEST_UNROUTED_KEY_001",
            invoice_number="INV-UNROUTED-001",
            vendor_name="Test Vendor Unrouted",
            division="SPECIAL_TEST_DIV",
            category="SPECIAL_TEST_CAT",
            amount=75000.0,
            status="Unrouted (No Rule Matched)",
            assigned_approver="Unassigned (No Rule Matched)",
            workflow_profile_id=None,
            current_stage=0,
            total_stages=0,
            is_deleted=False
        )
        db.add(doc)
        db.commit()

        # Verify initial unrouted state
        db.refresh(doc)
        assert doc.status == "Unrouted (No Rule Matched)"
        assert doc.workflow_profile_id is None
        assert doc.current_stage == 0

        # 2. Call remap_unrouted_documents - should find nothing because no rule matches yet
        initial_remapped = remap_unrouted_documents(db)
        assert not any(r['document_id'] == test_doc_id for r in initial_remapped)
        db.refresh(doc)
        assert doc.workflow_profile_id is None

        # 3. Admin creates the matching workflow profile and steps
        profile = WorkflowProfile(
            profile_name=wf_name,
            workflow_code="WF-998",
            workflow_category="Test Workflows",
            workflow_type="AP INVOICE",
            is_deleted=False
        )
        db.add(profile)
        db.commit()

        step1 = WorkflowStepDefinition(
            profile_name=wf_name,
            stage_number=1,
            step_name="Review & Verify",
            approver_type="User",
            approver_target="VARUNAN",
            document_type="AP INVOICE",
            action_required="Approve / Reject",
            checklist_json=json.dumps(["Check PO balance", "Verify tax rates"])
        )
        step2 = WorkflowStepDefinition(
            profile_name=wf_name,
            stage_number=2,
            step_name="Final Approval",
            approver_type="User",
            approver_target="admin",
            document_type="AP INVOICE",
            action_required="Final Signoff"
        )
        db.add(step1)
        db.add(step2)
        db.commit()

        # 4. Admin creates the matching business rule condition
        conditions = [
            {"field": "division", "operator": "equals", "value": "SPECIAL_TEST_DIV"},
            {"field": "category", "operator": "equals", "value": "SPECIAL_TEST_CAT"}
        ]
        rule = BusinessRule(
            rule_name=rule_name,
            rule_category="Test Routing",
            document_type="AP INVOICE",
            priority=100,
            target_workflow_id=wf_name,
            conditions_json=json.dumps(conditions),
            is_active=True,
            is_deleted=False
        )
        db.add(rule)
        db.commit()

        # 5. Trigger remap_unrouted_documents - doc must be automatically mapped!
        remapped = remap_unrouted_documents(db)
        assert any(r['document_id'] == test_doc_id for r in remapped)

        # 6. Verify the document was transitioned properly
        db.refresh(doc)
        assert doc.workflow_profile_id == wf_name
        assert doc.current_stage == 1
        assert doc.total_stages == 2
        assert doc.assigned_approver == "VARUNAN"
        assert "Initiated" in doc.status or "Review" in doc.status

        # 7. Verify audit log entry was created
        audit = db.query(AuditLog).filter(
            AuditLog.invoice_id == test_doc_id,
            AuditLog.action == "WORKFLOW_MAPPED"
        ).first()
        assert audit is not None
        assert wf_name in audit.notes

    finally:
        # Clean up test records
        try:
            db.query(AuditLog).filter(AuditLog.invoice_id == test_doc_id).delete()
            db.query(Invoice).filter(Invoice.id == test_doc_id).delete()
            db.query(BusinessRule).filter(BusinessRule.rule_name == rule_name).delete()
            db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).delete()
            db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_name).delete()
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
