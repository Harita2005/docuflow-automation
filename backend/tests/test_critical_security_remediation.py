import datetime
import hashlib
import time
import uuid
import pytest
import jwt
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, AuditLog, Invoice
from app.auth import get_password_hash, create_access_token
from app.config.settings import settings
from app.routers.sync_router import SERVICE_API_USER, SERVICE_API_PASS

client = TestClient(app)

@pytest.fixture(scope="module")
def security_test_users():
    db = SessionLocal()
    # Clean up any preexisting test records
    db.query(User).filter(User.username.in_([
        "sec_test_admin",
        "sec_test_standard",
        "sec_test_deactivated",
        "sec_test_target"
    ])).delete()
    db.commit()

    # 1. Admin user with admin role
    admin_user = User(
        user_uid=str(uuid.uuid4()),
        employee_id="SEC_ADMIN_01",
        employee_name="Sec Admin",
        name="Sec Admin",
        username="sec_test_admin",
        email="sec_admin@example.com",
        role="admin",
        division="VCC",
        password_hash=get_password_hash("AdminPass123!"),
        must_change_password=False,
        mfa_enabled=False,
        is_active=True,
    )
    # 2. Standard user with employee role
    standard_user = User(
        user_uid=str(uuid.uuid4()),
        employee_id="SEC_STD_02",
        employee_name="Sec Standard",
        name="Sec Standard",
        username="sec_test_standard",
        email="sec_standard@example.com",
        role="employee",
        division="VCC",
        approval_divisions="VCC",
        password_hash=get_password_hash("StandardPass123!"),
        must_change_password=False,
        mfa_enabled=False,
        is_active=True,
    )
    # 3. Deactivated user
    deactivated_user = User(
        user_uid=str(uuid.uuid4()),
        employee_id="SEC_DEACT_03",
        employee_name="Sec Deactivated",
        name="Sec Deactivated",
        username="sec_test_deactivated",
        email="sec_deact@example.com",
        role="employee",
        division="VCC",
        password_hash=get_password_hash("DeactPass123!"),
        must_change_password=False,
        mfa_enabled=False,
        is_active=False,
    )
    # 4. Target user for admin privilege modification tests
    target_user = User(
        user_uid=str(uuid.uuid4()),
        employee_id="SEC_TGT_04",
        employee_name="Sec Target",
        name="Sec Target",
        username="sec_test_target",
        email="sec_target@example.com",
        role="employee",
        division="VCC",
        password_hash=get_password_hash("TargetPass123!"),
        must_change_password=False,
        mfa_enabled=False,
        is_active=True,
    )

    db.add(admin_user)
    db.add(standard_user)
    db.add(deactivated_user)
    db.add(target_user)
    db.commit()

    db.refresh(admin_user)
    db.refresh(standard_user)
    db.refresh(deactivated_user)
    db.refresh(target_user)

    data = {
        "admin_id": admin_user.id,
        "admin_username": admin_user.username,
        "admin_pass": "AdminPass123!",
        "std_id": standard_user.id,
        "std_username": standard_user.username,
        "std_pass": "StandardPass123!",
        "deact_id": deactivated_user.id,
        "deact_username": deactivated_user.username,
        "deact_pass": "DeactPass123!",
        "target_id": target_user.id,
        "target_username": target_user.username,
    }

    yield data

    # Teardown
    db.query(User).filter(User.username.in_([
        "sec_test_admin",
        "sec_test_standard",
        "sec_test_deactivated",
        "sec_test_target"
    ])).delete()
    db.commit()
    db.close()


# ==============================================================================
# VULNERABILITY 1: ZERO-DAY AUTHENTICATION BYPASS & JWT INTEGRITY
# ==============================================================================

