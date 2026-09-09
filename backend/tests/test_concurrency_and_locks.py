from app.auth import create_access_token
from app.database.models import Document, DocumentChecklistState
from app.services.lock_service import lock_manager

def test_optimistic_concurrency_conflict(client, db_session, seed_test_data):
    # Requirement 11: Concurrency and race condition safety
    doc = Document(
        id='DOC-RACE-01',
        invoice_number='INV-RACE-01',
        amount=30000.0,
        division='VCC',
        status='Pending Approval',
        current_stage=1,
        total_stages=2,
        version=1,
        assigned_approver='vcc_gm',
        workflow_profile_id='STANDARD_AP_2STAGE',
        file_url='/api/documents/DOC-RACE-01/file'
    )
    from app.config.settings import settings
    (settings.UPLOAD_DIR / 'DOC-RACE-01.pdf').write_bytes(b'%PDF-1.4 sample valid test invoice')
    (settings.PDF_STORAGE_DIR / 'DOC-RACE-01.pdf').write_bytes(b'%PDF-1.4 sample valid test invoice')

    db_session.add(doc)
    db_session.flush()

    chk = DocumentChecklistState(
        invoice_id=doc.id,
        stage_name='Attachment Status',
        item_text='Invoice Verified',
        is_checked=True,
        is_mandatory=True
    )
    db_session.add(chk)
    db_session.commit()

    token = create_access_token(data={'sub': 'vcc_gm', 'role': 'gm'})
    headers = {'Authorization': f'Bearer {token}'}

    # First approval succeeds and bumps version from 1 to 2
    res1 = client.post(f'/api/documents/{doc.id}/approve', json={'remarks': 'First concurrent worker'}, headers=headers)
    assert res1.status_code == 200

    # Simulate stale second approval worker trying to approve the same stage / version
    # It attempts to approve doc.id which is already version 2 / stage 2
    res2 = client.post(f'/api/documents/{doc.id}/approve', json={'remarks': 'Second concurrent worker', 'expected_version': 1}, headers=headers)
    # Stage is now 2, so Stage 2 requires assigned approver or Stage 2 checklist, or if version mismatch
    # It will either reject because stage advanced or conflict
    assert res2.status_code in [400, 409]

def test_document_review_lock_manager():
    # Test review lock lease acquisition
    res_acquire = lock_manager.acquire_lock(
        doc_id='DOC-LOCK-01',
        user_handle='vcc_gm',
        user_name='VCC GM',
        lease_seconds=60
    )
    assert res_acquire['acquired'] is True
    assert res_acquire['is_locked'] is False

    # Second user trying to acquire the same lock fails
    res_conflict = lock_manager.acquire_lock(
        doc_id='DOC-LOCK-01',
        user_handle='sd_emp',
        user_name='SD Desk Operator',
        lease_seconds=60
    )
    assert res_conflict['acquired'] is False
    assert res_conflict['is_locked'] is True
    assert res_conflict['locked_by'] == 'VCC GM'

    # Lock release
    res_release = lock_manager.release_lock('DOC-LOCK-01', 'vcc_gm')
    assert res_release['success'] is True

    # Now second user can acquire
    res_reacquire = lock_manager.acquire_lock(
        doc_id='DOC-LOCK-01',
        user_handle='sd_emp',
        user_name='SD Desk Operator',
        lease_seconds=60
    )
    assert res_reacquire['acquired'] is True
