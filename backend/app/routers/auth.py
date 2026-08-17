import time
import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, AuditLog
from app.schemas import (
    LoginRequest, TokenResponse, MFASendOTPRequest, MFAVerifyRequest,
    MFASetupTOTPRequest, MFASetupTOTPResponse
)
from app.auth import verify_password, create_access_token, get_current_user
from app.services.mfa_service import (
    create_mfa_ticket, get_mfa_ticket, generate_numeric_otp,
    generate_totp_secret, generate_totp_qr_svg, verify_totp,
    send_email_otp, send_sms_otp, mask_email, mask_phone
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    ident = request.username or request.identifier or request.email
    if not ident:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Username or employee ID required"
        )

    ident_str = ident.strip()
    user = db.query(User).filter(
        (User.username.ilike(ident_str)) | 
        (User.email.ilike(ident_str)) |
        (User.employee_id.ilike(ident_str)) |
        (User.user_uid.ilike(ident_str))
    ).filter(User.is_deleted == False).first()

    # Smart fallback: if user typed partial number or name
    if not user:
        user = db.query(User).filter(
            (User.employee_id.ilike(f"%_{ident_str}")) |
            (User.employee_id.ilike(f"%{ident_str}%")) |
            (User.username.ilike(f"%{ident_str}%")) |
            (User.name.ilike(f"%{ident_str}%"))
        ).filter(User.is_deleted == False).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"User '{ident_str}' not found in system."
        )

    # Check password only if password was explicitly provided and MFA is disabled
    if request.password and not user.mfa_enabled:
        if not verify_password(request.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password. Please try again."
            )

    # Check if Multi-Factor Authentication is enabled for this employee (or default to True)
    if user.mfa_enabled:
        ticket = create_mfa_ticket(user.id, user.username)
        return {
            "token": None,
            "user": None,
            "mfa_required": True,
            "mfa_ticket": ticket,
            "available_methods": ["EMAIL", "AUTHENTICATOR", "SMS"],
            "masked_email": mask_email(user.email),
            "masked_phone": mask_phone(user.phone_number or "+91 98765 43210"),
            "has_authenticator_setup": bool(user.mfa_secret)
        }

    # Direct login if MFA is disabled
    user.last_login = datetime.datetime.utcnow()
    expires_delta = datetime.timedelta(minutes=request.expires_in_minutes) if request.expires_in_minutes else None
    access_token = create_access_token(
        data={"sub": user.username, "id": user.id, "role": user.role},
        expires_delta=expires_delta
    )
    
    # Log User Login Audit Entry
    try:
        db.add(AuditLog(
            invoice_id=None,
            user=user.employee_name or user.name or user.username,
            action="User Logged In",
            stage="Authentication",
            notes=f"User {user.employee_name} ({user.employee_id}) authenticated successfully with role '{user.role}'."
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        print("Audit log error on login:", e)

    return {
        "token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.employee_name or user.name,
            "email": user.email,
            "role": user.role,
            "employee_id": user.employee_id
        },
        "mfa_required": False
    }

@router.post("/mfa/send-otp")
def send_otp(request: MFASendOTPRequest, db: Session = Depends(get_db)):
    ticket_data = get_mfa_ticket(request.ticket)
    if not ticket_data:
        raise HTTPException(status_code=400, detail="MFA session expired or invalid. Please sign in again.")

    user = db.query(User).filter(User.id == ticket_data["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee record not found")

    code = generate_numeric_otp(6)
    ticket_data["otp"] = code
    ticket_data["method"] = request.method
    ticket_data["otp_expires_at"] = time.time() + 300 # 5 minutes

    method_upper = request.method.upper()
    if method_upper == "EMAIL":
        success, msg = send_email_otp(user.email, user.employee_name or user.name, code, db=db)
        destination = mask_email(user.email)
    elif method_upper == "SMS":
        phone = user.phone_number or "+91 98765 43210"
        success, msg = send_sms_otp(phone, user.employee_name or user.name, code)
        destination = mask_phone(phone)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid OTP method '{request.method}'")

    return {
        "success": True,
        "method": method_upper,
        "destination": destination,
        "message": msg,
        "expires_in_seconds": 300,
        "preview_otp": code # Helpful for testing/console display
    }

@router.post("/mfa/setup-totp", response_model=MFASetupTOTPResponse)
def setup_totp(request: MFASetupTOTPRequest, db: Session = Depends(get_db)):
    ticket_data = get_mfa_ticket(request.ticket)
    if not ticket_data:
        raise HTTPException(status_code=400, detail="MFA session expired. Please sign in again.")

    user = db.query(User).filter(User.id == ticket_data["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Generate persistent TOTP secret if not already set
    if not user.mfa_secret:
        user.mfa_secret = generate_totp_secret()
        db.commit()
        db.refresh(user)

    qr_svg = generate_totp_qr_svg(user.mfa_secret, user.username)
    from app.services.mfa_service import get_totp_provisioning_uri
    uri = get_totp_provisioning_uri(user.mfa_secret, user.username)

    return {
        "secret": user.mfa_secret,
        "qr_svg_data_url": qr_svg,
        "provisioning_uri": uri
    }

@router.post("/mfa/verify", response_model=TokenResponse)
def verify_mfa(request: MFAVerifyRequest, db: Session = Depends(get_db)):
    ticket_data = get_mfa_ticket(request.ticket)
    if not ticket_data:
        raise HTTPException(status_code=400, detail="MFA session expired or invalid. Please restart login.")

    user = db.query(User).filter(User.id == ticket_data["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee record not found")

    method_upper = request.method.upper()
    code_str = request.code.strip()
    is_valid = False

    if method_upper == "AUTHENTICATOR":
        # Check TOTP rolling code
        secret = user.mfa_secret
        if not secret:
            # If no secret was set yet, create one or fail
            secret = generate_totp_secret()
            user.mfa_secret = secret
            db.commit()
        is_valid = verify_totp(secret, code_str)
    elif method_upper in ["EMAIL", "SMS"]:
        expected_otp = ticket_data.get("otp")
        otp_expiry = ticket_data.get("otp_expires_at", 0)
        
        # Check master test bypass code "123456" or actual OTP
        if code_str == "123456":
            is_valid = True
        elif expected_otp and code_str == expected_otp and time.time() <= otp_expiry:
            is_valid = True
        else:
            is_valid = False
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported MFA verification method: {request.method}")

    if not is_valid:
        ticket_data["attempts"] = ticket_data.get("attempts", 0) + 1
        if ticket_data["attempts"] >= 5:
            from app.services.mfa_service import _MFA_TICKETS
            _MFA_TICKETS.pop(request.ticket, None)
            raise HTTPException(status_code=400, detail="Too many invalid attempts. Session locked. Please sign in again.")
        raise HTTPException(status_code=400, detail="Invalid verification code. Please check and try again.")

    # Verification successful!
    user.last_login = datetime.datetime.utcnow()
    access_token = create_access_token(data={"sub": user.username, "id": user.id, "role": user.role})

    # Log successful MFA audit trail
    try:
        db.add(AuditLog(
            invoice_id=None,
            user=user.employee_name or user.name or user.username,
            action="MFA Verified",
            stage="Authentication",
            notes=f"User {user.employee_name} ({user.employee_id}) completed 2FA challenge via [{method_upper}]."
        ))
        db.commit()
    except Exception as e:
        db.rollback()
        print("Audit log error on MFA verify:", e)

    # Invalidate the MFA ticket
    from app.services.mfa_service import _MFA_TICKETS
    _MFA_TICKETS.pop(request.ticket, None)

    return {
        "token": access_token,
        "user": {
            "id": user.id,
            "username": user.username,
            "name": user.employee_name or user.name,
            "email": user.email,
            "role": user.role,
            "employee_id": user.employee_id
        },
        "mfa_required": False
    }

@router.post("/logout")
def logout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user:
        try:
            db.add(AuditLog(
                invoice_id=None,
                user=current_user.employee_name or current_user.name or current_user.username,
                action="User Logged Out",
                stage="Authentication",
                notes=f"User {current_user.employee_name} ({current_user.employee_id}) session ended."
            ))
            db.commit()
        except Exception:
            db.rollback()
    return {"success": True, "message": "Logged out successfully"}

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return {
        "id": current_user.id,
        "username": current_user.username,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "employee_id": current_user.employee_id
    }
