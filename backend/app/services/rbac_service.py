import logging
from typing import List

from fastapi import HTTPException, status, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.connection import get_db
from app.database.models import Document, Permission, RolePermission, User

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# RBAC PERMISSION CHECK
# ---------------------------------------------------------------------------

def check_permission(user: User, permission_code: str, db: Session) -> bool:
    """
    Check whether the user has the requested permission.

    Canonical RBAC flow:
        User.role_id
            -> RolePermission.role_id
            -> Permission.code / Permission.legacy_code

    `user.role` is retained only for legacy system-admin compatibility.
    """

    if not user or not user.is_active:
        return False

    clean_code = (permission_code or "").strip()

    if not clean_code:
        return False

    # -----------------------------------------------------------------------
    # Legacy system-admin bypass
    #
    # Keep this for existing installations where admin users may still have
    # the legacy `role` string populated.
    # -----------------------------------------------------------------------
    legacy_role = (user.role or "").strip().lower()

    if legacy_role in {
        "admin",
        "administrator",
        "system_admin",
        "superadmin",
    }:
        return True

    # -----------------------------------------------------------------------
    # Canonical RBAC
    #
    # role_id is now the source of truth.
    # -----------------------------------------------------------------------
    if not user.role_id:
        return False

    try:
        has_permission = (
            db.query(RolePermission)
            .join(Permission)
            .filter(
                RolePermission.role_id == user.role_id,
                Permission.is_active == True,
                (
                    (Permission.code == clean_code)
                    | (Permission.legacy_code == clean_code)
                ),
            )
            .first()
        )

        return has_permission is not None

    except Exception:
        logger.exception(
            "RBAC permission check failed for user_id=%s permission=%s",
            getattr(user, "id", None),
            clean_code,
        )
        return False


# Backward-compatible alias
user_has_permission = check_permission


# ---------------------------------------------------------------------------
# FASTAPI PERMISSION DEPENDENCY
# ---------------------------------------------------------------------------

def require_permission(permission_code: str):
    """
    FastAPI dependency for permission-based authorization.

    Example:
        @router.get("/something")
        def something(
            user: User = Depends(require_permission("document:read"))
        ):
            ...
    """

    def dependency(
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        if not check_permission(user, permission_code, db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access Denied: Missing required permission "
                    f"'{permission_code}'."
                ),
            )

        return user

    return dependency


# ---------------------------------------------------------------------------
# LEGACY ROLE DEPENDENCY
# ---------------------------------------------------------------------------

def require_role(allowed_roles: List[str]):
    """
    Legacy role-name authorization.

    This is intentionally kept for existing endpoints that still use
    require_role([...]). New RBAC endpoints should use require_permission().
    """

    def dependency(user: User = Depends(get_current_user)):
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: Inactive or invalid user.",
            )

        u_role = (user.role or "").strip().lower()
        allowed = [r.strip().lower() for r in allowed_roles]

        # Existing administrator compatibility
        if (
            "admin" in allowed
            and u_role
            in {
                "admin",
                "administrator",
                "system_admin",
                "superadmin",
            }
        ):
            return user

        if u_role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Access Denied: Role '{user.role}' "
                    f"is not authorized for this operation."
                ),
            )

        return user

    return dependency


# ---------------------------------------------------------------------------
# DOCUMENT ACCESS AUTHORIZATION
# ---------------------------------------------------------------------------

def authorize_document_access(
    user: User,
    doc: Document,
    required_action: str = "READ",
) -> bool:
    """
    Enforces Division, Department, Assigned Approver, and Role boundaries.

    Prevents IDOR and cross-tenant / cross-division tampering.

    NOTE:
    This function intentionally preserves the existing business rules based
    on legacy role names (GM/JMD/MD/Manager/Finance/etc.).

    General RBAC permission checks should use check_permission().
    """

    if not user or not user.is_active:
        return False

    u_role = (user.role or "").strip().lower()

    # -----------------------------------------------------------------------
    # System administrators
    # -----------------------------------------------------------------------
    if u_role in {
        "admin",
        "administrator",
        "system_admin",
        "superadmin",
    }:
        return True

    # -----------------------------------------------------------------------
    # Build all possible user identifiers
    # -----------------------------------------------------------------------
    raw_handles = [
        (user.username or "").strip().lower(),
        (user.employee_id or "").strip().lower(),
        (user.employee_name or "").strip().lower(),
        (user.name or "").strip().lower(),
        (user.email or "").strip().lower(),
    ]

    user_handles = [handle for handle in raw_handles if handle]

    # -----------------------------------------------------------------------
    # Strict Division Boundary
    #
    # Users from a specific division cannot access documents belonging to
    # another division.
    # -----------------------------------------------------------------------
    user_div = (user.division or "").strip().upper()
    doc_div = (doc.division or "").strip().upper()

    if (
        user_div
        and doc_div
        and user_div not in {"HQ", "GLOBAL", "ALL"}
        and doc_div != user_div
    ):
        return False

    # -----------------------------------------------------------------------
    # GM / JMD / MD
    # -----------------------------------------------------------------------
    if u_role in {"gm", "jmd", "md"}:

        # Assigned approver check
        if doc.assigned_approver:
            approvers = [
                value.strip().lower()
                for value in doc.assigned_approver.split(",")
                if value.strip()
            ]

            for handle in user_handles:
                if handle in approvers or u_role in approvers:
                    return True

        # Division scope
        if (
            user_div in {"HQ", "GLOBAL", "", "ALL"}
            or doc_div == user_div
        ):
            return True

    # -----------------------------------------------------------------------
    # Department Manager
    # -----------------------------------------------------------------------
    if u_role == "manager":

        if (
            doc_div == user_div
            or user_div in {"HQ", "GLOBAL"}
        ):
            return True

    # -----------------------------------------------------------------------
    # Finance / Auditor
    # -----------------------------------------------------------------------
    if u_role in {
        "finance",
        "finance_auditor",
        "auditor",
    }:
        return True

    # -----------------------------------------------------------------------
    # Assigned Approver
    # -----------------------------------------------------------------------
    if doc.assigned_approver:

        approvers = [
            value.strip().lower()
            for value in doc.assigned_approver.split(",")
            if value.strip()
        ]

        for handle in user_handles:
            if handle in approvers or u_role in approvers:
                return True

    # -----------------------------------------------------------------------
    # Contact Person / Submitter
    # -----------------------------------------------------------------------
    if doc.contact_person:

        contact_person = doc.contact_person.strip().lower()

        if any(
            handle == contact_person
            for handle in user_handles
        ):
            return True

    return False