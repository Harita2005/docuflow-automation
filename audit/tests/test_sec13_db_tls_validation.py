import pytest
from app.config.settings import Settings


def test_db_tls_validation_defaults_to_strict_in_production(monkeypatch):
    """Verify that in production, TLS validation is enforced (TrustServerCertificate=no)."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("DB_TRUST_SERVER_CERTIFICATE", raising=False)
    monkeypatch.setenv("DB_USER", "test_user")
    monkeypatch.setenv("DB_PASSWORD", "test_password")

    s = Settings()
    assert s.trust_server_certificate is False
    url = s.get_database_url()
    assert "TrustServerCertificate=no" in url


def test_db_tls_validation_defaults_to_trust_in_development(monkeypatch):
    """Verify that in development, local self-signed certs are trusted (TrustServerCertificate=yes)."""
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("DB_TRUST_SERVER_CERTIFICATE", raising=False)
    monkeypatch.setenv("DB_USER", "test_user")
    monkeypatch.setenv("DB_PASSWORD", "test_password")

    s = Settings()
    assert s.trust_server_certificate is True
    url = s.get_database_url()
    assert "TrustServerCertificate=yes" in url


def test_db_tls_validation_explicit_override_in_production(monkeypatch):
    """Verify that explicit DB_TRUST_SERVER_CERTIFICATE=true overrides the production default."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DB_TRUST_SERVER_CERTIFICATE", "true")
    monkeypatch.setenv("DB_USER", "test_user")
    monkeypatch.setenv("DB_PASSWORD", "test_password")

    s = Settings()
    assert s.trust_server_certificate is True
    url = s.get_database_url()
    assert "TrustServerCertificate=yes" in url
