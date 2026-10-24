import csv
import datetime
import io
import logging
import math
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, and_, desc, asc
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import AuditLog, SystemLog, User
from app.routers.documents import load_app_configs, save_app_config
from app.schemas import AuditLogResponse, PaginatedAuditLogsResponse
from app.auth import get_current_active_user
from app.routers.auth import extract_client_ip
from app.services.rbac_service import check_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Audit Logs"])


def _require_audit_admin(user: User, db: Session):
    is_admin = (
        (user.role or "").lower() in ["admin", "administrator", "system_admin", "superadmin"]
        or check_permission(user, "admin:rbac", db)
        or check_permission(user, "admin:audit", db)
    )
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Administrator authorization required."
        )


def classify_audit_log(action: Optional[str], stage: Optional[str] = None) -> tuple[str, str]:
    """Deterministically categorize audit logs into business category and outcome."""
    act = (action or "").lower()
    stg = (stage or "").lower()

    # 1. Security & Sessions
    if (
        any(k in act for k in ["session", "mfa", "login", "auth", "lockout", "password", "token", "logout", "locked"])
        or "auth" in stg
    ):
        cat = "SECURITY"
    # 2. Configuration & Admin Changes
    elif (
        any(k in act for k in ["config", "rule", "matrix", "permission", "role", "template", "raci", "retention", "prune", "cleanup"])
        or any(k in stg for k in ["matrix", "policy", "config", "admin", "all rules"])
    ):
        cat = "CONFIG"
    # 3. Data Syncs
    elif any(k in act for k in ["sync", "ingest"]) or any(k in stg for k in ["sync", "intake (erp)"]):
        cat = "DATA_SYNC"
    # 4. Approvals & Workflow Events
    elif (
        any(k in act for k in ["approve", "reject", "hold", "cancel", "verified", "uploaded", "checklist", "comment", "unrouted", "workflow"])
        or any(k in stg for k in ["stage", "rule evaluation", "approval", "intake"])
    ):
        cat = "APPROVAL"
    else:
        cat = "OTHER"

    # Determine Outcome
    if any(k in act for k in ["fail", "reject", "error", "locked", "cancel"]):
        outcome = "Failed"
    elif any(k in act for k in ["hold", "pause", "unrouted", "wait", "pending"]):
        outcome = "Warning"
    elif any(k in act for k in ["verified", "approved", "confirm", "complete", "ingest", "sync", "created", "published", "direct login"]):
        outcome = "Success"
    else:
        outcome = "Info"

    return cat, outcome


def get_audit_retention_days() -> int:
    """Read configured retention days from app_config or fallback to settings."""
    try:
        configs = load_app_configs()
        for c in configs:
            if c.get("key") == "AUDIT_LOG_RETENTION_DAYS":
                val = c.get("value")
                if val is not None and str(val).isdigit():
                    return int(val)
    except Exception as e:
        logger.debug("Error reading retention config: %s", e)
    return getattr(settings, "AUDIT_LOG_RETENTION_DAYS", 0)


def prune_expired_audit_logs(db: Session, retention_days: Optional[int] = None) -> int:
    """Delete audit logs older than retention_days (if retention_days > 0)."""
    if retention_days is None:
        retention_days = get_audit_retention_days()
    if retention_days <= 0:
        return 0

    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
    try:
        deleted = (
            db.query(AuditLog)
            .filter(AuditLog.timestamp < cutoff)
            .delete(synchronize_session=False)
        )
        db.commit()
        if deleted > 0:
            logger.info(
                "Pruned %d expired audit logs older than %d days (cutoff: %s)",
                deleted,
                retention_days,
                cutoff.isoformat(),
            )
        return deleted
    except Exception as exc:
        db.rollback()
        logger.error("Failed to prune expired audit logs: %s", exc)
        return 0


