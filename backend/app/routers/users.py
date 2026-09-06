import random
import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import (
    UserResponse, UserMasterCreate, UserMasterUpdate, UserStatusToggleRequest
)
from app.auth import get_password_hash, get_current_user

router = APIRouter(prefix="/api/users", tags=["User Master Management"])
admin_router = APIRouter(prefix="/api/admin/users", tags=["Admin User Management"])

def generate_random_user_uid() -> str:
    """Generates an auto-generated unique random user identifier (e.g. USR-782914)"""
    rand_num = random.randint(100000, 999999)
    return f"USR-{rand_num}"

# --- 1. LIST USERS WITH FILTERS ---
@router.get("", response_model=List[UserResponse])
@admin_router.get("", response_model=List[UserResponse])
def get_users(
    include_inactive: bool = Query(True, description="Include deactivated employees"),
    role: Optional[str] = Query(None, description="Filter by role (admin, manager, finance_auditor, employee)"),
    search: Optional[str] = Query(None, description="Search by name, employee_id, or email"),
    db: Session = Depends(get_db)
):
    # Auto-seed full 223 enterprise users if table is empty
    if db.query(User).count() == 0:
        try:
            try:
                from scripts.seed_sd_workflow_matrix import seed_sd_workflow_matrix
            except ImportError:
                from seed_sd_workflow_matrix import seed_sd_workflow_matrix
            seed_sd_workflow_matrix()
        except Exception as e:
            print(f"[User Master] Auto-seed warning: {e}")

    query = db.query(User).filter(User.is_deleted == False)
    if not include_inactive:
        query = query.filter(User.is_active == True)
    if role:
        query = query.filter(User.role == role)
    if search:
        s = f"%{search}%"
        query = query.filter(
            (User.employee_name.ilike(s)) |
            (User.employee_id.ilike(s)) |
            (User.email.ilike(s)) |
            (User.username.ilike(s))
        )
    return query.order_by(User.id.asc()).all()

# --- 2. GET SINGLE USER BY ID OR EMPLOYEE ID ---
@router.get("/{user_identifier}", response_model=UserResponse)
def get_user_by_id(user_identifier: str, db: Session = Depends(get_db)):
    user = None
    if user_identifier.isdigit():
        user = db.query(User).filter(User.id == int(user_identifier)).filter(User.is_deleted == False).first()
    if not user:
        user = db.query(User).filter(
            (User.employee_id == user_identifier) |
            (User.user_uid == user_identifier) |
            (User.username == user_identifier)
        ).filter(User.is_deleted == False).first()

    if not user:
        raise HTTPException(status_code=404, detail="Employee not found in User Master")
    return user

# --- 3. CREATE NEW USER MASTER RECORD ---
@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@admin_router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user_master(
    payload: UserMasterCreate,
    db: Session = Depends(get_db),
    admin: Optional[User] = Depends(get_current_user)
):
    # Check for duplicate Employee ID
    existing_emp = db.query(User).filter(User.employee_id == payload.employee_id).first()
    if existing_emp:
        raise HTTPException(
            status_code=400,
            detail=f"Employee ID '{payload.employee_id}' already exists in User Master"
        )

    # Check for duplicate Email
    existing_email = db.query(User).filter(User.email == payload.email).first()
    if existing_email:
        raise HTTPException(
            status_code=400,
            detail=f"Email '{payload.email}' is already registered to another user"
        )

    effective_username = payload.username or payload.employee_id
    existing_username = db.query(User).filter(User.username == effective_username).first()
    if existing_username:
        effective_username = f"{payload.employee_id}_{random.randint(100, 999)}"

    # Generate random unique UID
    user_uid = generate_random_user_uid()
    while db.query(User).filter(User.user_uid == user_uid).first():
        user_uid = generate_random_user_uid()

    # Hash Password with bcrypt
    hashed_pwd = get_password_hash(payload.password)

    new_user = User(
        user_uid=user_uid,
        employee_id=payload.employee_id,
        employee_name=payload.employee_name,
        name=payload.employee_name,
        username=effective_username,
        email=payload.email,
        phone_number=payload.phone_number,
        division=payload.division or "VCC",
        department=payload.department,
        plant=payload.plant,
        role=payload.role,
        password_hash=hashed_pwd,
        is_active=payload.is_active,
        mfa_enabled=payload.mfa_enabled,
        mfa_type=payload.mfa_type,
        created_by=admin.name if admin else payload.created_by or "System Admin",
        created_at=datetime.datetime.utcnow()
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

# --- 4. UPDATE USER MASTER RECORD ---
@router.put("/{user_id}", response_model=UserResponse)
@admin_router.put("/{user_id}", response_model=UserResponse)
def update_user_master(
    user_id: int,
    payload: UserMasterUpdate,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).filter(User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = payload.dict(exclude_unset=True)
    
    # Check employee_id uniqueness if updated
    if "employee_id" in update_data and update_data["employee_id"] and update_data["employee_id"] != user.employee_id:
        existing_emp = db.query(User).filter(User.employee_id == update_data["employee_id"], User.id != user_id).first()
        if existing_emp:
            raise HTTPException(status_code=400, detail=f"Employee ID '{update_data['employee_id']}' is already assigned to another user")

    # Check email uniqueness if updated
    if "email" in update_data and update_data["email"] and update_data["email"] != user.email:
        existing_email = db.query(User).filter(User.email == update_data["email"], User.id != user_id).first()
        if existing_email:
            raise HTTPException(status_code=400, detail=f"Email '{update_data['email']}' is already registered to another user")

    # Check username uniqueness if updated
    if "username" in update_data and update_data["username"] and update_data["username"] != user.username:
        existing_uname = db.query(User).filter(User.username == update_data["username"], User.id != user_id).first()
        if existing_uname:
            raise HTTPException(status_code=400, detail=f"Username '{update_data['username']}' is already taken")

    # If updating password, hash with bcrypt
    if "password" in update_data and update_data["password"]:
        user.password_hash = get_password_hash(update_data.pop("password"))
    else:
        update_data.pop("password", None)

    emp_name = update_data.get("employee_name") or update_data.get("name")
    if emp_name:
        user.employee_name = emp_name
        user.name = emp_name
        update_data.pop("employee_name", None)
        update_data.pop("name", None)

    for field, value in update_data.items():
        setattr(user, field, value)

    user.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user

# --- 5. ACTIVATE / DEACTIVATE EMPLOYEE (STATUS TOGGLE) ---
@router.patch("/{user_id}/status", response_model=UserResponse)
@admin_router.patch("/{user_id}/status", response_model=UserResponse)
def toggle_user_status(
    user_id: int,
    payload: UserStatusToggleRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).filter(User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    user.is_active = payload.is_active
    user.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user

# --- 6. DELETE EMPLOYEE ---
@router.delete("/{user_id}")
@admin_router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).filter(User.is_deleted == False).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    user.is_deleted = True
    user.deleted_at = datetime.datetime.utcnow()
    db.commit()
    return {"success": True, "message": f"Employee {user.employee_id} deleted successfully"}
