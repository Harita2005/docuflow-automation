import io
from app.database.models import Invoice
from app.auth import create_access_token

def test_replace_pdf_in_attachment_status_and_forbidden_in_other_stages(client, db_session, seed_test_data):
    admin_token = create_access_token(data={'sub': 'admin', 'role': 'admin'})
    admin_headers = {'Authorization': f'Bearer {admin_token}'}

    doc_attachment = Invoice(
        id='DOC-ATTACH-TEST',
        invoice_number='INV-ATT-01',
        vendor_name='Vendor A',
        amount=1000.0,
        status='Initiated (Attachment Status)',
        current_stage=1,
        total_stages=3,
        assigned_approver='admin'
    )
    db_session.add(doc_attachment)

    doc_stage2 = Invoice(
        id='DOC-STAGE2-TEST',
        invoice_number='INV-STG-02',
        vendor_name='Vendor B',
        amount=2000.0,
        status='In Progress (Stage 2)',
        current_stage=2,
        total_stages=3,
        assigned_approver='admin'
    )
    db_session.add(doc_stage2)

    doc_approved = Invoice(
        id='DOC-APPROVED-TEST',
        invoice_number='INV-APP-03',
        vendor_name='Vendor C',
        amount=3000.0,
        status='Approved',
        current_stage=3,
        total_stages=3,
        assigned_approver='admin'
    )
    db_session.add(doc_approved)
    db_session.commit()

    sample_pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

    # Test 1: Replace PDF on Attachment Status document -> MUST SUCCEED (200)
    res_attach = client.post(
        f'/api/documents/{doc_attachment.id}/version',
        files={'file': ('updated_invoice.pdf', io.BytesIO(sample_pdf_bytes), 'application/pdf')},
        headers=admin_headers
    )
    assert res_attach.status_code == 200, res_attach.text
    data = res_attach.json()
    assert data['success'] is True
    assert 'updated_invoice.pdf' in doc_attachment.file_name

    # Test 2: Replace PDF on Stage 2 document -> MUST BE REJECTED (403 Forbidden)
    res_stage2 = client.post(
        f'/api/documents/{doc_stage2.id}/version',
        files={'file': ('tampered_stage2.pdf', io.BytesIO(sample_pdf_bytes), 'application/pdf')},
        headers=admin_headers
    )
    assert res_stage2.status_code == 403, res_stage2.text
    assert "Attachment Status" in res_stage2.json()['detail']

    # Test 3: Replace PDF on Approved document -> MUST BE REJECTED (403 Forbidden)
    res_approved = client.post(
        f'/api/documents/{doc_approved.id}/version',
        files={'file': ('tampered_approved.pdf', io.BytesIO(sample_pdf_bytes), 'application/pdf')},
        headers=admin_headers
    )
    assert res_approved.status_code == 403, res_approved.text
