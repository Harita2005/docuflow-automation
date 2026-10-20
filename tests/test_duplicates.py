import concurrent.futures
import time
import uuid
import pytest
from fastapi.testclient import TestClient

from app.database.connection import SessionLocal
from app.database.models import Invoice, IntegrationSyncLog


class TestSyncDuplicatesAndIdempotency:
    @pytest.fixture(autouse=True)
    def cleanup_test_sync_records(self):
        """Teardown fixture ensuring any test sync records created during tests are cleanly deleted."""
        test_prefix = "TEST-DUP-"
        yield
        db = SessionLocal()
        try:
            test_docs = db.query(Invoice).filter(Invoice.doc_key.like(f"{test_prefix}%")).all()
            for doc in test_docs:
                db.query(IntegrationSyncLog).filter(IntegrationSyncLog.document_id == doc.id).delete()
                db.delete(doc)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    def test_single_document_sync_creation(self, client: TestClient, auth_tokens):
        """Verify successful ingestion of a new test record via /api/sync/document."""
        test_key = f"TEST-DUP-{uuid.uuid4().hex[:8]}"
        payload = {
            "doc_key": test_key,
            "invoice_number": f"INV-{test_key}",
            "amount": 2500.0,
            "division": "VCC",
            "vendor_name": "Test Vendor Automation Ltd",
            "category": "Raw Materials",
        }

        response = client.post(
            "/api/sync/document",
            json=payload,
            headers=auth_tokens["service_api_key_headers"]
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert data.get("doc_key") == test_key

        # Database verification: exactly one record created
        db = SessionLocal()
        try:
            records = db.query(Invoice).filter(Invoice.doc_key == test_key).all()
            assert len(records) == 1
            assert records[0].amount == 2500.0
            assert records[0].division == "VCC"
        finally:
            db.close()

    def test_repeated_submission_idempotency(self, client: TestClient, auth_tokens):
        """
        Submitting the same record multiple times must be idempotent:
        no duplicate records are created, and existing record is updated safely.
        """
        test_key = f"TEST-DUP-IDEMP-{uuid.uuid4().hex[:8]}"
        payload = {
            "doc_key": test_key,
            "invoice_number": f"INV-{test_key}",
            "amount": 3500.0,
            "division": "VCC",
            "vendor_name": "Original Vendor",
        }

        # Submission 1
        res1 = client.post("/api/sync/document", json=payload, headers=auth_tokens["service_api_key_headers"])
        assert res1.status_code == 200
        doc_id_1 = res1.json().get("document_id")

        # Submission 2: slightly updated amount on same doc_key
        payload["amount"] = 3750.0
        payload["vendor_name"] = "Updated Vendor Name"
        res2 = client.post("/api/sync/document", json=payload, headers=auth_tokens["service_api_key_headers"])
        assert res2.status_code == 200
        doc_id_2 = res2.json().get("document_id")

        # Must map to the exact same document ID
        assert doc_id_1 == doc_id_2

        # Verify DB: strictly 1 row in database, updated in place
        db = SessionLocal()
        try:
            matching = db.query(Invoice).filter(Invoice.doc_key == test_key).all()
            assert len(matching) == 1
            assert matching[0].id == doc_id_1
            assert matching[0].amount == 3750.0
        finally:
            db.close()

    def test_terminal_state_duplicate_handling(self, client: TestClient, auth_tokens):
        """
        If a document is already in a terminal state ('Approved'),
        re-syncing returns an idempotent response and logs a DUPLICATE event without altering status.
        """
        test_key = f"TEST-DUP-TERM-{uuid.uuid4().hex[:8]}"
        payload = {
            "doc_key": test_key,
            "invoice_number": f"INV-{test_key}",
            "amount": 5000.0,
            "division": "VCC",
        }

        res = client.post("/api/sync/document", json=payload, headers=auth_tokens["service_api_key_headers"])
        assert res.status_code == 200

        # Transition document directly to 'Approved'
        db = SessionLocal()
        try:
            doc = db.query(Invoice).filter(Invoice.doc_key == test_key).first()
            doc.status = "Approved"
            db.commit()
        finally:
            db.close()

        # Resubmit sync payload
        res_dup = client.post("/api/sync/document", json=payload, headers=auth_tokens["service_api_key_headers"])
        assert res_dup.status_code == 200
        data = res_dup.json()
        assert data.get("success") is True
        assert "terminal status" in data.get("message", "").lower() or "idempotent" in data.get("message", "").lower()

        # Verify DB status remains 'Approved'
        db = SessionLocal()
        try:
            doc = db.query(Invoice).filter(Invoice.doc_key == test_key).first()
            assert doc.status == "Approved"
        finally:
            db.close()

    def test_concurrent_write_safety_no_duplicates(self, client: TestClient, auth_tokens):
        """
        Simultaneous concurrent write submissions for the same document key must NOT
        create duplicate records or corrupt database state.
        """
        test_key = f"TEST-DUP-RACE-{uuid.uuid4().hex[:8]}"
        payload = {
            "doc_key": test_key,
            "invoice_number": f"INV-{test_key}",
            "amount": 9900.0,
            "division": "VCC",
        }

        def submit_sync():
            return client.post(
                "/api/sync/document",
                json=payload,
                headers=auth_tokens["service_api_key_headers"]
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(submit_sync) for _ in range(5)]
            responses = [f.result() for f in futures]

        # Verify that concurrency did not create duplicate records:
        # At least one request succeeded
        success_count = sum(1 for r in responses if r.status_code == 200)
        assert success_count >= 1

        # Database verification: strictly 1 record must exist in DB (no duplicates or corruption)
        db = SessionLocal()
        try:
            records = db.query(Invoice).filter(Invoice.doc_key == test_key).all()
            assert len(records) == 1
            assert records[0].doc_key == test_key
        finally:
            db.close()
