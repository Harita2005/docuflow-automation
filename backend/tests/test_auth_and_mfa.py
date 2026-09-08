import pytest
import time
from app.auth import create_access_token

def test_login_invalid_password_rejected(client, seed_test_data):
    # Verify bypasses (password123, admin, etc.) are completely eliminated
    response = client.post('/api/auth/login', json={'username': 'admin', 'password': 'WrongPassword123'})
    assert response.status_code == 401
    assert 'Invalid username or password' in response.json()['detail']

    # Test old bypass password 'password123' fails
    response2 = client.post('/api/auth/login', json={'username': 'admin', 'password': 'password123'})
    assert response2.status_code == 401

def test_login_inactive_user_rejected(client, seed_test_data):
    # Requirement 1: Deactivated users must be rejected
    response = client.post('/api/auth/login', json={'username': 'inactive_user', 'password': 'InactivePass2026!'})
    assert response.status_code in [401, 403]
    assert 'deactivated' in response.json()['detail'].lower() or 'inactive' in response.json()['detail'].lower()

def test_login_valid_credentials_success(client, seed_test_data):
    response = client.post('/api/auth/login', json={'username': 'admin', 'password': 'AdminSecure2026!'})
    assert response.status_code == 200
    data = response.json()
    assert 'access_token' in data
    assert data['token_type'] == 'bearer'
    assert data['user']['username'] == 'admin'

def test_mfa_send_otp_rate_limiting_cooldown(client, seed_test_data):
    # Initiate login to obtain MFA ticket
    login_res = client.post('/api/auth/login', json={'username': 'admin'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']
    assert ticket is not None

    # Requirement 1: Cooldown between OTP requests (30s)
    res1 = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1['success'] is True
    # Verify preview_otp is NOT leaked in response
    assert 'preview_otp' not in data1

    # Immediate second request should trigger 429
    res2 = client.post('/api/auth/mfa/send-otp', json={'ticket': ticket, 'method': 'EMAIL'})
    assert res2.status_code == 429
    assert 'Please wait' in res2.json()['detail']

def test_mfa_verify_hardcoded_bypass_rejected(client, seed_test_data):
    # Requirement 1: 123456 bypass must be completely rejected
    login_res = client.post('/api/auth/login', json={'username': 'admin'})
    assert login_res.status_code == 200
    ticket = login_res.json()['mfa_ticket']

    res = client.post('/api/auth/mfa/verify', json={'ticket': ticket, 'method': 'EMAIL', 'code': '123456'})
    assert res.status_code in [400, 401]
    assert 'Invalid' in res.json()['detail'] or 'expired' in res.json()['detail']
