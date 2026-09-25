import datetime
import logging
import re
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_active_user
from app.database.connection import get_db
from app.database.models import Role, Permission, RolePermission, User, AuditLog
from app.services.rbac_service import check_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/roles", tags=["Role & Permission Management"])
permission_router = APIRouter(prefix="/api/admin/permissions", tags=["Role & Permission Management"])

# ---------------------------------------------------------------------------
# Registered Application Resources Catalogue
# ---------------------------------------------------------------------------
REGISTERED_MODULES = ["DOC", "WORKFLOW", "ADMIN", "INTEGRATION", "REPORT"]

REGISTERED_SUBPAGES = {
    "DOC": ["detail", "dashboard", "verification", "work_tracker", "approved_docs", "upload"],
    "WORKFLOW": ["routing", "matrix", "checklists", "templates"],
    "ADMIN": ["users", "rbac", "audit", "system", "raci", "inapp", "backups"],
    "INTEGRATION": ["applications", "callbacks", "sync", "logs"],
    "REPORT": ["work_tracker", "approved_docs", "audit"],
}

REGISTERED_ACTIONS = [
    "VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "REJECT",
    "HOLD", "SENDBACK", "ASSIGN", "DOWNLOAD", "EXPORT", "MANAGE", "TEST", "EXECUTE"
]

REGISTERED_SCOPES = ["OWN", "ASSIGNED", "DEPARTMENT", "DIVISION", "ALL"]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class PermissionResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    module: Optional[str] = "DOC"
    subpage: Optional[str] = None
    action: Optional[str] = "READ"
    supported_scopes: Optional[str] = None
    legacy_code: Optional[str] = None
    is_custom: bool = False
    is_active: bool = True
    created_by: Optional[str] = "System"
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None

    class Config:
        from_attributes = True


class CustomPermissionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    module: str
    subpage: str
    action: str
    supported_scopes: List[str]


class CustomPermissionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    supported_scopes: Optional[List[str]] = None


class PermissionRegistryResponse(BaseModel):
    modules: List[str]
    subpages: dict
    actions: List[str]
    scopes: List[str]
class RoleResponse(BaseModel):
    id: int
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    permissions: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    permissions: Optional[List[str]] = Field(default_factory=list)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Role code is required.")
        if not re.match(r"^[a-z0-9_]{2,50}$", value):
            raise ValueError("Role code may contain only lowercase letters, numbers, and underscores.")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Role name is required.")
        return value


class RoleUpdatePermissions(BaseModel):
    permission_codes: List[str]


def _require_rbac_admin(user: User, db: Session):
    if not (check_permission(user, "admin:rbac", db) or check_permission(user, "role:manage", db)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Administrator authorization ('admin:rbac') required."
        )


