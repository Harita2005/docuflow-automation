import logging
import random
import datetime
from typing import List, Optional
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

def resolve_user_foreign_keys(db: Session, division_code: Optional[str], department_name: Optional[str], role_code: Optional[str]):
    """Resolves and returns (division_id, department_id, role_id) from normalized tables."""
    div_id = None
    dept_id = None
    role_id = None

    if division_code:
        div = db.query(Division).filter(Division.code.ilike(division_code.strip())).first()
        if div:
            div_id = div.id

    if department_name:
        dept = db.query(Department).filter(
            (Department.name.ilike(department_name.strip())) | (Department.code.ilike(department_name.strip()))
        ).first()
        if dept:
            dept_id = dept.id

    if role_code:
        r = db.query(Role).filter(Role.code.ilike(role_code.strip())).first()
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

    hashed_pwd = get_password_hash(payload.password)
    div_id, dept_id, role_id = resolve_user_foreign_keys(db, payload.division, payload.department, payload.role)

    new_user = User(
        user_uid=user_uid,
        employee_id=payload.employee_id,
        employee_name=payload.employee_name,
        name=payload.employee_name,
        username=effective_username,
        email=payload.email,
        phone_number=payload.phone_number,
        division=payload.division or 'VCC',
        department=payload.department,
        plant=payload.plant,
        role=payload.role or 'employee',
        division_id=div_id,
        department_id=dept_id,
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

    # Prevent non-admin privilege escalation
    if not is_admin:
        update_data.pop('role', None)
        update_data.pop('is_active', None)
        update_data.pop('division', None)

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
    div_id, dept_id, role_id = resolve_user_foreign_keys(db, user.division, user.department, user.role)
    if div_id:
        user.division_id = div_id
    if dept_id:
        user.department_id = dept_id
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