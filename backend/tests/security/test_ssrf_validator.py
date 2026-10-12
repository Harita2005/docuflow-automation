import pytest
from unittest.mock import patch
import socket
from fastapi import HTTPException

from app.services.security_service import validate_and_reconstruct_url

def test_loopback_prohibited():
    for target in [
        "http://localhost/webhook",
        "http://127.0.0.1:8000/api",
        "http://127.0.0.99:5000",
        "http://0.0.0.0:80",
    ]:
        with pytest.raises(HTTPException) as exc_info:
            validate_and_reconstruct_url(target)
        assert exc_info.value.status_code == 400
        assert "Loopback" in exc_info.value.detail or "internal" in exc_info.value.detail

def test_private_networks_prohibited():
    for target in [
        "http://10.0.1.5:8080/hook",
        "http://192.168.1.200/callback",
        "http://172.16.0.50/notify",
        "http://172.31.255.255/hook",
    ]:
        with pytest.raises(HTTPException) as exc_info:
            validate_and_reconstruct_url(target)
        assert exc_info.value.status_code == 400
        assert "internal" in exc_info.value.detail or "prohibited" in exc_info.value.detail

def test_cloud_metadata_link_local_prohibited():
    for target in [
        "http://169.254.169.254/latest/meta-data/",
        "http://169.254.1.1:80/secret",
    ]:
        with pytest.raises(HTTPException) as exc_info:
            validate_and_reconstruct_url(target)
        assert exc_info.value.status_code == 400

def test_invalid_schemes_prohibited():
    for target in [
        "file:///etc/passwd",
        "ftp://example.com/upload",
        "gopher://example.com:70",
        "javascript:alert(1)",
    ]:
        with pytest.raises(HTTPException) as exc_info:
            validate_and_reconstruct_url(target)
        assert exc_info.value.status_code == 400
        assert "scheme" in exc_info.value.detail.lower()

def test_embedded_credentials_prohibited():
    with pytest.raises(HTTPException) as exc_info:
        validate_and_reconstruct_url("https://admin:supersecret@example.com/api")
    assert exc_info.value.status_code == 400
    assert "credentials" in exc_info.value.detail.lower()

def test_invalid_ports_prohibited():
    for target in ["http://example.com:70000/api", "http://example.com:0/api"]:
        with pytest.raises(HTTPException) as exc_info:
            validate_and_reconstruct_url(target)
        assert exc_info.value.status_code == 400

def test_dns_resolving_to_private_ip_prohibited():
    # Simulate a domain that resolves to 127.0.0.1 or 192.168.1.1
    fake_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('192.168.1.55', 443))
    ]
    with patch("socket.getaddrinfo", return_value=fake_addr_info):
        with pytest.raises(HTTPException) as exc_info:
            validate_and_reconstruct_url("https://malicious-internal-rebind.com/api")
        assert exc_info.value.status_code == 400
        assert "resolves to internal IP" in exc_info.value.detail

def test_dns_resolution_failure_fails_closed():
    with patch("socket.getaddrinfo", side_effect=socket.gaierror("Name or service not known")):
        with pytest.raises(HTTPException) as exc_info:
            validate_and_reconstruct_url("https://nonexistent-fake-domain-12345.org/hook")
        assert exc_info.value.status_code == 400
        assert "DNS resolution failed" in exc_info.value.detail

def test_valid_external_url_allowed():
    fake_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))
    ]
    with patch("socket.getaddrinfo", return_value=fake_addr_info):
        clean = validate_and_reconstruct_url("https://example.com/api/v1/webhook?partner=sap")
        assert clean == "https://example.com/api/v1/webhook?partner=sap"
