import datetime
import pytest
import jwt
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_access_token, decode_token
from app.config.settings import settings
from app.database.models import Document, User
from app.services.file_security import (
    sanitize_filename,
    detect_file_type_and_validate_magic,
    MAGIC_BYTES,
    DANGEROUS_EXTENSIONS,
)
from app.services.rbac_service import (
    authorize_document_access,
    get_user_approval_divisions,
)


class TestTokenAndAuthenticationSecurity:
    def test_missing_token_returns_401(self, client: TestClient):
        """Unauthenticated requests to protected endpoints must return 401."""
        response = client.get("/api/auth/me")
        assert response.status_code == 401

    def test_expired_token_rejected(self, client: TestClient):
        """Expired JWT tokens must be rejected with 401 Unauthorized."""
        expired_token = create_access_token(
            {"sub": "test_user", "role": "employee"},
            expires_delta=datetime.timedelta(seconds=-10)
        )
        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
        assert response.status_code == 401

    def test_tampered_token_signature_rejected(self, client: TestClient, auth_tokens):
        """Tokens with tampered payloads or forged signatures must be rejected."""
        valid_token = auth_tokens["admin_token"]
        tampered_token = valid_token[:-6] + "xxxxxx"
        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tampered_token}"})
        assert response.status_code == 401

    def test_invalid_bearer_format_rejected(self, client: TestClient):
        """Malformed authorization headers must return 401."""
        response = client.get("/api/auth/me", headers={"Authorization": "NotBearer token123"})
        assert response.status_code == 401


class TestServiceApiKeySecurity:
    def test_service_sync_missing_api_key_rejected(self, client: TestClient):
        """Accessing M2M sync endpoint without X-API-Key or valid token must return 401."""
        response = client.post("/api/sync/document", json={"amount": 100.0, "division": "VCC"})
        assert response.status_code == 401

    def test_service_sync_invalid_api_key_rejected(self, client: TestClient):
        """Accessing M2M sync with an invalid API key must return 401."""
        response = client.post(
            "/api/sync/document",
            headers={"X-API-Key": "invalid_untrusted_api_key_9999"},
            json={"amount": 100.0, "division": "VCC"}
        )
        assert response.status_code == 401


class TestRBACAndDivisionIsolation:
    def test_employee_cannot_create_user(self, client: TestClient, auth_tokens):
        """Regular employee must receive 403 Forbidden when attempting to create users."""
        response = client.post(
            "/api/admin/users",
            json={
                "employee_id": "EMP_UNAUTH_99",
                "employee_name": "Attacker",
                "email": "attacker@example.com",
                "role": "admin"
            },
            headers=auth_tokens["employee_headers"]
        )
        assert response.status_code == 403

    def test_cross_division_isolation_enforced(self):
        """User restricted to division VCC must NOT be authorized for documents in division VCT."""
        vcc_user = User(
            id=101,
            username="vcc_employee",
            role="employee",
            division="VCC",
            approval_divisions="VCC",
            is_active=True
        )
        vct_doc = Document(
            id="DOC-VCT-001",
            division="VCT",
            status="Pending Approval"
        )
        is_allowed = authorize_document_access(vcc_user, vct_doc, required_action="READ")
        assert is_allowed is False

    def test_global_division_user_access_authorized(self):
        """User with GLOBAL or ALL approval divisions can access documents across divisions."""
        global_user = User(
            id=102,
            username="global_finance",
            role="manager",
            division="HQ",
            approval_divisions="GLOBAL",
            is_active=True
        )
        vct_doc = Document(
            id="DOC-VCT-002",
            division="VCT",
            status="Pending Approval"
        )
        is_allowed = authorize_document_access(global_user, vct_doc, required_action="READ")
        assert is_allowed is True

    def test_admin_bypass_division_isolation(self):
        """System administrator can access documents regardless of division."""
        admin_user = User(
            id=1,
            username="admin",
            role="admin",
            division="HQ",
            approval_divisions="",
            is_active=True
        )
        vct_doc = Document(
            id="DOC-VCT-003",
            division="VCT",
            status="Pending Approval"
        )
        is_allowed = authorize_document_access(admin_user, vct_doc, required_action="READ")
        assert is_allowed is True


class TestFileUploadSecurityAndSanitization:
    def test_sanitize_filename_prevents_path_traversal(self):
        """Filename sanitization must strip directory traversal sequences."""
        malicious_filename = "../../../etc/passwd.pdf"
        clean = sanitize_filename(malicious_filename)
        assert "../" not in clean
        assert "..\\" not in clean
        assert "/" not in clean

    def test_sanitize_filename_neutralizes_dangerous_extensions(self):
        """Filename sanitization must neutralize dangerous executable extensions."""
        for ext in DANGEROUS_EXTENSIONS:
            clean = sanitize_filename(f"invoice.pdf{ext}")
            assert not clean.lower().endswith(ext)

    def test_magic_number_validation_accepts_pdf(self):
        """Validation accepts genuine PDF magic header."""
        header = b"%PDF-1.4 sample pdf stream..."
        file_type = detect_file_type_and_validate_magic(header)
        assert file_type == "pdf"

    def test_magic_number_validation_rejects_spoofed_file(self):
        """Validation rejects files with mismatched magic bytes."""
        spoofed_header = b"MZ\x90\x00\x03\x00\x00\x00"  # PE Windows executable
        with pytest.raises(HTTPException) as exc_info:
            detect_file_type_and_validate_magic(spoofed_header)
        assert exc_info.value.status_code == 400


class TestInformationLeakagePrevention:
    def test_404_error_does_not_leak_internal_paths_or_stack_traces(self, client: TestClient, auth_tokens):
        """Error responses must not leak file system paths or database credentials."""
        response = client.get("/api/invoices/INVALID_ID_TRACE_LEAK", headers=auth_tokens["admin_headers"])
        assert response.status_code == 404
        content = response.text.lower()
        assert "traceback" not in content
        assert "password" not in content
        assert "odbc" not in content
        assert "sqlalchemy" not in content
