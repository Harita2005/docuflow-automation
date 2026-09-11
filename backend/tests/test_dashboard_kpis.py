import datetime
from app.auth import create_access_token
from app.database.models import Invoice


def test_dashboard_kpi_stats_endpoints(client, db_session, seed_test_data):
    """Verify that /api/stats and /api/dashboard/stats return live, dynamic counts for Pending, Hold, and Rejected documents."""
    admin_token = create_access_token(data={"sub": "admin", "role": "admin"})
    headers = {"Authorization": f"Bearer {admin_token}"}
    now = datetime.datetime.utcnow()

    # 1. Seed documents with different real statuses
    doc_pending1 = Invoice(
        id="DOC-PEND-01",
        invoice_number="INV-PEND-01",
        vendor_name="Vendor Alpha",
        document_type="AP INVOICE",
        amount=15000.0,
        status="Pending Approval",
        created_at=now,
    )
    doc_pending2 = Invoice(
        id="DOC-PEND-02",
        invoice_number="INV-PEND-02",
        vendor_name="Vendor Beta",
        document_type="GENERAL RECORDS",
        amount=25000.0,
        status="Initiated (First Approval)",
        created_at=now,
    )
    doc_hold = Invoice(
        id="DOC-HOLD-01",
        invoice_number="INV-HOLD-01",
        vendor_name="Vendor Gamma",
        document_type="PURCHASE INVOICE",
        amount=50000.0,
        status="On Hold",
        created_at=now,
    )
    doc_rejected = Invoice(
        id="DOC-REJ-01",
        invoice_number="INV-REJ-01",
        vendor_name="Vendor Delta",
        document_type="AP INVOICE",
        amount=8000.0,
        status="Rejected / Returned (Stage 1 - Initiator Desk)",
        created_at=now,
    )
    doc_approved = Invoice(
        id="DOC-APP-01",
        invoice_number="INV-APP-01",
        vendor_name="Vendor Epsilon",
        document_type="AP INVOICE",
        amount=100000.0,
        status="Settled",
        created_at=now,
    )

    db_session.add_all([doc_pending1, doc_pending2, doc_hold, doc_rejected, doc_approved])
    db_session.commit()

    # 2. Test GET /api/stats
    res = client.get("/api/stats", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["totalDocuments"] == 5
    assert data["pendingDocuments"] == 2
    assert data["pendingApprovals"] == 2
    assert data["holdDocuments"] == 1
    assert data["rejectedDocuments"] == 1
    assert data["approvedDocuments"] == 1

    # 3. Test GET /api/dashboard/stats
    res_dash = client.get("/api/dashboard/stats", headers=headers)
    assert res_dash.status_code == 200
    data_dash = res_dash.json()
    assert data_dash["pendingDocuments"] == 2
    assert data_dash["holdDocuments"] == 1
    assert data_dash["rejectedDocuments"] == 1

    # 4. Update status of doc_pending1 to 'On Hold' and verify live dynamic update
    doc_pending1.status = "On Hold"
    db_session.commit()

    res_after_hold = client.get("/api/stats", headers=headers)
    assert res_after_hold.status_code == 200
    data_after = res_after_hold.json()
    assert data_after["pendingDocuments"] == 1
    assert data_after["holdDocuments"] == 2
    assert data_after["rejectedDocuments"] == 1

    # 5. Update status of doc_pending2 to 'Cancelled' (rejected category)
    doc_pending2.status = "Cancelled"
    db_session.commit()

    res_after_rej = client.get("/api/stats", headers=headers)
    assert res_after_rej.status_code == 200
    data_after_rej = res_after_rej.json()
    assert data_after_rej["pendingDocuments"] == 0
    assert data_after_rej["holdDocuments"] == 2
    assert data_after_rej["rejectedDocuments"] == 2
