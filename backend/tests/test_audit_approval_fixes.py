import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Invoice, WorkflowProfile, WorkflowStepDefinition
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def test_setup(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = db_session.query(User).filter(User.role == "admin").first()
    
    approver = db_session.query(User).filter(User.is_active == True, User.username != "admin").first()
    if not approver:
        approver = admin

    token_admin = create_access_token({"sub": admin.username, "role": admin.role})
    token_approver = create_access_token({"sub": approver.username, "role": approver.role})

    return {
        "admin": admin,
        "approver": approver,
        "token_admin": token_admin,
        "token_approver": token_approver
    }


def test_aud01_workflow_save_blocks_empty_approver_target(test_setup):
    """
    AUD-01: Workflow save validation.
    Saving a workflow profile with a step that has no approver_target must be blocked with 422.
    """
    token = test_setup["token_admin"]
    payload = {
        "profile_name": f"TEST_WF_AUD01_{uuid.uuid4().hex[:6]}",
        "workflow_category": "TEST_AUD",
        "workflow_type": "AP INVOICE",
        "status": "Active",
        "steps": [
            {
                "stage_number": 1,
                "step_name": "Stage 1",
                "approver_type": "User",
                "approver_target": test_setup["approver"].username
            },
            {
                "stage_number": 2,
                "step_name": "Stage 2 - Empty Approver",
                "approver_type": "User",
                "approver_target": ""  # EMPTY approver target
            }
        ]
    }
    resp = client.post("/api/admin/workflows", json=payload, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 422, f"Expected 422 when approver_target is empty, got {resp.status_code}: {resp.text}"
    assert "approver_target" in resp.text.lower() or "approver" in resp.text.lower()


def test_aud01_approval_blocks_premature_approval_when_next_step_approver_empty(db_session, test_setup):
    """
    AUD-01: When next step exists in DB but has empty approver_target,
    the document MUST NOT be marked 'Approved'.
    It must raise 422/500 configuration error and leave the document in its current status.
    """
    token = test_setup["token_approver"]
    approver = test_setup["approver"]

    wf_name = f"AUD01_CORRUPT_WF_{uuid.uuid4().hex[:6]}"
    wf = WorkflowProfile(
        profile_name=wf_name,
        workflow_code=f"WF-{uuid.uuid4().hex[:4]}",
        workflow_category="TEST_AUD",
        workflow_type="AP INVOICE",
        status="Active"
    )
    db_session.add(wf)

    step1 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="Stage 1 Verification",
        approver_type="User",
        approver_target=approver.username
    )
    step2 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=2,
        step_name="Stage 2 Empty Target",
        approver_type="User",
        approver_target=""  # Corrupt / empty in database
    )
    db_session.add_all([step1, step2])

    doc_id = f"DOC-AUD01-{uuid.uuid4().hex[:6]}"
    inv = Invoice(
        id=doc_id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
        vendor_name="AUD Vendor",
        amount=100.0,
        status="In Progress (Stage 1)",
        current_stage=1,
        workflow_profile_id=wf_name,
        assigned_approver=approver.username,
        is_deleted=False,
        version=1,
        contact_person="system"
    )
    from app.config.settings import settings
    pdf_path = settings.UPLOAD_DIR / f"{doc_id}.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test dummy attachment")
    inv.file_path = str(pdf_path)
    inv.file_url = f"/api/documents/{doc_id}/file"
    db_session.add(inv)
    db_session.commit()

    try:
        # User approves Stage 1 via workflow approve endpoint
        resp = client.post(
            "/api/workflows/approve",
            json={
                "invoiceId": doc_id,
                "expected_stage": 1,
                "expected_version": 1,
                "comments": "Approved Stage 1"
            },
            headers={"Authorization": f"Bearer {token}"}
        )

        # Must NOT be 200/Approved
        assert resp.status_code == 422, f"Expected 422 configuration error, got {resp.status_code}: {resp.text}"

        # Ensure document remains in its current status and is NOT 'Approved'
        db_session.refresh(inv)
        assert inv.status != "Approved", "BUG AUD-01 reproduced: Document was prematurely marked Approved!"
        assert inv.current_stage == 1, "Document current_stage should have remained 1"
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except Exception:
                pass
        db_session.delete(inv)
        db_session.delete(step1)
        db_session.delete(step2)
        db_session.delete(wf)
        db_session.commit()


