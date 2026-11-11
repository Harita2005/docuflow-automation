import logging
import threading
import time
from typing import List, Optional, Set

from fastapi import HTTPException, status, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database.connection import get_db
from app.database.models import Document, Permission, RolePermission, User

logger = logging.getLogger(__name__)

_ROLE_PERMS_CACHE: dict = {}
_ROLE_PERMS_LOCK = threading.Lock()
_ROLE_PERMS_TTL = 30.0

def invalidate_role_permissions_cache(role_id: Optional[int] = None):
    """Purge cached role permissions on role update or revocation."""
    with _ROLE_PERMS_LOCK:
        if role_id is not None:
            _ROLE_PERMS_CACHE.pop(role_id, None)
        else:
            _ROLE_PERMS_CACHE.clear()

def get_role_permissions_set(role_id: int, db: Session) -> Set[str]:
    """Retrieve and cache all active permission codes for a role_id."""
    now = time.monotonic()
    with _ROLE_PERMS_LOCK:
        entry = _ROLE_PERMS_CACHE.get(role_id)
        if entry and (now - entry["timestamp"] < _ROLE_PERMS_TTL):
            return entry["perms"]

    rows = (
        db.query(Permission.code, Permission.legacy_code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id == role_id, Permission.is_active == True)
        .all()
    )
    perms = set()
    for code, legacy in rows:
        if code:
            perms.add(code.strip())
        if legacy:
            perms.add(legacy.strip())

    with _ROLE_PERMS_LOCK:
        _ROLE_PERMS_CACHE[role_id] = {"perms": perms, "timestamp": now}
    return perms

__all__ = [
    "check_permission",
    "user_has_permission",
    "require_permission",
    "require_role",
    "get_user_approval_divisions",
    "authorize_document_access",
    "check_document_owner_or_assigned",
    "invalidate_role_permissions_cache",
]


# ---------------------------------------------------------------------------
# RBAC PERMISSION CHECK
# ---------------------------------------------------------------------------

PERMISSION_EQUIVALENTS = {
    "doc:create": {
        "doc:create",
        "doc:upload:create",
        "upload:create",
        "upload:write",
        "upload",
        "doc:upload",
        "document:create",
        "doc:write",
        "wf:trigger",
    },
    "wf:trigger": {
        "wf:trigger",
        "doc:create",
        "doc:upload:create",
        "upload:create",
        "upload:write",
        "upload",
        "doc:upload",
        "workflow:trigger",
        "workflow:write",
    },
    "doc:read": {
        "doc:read",
        "document:read",
        "doc:view",
        "doc:upload:view",
        "doc:detail:view",
        "doc:work_tracker:view",
        "upload",
        "work-tracker",
        "dashboard",
        "approved-documents",
    },
    "doc:edit": {
        "doc:edit",
        "document:edit",
        "doc:detail:edit",
        "doc:verification:edit",
        "doc:create",
        "upload",
        "upload:write",
        "work-tracker",
        "work-tracker:write",
    },
    "doc:approve": {
        "doc:approve",
        "document:approve",
        "doc:detail:approve",
        "wf:approve",
        "workflow:approve",
        "work-tracker:admin",
        "work-tracker:write",
    },
    "doc:reject": {
        "doc:reject",
        "document:reject",
        "doc:detail:reject",
        "wf:reject",
        "workflow:reject",
        "work-tracker:admin",
        "work-tracker:write",
    },
    "doc:cancel": {
        "doc:cancel",
        "document:cancel",
        "doc:detail:cancel",
        "work-tracker:admin",
        "work-tracker:write",
    },
}