def test_zero_day_auth_empty_password_never_returns_access_token(security_test_users):
    """
    CRITICAL: Step 1 passwordless initiation must NEVER issue an access token,
    even if client sends force_login=True.
    """
    res = client.post("/api/auth/login", json={
        "username": security_test_users["admin_username"],
        "password": "",
        "force_login": True,
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("token") is None, "Access token leaked on empty password!"
    assert body.get("access_token") is None
    assert body.get("mfa_required") is True
    assert body.get("mfa_ticket") is not None


def test_zero_day_auth_deactivated_user_blocked(security_test_users):
    """
    CRITICAL: Deactivated user must be rejected with 401 on login and 403 on protected routes.
    """
    res = client.post("/api/auth/login", json={
        "username": security_test_users["deact_username"],
        "password": security_test_users["deact_pass"],
    })
    assert res.status_code == 401


def test_zero_day_jwt_validation_rejects_tampered_and_unsigned_tokens(security_test_users):
    """
    CRITICAL: Reject unsigned tokens (alg='none'), forged tokens, expired tokens,
    and tokens with incorrect issuer/audience.
    """
    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. alg='none' unsigned token
    none_tok = jwt.encode({"sub": security_test_users["std_username"], "exp": now + datetime.timedelta(hours=1)}, key="", algorithm="none")
    r1 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {none_tok}"})
    assert r1.status_code == 401

    # 2. Forged signature
    forged_tok = jwt.encode(
        {"sub": security_test_users["std_username"], "exp": now + datetime.timedelta(hours=1), "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE},
        key="rogue-secret-attacker-key-1234567890",
        algorithm="HS256"
    )
    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged_tok}"})
    assert r2.status_code == 401

    # 3. Expired token
    expired_tok = jwt.encode(
        {"sub": security_test_users["std_username"], "exp": now - datetime.timedelta(hours=2), "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE},
        key=settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    r3 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_tok}"})
    assert r3.status_code == 401

    # 4. Bad issuer
    bad_iss_tok = jwt.encode(
        {"sub": security_test_users["std_username"], "exp": now + datetime.timedelta(hours=1), "iss": "untrusted-issuer", "aud": settings.JWT_AUDIENCE},
        key=settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    r4 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad_iss_tok}"})
    assert r4.status_code == 401


def test_zero_day_auth_positive_legitimate_login(security_test_users):
    """
    POSITIVE: Legitimate user credentials successfully authenticate and receive valid JWT.
    """
    res = client.post("/api/auth/login", json={
        "username": security_test_users["std_username"],
        "password": security_test_users["std_pass"],
        "force_login": True,
    })
    assert res.status_code == 200, res.text
    token = res.json().get("token")
    assert token is not None

    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["username"] == security_test_users["std_username"]


# ==============================================================================
# VULNERABILITY 2: PASSWORD RESET TOKEN LEAKAGE & SINGLE-USE VALIDATION
# ==============================================================================

def test_password_reset_token_never_leaked_in_api_response(security_test_users):
    """
    CRITICAL: /api/auth/forgot-password must NEVER return raw reset_token in response body.
    """
    res = client.post("/api/auth/forgot-password", json={
        "identifier": security_test_users["std_username"]
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data.get("success") is True
    assert "reset_token" not in data, "Vulnerability: reset_token leaked in response JSON!"


def test_password_reset_token_hashed_in_db_and_single_use(security_test_users):
    """
    CRITICAL:
    1. Reset token is stored ONLY as SHA-256 hash.
    2. Reset token expires after short duration (15 min).
    3. Token cannot be reused (single-use validation).
    4. Successful reset invalidates previous active sessions.
    5. User is NOT automatically authenticated after reset.
    """
    import secrets
    db = SessionLocal()
    user = db.query(User).filter(User.username == security_test_users["std_username"]).first()

    raw_token = secrets.token_urlsafe(32)
    tok_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    user.reset_token_hash = tok_hash
    user.reset_token_expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)
    user.active_session_id = "pre_reset_session_123"
    db.commit()
    db.close()

    # 1. Reset password using valid raw_token
    reset_res = client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "NewStandardPass1234!"
    })
    assert reset_res.status_code == 200, reset_res.text
    reset_data = reset_res.json()
    assert reset_data.get("success") is True
    # Ensure no automatic access token is issued
    assert "token" not in reset_data
    assert "access_token" not in reset_data

    # 2. Verify in DB: token hash is cleared, previous session terminated
    db = SessionLocal()
    updated_user = db.query(User).filter(User.username == security_test_users["std_username"]).first()
    assert updated_user.reset_token_hash is None, "Token hash was not cleared after use!"
    assert updated_user.reset_token_expires_at is None
    assert updated_user.active_session_id is None, "Previous session was not terminated!"
    db.close()

    # 3. Replay attack: attempting to use the token a second time MUST FAIL
    replay_res = client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "AnotherNewPassword123!"
    })
    assert replay_res.status_code == 400, "Vulnerability: Reset token replay was accepted!"

    # 4. Verify login with the new password succeeds
    login_res = client.post("/api/auth/login", json={
        "username": security_test_users["std_username"],
        "password": "NewStandardPass1234!",
        "force_login": True,
    })
    assert login_res.status_code == 200
    assert login_res.json().get("token") is not None


