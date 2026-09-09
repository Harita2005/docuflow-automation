from app.auth import create_access_token
from app.database.models import Document, DocumentChecklistState

def test_checklist_enforcement_and_stage_advance(client, db_session, seed_test_data):
    from app.config.settings import settings
    (settings.UPLOAD_DIR / 'DOC-CHK-01.pdf').write_bytes(b'%PDF-1.4 sample valid test invoice')
    (settings.PDF_STORAGE_DIR / 'DOC-CHK-01.pdf').write_bytes(b'%PDF-1.4 sample valid test invoice')

    # Create test document at stage 1
    doc = Document(
        id='DOC-CHK-01',
        invoice_number='INV-CHK-01',
        amount=25000.0,
        division='VCC',
        status='Pending Approval',
        current_stage=1,
        total_stages=2,
        assigned_approver='vcc_gm',
        workflow_profile_id='STANDARD_AP_2STAGE',
        file_url='/api/documents/DOC-CHK-01/file'
    )
    db_session.add(doc)
    db_session.flush()

    # Add checklist items (1 mandatory, 1 optional)
    chk_mandatory = DocumentChecklistState(
        invoice_id=doc.id,
        stage_name='Attachment Status',
        item_text='Physical Tax Invoice Verified',
        is_checked=False,
        is_mandatory=True
    )
    chk_optional = DocumentChecklistState(
        invoice_id=doc.id,
        stage_name='Attachment Status',
        item_text='Optional Packaging Slip',
        is_checked=False,
        is_mandatory=False
    )
    db_session.add_all([chk_mandatory, chk_optional])
    db_session.commit()

    token = create_access_token(data={'sub': 'vcc_gm', 'role': 'gm'})
    headers = {'Authorization': f'Bearer {token}'}

    # 1. Approval attempt while mandatory item is unchecked -> must fail with 400
    res_blocked = client.post(f'/api/documents/{doc.id}/approve', json={'remarks': 'Approving without check'}, headers=headers)
    assert res_blocked.status_code == 400
    assert 'Compliance Checklist Incomplete' in res_blocked.json()['detail']
    assert 'Physical Tax Invoice Verified' in res_blocked.json()['detail']

    # 2. Check the mandatory item (leave optional unchecked)
    chk_mandatory.is_checked = True
    db_session.commit()

    # 3. Approval should now succeed even with optional item unchecked
    res_approved = client.post(f'/api/documents/{doc.id}/approve', json={'remarks': 'Compliance verified'}, headers=headers)
    assert res_approved.status_code == 200
    assert res_approved.json()['current_stage'] == 2

    # Verify document advanced in DB
    db_session.refresh(doc)
    assert doc.current_stage == 2
    assert 'Stage 2' in doc.status

def test_terminal_state_approval_blocked(client, db_session, seed_test_data):
    doc = Document(
        id='DOC-SETTLED-01',
        invoice_number='INV-SETTLED-01',
        amount=10000.0,
        division='VCC',
        status='Settled',
        current_stage=2,
        total_stages=2,
        assigned_approver='vcc_gm',
        workflow_profile_id='STANDARD_AP_2STAGE'
    )
    db_session.add(doc)
    db_session.commit()

    token = create_access_token(data={'sub': 'vcc_gm', 'role': 'gm'})
    headers = {'Authorization': f'Bearer {token}'}

    res = client.post(f'/api/documents/{doc.id}/approve', json={'remarks': 'Attempting double approval'}, headers=headers)
    assert res.status_code == 400
    assert 'terminal/completed state' in res.json()['detail']
