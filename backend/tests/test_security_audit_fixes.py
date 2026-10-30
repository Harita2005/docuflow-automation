import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth import create_access_token, get_current_active_user
from app.database.connection import get_db
from app.database.models import Invoice, User
from app.main import app
from app.schemas.schemas import DocumentSyncRequest
from app.routers.sync import _sync_to_production_schema, _upsert_single_document


@pytest.fixture
def mock_db_session():
    """Mock database session that supports queries and models without live SQL Server."""
    db = MagicMock()
    return db


@pytest.fixture
def test_users():
    """Pre-configured test user fixtures representing different RBAC roles."""
    admin_user = User(
        id=1,
        username="admin_user",
        email="admin@docuflow.local",
        role="admin",
        division="HQ",
        is_active=True,
    )

    employee_user_vcc = User(
        id=2,
        username="employee_vcc",
        email="employee.vcc@docuflow.local",
        role="employee",
        division="VCC",
        is_active=True,
    )

    unauthorized_user = User(
        id=3,
        username="unauthorized_guest",
        email="guest@docuflow.local",
        role="unauthorized_role",
        division="NONE",
        is_active=True,
    )

    inactive_user = User(
        id=4,
        username="inactive_user",
        email="inactive@docuflow.local",
        role="employee",
        division="VCC",
        is_active=False,
    )

    return {
        "admin": admin_user,
        "employee_vcc": employee_user_vcc,
        "unauthorized": unauthorized_user,
        "inactive": inactive_user,
    }


@pytest.fixture
def sample_invoices():
    """Sample invoice fixtures representing confidential business data."""
    inv_vcc = Invoice(
        id="DOC-VCC-001",
        doc_key="KEY-VCC-001",
        invoice_number="INV-VCC-1001",
        po_number="PO-VCC-2026",
        vendor_name="VCC TEXTILE SUPPLIERS PVT LTD",
        vendor_code="VEND-VCC-01",
        vendor_gstin="33AAAAA0000A1Z5",
        amount=145000.50,
        base_amount=122881.78,
        tax_amount=22118.72,
        document_type="AP INVOICE",
        division="VCC",
        department="Spinning",
        status="Pending Approval",
        current_stage=1,
        is_deleted=False,
        created_at=datetime.utcnow(),
    )

    inv_tex = Invoice(
        id="DOC-TEX-002",
        doc_key="KEY-TEX-002",
        invoice_number="INV-TEX-2002",
        po_number="PO-TEX-8888",
        vendor_name="CONFIDENTIAL FABRICS CORP",
        vendor_code="VEND-TEX-99",
        vendor_gstin="29BBBBB1111B1Z2",
        amount=980000.00,
        base_amount=830508.47,
        tax_amount=149491.53,
        document_type="AP INVOICE",
        division="TEX",
        department="Weaving",
        status="Approved",
        current_stage=2,
        is_deleted=False,
        created_at=datetime.utcnow(),
    )

    return {
        "inv_vcc": inv_vcc,
        "inv_tex": inv_tex,
    }


# =============================================================================
# ISSUE 1 TESTS: Unauthenticated & Unauthorized Invoice Information Exposure
# Endpoint: GET /api/document-types/{document_type}/more-info/config
# =============================================================================

def test_more_info_config_unauthenticated_returns_401():
    """Verify that unauthenticated requests to document-type more-info config are blocked with 401."""
    client = TestClient(app)
    response = client.get("/api/document-types/AP%20INVOICE/more-info/config")
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"


def test_more_info_config_invalid_token_returns_401():
    """Verify that requests with an invalid JWT token are rejected with 401."""
    client = TestClient(app)
    headers = {"Authorization": "Bearer invalid.malformed.jwt.token"}
    response = client.get("/api/document-types/AP%20INVOICE/more-info/config", headers=headers)
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"


