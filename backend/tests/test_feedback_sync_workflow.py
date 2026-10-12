import uuid
import json
from pathlib import Path
import pytest
from app.routers.sync import _upsert_single_document
from app.schemas.schemas import DocumentSyncRequest
from app.database.connection import SessionLocal
from app.database.models import (
    User,
    Invoice,
    AuditLog,
    WorkflowProfile,
    WorkflowStepDefinition,
    BusinessRule,
    InvoiceChecklistState,
)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def test_setup(db_session):
    approver = db_session.query(User).filter(User.is_active == True).first()
    return {"approver": approver}


def test_scenario1_image_sync_and_storage(db_session, test_setup):
    """
    Scenario 1: Image sync works and stores images image_1 through image_5 on feedback records.
    """
    doc_key = f"TEST-IMG-SYNC-{uuid.uuid4().hex[:6]}"
    img_urls = {
        "image_1": "https://storage.example.com/evidence1.jpg",
        "image_2": "https://storage.example.com/evidence2.jpg",
        "image_3": "https://storage.example.com/evidence3.jpg",
        "image_4": "https://storage.example.com/evidence4.jpg",
        "image_5": "https://storage.example.com/evidence5.jpg",
    }

    req = DocumentSyncRequest(
        doc_key=doc_key,
        document_type="CUSTOMER FEEDBACK",
        category="Packaging",
        division="Consumer Goods",
        vendor_name="Client Corp",
        amount=500.0,
        auto_route=False,
        **img_urls
    )

    doc = _upsert_single_document(req, db_session)
    try:
        assert doc.image_1 == img_urls["image_1"]
        assert doc.image_2 == img_urls["image_2"]
        assert doc.image_3 == img_urls["image_3"]
        assert doc.image_4 == img_urls["image_4"]
        assert doc.image_5 == img_urls["image_5"]
    finally:
        db_session.delete(doc)
        db_session.commit()


def test_scenario2_invoice_matching_strict_approved_only(db_session, test_setup):
    """
    Scenario 2:
    - Feedback record attaches ONLY its matching approved invoice.
    - Never attaches an unapproved invoice.
    - Never attaches an unrelated invoice.
    - Safely handles missing invoices without attaching an incorrect document.
    """
    matching_inv_num = f"INV-MATCH-{uuid.uuid4().hex[:6]}"
    unapproved_inv_num = f"INV-UNAPP-{uuid.uuid4().hex[:6]}"
    missing_inv_num = f"INV-MISSING-{uuid.uuid4().hex[:6]}"

    # 1. Approved invoice
    approved_doc_id = f"DOC-APPR-{uuid.uuid4().hex[:6]}"
    approved_inv = Invoice(
        id=approved_doc_id,
        invoice_number=matching_inv_num,
        vendor_name="Approved Vendor Ltd",
        amount=12000.0,
        status="Approved",
        file_path="C:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/stored_pdfs/approved/INV-3STAGE-01_DOC-3STAGE-01.pdf",
        file_name="INV-3STAGE-01_DOC-3STAGE-01.pdf",
        file_url=f"/api/documents/{approved_doc_id}/file",
        is_deleted=False,
        version=1,
        contact_person="system"
    )
    db_session.add(approved_inv)

    # 2. Unapproved invoice (Pending Approval) with a file
    unapproved_doc_id = f"DOC-UNAPP-{uuid.uuid4().hex[:6]}"
    unapproved_inv = Invoice(
        id=unapproved_doc_id,
        invoice_number=unapproved_inv_num,
        vendor_name="Pending Vendor Ltd",
        amount=8000.0,
        status="Pending Approval",
        file_path="C:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/stored_pdfs/CAPEX-9901.pdf",
        file_name="CAPEX-9901.pdf",
        file_url=f"/api/documents/{unapproved_doc_id}/file",
        is_deleted=False,
        version=1,
        contact_person="system"
    )
    db_session.add(unapproved_inv)
    db_session.commit()

    created_docs = []
    try:
        # Case A: Feedback with matching approved invoice -> Attached successfully
        req_matching = DocumentSyncRequest(
            doc_key=f"FB-MATCH-{uuid.uuid4().hex[:6]}",
            document_type="CUSTOMER FEEDBACK",
            category="Quality",
            division="VCC",
            invoice_number=matching_inv_num,
            vendor_name="Client A",
            amount=1.0,
            auto_route=False
        )
        fb_matched = _upsert_single_document(req_matching, db_session)
        created_docs.append(fb_matched)

        assert Path(fb_matched.file_path).resolve() == Path(approved_inv.file_path).resolve()
        assert fb_matched.file_name == approved_inv.file_name
        assert fb_matched.file_url == f"/api/documents/{fb_matched.id}/file"

        # Case B: Feedback referencing unapproved invoice -> Must NOT attach unapproved invoice
        req_unapproved = DocumentSyncRequest(
            doc_key=f"FB-UNAPP-{uuid.uuid4().hex[:6]}",
            document_type="CUSTOMER FEEDBACK",
            category="Quality",
            division="VCC",
            invoice_number=unapproved_inv_num,
            vendor_name="Client B",
            amount=1.0,
            auto_route=False
        )
        fb_unapproved = _upsert_single_document(req_unapproved, db_session)
        created_docs.append(fb_unapproved)

        assert fb_unapproved.file_path is None, "Must not attach unapproved invoice file_path"
        assert fb_unapproved.file_url is None, "Must not attach unapproved invoice file_url"

        # Case C: Feedback referencing missing invoice -> Safely handles missing invoice
        req_missing = DocumentSyncRequest(
            doc_key=f"FB-MISSING-{uuid.uuid4().hex[:6]}",
            document_type="CUSTOMER FEEDBACK",
            category="Quality",
            division="VCC",
            invoice_number=missing_inv_num,
            vendor_name="Client C",
            amount=1.0,
            auto_route=False
        )
        fb_missing = _upsert_single_document(req_missing, db_session)
        created_docs.append(fb_missing)

        assert fb_missing.file_path is None, "Missing invoice must remain unattached"
        assert fb_missing.file_url is None, "Missing invoice must remain unattached"

    finally:
        for d in created_docs:
            db_session.query(AuditLog).filter(AuditLog.invoice_id == d.id).delete()
            db_session.delete(d)
        db_session.delete(approved_inv)
        db_session.delete(unapproved_inv)
        db_session.commit()


