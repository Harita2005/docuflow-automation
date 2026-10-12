import json
import logging
import os
import random
import secrets
import datetime
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.auth import get_current_active_user, get_password_hash
from app.database.connection import get_db
from app.database.models import Department, Division, Role, User
from app.schemas.schemas import (
    UserMasterCreate,
    UserMasterUpdate,
    UserResponse,
    UserStatusToggleRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/users', tags=['User Master Management'])
admin_router = APIRouter(prefix='/api/admin/users', tags=['Admin User Management'])

def generate_random_user_uid() -> str:
    """Generates an auto-generated unique random user identifier (e.g. USR-782914)"""
    rand_num = random.randint(100000, 999999)
    return f'USR-{rand_num}'

def ensure_enterprise_divisions(db: Session):
    """
    Ensures that all 53+ enterprise divisions are present and active in dbo.divisions.
    Synchronizes from matrix configuration if divisions table has fewer than 53 active entries.
    """
    try:
        if db.query(Division).count() >= 53:
            return
    except Exception:
        return

    div_list = []
    possible_paths = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "src", "matrix_options.json")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "matrix_options.json")),
        os.path.abspath(os.path.join(os.path.dirname(__file__), "matrix_options.json")),
    ]
    for p in possible_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    div_list = data.get("divisions", [])
                    if div_list:
                        break
            except Exception:
                # Ignore JSON read/parse errors and fallback to next path or default list
                pass

    if not div_list:
        div_list = [
            "ACC", "ACC_ER", "ACC_MDU", "ACC_MKT", "ACC_PROD", "ACC_STALL", "ACM", "ACM_ER",
            "ACM_ERODE", "ACM_ERODE-LOT WH", "ACM_ERODE-RAPIER", "ACM_ERODE-STALL", "ACM_KARUMATHAMPATTY",
            "ACM_SALEM", "ACM_SALEM-SILK", "ACM_SIPCOT", "ACM_THINDAL", "ACM_UDAYAPATTY", "ACM_VENSUN",
            "AKG", "AKG_ER", "AT", "ATC", "ATC_ER", "ATC_MKT", "ATC_PROD", "ATC_UNIT-4", "AT_ER", "BB",
            "BB_BLR", "BB_BR", "ENES", "ENES_ER", "RHL", "RHL_ER", "RHL_MKT", "RR", "RRF", "RRF_ER",
            "RRF_MKT", "RRF_PROD", "RR_MKT", "RR_PROD", "RR_UT", "RandR_ER", "TARA", "TEST", "VCC", "VG",
            "VPM", "VPM_VENSUN", "VT", "VT_ER", "HQ", "SD", "GLOBAL"
        ]

    try:
        existing = {d.code.strip(): d for d in db.query(Division).all()}
        inserted = False
        for c in div_list:
            code_str = str(c).strip()
            if code_str and code_str not in existing:
                db.add(Division(code=code_str, name=f"{code_str} Division", is_active=True))
                inserted = True
        if inserted:
            db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("ensure_enterprise_divisions check deferred: %s", exc)

def resolve_user_foreign_keys(db: Session, division_code_or_id: Optional[Union[str, int]], department_name: Optional[str], role_code: Optional[str]):
    """Resolves and returns (division_id, department_id, role_id) from normalized tables."""
    div_id = None
    dept_id = None
    role_id = None

    if division_code_or_id is not None:
        if isinstance(division_code_or_id, int):
            div = db.query(Division).filter(Division.id == division_code_or_id).first()
        elif str(division_code_or_id).strip().isdigit():
            div = db.query(Division).filter(Division.id == int(str(division_code_or_id).strip())).first()
        else:
            div = db.query(Division).filter(Division.code.ilike(str(division_code_or_id).strip())).first()
        if div:
            div_id = div.id

    if department_name:
        dept = db.query(Department).filter(
            (Department.name.ilike(department_name.strip())) | (Department.code.ilike(department_name.strip()))
        ).first()
        if dept:
            dept_id = dept.id

    if role_code:
        r = db.query(Role).filter((Role.code.ilike(role_code.strip())) | (Role.name.ilike(role_code.strip()))).first()
        if r:
            role_id = r.id

    return div_id, dept_id, role_id

