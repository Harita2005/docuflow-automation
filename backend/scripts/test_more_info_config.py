import json
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database.connection import SessionLocal
from app.database.models import (
    DocumentTypeFieldConfiguration,
    Invoice,
    User,
    AuditLog,
    SystemEngineLog,
)
from app.auth import create_access_token


@pytest.fixture(scope="module")
def db_session():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def test_users(db_session):
    # Fetch real users from DB
    admin_user = db_session.query(User).filter(User.username == "admin").first()
    if not admin_user:
        admin_user = db_session.query(User).filter(User.role == "admin").first()

    user_a = db_session.query(User).filter(User.username == "VIGNESH").first()
    if not user_a:
        user_a = db_session.query(User).filter(User.id != admin_user.id).first()

    user_b = db_session.query(User).filter(User.username == "Nattudurai").first()
    if not user_b:
        user_b = db_session.query(User).filter(User.id.notin_([admin_user.id, user_a.id])).first()

    return {
        "user_a": user_a,
        "token_a": create_access_token({"sub": user_a.username, "role": user_a.role}),
        "user_b": user_b,
        "token_b": create_access_token({"sub": user_b.username, "role": user_b.role}),
        "admin": admin_user,
        "token_admin": create_access_token({"sub": admin_user.username, "role": admin_user.role}),
    }


@pytest.fixture(scope="module")
def test_documents(db_session):
    # Fetch existing AP Invoice
    doc_ap = db_session.query(Invoice).filter(Invoice.document_type.ilike("%AP INVOICE%"), Invoice.is_deleted == False).first()
    if not doc_ap:
        doc_ap = db_session.query(Invoice).filter(Invoice.is_deleted == False).first()

    # Ensure doc_ap has rich custom_data for discovery testing
    custom = {
        "department": "Finance",
        "po_date": "2026-09-10",
        "discount": 500.0,
        "tds": 250.0,
        "cost_center": "CC-102",
        "plant": "MAIN",
    }
    doc_ap.custom_data = json.dumps(custom)
    db_session.commit()
    db_session.refresh(doc_ap)

    # Fetch or create credit note
    doc_cn = db_session.query(Invoice).filter(Invoice.document_type.ilike("%CREDIT%"), Invoice.is_deleted == False).first()
    if not doc_cn:
        doc_cn = Invoice(
            id="TEST-CREDIT-NOTE-99",
            vendor_name="Credit Vendor",
            invoice_number="CN-12345",
            amount=5000.0,
            document_type="CREDIT NOTE",
            status="Pending Approval",
            is_deleted=False,
        )
        db_session.add(doc_cn)
        db_session.commit()
        db_session.refresh(doc_cn)

    return {"doc_ap": doc_ap, "doc_cn": doc_cn}


def test_get_more_info_config_default(client, test_users, test_documents):
    """Verify GET config returns discovered available fields and initial default."""
    doc_id = test_documents["doc_ap"].id
    headers = {"Authorization": f"Bearer {test_users['token_a']}"}

    res = client.get(f"/api/documents/{doc_id}/more-info/config", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["document_type"] == "AP INVOICE"
    assert len(data["available_fields"]) > 0

    # Verify standard and dynamic fields
    avail_keys = {f["field_key"] for f in data["available_fields"]}
    assert "vendor_name" in avail_keys
    assert "invoice_number" in avail_keys
    assert "total_amount" in avail_keys
    assert "department" in avail_keys
    assert "po_date" in avail_keys

    # Verify initial selected fields default
    selected_keys = [f["field_key"] for f in data["selected_fields"]]
    assert len(selected_keys) > 0


def test_save_user_personal_config_and_isolation(client, test_users, test_documents, db_session):
    """
    Verify User A can save a personal view, which does NOT affect User B (multi-user isolation).
    """
    doc_id = test_documents["doc_ap"].id

    # Clean any prior test configs
    db_session.query(DocumentTypeFieldConfiguration).filter(
        DocumentTypeFieldConfiguration.document_type == "AP INVOICE"
    ).delete()
    db_session.commit()

    # User A selects 3 specific fields in a specific order:
    user_a_fields = [
        {"field_key": "total_amount", "display_order": 1, "is_visible": True},
        {"field_key": "vendor_name", "display_order": 2, "is_visible": True},
        {"field_key": "department", "display_order": 3, "is_visible": True},
    ]

    res_a = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_a']}"},
        json={"fields": user_a_fields, "save_as_default": False},
    )
    assert res_a.status_code == 200, res_a.text
    data_a = res_a.json()

    assert data_a["scope"] == "USER"
    assert data_a["has_user_override"] is True
    assert len(data_a["selected_fields"]) == 3
    assert [f["field_key"] for f in data_a["selected_fields"]] == [
        "total_amount",
        "vendor_name",
        "department",
    ]

    # Now verify User B fetches config for the same document:
    res_b = client.get(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_b']}"},
    )
    assert res_b.status_code == 200, res_b.text
    data_b = res_b.json()

    # User B must NOT see User A's custom 3 fields!
    assert data_b["has_user_override"] is False
    assert data_b["scope"] == "GLOBAL"
    user_b_keys = [f["field_key"] for f in data_b["selected_fields"]]
    assert user_b_keys != ["total_amount", "vendor_name", "department"]