def test_scenario3_condition_matching_workflow_trigger_and_no_duplicates(db_session, test_setup):
    """
    Scenario 3:
    - Sync evaluates configured conditions via Condition Engine.
    - If conditions match, start configured workflow.
    - If conditions do not match, do not start workflow (Unrouted).
    - Prevent duplicate workflow starts when synced repeatedly.
    - Preserve CUSTOMER FEEDBACK document type.
    """
    wf_name = f"FB_WF_{uuid.uuid4().hex[:6]}"
    rule_name = f"Rule_FB_{uuid.uuid4().hex[:6]}"

    # Setup workflow profile and step
    wf_profile = WorkflowProfile(
        profile_name=wf_name,
        workflow_type="CUSTOMER FEEDBACK",
        description="Customer Feedback resolution flow",
        is_deleted=False
    )
    db_session.add(wf_profile)

    wf_step = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="Feedback Assessment",
        approver_target=test_setup["approver"].username
    )
    db_session.add(wf_step)

    # Setup business rule that matches category == 'High Priority Complaint'
    rule = BusinessRule(
        rule_name=rule_name,
        priority=90,
        is_active=True,
        is_deleted=False,
        target_workflow_id=wf_name,
        rule_action="WORKFLOW_ROUTE",
        conditions_json=json.dumps({
            "match_type": "ALL",
            "conditions": [
                {
                    "field": "category",
                    "operator": "equals",
                    "value": "High Priority Complaint"
                }
            ]
        })
    )
    db_session.add(rule)
    db_session.commit()

    created_docs = []
    try:
        # 1. Non-matching conditions: category is 'Minor Inquiry' -> Workflow should NOT start
        req_unmatched = DocumentSyncRequest(
            doc_key=f"FB-UNMATCH-{uuid.uuid4().hex[:6]}",
            document_type="CUSTOMER FEEDBACK",
            category="Minor Inquiry",
            division="VCC",
            vendor_name="Client X",
            amount=100.0,
            auto_route=True
        )
        doc_unmatched = _upsert_single_document(req_unmatched, db_session)
        created_docs.append(doc_unmatched)

        assert doc_unmatched.workflow_profile_id is None
        assert doc_unmatched.status == "Unrouted (No Rule Matched)"
        assert doc_unmatched.current_stage == 0

        # 2. Matching conditions: category is 'High Priority Complaint' -> Workflow starts
        fb_key = f"FB-MATCHED-{uuid.uuid4().hex[:6]}"
        req_matched = DocumentSyncRequest(
            doc_key=fb_key,
            document_type="CUSTOMER FEEDBACK",
            category="High Priority Complaint",
            division="VCC",
            vendor_name="Client Y",
            amount=5000.0,
            auto_route=True
        )
        doc_matched = _upsert_single_document(req_matched, db_session)
        created_docs.append(doc_matched)

        assert doc_matched.workflow_profile_id == wf_name
        assert doc_matched.status == "Initiated (Feedback Assessment)"
        assert doc_matched.current_stage == 1
        assert doc_matched.document_type == "CUSTOMER FEEDBACK"

        # Check checklist state was created
        chk_items = db_session.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == doc_matched.id
        ).all()
        # Mark one checklist item as checked to test against duplicate reset
        if chk_items:
            chk_items[0].is_checked = True
            db_session.commit()

        # 3. Repeated sync of the SAME record -> Must NOT duplicate or reset workflow
        resync_req = DocumentSyncRequest(
            doc_key=fb_key,
            document_type="CUSTOMER FEEDBACK",
            category="High Priority Complaint",
            division="VCC",
            vendor_name="Client Y Updated",
            amount=5000.0,
            auto_route=True
        )
        doc_resynced = _upsert_single_document(resync_req, db_session)

        # Must retain same status and workflow
        assert doc_resynced.id == doc_matched.id
        assert doc_resynced.workflow_profile_id == wf_name
        assert doc_resynced.status == "Initiated (Feedback Assessment)"
        assert doc_resynced.current_stage == 1

        # If checklist item was checked, it should NOT have been wiped or reset by duplicate route!
        if chk_items:
            rechecked = db_session.query(InvoiceChecklistState).filter(
                InvoiceChecklistState.id == chk_items[0].id
            ).first()
            assert rechecked is not None
            assert rechecked.is_checked is True

    finally:
        for d in created_docs:
            db_session.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == d.id).delete()
            db_session.query(AuditLog).filter(AuditLog.invoice_id == d.id).delete()
            db_session.delete(d)
        db_session.delete(rule)
        db_session.delete(wf_step)
        db_session.delete(wf_profile)
        db_session.commit()
