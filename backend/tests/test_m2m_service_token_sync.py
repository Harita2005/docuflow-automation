import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import Invoice, AuditLog

@pytest.fixture(scope="module")
def client():
    return TestClient(app)

def test_m2m_service_token_and_document_sync(client):
    """
    Verifies Option 1: Direct Service Token
    1. Authenticate at POST /m2m/auth/login to get Bearer token.
    2. Post a document record to POST /api/sync/record using the Bearer token.
    3. Verify record was inserted into the database.
    4. Teardown test record.
    """
    uid_suffix = uuid.uuid4().hex[:6]
    test_doc_key = f"TEST_SYNC_KEY_{uid_suffix}"
    test_inv_num = f"TEST_INV_{uid_suffix}"

    # Step 1: Obtain M2M Bearer token
    login_resp = client.post("/m2m/auth/login", json={
        "username": "backend_sync_client",
        "password": "SecretPassword987654321!"
    })
    assert login_resp.status_code == 200, f"M2M Login failed: {login_resp.text}"
    token_data = login_resp.json()
    assert "access_token" in token_data
    token = token_data["access_token"]
    assert token_data.get("token_type") == "Bearer"

    # Step 2: Ingest record via POST /api/sync/record
    payload = {
        "doc_key": test_doc_key,
        "doc_num": test_inv_num,
        "invoice_number": test_inv_num,
        "invoice_date": "2026-10-21",
        "due_date": "2026-11-21",
        "po_number": f"TEST_PO_{uid_suffix}",
        "amount": 12500.0,
        "currency": "INR",
        "vendor_name": "Test Integration Supplier Ltd",
        "vendor_code": "VEND_TEST_001",
        "division": "VCC",
        "plant": "Chennai",
        "document_type": "AP INVOICE"
    }

    db = SessionLocal()
    created_id = None
    try:
        sync_resp = client.post(
            "/api/sync/record",
            headers={"Authorization": f"Bearer {token}"},
            json=payload
        )
        assert sync_resp.status_code == 200, f"Sync record failed: {sync_resp.text}"
        res_json = sync_resp.json()
        assert res_json.get("success") is True
        created_id = res_json.get("document_id")
        assert created_id is not None

        # Step 3: Verify document exists in database
        db_doc = db.query(Invoice).filter(Invoice.id == created_id).first()
        assert db_doc is not None
        assert db_doc.doc_key == test_doc_key
        assert db_doc.invoice_number == test_inv_num
        assert float(db_doc.amount) == 12500.0

    finally:
        # Step 4: Strict cleanup
        if created_id:
            db.rollback()
            db.query(AuditLog).filter(AuditLog.invoice_id == str(created_id)).delete(synchronize_session=False)
            db.query(Invoice).filter(Invoice.id == str(created_id)).delete(synchronize_session=False)
            db.commit()
        db.close()