def test_more_info_config_insufficient_permissions_returns_403(test_users, mock_db_session):
    """Verify that an authenticated user without required RBAC permissions is rejected with 403."""
    client = TestClient(app)
    unauthorized_user = test_users["unauthorized"]

    app.dependency_overrides[get_current_active_user] = lambda: unauthorized_user
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        token = create_access_token({"sub": unauthorized_user.username, "role": unauthorized_user.role})
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/document-types/AP%20INVOICE/more-info/config", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        assert "Insufficient permissions" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_more_info_config_regular_user_redacts_sensitive_sample_values(test_users, sample_invoices, mock_db_session):
    """
    Verify that an authorized regular user (e.g. employee) receives 200 OK but all
    sample values (vendor names, GSTIN, PO number, amounts) are redacted to None.
    """
    client = TestClient(app)
    employee = test_users["employee_vcc"]
    sample_doc = sample_invoices["inv_vcc"]

    mock_db_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = sample_doc
    mock_db_session.query.return_value.filter.return_value.all.return_value = []

    app.dependency_overrides[get_current_active_user] = lambda: employee
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        token = create_access_token({"sub": employee.username, "role": employee.role})
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/document-types/AP%20INVOICE/more-info/config", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data["can_manage_default"] is False

        # Verify that ALL sample values in available fields are sanitized (None)
        for field in data.get("available_fields", []):
            assert field["sample_value"] is None, (
                f"Data exposure: Field '{field['field_key']}' leaked sample_value='{field['sample_value']}'"
            )

        # Verify selected fields also have sample values redacted
        for field in data.get("selected_fields", []):
            assert field["sample_value"] is None, (
                f"Data exposure: Selected field '{field['field_key']}' leaked sample_value='{field['sample_value']}'"
            )
    finally:
        app.dependency_overrides.clear()


def test_more_info_config_admin_can_access_sample_values(test_users, sample_invoices, mock_db_session):
    """
    Verify that an authorized administrator receives 200 OK with can_manage_default=True
    and can inspect sample values for template administration.
    """
    client = TestClient(app)
    admin = test_users["admin"]
    sample_doc = sample_invoices["inv_vcc"]

    mock_db_session.query.return_value.filter.return_value.order_by.return_value.first.return_value = sample_doc
    mock_db_session.query.return_value.filter.return_value.all.return_value = []

    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        token = create_access_token({"sub": admin.username, "role": admin.role})
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/document-types/AP%20INVOICE/more-info/config", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["can_manage_default"] is True
    finally:
        app.dependency_overrides.clear()


def test_document_more_info_config_unauthenticated_returns_401():
    """Verify that unauthenticated calls to per-document config endpoint are blocked with 401."""
    client = TestClient(app)
    response = client.get("/api/documents/DOC-VCC-001/more-info/config")
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"


def test_document_more_info_config_division_mismatch_returns_403(test_users, sample_invoices, mock_db_session):
    """
    Verify that a user from division VCC attempting to access document config for a
    document in division TEX is rejected with 403 Forbidden.
    """
    client = TestClient(app)
    employee_vcc = test_users["employee_vcc"]
    doc_tex = sample_invoices["inv_tex"]

    mock_db_session.query.return_value.filter.return_value.filter.return_value.first.return_value = doc_tex
    mock_db_session.query.return_value.filter.return_value.first.return_value = doc_tex

    app.dependency_overrides[get_current_active_user] = lambda: employee_vcc
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        token = create_access_token({"sub": employee_vcc.username, "role": employee_vcc.role})
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/documents/DOC-TEX-002/more-info/config", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        assert "Access Denied" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


# =============================================================================
# ISSUE 2 TESTS: Unauthenticated & Unauthorized Purchase Order Exposure
# Endpoint: GET /api/erp/{po_number}
# =============================================================================

def test_erp_po_missing_auth_returns_401():
    """Verify that missing token on /api/erp/{po_number} returns 401 Unauthorized."""
    client = TestClient(app)
    response = client.get("/api/erp/PO-VCC-2026")
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"


def test_erp_po_invalid_token_returns_401():
    """Verify that an invalid or tampered JWT token on /api/erp/{po_number} returns 401."""
    client = TestClient(app)
    headers = {"Authorization": "Bearer this.is.an.invalid.token"}
    response = client.get("/api/erp/PO-VCC-2026", headers=headers)
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"


def test_erp_po_expired_token_returns_401(test_users):
    """Verify that an expired JWT token is rejected with 401."""
    client = TestClient(app)
    admin = test_users["admin"]
    expired_token = create_access_token(
        {"sub": admin.username, "role": admin.role},
        expires_delta=timedelta(minutes=-15),
    )
    headers = {"Authorization": f"Bearer {expired_token}"}
    response = client.get("/api/erp/PO-VCC-2026", headers=headers)
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"


def test_erp_po_not_found_returns_404(test_users, mock_db_session):
    """
    Verify that a non-existent PO returns 404 Not Found and does NOT leak
    mock corporate vendor names ('COIMBATORE TEXTILE TOOLS') or fake amounts.
    """
    client = TestClient(app)
    admin = test_users["admin"]

    mock_db_session.query.return_value.filter.return_value.first.return_value = None

    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        token = create_access_token({"sub": admin.username, "role": admin.role})
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get("/api/erp/NON-EXISTENT-PO-9999", headers=headers)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        assert "not found" in response.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()


