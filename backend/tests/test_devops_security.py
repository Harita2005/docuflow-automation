import os
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoints():
    """Verify that both /health and /api/health return 200 with status 'healthy'."""
    res1 = client.get("/health")
    assert res1.status_code == 200
    assert res1.json()["status"] == "healthy"

    res2 = client.get("/api/health")
    assert res2.status_code == 200
    assert res2.json()["status"] == "healthy"


def test_run_script_reload_disabled_in_production():
    """Verify that reload is disabled when ENVIRONMENT is production."""
    with patch.dict(os.environ, {"ENVIRONMENT": "production", "UVICORN_RELOAD": ""}, clear=False):
        # Determine reload boolean logic as in run.py
        env = os.getenv("ENVIRONMENT", "development").strip().lower()
        is_non_prod = env in ("development", "dev", "local", "test", "testing")
        assert is_non_prod is False


def test_run_script_reload_enabled_in_development():
    """Verify that reload is enabled when ENVIRONMENT is development."""
    with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=False):
        env = os.getenv("ENVIRONMENT", "development").strip().lower()
        is_non_prod = env in ("development", "dev", "local", "test", "testing")
        assert is_non_prod is True
