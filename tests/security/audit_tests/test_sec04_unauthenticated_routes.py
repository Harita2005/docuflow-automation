import os
import sys

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_admin_roles_rejects_anonymous():
    """Verify GET /api/admin/roles returns 401 for unauthenticated requests."""
    res = client.get("/api/admin/roles")
    assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"

def test_admin_workflows_rejects_anonymous():
    """Verify GET /api/admin/workflows returns 401 for unauthenticated requests."""
    res = client.get("/api/admin/workflows")
    assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"

def test_events_stream_rejects_anonymous():
    """Verify GET /api/events/stream returns 401 for unauthenticated requests."""
    res = client.get("/api/events/stream")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"

def test_document_comments_rejects_anonymous():
    """Verify GET /api/documents/{id}/comments returns 401 for unauthenticated requests."""
    res = client.get("/api/documents/TEST-DOC-123/comments")
    assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"

def test_notifications_rejects_anonymous():
    """Verify GET /api/notifications returns 401 for unauthenticated requests."""
    res = client.get("/api/notifications")
    assert res.status_code in [401, 403], f"Expected 401/403, got {res.status_code}"

def test_public_routes_remain_accessible():
    """Verify health and login endpoints remain accessible without prior auth."""
    res_health = client.get("/health")
    assert res_health.status_code == 200

    res_login_info = client.get("/api/auth/login")
    assert res_login_info.status_code == 200
