import json
import uuid
import pytest
from fastapi.testclient import TestClient

from app.database.connection import SessionLocal
from app.database.models import Invoice, AuditLog, InvoiceChecklistState, User


class TestWorkflowTransitionsAndApprovals:
    @pytest.fixture
    def test_workflow_document(self, db_session, auth_tokens):
        """Creates an isolated test invoice with assigned approver set to the active admin user."""
        admin_uname = auth_tokens["admin_user"].username if auth_tokens["admin_user"] else "admin"
        db = SessionLocal()
        doc_id = f"TEST-WF-{uuid.uuid4().hex[:8]}"
        doc = Invoice(
            id=doc_id,
            doc_key=doc_id,
            invoice_number=f"INV-{doc_id}",
            amount=12000.0,
            division="VCC",
            document_type="AP INVOICE",
            status="Initiated (Stage 1)",
            current_stage=1,
            total_stages=1,
            workflow_profile_id="TEST_WF_AUTO_1",
            assigned_approver=admin_uname,
            file_path="stored_pdfs/CAPEX-9901.pdf",
            file_name="CAPEX-9901.pdf",
            version=1,
            is_deleted=False
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        doc_key = doc.id
        db.close()

        yield doc_key

        # Teardown
        clean_db = SessionLocal()
        try:
            clean_db.query(AuditLog).filter(AuditLog.invoice_id == doc_key).delete()
            clean_db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == doc_key).delete()
            clean_db.query(Invoice).filter(Invoice.id == doc_key).delete()
            clean_db.commit()
        except Exception:
            clean_db.rollback()
        finally:
            clean_db.close()

    def test_workflow_hold_transition_and_audit(self, client: TestClient, auth_tokens, test_workflow_document):
        """Placing a document on hold updates status to 'On Hold' and writes an audit log."""
        doc_id = test_workflow_document
        payload = {
            "action": {
                "expected_version": 1,
                "remarks": "Pending vendor tax clarity"
            }
        }

        response = client.post(
            f"/api/invoices/{doc_id}/hold",
            json=payload,
            headers=auth_tokens["admin_headers"]
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True

        # Verify DB state
        db = SessionLocal()
        try:
            doc = db.query(Invoice).filter(Invoice.id == doc_id).first()
            assert doc.status == "On Hold"

            # Verify audit trail
            logs = db.query(AuditLog).filter(AuditLog.invoice_id == doc_id).all()
            assert any("HOLD" in (l.action or "").upper() or "HOLD" in (l.notes or "").upper() for l in logs)
        finally:
            db.close()

    def test_workflow_reject_transition_and_audit(self, client: TestClient, auth_tokens, test_workflow_document):
        """Rejecting a document marks status as 'Cancelled' and records the rejection in audit logs."""
        doc_id = test_workflow_document
        payload = {
            "action": {
                "expected_version": 1,
                "remarks": "Duplicate billing detected"
            }
        }

        response = client.post(
            f"/api/invoices/{doc_id}/reject",
            json=payload,
            headers=auth_tokens["admin_headers"]
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True

        # Verify DB state
        db = SessionLocal()
        try:
            doc = db.query(Invoice).filter(Invoice.id == doc_id).first()
            assert doc.status == "Cancelled"

            # Audit verification
            logs = db.query(AuditLog).filter(AuditLog.invoice_id == doc_id).all()
            assert any("REJECT" in (l.action or "").upper() or "CANCEL" in (l.action or "").upper() for l in logs)
        finally:
            db.close()

    def test_workflow_concurrency_optimistic_lock(self, client: TestClient, auth_tokens, test_workflow_document):
        """
        Attempting approval with a stale expected_version must be rejected with 409 Conflict,
        preventing race conditions between simultaneous approvers.
        """
        doc_id = test_workflow_document
        # Document version is 1, pass outdated expected_version 99
        payload = {
            "action": {
                "expected_version": 99,
                "remarks": "Outdated approval attempt"
            }
        }

        response = client.post(
            f"/api/invoices/{doc_id}/approve",
            json=payload,
            headers=auth_tokens["admin_headers"]
        )
        assert response.status_code == 409
        detail = response.json().get("detail", "")
        assert "already been completed" in detail.lower() or "conflict" in detail.lower()

    def test_workflow_missing_expected_version_rejected(self, client: TestClient, auth_tokens, test_workflow_document):
        """Omitting expected_version must return 422 Unprocessable Entity."""
        doc_id = test_workflow_document
        response = client.post(
            f"/api/invoices/{doc_id}/approve",
            json={"action": {"remarks": "No version provided"}},
            headers=auth_tokens["admin_headers"]
        )
        assert response.status_code == 422
