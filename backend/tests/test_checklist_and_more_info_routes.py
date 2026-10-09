import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Invoice
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def test_setup(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    normal = db_session.query(User).filter(User.username == "YUVASREE").first()
    if not normal:
        normal = db_session.query(User).filter(User.role == "employee").first()
    
    # Ensure a sample document exists
    doc = db_session.query(Invoice).filter(Invoice.is_deleted == False).first()
    if not doc:
        doc = Invoice(
            id="DOC-TEST-CHK-01",
            invoice_number="INV-CHK-01",
            vendor_name="Test Checklist Vendor",
            amount=500.0,
            status="Pending Approval",
            current_stage=1,
            document_type="INVOICE",
            is_deleted=False
        )
        db_session.add(doc)
        db_session.commit()
        db_session.refresh(doc)
        
    token_admin = create_access_token({"sub": admin.username, "role": admin.role})
    token_normal = create_access_token({"sub": normal.username, "role": normal.role})
    
    return {
        "admin": admin,
        "normal": normal,
        "doc": doc,
        "token_admin": token_admin,
        "token_normal": token_normal
    }

def test_1_checklist_route_mounted_on_documents_and_invoices(test_setup):
    """Verify both /api/documents/{id}/checklist and /api/invoices/{id}/checklist exist and accept GET/POST."""
    doc_id = test_setup["doc"].id
    headers = {"Authorization": f"Bearer {test_setup['token_normal']}"}
    
    # GET on documents path
    res_get_doc = client.get(f"/api/documents/{doc_id}/checklist", headers=headers)
    assert res_get_doc.status_code == 200, res_get_doc.text
    
    # GET on invoices path
    res_get_inv = client.get(f"/api/invoices/{doc_id}/checklist", headers=headers)
    assert res_get_inv.status_code == 200, res_get_inv.text
    
    # POST on documents path
    res_post_doc = client.post(
        f"/api/documents/{doc_id}/checklist",
        json={"checked_items": ["Verify Invoice Math"]},
        headers=headers
    )
    assert res_post_doc.status_code == 200, res_post_doc.text
    
    # POST on invoices path
    res_post_inv = client.post(
        f"/api/invoices/{doc_id}/checklist",
        json={"checked_items": ["Verify Invoice Math"]},
        headers=headers
    )
    assert res_post_inv.status_code == 200, res_post_inv.text

def test_2_more_info_config_non_admin_personal_save(test_setup):
    """Verify non-admin users can save personal more-info configuration (save_as_default=False)."""
    doc_id = test_setup["doc"].id
    headers = {"Authorization": f"Bearer {test_setup['token_normal']}"}
    
    res = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers=headers,
        json={
            "fields": [{"field_key": "vendor_name", "label": "Vendor", "category": "CORE", "source": "ERP", "display_order": 1, "is_visible": True}],
            "save_as_default": False,
            "reset_to_default": False
        }
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["scope"] == "USER"

def test_3_more_info_config_non_admin_org_default_rejected(test_setup):
    """Verify non-admin users cannot overwrite organization default configuration (save_as_default=True)."""
    doc_id = test_setup["doc"].id
    headers = {"Authorization": f"Bearer {test_setup['token_normal']}"}
    
    res = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers=headers,
        json={
            "fields": [{"field_key": "vendor_name", "label": "Vendor", "category": "CORE", "source": "ERP", "display_order": 1, "is_visible": True}],
            "save_as_default": True,
            "reset_to_default": False
        }
    )
    assert res.status_code == 403
    assert "admin privilege required" in res.json().get("detail", "").lower()

def test_4_more_info_config_admin_org_default_allowed(test_setup):
    """Verify admin users can update organization default configuration (save_as_default=True)."""
    doc_id = test_setup["doc"].id
    headers = {"Authorization": f"Bearer {test_setup['token_admin']}"}
    
    res = client.put(
        f"/api/documents/{doc_id}/more-info/config",
        headers=headers,
        json={
            "fields": [{"field_key": "vendor_name", "label": "Vendor", "category": "CORE", "source": "ERP", "display_order": 1, "is_visible": True}],
            "save_as_default": True,
            "reset_to_default": False
        }
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["scope"] == "GLOBAL"
