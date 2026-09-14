import logging
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_active_user
from app.database.connection import get_db
from app.database.models import Role, Permission, RolePermission, User
from app.services.rbac_service import check_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/roles", tags=["Role & Permission Management"])
permission_router = APIRouter(prefix="/api/admin/permissions", tags=["Role & Permission Management"])

class PermissionResponse(BaseModel):
    id: int
    code: str
    name: str
    module: Optional[str] = "DOCUMENT"
    action: Optional[str] = "READ"

    class Config:
        from_attributes = True

class RoleResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    permissions: List[str] = []

    class Config:
        from_attributes = True

class RoleCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    permissions: Optional[List[str]] = []

class RoleUpdatePermissions(BaseModel):
    permission_codes: List[str]

@permission_router.get("", response_model=List[PermissionResponse])
def get_all_permissions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all standardized system permissions."""
    if not check_permission(current_user, "role:manage", db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Missing required permission 'role:manage'."
        )
    perms = db.query(Permission).order_by(Permission.id.asc()).all()
    return perms

@router.get("", response_model=List[RoleResponse])
def get_all_roles(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all roles and their assigned permissions."""
    if not check_permission(current_user, "role:manage", db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Missing required permission 'role:manage'."
        )
    roles = db.query(Role).order_by(Role.id.asc()).all()
    result = []
    for r in roles:
        perm_codes = [rp.permission.code for rp in r.permissions if rp.permission]
        result.append(RoleResponse(
            id=r.id,
            code=r.code,
            name=r.name,
            description=r.description,
            is_active=r.is_active,
            permissions=perm_codes
        ))
    return result

@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new role and optionally assign initial permissions."""
    if not (check_permission(current_user, "role:manage", db) or check_permission(current_user, "user:manage", db)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Administrator authorization required to create roles."
        )

    code_clean = payload.code.strip().lower()
    existing = db.query(Role).filter(Role.code.ilike(code_clean)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Role with code '{code_clean}' already exists.")

    new_role = Role(
        code=code_clean,
        name=payload.name.strip(),
        description=payload.description,
        is_active=True
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)

    assigned_codes = []
    if payload.permissions:
        for p_code in payload.permissions:
            perm = db.query(Permission).filter(Permission.code == p_code.strip()).first()
            if perm:
                db.add(RolePermission(role_id=new_role.id, permission_id=perm.id))
                assigned_codes.append(perm.code)
        db.commit()

    return RoleResponse(
        id=new_role.id,
        code=new_role.code,
        name=new_role.name,
        description=new_role.description,
        is_active=new_role.is_active,
        permissions=assigned_codes
    )

@router.put("/{role_id}/permissions", response_model=RoleResponse)
def update_role_permissions(
    role_id: int,
    payload: RoleUpdatePermissions,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update permissions assigned to a role."""
    if not (check_permission(current_user, "role:manage", db) or check_permission(current_user, "user:manage", db)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Administrator authorization required to modify role permissions."
        )

    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail=f"Role with ID {role_id} not found.")

    # Remove existing permissions for this role
    db.query(RolePermission).filter(RolePermission.role_id == role.id).delete(synchronize_session="fetch")

    assigned_codes = []
    for p_code in payload.permission_codes:
        clean_code = p_code.strip()
        perm = db.query(Permission).filter(
            (Permission.code == clean_code) | (Permission.code.ilike(clean_code))
        ).first()
        if perm:
            db.add(RolePermission(role_id=role.id, permission_id=perm.id))
            assigned_codes.append(perm.code)

    db.commit()
    db.refresh(role)

    return RoleResponse(
        id=role.id,
        code=role.code,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        permissions=assigned_codes
    )