def test_erp_po_division_mismatch_returns_403(test_users, sample_invoices, mock_db_session):
    """
    Verify that an unauthorized user from division VCC cannot retrieve
    purchase order details for a document belonging to division TEX (403 Forbidden).
    """
    client = TestClient(app)
    employee_vcc = test_users["employee_vcc"]
    inv_tex = sample_invoices["inv_tex"]

    mock_db_session.query.return_value.filter.return_value.first.return_value = inv_tex

    app.dependency_overrides[get_current_active_user] = lambda: employee_vcc
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        token = create_access_token({"sub": employee_vcc.username, "role": employee_vcc.role})
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get(f"/api/erp/{inv_tex.po_number}", headers=headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        assert "Access Denied" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def test_erp_po_authorized_access_returns_po_details(test_users, sample_invoices, mock_db_session):
    """
    Verify that an authorized user receives legitimate purchase order details
    preserving the expected API response schema.
    """
    client = TestClient(app)
    admin = test_users["admin"]
    inv_vcc = sample_invoices["inv_vcc"]

    mock_db_session.query.return_value.filter.return_value.first.return_value = inv_vcc

    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: mock_db_session

    try:
        token = create_access_token({"sub": admin.username, "role": admin.role})
        headers = {"Authorization": f"Bearer {token}"}
        response = client.get(f"/api/erp/{inv_vcc.po_number}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"

        data = response.json()
        assert data["po_number"] == inv_vcc.po_number
        assert data["vendor_name"] == inv_vcc.vendor_name
        assert data["amount"] == inv_vcc.amount
        assert data["status"] == inv_vcc.status
        assert isinstance(data["items"], list)
    finally:
        app.dependency_overrides.clear()


# =============================================================================
# ISSUE 3 TESTS: Runtime DDL Elimination During Synchronization
# =============================================================================

def test_sync_to_production_schema_executes_no_runtime_ddl(sample_invoices):
    """
    Verify that _sync_to_production_schema executes only standard DML statements
    (INSERT, SELECT, UPDATE) and never attempts CREATE TABLE, CREATE SCHEMA,
    ALTER TABLE, or sp_rename.
    """
    executed_statements = []
    mock_db = MagicMock()

    def record_sql(statement, *args, **kwargs):
        sql_str = str(statement).upper()
        executed_statements.append(sql_str)
        # Return mock cursor
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (1,)
        mock_cursor.scalar.return_value = None
        return mock_cursor

    mock_db.execute.side_effect = record_sql

    req = DocumentSyncRequest(
        company_code="VCC",
        division="VCC",
        doc_key="SYNC-PO-TEST-001",
        doc_num="INV-SYNC-1001",
        document_type="AP INVOICE",
    )
    inv = sample_invoices["inv_vcc"]

    _sync_to_production_schema(req, mock_db, inv)

    # Assert that no DDL statements were executed
    disallowed_keywords = ["CREATE TABLE", "CREATE SCHEMA", "ALTER TABLE", "SP_RENAME", "DROP TABLE"]
    for sql in executed_statements:
        for keyword in disallowed_keywords:
            assert keyword not in sql, f"Security Violation: Found runtime DDL '{keyword}' executed: {sql}"


def test_sql_migration_script_exists_and_contains_required_definitions():
    """
    Verify that the DBA migration script '02_integration_and_audit_schema_migration.sql'
    exists, contains all required schemas/tables, and sets least-privilege permissions.
    """
    migration_path = BACKEND_DIR.parent / "scripts" / "sql" / "02_integration_and_audit_schema_migration.sql"
    assert migration_path.is_file(), f"Migration script not found at {migration_path}"

    content = migration_path.read_text(encoding="utf-8")

    # Required schemas
    assert "CREATE SCHEMA integration" in content
    assert "CREATE SCHEMA core" in content
    assert "CREATE SCHEMA security" in content
    assert "CREATE SCHEMA audit" in content
    assert "CREATE SCHEMA rules" in content

    # Required tables
    assert "integration.source_systems" in content
    assert "integration.sync_runs" in content
    assert "integration.source_records" in content
    assert "core.document_types" in content
    assert "core.documents" in content
    assert "audit.audit_events" in content
    assert "rules.rule_evaluation_runs" in content

    # Least-privilege permissions for docuflow_app
    assert "docuflow_app" in content
    assert "GRANT SELECT, INSERT, UPDATE" in content
    assert "DENY UPDATE, DELETE ON OBJECT::audit.audit_events TO [docuflow_app]" in content
