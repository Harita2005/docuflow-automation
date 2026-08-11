from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuditLog, SystemLog
from app.schemas import AuditLogResponse

router = APIRouter(prefix="/api", tags=["Audit Logs"])

@router.get("/audit-logs", response_model=List[AuditLogResponse])
def get_audit_logs(
    invoice_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    if invoice_id:
        query = query.filter(AuditLog.invoice_id == invoice_id)
    logs = query.order_by(AuditLog.timestamp.desc()).all()
    return logs

@router.get("/system-logs")
def get_system_logs(
    invoice_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(SystemLog)
    if invoice_id:
        query = query.filter(SystemLog.invoice_id == invoice_id)
    logs = query.order_by(SystemLog.timestamp.desc()).all()
    return logs
