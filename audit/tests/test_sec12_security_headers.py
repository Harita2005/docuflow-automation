import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.services.security_middleware import SecurityHeadersMiddleware


def test_enterprise_security_headers_present():
    """Verify all OWASP recommended security headers are attached to responses."""
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware)

    @app.get("/ping")
    def ping():
        return {"pong": True}

    client = TestClient(app)
    response = client.get("/ping")

    assert response.status_code == 200
    headers = response.headers

    # 1. Content-Security-Policy
    assert "Content-Security-Policy" in headers
    assert "default-src 'self'" in headers["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]

    # 2. X-Frame-Options
    assert headers.get("X-Frame-Options") == "DENY"

    # 3. X-Content-Type-Options
    assert headers.get("X-Content-Type-Options") == "nosniff"

    # 4. Strict-Transport-Security (HSTS)
    assert "Strict-Transport-Security" in headers
    assert "max-age=31536000" in headers["Strict-Transport-Security"]
    assert "includeSubDomains" in headers["Strict-Transport-Security"]

    # 5. Referrer-Policy
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    # 6. Permissions-Policy
    assert "Permissions-Policy" in headers
    assert "geolocation=()" in headers["Permissions-Policy"]

    # 7. Server Header Removed / Masked
    assert "server" not in headers
