import time
import pytest
from unittest.mock import Mock
from fastapi import Request

from app.services.security_middleware import (
    RateLimiterMiddleware,
    resolve_client_ip,
)
from app.config.settings import (
    validate_production_service_api_key,
    KNOWN_DEFAULT_SERVICE_KEYS,
)


# ---------------------------------------------------------------------------
# Rate Limiter TTL & Memory Pruning Tests
# ---------------------------------------------------------------------------

def test_1_rate_limiter_prunes_empty_and_expired_ip_keys():
    """Verify that expired timestamps and stale IP keys are deleted from memory."""
    limiter = RateLimiterMiddleware(app=None, max_auth_requests=5, window_seconds=60)

    now = time.time()
    # Add active IP and an expired IP
    limiter.auth_requests["192.168.1.10"] = [now - 10, now - 5]
    limiter.auth_requests["10.0.0.50"] = [now - 120, now - 70]   # expired

    assert "10.0.0.50" in limiter.auth_requests
    assert "192.168.1.10" in limiter.auth_requests

    # Run pruning
    pruned = limiter.prune_stale_ips(current_time=now)

    assert pruned == 1
    assert "10.0.0.50" not in limiter.auth_requests, "Expired IP key must be removed"
    assert "192.168.1.10" in limiter.auth_requests, "Active IP key must be retained"
    assert len(limiter.auth_requests["192.168.1.10"]) == 2


def test_2_rate_limiter_prunes_empty_ip_entry():
    """Verify that an IP with an empty timestamp list is pruned."""
    limiter = RateLimiterMiddleware(app=None, max_auth_requests=5, window_seconds=60)
    limiter.auth_requests["empty.ip.test"] = []

    pruned = limiter.prune_stale_ips()
    assert pruned == 1
    assert "empty.ip.test" not in limiter.auth_requests


# ---------------------------------------------------------------------------
# Client IP Resolution & Trusted Proxy Tests
# ---------------------------------------------------------------------------

def test_3_client_ip_untrusted_direct_connection_ignores_forwarded_headers():
    """
    Direct connections from untrusted public IPs MUST NOT trust X-Forwarded-For.
    Attacker cannot spoof IP by sending X-Forwarded-For: 8.8.8.8.
    """
    req = Mock(spec=Request)
    req.client = Mock()
    req.client.host = "203.0.113.195"  # Public Internet IP (Untrusted)
    req.headers = {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "x-real-ip": "1.2.3.4",
    }

    derived_ip = resolve_client_ip(req)
    assert derived_ip == "203.0.113.195", (
        f"Security violation: Untrusted peer spoofed IP via header: got {derived_ip}"
    )


def test_4_client_ip_trusted_proxy_accepts_forwarded_headers():
    """
    When the direct connection is from a known trusted reverse proxy (e.g. 127.0.0.1),
    X-Forwarded-For header is trusted to extract the real client IP.
    """
    req = Mock(spec=Request)
    req.client = Mock()
    req.client.host = "127.0.0.1"  # Loopback reverse proxy (Trusted)
    req.headers = {
        "x-forwarded-for": "198.51.100.22, 10.0.0.1",
    }

    derived_ip = resolve_client_ip(req)
    assert derived_ip == "198.51.100.22"


def test_5_client_ip_direct_connection_without_headers():
    """When no proxy headers are present, direct peer IP is returned."""
    req = Mock(spec=Request)
    req.client = Mock()
    req.client.host = "192.168.1.100"
    req.headers = {}

    derived_ip = resolve_client_ip(req)
    assert derived_ip == "192.168.1.100"


# ---------------------------------------------------------------------------
# Production SERVICE_API_KEY Validation Tests
# ---------------------------------------------------------------------------

def test_6_production_service_api_key_refuses_weak_or_default_keys():
    """Verify that in production, weak, missing, or default keys cause startup failure."""
    # 1. Missing / Empty in production -> RuntimeError
    with pytest.raises(RuntimeError) as exc1:
        validate_production_service_api_key(service_api_key="", environment="production")
    assert "missing or empty" in str(exc1.value).lower()

    # 2. Too short (< 32 chars) in production -> RuntimeError
    with pytest.raises(RuntimeError) as exc2:
        validate_production_service_api_key(service_api_key="short-secret-key-1234", environment="production")
    assert "at least 32 characters" in str(exc2.value).lower()

    # 3. Known default key in production -> RuntimeError
    for default_key in KNOWN_DEFAULT_SERVICE_KEYS:
        with pytest.raises(RuntimeError) as exc3:
            validate_production_service_api_key(service_api_key=default_key, environment="production")
        assert "default" in str(exc3.value).lower() or "placeholder" in str(exc3.value).lower()

    # 4. Valid 32+ char strong random key in production -> Passes
    valid_prod_key = "a" * 32
    assert validate_production_service_api_key(service_api_key=valid_prod_key, environment="production") is True

    # 5. Development environment allows development keys
    assert validate_production_service_api_key(service_api_key="dev-key", environment="development") is True


def test_7_otp_attempts_not_reset_on_new_otp_request():
    """Verify that requesting a new OTP does NOT reset accumulated failed attempts on the ticket."""
    from fastapi.testclient import TestClient
    from app.main import app
    from app.services.mfa_service import create_mfa_ticket, get_mfa_ticket, delete_mfa_ticket

    test_client = TestClient(app)
    ticket = create_mfa_ticket(1, "admin")
    ticket_data = get_mfa_ticket(ticket)
    # Simulate 3 previous failed attempts
    ticket_data["attempts"] = 3
    ticket_data["otp_sent_at"] = time.time() - 70  # bypass 60s cooldown

    # Request fresh OTP
    res = test_client.post(
        "/api/auth/mfa/send-otp",
        json={"ticket": ticket, "method": "EMAIL"}
    )
    assert res.status_code == 200

    # Attempts must NOT be reset to 0
    updated_data = get_mfa_ticket(ticket)
    assert updated_data.get("attempts") == 3, "Security violation: Failed attempts were reset on new OTP request"
    delete_mfa_ticket(ticket)