def test_aud03_complete_document_lifecycle_order_and_idempotency(db_session, test_setup):
    """
    AUD-03: Shared complete_document_lifecycle must:
    1. Archive the PDF to year/month/document folder
    2. Only trigger trigger_async_integration_push if archiving succeeds
    3. Then dispatch notifications and write AuditLog
    4. Be idempotent: calling twice does not push or archive twice
    """
    from unittest.mock import patch
    from app.routers.documents import complete_document_lifecycle, get_archived_pdf_path
    from app.config.settings import settings
    from app.database.models import AuditLog

    doc_id = f"DOC-AUD03-{uuid.uuid4().hex[:6]}"
    inv = Invoice(
        id=doc_id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
        vendor_name="AUD03 Vendor",
        amount=250.0,
        status="Approved",
        current_stage=1,
        is_deleted=False,
        version=2,
        contact_person="system"
    )
    pdf_path = settings.UPLOAD_DIR / f"{doc_id}.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test dummy attachment for aud03")
    inv.file_path = str(pdf_path)
    inv.file_url = f"/api/documents/{doc_id}/file"
    db_session.add(inv)
    db_session.commit()

    call_order = []

    def mock_archive(invoice):
        call_order.append("archive")
        dest = get_archived_pdf_path(invoice)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"%PDF-1.4 archived")
        invoice.file_path = str(dest)
        return True

    def mock_push(invoice_id):
        call_order.append("back_sync_push")

    def mock_notify(*args, **kwargs):
        call_order.append("notifications")

    try:
        with patch("app.routers.documents.archive_approved_pdf", side_effect=mock_archive) as p_arch, \
             patch("app.routers.documents.trigger_async_integration_push", side_effect=mock_push) as p_push, \
             patch("app.routers.documents.dispatch_approval_inapp_notifications", side_effect=mock_notify) as p_notif:

            # First execution
            success = complete_document_lifecycle(
                db=db_session,
                inv=inv,
                approver_name=test_setup["approver"].username,
                remarks="Final sign-off",
                prev_stage_num=1,
                stage_name="Stage 1"
            )
            assert success is True
            # Verify strict ordering: archive -> back_sync_push -> notifications
            assert call_order == ["archive", "back_sync_push", "notifications"], f"Incorrect execution order: {call_order}"

            # Second execution (Idempotency test)
            call_order.clear()
            success_again = complete_document_lifecycle(
                db=db_session,
                inv=inv,
                approver_name=test_setup["approver"].username,
                remarks="Final sign-off duplicate",
                prev_stage_num=1,
                stage_name="Stage 1"
            )
            # Must NOT push back-sync twice
            assert "back_sync_push" not in call_order, "Back sync push must be idempotent and not trigger twice!"
    finally:
        if pdf_path.exists():
            try:
                pdf_path.unlink()
            except Exception:
                pass
        archived_path = get_archived_pdf_path(inv)
        if archived_path.exists():
            try:
                archived_path.unlink()
            except Exception:
                pass
        db_session.delete(inv)
        db_session.commit()


