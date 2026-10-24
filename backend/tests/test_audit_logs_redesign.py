import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.models import AuditLog, User
from app.routers.audit import classify_audit_log, sanitize_csv_cell
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def admin_token(client, db_session):
    admin = db_session.query(User).filter(User.role.ilike("%admin%")).first()
    assert admin is not None, "Admin user must exist"
    # Create or simulate token using app auth
    from app.auth import create_access_token
    token = create_access_token(data={"sub": admin.username, "id": admin.id, "role": admin.role})
    return token


@pytest.fixture
def non_admin_token(client, db_session):
    user = db_session.query(User).filter(~User.role.ilike("%admin%")).first()
    if not user:
        pytest.skip("No non-admin user found in database")
    from app.auth import create_access_token
    token = create_access_token(data={"sub": user.username, "id": user.id, "role": user.role})
    return token


# 1. UNIT TESTS: Classification & Formula Injection Sanitization
def test_classify_audit_log():
    # Security events
    cat, out = classify_audit_log("MFA Verified", "Authentication")
    assert cat == "SECURITY"
    assert out == "Success"

    cat, out = classify_audit_log("Login Failed", "Authentication")
    assert cat == "SECURITY"
    assert out == "Failed"

    cat, out = classify_audit_log("Session Replaced", "Authentication")
    assert cat == "SECURITY"

    # Data Sync events
    cat, out = classify_audit_log("Data Ingested", "Intake (ERP)")
    assert cat == "DATA_SYNC"
    assert out == "Success"

    # Approval events
    cat, out = classify_audit_log("Approved (Stage 1)", "Stage 1")
    assert cat == "APPROVAL"
    assert out == "Success"

    cat, out = classify_audit_log("Placed on Hold", "Stage 2")
    assert cat == "APPROVAL"
    assert out == "Warning"

    # Config changes
    cat, out = classify_audit_log("Config Published", "All Rules & Steps")
    assert cat == "CONFIG"
    assert out == "Success"

    cat, out = classify_audit_log("Retention Policy Updated", "Administration")
    assert cat == "CONFIG"


def test_sanitize_csv_cell():
    # Formula injection characters =, +, -, @
    assert sanitize_csv_cell("=1+2") == "'=1+2"
    assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
    assert sanitize_csv_cell("-123") == "'-123"
    assert sanitize_csv_cell("@SUM(A1:A10)") == "'@SUM(A1:A10)"
    # Safe text
    assert sanitize_csv_cell("normal text") == "normal text"
    assert sanitize_csv_cell(12345) == "12345"
    assert sanitize_csv_cell(None) == ""


# 2. INTEGRATION TESTS: Summary Metrics Endpoint
def test_audit_summary_metrics(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/admin/audit-logs/summary?date_preset=30d", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert "total_events" in data
    assert "failed_logins" in data
    assert "security_events" in data
    assert "admin_changes" in data
    assert data["total_events"]["count"] >= 0
    assert data["failed_logins"]["count"] >= 0
    assert data["security_events"]["count"] >= 0
    assert data["admin_changes"]["count"] >= 0


# 3. INTEGRATION TESTS: Filter Options Endpoint
def test_audit_filter_options(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/admin/audit-logs/filters", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert "users" in data
    assert "actions" in data
    assert "stages" in data
    assert "categories" in data
    assert isinstance(data["users"], list)
    assert isinstance(data["actions"], list)


# 4. INTEGRATION TESTS: Paginated Query Endpoint
def test_audit_paginated_query(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/admin/audit-logs/query?page=1&page_size=10&category=ALL&date_preset=30d", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert len(data["items"]) <= 10

    if data["items"]:
        first = data["items"][0]
        assert "id" in first
        assert "user" in first
        assert "action" in first
        assert "category" in first
        assert "outcome" in first


def test_audit_category_filtering(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    for cat in ["DATA_SYNC", "APPROVAL", "SECURITY", "CONFIG"]:
        res = client.get(f"/api/admin/audit-logs/query?page=1&page_size=5&category={cat}&date_preset=30d", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert data["total"] >= 0


# 5. INTEGRATION TESTS: CSV Export Endpoint
def test_audit_csv_export(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/admin/audit-logs/export?category=ALL&date_preset=7d&limit=100", headers=headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("content-type", "")
    assert "attachment;" in res.headers.get("content-disposition", "")
    content = res.text
    lines = content.splitlines()
    assert len(lines) >= 1
    header = lines[0]
    assert "Event ID" in header
    assert "Timestamp" in header
    assert "User / Agent" in header
    assert "Action" in header
    assert "Outcome" in header


# 6. INTEGRATION TESTS: Retention Status & Policy Save
def test_audit_retention_policy_flow(client, admin_token, db_session):
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Get status
    res = client.get("/api/admin/audit-logs/retention", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "retention_days" in data
    assert "total_logs" in data
    assert "expired_logs_count" in data

    # Update retention to 30 days
    update_res = client.post(
        "/api/admin/audit-logs/retention",
        headers=headers,
        json={"retention_days": 30, "prune_now": False}
    )
    assert update_res.status_code == 200
    assert update_res.json()["retention_days"] == 30

    # Verify updated
    get_res = client.get("/api/admin/audit-logs/retention", headers=headers)
    assert get_res.json()["retention_days"] == 30

    # Reset back to 7 days
    reset_res = client.post(
        "/api/admin/audit-logs/retention",
        headers=headers,
        json={"retention_days": 7, "prune_now": False}
    )
    assert reset_res.status_code == 200


# 7. SECURITY TESTS: Non-Admin Authorization Guard
def test_non_admin_forbidden(client, non_admin_token):
    headers = {"Authorization": f"Bearer {non_admin_token}"}

    endpoints = [
        ("GET", "/api/admin/audit-logs/summary"),
        ("GET", "/api/admin/audit-logs/filters"),
        ("GET", "/api/admin/audit-logs/query"),
        ("GET", "/api/admin/audit-logs/export"),
        ("GET", "/api/admin/audit-logs/retention"),
        ("POST", "/api/admin/audit-logs/cleanup"),
    ]

    for method, path in endpoints:
        if method == "GET":
            res = client.get(path, headers=headers)
        else:
            res = client.post(path, headers=headers, json={})
        assert res.status_code == 403, f"Expected 403 Forbidden for {method} {path}, got {res.status_code}"
