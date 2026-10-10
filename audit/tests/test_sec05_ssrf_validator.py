import pytest
import urllib.request
from app.services.callback_service import validate_url_ssrf, execute_sp_for_callback_payload, NoRedirectHandler, ALLOWED_STORED_PROCEDURES

def test_ssrf_blocks_private_and_cloud_metadata_ips():
    dangerous_urls = [
        "http://127.0.0.1/admin",
        "http://localhost:8080/internal",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/api",
        "http://192.168.1.100/status",
        "http://172.16.0.5/secrets",
        "file:///etc/passwd",
        "ftp://internal.server/file",
    ]
    for url in dangerous_urls:
        with pytest.raises((ValueError, Exception)):
            validate_url_ssrf(url)

def test_callback_stored_procedure_whitelist():
    # Allowed procedures must pass without being overridden
    for sp in ALLOWED_STORED_PROCEDURES:
        res = execute_sp_for_callback_payload(None, sp, "TEST-DOC-1", {})
        assert sp in res or "sp_name" in res

    # Disallowed procedure must be rejected/fallback to default
    res = execute_sp_for_callback_payload(None, "sp_DropAllTables;--", "TEST-DOC-1", {})
    assert "sp_DropAllTables" not in res
    assert "sp_GetApprovalCallbackPayload" in res

def test_no_redirect_handler_blocks_redirect():
    handler = NoRedirectHandler()
    with pytest.raises(ValueError, match="HTTP redirects are prohibited"):
        handler.redirect_request(None, None, 302, "Found", {}, "http://evil.com")
