import datetime
from app.auth import create_access_token
from app.database.models import Invoice


def test_approved_documents_endpoint(client, db_session, seed_test_data):
    """Verify that /api/documents/approved and /api/documents?status=approved return only approved documents."""
    admin_token = create_access_token(data={"sub": "admin", "role": "admin"})
    headers = {"Authorization": f"Bearer {admin_token}"}
    now = datetime.datetime.utcnow()

    # 1. Seed documents with Approved vs Pending vs Rejected statuses
    doc_approved1 = Invoice(
        id="DOC-APP-001",
        invoice_number="INV-APP-001",
        vendor_name="Vendor Zenith",
        document_type="AP INVOICE",
        amount=75000.0,
        status="Approved",
        division="VCC",
        created_at=now,
    )
    doc_approved2 = Invoice(
        id="DOC-APP-002",
        invoice_number="INV-APP-002",
        vendor_name="Vendor Omega",
        document_type="GENERAL RECORDS",
        amount=120000.0,
        status="Settled",
        division="SD",
        created_at=now,
    )
    doc_pending = Invoice(
        id="DOC-PEND-001",
        invoice_number="INV-PEND-001",
        vendor_name="Vendor Alpha",
        document_type="AP INVOICE",
        amount=45000.0,
        status="Pending Approval",
        division="VCC",
        created_at=now,
    )
    doc_hold = Invoice(
        id="DOC-HOLD-001",
        invoice_number="INV-HOLD-001",
        vendor_name="Vendor Beta",
        document_type="PURCHASE INVOICE",
        amount=30000.0,
        status="On Hold",
        division="VCC",
        created_at=now,
    )
    doc_rejected = Invoice(
        id="DOC-REJ-001",
        invoice_number="INV-REJ-001",
        vendor_name="Vendor Delta",
        document_type="AP INVOICE",
        amount=10000.0,
        status="Rejected / Returned (Stage 1 - Initiator Desk)",
        division="SD",
        created_at=now,
    )

    db_session.add_all([doc_approved1, doc_approved2, doc_pending, doc_hold, doc_rejected])
    db_session.commit()

    # 2. Test GET /api/documents/approved
    res_app = client.get("/api/documents/approved", headers=headers)
    assert res_app.status_code == 200
    approved_docs = res_app.json()
    assert len(approved_docs) == 2
    ids = {d["id"] for d in approved_docs}
    assert ids == {"DOC-APP-001", "DOC-APP-002"}

    # 3. Test GET /api/documents?status=approved
    res_query = client.get("/api/documents?status=approved", headers=headers)
    assert res_query.status_code == 200
    query_docs = res_query.json()
    assert len(query_docs) == 2

    # 4. Test GET /api/documents?status=workflow (excludes approved)
    res_wf = client.get("/api/documents?status=workflow", headers=headers)
    assert res_wf.status_code == 200
    wf_docs = res_wf.json()
    assert len(wf_docs) == 3
    wf_ids = {d["id"] for d in wf_docs}
    assert wf_ids == {"DOC-PEND-001", "DOC-HOLD-001", "DOC-REJ-001"}
