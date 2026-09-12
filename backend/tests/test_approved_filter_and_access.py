import datetime
from app.auth import create_access_token
from app.database.models import Invoice, AuditLog, User

def test_approved_documents_security_and_filtering(client, db_session, seed_test_data):
    # Setup test users:
    # 1. Admin
    admin_token = create_access_token(data={'sub': 'admin', 'role': 'admin'})
    admin_headers = {'Authorization': f'Bearer {admin_token}'}

    # 2. Approver A (e.g. John Approver)
    approver_a = User(
        username='approver_a',
        employee_id='EMP-001',
        employee_name='Alice Approver',
        email='alice@example.com',
        role='manager',
        password_hash='dummyhash123'
    )
    # 3. Approver B (e.g. Bob Approver)
    approver_b = User(
        username='approver_b',
        employee_id='EMP-002',
        employee_name='Bob Approver',
        email='bob@example.com',
        role='manager',
        password_hash='dummyhash123'
    )
    db_session.add_all([approver_a, approver_b])
    db_session.commit()

    token_a = create_access_token(data={'sub': 'approver_a', 'role': 'manager'})
    headers_a = {'Authorization': f'Bearer {token_a}'}

    token_b = create_access_token(data={'sub': 'approver_b', 'role': 'manager'})
    headers_b = {'Authorization': f'Bearer {token_b}'}

    # Create approved documents with different dates and types
    doc1 = Invoice(
        id='DOC-SEC-01',
        invoice_number='INV-2026-001',
        vendor_name='Acme Corp',
        document_type='AP INVOICE',
        amount=15000.0,
        status='Approved',
        invoice_date='2026-09-12',
        created_at=datetime.datetime(2026, 9, 12, 10, 0, 0)
    )
    doc2 = Invoice(
        id='DOC-SEC-02',
        invoice_number='INV-2026-002',
        vendor_name='Beta Supplies',
        document_type='PURCHASE ORDER',
        amount=25000.0,
        status='Settled',
        invoice_date='2026-09-15',
        created_at=datetime.datetime(2026, 9, 15, 11, 0, 0)
    )
    doc3 = Invoice(
        id='DOC-SEC-03',
        invoice_number='INV-2025-003',
        vendor_name='Gamma Tech',
        document_type='AP INVOICE',
        amount=50000.0,
        status='Approved',
        invoice_date='2025-05-10',
        created_at=datetime.datetime(2025, 5, 10, 12, 0, 0)
    )
    doc4 = Invoice(
        id='DOC-SEC-04',
        invoice_number='INV-2026-004',
        vendor_name='Delta Services',
        document_type='GENERAL RECORDS',
        amount=8000.0,
        status='Approved',
        invoice_date='2026-09-20',
        created_at=datetime.datetime(2026, 9, 20, 14, 0, 0)
    )
    db_session.add_all([doc1, doc2, doc3, doc4])
    db_session.commit()

    # Link approvals in AuditLog:
    # Alice approved doc1 and doc3
    log1 = AuditLog(invoice_id='DOC-SEC-01', user='Alice Approver', action='Approved (Final Approval)')
    log3 = AuditLog(invoice_id='DOC-SEC-03', user='Alice Approver', action='Approved (Stage 1)')
    
    # Bob approved doc2 and doc4
    log2 = AuditLog(invoice_id='DOC-SEC-02', user='Bob Approver', action='Approved (Finance Signoff)')
    log4 = AuditLog(invoice_id='DOC-SEC-04', user='Bob Approver', action='Approved (Manager Signoff)')

    db_session.add_all([log1, log2, log3, log4])
    db_session.commit()

    # Test 1: Admin can see all approved documents
    res_admin = client.get('/api/documents/approved', headers=admin_headers)
    assert res_admin.status_code == 200
    admin_docs = res_admin.json()
    admin_ids = {d['id'] for d in admin_docs}
    assert {'DOC-SEC-01', 'DOC-SEC-02', 'DOC-SEC-03', 'DOC-SEC-04'}.issubset(admin_ids)

    # Test 2: Normal approver Alice sees ONLY documents she approved (doc1 and doc3)
    res_a = client.get('/api/documents/approved', headers=headers_a)
    assert res_a.status_code == 200
    a_docs = res_a.json()
    a_ids = {d['id'] for d in a_docs}
    assert a_ids == {'DOC-SEC-01', 'DOC-SEC-03'}
    # Ensure Alice cannot see Bob's documents
    assert 'DOC-SEC-02' not in a_ids
    assert 'DOC-SEC-04' not in a_ids

    # Test 3: Normal approver Bob sees ONLY documents he approved (doc2 and doc4)
    res_b = client.get('/api/documents/approved', headers=headers_b)
    assert res_b.status_code == 200
    b_docs = res_b.json()
    b_ids = {d['id'] for d in b_docs}
    assert b_ids == {'DOC-SEC-02', 'DOC-SEC-04'}
    # Ensure Bob cannot see Alice's documents
    assert 'DOC-SEC-01' not in b_ids
    assert 'DOC-SEC-03' not in b_ids

    # Test 4: Year Filter (Admin queries year=2025 -> only doc3 returned among test docs)
    res_y2025 = client.get('/api/documents/approved?year=2025', headers=admin_headers)
    assert res_y2025.status_code == 200
    y2025_ids = {d['id'] for d in res_y2025.json()}
    assert 'DOC-SEC-03' in y2025_ids
    assert 'DOC-SEC-01' not in y2025_ids

    # Test 5: Month Filter (Admin queries year=2026&month=September)
    res_m9 = client.get('/api/documents/approved?year=2026&month=September', headers=admin_headers)
    assert res_m9.status_code == 200
    m9_ids = {d['id'] for d in res_m9.json()}
    assert {'DOC-SEC-01', 'DOC-SEC-02', 'DOC-SEC-04'}.issubset(m9_ids)
    assert 'DOC-SEC-03' not in m9_ids

    # Test 6: Specific Date Filter (Admin queries date=2026-09-12)
    res_date = client.get('/api/documents/approved?date=2026-09-12', headers=admin_headers)
    assert res_date.status_code == 200
    date_ids = {d['id'] for d in res_date.json()}
    assert 'DOC-SEC-01' in date_ids
    assert 'DOC-SEC-02' not in date_ids

    # Test 7: Date Range Filter (from_date=2026-09-13 to_date=2026-09-18)
    res_range = client.get('/api/documents/approved?from_date=2026-09-13&to_date=2026-09-18', headers=admin_headers)
    assert res_range.status_code == 200
    range_ids = {d['id'] for d in res_range.json()}
    assert 'DOC-SEC-02' in range_ids
    assert 'DOC-SEC-01' not in range_ids

    # Test 8: Document Type Filter (doc_type=PURCHASE ORDER)
    res_type = client.get('/api/documents/approved?doc_type=PURCHASE ORDER', headers=admin_headers)
    assert res_type.status_code == 200
    type_ids = {d['id'] for d in res_type.json()}
    assert 'DOC-SEC-02' in type_ids
    assert 'DOC-SEC-01' not in type_ids

    # Test 9: Combined Filters (year=2026, month=9, doc_type=AP INVOICE) -> only doc1
    res_comb = client.get('/api/documents/approved?year=2026&month=9&doc_type=AP INVOICE', headers=admin_headers)
    assert res_comb.status_code == 200
    comb_ids = {d['id'] for d in res_comb.json()}
    assert 'DOC-SEC-01' in comb_ids
    assert 'DOC-SEC-02' not in comb_ids
    assert 'DOC-SEC-04' not in comb_ids

    # Test 10: Server-side Pagination & X-Total-Count header
    res_page = client.get('/api/documents/approved?year=2026&page=1&page_size=2', headers=admin_headers)
    assert res_page.status_code == 200
    assert 'x-total-count' in res_page.headers or 'X-Total-Count' in res_page.headers
    total_hdr = res_page.headers.get('x-total-count') or res_page.headers.get('X-Total-Count')
    assert int(total_hdr) >= 3
    assert len(res_page.json()) == 2
