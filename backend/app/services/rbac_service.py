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
def get_user_approval_divisions(user: User) -> set[str]:
    """
    Returns the set of uppercase division codes the user is authorized for.
    Reads user.approval_divisions, falling back to user.division.
    """
    if not user:
        return set()
    raw = (getattr(user, "approval_divisions", None) or getattr(user, "division", "") or "").strip()
    if not raw:
        return set()
    # Support comma-delimited strings and JSON lists
    cleaned = raw.replace('"', '').replace('[', '').replace(']', '').replace("'", "")
    return {d.strip().upper() for d in cleaned.split(',') if d.strip()}


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
    # another division unless it is in their authorized approval divisions.
    # -----------------------------------------------------------------------
    user_div = (user.division or "").strip().upper()
    doc_div = (doc.division or "").strip().upper()
    user_approval_divs = get_user_approval_divisions(user)

    if (
        doc_div
        and user_approval_divs
        and not any(d in {"HQ", "GLOBAL", "ALL"} for d in user_approval_divs)
        and doc_div not in user_approval_divs
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
            any(d in {"HQ", "GLOBAL", "", "ALL"} for d in user_approval_divs)
            or doc_div in user_approval_divs
        ):
            return True

    # -----------------------------------------------------------------------
    # Department Manager
    # -----------------------------------------------------------------------
    if u_role == "manager":

        if (
            doc_div in user_approval_divs
            or any(d in {"HQ", "GLOBAL"} for d in user_approval_divs)
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


# ---------------------------------------------------------------------------
# OBJECT-LEVEL REPLACEMENT & VERSIONING AUTHORIZATION
# ---------------------------------------------------------------------------
def check_document_owner_or_assigned(
    user: User,
    doc: Document,
    db: Session = None,
) -> bool:
    """
    Object-level authorization check for file replacement, re-routing, and versioning.
    A caller with 'doc:create' is only permitted to replace/version files on documents
    they own (creator/submitter) or are currently assigned to (assigned approver pool).
    Administrators are always permitted.

    Ownership is strictly verified by unique user identifiers (user ID, employee_id, username).
    Display-name matching (employee_name, contact_person if holding a display name) is strictly
    forbidden to eliminate cross-user collision vulnerabilities when multiple employees share
    the same display name.
    """
    if not user or not user.is_active:
        return False

    u_role = (user.role or "").strip().lower()
    if u_role in {"admin", "administrator", "system_admin", "superadmin", "system administrator"} or getattr(user, "is_superuser", False):
        return True

    # Strictly unique identifiers only
    u_username = (user.username or "").strip().lower()
    u_emp_id = (user.employee_id or "").strip().lower()

    # 1. Document ownership by user_id
    if getattr(doc, "user_id", None) is not None and doc.user_id == user.id:
        return True

    # 2. Document ownership by unique employee_id
    if u_emp_id and doc.employee_id and doc.employee_id.strip().lower() == u_emp_id:
        return True

    # 3. Document ownership by username
    if u_username:
        if doc.contact_person and doc.contact_person.strip().lower() == u_username:
            return True
        if getattr(doc, "uploaded_by", None) and str(doc.uploaded_by).strip().lower() == u_username:
            return True

    # 4. Database audit log check: matches first creation audit log by username or employee_id
    if db:
        from app.database.models import AuditLog, ApprovalAssignment
        first_log = db.query(AuditLog).filter(AuditLog.invoice_id == str(doc.id)).order_by(AuditLog.timestamp.asc()).first()
        if first_log and first_log.user:
            log_user = first_log.user.strip().lower()
            if (u_username and log_user == u_username) or (u_emp_id and log_user == u_emp_id):
                return True

        # Check pending ApprovalAssignment by user.id
        pending = db.query(ApprovalAssignment).filter(
            ApprovalAssignment.document_id == str(doc.id),
            ApprovalAssignment.approver_user_id == user.id,
            ApprovalAssignment.status == "PENDING"
        ).first()
        if pending:
            return True

    # 5. Assigned approver pool: strictly by username, employee_id, or role code
    if doc.assigned_approver:
        approvers = [
            val.strip().lower()
            for val in doc.assigned_approver.split(",")
            if val.strip()
        ]
        if (u_username and u_username in approvers) or (u_emp_id and u_emp_id in approvers) or (u_role and u_role in approvers):
            return True

    return False