def check_permission(user: User, permission_code: str, db: Session) -> bool:
    """
    Check whether the user has the requested permission.

    Canonical RBAC flow:
        User.role_id (or user.role lookup)
            -> RolePermission.role_id
            -> Permission.code / Permission.legacy_code (including equivalent functional permissions)
    """

    if not user or not user.is_active:
        return False

    clean_code = (permission_code or "").strip()

    if not clean_code:
        return False

    # -----------------------------------------------------------------------
    # System administrator / superuser bypass
    # -----------------------------------------------------------------------
    legacy_role = (user.role or "").strip().lower()

    if getattr(user, 'is_superuser', False) or legacy_role in {
        "admin",
        "administrator",
        "system_admin",
        "superadmin",
        "system administrator",
        "settings_editor",
    } or "admin" in legacy_role:
        return True

    # -----------------------------------------------------------------------
    # Canonical RBAC
    # -----------------------------------------------------------------------
    role_id = user.role_id
    if not role_id and user.role:
        from app.database.models import Role
        r_clean = user.role.strip()
        matched = db.query(Role.id).filter(
            (Role.code.ilike(r_clean)) | (Role.name.ilike(r_clean))
        ).first()
        if matched:
            role_id = matched[0]
            user.role_id = role_id

    if not role_id:
        return False

    try:
        perms = get_role_permissions_set(role_id, db)
        if clean_code in perms:
            return True

        # Check aliases / equivalent permissions
        equivalents = PERMISSION_EQUIVALENTS.get(clean_code)
        if equivalents and (equivalents & perms):
            return True

        # Fallback: check UI permissions matrix (RBAC_GRANULAR_MATRIX / ROLE_PERMISSIONS)
        try:
            from app.routers.documents import load_app_configs
            import json
            configs = load_app_configs()
            for c in configs:
                if c.get("key") in ("RBAC_GRANULAR_MATRIX", "ROLE_PERMISSIONS"):
                    matrix = json.loads(c.get("value", "{}"))
                    role_keys = [str(role_id), str(user.role or "").lower(), str(user.role or "")]
                    for rk in role_keys:
                        if rk in matrix:
                            r_matrix = matrix[rk]
                            if clean_code in ("doc:create", "wf:trigger", "doc:upload:create"):
                                up_perm = r_matrix.get("upload") or {}
                                if up_perm.get("write") or up_perm.get("admin"):
                                    return True
                                dc_perm = r_matrix.get("doc:create") or {}
                                if dc_perm.get("write") or dc_perm.get("read"):
                                    return True
                            elif clean_code in ("doc:read", "doc:view"):
                                if any((r_matrix.get(p) or {}).get("read") for p in ("upload", "work-tracker", "dashboard", "approved-documents")):
                                    return True
                            elif clean_code in ("doc:edit", "doc:verification:edit", "doc:detail:edit"):
                                wt_perm = r_matrix.get("work-tracker") or {}
                                up_perm = r_matrix.get("upload") or {}
                                if wt_perm.get("write") or up_perm.get("write"):
                                    return True
                            elif clean_code in ("doc:approve", "doc:reject", "doc:cancel"):
                                wt_perm = r_matrix.get("work-tracker") or {}
                                if wt_perm.get("write") or wt_perm.get("admin"):
                                    return True
        except Exception as matrix_err:
            logger.debug("Non-fatal matrix fallback check error: %s", matrix_err)

        return False

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
    UPLOADER_ROLES = {"account_uploader", "account_uploder", "accounts_uploder", "doc_uploder", "doc_uploader", "uploader"}
    if u_role in UPLOADER_ROLES:
        raw_handles.extend(list(UPLOADER_ROLES))
        raw_handles.extend(["accounts", "account", "approver"])
    user_handles = [handle for handle in raw_handles if handle]
    # -----------------------------------------------------------------------
    # Strict Division Boundary
    #
    # Users from a specific division cannot access documents belonging to
    # another division unless it is in their authorized approval divisions.
    # -----------------------------------------------------------------------
    doc_div = (doc.division or "").strip().upper()
    user_approval_divs = get_user_approval_divisions(user)

    if (
        doc_div
        and doc_div not in {"HQ", "GLOBAL", "ALL"}
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
    # Document Creator / Submitter / Owner
    # -----------------------------------------------------------------------
    if getattr(doc, "user_id", None) is not None and doc.user_id == user.id:
        return True
    if user.employee_id and doc.employee_id and doc.employee_id.strip().lower() == user.employee_id.strip().lower():
        return True
    if getattr(doc, "uploaded_by", None) and str(doc.uploaded_by).strip().lower() in user_handles:
        return True
    if getattr(doc, "created_by", None) and str(doc.created_by).strip().lower() in user_handles:
        return True
    if doc.contact_person and doc.contact_person.strip().lower() in user_handles:
        return True

    # -----------------------------------------------------------------------
    # Uploader / Accounts Roles Access
    # -----------------------------------------------------------------------
    is_uploader = (
        u_role in UPLOADER_ROLES
        or any(x in u_role for x in ['uplod', 'upload', 'account', 'approver', 'manager'])
    )
    if is_uploader:
        is_unrouted = (
            not doc.workflow_profile_id
            or str(doc.workflow_profile_id).strip() in ['', 'UNROUTED', 'NONE', 'None']
            or 'unrouted' in (doc.status or '').lower()
            or 'no rule matched' in (doc.status or '').lower()
            or 'unassigned' in (doc.assigned_approver or '').lower()
        )
        curr_stg = 1
        try:
            curr_stg = int(getattr(doc, 'current_stage', 1) or 1)
        except (ValueError, TypeError):
            curr_stg = 1
        is_attachment_stage = curr_stg == 1 or any(x in (doc.status or '').lower() for x in ['attachment', 'initiated', 'verification', 'pending'])
        if is_unrouted or is_attachment_stage or curr_stg == 1:
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