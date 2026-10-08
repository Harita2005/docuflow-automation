import time
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token
from app.config.settings import settings, validate_production_file_url_signing_secret
from app.database.connection import SessionLocal, engine, get_db
from app.database.models import User, Role, Document
from app.services.signed_file_service import (
    generate_signed_file_token,
    verify_signed_file_token,
    get_signing_secret,
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
def test_setup(db_session):
    import uuid

    # 1. Plain employee role
    role_emp = db_session.query(Role).filter(Role.code == "TEST_SIGNED_EMP").first()
    if not role_emp:
        role_emp = Role(code="TEST_SIGNED_EMP", name="TestSignedEmployeeRole", description="Test role")
        db_session.add(role_emp)
        db_session.flush()

    # 2. Test users
    user_authorized = db_session.query(User).filter(User.username == "alice_accountant").first()
    if not user_authorized:
        user_authorized = User(
            user_uid=f"SUID_{uuid.uuid4().hex[:12]}",
            username="alice_accountant",
            email="alice@companydomain.com",
            employee_id="ID_ALICE_01",
            employee_name="Alice Approver",
            name="Alice Approver",
            password_hash="testhash",
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_authorized)

    user_unauthorized = db_session.query(User).filter(User.username == "bob_intruder").first()
    if not user_unauthorized:
        user_unauthorized = User(
            user_uid=f"SUID_{uuid.uuid4().hex[:12]}",
            username="bob_intruder",
            email="bob@unrelated.net",
            employee_id="ID_BOB_02",
            employee_name="Bob Stranger",
            name="Bob Stranger",
            password_hash="testhash",
            role="employee",
            role_id=role_emp.id,
            is_active=True,
        )
        db_session.add(user_unauthorized)

    user_deactivated = db_session.query(User).filter(User.username == "carol_inactive").first()
    if not user_deactivated:
        user_deactivated = User(
            user_uid=f"SUID_{uuid.uuid4().hex[:12]}",
            username="carol_inactive",
            email="carol@companydomain.com",
            employee_id="ID_CAROL_03",
            employee_name="Carol Inactive",
            name="Carol Inactive",
            password_hash="testhash",
            role="employee",
            role_id=role_emp.id,
            is_active=False,
        )
        db_session.add(user_deactivated)

    db_session.commit()

    # 3. Test document
    doc = db_session.query(Document).filter(Document.id == "TEST-DOC-SIGNED-001").first()
    if not doc:
        doc = Document(
            id="TEST-DOC-SIGNED-001",
            doc_key="TEST-DOC-SIGNED-001",
            document_type="AP INVOICE",
            current_stage=1,
            total_stages=2,
            assigned_approver="alice_accountant",
            status="Pending Approval",
            is_deleted=False,
        )
        db_session.add(doc)
        db_session.commit()

    yield {
        "user_auth": user_authorized,
        "user_unauth": user_unauthorized,
        "user_deact": user_deactivated,
        "doc_id": "TEST-DOC-SIGNED-001",
    }


def test_1_signed_url_unauthenticated_request_returns_401(test_setup):
    """Anonymous callers cannot request a signed URL."""
    res = client.get(f"/api/documents/{test_setup['doc_id']}/signed-url")
    assert res.status_code == 401


def test_2_signed_url_unauthorized_user_returns_403(test_setup):
    """A user who is not assigned and lacks view permission cannot request a signed URL."""
    token = create_access_token({"sub": test_setup["user_unauth"].username})
    res = client.get(
        f"/api/documents/{test_setup['doc_id']}/signed-url",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 403


def test_3_signed_url_authorized_user_returns_signed_url(test_setup):
    """Authorized assigned user successfully gets a signed URL."""
    token = create_access_token({"sub": test_setup["user_auth"].username})
    res = client.get(
        f"/api/documents/{test_setup['doc_id']}/signed-url?disp=inline",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["document_id"] == test_setup["doc_id"]
    assert "signed_url" in data
    assert "/api/files/signed/" in data["signed_url"]
    assert f"uid={test_setup['user_auth'].id}" in data["signed_url"]
    assert "sig=" in data["signed_url"]
    assert "expires=" in data["signed_url"]


def test_4_verify_signed_url_success(test_setup):
    """Accessing /api/files/signed/{id} with valid signature returns 200 and security headers."""
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_auth"].id,
        disp="inline",
    )
    res = client.get(token_data["signed_url"])
    assert res.status_code == 200
    assert res.headers.get("content-type") == "application/pdf"
    assert "sandbox" in res.headers.get("content-security-policy", "")
    assert "frame-ancestors 'self'" in res.headers.get("content-security-policy", "")
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert "no-store" in res.headers.get("cache-control", "")
    assert "inline" in res.headers.get("content-disposition", "")


def test_5_verify_signed_url_expired_rejected(test_setup):
    """Expired signature timestamps are rejected with 403."""
    now = int(time.time())
    expired_ts = now - 10
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_auth"].id,
        disp="inline",
        ttl=-10,
    )
    res = client.get(token_data["signed_url"])
    assert res.status_code == 403
    assert "expired" in res.json().get("detail", "").lower()


def test_6_verify_signed_url_excessive_expiry_rejected(test_setup):
    """Signatures with expiry beyond now + FILE_URL_TTL_SECONDS + 5s skew are rejected."""
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_auth"].id,
        disp="inline",
        ttl=settings.FILE_URL_TTL_SECONDS + 20,
    )
    res = client.get(token_data["signed_url"])
    assert res.status_code == 403
    assert "exceeds" in res.json().get("detail", "").lower()


