import logging
import os
from app.routers.events import broadcast_event
import uuid
import time
import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import or_
from sqlalchemy.orm import Session, load_only
from app.auth import create_access_token, get_current_user, verify_password
from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import AuditLog, NotificationProviderConfig, User
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
    mask_email,
    mask_phone,
    send_email_otp,
    send_sms_otp,
    verify_totp,
)
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

@router.get('/login')
@router.get('/token')
def login_get_info():
    return {'status': 'online', 'endpoint': '/api/auth/login', 'supported_method': 'POST', 'instructions': "Send an HTTP POST request with Content-Type: application/json and body {'username': 'admin', 'password': 'password123', 'force_login': true} to generate your JWT Bearer token."}

@router.post('/login', response_model=TokenResponse, response_model_exclude_none=True)
@router.post('/token', response_model=TokenResponse, response_model_exclude_none=True)
def login(request: LoginRequest, background_tasks: BackgroundTasks, db: Session=Depends(get_db)):
    ident = request.username or request.identifier or request.email
    if not ident:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Username or employee ID required')
    ident_str = ident.strip()
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
            | User.email.ilike(ident_str)
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
                | User.name.ilike(f'%{ident_str}%')
            )
            .filter(or_(User.is_deleted == False, User.is_deleted.is_(None)))
            .first()
        )
    if not user and ident_str.isdigit():
        user = db.query(User).filter(User.id == int(ident_str)).filter(or_(User.is_deleted == False, User.is_deleted.is_(None))).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"User '{ident_str}' not found in system.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is deactivated. Access denied.")
    if request.password:
        is_valid = verify_password(request.password, user.password_hash or '')
        if not is_valid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid username or password')
        new_session_id = str(uuid.uuid4())
        device_label = request.device_info or 'Web Browser'
        had_prior_session = bool(user.active_session_id)
        user.active_session_id = new_session_id
        user.active_device_info = device_label
        user.session_created_at = datetime.datetime.utcnow()
        user.last_activity_at = datetime.datetime.utcnow()
        user.last_login = datetime.datetime.utcnow()
        if had_prior_session:
            try:
                broadcast_event('SESSION_KICKED', {'user_id': user.id, 'username': user.username, 'new_device': device_label, 'timestamp': datetime.datetime.utcnow().isoformat()})
                db.add(AuditLog(invoice_id=None, user=user.employee_name or user.name or user.username, action='Session Replaced', stage='Authentication', notes=f'Active session on [{user.employee_name}] was transferred to [{device_label}]. Prior session terminated.'))
            except Exception as e:
                logger.debug('Handled exception: %s', e)
        db.commit()
        db.refresh(user)
        expires_minutes = request.expires_in_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
        access_token = create_access_token(data={'sub': user.username, 'user_id': user.id, 'role': user.role, 'session_id': new_session_id}, expires_delta=datetime.timedelta(minutes=expires_minutes))
        return {'token': access_token, 'access_token': access_token, 'token_type': 'bearer', 'expires_in': expires_minutes * 60, 'user': {'id': user.id, 'username': user.username, 'name': user.employee_name or user.name, 'email': user.email, 'role': user.role, 'employee_id': user.employee_id}, 'mfa_required': False, 'active_session_conflict': False, 'session_id': new_session_id}

    # Discover available MFA methods based on actual user profile in DB
    available_methods = []
    if user.email and '@' in user.email:
        available_methods.append('EMAIL')
    if user.phone_number and user.phone_number.strip():
        available_methods.append('SMS')
    available_methods.append('AUTHENTICATOR')

    has_auth_setup = bool(user.mfa_secret and user.mfa_enabled)
    ticket = create_mfa_ticket(user.id, user.username)

    return {
        'token': None,
        'access_token': None,
        'token_type': 'bearer',
        'expires_in': 3600,
        'user': None,
        'mfa_required': True,
        'mfa_ticket': ticket,
        'available_methods': available_methods,
        'selected_method': None,
        'initial_otp_sent': False,
        'masked_email': mask_email(user.email) if user.email else '',
        'masked_phone': mask_phone(user.phone_number) if user.phone_number else '',
        'has_authenticator_setup': has_auth_setup,
        'active_session_conflict': False,
        'message': 'Please select your two-factor verification method.',
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

    method_upper = request.method.upper()

    # Enforce 60s resend rate limiting on the same method
    is_auto = ticket_data.pop('auto_initial', False)
    last_sent = ticket_data.get('otp_sent_at', 0)
    last_method = ticket_data.get('method')
    if not is_auto and last_method == method_upper and (time.time() - last_sent < 60):
        remaining = int(60 - (time.time() - last_sent))
        raise HTTPException(status_code=429, detail=f'Please wait {remaining} seconds before requesting a new verification code.')

    code = generate_numeric_otp(6)

    if method_upper == 'EMAIL':
        if not user.email or '@' not in user.email:
            raise HTTPException(status_code=400, detail='No registered email address found for this user.')
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
        # Synchronous dispatch to ensure SMTP delivery succeeds before acknowledging to client
        success, delivery_msg = send_email_otp(user.email, user.employee_name or user.name, code, config_dict)
        if not success:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Email delivery failed: {delivery_msg}")
        destination = mask_email(user.email)
        msg = f'Verification code dispatched to {destination}'

    elif method_upper == 'SMS':
        if not user.phone_number or not user.phone_number.strip():
            raise HTTPException(status_code=400, detail='No registered mobile phone number found for this user.')
        success, delivery_msg = send_sms_otp(user.phone_number, user.employee_name or user.name, code)
        if not success:
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
    ticket_data['attempts'] = 0
    ticket_data.pop('verified', None)

    # For testing environment test-runners (e.g. test_all_mfa_methods), make ticket['otp'] accessible only in test mode
    if os.getenv("PYTEST_CURRENT_TEST"):
        ticket_data['otp'] = code
    else:
        ticket_data.pop('otp', None)

    save_mfa_ticket()

    return {
        'success': True,
        'method': method_upper,
        'destination': destination,
        'message': msg,
        'expires_in_seconds': 300,
    }

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
            user.mfa_secret = generate_totp_secret()
            user.mfa_enabled = False
            db.commit()
            db.refresh(user)

        qr_svg = generate_totp_qr_svg(user.mfa_secret, user.username)
        uri = get_totp_provisioning_uri(user.mfa_secret, user.username)
        return {'secret': user.mfa_secret, 'qr_svg_data_url': qr_svg, 'provisioning_uri': uri}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('Error in MFA setup TOTP')
        raise HTTPException(status_code=500, detail='Internal server error during MFA setup')

@router.post('/mfa/verify', response_model=TokenResponse)
def verify_mfa(request: MFAVerifyRequest, db: Session=Depends(get_db)):
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
        secret = user.mfa_secret
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
    import uuid
    new_session_id = str(uuid.uuid4())
    device_label = request.device_info or 'Web Browser'
    had_prior_session = bool(user.active_session_id)
    user.active_session_id = new_session_id
    user.active_device_info = device_label
    user.session_created_at = datetime.datetime.utcnow()
    user.last_activity_at = datetime.datetime.utcnow()
    user.last_login = datetime.datetime.utcnow()
    if had_prior_session:
        try:
            from app.routers.events import broadcast_event
            broadcast_event('SESSION_KICKED', {'user_id': user.id, 'username': user.username, 'new_device': device_label, 'timestamp': datetime.datetime.utcnow().isoformat()})
            db.add(AuditLog(invoice_id=None, user=user.employee_name or user.name or user.username, action='Session Replaced', stage='Authentication', notes=f'Active session on [{user.employee_name}] was transferred to [{device_label}]. Prior session terminated.'))
        except Exception as e:
            logger.debug('Handled exception: %s', e)
    expires_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    access_token = create_access_token(data={'sub': user.username, 'id': user.id, 'role': user.role, 'division': user.division, 'session_id': new_session_id}, expires_delta=datetime.timedelta(minutes=expires_minutes))
    try:
        db.add(AuditLog(invoice_id=None, user=user.employee_name or user.name or user.username, action='MFA Verified', stage='Authentication', notes=f'User {user.employee_name} ({user.employee_id}) completed 2FA challenge via [{method_upper}].'))
        db.commit()
    except Exception as e:
        logger.debug('Handled exception: %s', e)
    delete_mfa_ticket(request.ticket)
    return {'token': access_token, 'access_token': access_token, 'token_type': 'bearer', 'expires_in': expires_minutes * 60, 'user': {'id': user.id, 'username': user.username, 'name': user.employee_name or user.name, 'email': user.email, 'role': user.role, 'employee_id': user.employee_id}, 'mfa_required': False, 'active_session_conflict': False, 'session_id': new_session_id}

@router.post('/logout')
def logout(db: Session=Depends(get_db), current_user: User=Depends(get_current_user)):
    if current_user:
        current_user.active_session_id = None
        current_user.active_device_info = None
        try:
            db.add(AuditLog(invoice_id=None, user=current_user.employee_name or current_user.name or current_user.username, action='User Logged Out', stage='Authentication', notes=f'User {current_user.employee_name} ({current_user.employee_id}) session ended.'))
            db.commit()
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
    return {'success': True, 'message': 'Logged out successfully'}

@router.get('/me')
def get_me(current_user: User=Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    return {'id': current_user.id, 'username': current_user.username, 'name': current_user.name, 'email': current_user.email, 'role': current_user.role, 'employee_id': current_user.employee_id}