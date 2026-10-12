import io
import time
import uuid
import threading
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token
from app.database.connection import SessionLocal, engine, get_db
from app.database.models import User, Role, Permission, RolePermission, Invoice
from app.services.ocr_service import (
    ocr_concurrency_guard,
    OCRConcurrencyError,
    set_ocr_semaphore,
    get_ocr_semaphore,
)

client = TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    """Module-level transactional session that rolls back all test changes."""
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    session.commit = session.flush

    app.dependency_overrides[get_db] = lambda: session
    try:
        yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="module")
def ocr_test_setup(db_session):
    # Ensure doc:create permission exists
    perm = db_session.query(Permission).filter(Permission.code == "doc:create").first()
    if not perm:
        perm = Permission(code="doc:create", name="Create Documents", module="documents")
        db_session.add(perm)
        db_session.flush()

    role = db_session.query(Role).filter(Role.code == "TEST_OCR_UPLOADER").first()
    if not role:
        role = Role(code="TEST_OCR_UPLOADER", name="Test OCR Uploader", description="Can upload docs")
        db_session.add(role)
        db_session.flush()

    rp = db_session.query(RolePermission).filter(
        RolePermission.role_id == role.id,
        RolePermission.permission_id == perm.id
    ).first()
    if not rp:
        rp = RolePermission(role_id=role.id, permission_id=perm.id)
        db_session.add(rp)
        db_session.flush()

    user = db_session.query(User).filter(User.username == "test_ocr_user").first()
    if not user:
        user = User(
            user_uid=f"OCR_{uuid.uuid4().hex[:12]}",
            username="test_ocr_user",
            email="ocr_tester@companydomain.com",
            employee_id="EMP_OCR_01",
            employee_name="OCR Tester",
            name="OCR Tester",
            password_hash="testhash",
            role="TEST_OCR_UPLOADER",
            role_id=role.id,
            division="VCC",
            is_active=True,
        )
        db_session.add(user)
        db_session.flush()

    token = create_access_token({"sub": user.username, "role": user.role, "division": user.division})

    # Create dummy invoice for sync attachment test
    inv = Invoice(
        id=f"TEST_OCR_INV_{uuid.uuid4().hex[:8]}",
        invoice_number=f"INV-OCR-{uuid.uuid4().hex[:6]}",
        vendor_name="OCR Test Vendor",
        amount=15000.0,
        current_stage=1,
        division="VCC",
        is_deleted=False
    )
    db_session.add(inv)
    db_session.flush()

    return {
        "user": user,
        "token": token,
        "invoice_id": inv.id,
    }


def test_ocr_semaphore_concurrency_bounding():
    """
    Verifies that simultaneous executions exceeding capacity are blocked
    and raise OCRConcurrencyError once timeout expires.
    """
    test_capacity = 2
    test_sem = threading.BoundedSemaphore(test_capacity)
    orig_sem = get_ocr_semaphore()
    set_ocr_semaphore(test_sem)

    results = []
    barrier = threading.Barrier(test_capacity)

    def worker_holding_slot():
        try:
            with ocr_concurrency_guard(timeout=0.1):
                barrier.wait(timeout=2.0)
                time.sleep(0.4)
                results.append("success")
        except Exception as exc:
            results.append(exc)

    def worker_rejected():
        try:
            # Let workers 1 and 2 acquire first
            time.sleep(0.1)
            with ocr_concurrency_guard(timeout=0.1):
                results.append("unexpected_success")
        except OCRConcurrencyError:
            results.append("rejected_timeout")
        except Exception as exc:
            results.append(exc)

    try:
        t1 = threading.Thread(target=worker_holding_slot)
        t2 = threading.Thread(target=worker_holding_slot)
        t3 = threading.Thread(target=worker_rejected)

        t1.start()
        t2.start()
        t3.start()

        t1.join()
        t2.join()
        t3.join()

        assert results.count("success") == 2
        assert results.count("rejected_timeout") == 1
    finally:
        set_ocr_semaphore(orig_sem)


def test_ocr_concurrency_guard_slot_released():
    """
    Verifies that when an OCR task completes, its semaphore slot is released
    and subsequent tasks can acquire without error.
    """
    test_sem = threading.BoundedSemaphore(1)
    orig_sem = get_ocr_semaphore()
    set_ocr_semaphore(test_sem)

    try:
        with ocr_concurrency_guard(timeout=0.5):
            pass  # Immediately released

        # Second acquisition must succeed immediately
        with ocr_concurrency_guard(timeout=0.5):
            pass
    finally:
        set_ocr_semaphore(orig_sem)


def test_extract_preview_returns_503_when_concurrency_saturated(ocr_test_setup):
    """
    Verifies that /api/documents/extract-preview returns HTTP 503
    with a clear message when OCR capacity is saturated.
    """
    token = ocr_test_setup["token"]
    file_content = b"%PDF-1.4 Mock PDF content for test preview"
    files = {"file": ("test_invoice.pdf", io.BytesIO(file_content), "application/pdf")}
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.services.ocr_service.extract_document_for_verification",
        side_effect=OCRConcurrencyError("Capacity saturated")
    ):
        resp = client.post("/api/documents/extract-preview", files=files, headers=headers)
        assert resp.status_code == 503
        data = resp.json()
        assert "busy" in data["detail"].lower()


def test_upload_document_falls_back_when_concurrency_saturated(ocr_test_setup):
    """
    Verifies that direct /api/documents/upload does NOT fail with 503,
    but falls back gracefully to user-supplied metadata when OCR capacity is saturated.
    """
    token = ocr_test_setup["token"]
    file_content = b"%PDF-1.4 Mock PDF content for direct upload test"
    files = {"file": ("direct_upload.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "vendor_name": "Resilient Supplier Ltd",
        "invoice_number": f"INV-FALLBACK-{uuid.uuid4().hex[:6]}",
        "amount": 25000.0,
        "division": "VCC"
    }
    headers = {"Authorization": f"Bearer {token}"}

    with patch(
        "app.services.ocr_service.extract_document_for_verification",
        side_effect=OCRConcurrencyError("Capacity saturated")
    ):
        resp = client.post("/api/documents/upload", files=files, data=data, headers=headers)
        assert resp.status_code == 200
        res_data = resp.json()
        inv_data = res_data.get("invoice", res_data)
        assert inv_data.get("vendor_name") == "Resilient Supplier Ltd"
        assert inv_data.get("amount") == 25000.0


def test_sync_attachment_falls_back_when_concurrency_saturated(ocr_test_setup):
    """
    Verifies that /api/sync/record/{record_id}/attachment falls back gracefully
    when OCR capacity is saturated, binding the file without failing.
    """
    inv_id = ocr_test_setup["invoice_id"]
    file_content = b"%PDF-1.4 Mock PDF content for sync attachment test"
    files = {"file": ("synced_doc.pdf", io.BytesIO(file_content), "application/pdf")}
    data = {
        "attachment_type": "Original Invoice",
        "uploaded_by": "ERP Concurrency Tester"
    }
    headers = {"X-API-Key": "DocuFlow-M2M-Integration-Secret-2026"}

    with patch(
        "app.routers.sync.extract_text_from_pdf",
        side_effect=OCRConcurrencyError("Capacity saturated")
    ):
        resp = client.post(f"/api/sync/record/{inv_id}/attachment", files=files, data=data, headers=headers)
        assert resp.status_code == 200
        res_data = resp.json()
        assert res_data.get("success") is True
        assert res_data.get("ocr_extracted_fields") == {}