def sanitize_csv_cell(value: Any) -> str:
    """Sanitize cell value against CSV / spreadsheet formula injection."""
    if value is None:
        return ""
    val_str = str(value)
    if val_str and val_str[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + val_str
    return val_str


def parse_date_window(
    date_preset: Optional[str] = "7d",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> tuple[Optional[datetime.datetime], datetime.datetime, Optional[datetime.datetime]]:
    """
    Returns (start_time, end_time, prev_start_time).
    prev_start_time is for period-over-period comparison.
    """
    now = datetime.datetime.utcnow()
    preset = (date_preset or "").lower().strip()

    if preset == "24h":
        start = now - datetime.timedelta(hours=24)
        prev = start - datetime.timedelta(hours=24)
        return start, now, prev
    elif preset == "7d":
        start = now - datetime.timedelta(days=7)
        prev = start - datetime.timedelta(days=7)
        return start, now, prev
    elif preset == "30d":
        start = now - datetime.timedelta(days=30)
        prev = start - datetime.timedelta(days=30)
        return start, now, prev
    elif preset == "all":
        return None, now, None
    elif preset == "custom" and (start_date or end_date):
        start = None
        end = now
        if start_date:
            try:
                start = datetime.datetime.fromisoformat(start_date.replace("Z", "+00:00")).replace(tzinfo=None)
            except Exception:
                try:
                    start = datetime.datetime.strptime(start_date[:10], "%Y-%m-%d")
                except Exception:
                    start = now - datetime.timedelta(days=7)
        if end_date:
            try:
                end = datetime.datetime.fromisoformat(end_date.replace("Z", "+00:00")).replace(tzinfo=None)
                if len(end_date) <= 10:
                    end = end + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)
            except Exception:
                try:
                    end = datetime.datetime.strptime(end_date[:10], "%Y-%m-%d") + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)
                except Exception:
                    end = now
        delta = (end - start) if start else datetime.timedelta(days=7)
        prev = (start - delta) if start else None
        return start, end, prev
    else:
        # Default to 7 days
        start = now - datetime.timedelta(days=7)
        prev = start - datetime.timedelta(days=7)
        return start, now, prev


def _clean_str(val: Any) -> Optional[str]:
    if isinstance(val, str):
        s = val.strip()
        return s if s and s != "ALL" else None
    return None


