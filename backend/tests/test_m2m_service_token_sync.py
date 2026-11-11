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


def test_sync_direct_login_endpoints_and_records_sync(client):
    """
    Verifies the newly added direct /login and /api/sync/login endpoints:
    1. Authenticate via POST /login and POST /api/sync/login.
    2. Verify invalid credentials return 401.
    3. Post record to POST /records and verify successful ingestion.
    """
    # 1. Reject invalid credentials
    bad_resp = client.post("/login", json={"username": "backend_sync_client", "password": "WrongPassword!"})
    assert bad_resp.status_code == 401

    # 2. Authenticate at POST /login
    login_resp = client.post("/login", json={
        "username": "backend_sync_client",
        "password": "SecretPassword987654321!"
    })
    assert login_resp.status_code == 200, f"/login failed: {login_resp.text}"
    token_data = login_resp.json()
    assert "access_token" in token_data
    token = token_data["access_token"]
    assert token_data.get("token_type") == "Bearer"

    # 3. Authenticate at POST /api/sync/login
    sync_login_resp = client.post("/api/sync/login", json={
        "username": "backend_sync_client",
        "password": "SecretPassword987654321!"
    })
    assert sync_login_resp.status_code == 200
    assert "access_token" in sync_login_resp.json()

    # 3b. Authenticate with Admin / password123 credentials
    admin_login_resp = client.post("/login", json={
        "username": "Admin",
        "password": "password123"
    })
    assert admin_login_resp.status_code == 200, f"/login with Admin failed: {admin_login_resp.text}"
    admin_token_data = admin_login_resp.json()
    assert "access_token" in admin_token_data
    assert admin_token_data.get("token_type") == "Bearer"

    admin_m2m_resp = client.post("/m2m/auth/login", json={
        "username": "Admin",
        "password": "password123"
    })
    assert admin_m2m_resp.status_code == 200, f"/m2m/auth/login with Admin failed: {admin_m2m_resp.text}"
    assert "access_token" in admin_m2m_resp.json()

    # 4. Ingest record via POST /records using token from /login
    uid_suffix = uuid.uuid4().hex[:6]
    test_doc_key = f"TEST_SYNC_KEY_{uid_suffix}"
    test_inv_num = f"TEST_INV_{uid_suffix}"
    payload = {
        "doc_key": test_doc_key,
        "doc_num": test_inv_num,
        "invoice_number": test_inv_num,
        "invoice_date": "2026-10-21",
        "due_date": "2026-11-21",
        "po_number": f"TEST_PO_{uid_suffix}",
        "amount": 28000.0,
        "currency": "INR",
        "vendor_name": "Precision Automation Systems",
        "vendor_code": "VEND_PAS_002",
        "division": "VCC",
        "plant": "Chennai",
        "document_type": "AP INVOICE"
    }

    db = SessionLocal()
    created_id = None
    try:
        sync_resp = client.post(
            "/records",
            headers={"Authorization": f"Bearer {token}"},
            json=payload
        )
        assert sync_resp.status_code == 200, f"Sync record to /records failed: {sync_resp.text}"
        res_json = sync_resp.json()
        assert res_json.get("success") is True
        created_id = res_json.get("document_id")
        assert created_id is not None

        db_doc = db.query(Invoice).filter(Invoice.id == created_id).first()
        assert db_doc is not None
        assert db_doc.doc_key == test_doc_key
        assert float(db_doc.amount) == 28000.0
    finally:
        if created_id:
            db.rollback()
            db.query(AuditLog).filter(AuditLog.invoice_id == str(created_id)).delete(synchronize_session=False)
            db.query(Invoice).filter(Invoice.id == str(created_id)).delete(synchronize_session=False)
            db.commit()
        db.close()