@router.get('', response_model=List[UserResponse])
@admin_router.get('', response_model=List[UserResponse])
def get_users(
    include_inactive: bool = Query(True, description='Include deactivated employees'),
    role: Optional[str] = Query(None, description='Filter by role'),
    search: Optional[str] = Query(None, description='Search by name, employee_id, or email'),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    query = db.query(User).filter(User.is_deleted == False)
    if not include_inactive:
        query = query.filter(User.is_active == True)
    if role:
        query = query.filter(User.role == role)
    if search:
        s = f'%{search}%'
        query = query.filter(
            User.employee_name.ilike(s) | User.employee_id.ilike(s) | User.email.ilike(s) | User.username.ilike(s)
        )
    return query.order_by(User.id.asc()).all()

@router.get('/{user_identifier}', response_model=UserResponse)
def get_user_by_id(
    user_identifier: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    user = None
    if user_identifier.isdigit():
        user = db.query(User).filter(User.id == int(user_identifier)).filter(User.is_deleted == False).first()
    if not user:
        user = db.query(User).filter(
            (User.employee_id == user_identifier) | (User.user_uid == user_identifier) | (User.username == user_identifier)
        ).filter(User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail='Employee not found in User Master')
    return user

@router.post('', response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@admin_router.post('', response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user_master(
    payload: UserMasterCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Enforce admin authorization
    if (current_user.role or '').lower() not in ['admin', 'administrator', 'system_admin', 'superadmin']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Administrator authorization required to create users.')

    existing_emp = db.query(User).filter(User.employee_id == payload.employee_id).first()
    if existing_emp:
        raise HTTPException(status_code=400, detail=f"Employee ID '{payload.employee_id}' already exists in User Master")
    existing_email = db.query(User).filter(User.email == payload.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail=f"Email '{payload.email}' is already registered to another user")

    effective_username = payload.username or payload.employee_id
    existing_username = db.query(User).filter(User.username == effective_username).first()
    if existing_username:
        effective_username = f'{payload.employee_id}_{random.randint(100, 999)}'

    user_uid = generate_random_user_uid()
    while db.query(User).filter(User.user_uid == user_uid).first():
        user_uid = generate_random_user_uid()

    if payload.password and payload.password.strip():
        hashed_pwd = get_password_hash(payload.password.strip())
    else:
        # Cryptographically secure unguessable random token, hashed with bcrypt (never plaintext, never predictable)
        hashed_pwd = get_password_hash(secrets.token_urlsafe(32))

    div_id, dept_id, role_id = resolve_user_foreign_keys(db, payload.division_id or payload.division, payload.department, payload.role)

    effective_div_code = payload.division
    if div_id and not effective_div_code:
        matched_div = db.query(Division).filter(Division.id == div_id).first()
        if matched_div:
            effective_div_code = matched_div.code

    effective_approval_divs = payload.approval_divisions
    if not effective_approval_divs and effective_div_code:
        effective_approval_divs = effective_div_code

    new_user = User(
        user_uid=user_uid,
        employee_id=payload.employee_id,
        employee_name=payload.employee_name,
        name=payload.employee_name,
        username=effective_username,
        email=payload.email,
        phone_number=payload.phone_number,
        division=effective_div_code or 'VCC',
        division_id=div_id,
        approval_divisions=effective_approval_divs,
        department=payload.department,
        plant=payload.plant,
        role=payload.role or 'employee',
        role_id=role_id,
        password_hash=hashed_pwd,
        is_active=payload.is_active,
        mfa_enabled=payload.mfa_enabled,
        mfa_type=payload.mfa_type,
        created_by=current_user.employee_name or current_user.name or 'System Admin',
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get('/divisions/list')
@admin_router.get('/divisions/list')
def get_available_divisions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Returns active divisions from the database for dropdown selection."""
    ensure_enterprise_divisions(db)
    divs = db.query(Division).filter(Division.is_active == True).order_by(Division.code.asc()).all()
    if divs:
        return [{"id": d.id, "code": d.code, "name": d.name or d.code} for d in divs]
    
    # Fallback to distinct divisions present in users or documents table
    from app.database.models import Invoice
    user_divs = [r[0] for r in db.query(User.division).filter(User.is_deleted == False, User.division.isnot(None)).distinct().all() if r[0] and r[0].strip()]
    doc_divs = [r[0] for r in db.query(Invoice.division).filter(Invoice.is_deleted == False, Invoice.division.isnot(None)).distinct().all() if r[0] and r[0].strip()]
    distinct_codes = sorted(list(set(user_divs + doc_divs)))
    return [{"id": None, "code": code.strip(), "name": f"{code.strip()} Division"} for code in distinct_codes]

@router.put('/{user_id}', response_model=UserResponse)
@admin_router.put('/{user_id}', response_model=UserResponse)
def update_user_master(
    user_id: int,
    payload: UserMasterUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
    # If not admin, can only edit own profile and CANNOT escalate role or active status
    if not is_admin and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Access Denied: Cannot modify another user account.')

    user = db.query(User).filter(User.id == user_id).filter(User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail='Employee not found')

    update_data = payload.model_dump(exclude_unset=True)

    # Prevent non-admin privilege escalation & mass assignment
    if not is_admin:
        for sensitive_f in ['role', 'role_id', 'is_active', 'is_deleted', 'division', 'mfa_enabled', 'mfa_secret', 'active_session_id', 'created_by', 'user_uid']:
            update_data.pop(sensitive_f, None)

    if 'employee_id' in update_data and update_data['employee_id'] and (update_data['employee_id'] != user.employee_id):
        existing_emp = db.query(User).filter(User.employee_id == update_data['employee_id'], User.id != user_id).first()
        if existing_emp:
            raise HTTPException(status_code=400, detail=f"Employee ID '{update_data['employee_id']}' is already assigned to another user")

    if 'email' in update_data and update_data['email'] and (update_data['email'] != user.email):
        existing_email = db.query(User).filter(User.email == update_data['email'], User.id != user_id).first()
        if existing_email:
            raise HTTPException(status_code=400, detail=f"Email '{update_data['email']}' is already registered to another user")

    if 'username' in update_data and update_data['username'] and (update_data['username'] != user.username):
        existing_uname = db.query(User).filter(User.username == update_data['username'], User.id != user_id).first()
        if existing_uname:
            raise HTTPException(status_code=400, detail=f"Username '{update_data['username']}' is already taken")

    if 'password' in update_data and update_data['password']:
        user.password_hash = get_password_hash(update_data.pop('password'))
    else:
        update_data.pop('password', None)

    emp_name = update_data.get('employee_name') or update_data.get('name')
    if emp_name:
        user.employee_name = emp_name
        user.name = emp_name
        update_data.pop('employee_name', None)
        update_data.pop('name', None)

    for field, value in update_data.items():
        setattr(user, field, value)

    # Sync foreign keys
    target_div = user.division_id or user.division
    div_id, dept_id, role_id = resolve_user_foreign_keys(db, target_div, user.department, user.role)
    if div_id:
        user.division_id = div_id
        if not user.division:
            matched_div = db.query(Division).filter(Division.id == div_id).first()
            if matched_div:
                user.division = matched_div.code
    elif user.division:
        matched_div = db.query(Division).filter(Division.code.ilike(str(user.division).strip())).first()
        if matched_div:
            user.division_id = matched_div.id
    if role_id:
        user.role_id = role_id

    user.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user

@router.patch('/{user_id}/status', response_model=UserResponse)
@admin_router.patch('/{user_id}/status', response_model=UserResponse)
def toggle_user_status(
    user_id: int,
    payload: UserStatusToggleRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if (current_user.role or '').lower() not in ['admin', 'administrator', 'system_admin', 'superadmin']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Administrator authorization required to toggle employee status.')

    user = db.query(User).filter(User.id == user_id).filter(User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail='Employee not found')

    # Prevent deactivating self if last active admin
    if current_user.id == user_id and not payload.is_active:
        active_admins = db.query(User).filter(User.role == 'admin', User.is_active == True, User.is_deleted == False).count()
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail='Cannot deactivate the sole active system administrator.')

    user.is_active = payload.is_active
    user.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user

@router.delete('/{user_id}')
@admin_router.delete('/{user_id}')
def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if (current_user.role or '').lower() not in ['admin', 'administrator', 'system_admin', 'superadmin']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Administrator authorization required to delete employee accounts.')

    user = db.query(User).filter(User.id == user_id).filter(User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail='Employee not found')

    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail='Cannot delete your own active administrator account.')

    user.is_deleted = True
    user.is_active = False
    user.deleted_at = datetime.datetime.utcnow()
    db.commit()
    return {'success': True, 'message': f'Employee {user.employee_id} deleted successfully'}

@router.post('/{user_id}/unlock')
@admin_router.post('/{user_id}/unlock')
def unlock_user(
    user_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    SEC-10 Admin Account Unlock:
    Allows an administrator to immediately unlock an account locked out due to failed attempts,
    by purging recent LOGIN_FAILED and ACCOUNT_LOCKED logs for the user.
    """
    if (current_user.role or '').lower() not in ['admin', 'administrator', 'system_admin', 'superadmin']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Administrator authorization required to unlock employee accounts.')

    user = db.query(User).filter(User.id == user_id, User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail='Employee not found')

    from app.database.models import UserAccessLog, AuditLog
    lockout_window = datetime.datetime.utcnow() - datetime.timedelta(minutes=15)
    
    # Remove recent lockout / failed records within the 15-minute window for this username
    deleted_count = (
        db.query(UserAccessLog)
        .filter(
            UserAccessLog.username == user.username,
            UserAccessLog.event_type.in_(["LOGIN_FAILED", "ACCOUNT_LOCKED"]),
            UserAccessLog.timestamp >= lockout_window
        )
        .delete(synchronize_session=False)
    )

    db.add(AuditLog(
        invoice_id=None,
        user=current_user.employee_name or current_user.name or current_user.username,
        action='Account Unlocked',
        stage='Authentication',
        notes=f"Administrator '{current_user.username}' unlocked account '{user.username}'. Cleared {deleted_count} failed login records."
    ))
    db.commit()

    return {
        'success': True,
        'message': f"Account for '{user.username}' has been unlocked successfully.",
        'cleared_records': deleted_count
    }