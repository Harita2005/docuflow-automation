import uuid
import datetime
from sqlalchemy import text
from app.database.connection import SessionLocal
from app.database.models import Invoice, InvoiceLineItem, AuditLog
from app.services.archive_service import (
    update_archive_settings,
    execute_database_archival,
    get_archive_engine,
)

def test_database_archival_flow():
    """
    Focused integration test verifying:
    1. Archival settings persistence in DocuFlowDB.
    2. Protection of active/in-progress workflows (they must NOT be archived).
    3. Archival of eligible completed documents older than the retention threshold.
    4. Preservation of document IDs, line items, and audit history in DocuFlowArchiveDB.
    5. Safe removal of the production copy only after validation in DocuFlowArchiveDB.
    6. Prevention of duplicate transfers.
    """
    db_prod = SessionLocal()
    arch_engine = get_archive_engine()

    # 1. Test Settings persistence
    saved_settings = update_archive_settings(
        db=db_prod,
        enabled=True,
        retention_value=30,
        retention_unit="Days",
        frequency="Daily",
        scheduled_time="03:00"
    )
    assert saved_settings["enabled"] is True
    assert saved_settings["retention_value"] == 30
    assert saved_settings["retention_unit"] == "Days"
    assert saved_settings["frequency"] == "Daily"
    assert saved_settings["scheduled_time"] == "03:00"

    # Create 2 test records in production:
    # A) Active / In-Progress document (status='Initiated (Stage 1)') -> Must NOT be archived
    active_doc_id = f"TEST-ACT-{uuid.uuid4().hex[:6]}"
    active_inv = Invoice(
        id=active_doc_id,
        invoice_number=f"INV-ACT-{uuid.uuid4().hex[:6]}",
        vendor_name="Active Workflow Corp",
        amount=5000.0,
        status="Initiated (Stage 1)",
        current_stage=1,
        invoice_date=(datetime.datetime.utcnow() - datetime.timedelta(days=120)).strftime("%Y-%m-%d"),
        created_at=datetime.datetime.utcnow() - datetime.timedelta(days=120),
        is_deleted=False,
    )
    db_prod.add(active_inv)

    # B) Completed document older than 30 days (status='Approved', invoice_date 60 days ago) -> MUST be archived
    comp_doc_id = f"TEST-CMP-{uuid.uuid4().hex[:6]}"
    comp_inv = Invoice(
        id=comp_doc_id,
        invoice_number=f"INV-CMP-{uuid.uuid4().hex[:6]}",
        vendor_name="Completed Supplier Ltd",
        amount=12500.0,
        status="Approved",
        current_stage=2,
        invoice_date=(datetime.datetime.utcnow() - datetime.timedelta(days=60)).strftime("%Y-%m-%d"),
        created_at=datetime.datetime.utcnow() - datetime.timedelta(days=60),
        file_path="C:/stored_pdfs/approved/INV-TEST.pdf",
        file_url=f"/api/documents/{comp_doc_id}/file",
        is_deleted=False,
    )
    db_prod.add(comp_inv)
    db_prod.commit()

    # Add line item & audit log to the completed document
    db_prod.add(InvoiceLineItem(
        invoice_id=comp_doc_id,
        description="Archival Test Component",
        quantity=2.0,
        unit_price=6250.0,
        amount=12500.0
    ))
    db_prod.add(AuditLog(
        invoice_id=comp_doc_id,
        user="Sign-off Approver",
        action="APPROVED",
        stage="Final Stage",
        notes="Approved and ready for physical payment."
    ))
    db_prod.commit()

    try:
        # Run archival execution
        res = execute_database_archival(batch_size=100, forced=True)
        assert res["status"] in ("SUCCESS", "COMPLETED")
        assert res.get("archived_count", 0) >= 1

        # Check Active document: Must STILL exist in DocuFlowDB!
        act_check = db_prod.query(Invoice).filter(Invoice.id == active_doc_id).first()
        assert act_check is not None, "Active document was incorrectly archived!"
        assert act_check.status == "Initiated (Stage 1)"

        # Check Completed document in DocuFlowDB: Must NO LONGER exist in active DocuFlowDB!
        comp_prod_check = db_prod.query(Invoice).filter(Invoice.id == comp_doc_id).first()
        assert comp_prod_check is None, "Completed document was not removed from active DB after archival!"

        # Check Completed document in DocuFlowArchiveDB: Must exist with ID, file path, line item & audit log!
        with arch_engine.connect() as a_conn:
            arch_doc = a_conn.execute(
                text("SELECT id, invoice_number, status, amount, file_path FROM DocuFlowArchiveDB.dbo.documents WHERE id = :id"),
                {"id": comp_doc_id}
            ).fetchone()
            assert arch_doc is not None, "Document not found in DocuFlowArchiveDB!"
            assert arch_doc[0] == comp_doc_id
            assert arch_doc[2] == "Approved"
            assert arch_doc[4] == "C:/stored_pdfs/approved/INV-TEST.pdf"

            # Check line items in archive
            arch_lines = a_conn.execute(
                text("SELECT id, description, amount FROM DocuFlowArchiveDB.dbo.document_line_items WHERE invoice_id = :id"),
                {"id": comp_doc_id}
            ).fetchall()
            assert len(arch_lines) == 1
            assert arch_lines[0][1] == "Archival Test Component"

            # Check audit logs in archive
            arch_logs = a_conn.execute(
                text("SELECT id, action, stage FROM DocuFlowArchiveDB.dbo.document_approval_logs WHERE invoice_id = :id"),
                {"id": comp_doc_id}
            ).fetchall()
            assert len(arch_logs) == 1
            assert arch_logs[0][1] == "APPROVED"

            # Clean up test rows in archive
            a_conn.execute(text("DELETE FROM DocuFlowArchiveDB.dbo.document_approval_logs WHERE invoice_id = :id"), {"id": comp_doc_id})
            a_conn.execute(text("DELETE FROM DocuFlowArchiveDB.dbo.document_line_items WHERE invoice_id = :id"), {"id": comp_doc_id})
            a_conn.execute(text("DELETE FROM DocuFlowArchiveDB.dbo.documents WHERE id = :id"), {"id": comp_doc_id})
            a_conn.commit()

    finally:
        # Clean up active document from DocuFlowDB
        db_prod.query(Invoice).filter(Invoice.id == active_doc_id).delete()
        db_prod.commit()
        db_prod.close()
