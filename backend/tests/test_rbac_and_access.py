import pytest
from app.auth import create_access_token
from app.models import Document

def test_unauthenticated_request_rejected(client):
    # Requirement 2: Unauthenticated requests rejected with 401
    res = client.get('/api/documents')
    assert res.status_code == 401

def test_user_management_rbac(client, seed_test_data):
    # Non-admin (employee) cannot create users
    emp_token = create_access_token(data={'sub': 'sd_emp', 'role': 'employee'})
    headers_emp = {'Authorization': f'Bearer {emp_token}'}
    res_forbidden = client.post('/api/users', json={
        'employee_id': 'EMP998',
        'employee_name': 'New Employee',
        'username': 'new_emp',
        'email': 'new@docuflow.local',
        'role': 'employee',
        'division': 'SD',
        'password': 'Password123!'
    }, headers=headers_emp)
    assert res_forbidden.status_code == 403

    # Admin can create users
    admin_token = create_access_token(data={'sub': 'admin', 'role': 'admin'})
    headers_admin = {'Authorization': f'Bearer {admin_token}'}
    res_admin = client.post('/api/users', json={
        'employee_id': 'EMP998',
        'employee_name': 'New Employee',
        'username': 'new_emp',
        'email': 'new@docuflow.local',
        'role': 'employee',
        'division': 'SD',
        'password': 'Password123!'
    }, headers=headers_admin)
    assert res_admin.status_code in [200, 201]
    assert res_admin.json()['username'] == 'new_emp'

def test_document_scoping_and_idor_protection(client, db_session, seed_test_data):
    # Requirement 4: Division Scoping & IDOR Prevention
    # Create an SD division document
    sd_doc = Document(
        id='DOC-SD-1001',
        invoice_number='INV-SD-1001',
        amount=15000.0,
        division='SD',
        status='Pending Approval',
        current_stage=1,
        total_stages=2,
        assigned_approver='sd_emp',
        workflow_profile_id='STANDARD_AP_2STAGE'
    )
    # Create a VCC division document
    vcc_doc = Document(
        id='DOC-VCC-2001',
        invoice_number='INV-VCC-2001',
        amount=50000.0,
        division='VCC',
        status='Pending Approval',
        current_stage=1,
        total_stages=2,
        assigned_approver='vcc_gm',
        workflow_profile_id='STANDARD_AP_2STAGE'
    )
    db_session.add_all([sd_doc, vcc_doc])
    db_session.commit()

    # VCC GM logs in
    vcc_token = create_access_token(data={'sub': 'vcc_gm', 'role': 'gm'})
    headers_vcc = {'Authorization': f'Bearer {vcc_token}'}

    # In document list, VCC GM should see VCC doc, but NOT SD doc
    list_res = client.get('/api/documents', headers=headers_vcc)
    assert list_res.status_code == 200
    ids_visible = [d['id'] for d in list_res.json()]
    assert 'DOC-VCC-2001' in ids_visible
    # DOC-SD-1001 must NOT be visible to VCC GM
    assert 'DOC-SD-1001' not in ids_visible

    # Direct access by ID to SD doc should be rejected with 403 (IDOR blocked)
    idor_res = client.get('/api/documents/DOC-SD-1001', headers=headers_vcc)
    assert idor_res.status_code == 403
    assert 'Access Denied' in idor_res.json()['detail']

    # Admin should see both
    admin_token = create_access_token(data={'sub': 'admin', 'role': 'admin'})
    admin_res = client.get('/api/documents', headers={'Authorization': f'Bearer {admin_token}'})
    assert admin_res.status_code == 200
    admin_ids = [d['id'] for d in admin_res.json()]
    assert 'DOC-SD-1001' in admin_ids
    assert 'DOC-VCC-2001' in admin_ids