# ---------------------------------------------------------------------------
# Permission Endpoints
# ---------------------------------------------------------------------------
@permission_router.get("/registry", response_model=PermissionRegistryResponse)
def get_permissions_registry(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Returns application-registered Modules, Subpages, Actions, and Scopes dynamically from the permissions table."""
    _require_rbac_admin(current_user, db)

    db_modules = [m[0].upper() for m in db.query(Permission.module).filter(Permission.module.isnot(None)).distinct().all() if m[0]]
    modules = sorted(list(set(REGISTERED_MODULES + db_modules)))

    subpages = {m: list(REGISTERED_SUBPAGES.get(m, [])) for m in modules}
    for m in modules:
        db_subpages = [sp[0].lower() for sp in db.query(Permission.subpage).filter(Permission.module.ilike(m), Permission.subpage.isnot(None)).distinct().all() if sp[0]]
        merged = sorted(list(set(subpages[m] + db_subpages)))
        subpages[m] = merged

    return PermissionRegistryResponse(
        modules=modules,
        subpages=subpages,
        actions=REGISTERED_ACTIONS,
        scopes=REGISTERED_SCOPES,
    )


@permission_router.get("", response_model=List[PermissionResponse])
def get_all_permissions(
    module: Optional[str] = Query(None, description="Filter by module"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    is_custom: Optional[bool] = Query(None, description="Filter by custom flag"),
    include_legacy: bool = Query(True, description="Include legacy unmapped permissions"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all system and custom permissions with filtering."""
    _require_rbac_admin(current_user, db)
    query = db.query(Permission)
    if module:
        query = query.filter(Permission.module.ilike(module.strip()))
    if is_active is not None:
        query = query.filter(Permission.is_active == is_active)
    if is_custom is not None:
        query = query.filter(Permission.is_custom == is_custom)
    if not include_legacy:
        # Hide internal legacy codes whose format is not module:subpage:action
        query = query.filter(Permission.code.like("%:%:%"))
    return query.order_by(Permission.id.asc()).all()


@permission_router.post("", response_model=PermissionResponse, status_code=status.HTTP_201_CREATED)
def create_custom_permission(
    payload: CustomPermissionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Creates a new custom permission.
    The permission code is automatically generated server-side from module, subpage, and action.
    """
    _require_rbac_admin(current_user, db)

    # 1. Validate Name
    clean_name = payload.name.strip()
    if not clean_name or len(clean_name) < 3:
        raise HTTPException(status_code=422, detail="Permission name must be at least 3 characters long.")

    # 2. Validate Module
    clean_module = payload.module.strip().upper()
    if clean_module not in REGISTERED_MODULES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid module '{payload.module}'. Allowed modules: {', '.join(REGISTERED_MODULES)}."
        )

    # 3. Validate Subpage
    valid_subpages = REGISTERED_SUBPAGES.get(clean_module, [])
    clean_subpage = payload.subpage.strip().lower()
    if clean_subpage not in valid_subpages:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid subpage '{payload.subpage}' for module '{clean_module}'. Allowed: {', '.join(valid_subpages)}."
        )

    # 4. Validate Action
    clean_action = payload.action.strip().upper()
    if clean_action not in REGISTERED_ACTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid action '{payload.action}'. Allowed actions: {', '.join(REGISTERED_ACTIONS)}."
        )

    # 5. Validate Scopes
    if not payload.supported_scopes:
        raise HTTPException(status_code=422, detail="At least one supported scope must be selected.")
    clean_scopes = []
    for sc in payload.supported_scopes:
        sc_upper = sc.strip().upper()
        if sc_upper not in REGISTERED_SCOPES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid scope '{sc}'. Allowed scopes: {', '.join(REGISTERED_SCOPES)}."
            )
        if sc_upper not in clean_scopes:
            clean_scopes.append(sc_upper)

    # 6. Generate Permission Code
    gen_code = f"{clean_module.lower()}:{clean_subpage}:{clean_action.lower()}"

    # Verify code pattern
    if not re.match(r"^[a-z0-9_]{2,30}:[a-z0-9_]{2,30}:[a-z0-9_]{2,30}$", gen_code):
        raise HTTPException(status_code=422, detail=f"Generated code '{gen_code}' does not conform to naming standards.")

    # 7. Check Duplicate Code
    existing = db.query(Permission).filter(Permission.code == gen_code).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Permission with code '{gen_code}' already exists."
        )

    now = datetime.datetime.utcnow()
    creator = current_user.username or current_user.employee_name or "Administrator"

    new_perm = Permission(
        code=gen_code,
        name=clean_name,
        description=payload.description.strip() if payload.description else None,
        module=clean_module,
        subpage=clean_subpage,
        action=clean_action,
        supported_scopes=",".join(clean_scopes),
        is_custom=True,
        is_active=True,
        created_by=creator,
        created_at=now,
        updated_at=now,
    )
    db.add(new_perm)

    # Record Audit Log
    db.add(AuditLog(
        invoice_id=None,
        action="PERMISSION_CREATE",
        user=creator,
        notes=f"Created custom permission {gen_code} ('{clean_name}')"
    ))

    db.commit()
    db.refresh(new_perm)

    logger.info(f"Custom permission '{gen_code}' created by {creator}")
    return new_perm


@permission_router.put("/{permission_id}", response_model=PermissionResponse)
def update_custom_permission(
    permission_id: int,
    payload: CustomPermissionUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Updates display metadata of a custom permission.
    Technical definitions (code, module, subpage, action) cannot be modified.
    Built-in system permissions cannot be edited via this endpoint.
    """
    _require_rbac_admin(current_user, db)
    perm = db.query(Permission).filter(Permission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found.")

    if not perm.is_custom:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Built-in system permissions cannot be modified via custom permissions API."
        )

    if payload.name is not None:
        clean_name = payload.name.strip()
        if len(clean_name) < 3:
            raise HTTPException(status_code=422, detail="Permission name must be at least 3 characters long.")
        perm.name = clean_name

    if payload.description is not None:
        perm.description = payload.description.strip()

    if payload.supported_scopes is not None:
        if not payload.supported_scopes:
            raise HTTPException(status_code=422, detail="At least one supported scope must be selected.")
        clean_scopes = []
        for sc in payload.supported_scopes:
            sc_upper = sc.strip().upper()
            if sc_upper not in REGISTERED_SCOPES:
                raise HTTPException(status_code=422, detail=f"Invalid scope '{sc}'.")
            if sc_upper not in clean_scopes:
                clean_scopes.append(sc_upper)
        perm.supported_scopes = ",".join(clean_scopes)

    perm.updated_at = datetime.datetime.utcnow()

    # Record Audit Log
    db.add(AuditLog(
        invoice_id=None,
        action="PERMISSION_UPDATE",
        user=current_user.username or "Admin",
        notes=f"Updated custom permission {perm.code}"
    ))

    db.commit()
    db.refresh(perm)
    return perm


@permission_router.put("/{permission_id}/toggle-active", response_model=PermissionResponse)
def toggle_permission_active(
    permission_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Toggles is_active status of a permission.
    Deactivating a permission immediately revokes it during authorization checks.
    """
    _require_rbac_admin(current_user, db)
    perm = db.query(Permission).filter(Permission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found.")

    if perm.code == "admin:rbac":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate the root IAM Role & Permission management permission ('admin:rbac')."
        )

    new_status = not perm.is_active
    perm.is_active = new_status
    perm.updated_at = datetime.datetime.utcnow()

    db.add(AuditLog(
        invoice_id=None,
        action="PERMISSION_DEACTIVATE" if not new_status else "PERMISSION_ACTIVATE",
        user=current_user.username or "Admin",
        notes=f"{'Deactivated' if not new_status else 'Activated'} permission {perm.code}"
    ))

    db.commit()
    db.refresh(perm)
    return perm


@permission_router.delete("/{permission_id}")
def delete_custom_permission(
    permission_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Deletes a custom permission only if it is unused (not assigned to any role).
    Built-in permissions cannot be deleted.
    """
    _require_rbac_admin(current_user, db)
    perm = db.query(Permission).filter(Permission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found.")

    if not perm.is_custom:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Built-in system permissions cannot be deleted."
        )

    # Check if assigned to any roles
    assigned_count = db.query(RolePermission).filter(RolePermission.permission_id == perm.id).count()
    if assigned_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete custom permission '{perm.code}' because it is currently assigned to {assigned_count} role(s). Please deactivate it instead."
        )

    code_deleted = perm.code
    db.delete(perm)

    db.add(AuditLog(
        invoice_id=None,
        action="PERMISSION_DELETE",
        user=current_user.username or "Admin",
        notes=f"Deleted custom permission {code_deleted}"
    ))

    db.commit()
    return {"success": True, "message": f"Custom permission '{code_deleted}' deleted successfully."}


# ---------------------------------------------------------------------------
# Role Endpoints
# ---------------------------------------------------------------------------
@router.get("", response_model=List[RoleResponse])
def get_all_roles(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List all roles and their assigned permissions."""
    _require_rbac_admin(current_user, db)
    roles = db.query(Role).order_by(Role.id.asc()).all()
    result = []
    for r in roles:
        perm_codes = [rp.permission.code for rp in r.permissions if rp.permission and rp.permission.is_active]
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
    _require_rbac_admin(current_user, db)

    code_clean = payload.code.strip().lower()
    existing = db.query(Role).filter(Role.code.ilike(code_clean)).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Role with code '{code_clean}' already exists.")

    permission_codes = []
    seen_codes = set()
    for p_code in payload.permissions or []:
        clean_code = p_code.strip()
        if not clean_code:
            continue
        key = clean_code.lower()
        if key in seen_codes:
            continue
        seen_codes.add(key)
        perm = db.query(Permission).filter(Permission.code.ilike(clean_code)).first()
        if not perm:
            name_clean = clean_code.replace(':', ' ').replace('_', ' ').title()
            perm = Permission(
                code=clean_code,
                name=name_clean,
                module=clean_code.split(':')[0].upper() if ':' in clean_code else 'SYSTEM',
                is_active=True,
                is_custom=True
            )
            db.add(perm)
            db.commit()
            db.refresh(perm)
        if not perm.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Permission '{clean_code}' is inactive."
            )
        permission_codes.append(perm.code)

    new_role = Role(
        code=code_clean,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        is_active=True
    )

    try:
        db.add(new_role)
        db.flush()

        for permission_code in permission_codes:
            perm = db.query(Permission).filter(Permission.code == permission_code).first()
            db.add(RolePermission(
                role_id=new_role.id,
                permission_id=perm.id,
                scope="ALL"
            ))

        db.commit()
        db.refresh(new_role)
    except Exception:
        db.rollback()
        logger.exception("Failed to create role '%s'", code_clean)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create role."
        )

    return RoleResponse(
        id=new_role.id,
        code=new_role.code,
        name=new_role.name,
        description=new_role.description,
        is_active=new_role.is_active,
        permissions=permission_codes
    )


@router.put("/{role_id}/permissions", response_model=RoleResponse)
def update_role_permissions(
    role_id: int,
    payload: RoleUpdatePermissions,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update permissions assigned to a role."""
    _require_rbac_admin(current_user, db)

    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail=f"Role with ID {role_id} not found.")

    # Validate the complete requested permission set before replacing anything.
    assigned_permissions = []
    seen_codes = set()

    for p_code in payload.permission_codes:
        clean_code = p_code.strip()
        if not clean_code:
            continue

        key = clean_code.lower()
        if key in seen_codes:
            continue
        seen_codes.add(key)

        perm = db.query(Permission).filter(Permission.code.ilike(clean_code)).first()
        if not perm:
            name_clean = clean_code.replace(':', ' ').replace('_', ' ').title()
            perm = Permission(
                code=clean_code,
                name=name_clean,
                module=clean_code.split(':')[0].upper() if ':' in clean_code else 'SYSTEM',
                is_active=True,
                is_custom=True
            )
            db.add(perm)
            db.commit()
            db.refresh(perm)

        if not perm.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Permission '{clean_code}' is inactive."
            )

        assigned_permissions.append(perm)

    try:
        # Replace the role's permission set atomically.
        db.query(RolePermission).filter(
            RolePermission.role_id == role.id
        ).delete(synchronize_session="fetch")

        for perm in assigned_permissions:
            db.add(RolePermission(
                role_id=role.id,
                permission_id=perm.id,
                scope="ALL"
            ))

        db.commit()
        db.refresh(role)
    except Exception:
        db.rollback()
        logger.exception("Failed to update permissions for role '%s'", role.code)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update role permissions."
        )

    assigned_codes = [perm.code for perm in assigned_permissions]

    return RoleResponse(
        id=role.id,
        code=role.code,
        name=role.name,
        description=role.description,
        is_active=role.is_active,
        permissions=assigned_codes
    )
