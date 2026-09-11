import datetime
import smtplib
import ssl
from unittest.mock import patch, MagicMock
from app.database.models import OTPVerification, User
from app.services.otp_service import verify_hashed_otp


def test_smtp_auth_failure_returns_502(client, seed_test_data):
    """Verify that SMTP authentication failure returns HTTP 502 instead of fake success."""
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']

    with patch('app.services.mfa_service.os.getenv') as mock_getenv:
        def fake_getenv(key, default=None):
            if key == 'PYTEST_CURRENT_TEST':
                return None
            if key == 'SMTP_HOST':
                return 'smtp.company.com'
            if key == 'SMTP_PORT':
                return '587'
            if key in ('SMTP_USERNAME', 'SMTP_USER'):
                return 'auth_user@company.com'
            if key in ('SMTP_PASSWORD', 'SMTP_PASS'):
                return 'WrongPassword'
            return default
        mock_getenv.side_effect = fake_getenv

        with patch('smtplib.SMTP') as mock_smtp:
            server_instance = MagicMock()
            mock_smtp.return_value = server_instance
            server_instance.login.side_effect = smtplib.SMTPAuthenticationError(535, b'Authentication failed')

            send_res = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
            assert send_res.status_code == 502
            data = send_res.json()
            assert 'Email delivery failed' in data['detail']
            assert 'SMTP authentication failed' in data['detail']
            assert 'test_otp' not in data


def test_smtp_connect_error_returns_502(client, seed_test_data):
    """Verify that SMTP connection error/timeout returns HTTP 502 instead of fake success."""
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']

    with patch('app.services.mfa_service.os.getenv') as mock_getenv:
        def fake_getenv(key, default=None):
            if key == 'PYTEST_CURRENT_TEST':
                return None
            if key == 'SMTP_HOST':
                return 'smtp.unreachable.com'
            if key == 'SMTP_PORT':
                return '587'
            if key in ('SMTP_USERNAME', 'SMTP_USER'):
                return 'user@company.com'
            if key in ('SMTP_PASSWORD', 'SMTP_PASS'):
                return 'SecretPass123'
            return default
        mock_getenv.side_effect = fake_getenv

        with patch('smtplib.SMTP') as mock_smtp:
            server_instance = MagicMock()
            mock_smtp.return_value = server_instance
            server_instance.connect.side_effect = smtplib.SMTPConnectError(421, b'Cannot connect to server')

            send_res = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
            assert send_res.status_code == 502
            data = send_res.json()
            assert 'Email delivery failed' in data['detail']
            assert 'Unable to connect to SMTP server' in data['detail']


def test_smtp_tls_failure_returns_502(client, seed_test_data):
    """Verify that SMTP TLS/SSL handshake failure returns HTTP 502."""
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']

    with patch('app.services.mfa_service.os.getenv') as mock_getenv:
        def fake_getenv(key, default=None):
            if key == 'PYTEST_CURRENT_TEST':
                return None
            if key == 'SMTP_HOST':
                return 'smtp.sslerror.com'
            if key == 'SMTP_PORT':
                return '465'
            if key in ('SMTP_USERNAME', 'SMTP_USER'):
                return 'user@company.com'
            if key in ('SMTP_PASSWORD', 'SMTP_PASS'):
                return 'SecretPass123'
            return default
        mock_getenv.side_effect = fake_getenv

        with patch('smtplib.SMTP_SSL') as mock_ssl:
            server_instance = MagicMock()
            mock_ssl.return_value = server_instance
            server_instance.connect.side_effect = ssl.SSLError("Certificate verify failed")

            send_res = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
            assert send_res.status_code == 502
            data = send_res.json()
            assert 'Email delivery failed' in data['detail']
            assert 'TLS/SSL handshake failure' in data['detail']


def test_otp_stored_as_bcrypt_hash_in_db(client, db_session, seed_test_data):
    """Verify OTP is stored in database as bcrypt hash and never plaintext."""
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']

    user = db_session.query(User).filter(User.employee_id == 'EMP001').first()
    assert user is not None

    send_res = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
    assert send_res.status_code == 200
    assert 'test_otp' not in send_res.json()

    # Query database for the record
    otp_record = (
        db_session.query(OTPVerification)
        .filter(OTPVerification.user_id == user.id, OTPVerification.is_used == False)
        .first()
    )
    assert otp_record is not None
    # Hash must start with $2b$ or $2a$ (bcrypt)
    assert otp_record.otp_hash.startswith('$2')
    # Plain OTP must not be the hash
    assert len(otp_record.otp_hash) >= 50
    assert otp_record.attempts == 0
    assert otp_record.expires_at > datetime.datetime.utcnow()


def test_previous_otp_invalidated_on_new_request(client, db_session, seed_test_data):
    """Verify that requesting a new OTP invalidates the previous unconsumed OTP in the database."""
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    ticket = login_res.json()['mfa_ticket']

    user = db_session.query(User).filter(User.employee_id == 'EMP001').first()

    # Request first OTP
    client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
    first_otp_record = (
        db_session.query(OTPVerification)
        .filter(OTPVerification.user_id == user.id)
        .order_by(OTPVerification.created_at.desc())
        .first()
    )
    assert first_otp_record is not None
    first_otp_id = first_otp_record.id

    # Fast-forward 61 seconds for rate limit
    from app.services.mfa_service import get_mfa_ticket
    ticket_data = get_mfa_ticket(ticket)
    ticket_data['otp_sent_at'] = 0

    # Request second OTP
    client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})

    # First OTP must now be marked is_used = True
    db_session.expire_all()
    old_record = db_session.query(OTPVerification).filter(OTPVerification.id == first_otp_id).first()
    assert old_record.is_used is True

    # Active record must be the new one
    active_records = (
        db_session.query(OTPVerification)
        .filter(OTPVerification.user_id == user.id, OTPVerification.is_used == False)
        .all()
    )
    assert len(active_records) == 1
    assert active_records[0].id != first_otp_id


def test_otp_max_5_attempts_lockout(client, db_session, seed_test_data):
    """Verify that after 5 failed verification attempts, session is locked and OTP invalidated."""
    login_res = client.post('/api/auth/login', json={'username': 'EMP001'})
    ticket = login_res.json()['mfa_ticket']

    client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})

    # Try 4 wrong codes
    for i in range(1, 5):
        wrong_res = client.post('/api/auth/mfa/verify', json={
            'ticket': ticket,
            'method': 'EMAIL',
            'code': '999999'
        })
        assert wrong_res.status_code == 400
        assert f"{5 - i} attempt(s) remaining" in wrong_res.json()['detail']

    # 5th attempt must lock out
    fifth_res = client.post('/api/auth/mfa/verify', json={
        'ticket': ticket,
        'method': 'EMAIL',
        'code': '999999'
    })
    assert fifth_res.status_code == 400
    assert 'locked' in fifth_res.json()['detail'].lower() or 'too many' in fifth_res.json()['detail'].lower()