def apply_audit_filters(
    query,
    category: Optional[str] = None,
    start_time: Optional[datetime.datetime] = None,
    end_time: Optional[datetime.datetime] = None,
    user_filter: Optional[str] = None,
    action_filter: Optional[str] = None,
    stage_filter: Optional[str] = None,
    outcome_filter: Optional[str] = None,
    search: Optional[str] = None,
    invoice_id: Optional[str] = None
):
    inv_id = _clean_str(invoice_id)
    if inv_id:
        query = query.filter(AuditLog.invoice_id == inv_id)

    if isinstance(start_time, datetime.datetime):
        query = query.filter(AuditLog.timestamp >= start_time)
    if isinstance(end_time, datetime.datetime):
        query = query.filter(AuditLog.timestamp <= end_time)

    u_clean = _clean_str(user_filter)
    if u_clean:
        query = query.filter(AuditLog.user == u_clean)

    a_clean = _clean_str(action_filter)
    if a_clean:
        query = query.filter(AuditLog.action == a_clean)

    stg_clean = _clean_str(stage_filter)
    if stg_clean:
        query = query.filter(AuditLog.stage == stg_clean)

    # Category filtering
    cat_clean = _clean_str(category)
    cat_upper = cat_clean.upper() if cat_clean else ""
    if cat_upper in ("SYNC", "DATA_SYNC"):
        query = query.filter(
            or_(
                AuditLog.action.ilike("%sync%"),
                AuditLog.action.ilike("%ingest%"),
                AuditLog.stage.ilike("%sync%"),
                AuditLog.stage.ilike("%intake (erp)%")
            )
        )
    elif cat_upper in ("APPROVAL", "APPROVALS"):
        query = query.filter(
            or_(
                AuditLog.action.ilike("%approve%"),
                AuditLog.action.ilike("%reject%"),
                AuditLog.action.ilike("%hold%"),
                AuditLog.action.ilike("%cancel%"),
                AuditLog.action.ilike("%verified%"),
                AuditLog.action.ilike("%uploaded%"),
                AuditLog.action.ilike("%unrouted%"),
                AuditLog.action.ilike("%workflow%"),
                AuditLog.stage.ilike("%stage%"),
                AuditLog.stage.ilike("%rule evaluation%")
            )
        )
    elif cat_upper in ("SECURITY", "SECURITY & SESSIONS"):
        query = query.filter(
            or_(
                AuditLog.stage.ilike("%authentication%"),
                AuditLog.action.ilike("%session%"),
                AuditLog.action.ilike("%mfa%"),
                AuditLog.action.ilike("%login%"),
                AuditLog.action.ilike("%auth%"),
                AuditLog.action.ilike("%logout%"),
                AuditLog.action.ilike("%lock%")
            )
        )
    elif cat_upper in ("CONFIG", "CONFIGURATION CHANGES"):
        query = query.filter(
            or_(
                AuditLog.action.ilike("%config%"),
                AuditLog.action.ilike("%rule%"),
                AuditLog.action.ilike("%permission%"),
                AuditLog.action.ilike("%more_info%"),
                AuditLog.action.ilike("%retention%"),
                AuditLog.action.ilike("%prune%"),
                AuditLog.action.ilike("%role%"),
                AuditLog.stage.ilike("%policy matrix%"),
                AuditLog.stage.ilike("%moreinfoconfig%"),
                AuditLog.stage.ilike("%all rules%"),
                AuditLog.stage.ilike("%administration%")
            )
        )

    # Outcome filtering
    out_clean = _clean_str(outcome_filter)
    out_upper = out_clean.upper() if out_clean else ""
    if out_upper == "FAILED":
        query = query.filter(
            or_(
                AuditLog.action.ilike("%fail%"),
                AuditLog.action.ilike("%reject%"),
                AuditLog.action.ilike("%error%"),
                AuditLog.action.ilike("%locked%"),
                AuditLog.action.ilike("%cancel%")
            )
        )
    elif out_upper == "WARNING":
        query = query.filter(
            or_(
                AuditLog.action.ilike("%hold%"),
                AuditLog.action.ilike("%pause%"),
                AuditLog.action.ilike("%unrouted%"),
                AuditLog.action.ilike("%wait%")
            )
        )
    elif out_upper == "SUCCESS":
        query = query.filter(
            and_(
                or_(
                    AuditLog.action.ilike("%verified%"),
                    AuditLog.action.ilike("%approved%"),
                    AuditLog.action.ilike("%confirm%"),
                    AuditLog.action.ilike("%complete%"),
                    AuditLog.action.ilike("%ingest%"),
                    AuditLog.action.ilike("%sync%"),
                    AuditLog.action.ilike("%created%"),
                    AuditLog.action.ilike("%published%"),
                    AuditLog.action.ilike("%direct login%")
                ),
                ~AuditLog.action.ilike("%fail%"),
                ~AuditLog.action.ilike("%reject%"),
                ~AuditLog.action.ilike("%error%"),
                ~AuditLog.action.ilike("%locked%"),
                ~AuditLog.action.ilike("%cancel%")
            )
        )

    # General Search query
    q_search = _clean_str(search)
    if q_search:
        term = f"%{q_search}%"
        id_filter = None
        if q_search.isdigit():
            id_filter = AuditLog.id == int(q_search)

        search_conds = [
            AuditLog.user.ilike(term),
            AuditLog.action.ilike(term),
            AuditLog.stage.ilike(term),
            AuditLog.notes.ilike(term),
            AuditLog.ip_address.ilike(term),
            AuditLog.remarks.ilike(term),
            AuditLog.invoice_id.ilike(term),
        ]
        if id_filter is not None:
            search_conds.append(id_filter)

        query = query.filter(or_(*search_conds))

    return query


# -------------------------------------------------------------
# RETENTION POLICY ENDPOINTS
# -------------------------------------------------------------

