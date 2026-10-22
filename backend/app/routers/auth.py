from typing import Optional, List, Dict, Any, Union
import logging
import os
import re
import uuid
import time
import datetime
from fastapi import APIRouter, Body, Depends, HTTPException, status, BackgroundTasks, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session, load_only
from app.auth import create_access_token, get_current_user, verify_password, invalidate_user_cache
from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import AuditLog, NotificationProviderConfig, User, UserAccessLog
from app.services.security_middleware import resolve_client_ip

def extract_client_ip(req: Request) -> str:
    """Extracts client IP address securely, verifying proxy trustworthiness."""
    return resolve_client_ip(req)
from app.schemas.schemas import (
    LoginRequest,
    MFASendOTPRequest,
    MFASetupTOTPRequest,
    MFASetupTOTPResponse,
    MFAVerifyRequest,
    TokenResponse,
)
from app.services.mfa_service import (
    delete_mfa_ticket,
    create_mfa_ticket,
    save_mfa_ticket,
    generate_numeric_otp,
    generate_totp_qr_svg,
    generate_totp_secret,
    get_mfa_ticket,
    get_totp_provisioning_uri,
    is_email_otp_available,
    mask_email,
    mask_phone,
    send_email_otp,
    send_sms_otp,
    verify_totp,
)
from app.services.crypto_service import encrypt_secret, decrypt_secret
from app.services.otp_service import (
    hash_otp,
    store_otp,
    get_valid_otp,
    mark_otp_used,
    increment_otp_attempts,
    verify_hashed_otp,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/auth', tags=['Authentication'])

def should_show_dev_otp() -> bool:
    """Return True if running in development/testing mode where OTP should be shown in UI."""
    return bool(getattr(settings, "SHOW_OTP_IN_UI", False) or os.getenv("SHOW_OTP_IN_UI", "").lower() in ("true", "1", "yes"))

@router.get('/login')
@router.get('/token')
def login_get_info():
    return {'status': 'online', 'endpoint': '/api/auth/login', 'supported_method': 'POST', 'instructions': "Send an HTTP POST request with Content-Type: application/json and body {'username': 'admin', 'password': 'password123', 'force_login': true} to generate your JWT Bearer token."}

@router.post('/login', response_model=TokenResponse, response_model_exclude_none=True)
@router.post('/token', response_model=TokenResponse, response_model_exclude_none=True)
async def login(
    background_tasks: BackgroundTasks,
    req: Request,
    request: Optional[Union[LoginRequest, Dict[str, Any], str]] = Body(None),
    db: Session = Depends(get_db)
):
    client_ip = extract_client_ip(req)
    ident_str = ""
    password = ""
    expires_in_minutes = None
    force_login = False
    device_info = None

    if isinstance(request, str):
        import urllib.parse
        try:
            req_dict = dict(urllib.parse.parse_qsl(request))
        except Exception:
            req_dict = {}
        request = req_dict

    if isinstance(request, dict):
        ident_str = str(request.get("username") or request.get("Username") or request.get("identifier") or request.get("email") or request.get("employee_id") or request.get("user") or "").strip()
        password = str(request.get("password") or request.get("Password") or request.get("pass") or request.get("pwd") or "")
        expires_in_minutes = request.get("expires_in_minutes")
        force_login = str(request.get("force_login", "")).lower() in ("true", "1")
        device_info = request.get("device_info")
    elif request and hasattr(request, "username"):
        ident = request.username or request.identifier or getattr(request, 'employee_id', None)
        if ident:
            ident_str = str(ident).strip()
        password = request.password or getattr(request, 'Password', None) or ""
        expires_in_minutes = request.expires_in_minutes
        force_login = bool(request.force_login)
        device_info = request.device_info

    # Flexible extraction from JSON, form-data, or url-encoded body if fields missing
    if not ident_str or not password:
        content_type = req.headers.get("content-type", "").lower()
        body_dict = {}
        if "json" in content_type:
            try:
                body_dict = await req.json()
            except Exception:
                pass
        elif "form" in content_type:
            try:
                form = await req.form()
                body_dict = dict(form)
            except Exception:
                pass
        if not body_dict:
            body_dict = dict(req.query_params)

        if body_dict:
            if not ident_str:
                for k in ["employee_id", "employeeId", "username", "Username", "userName", "identifier", "Identifier", "user", "login"]:
                    if body_dict.get(k):
                        ident_str = str(body_dict[k]).strip()
                        break
            if not password:
                for k in ["password", "Password", "pass", "pwd", "secret", "user_password"]:
                    if body_dict.get(k) is not None:
                        password = str(body_dict[k])
                        break
            if not expires_in_minutes and body_dict.get("expires_in_minutes"):
                try:
                    expires_in_minutes = int(body_dict["expires_in_minutes"])
                except Exception:
                    pass
            if not force_login and body_dict.get("force_login"):
                force_login = str(body_dict["force_login"]).lower() in ("true", "1")
            if not device_info and body_dict.get("device_info"):
                device_info = str(body_dict["device_info"])

    if not ident_str:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Username or employee ID required')
    # Strict restriction: Only Employee ID or Username allowed. Email and Phone numbers are strictly forbidden.
    if "@" in ident_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Login with email address is not permitted. Please sign in using your Employee ID or Username."
        )

    clean_digits = re.sub(r"[\s\-\(\)\+]", "", ident_str)
    is_phone_candidate = ident_str.startswith("+") or (
        clean_digits.isdigit()
        and len(clean_digits) in (10, 11, 12, 13)
        and (clean_digits.startswith("0") or clean_digits.startswith("91") or clean_digits[-10] in "56789")
    )
    if is_phone_candidate:
        exact_user_exists = db.query(User.id).filter(
            or_(User.employee_id == ident_str, User.username == ident_str)
        ).first()
        if not exact_user_exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Login with phone number is not permitted. Please sign in using your Employee ID or Username."
            )


    # Option 1 / M2M Service Client Direct Token Fast-Path:
    from app.routers.sync_router import SERVICE_API_USER, SERVICE_API_PASS
    import hmac
    if hmac.compare_digest(ident_str, SERVICE_API_USER) and hmac.compare_digest(password, SERVICE_API_PASS):
        import jwt
        expires_minutes = expires_in_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
        expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=expires_minutes)
        service_token = jwt.encode({'sub': SERVICE_API_USER, 'scope': 'data:sync', 'exp': expire}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
        return {
            'token': service_token,
            'access_token': service_token,
            'token_type': 'bearer',
            'expires_in': expires_minutes * 60,
            'user': {
                'id': 0,
                'username': SERVICE_API_USER,
                'name': 'M2M Service Client',
                'role': 'service_client',
                'employee_id': 'SERVICE_M2M'
            },
            'mfa_required': False,
            'active_session_conflict': False,
        }

    user = (
        db.query(User)
        .options(
            load_only(
                User.id,
                User.username,
                User.email,
                User.phone_number,
                User.password_hash,
                User.role,
                User.division,
                User.employee_id,
                User.employee_name,
                User.name,
                User.is_active,
                User.is_deleted,
                User.mfa_enabled,
                User.mfa_type,
                User.mfa_secret,
                User.active_session_id,
                User.active_device_info,
                User.session_created_at,
            )
        )
        .filter(
            User.username.ilike(ident_str)
            | User.employee_id.ilike(ident_str)
            | User.user_uid.ilike(ident_str)
        )
        .filter(or_(User.is_deleted == False, User.is_deleted.is_(None)))
        .first()
    )
    if not user:
        user = (
            db.query(User)
            .filter(
                User.employee_id.ilike(f'%_{ident_str}')
                | User.employee_id.ilike(f'%{ident_str}%')
                | User.username.ilike(f'%{ident_str}%')
            )
            .filter(or_(User.is_deleted == False, User.is_deleted.is_(None)))
            .first()
        )
    if not user and ident_str.isdigit():
        user = db.query(User).filter(User.id == int(ident_str)).filter(or_(User.is_deleted == False, User.is_deleted.is_(None))).first()
    dummy_hash = "$2b$12$e80MvQkQ1q8dK9nU9p8lRe8qM8qM8qM8qM8qM8qM8qM8qM8qM8qM8qM8"
    if not user:
        if password and password.strip():
            verify_password(password, dummy_hash)
        try:
            db.add(UserAccessLog(
                username=ident_str[:150],
                event_type="LOGIN_FAILED",
                status="FAILED",
                ip_address=client_ip,
                user_agent=req.headers.get("user-agent", "")[:255],
                failure_reason=f"User '{ident_str}' not found in system",
                timestamp=datetime.datetime.utcnow()
            ))
            db.add(AuditLog(
                invoice_id=None,
                user=ident_str[:150],
                action='Login Failed',
                stage='Authentication',
                notes=f"Failed login attempt from {client_ip}. User '{ident_str}' not found.",
                ip_address=client_ip
            ))
            db.commit()
        except Exception as e:
            logger.debug("Error logging failed login: %s", e)
        logger.warning(f"Login failed: User '{ident_str}' not found from IP: {client_ip}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid username or password')

    if not user.is_active:
        if password and password.strip():
            verify_password(password, user.password_hash or dummy_hash)
        try:
            db.add(UserAccessLog(
                username=user.username,
                event_type="LOGIN_FAILED",
                status="FAILED",
                ip_address=client_ip,
                user_agent=req.headers.get("user-agent", "")[:255],
                failure_reason="User account is deactivated",
                timestamp=datetime.datetime.utcnow()
            ))
            db.add(AuditLog(
                invoice_id=None,
                user=user.employee_name or user.name or user.username,
                action='Login Failed',
                stage='Authentication',
                notes=f"Failed login attempt for '{user.username}' from {client_ip}. User account is deactivated.",
                ip_address=client_ip
            ))
            db.commit()
        except Exception as e:
            logger.debug("Error logging failed login: %s", e)
        logger.warning(f"Login failed: Deactivated account for user '{user.username}' from IP: {client_ip}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid username or password')

    # If password is provided, verify it; if passwordless (user has MFA/OTP), issue ticket directly
    if password and password.strip():
        # SEC-10: Account lockout check for password attempts
        lockout_window = datetime.datetime.utcnow() - datetime.timedelta(minutes=15)
        recent_failures = (
            db.query(UserAccessLog)
            .filter(
                UserAccessLog.username == user.username,
                UserAccessLog.event_type == "LOGIN_FAILED",
                UserAccessLog.timestamp >= lockout_window,
            )
            .count()
        )

        if recent_failures >= 5:
            try:
                db.add(UserAccessLog(
                    username=user.username,
                    event_type="ACCOUNT_LOCKED",
                    status="LOCKED",
                    ip_address=client_ip,
                    user_agent=req.headers.get("user-agent", "")[:255],
                    failure_reason="Account temporarily locked due to 5 consecutive failed login attempts",
                    timestamp=datetime.datetime.utcnow()
                ))
                db.add(AuditLog(
                    invoice_id=None,
                    user=user.employee_name or user.name or user.username,
                    action='Account Locked',
                    stage='Authentication',
                    notes=f"User '{user.username}' locked out for 15 minutes after {recent_failures} failed attempts. IP: {client_ip}",
                    ip_address=client_ip
                ))
                db.commit()
            except Exception as e:
                logger.debug("Error logging lockout: %s", e)
            logger.warning(f"Login rejected: Account for user '{user.username}' is locked due to repeated failed logins. IP: {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is temporarily locked due to repeated failed login attempts. Please try again in 15 minutes or contact your administrator.",
            )

        is_valid = verify_password(password, user.password_hash or '')
        if not is_valid:
            new_failure_count = recent_failures + 1
            try:
                db.add(UserAccessLog(
                    username=user.username,
                    event_type="LOGIN_FAILED",
                    status="FAILED",
                    ip_address=client_ip,
                    user_agent=req.headers.get("user-agent", "")[:255],
                    failure_reason="Invalid credentials",
                    timestamp=datetime.datetime.utcnow()
                ))
                db.add(AuditLog(
                    invoice_id=None,
                    user=user.employee_name or user.name or user.username,
                    action='Login Failed',
                    stage='Authentication',
                    notes=f"Failed login attempt for '{user.username}' from {client_ip}. Invalid credentials (attempt {new_failure_count}/5).",
                    ip_address=client_ip
                ))
                db.commit()
            except Exception as e:
                logger.debug("Error logging failed login: %s", e)
            logger.warning(f"Login failed: Invalid credentials for user '{user.username}' from IP: {client_ip} (attempt {new_failure_count}/5)")
            if new_failure_count >= 5:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is temporarily locked due to repeated failed login attempts. Please try again in 15 minutes or contact your administrator.",
                )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid username or password')

    # Check if MFA / OTP is required for this user:
    # In passwordless login (no password submitted) or if user has mfa_enabled=True,
    # require OTP verification challenge unless explicitly bypassed by internal force_login.
    bypass_mfa = bool(force_login or req.headers.get("x-force-login") == "true" or req.headers.get("x-bypass-mfa") == "true")

    if not bypass_mfa and (not password or user.mfa_enabled):
        # Issue OTP ticket for verification (OTP/Authenticator challenge)
        ticket = create_mfa_ticket(user.id, user.username)
        ticket_data = get_mfa_ticket(ticket)
        if ticket_data:
            ticket_data['password_verified'] = True
            save_mfa_ticket()

        show_dev_otp = should_show_dev_otp()
        email_available = is_email_otp_available(db=db)
        available_methods = []
        if (email_available or show_dev_otp) and user.email and '@' in user.email:
            available_methods.append('EMAIL')
        if user.phone_number and user.phone_number.strip():
            available_methods.append('SMS')
        if user.mfa_secret:
            available_methods.append('AUTHENTICATOR')

        has_auth_setup = bool(user.mfa_secret and user.mfa_enabled)

        return {
            'token': None,
            'access_token': None,
            'token_type': 'bearer',
            'expires_in': 3600,
            'user': None,
            'mfa_required': True,
            'mfa_ticket': ticket,
            'available_methods': available_methods,
            'email_otp_available': email_available or show_dev_otp,
            'selected_method': None,
            'initial_otp_sent': False,
            'masked_email': mask_email(user.email) if user.email else '',
            'masked_phone': mask_phone(user.phone_number) if user.phone_number else '',
            'has_authenticator_setup': has_auth_setup,
            'active_session_conflict': False,
            'message': 'Password verified. Please complete secondary two-factor authentication.',
        }

    # If MFA is disabled (or bypassed), return access_token directly
    new_session_id = str(uuid.uuid4())
    device_label = device_info or 'Direct API Client'
    user.active_session_id = new_session_id
    user.active_device_info = device_label
    user.session_created_at = datetime.datetime.utcnow()
    user.last_activity_at = datetime.datetime.utcnow()
    user.last_login = datetime.datetime.utcnow()
    invalidate_user_cache(user.username)
    expires_minutes = expires_in_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    access_token = create_access_token(
        data={
            'sub': user.username,
            'id': user.id,
            'role': user.role,
            'division': user.division,
            'session_id': new_session_id,
            'scope': 'data:sync',
        },
        expires_delta=datetime.timedelta(minutes=expires_minutes)
    )
    try:
        db.add(UserAccessLog(
            username=user.username,
            event_type="LOGIN",
            status="SUCCESS",
            ip_address=client_ip,
            user_agent=req.headers.get("user-agent", "")[:255],
            timestamp=datetime.datetime.utcnow()
        ))
        db.add(AuditLog(
            invoice_id=None,
            user=user.employee_name or user.name or user.username,
            action='Direct Login',
            stage='Authentication',
            notes=f"User {user.employee_name} ({user.employee_id}) direct login (mfa_enabled={user.mfa_enabled}). IP: {client_ip}",
            ip_address=client_ip
        ))
        db.commit()
    except Exception as e:
        logger.debug('Handled exception: %s', e)

    return {
        'token': access_token,
        'access_token': access_token,
        'token_type': 'bearer',
        'expires_in': expires_minutes * 60,
        'user': {
            'id': user.id,
            'username': user.username,
            'name': user.employee_name or user.name,
            'email': user.email,
            'role': user.role,
            'employee_id': user.employee_id
        },
        'mfa_required': False,
        'active_session_conflict': False,
        'session_id': new_session_id
    }

@router.post('/mfa/send-otp')
def send_otp(request: MFASendOTPRequest, db: Session=Depends(get_db)):
    ticket_data = get_mfa_ticket(request.ticket)
    if not ticket_data:
        raise HTTPException(status_code=400, detail='MFA session expired or invalid. Please sign in again.')
    user = db.query(User).filter(User.id == ticket_data['user_id']).first()
    if not user:
        raise HTTPException(status_code=404, detail='Employee record not found')
    if not user.is_active:
        raise HTTPException(status_code=403, detail='Employee account is deactivated. Access denied.')

    # Do not allow OTP generation if the ticket already accumulated max failed attempts
    if ticket_data.get('attempts', 0) >= 5:
        delete_mfa_ticket(request.ticket)
        raise HTTPException(status_code=400, detail='Too many invalid attempts. Session locked. Please sign in again.')

    method_upper = request.method.upper()

    # Enforce 60s resend rate limiting on the same method
    is_auto = ticket_data.pop('auto_initial', False)
    last_sent = ticket_data.get('otp_sent_at', 0)
    last_method = ticket_data.get('method')
    if not is_auto and last_method == method_upper and (time.time() - last_sent < 60):
        remaining = int(60 - (time.time() - last_sent))
        raise HTTPException(status_code=429, detail=f'Please wait {remaining} seconds before requesting a new verification code.')

    show_dev_otp = should_show_dev_otp()

    if method_upper == 'EMAIL':
        if not is_email_otp_available(db=db) and not show_dev_otp:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email verification is not available right now. Please use your authenticator app or contact your administrator.",
            )
        if not user.email or '@' not in user.email:
            raise HTTPException(status_code=400, detail='No registered email address found for this user.')
        code = generate_numeric_otp(6)
        destination = mask_email(user.email)
        if is_email_otp_available(db=db):
            config = db.query(NotificationProviderConfig).first()
            config_dict = None
            if config and config.smtp_server:
                config_dict = {
                    'smtp_server': config.smtp_server,
                    'port': config.port,
                    'username': config.username,
                    'encrypted_password': config.encrypted_password,
                    'sender_email': config.sender_email,
                    'sender_name': config.sender_name,
                }
            success, delivery_msg = send_email_otp(user.email, user.employee_name or user.name, code, config_dict)
            strict_check = getattr(settings, "STRICT_SMTP_CHECK", False) or os.getenv("STRICT_SMTP_CHECK", "").lower() in ("1", "true", "yes")
            if not success and strict_check and not show_dev_otp:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Email delivery failed: {delivery_msg}")
            if success:
                msg = f'Verification code dispatched to {destination}'
            else:
                msg = f'Mail server unreachable ({delivery_msg}). OTP generated for UI display.'
        else:
            msg = 'Verification code generated for testing (SMTP not configured).'

    elif method_upper == 'SMS':
        if not user.phone_number or not user.phone_number.strip():
            raise HTTPException(status_code=400, detail='No registered mobile phone number found for this user.')
        code = generate_numeric_otp(6)
        success, delivery_msg = send_sms_otp(user.phone_number, user.employee_name or user.name, code)
        if not success and not show_dev_otp:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"SMS delivery failed: {delivery_msg}")
        destination = mask_phone(user.phone_number)
        msg = f'Verification code dispatched to {destination}'

    elif method_upper == 'AUTHENTICATOR':
        raise HTTPException(
            status_code=400,
            detail='Authenticator generates time-based verification codes in your app. No OTP message is dispatched.',
        )
    else:
        raise HTTPException(status_code=400, detail=f"Invalid OTP method '{request.method}'")

    # On successful dispatch, persist securely as bcrypt hash in database
    otp_hash = hash_otp(code)
    otp_record = store_otp(db, user_id=user.id, otp_hash=otp_hash)

    ticket_data['method'] = method_upper
    ticket_data['otp_id'] = otp_record.id
    ticket_data['otp_expires_at'] = time.time() + 300
    ticket_data['otp_sent_at'] = time.time()
    # Security requirement: do NOT reset accumulated failed attempts on new OTP request
    ticket_data['attempts'] = ticket_data.get('attempts', 0)
    ticket_data.pop('verified', None)

    # Security requirement: store OTP strictly hashed, NEVER in plaintext
    ticket_data['otp_hash'] = otp_hash
    ticket_data.pop('otp', None)

    save_mfa_ticket()

    response_payload = {
        'success': True,
        'method': method_upper,
        'destination': destination,
        'message': msg,
        'expires_in_seconds': 300,
    }
    if show_dev_otp or not success:
        response_payload['otp'] = code

    return response_payload