def test_reorder_and_persistence(client, test_users, test_documents):
    """Verify User A can reorder fields and the order persists."""
    doc_id = test_documents["doc_ap"].id

    # Reorder to: department (1), total_amount (2), vendor_name (3)
    reordered_fields = [
        {"field_key": "department", "display_order": 1, "is_visible": True},
        {"field_key": "total_amount", "display_order": 2, "is_visible": True},
        {"field_key": "vendor_name", "display_order": 3, "is_visible": True},
    ]

    res = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_a']}"},
        json={"fields": reordered_fields, "save_as_default": False},
    )
    assert res.status_code == 200
    data = res.json()
    assert [f["field_key"] for f in data["selected_fields"]] == [
        "department",
        "total_amount",
        "vendor_name",
    ]

    # Fetch again to verify persistence
    res_get = client.get(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_a']}"},
    )
    assert res_get.status_code == 200
    get_data = res_get.json()
    assert [f["field_key"] for f in get_data["selected_fields"]] == [
        "department",
        "total_amount",
        "vendor_name",
    ]


def test_non_admin_cannot_save_as_default(client, test_users, test_documents):
    """Verify non-admin users cannot overwrite organization default configuration."""
    doc_id = test_documents["doc_ap"].id

    res = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_a']}"},
        json={
            "fields": [{"field_key": "vendor_name", "display_order": 1, "is_visible": True}],
            "save_as_default": True,
        },
    )
    assert res.status_code == 403
    assert "Admin privilege required" in res.text


def test_admin_can_save_organization_default(client, test_users, test_documents):
    """Verify admin can update organization default and User B inherits it."""
    doc_id = test_documents["doc_ap"].id

    new_global_fields = [
        {"field_key": "vendor_name", "display_order": 1, "is_visible": True},
        {"field_key": "vendor_gstin", "display_order": 2, "is_visible": True},
        {"field_key": "total_amount", "display_order": 3, "is_visible": True},
        {"field_key": "po_number", "display_order": 4, "is_visible": True},
    ]

    res_admin = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_admin']}"},
        json={"fields": new_global_fields, "save_as_default": True},
    )
    assert res_admin.status_code == 200, res_admin.text
    data_admin = res_admin.json()
    assert data_admin["scope"] == "GLOBAL"

    # User B (no personal override) should now inherit the new default
    res_b = client.get(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_b']}"},
    )
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert [f["field_key"] for f in data_b["selected_fields"]] == [
        "vendor_name",
        "vendor_gstin",
        "total_amount",
        "po_number",
    ]


def test_user_reset_to_default(client, test_users, test_documents):
    """Verify User A can reset their personal view back to organization default."""
    doc_id = test_documents["doc_ap"].id

    res_reset = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_a']}"},
        json={"fields": [], "reset_to_default": True},
    )
    assert res_reset.status_code == 200
    data_reset = res_reset.json()

    assert data_reset["has_user_override"] is False
    assert data_reset["scope"] == "GLOBAL"
    # Should match the global default saved by admin earlier
    assert [f["field_key"] for f in data_reset["selected_fields"]] == [
        "vendor_name",
        "vendor_gstin",
        "total_amount",
        "po_number",
    ]


def test_document_type_isolation(client, test_users, test_documents):
    """Verify Credit Note configuration is completely isolated from AP Invoice."""
    doc_cn_id = test_documents["doc_cn"].id

    res_cn = client.get(
        f"/api/documents/{doc_cn_id}/more-info/config",
        headers={"Authorization": f"Bearer {test_users['token_b']}"},
    )
    assert res_cn.status_code == 200
    data_cn = res_cn.json()
    assert data_cn["document_type"] == "CREDIT NOTE"

    cn_selected_keys = [f["field_key"] for f in data_cn["selected_fields"]]
    assert "po_number" not in cn_selected_keys


def test_source_data_safety_and_auditability(client, test_users, test_documents, db_session):
    """Verify source ERP data and custom_data are strictly unchanged, and audit log is recorded."""
    doc_id = test_documents["doc_ap"].id

    # Re-query document from DB to verify untouched ERP data
    doc = db_session.query(Invoice).filter(Invoice.id == doc_id).first()
    custom_dict = json.loads(doc.custom_data)
    assert custom_dict["department"] == "Finance"
    assert custom_dict["po_date"] == "2026-09-10"

    # Verify audit log entry
    audit_logs = (
        db_session.query(AuditLog)
        .filter(AuditLog.invoice_id == doc_id, AuditLog.action.ilike("%MORE_INFO%"))
        .all()
    )
    assert len(audit_logs) > 0

    system_logs = (
        db_session.query(SystemEngineLog)
        .filter(SystemEngineLog.module_name == "MoreInfoConfig")
        .all()
    )
    assert len(system_logs) > 0


if __name__ == "__main__":
    pytest.main(["-v", __file__])