@router.get("/admin/audit-logs/retention")
def get_retention_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    _require_audit_admin(current_user, db)
    days = get_audit_retention_days()
    total_logs = db.query(func.count(AuditLog.id)).scalar() or 0
    oldest_log = db.query(func.min(AuditLog.timestamp)).scalar()

    expired_count = 0
    cutoff = None
    if days > 0:
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
        expired_count = (
            db.query(func.count(AuditLog.id))
            .filter(AuditLog.timestamp < cutoff)
            .scalar()
            or 0
        )

    return {
        "retention_days": days,
        "default_retention_days": 7,
        "total_logs": total_logs,
        "oldest_log": oldest_log.isoformat() + "Z" if oldest_log else None,
        "expired_logs_count": expired_count,
        "cutoff_timestamp": cutoff.isoformat() + "Z" if cutoff else None,
    }


@router.post("/admin/audit-logs/retention")
def update_retention_status(
    req: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    _require_audit_admin(current_user, db)
    retention_days = payload.get("retention_days")
    if retention_days is None:
        raise HTTPException(
            status_code=400, detail="Missing retention_days in request body"
        )
    try:
        days = int(retention_days)
        if days < 0:
            raise ValueError()
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="retention_days must be a non-negative integer (0 = infinite)",
        )

    save_app_config(
        "AUDIT_LOG_RETENTION_DAYS",
        str(days),
        "Days to retain audit logs in application before pruning (default: 7)",
    )

    auto_prune = payload.get("prune_now", False)
    deleted_count = 0
    if auto_prune and days > 0:
        deleted_count = prune_expired_audit_logs(db, days)

    # Audit the retention policy change itself
    try:
        client_ip = extract_client_ip(req)
        actor_name = current_user.employee_name or current_user.name or current_user.username
        policy_label = f"{days} Days" if days > 0 else "Indefinite"
        db.add(AuditLog(
            invoice_id=None,
            user=actor_name,
            action="Retention Policy Updated",
            stage="Administration",
            notes=f"Audit retention policy updated to {policy_label} by {current_user.username}. IP: {client_ip}",
            ip_address=client_ip,
            timestamp=datetime.datetime.utcnow()
        ))
        db.commit()
    except Exception as exc:
        logger.debug("Failed to record retention policy audit log: %s", exc)

    return {
        "success": True,
        "retention_days": days,
        "deleted_count": deleted_count,
        "message": f"Audit log retention set to {days} days."
        if days > 0
        else "Audit log retention set to indefinite (all logs preserved).",
    }


