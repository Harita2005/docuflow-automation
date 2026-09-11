import datetime
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import AuditLog, SystemLog
from app.routers.documents import load_app_configs, save_app_config
from app.schemas import AuditLogResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Audit Logs"])


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
    return getattr(settings, "AUDIT_LOG_RETENTION_DAYS", 7)


def prune_expired_audit_logs(db: Session, retention_days: Optional[int] = None) -> int:
    """Delete audit logs older than retention_days (if retention_days > 0)."""
    if retention_days is None:
        retention_days = get_audit_retention_days()
    if retention_days <= 0:
        return 0  # 0 or negative means infinite retention / keep all

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


@router.get("/admin/audit-logs/retention")
def get_retention_status(db: Session = Depends(get_db)):
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
    payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)
):
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

    return {
        "success": True,
        "retention_days": days,
        "deleted_count": deleted_count,
        "message": f"Audit log retention set to {days} days."
        if days > 0
        else "Audit log retention set to indefinite (all logs preserved).",
    }


@router.post("/admin/audit-logs/cleanup")
def manual_cleanup_logs(db: Session = Depends(get_db)):
    days = get_audit_retention_days()
    deleted = prune_expired_audit_logs(db, days)
    remaining = db.query(func.count(AuditLog.id)).scalar() or 0
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


@router.get("/audit-logs", response_model=List[AuditLogResponse])
@router.get("/admin/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    invoice_id: Optional[str] = Query(None),
    include_expired: bool = Query(False),
    db: Session = Depends(get_db),
):
    days = get_audit_retention_days()
    query = db.query(AuditLog)
    if invoice_id:
        query = query.filter(AuditLog.invoice_id == invoice_id)
    if days > 0 and not include_expired:
        cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
        query = query.filter(AuditLog.timestamp >= cutoff)
    logs = query.order_by(AuditLog.timestamp.desc()).all()
    return logs


@router.get("/system-logs")
def get_system_logs(
    invoice_id: Optional[str] = Query(None), db: Session = Depends(get_db)
):
    query = db.query(SystemLog)
    if invoice_id:
        query = query.filter(SystemLog.invoice_id == invoice_id)
    logs = query.order_by(SystemLog.timestamp.desc()).all()
    return logs