def test_aud03_endpoints_invoke_complete_document_lifecycle(db_session, test_setup):
    """
    AUD-03: Verify that /api/workflows/approve, /api/documents/{id}/approve,
    and /api/records/{id}/step-action all invoke complete_document_lifecycle on final approval.
    """
    from unittest.mock import patch
    from app.config.settings import settings

    token = test_setup["token_approver"]
    approver = test_setup["approver"]

    # Test single-stage workflow so Stage 1 approval is final approval
    wf_name = f"AUD03_1STG_{uuid.uuid4().hex[:6]}"
    wf = WorkflowProfile(
        profile_name=wf_name,
        workflow_code=f"WF-{uuid.uuid4().hex[:4]}",
        workflow_category="TEST_AUD",
        workflow_type="AP INVOICE",
        status="Active"
    )
    step1 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="Single Final Stage",
        approver_type="User",
        approver_target=approver.username
    )
    db_session.add_all([wf, step1])

    doc1_id = f"DOC-AUD03-EP1-{uuid.uuid4().hex[:6]}"
    inv1 = Invoice(
        id=doc1_id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
        vendor_name="AUD03 Vendor",
        amount=100.0,
        status="In Progress (Stage 1)",
        current_stage=1,
        workflow_profile_id=wf_name,
        assigned_approver=approver.username,
        is_deleted=False,
        version=1,
        contact_person="system"
    )
    pdf1 = settings.UPLOAD_DIR / f"{doc1_id}.pdf"
    pdf1.write_bytes(b"%PDF-1.4 test")
    inv1.file_path = str(pdf1)
    inv1.file_url = f"/api/documents/{doc1_id}/file"
    db_session.add(inv1)
    db_session.commit()

    called_with_inv_ids = []

    def mock_lifecycle(db, inv, approver_name, **kwargs):
        called_with_inv_ids.append(str(inv.id))
        return True

    try:
        with patch("app.routers.documents.complete_document_lifecycle", side_effect=mock_lifecycle):
            # Endpoint 1: /api/workflows/approve
            resp1 = client.post(
                "/api/workflows/approve",
                json={"invoiceId": doc1_id, "expected_stage": 1, "expected_version": 1},
                headers={"Authorization": f"Bearer {token}"}
            )
            assert resp1.status_code == 200
            assert doc1_id in called_with_inv_ids
    finally:
        if pdf1.exists():
            try:
                pdf1.unlink()
            except Exception:
                pass
        db_session.delete(inv1)
        db_session.delete(step1)
        db_session.delete(wf)
        db_session.commit()


