import logging
import datetime
from typing import Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.database.models import Invoice, WorkflowStepDefinition, AuditLog, User
from app.services.file_security import get_safe_file_path

logger = logging.getLogger(__name__)

def is_physical_attachment_present(inv: Invoice) -> bool:
    """Checks if a valid non-empty physical document file exists on disk."""
    if not inv:
        return False
    target_ref = getattr(inv, 'file_path', None) or inv.file_url
    if not target_ref or not str(target_ref).strip():
        return False
    try:
        disk_path = get_safe_file_path(str(target_ref))
        return disk_path.exists() and disk_path.is_file() and disk_path.stat().st_size > 0
    except Exception as exc:
        logger.debug("Error checking physical file on disk: %s", exc)
        return False

def can_stage_escalate(inv: Invoice, db: Session) -> Tuple[bool, str]:
    """
    Evaluates whether an invoice at its current workflow stage can be escalated.
    Rule:
    If the document is in Attachment Status (Stage 1 or attachment stage)
    and NO physical document has been uploaded yet, escalation MUST NOT work for that stage.
    """
    if not inv:
        return False, "Document not found."

    if inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']:
        return False, f"Document is in a completed state ('{inv.status}') and cannot be escalated."

    cur_stage_num = inv.current_stage or 1
    is_stage_1 = cur_stage_num == 1

    current_step_name = 'Attachment Status' if is_stage_1 else f'Stage {cur_stage_num}'
    if inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.stage_number == cur_stage_num
        ).first()
        if step and step.step_name:
            current_step_name = step.step_name

    is_attachment_stage = is_stage_1 or 'attachment' in current_step_name.lower() or 'attachment' in (inv.status or '').lower()

    if is_attachment_stage:
        has_file = is_physical_attachment_present(inv)
        if not has_file:
            return False, (
                "Escalation Suppressed: Physical document PDF has not yet been uploaded for the "
                "Attachment Status stage. Escalation is suspended until the physical file is uploaded."
            )

    return True, f"Stage {cur_stage_num} ({current_step_name}) is eligible for escalation."

def escalate_invoice_stage(inv: Invoice, db: Session, user_name: str = "System Escalation", reason: str = "SLA Threshold Exceeded") -> dict:
    """
    Executes escalation for an invoice if permitted by policy.
    Blocks escalation if the attachment is missing in the Attachment Status stage.
    """
    can_escalate, message = can_stage_escalate(inv, db)
    if not can_escalate:
        raise HTTPException(status_code=400, detail=message)

    cur_stage_num = inv.current_stage or 1
    total_stages = inv.total_stages or 1
    prev_approver = inv.assigned_approver

    escalated_approver = None
    if cur_stage_num < total_stages:
        next_step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.stage_number == cur_stage_num + 1
        ).first()
        if next_step and next_step.approver_target:
            escalated_approver = next_step.approver_target

    if not escalated_approver:
        admin_user = db.query(User).filter(User.role == 'admin', User.is_active == True).first()
        escalated_approver = admin_user.username if admin_user else 'admin'

    inv.assigned_approver = escalated_approver
    inv.status = f"Escalated (Stage {cur_stage_num})"
    inv.updated_at = datetime.datetime.utcnow()

    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=user_name,
        action=f"Escalated Stage {cur_stage_num}",
        stage=f"Stage {cur_stage_num}",
        notes=f"Escalation executed. Assigned from '{prev_approver}' to '{escalated_approver}'. Reason: {reason}"
    ))
    db.commit()
    db.refresh(inv)

    return {
        "success": True,
        "status": inv.status,
        "assigned_approver": inv.assigned_approver,
        "message": f"Document '{inv.id}' successfully escalated to '{escalated_approver}'."
    }