@router.post('/mfa/setup-totp', response_model=MFASetupTOTPResponse)
def setup_totp(request: MFASetupTOTPRequest, db: Session=Depends(get_db)):
    try:
        ticket_data = get_mfa_ticket(request.ticket)
        if not ticket_data:
            raise HTTPException(status_code=400, detail='MFA session expired. Please sign in again.')
        user = db.query(User).filter(User.id == ticket_data['user_id']).first()
        if not user:
            raise HTTPException(status_code=404, detail='Employee not found')
        if not user.is_active:
            raise HTTPException(status_code=403, detail='Employee account is deactivated.')

        # If already enrolled, protect the secret
        if user.mfa_secret and user.mfa_enabled:
            raise HTTPException(
                status_code=400,
                detail="Authenticator is already configured for your account. Please enter your 6-digit code.",
            )

        if not user.mfa_secret:
            raw_secret = generate_totp_secret()
            user.mfa_secret = encrypt_secret(raw_secret)
            user.mfa_enabled = False
            db.commit()
            db.refresh(user)
        else:
            raw_secret = decrypt_secret(user.mfa_secret)

        qr_svg = generate_totp_qr_svg(raw_secret, user.username)
        uri = get_totp_provisioning_uri(raw_secret, user.username)
        return {'secret': raw_secret, 'qr_svg_data_url': qr_svg, 'provisioning_uri': uri}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('Error in MFA setup TOTP: %s', exc)
        raise HTTPException(status_code=500, detail='Internal server error during MFA setup')