def test_7_verify_signed_url_tampered_sig_rejected(test_setup):
    """Tampering with the signature digest returns 403."""
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_auth"].id,
    )
    url = token_data["signed_url"]
    tampered_url = url[:-1] + ("a" if url[-1] != "a" else "b")
    res = client.get(tampered_url)
    assert res.status_code == 403
    assert "invalid" in res.json().get("detail", "").lower()


def test_8_verify_signed_url_tampered_doc_id_rejected(test_setup):
    """Using a signature for Document A on Document B returns 403."""
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_auth"].id,
    )
    url = token_data["signed_url"].replace(test_setup["doc_id"], "OTHER-DOC-ID")
    res = client.get(url)
    assert res.status_code == 403


def test_9_verify_signed_url_tampered_disposition_rejected(test_setup):
    """Switching disposition between inline and attachment breaks signature and returns 403."""
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_auth"].id,
        disp="inline",
    )
    tampered_url = token_data["signed_url"].replace("disp=inline", "disp=attachment")
    res = client.get(tampered_url)
    assert res.status_code == 403


def test_10_verify_signed_url_tampered_uid_rejected(test_setup):
    """Switching uid in query string breaks signature and returns 403."""
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_auth"].id,
    )
    tampered_url = token_data["signed_url"].replace(
        f"uid={test_setup['user_auth'].id}",
        f"uid={test_setup['user_unauth'].id}",
    )
    res = client.get(tampered_url)
    assert res.status_code == 403


def test_11_verify_signed_url_deactivated_user_rejected(test_setup):
    """Deactivated user accounts are barred on the file route even with valid signature."""
    token_data = generate_signed_file_token(
        document_id=test_setup["doc_id"],
        user_id=test_setup["user_deact"].id,
    )
    res = client.get(token_data["signed_url"])
    assert res.status_code == 403
    assert "inactive" in res.json().get("detail", "").lower()


def test_12_legacy_file_token_param_rejected(test_setup):
    """Calling /api/documents/{id}/file?token=<valid_jwt> without Bearer header is rejected with 401."""
    token = create_access_token({"sub": test_setup["user_auth"].username})
    res = client.get(f"/api/documents/{test_setup['doc_id']}/file?token={token}")
    assert res.status_code == 401


def test_13_direct_uploads_and_stored_pdfs_mounts_removed():
    """Unauthenticated access to static mounts /uploads and /stored_pdfs returns 404."""
    res_uploads = client.get("/uploads/anyfile.pdf")
    assert res_uploads.status_code == 404

    res_stored = client.get("/stored_pdfs/approved/anyfile.pdf")
    assert res_stored.status_code == 404


def test_14_path_traversal_and_dotfiles_rejected(test_setup):
    """Traversal patterns in document_id return 400."""
    token_data = generate_signed_file_token(
        document_id="..%2F..%2Fetc%2Fpasswd",
        user_id=test_setup["user_auth"].id,
    )
    res = client.get(token_data["signed_url"])
    assert res.status_code in {400, 404}


def test_15_production_startup_guard_enforced():
    """Production guard refuses to start if FILE_URL_SIGNING_SECRET is missing, short, or default."""
    # 1. Missing / None
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_file_url_signing_secret(None, "production")
    assert "missing or empty" in str(exc_info.value).lower()

    # 2. Too short (<32 chars)
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_file_url_signing_secret("short-secret-key-12345", "production")
    assert "at least 32 characters" in str(exc_info.value).lower()

    # 3. Equal to SECRET_KEY
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_file_url_signing_secret(
            "identical-secret-key-for-both-jwt-and-files-32chars",
            "production",
            jwt_secret="identical-secret-key-for-both-jwt-and-files-32chars",
        )
    assert "distinct from secret_key" in str(exc_info.value).lower()

    # 4. Known default placeholder
    with pytest.raises(RuntimeError) as exc_info:
        validate_production_file_url_signing_secret(
            "DocuFlow-File-Signing-Secret-2026",
            "production",
        )
    assert "default" in str(exc_info.value).lower()

    # 5. Non-production allows None
    assert validate_production_file_url_signing_secret(None, "development") is True
