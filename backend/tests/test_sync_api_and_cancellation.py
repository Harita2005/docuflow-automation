import pytest
from app.models import Document

M2M_KEY = 'DocuFlow-M2M-Integration-Secret-2026'

def test_sync_api_unauthorized_without_key(client):
    # Requirement 12: Sync API requires M2M auth
    res = client.post('/api/sync/record', json={'amount': 1000.0, 'division': 'VCC'})
    assert res.status_code == 401

def test_sync_api_validation(client):
    headers = {'X-API-Key': M2M_KEY}
    # Invalid amount <= 0
    res_bad_amt = client.post('/api/sync/record', json={'amount': -100.0, 'division': 'VCC', 'currency': 'INR'}, headers=headers)
    assert res_bad_amt.status_code == 400
    assert 'Validation Error' in res_bad_amt.json()['detail']

    # Invalid currency
    res_bad_cur = client.post('/api/sync/record', json={'amount': 500.0, 'division': 'VCC', 'currency': 'INVALID_CURRENCY'}, headers=headers)
    assert res_bad_cur.status_code == 400

def test_sync_api_ingestion_and_idempotency(client, db_session):
    headers = {'X-API-Key': M2M_KEY}
    sync_payload = {
        'doc_key': 'ERP-SYNC-9999',
        'invoice_number': 'INV-ERP-9999',
        'amount': 42000.0,
        'currency': 'INR',
        'division': 'VCC',
        'vendor_name': 'Global Supplies Inc',
        'auto_route': False
    }
    # 1. First sync ingest
    res1 = client.post('/api/sync/record', json=sync_payload, headers=headers)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1['success'] is True
    doc_id = data1['document_id']

    # Settle the document
    doc = db_session.query(Document).filter(Document.id == doc_id).first()
    doc.status = 'Settled'
    db_session.commit()

    # 2. Repeated sync ingest with same key on settled doc should return existing status without overwriting
    res2 = client.post('/api/sync/record', json=sync_payload, headers=headers)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2['status'] == 'Settled'
    assert 'already exists' in data2['message'].lower()

def test_external_cancellation(client, db_session):
    # Requirement 14: External source cancellation
    headers = {'X-API-Key': M2M_KEY}
    
    # Create active document
    doc = Document(
        id='DOC-CANCEL-TEST-01',
        doc_key='KEY-CANCEL-01',
        invoice_number='INV-CANCEL-01',
        amount=12000.0,
        division='VCC',
        status='Pending Approval',
        current_stage=1
    )
    db_session.add(doc)
    db_session.commit()

    # 1. Cancel active document via API
    cancel_res = client.post(
        f'/api/sync/record/{doc.id}/cancel',
        json={'cancellation_reason': 'PO cancelled in ERP', 'source_application': 'SAP'},
        headers=headers
    )
    assert cancel_res.status_code == 200
    assert cancel_res.json()['status'] == 'Cancelled'

    # Verify DB state
    db_session.refresh(doc)
    assert doc.status == 'Cancelled'
    assert doc.assigned_approver is None

    # 2. Idempotent repeated cancellation returns 200 with status 'Cancelled'
    cancel_repeat = client.post(
        f'/api/sync/record/{doc.id}/cancel',
        json={'cancellation_reason': 'PO cancelled in ERP', 'source_application': 'SAP'},
        headers=headers
    )
    assert cancel_repeat.status_code == 200
    assert cancel_repeat.json()['status'] == 'Cancelled'

    # 3. Cancellation rejected on Settled document (409 Conflict)
    settled_doc = Document(
        id='DOC-ALREADY-SETTLED',
        invoice_number='INV-SETTLED-X',
        amount=8000.0,
        division='VCC',
        status='Settled'
    )
    db_session.add(settled_doc)
    db_session.commit()

    res_conflict = client.post(
        f'/api/sync/record/{settled_doc.id}/cancel',
        json={'cancellation_reason': 'Late cancellation attempt'},
        headers=headers
    )
    assert res_conflict.status_code == 409
    assert 'already completed' in res_conflict.json()['detail'].lower()