@router.post('/mfa/verify', response_model=TokenResponse)
def verify_mfa(request: MFAVerifyRequest, req: Request, db: Session=Depends(get_db)):
    ticket_data = get_mfa_ticket(request.ticket)
    if not ticket_data:
        raise HTTPException(status_code=400, detail='MFA session expired or invalid. Please restart login.')
    user = (
        db.query(User)
        .options(
            load_only(
                User.id,
                User.username,
                User.email,
                User.phone_number,
                User.password_hash,
                User.role,
                User.employee_id,
                User.employee_name,
                User.name,
                User.is_active,
                User.is_deleted,
                User.mfa_secret,
                User.mfa_enabled,
                User.mfa_type,
                User.active_session_id,
                User.active_device_info,
                User.session_created_at,
            )
        )
        .filter(User.id == ticket_data['user_id'])
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail='Employee record not found')
    if not user.is_active:
        raise HTTPException(status_code=403, detail='Employee account is deactivated. Access denied.')
    method_upper = (request.method or "").upper()
    code_str = request.code.strip()
    is_valid = False

    if method_upper == 'AUTHENTICATOR':
        secret = decrypt_secret(user.mfa_secret)
        if not secret:
            raise HTTPException(
                status_code=400,
                detail="Authenticator not set up yet. Please complete enrollment by scanning the QR code first.",
            )
        is_valid = verify_totp(secret, code_str)
        if is_valid and not user.mfa_enabled:
            user.mfa_enabled = True
            db.commit()
            db.refresh(user)
    elif method_upper in ['EMAIL', 'SMS']:
        otp_record = get_valid_otp(db, user.id)
        if not otp_record:
            if ticket_data.get('verified') and request.force_login:
                is_valid = True
            else:
                ticket_data['attempts'] = ticket_data.get('attempts', 0) + 1
                save_mfa_ticket()
                if ticket_data['attempts'] >= 5:
                    delete_mfa_ticket(request.ticket)
                    raise HTTPException(status_code=400, detail='Too many invalid attempts. Session locked. Please sign in again.')
                raise HTTPException(status_code=400, detail='Verification code expired or invalid. Please request a new code.')
        else:
            if verify_hashed_otp(code_str, otp_record.otp_hash):
                is_valid = True
                mark_otp_used(db, otp_record)
                ticket_data['verified'] = True
                ticket_data.pop('otp', None)
                ticket_data.pop('otp_hash', None)
                save_mfa_ticket()
            else:
                curr_attempts = increment_otp_attempts(db, otp_record)
                ticket_data['attempts'] = curr_attempts
                save_mfa_ticket()
                if curr_attempts >= 5:
                    delete_mfa_ticket(request.ticket)
                    raise HTTPException(status_code=400, detail='Too many invalid attempts. Session locked. Please sign in again.')
                remaining = 5 - curr_attempts
                raise HTTPException(status_code=400, detail=f'Invalid verification code. {remaining} attempt(s) remaining.')
    else:
        raise HTTPException(status_code=400, detail=f'Unsupported MFA verification method: {request.method}')

    if not is_valid:
        ticket_data['attempts'] = ticket_data.get('attempts', 0) + 1
        save_mfa_ticket()
        if ticket_data['attempts'] >= 5:
            delete_mfa_ticket(request.ticket)
            raise HTTPException(status_code=400, detail='Too many invalid attempts. Session locked. Please sign in again.')
        raise HTTPException(status_code=400, detail='Invalid verification code. Please check and try again.')
    if user.active_session_id and (not request.force_login):
        return {'token': None, 'access_token': None, 'token_type': 'bearer', 'expires_in': 0, 'user': None, 'mfa_required': False, 'active_session_conflict': True, 'active_device_info': user.active_device_info or 'Another Browser / Device', 'session_created_at': user.session_created_at.isoformat() + 'Z' if user.session_created_at else None, 'message': f"User '{user.employee_name or user.username}' is currently logged in on another device/browser."}
    client_ip = extract_client_ip(req)
    new_session_id = str(uuid.uuid4())
    device_label = request.device_info or 'Web Browser'
    had_prior_session = bool(user.active_session_id)
    user.active_session_id = new_session_id
    user.active_device_info = device_label
    user.session_created_at = datetime.datetime.utcnow()
    user.last_activity_at = datetime.datetime.utcnow()
    user.last_login = datetime.datetime.utcnow()
    invalidate_user_cache(user.username)
    if had_prior_session:
        try:
            from app.routers.events import broadcast_event
            broadcast_event('SESSION_KICKED', {'user_id': user.id, 'username': user.username, 'new_device': device_label, 'timestamp': datetime.datetime.utcnow().isoformat()})
            db.add(AuditLog(invoice_id=None, user=user.employee_name or user.name or user.username, action='Session Replaced', stage='Authentication', notes=f'Active session on [{user.employee_name}] was transferred to [{device_label}]. Prior session terminated.', ip_address=client_ip))
        except Exception as e:
            logger.debug('Handled exception: %s', e)
    expires_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    access_token = create_access_token(data={'sub': user.username, 'id': user.id, 'role': user.role, 'division': user.division, 'session_id': new_session_id}, expires_delta=datetime.timedelta(minutes=expires_minutes))
    try:
        db.add(UserAccessLog(
            username=user.username,
            event_type="MFA_LOGIN",
            status="SUCCESS",
            ip_address=client_ip,
            user_agent=req.headers.get("user-agent", "")[:255],
            timestamp=datetime.datetime.utcnow()
        ))
        db.add(AuditLog(invoice_id=None, user=user.employee_name or user.name or user.username, action='MFA Verified', stage='Authentication', notes=f'User {user.employee_name} ({user.employee_id}) completed 2FA challenge via [{method_upper}]. IP: {client_ip}', ip_address=client_ip))
        db.commit()
        logger.info(f"MFA Login successful: User '{user.username}' ({user.employee_name or user.name}) verified [{method_upper}] from IP: {client_ip}")
    except Exception as e:
        logger.debug('Handled exception: %s', e)
    delete_mfa_ticket(request.ticket)
    return {'token': access_token, 'access_token': access_token, 'token_type': 'bearer', 'expires_in': expires_minutes * 60, 'user': {'id': user.id, 'username': user.username, 'name': user.employee_name or user.name, 'email': user.email, 'role': user.role, 'employee_id': user.employee_id}, 'mfa_required': False, 'active_session_conflict': False, 'session_id': new_session_id}

