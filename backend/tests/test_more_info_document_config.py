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
def setup_test_docs(db_session):
    admin = db_session.query(User).filter(User.username == "admin").first()
    normal = db_session.query(User).filter(User.username == "YUVASREE").first()
    if not normal:
        normal = db_session.query(User).filter(User.role == "employee").first()

    # Create two test documents for independent configuration testing
    doc_a = db_session.query(Invoice).filter(Invoice.id == "DOC-MOREINFO-TEST-A").first()
    if not doc_a:
        doc_a = Invoice(
            id="DOC-MOREINFO-TEST-A",
            invoice_number="INV-MOREINFO-A",
            vendor_name="Vendor Alpha",
            amount=1000.0,
            base_amount=850.0,
            tax_amount=150.0,
            status="Pending Approval",
            current_stage=1,
            document_type="AP INVOICE",
            division=normal.division or "VCC",
            contact_person=normal.username,
            custom_data=None,
            is_deleted=False,
        )
        db_session.add(doc_a)

    doc_b = db_session.query(Invoice).filter(Invoice.id == "DOC-MOREINFO-TEST-B").first()
    if not doc_b:
        doc_b = Invoice(
            id="DOC-MOREINFO-TEST-B",
            invoice_number="INV-MOREINFO-B",
            vendor_name="Vendor Beta",
            amount=2000.0,
            base_amount=1700.0,
            tax_amount=300.0,
            status="Pending Approval",
            current_stage=1,
            document_type="AP INVOICE",
            division=normal.division or "VCC",
            contact_person=normal.username,
            custom_data=None,
            is_deleted=False,
        )
        db_session.add(doc_b)

    db_session.commit()
    db_session.refresh(doc_a)
    db_session.refresh(doc_b)

    token_normal = create_access_token({"sub": normal.username, "role": normal.role})
    token_admin = create_access_token({"sub": admin.username, "role": admin.role})

    return {
        "admin": admin,
        "normal": normal,
        "doc_a": doc_a,
        "doc_b": doc_b,
        "token_normal": token_normal,
        "token_admin": token_admin,
    }


def test_independent_document_more_info_configuration(setup_test_docs, db_session):
    """
    Verifies:
    1. Document A and Document B can be configured independently with distinct fields and ordering.
    2. Document A retains its configuration after refresh/reload; Document B is unaffected.
    3. Hiding/reordering fields does NOT delete or alter underlying document data values.
    4. Resetting Document A restores defaults without affecting Document B.
    """
    doc_a_id = setup_test_docs["doc_a"].id
    doc_b_id = setup_test_docs["doc_b"].id
    headers = {"Authorization": f"Bearer {setup_test_docs['token_normal']}"}

    # Step 1: Save specific configuration for Document A (e.g., base_amount first, then tax_amount)
    fields_a = [
        {"field_key": "base_amount", "label": "Base Taxable", "category": "FINANCIAL", "source": "ERP", "display_order": 1, "is_visible": True},
        {"field_key": "tax_amount", "label": "Tax Amount", "category": "FINANCIAL", "source": "ERP", "display_order": 2, "is_visible": True},
    ]
    res_a = client.put(
        f"/api/documents/{doc_a_id}/more-info/config",
        headers=headers,
        json={"fields": fields_a, "save_as_default": False, "reset_to_default": False},
    )
    assert res_a.status_code == 200, res_a.text
    data_a = res_a.json()
    assert data_a["scope"] == "DOCUMENT"
    keys_a = [f["field_key"] for f in data_a["selected_fields"]]
    assert keys_a == ["base_amount", "tax_amount"]

    # Step 2: Save a different configuration for Document B (e.g., division first, then payment_terms)
    fields_b = [
        {"field_key": "division", "label": "Division", "category": "ORGANIZATION", "source": "ERP", "display_order": 1, "is_visible": True},
        {"field_key": "payment_terms", "label": "Payment Terms", "category": "PAYMENT", "source": "ERP", "display_order": 2, "is_visible": True},
    ]
    res_b = client.put(
        f"/api/documents/{doc_b_id}/more-info/config",
        headers=headers,
        json={"fields": fields_b, "save_as_default": False, "reset_to_default": False},
    )
    assert res_b.status_code == 200, res_b.text
    data_b = res_b.json()
    assert data_b["scope"] == "DOCUMENT"
    keys_b = [f["field_key"] for f in data_b["selected_fields"]]
    assert keys_b == ["division", "payment_terms"]

    # Step 3: GET/Refresh Document A - verify Document A restored its own order, distinct from B
    get_res_a = client.get(f"/api/documents/{doc_a_id}/more-info/config", headers=headers)
    assert get_res_a.status_code == 200, get_res_a.text
    get_data_a = get_res_a.json()
    assert [f["field_key"] for f in get_data_a["selected_fields"]] == ["base_amount", "tax_amount"]
    assert get_data_a["scope"] == "DOCUMENT"

    # Step 4: GET/Refresh Document B - verify Document B retained its distinct configuration
    get_res_b = client.get(f"/api/documents/{doc_b_id}/more-info/config", headers=headers)
    assert get_res_b.status_code == 200, get_res_b.text
    get_data_b = get_res_b.json()
    assert [f["field_key"] for f in get_data_b["selected_fields"]] == ["division", "payment_terms"]
    assert get_data_b["scope"] == "DOCUMENT"

    # Step 5: Verify document data columns in database remain intact (ERP & data integrity)
    db_session.expire_all()
    reloaded_doc_a = db_session.query(Invoice).filter(Invoice.id == doc_a_id).first()
    assert reloaded_doc_a.amount == 1000.0
    assert reloaded_doc_a.base_amount == 850.0
    assert reloaded_doc_a.tax_amount == 150.0
    assert reloaded_doc_a.vendor_name == "Vendor Alpha"

    # Step 6: Reset Document A to defaults
    reset_res_a = client.put(
        f"/api/documents/{doc_a_id}/more-info/config",
        headers=headers,
        json={"fields": [], "save_as_default": False, "reset_to_default": True},
    )
    assert reset_res_a.status_code == 200, reset_res_a.text

    # After reset, Document A should not have DOCUMENT scope
    get_res_a_after = client.get(f"/api/documents/{doc_a_id}/more-info/config", headers=headers)
    assert get_res_a_after.status_code == 200
    assert get_res_a_after.json()["scope"] in ["GLOBAL", "USER"]

    # Document B must still retain its own custom configuration
    get_res_b_after = client.get(f"/api/documents/{doc_b_id}/more-info/config", headers=headers)
    assert get_res_b_after.status_code == 200
    assert [f["field_key"] for f in get_res_b_after.json()["selected_fields"]] == ["division", "payment_terms"]
    assert get_res_b_after.json()["scope"] == "DOCUMENT"