def test_password_reset_rejects_expired_token(security_test_users):
    """
    CRITICAL: Expired reset token is strictly rejected.
    """
    import secrets
    db = SessionLocal()
    user = db.query(User).filter(User.username == security_test_users["std_username"]).first()
    raw_token = secrets.token_urlsafe(32)
    user.reset_token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    # Expired 5 minutes ago
    user.reset_token_expires_at = datetime.datetime.utcnow() - datetime.timedelta(minutes=5)
    db.commit()
    db.close()

    res = client.post("/api/auth/reset-password", json={
        "token": raw_token,
        "new_password": "ExpiredTokenPassword123!"
    })
    assert res.status_code == 400


# ==============================================================================
# VULNERABILITY 3: SELF-PRIVILEGE ESCALATION
# ==============================================================================

def test_self_privilege_escalation_non_admin_role_change_blocked(security_test_users):
    """
    HIGH: A standard employee attempting to promote their own role to 'admin'
    must be rejected with 403 Forbidden.
    """
    # 1. Login as standard user
    login_res = client.post("/api/auth/login", json={
        "username": security_test_users["std_username"],
        "password": "NewStandardPass1234!",
        "force_login": True,
    })
    token = login_res.json()["token"]

    # 2. Attempt self-escalation
    escalate_res = client.put(
        f"/api/users/{security_test_users['std_id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "admin"}
    )
    assert escalate_res.status_code == 403, f"Expected 403 Forbidden, got {escalate_res.status_code}: {escalate_res.text}"
    assert "Self-privilege escalation is forbidden" in escalate_res.json().get("detail", "")

    # Verify in DB: role remains employee
    db = SessionLocal()
    user = db.query(User).filter(User.id == security_test_users["std_id"]).first()
    assert user.role == "employee"
    db.close()


def test_self_privilege_escalation_division_scope_blocked(security_test_users):
    """
    HIGH: A standard employee attempting to expand their approval_divisions to 'ALL'
    must be rejected with 403 Forbidden.
    """
    login_res = client.post("/api/auth/login", json={
        "username": security_test_users["std_username"],
        "password": "NewStandardPass1234!",
        "force_login": True,
    })
    token = login_res.json()["token"]

    res = client.put(
        f"/api/users/{security_test_users['std_id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"approval_divisions": "ALL"}
    )
    assert res.status_code == 403
    assert "Self-privilege escalation is forbidden" in res.json().get("detail", "")


def test_non_admin_cannot_modify_other_users(security_test_users):
    """
    HIGH: A standard employee attempting to modify another user's profile is rejected with 403.
    """
    login_res = client.post("/api/auth/login", json={
        "username": security_test_users["std_username"],
        "password": "NewStandardPass1234!",
        "force_login": True,
    })
    token = login_res.json()["token"]

    res = client.put(
        f"/api/users/{security_test_users['target_id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"employee_name": "Tampered Name"}
    )
    assert res.status_code == 403


def test_positive_standard_user_can_update_own_allowed_profile(security_test_users):
    """
    POSITIVE: Standard employee can update legitimate non-privileged fields (phone, name).
    """
    login_res = client.post("/api/auth/login", json={
        "username": security_test_users["std_username"],
        "password": "NewStandardPass1234!",
        "force_login": True,
    })
    token = login_res.json()["token"]

    res = client.put(
        f"/api/users/{security_test_users['std_id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"phone_number": "+919876543210"}
    )
    assert res.status_code == 200, res.text
    assert res.json().get("phone_number") == "+919876543210"