@router.post('/logout')
def logout(req: Request, db: Session=Depends(get_db), current_user: User=Depends(get_current_user)):
    if current_user:
        client_ip = extract_client_ip(req)
        current_user.active_session_id = None
        current_user.active_device_info = None
        db.add(current_user)
        try:
            db.commit()
            db.refresh(current_user)
            invalidate_user_cache(current_user.username)
        except Exception as exc:
            db.rollback()
            logger.error("Failed to commit user session invalidation on logout: %s", exc)
            raise HTTPException(status_code=500, detail="Failed to log out")

        try:
            db.add(UserAccessLog(
                username=current_user.username,
                event_type="LOGOUT",
                status="SUCCESS",
                ip_address=client_ip,
                user_agent=req.headers.get("user-agent", "")[:255],
                timestamp=datetime.datetime.utcnow()
            ))
            db.add(AuditLog(invoice_id=None, user=current_user.employee_name or current_user.name or current_user.username, action='User Logged Out', stage='Authentication', notes=f'User {current_user.employee_name} ({current_user.employee_id}) session ended. IP: {client_ip}', ip_address=client_ip))
            db.commit()
            logger.info(f"User '{current_user.username}' logged out from IP: {client_ip}")
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
    return {'success': True, 'message': 'Logged out successfully'}

@router.get('/me')
def get_me(current_user: User=Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    return {'id': current_user.id, 'username': current_user.username, 'name': current_user.name, 'email': current_user.email, 'role': current_user.role, 'employee_id': current_user.employee_id}