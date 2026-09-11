import pyotp
from app.services.mfa_service import get_mfa_ticket


def test_user_identification_by_employee_id(client, seed_test_data):
    """Test user lookup using Employee ID EMP001."""
    res = client.post('/api/auth/login', json={'username': 'EMP001'})
    assert res.status_code == 200
    data = res.json()
    assert data['mfa_required'] is True
    assert data['mfa_ticket'] is not None
    assert 'EMAIL' in data['available_methods']
    assert 'SMS' in data['available_methods']
    assert 'AUTHENTICATOR' in data['available_methods']
    assert '@' in data['masked_email']
    assert data['masked_phone'] != ''


def test_user_identification_by_username(client, seed_test_data):
    """Test user lookup using Username admin."""
    res = client.post('/api/auth/login', json={'username': 'admin'})
    assert res.status_code == 200
    data = res.json()
    assert data['mfa_required'] is True
    assert data['mfa_ticket'] is not None


def test_inactive_user_rejected(client, seed_test_data):
    """Test deactivated account is denied access."""
    res = client.post('/api/auth/login', json={'username': 'EMP999'})
    assert res.status_code in [401, 403]
    assert 'deactivated' in res.json()['detail'].lower() or 'denied' in res.json()['detail'].lower()


def test_nonexistent_user_rejected(client, seed_test_data):
    """Test non-existent user returns 401."""
    res = client.post('/api/auth/login', json={'username': 'NONEXISTENT_USER_9999'})
    assert res.status_code == 401
    assert 'not found' in res.json()['detail'].lower()


def test_email_otp_lifecycle(client, seed_test_data):
    """Test full Email OTP flow: dispatch, rate limiting, verification, single-use."""
    # 1. Login to get ticket
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']

    send_res = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data['success'] is True
    assert send_data['method'] == 'EMAIL'
    assert 'otp' in send_data
    assert len(send_data['otp']) == 6

    # 3. Rate limit: immediate resend triggers 429
    resend_res = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
    assert resend_res.status_code == 429
    assert 'Please wait' in resend_res.json()['detail']

    # 4. Wrong code fails
    wrong_verify = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket,
        'method': 'EMAIL',
        'code': '000000'
    })
    assert wrong_verify.status_code == 400
    assert 'Invalid' in wrong_verify.json()['detail']

    # 5. Extract internal OTP from memory ticket to test valid verification
    ticket_data = get_mfa_ticket(ticket)
    correct_otp = ticket_data['otp']
    assert correct_otp is not None
    assert len(correct_otp) == 6

    # 6. Verify with correct OTP
    verify_res = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket,
        'method': 'EMAIL',
        'code': correct_otp
    })
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert 'access_token' in verify_data
    assert verify_data['token_type'] == 'bearer'
    assert verify_data['user']['username'] == 'admin'

    # 7. Single use check: replaying the same OTP must fail
    replay_res = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket,
        'method': 'EMAIL',
        'code': correct_otp
    })
    assert replay_res.status_code == 400


def test_sms_otp_lifecycle(client, seed_test_data):
    """Test SMS OTP flow: dispatch to registered phone, retrieval, verification."""
    # 1. Login to get ticket
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']

    # 2. Dispatch SMS OTP
    send_res = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'SMS'})
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data['success'] is True
    assert send_data['method'] == 'SMS'
    assert 'otp' in send_data
    assert len(send_data['otp']) == 6

    # 3. Retrieve internal OTP and verify
    ticket_data = get_mfa_ticket(ticket)
    correct_otp = ticket_data['otp']
    assert correct_otp is not None

    verify_res = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket,
        'method': 'SMS',
        'code': correct_otp
    })
    assert verify_res.status_code == 200
    assert 'access_token' in verify_res.json()


def test_authenticator_totp_setup_and_subsequent_login(client, seed_test_data):
    """Test Authenticator: initial QR setup, TOTP verification, enrollment activation, and subsequent login."""
    # 1. Login for EMP002 (VCC GM)
    login1 = client.post('/api/auth/login', json={'username': 'EMP002'})
    assert login1.status_code == 200
    assert login1.json()['has_authenticator_setup'] is False
    ticket1 = login1.json()['mfa_ticket']

    # 2. First-time setup: request QR code
    setup_res = client.post('/api/auth/mfa/setup-totp', json={'ticket': ticket1})
    assert setup_res.status_code == 200
    setup_data = setup_res.json()
    secret = setup_data['secret']
    qr_svg = setup_data['qr_svg_data_url']
    assert secret is not None
    assert qr_svg.startswith('data:image/svg+xml;base64,')

    # 3. User generates TOTP code using their app (simulated via pyotp)
    totp = pyotp.TOTP(secret)
    current_code = totp.now()

    # 4. Verify TOTP code to complete enrollment & login
    verify1 = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket1,
        'method': 'AUTHENTICATOR',
        'code': current_code
    })
    assert verify1.status_code == 200
    assert 'access_token' in verify1.json()

    # 5. Subsequent login: user is now enrolled!
    login2 = client.post('/api/auth/login', json={'username': 'EMP002'})
    assert login2.status_code == 200
    assert login2.json()['has_authenticator_setup'] is True
    ticket2 = login2.json()['mfa_ticket']

    # 6. Re-requesting setup-totp now fails to protect the secret
    setup_again = client.post('/api/auth/mfa/setup-totp', json={'ticket': ticket2})
    assert setup_again.status_code == 400
    assert 'already configured' in setup_again.json()['detail'].lower()

    # 7. Subsequent login directly verifies with the current TOTP code (no QR scan)
    subsequent_code = totp.now()
    # First attempt detects active session conflict from verify1
    conflict_res = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket2,
        'method': 'AUTHENTICATOR',
        'code': subsequent_code,
    })
    assert conflict_res.status_code == 200
    assert conflict_res.json()['active_session_conflict'] is True

    # User confirms conflict modal -> calls with force_login=True
    verify2 = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket2,
        'method': 'AUTHENTICATOR',
        'code': subsequent_code,
        'force_login': True,
    })
    assert verify2.status_code == 200
    assert 'access_token' in verify2.json()
    assert verify2.json()['user']['username'] == 'vcc_gm'