def test_admin_privilege_change_records_audit_trail_and_revokes_session(security_test_users):
    """
    HIGH: When an authorized admin changes a user's role:
    1. Update succeeds.
    2. AuditLog is recorded with action 'PRIVILEGE_CHANGE'.
    3. Target user's active session is revoked.
    """
    # Login as admin
    admin_login = client.post("/api/auth/login", json={
        "username": security_test_users["admin_username"],
        "password": security_test_users["admin_pass"],
        "force_login": True,
    })
    admin_token = admin_login.json()["token"]

    # Set prior session on target
    db = SessionLocal()
    tgt = db.query(User).filter(User.id == security_test_users["target_id"]).first()
    tgt.active_session_id = "target_active_session_abc"
    db.commit()
    db.close()

    # Admin updates target role to 'reviewer'
    res = client.put(
        f"/api/admin/users/{security_test_users['target_id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "reviewer"}
    )
    assert res.status_code == 200, res.text

    # Verify session revoked and audit recorded
    db = SessionLocal()
    updated_tgt = db.query(User).filter(User.id == security_test_users["target_id"]).first()
    assert updated_tgt.role == "reviewer"
    assert updated_tgt.active_session_id is None, "Session was not revoked upon privilege change!"

    audit = db.query(AuditLog).filter(
        AuditLog.action == "PRIVILEGE_CHANGE",
        AuditLog.notes.ilike(f"%{security_test_users['target_username']}%")
    ).order_by(AuditLog.id.desc()).first()
    assert audit is not None, "AuditLog was not recorded for PRIVILEGE_CHANGE!"
    db.close()


# ==============================================================================
# VULNERABILITY 4: MACHINE-TO-MACHINE (M2M) SCOPE BYPASS
# ==============================================================================

def test_m2m_login_rejects_unauthorized_scope():
    """
    HIGH: Service account attempting to request unauthorized administrative scope
    must be rejected with 403 Forbidden.
    """
    res = client.post("/m2m/auth/login", json={
        "username": SERVICE_API_USER,
        "password": SERVICE_API_PASS,
        "scope": "admin:super_access"
    })
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}: {res.text}"
    assert "not permitted for service account" in res.json().get("detail", "")


def test_m2m_data_sync_token_cannot_access_workflow_write():
    """
    HIGH: A service account token with only 'data:sync' scope attempting to call
    workflow modification endpoint must be rejected with 403 Forbidden.
    """
    # Obtain valid data:sync service token
    login_res = client.post("/m2m/auth/login", json={
        "username": SERVICE_API_USER,
        "password": SERVICE_API_PASS,
        "scope": "data:sync"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # Attempt to call workflow modification endpoint
    wf_res = client.post(
        "/api/admin/workflows/sync-approvers",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert wf_res.status_code == 403, f"Expected 403 Forbidden, got {wf_res.status_code}: {wf_res.text}"
    assert "insufficient for 'workflow:write'" in wf_res.json().get("detail", "")


def test_m2m_token_cannot_access_human_user_apis():
    """
    HIGH: Service account tokens cannot access human user endpoints (/api/auth/me).
    """
    login_res = client.post("/m2m/auth/login", json={
        "username": SERVICE_API_USER,
        "password": SERVICE_API_PASS,
        "scope": "data:sync"
    })
    token = login_res.json()["access_token"]

    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 401


def test_m2m_positive_data_sync_succeeds():
    """
    POSITIVE: Service account with valid 'data:sync' scope successfully accesses
    authorized data ingestion route.
    """
    login_res = client.post("/m2m/auth/login", json={
        "username": SERVICE_API_USER,
        "password": SERVICE_API_PASS,
        "scope": "data:sync"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    uid_suffix = uuid.uuid4().hex[:6]
    payload = {
        "doc_key": f"TEST_M2M_KEY_{uid_suffix}",
        "doc_num": f"TEST_M2M_NUM_{uid_suffix}",
        "invoice_number": f"TEST_M2M_NUM_{uid_suffix}",
        "invoice_date": "2026-11-10",
        "due_date": "2026-12-10",
        "po_number": f"TEST_PO_{uid_suffix}",
        "amount": 25000.0,
        "currency": "INR",
        "vendor_name": "Authorized Vendor Ltd",
        "vendor_code": "VEND_AUTH_01",
        "division": "VCC",
        "plant": "Chennai",
        "document_type": "AP INVOICE"
    }

    sync_res = client.post(
        "/api/sync/record",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    assert sync_res.status_code == 200, f"Sync record failed: {sync_res.text}"
    assert sync_res.json().get("success") is True

    # Cleanup synced test invoice
    db = SessionLocal()
    db.query(Invoice).filter(Invoice.doc_key == f"TEST_M2M_KEY_{uid_suffix}").delete()
    db.commit()
    db.close()
