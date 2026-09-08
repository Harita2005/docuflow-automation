import logging
from typing import List, Optional
from fastapi import HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.auth import get_current_user
from app.database import get_db
from app.models import User, Document, Role, Permission, RolePermission, Division, Department

logger = logging.getLogger(__name__)

def check_permission(user: User, permission_code: str, db: Session) -> bool:
    if not user or not user.is_active:
        return False
    # Admin role has universal permission
    if (user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']:
        return True
    
    # Query role permissions
    if user.role_id:
        has_perm = db.query(RolePermission).join(Permission).filter(
            RolePermission.role_id == user.role_id,
            Permission.code == permission_code
        ).first()
        if has_perm:
            return True
            
    # Check by role code lookup
    role_obj = db.query(Role).filter(Role.code.ilike(user.role or '')).first()
    if role_obj:
        has_perm = db.query(RolePermission).join(Permission).filter(
            RolePermission.role_id == role_obj.id,
            Permission.code == permission_code
        ).first()
        if has_perm:
            return True

    return False

def require_permission(permission_code: str):
    def dependency(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        if not check_permission(user, permission_code, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Missing required permission '{permission_code}'."
            )
        return user
    return dependency

def require_role(allowed_roles: List[str]):
    def dependency(user: User = Depends(get_current_user)):
        u_role = (user.role or '').strip().lower()
        allowed = [r.strip().lower() for r in allowed_roles]
        if 'admin' in allowed and u_role in ['admin', 'administrator', 'system_admin', 'superadmin']:
            return user
        if u_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access Denied: Role '{user.role}' is not authorized for this operation."
            )
        return user
    return dependency

def authorize_document_access(user: User, doc: Document, required_action: str = 'READ') -> bool:
    """
    Enforces Division, Department, Assigned Approver, and Role boundaries.
    Prevents IDOR and cross-tenant / cross-division tampering.
    """
    if not user or not user.is_active:
        return False
    u_role = (user.role or '').strip().lower()
    if u_role in ['admin', 'administrator', 'system_admin', 'superadmin']:
        return True

    user_handles = [
        (user.username or '').strip().lower(),
        (user.employee_id or '').strip().lower(),
        (user.employee_name or '').strip().lower(),
        (user.name or '').strip().lower(),
        (user.email or '').strip().lower()
    ]
    user_handles = [h for h in user_handles if h]

    # Strict Division Boundary: Users from a specific division cannot access another division's documents
    user_div = (user.division or '').strip().upper()
    doc_div = (doc.division or '').strip().upper()
    if user_div and doc_div and user_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div != user_div:
        return False
    if u_role in ['gm', 'jmd', 'md']:
        # If document is assigned to user or their role
        if doc.assigned_approver:
            approvers = [s.strip().lower() for s in doc.assigned_approver.split(',') if s.strip()]
            for h in user_handles:
                if h in approvers or u_role in approvers:
                    return True
        # Scope by division if specified
        doc_div = (doc.division or '').strip().upper()
        user_div = (user.division or '').strip().upper()
        if user_div in ['HQ', 'GLOBAL', '', 'ALL'] or doc_div == user_div:
            return True

    # Department manager
    if u_role in ['manager']:
        doc_div = (doc.division or '').strip().upper()
        user_div = (user.division or '').strip().upper()
        if doc_div == user_div or user_div in ['HQ', 'GLOBAL']:
            return True

    # Finance Auditor
    if u_role in ['finance', 'finance_auditor', 'auditor']:
        return True

    # Document assigned approver check
    if doc.assigned_approver:
        approvers = [s.strip().lower() for s in doc.assigned_approver.split(',') if s.strip()]
        for h in user_handles:
            if h in approvers or u_role in approvers:
                return True

    # Employee scope: check if user is the submitter, contact person, or matching division
    if doc.contact_person:
        cp = doc.contact_person.strip().lower()
        if any(h == cp for h in user_handles):
            return True

    return False
