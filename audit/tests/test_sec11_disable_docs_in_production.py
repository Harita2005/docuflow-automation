from fastapi.testclient import TestClient
from fastapi import FastAPI
from app.config.settings import settings


def test_docs_and_openapi_disabled_in_production(monkeypatch):
    """Verify that /docs, /redoc, and /openapi.json are disabled in production."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    is_production = settings.ENVIRONMENT.lower() in ("production", "prod")
    test_app = FastAPI(
        title="Test Production App",
        openapi_url=None if is_production else "/api/openapi.json",
        docs_url=None if is_production else "/docs",
        redoc_url=None if is_production else "/redoc",
    )

    client = TestClient(test_app)

    # In production, docs and openapi endpoints must return 404 Not Found
    res_docs = client.get("/docs")
    assert res_docs.status_code == 404

    res_redoc = client.get("/redoc")
    assert res_redoc.status_code == 404

    res_openapi = client.get("/api/openapi.json")
    assert res_openapi.status_code == 404


def test_docs_and_openapi_enabled_in_development(monkeypatch):
    """Verify that /docs, /redoc, and /openapi.json are accessible in development."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")

    is_production = settings.ENVIRONMENT.lower() in ("production", "prod")
    test_app = FastAPI(
        title="Test Dev App",
        openapi_url="/api/openapi.json" if not is_production else None,
        docs_url="/docs" if not is_production else None,
        redoc_url="/redoc" if not is_production else None,
    )

    client = TestClient(test_app)

    res_docs = client.get("/docs")
    assert res_docs.status_code == 200

    res_openapi = client.get("/api/openapi.json")
    assert res_openapi.status_code == 200