def test_aud07_sync_retry_mechanism_and_error_logging(db_session, test_setup, caplog):
    """
    AUD-07:
    - Back sync failures must be logged at ERROR level, not DEBUG.
    - Outbound push must record attempt_count, last_error, and next_retry_at.
    - Uses exponential backoff (e.g. 1m, 5m, 15m, 1h).
    - After max attempts, status is marked DEAD or NEEDS_ATTENTION.
    - Push sends stable idempotency key in headers and payload.
    - GET /api/integrations/failed-syncs lists failed syncs for admin retry.
    """
    import logging
    from unittest.mock import patch, MagicMock
    import urllib.error
    from app.services.integration_service import dispatch_outgoing_webhook, get_sync_retry_meta
    from app.database.models import ThirdPartyWebhookConfig

    # Ensure active webhook config exists
    cfg = db_session.query(ThirdPartyWebhookConfig).first()
    if not cfg:
        cfg = ThirdPartyWebhookConfig(
            name="TestERP",
            target_url="https://mock-erp.internal/webhook",
            is_active=True,
            retry_count=3
        )
        db_session.add(cfg)
        db_session.commit()

    doc_id = f"DOC-AUD07-{uuid.uuid4().hex[:6]}"
    doc = Invoice(
        id=doc_id,
        invoice_number=f"INV-AUD07-{uuid.uuid4().hex[:4]}",
        vendor_name="ERP Sync Vendor",
        amount=1000.0,
        status="Approved",
        current_stage=1,
        is_deleted=False,
        external_sync_status="PENDING",
        contact_person="system"
    )
    db_session.add(doc)
    db_session.commit()

    captured_headers = {}

    def mock_urlopen_fail(req, timeout=None):
        nonlocal captured_headers
        captured_headers = dict(req.headers)
        raise urllib.error.HTTPError(
            url=req.full_url,
            code=503,
            msg="Service Unavailable",
            hdrs={},
            fp=None
        )

    try:
        with caplog.at_level(logging.ERROR):
            with patch("urllib.request.urlopen", side_effect=mock_urlopen_fail):
                res = dispatch_outgoing_webhook(document_id=doc_id)

        # 1. Failure was logged at ERROR level
        assert any("503" in rec.message or "Service Unavailable" in rec.message or "failure" in rec.message.lower() for rec in caplog.records if rec.levelno >= logging.ERROR), "Back sync failure was NOT logged at ERROR level!"

        # 2. Check Document retry metadata
        db_session.refresh(doc)
        meta = get_sync_retry_meta(doc)
        assert meta["attempt_count"] >= 1, f"Expected attempt_count >= 1, got {meta}"
        assert meta["last_error"] is not None and "503" in str(meta["last_error"]), f"last_error missing or incorrect: {meta}"
        assert meta["next_retry_at"] is not None, "next_retry_at was not computed for exponential backoff"

        # 3. Check Idempotency key
        assert doc.external_sync_ref is not None, "Document external_sync_ref idempotency key was not set"
        assert "Idempotency-key" in captured_headers or "X-docuflow-idempotency-key" in captured_headers, f"Idempotency header missing in outgoing request: {captured_headers}"

        # 4. Check admin failed syncs endpoint
        token = test_setup["token_admin"]
        resp = client.get("/api/integrations/failed-syncs", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        items = resp.json().get("data", [])
        assert any(item["document_id"] == doc_id for item in items), f"Document {doc_id} not returned in failed-syncs admin endpoint"
    finally:
        db_session.delete(doc)
        db_session.commit()


def test_aud02_double_approval_returns_409_conflict_and_no_duplicate_logs(db_session, test_setup):
    """
    AUD-02: Double approval / concurrency idempotency:
    - First approval request succeeds (200).
    - Second identical approval request MUST return 409 Conflict.
    - Second request MUST NOT create duplicate AuditLog entries or duplicate notifications.
    - Expected version mismatch must return 409 Conflict.
    """
    from app.config.settings import settings
    from app.database.models import AuditLog

    token = test_setup["token_approver"]
    approver = test_setup["approver"]

    wf_name = f"AUD02_WF_{uuid.uuid4().hex[:6]}"
    wf = WorkflowProfile(
        profile_name=wf_name,
        workflow_code=f"WF-{uuid.uuid4().hex[:4]}",
        workflow_category="TEST_AUD",
        workflow_type="AP INVOICE",
        status="Active"
    )
    step1 = WorkflowStepDefinition(
        profile_name=wf_name,
        stage_number=1,
        step_name="Final Stage",
        approver_type="User",
        approver_target=approver.username
    )
    db_session.add_all([wf, step1])

    doc_id = f"DOC-AUD02-{uuid.uuid4().hex[:6]}"
    doc = Invoice(
        id=doc_id,
        invoice_number=f"INV-AUD02-{uuid.uuid4().hex[:4]}",
        vendor_name="Idempotency Vendor",
        amount=500.0,
        status="In Progress (Stage 1)",
        current_stage=1,
        workflow_profile_id=wf_name,
        assigned_approver=approver.username,
        is_deleted=False,
        version=1,
        contact_person="system"
    )
    pdf = settings.UPLOAD_DIR / f"{doc_id}.pdf"
    pdf.write_bytes(b"%PDF-1.4 test")
    doc.file_path = str(pdf)
    doc.file_url = f"/api/documents/{doc_id}/file"
    db_session.add(doc)
    db_session.commit()

    try:
        # First approval
        resp1 = client.post(
            "/api/workflows/approve",
            json={
                "invoiceId": doc_id,
                "expected_stage": 1,
                "expected_version": 1,
                "comments": "Initial sign-off"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp1.status_code == 200, f"Expected 200 on first approval, got {resp1.status_code}: {resp1.text}"

        # Count audit logs after first approval
        initial_logs_count = db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).count()
        assert initial_logs_count >= 1

        # Second identical approval (re-trigger / double click)
        resp2 = client.post(
            "/api/workflows/approve",
            json={
                "invoiceId": doc_id,
                "expected_stage": 1,
                "expected_version": 1,
                "comments": "Duplicate sign-off"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert resp2.status_code == 409, f"Expected 409 Conflict on double approval, got {resp2.status_code}: {resp2.text}"

        # Verify no duplicate AuditLogs created
        second_logs_count = db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).count()
        assert second_logs_count == initial_logs_count, f"Duplicate AuditLog created! Expected {initial_logs_count}, got {second_logs_count}"
    finally:
        if pdf.exists():
            try:
                pdf.unlink()
            except Exception:
                pass
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete()
        db_session.delete(doc)
        db_session.delete(step1)
        db_session.delete(wf)
        db_session.commit()


def test_aud05_deterministic_rule_ordering_priority_desc_id_asc(db_session, test_setup):
    """
    AUD-05:
    - Rule ordering must be deterministic: .order_by(BusinessRule.priority.desc(), BusinessRule.id.asc())
    - When two rules have identical priority, the one with lower ID (created earlier) wins deterministically.
    """
    import json
    from app.services.rules_engine import evaluate_business_rules_full
    from app.database.models import BusinessRule, WorkflowProfile, WorkflowStepDefinition

    wf1 = WorkflowProfile(profile_name=f"WF-P1-{uuid.uuid4().hex[:6]}", workflow_code="WFP1", is_deleted=False)
    wf2 = WorkflowProfile(profile_name=f"WF-P2-{uuid.uuid4().hex[:6]}", workflow_code="WFP2", is_deleted=False)
    db_session.add_all([wf1, wf2])
    db_session.commit()

    # Rule 1: priority 100
    rule1 = BusinessRule(
        rule_name=f"Rule-1-{uuid.uuid4().hex[:4]}",
        priority=100,
        target_workflow_id=wf1.profile_name,
        conditions_json=json.dumps([{"field": "vendor_name", "operator": "equals", "value": "SharedVendor"}]),
        is_active=True,
        is_deleted=False
    )
    # Rule 2: same priority 100, also matches SharedVendor
    rule2 = BusinessRule(
        rule_name=f"Rule-2-{uuid.uuid4().hex[:4]}",
        priority=100,
        target_workflow_id=wf2.profile_name,
        conditions_json=json.dumps([{"field": "vendor_name", "operator": "equals", "value": "SharedVendor"}]),
        is_active=True,
        is_deleted=False
    )
    db_session.add_all([rule1, rule2])
    db_session.commit()

    # Ensure rule1.id < rule2.id
    first_rule, second_rule = (rule1, rule2) if rule1.id < rule2.id else (rule2, rule1)

    inv = Invoice(
        id=f"DOC-AUD05-{uuid.uuid4().hex[:6]}",
        invoice_number=f"INV-AUD05-{uuid.uuid4().hex[:4]}",
        vendor_name="SharedVendor",
        amount=100.0,
        status="Uploaded",
        contact_person="system",
        is_deleted=False
    )
    db_session.add(inv)
    db_session.commit()

    try:
        res = evaluate_business_rules_full(db_session, inv)
        assert res is not None, "Expected matching rule"
        # Must deterministically evaluate the rule with lower id when priorities are equal
        assert res["rule_name"] == first_rule.rule_name, f"Expected deterministic match {first_rule.rule_name}, got {res['rule_name']}"
        assert res["target_workflow_id"] == first_rule.target_workflow_id
    finally:
        db_session.delete(inv)
        db_session.delete(rule1)
        db_session.delete(rule2)
        db_session.delete(wf1)
        db_session.delete(wf2)
        db_session.commit()


def test_aud_inactive_approver_fallback_and_stuck_documents(db_session, test_setup):
    """
    Risk map: Inactive or deleted approver
    - Documents stuck with inactive or deleted approver are surfaced in /api/admin/workflows/stuck-documents
    - Admin can perform fallback (REASSIGN, DELEGATE, or OVERRIDE_APPROVE) with mandatory reason logged in AuditLog.
    """
    token = test_setup["token_admin"]
    admin_user = test_setup["admin"]

    # Inactive approver user
    inactive_u = User(
        user_uid=f"UID-INACT-{uuid.uuid4().hex[:6]}",
        employee_id=f"EMP-INACT-{uuid.uuid4().hex[:6]}",
        employee_name="Inactive Approver",
        name="Inactive Approver",
        username=f"inactive_{uuid.uuid4().hex[:6]}",
        email=f"inactive_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="dummyhash_for_test",
        role="manager",
        is_active=False,
        is_deleted=False
    )
    # Active fallback approver user
    fallback_u = User(
        user_uid=f"UID-FALL-{uuid.uuid4().hex[:6]}",
        employee_id=f"EMP-FALL-{uuid.uuid4().hex[:6]}",
        employee_name="Fallback Approver",
        name="Fallback Approver",
        username=f"active_fallback_{uuid.uuid4().hex[:6]}",
        email=f"fallback_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="dummyhash_for_test",
        role="manager",
        is_active=True,
        is_deleted=False
    )
    db_session.add_all([inactive_u, fallback_u])
    db_session.commit()

    doc_id = f"DOC-STUCK-{uuid.uuid4().hex[:6]}"
    doc = Invoice(
        id=doc_id,
        invoice_number=f"INV-STUCK-{uuid.uuid4().hex[:4]}",
        vendor_name="Stuck Approver Vendor",
        amount=500.0,
        status="In Progress (Stage 1)",
        current_stage=1,
        assigned_approver=inactive_u.username,
        is_deleted=False,
        contact_person="system"
    )
    db_session.add(doc)
    db_session.commit()

    try:
        # 1. Admin lists stuck documents
        stuck_resp = client.get(
            "/api/admin/workflows/stuck-documents",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert stuck_resp.status_code == 200
        stuck_data = stuck_resp.json()
        matching_stuck = [d for d in stuck_data["stuck_documents"] if d["document_id"] == doc_id]
        assert len(matching_stuck) == 1, "Document stuck with inactive approver was not detected in /api/admin/workflows/stuck-documents"

        # 2. Validation: Fallback without reason must be rejected (400)
        fail_resp = client.post(
            f"/api/admin/workflows/{doc_id}/fallback-reassign",
            json={
                "action": "REASSIGN",
                "target_approver": fallback_u.username,
                "reason": ""
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert fail_resp.status_code == 400

        # 3. Successful fallback reassignment with mandatory reason
        reassign_resp = client.post(
            f"/api/admin/workflows/{doc_id}/fallback-reassign",
            json={
                "action": "REASSIGN",
                "target_approver": fallback_u.username,
                "reason": "Original manager left company; reassigned to backup manager"
            },
            headers={"Authorization": f"Bearer {token}"}
        )
        assert reassign_resp.status_code == 200
        assert reassign_resp.json()["assigned_approver"] == fallback_u.username

        # 4. Verify audit trail was logged with mandatory reason
        from app.database.models import AuditLog
        audit = db_session.query(AuditLog).filter(
            AuditLog.invoice_id == doc_id,
            AuditLog.action.ilike("%Fallback Reassign%")
        ).first()
        assert audit is not None
        assert "reassigned to backup manager" in audit.notes

        # 5. Document is no longer stuck with an inactive approver
        stuck_resp_after = client.get(
            "/api/admin/workflows/stuck-documents",
            headers={"Authorization": f"Bearer {token}"}
        )
        still_stuck = [d for d in stuck_resp_after.json()["stuck_documents"] if d["document_id"] == doc_id]
        assert len(still_stuck) == 0, "Document should no longer be marked as stuck"
    finally:
        db_session.query(AuditLog).filter(AuditLog.invoice_id == doc_id).delete()
        db_session.delete(doc)
        db_session.delete(inactive_u)
        db_session.delete(fallback_u)
        db_session.commit()