@router.post("/admin/audit-logs/cleanup")
def manual_cleanup_logs(
    req: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    _require_audit_admin(current_user, db)
    days = get_audit_retention_days()
    deleted = prune_expired_audit_logs(db, days)
    remaining = db.query(func.count(AuditLog.id)).scalar() or 0

    # Audit the manual pruning event
    try:
        client_ip = extract_client_ip(req)
        actor_name = current_user.employee_name or current_user.name or current_user.username
        db.add(AuditLog(
            invoice_id=None,
            user=actor_name,
            action="Audit Logs Pruned",
            stage="Administration",
            notes=f"Pruned {deleted} expired audit logs older than {days} days by {current_user.username}. Remaining logs: {remaining}. IP: {client_ip}",
            ip_address=client_ip,
            timestamp=datetime.datetime.utcnow()
        ))
        db.commit()
    except Exception as exc:
        logger.debug("Failed to record pruning audit log: %s", exc)

    return {
        "success": True,
        "pruned": deleted,
        "deleted_count": deleted,
        "remaining_count": remaining,
        "retention_days": days,
        "message": f"Successfully purged {deleted} logs older than {days} days."
        if days > 0
        else "Retention is set to indefinite. No logs deleted.",
    }


# -------------------------------------------------------------
# SUMMARY METRICS ENDPOINT
# -------------------------------------------------------------

@router.get("/admin/audit-logs/summary")
def get_audit_summary_metrics(
    date_preset: Optional[str] = Query("7d"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Returns live database counts for the 4 summary cards:
    1. Total Events
    2. Failed Login Attempts
    3. Security Events
    4. Administrative Changes
    Plus period-over-period comparison metrics.
    """
    _require_audit_admin(current_user, db)
    start_time, end_time, prev_start = parse_date_window(date_preset, start_date, end_date)

    # 1. Total Events
    curr_q = db.query(func.count(AuditLog.id))
    if start_time:
        curr_q = curr_q.filter(AuditLog.timestamp >= start_time)
    if end_time:
        curr_q = curr_q.filter(AuditLog.timestamp <= end_time)
    total_events = curr_q.scalar() or 0

    prev_total_events = 0
    if prev_start and start_time:
        prev_total_events = (
            db.query(func.count(AuditLog.id))
            .filter(AuditLog.timestamp >= prev_start, AuditLog.timestamp < start_time)
            .scalar() or 0
        )

    # 2. Failed Login Attempts
    failed_q = db.query(func.count(AuditLog.id)).filter(
        or_(
            AuditLog.action.ilike("%Login Failed%"),
            AuditLog.action.ilike("%Account Locked%")
        )
    )
    if start_time:
        failed_q = failed_q.filter(AuditLog.timestamp >= start_time)
    if end_time:
        failed_q = failed_q.filter(AuditLog.timestamp <= end_time)
    failed_logins = failed_q.scalar() or 0

    prev_failed_logins = 0
    if prev_start and start_time:
        prev_failed_logins = (
            db.query(func.count(AuditLog.id))
            .filter(
                AuditLog.timestamp >= prev_start,
                AuditLog.timestamp < start_time,
                or_(
                    AuditLog.action.ilike("%Login Failed%"),
                    AuditLog.action.ilike("%Account Locked%")
                )
            )
            .scalar() or 0
        )

    # 3. Security Events
    sec_q = db.query(func.count(AuditLog.id)).filter(
        or_(
            AuditLog.stage.ilike("%Authentication%"),
            AuditLog.action.ilike("%Session%"),
            AuditLog.action.ilike("%MFA%"),
            AuditLog.action.ilike("%Login%"),
            AuditLog.action.ilike("%Logout%"),
            AuditLog.action.ilike("%Lock%")
        )
    )
    if start_time:
        sec_q = sec_q.filter(AuditLog.timestamp >= start_time)
    if end_time:
        sec_q = sec_q.filter(AuditLog.timestamp <= end_time)
    security_events = sec_q.scalar() or 0

    prev_security_events = 0
    if prev_start and start_time:
        prev_security_events = (
            db.query(func.count(AuditLog.id))
            .filter(
                AuditLog.timestamp >= prev_start,
                AuditLog.timestamp < start_time,
                or_(
                    AuditLog.stage.ilike("%Authentication%"),
                    AuditLog.action.ilike("%Session%"),
                    AuditLog.action.ilike("%MFA%"),
                    AuditLog.action.ilike("%Login%"),
                    AuditLog.action.ilike("%Logout%"),
                    AuditLog.action.ilike("%Lock%")
                )
            )
            .scalar() or 0
        )

    # 4. Administrative Changes
    admin_q = db.query(func.count(AuditLog.id)).filter(
        or_(
            AuditLog.action.ilike("%Config%"),
            AuditLog.action.ilike("%Rule%"),
            AuditLog.action.ilike("%PERMISSION%"),
            AuditLog.action.ilike("%MORE_INFO%"),
            AuditLog.action.ilike("%Retention%"),
            AuditLog.action.ilike("%Prune%"),
            AuditLog.action.ilike("%Role%"),
            AuditLog.stage.ilike("%Policy Matrix%"),
            AuditLog.stage.ilike("%MoreInfoConfig%"),
            AuditLog.stage.ilike("%All Rules%"),
            AuditLog.stage.ilike("%Administration%")
        )
    )
    if start_time:
        admin_q = admin_q.filter(AuditLog.timestamp >= start_time)
    if end_time:
        admin_q = admin_q.filter(AuditLog.timestamp <= end_time)
    admin_changes = admin_q.scalar() or 0

    prev_admin_changes = 0
    if prev_start and start_time:
        prev_admin_changes = (
            db.query(func.count(AuditLog.id))
            .filter(
                AuditLog.timestamp >= prev_start,
                AuditLog.timestamp < start_time,
                or_(
                    AuditLog.action.ilike("%Config%"),
                    AuditLog.action.ilike("%Rule%"),
                    AuditLog.action.ilike("%PERMISSION%"),
                    AuditLog.action.ilike("%MORE_INFO%"),
                    AuditLog.action.ilike("%Retention%"),
                    AuditLog.action.ilike("%Prune%"),
                    AuditLog.action.ilike("%Role%"),
                    AuditLog.stage.ilike("%Policy Matrix%"),
                    AuditLog.stage.ilike("%MoreInfoConfig%"),
                    AuditLog.stage.ilike("%All Rules%"),
                    AuditLog.stage.ilike("%Administration%")
                )
            )
            .scalar() or 0
        )

    def calc_delta(curr: int, prev: int) -> Optional[float]:
        if prev > 0:
            return round(((curr - prev) / prev) * 100, 1)
        if curr > 0:
            return 100.0
        return 0.0

    return {
        "date_preset": date_preset,
        "start_time": start_time.isoformat() + "Z" if start_time else None,
        "end_time": end_time.isoformat() + "Z" if end_time else None,
        "total_events": {
            "count": total_events,
            "prev_count": prev_total_events,
            "delta_pct": calc_delta(total_events, prev_total_events) if prev_start else None
        },
        "failed_logins": {
            "count": failed_logins,
            "prev_count": prev_failed_logins,
            "delta_pct": calc_delta(failed_logins, prev_failed_logins) if prev_start else None
        },
        "security_events": {
            "count": security_events,
            "prev_count": prev_security_events,
            "delta_pct": calc_delta(security_events, prev_security_events) if prev_start else None
        },
        "admin_changes": {
            "count": admin_changes,
            "prev_count": prev_admin_changes,
            "delta_pct": calc_delta(admin_changes, prev_admin_changes) if prev_start else None
        }
    }


# -------------------------------------------------------------
# FILTER OPTIONS DROPDOWNS ENDPOINT
# -------------------------------------------------------------

@router.get("/admin/audit-logs/filters")
def get_audit_filter_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Returns available distinct users, actions, stages for filter selectors."""
    _require_audit_admin(current_user, db)

    users = [
        u[0] for u in db.query(AuditLog.user)
        .distinct()
        .filter(AuditLog.user.isnot(None))
        .order_by(AuditLog.user.asc())
        .all()
        if u[0]
    ]

    actions = [
        a[0] for a in db.query(AuditLog.action)
        .distinct()
        .filter(AuditLog.action.isnot(None))
        .order_by(AuditLog.action.asc())
        .all()
        if a[0]
    ]

    stages = [
        s[0] for s in db.query(AuditLog.stage)
        .distinct()
        .filter(AuditLog.stage.isnot(None))
        .order_by(AuditLog.stage.asc())
        .all()
        if s[0]
    ]

    return {
        "users": users,
        "actions": actions,
        "stages": stages,
        "outcomes": ["Success", "Failed", "Warning", "Info"],
        "categories": [
            {"id": "ALL", "label": "All Events"},
            {"id": "DATA_SYNC", "label": "Data Syncs"},
            {"id": "APPROVAL", "label": "Approvals"},
            {"id": "SECURITY", "label": "Security & Sessions"},
            {"id": "CONFIG", "label": "Configuration Changes"}
        ]
    }


# -------------------------------------------------------------
# PAGINATED & FILTERED AUDIT LOGS ENDPOINT
# -------------------------------------------------------------

@router.get("/admin/audit-logs/query", response_model=PaginatedAuditLogsResponse)
@router.get("/admin/audit-logs/paginated", response_model=PaginatedAuditLogsResponse)
def get_paginated_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=5, le=200),
    category: Optional[str] = Query("ALL"),
    date_preset: Optional[str] = Query("7d"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    user: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    invoice_id: Optional[str] = Query(None),
    sort_by: str = Query("timestamp"),
    sort_dir: str = Query("desc"),
    include_expired: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    _require_audit_admin(current_user, db)

    start_time, end_time, _ = parse_date_window(date_preset, start_date, end_date)
    retention_days = get_audit_retention_days()

    query = db.query(AuditLog)

    if retention_days > 0 and not include_expired:
        retention_cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
        if start_time is None or start_time < retention_cutoff:
            start_time = retention_cutoff

    query = apply_audit_filters(
        query=query,
        category=category,
        start_time=start_time,
        end_time=end_time,
        user_filter=user,
        action_filter=action,
        stage_filter=stage,
        outcome_filter=outcome,
        search=search,
        invoice_id=invoice_id
    )

    total_count = query.count()

    # Sorting
    sort_by_str = sort_by if isinstance(sort_by, str) else "timestamp"
    sort_dir_str = sort_dir if isinstance(sort_dir, str) else "desc"
    sort_col = getattr(AuditLog, sort_by_str, AuditLog.timestamp)
    if sort_dir_str.lower() == "asc":
        query = query.order_by(asc(sort_col), asc(AuditLog.id))
    else:
        query = query.order_by(desc(sort_col), desc(AuditLog.id))

    offset = (page - 1) * page_size
    records = query.offset(offset).limit(page_size).all()

    # Decorate records with computed category and outcome
    items = []
    for r in records:
        cat, out = classify_audit_log(r.action, r.stage)
        item = AuditLogResponse(
            id=r.id,
            invoice_id=r.invoice_id,
            document_id=r.invoice_id,
            user=r.user,
            action=r.action,
            stage=r.stage,
            notes=r.notes,
            details=r.notes,
            ip_address=r.ip_address,
            timestamp=r.timestamp,
            approver_user_id=r.approver_user_id,
            stage_id=r.stage_id,
            previous_status=r.previous_status,
            new_status=r.new_status,
            remarks=r.remarks,
            outcome=out,
            category=cat
        )
        items.append(item)

    total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1

    return {
        "items": items,
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages
    }


# -------------------------------------------------------------
# CSV EXPORT ENDPOINT (Formula injection safe)
# -------------------------------------------------------------

@router.get("/admin/audit-logs/export")
def export_audit_logs_csv(
    req: Request,
    category: Optional[str] = Query("ALL"),
    date_preset: Optional[str] = Query("7d"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    user: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    outcome: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    invoice_id: Optional[str] = Query(None),
    include_expired: bool = Query(False),
    limit: int = Query(5000, le=20000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Exports filtered audit logs into a CSV stream with formula injection sanitization.
    """
    _require_audit_admin(current_user, db)

    start_time, end_time, _ = parse_date_window(date_preset, start_date, end_date)
    retention_days = get_audit_retention_days()

    query = db.query(AuditLog)

    if retention_days > 0 and not include_expired:
        retention_cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
        if start_time is None or start_time < retention_cutoff:
            start_time = retention_cutoff

    query = apply_audit_filters(
        query=query,
        category=category,
        start_time=start_time,
        end_time=end_time,
        user_filter=user,
        action_filter=action,
        stage_filter=stage,
        outcome_filter=outcome,
        search=search,
        invoice_id=invoice_id
    )

    limit_val = limit if isinstance(limit, int) else 5000
    query = query.order_by(desc(AuditLog.timestamp), desc(AuditLog.id))
    records = query.limit(limit_val).all()

    # Log export event in audit trail
    try:
        client_ip = extract_client_ip(req)
        actor_name = current_user.employee_name or current_user.name or current_user.username
        search_str = _clean_str(search)
        preset_str = _clean_str(date_preset) or "7d"
        cat_str = _clean_str(category) or "ALL"
        filter_summary = f"preset={preset_str}, cat={cat_str}, search={search_str or 'none'}, count={len(records)}"
        db.add(AuditLog(
            invoice_id=None,
            user=actor_name,
            action="Audit Logs Exported",
            stage="Administration",
            notes=f"Exported {len(records)} audit logs to CSV ({filter_summary}). IP: {client_ip}",
            ip_address=client_ip,
            timestamp=datetime.datetime.utcnow()
        ))
        db.commit()
    except Exception as exc:
        logger.debug("Failed to record export audit log: %s", exc)

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Headers
    writer.writerow([
        "Event ID",
        "Timestamp (UTC)",
        "Timestamp (Asia/Kolkata)",
        "User / Agent",
        "Action",
        "Stage",
        "Category",
        "Outcome",
        "IP Address",
        "Document ID",
        "Details / Notes",
        "Previous Status",
        "New Status",
        "Remarks"
    ])

    for r in records:
        cat, out = classify_audit_log(r.action, r.stage)
        # Format UTC and Local IST (+5:30)
        utc_ts = r.timestamp.strftime("%Y-%m-%d %H:%M:%S UTC") if r.timestamp else ""
        ist_dt = r.timestamp + datetime.timedelta(hours=5, minutes=30) if r.timestamp else None
        ist_ts = ist_dt.strftime("%d-%b-%Y %I:%M:%S %p IST") if ist_dt else ""

        writer.writerow([
            sanitize_csv_cell(r.id),
            sanitize_csv_cell(utc_ts),
            sanitize_csv_cell(ist_ts),
            sanitize_csv_cell(r.user),
            sanitize_csv_cell(r.action),
            sanitize_csv_cell(r.stage or "—"),
            sanitize_csv_cell(cat),
            sanitize_csv_cell(out),
            sanitize_csv_cell(r.ip_address or "—"),
            sanitize_csv_cell(r.invoice_id or "—"),
            sanitize_csv_cell(r.notes or ""),
            sanitize_csv_cell(r.previous_status or ""),
            sanitize_csv_cell(r.new_status or ""),
            sanitize_csv_cell(r.remarks or "")
        ])

    output.seek(0)
    filename = f"daas_audit_logs_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# -------------------------------------------------------------
# BACKWARD COMPATIBLE AUDIT LOGS ENDPOINTS
# -------------------------------------------------------------

@router.get("/audit-logs", response_model=List[AuditLogResponse])
@router.get("/admin/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    invoice_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    date_preset: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    include_expired: bool = Query(False),
    limit: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Standard backward-compatible endpoint returning a flat list of audit logs.
    """
    days = get_audit_retention_days()
    query = db.query(AuditLog)

    start_time, end_time, _ = parse_date_window(date_preset) if date_preset else (None, datetime.datetime.utcnow(), None)

    if days > 0 and not include_expired:
        retention_cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
        if start_time is None or start_time < retention_cutoff:
            start_time = retention_cutoff

    query = apply_audit_filters(
        query=query,
        category=category,
        start_time=start_time,
        end_time=end_time,
        search=search,
        invoice_id=invoice_id
    )

    query = query.order_by(desc(AuditLog.timestamp), desc(AuditLog.id))
    if limit:
        query = query.limit(limit)

    records = query.all()

    items = []
    for r in records:
        cat, out = classify_audit_log(r.action, r.stage)
        item = AuditLogResponse(
            id=r.id,
            invoice_id=r.invoice_id,
            document_id=r.invoice_id,
            user=r.user,
            action=r.action,
            stage=r.stage,
            notes=r.notes,
            details=r.notes,
            ip_address=r.ip_address,
            timestamp=r.timestamp,
            approver_user_id=r.approver_user_id,
            stage_id=r.stage_id,
            previous_status=r.previous_status,
            new_status=r.new_status,
            remarks=r.remarks,
            outcome=out,
            category=cat
        )
        items.append(item)
    return items


@router.get("/system-logs")
def get_system_logs(
    invoice_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    _require_audit_admin(current_user, db)
    query = db.query(SystemLog)
    if invoice_id:
        query = query.filter(SystemLog.invoice_id == invoice_id)
    logs = query.order_by(SystemLog.timestamp.desc()).all()
    return logs
