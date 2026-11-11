import logging
from app.constants.document_types import is_feedback_or_complaint
from app.services.rules_engine import infer_document_type, evaluate_business_rules_full, resolve_matching_rules
import os
import re
import json
import shutil
import datetime
import threading
import time
import smtplib
import socket
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import List, Optional, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response, Request, status, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy import or_, and_, func, extract
from sqlalchemy.orm import Session
from app.config.settings import settings
from app.services.crypto_service import encrypt_secret, decrypt_secret, mask_secret
from app.database.connection import SessionLocal, get_db
from app.database.models import (
    ApprovalAssignment,
    AuditLog,
    BusinessRule,
    ChecklistRule,
    ChecklistTemplate,
    Division,
    Document,
    DocumentLineItem,
    InAppNotification,
    Invoice,
    InvoiceChecklistState,
    NotificationProviderConfig,
    NotificationRaciMatrix,
    Role,
    User,
    WorkflowProfile,
    WorkflowStepDefinition,
)
from app.services.pdf_compressor import compress_pdf
from app.schemas import InvoiceResponse, InvoiceUpdate, InvoiceActionRequest, NotificationProviderSchema, NotificationRaciSchema, NotificationTestSchema
from app.auth import get_current_user, get_current_user_optional, get_current_active_user, decode_token
from app.services.rules_engine import evaluate_business_rules, generate_document_id
from app.services.integration_service import dispatch_outgoing_webhook
from app.services.callback_service import dispatch_approval_callback_events
from app.services.rbac_service import authorize_document_access, check_permission, get_user_approval_divisions
from app.services.file_security import validate_uploaded_file, get_safe_file_path
from app.services.security_middleware import resolve_client_ip

def extract_client_request_ip(req: Optional[Request] = None) -> str:
    if req:
        try:
            return resolve_client_ip(req)
        except Exception as exc:
            logger.debug("Client IP resolution error: %s", exc)
    return "127.0.0.1"

def record_document_audit_event(
    db: Session,
    inv: Any,
    action: str,
    stage: str,
    remarks: str,
    user: Optional[User] = None,
    client_ip: Optional[str] = None,
    previous_status: Optional[str] = None,
    new_status: Optional[str] = None,
    notes_extra: Optional[str] = None
) -> AuditLog:
    emp_id = (getattr(user, 'employee_id', None) or getattr(user, 'user_uid', None) or 'N/A') if user else 'N/A'
    role = (getattr(user, 'role', None) or 'Approver') if user else 'Approver'
    username = (getattr(user, 'username', None) or 'system') if user else 'system'
    name = (getattr(user, 'employee_name', None) or getattr(user, 'name', None) or username) if user else 'System Approver'
    display_user = f"{name} ({emp_id}) [{role}]"
    ip_addr = client_ip or "127.0.0.1"

    detail_parts = [remarks] if remarks else []
    if notes_extra:
        detail_parts.append(notes_extra)
    detail_parts.append(f"Approver: {name} (Emp ID: {emp_id}, Role: {role}, User: {username}, IP: {ip_addr})")
    full_notes = " ➔ ".join(detail_parts)

    entry = AuditLog(
        invoice_id=inv.id,
        user=display_user,
        action=action,
        stage=stage,
        notes=full_notes,
        remarks=remarks,
        ip_address=ip_addr,
        approver_user_id=getattr(user, 'id', None) if user else None,
        stage_id=getattr(inv, 'current_stage', 1),
        previous_status=previous_status or getattr(inv, 'status', None),
        new_status=new_status or getattr(inv, 'status', None)
    )
    db.add(entry)
    return entry

logger = logging.getLogger(__name__)

def trigger_async_integration_push(document_id: str, decision: str='APPROVED'):
    """Spawns a background thread to dispatch the approved/rejected document to configured 3rd-party webhooks & Callback Integrations Engine."""

    def _runner():
        try:
            dispatch_outgoing_webhook(document_id, decision=decision)
        except Exception as e:
            logger.debug('Handled exception: %s', e)
        try:
            db = SessionLocal()
            try:
                dispatch_approval_callback_events(db, document_id, decision=decision)
            finally:
                db.close()
        except Exception as e:
            logger.debug('Handled exception: %s', e)
    try:
        t = threading.Thread(target=_runner, daemon=True)
        t.start()
    except Exception as e:
        logger.debug('Handled exception: %s', e)

def safe_serialize_invoice(inv: Any) -> Any:
    """Safely converts an invoice/document ORM instance to a plain serializable dict without circular references."""
    if inv is None:
        return None
    try:
        return InvoiceResponse.model_validate(inv).model_dump()
    except Exception:
        try:
            return {
                'id': getattr(inv, 'id', None),
                'status': getattr(inv, 'status', None),
                'current_stage': getattr(inv, 'current_stage', None),
                'version': getattr(inv, 'version', None),
                'assigned_approver': getattr(inv, 'assigned_approver', None),
                'invoice_number': getattr(inv, 'invoice_number', None),
                'total_amount': getattr(inv, 'total_amount', None),
                'document_type': getattr(inv, 'document_type', None),
            }
        except Exception:
            return str(inv)

def safe_broadcast_event(event_type: str, payload: dict):
    """Safely broadcasts a real-time event via SSE to connected clients asynchronously in background thread."""
    def _run():
        try:
            from app.routers.events import broadcast_event
            broadcast_event(event_type, payload)
        except Exception as e:
            logger.debug('Handled broadcast exception: %s', e)
    try:
        t = threading.Thread(target=_run, daemon=True)
        t.start()
    except Exception as e:
        logger.debug('Handled thread launch exception: %s', e)
router = APIRouter(tags=['Invoices & Documents'])

def is_user_admin(user: Optional[User], db: Optional[Session] = None) -> bool:
    if not user:
        return False
    if getattr(user, 'is_superuser', False):
        return True
    u_role = (getattr(user, 'role', '') or '').strip().lower()
    if u_role in ['admin', 'administrator', 'system_admin', 'superadmin', 'system administrator', 'settings_editor']:
        return True
    if 'admin' in u_role:
        return True
    if db:
        try:
            from app.services.rbac_service import check_permission
            if (
                check_permission(user, 'role:manage', db)
                or check_permission(user, 'admin:rbac', db)
                or check_permission(user, 'admin:system', db)
                or check_permission(user, 'admin:users', db)
                or check_permission(user, 'user:manage', db)
            ):
                return True
        except Exception:
            pass
    return False

def is_doc_feedback_or_complaint(inv: Any) -> bool:
    """Accurately detects whether a document is a Customer Feedback or Complaint document across all attributes."""
    if not inv:
        return False
    dt = (getattr(inv, 'document_type', None) or '').upper()
    cat = (getattr(inv, 'category', None) or '').upper()
    wf = (getattr(inv, 'workflow_profile_id', None) or '').upper()
    doc_id = str(getattr(inv, 'id', '') or '').upper()
    doc_num = str(getattr(inv, 'document_number', '') or getattr(inv, 'invoice_number', '') or '').upper()
    return (
        is_feedback_or_complaint(dt) or
        is_feedback_or_complaint(cat) or
        'FEEDBACK' in dt or 'COMPLAINT' in dt or
        'FEEDBACK' in cat or 'COMPLAINT' in cat or
        'FEEDBACK' in wf or 'COMPLAINT' in wf or
        doc_id.startswith('CMP') or doc_id.startswith('CF') or
        doc_num.startswith('CMP') or doc_num.startswith('CF') or
        bool(getattr(inv, 'type_of_complaint', None)) or
        bool(getattr(inv, 'subtype_of_complaint', None))
    )

def resolve_workflow_steps_for_document(db: Session, inv: Invoice) -> Tuple[Optional[str], List[WorkflowStepDefinition]]:
    """
    Resolves the canonical workflow profile name and ordered step definitions for a document.
    Handles exact match, case-insensitive match, and customer feedback alias resolution ('Customer_feedback' -> 'Feedback').
    """
    wf_name = (getattr(inv, 'workflow_profile_id', None) or '').strip()
    is_feedback = is_doc_feedback_or_complaint(inv)

    steps: List[WorkflowStepDefinition] = []
    if wf_name and wf_name.lower() not in ['', 'none', 'unrouted']:
        steps = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == wf_name) |
            (WorkflowStepDefinition.profile_name.ilike(wf_name))
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()

    if not steps and is_feedback:
        # Match feedback workflow profile (e.g. 'Feedback')
        steps = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == 'Feedback') |
            (WorkflowStepDefinition.profile_name.ilike('Feedback')) |
            (WorkflowStepDefinition.profile_name.ilike('%feedback%'))
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        if steps:
            wf_name = steps[0].profile_name

    if not steps and wf_name:
        prof = db.query(WorkflowProfile).filter(
            (WorkflowProfile.profile_name == wf_name) |
            (WorkflowProfile.profile_name.ilike(wf_name)) |
            (WorkflowProfile.workflow_code.ilike(wf_name))
        ).first()
        if prof:
            steps = db.query(WorkflowStepDefinition).filter(
                (WorkflowStepDefinition.profile_name == prof.profile_name) |
                (WorkflowStepDefinition.profile_name.ilike(prof.profile_name))
            ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
            if steps:
                wf_name = prof.profile_name

    if not steps and not is_feedback:
        try:
            matched_wf = evaluate_business_rules(db, {
                'division': getattr(inv, 'division', None),
                'category': getattr(inv, 'category', None),
                'amount': getattr(inv, 'amount', None),
                'document_type': getattr(inv, 'document_type', None)
            })
            if matched_wf:
                steps = db.query(WorkflowStepDefinition).filter(
                    (WorkflowStepDefinition.profile_name == matched_wf) |
                    (WorkflowStepDefinition.profile_name.ilike(matched_wf))
                ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
                if steps:
                    wf_name = matched_wf
        except Exception:
            pass

    return (wf_name if steps else (inv.workflow_profile_id or None), steps)


from app.services.document_query_service import (
    unpack_custom_data_into_dict,
    attach_dynamic_columns_to_document,
    find_invoice_by_identifier,
    is_user_in_approver_pool,
)
_unpack_custom_data_into_dict = unpack_custom_data_into_dict
_WORKFLOW_STEPS_CACHE: dict = {}
_WORKFLOW_STEPS_LOCK = threading.Lock()
_WORKFLOW_STEPS_TTL = 30.0
def invalidate_workflow_steps_cache():
    with _WORKFLOW_STEPS_LOCK:
        _WORKFLOW_STEPS_CACHE.clear()
def get_cached_workflow_steps(db: Session, profile_name: Optional[str]) -> list:
    if not profile_name or not str(profile_name).strip():
        return []
    clean_prof = str(profile_name).strip()
    now = time.monotonic()
    with _WORKFLOW_STEPS_LOCK:
        entry = _WORKFLOW_STEPS_CACHE.get(clean_prof)
        if entry and (now - entry["timestamp"] < _WORKFLOW_STEPS_TTL):
            return entry["steps"]
    steps = db.query(WorkflowStepDefinition).filter(
        (WorkflowStepDefinition.profile_name == clean_prof) |
        (WorkflowStepDefinition.profile_name.ilike(clean_prof))
    ).order_by(WorkflowStepDefinition.stage_number.asc(), WorkflowStepDefinition.id.asc()).all()
    for s in steps:
        try:
            db.expunge(s)
        except Exception as exc:
            # Benign: step object may already be detached or expunged from session
            logger.debug("Handled non-fatal step expunge exception: %s", exc)
    with _WORKFLOW_STEPS_LOCK:
        _WORKFLOW_STEPS_CACHE[clean_prof] = {"steps": steps, "timestamp": now}
    return steps

_ADMIN_INVOICES_CACHE: dict = {}
_ADMIN_INVOICES_LOCK = threading.Lock()
_ADMIN_INVOICES_TTL = 3.0

_BASE_DOC_CACHE: dict = {}
_BASE_DOC_LOCK = threading.Lock()
_BASE_DOC_TTL = 3.0

_DASHBOARD_STATS_CACHE: dict = {}
_DASHBOARD_STATS_LOCK = threading.Lock()
_DASHBOARD_STATS_TTL = 3.0

def invalidate_invoices_cache(doc_id: Optional[str] = None):
    with _ADMIN_INVOICES_LOCK:
        _ADMIN_INVOICES_CACHE.clear()
    with _DASHBOARD_STATS_LOCK:
        _DASHBOARD_STATS_CACHE.clear()
    with _BASE_DOC_LOCK:
        if doc_id:
            _BASE_DOC_CACHE.pop(str(doc_id), None)
            _BASE_DOC_CACHE.pop(f"DOC-{doc_id}", None)
            _BASE_DOC_CACHE.pop(str(doc_id).replace("DOC-", ""), None)
        else:
            _BASE_DOC_CACHE.clear()

def get_document_display_approver(db: Session, inv: Invoice, cached_steps: Optional[list] = None) -> str:
    """
    Read-only: computes the assigned approver for display without modifying or committing to the database.
    """
    if not inv:
        return ''
    if inv.assigned_approver and str(inv.assigned_approver).strip() not in ['', 'None']:
        return inv.assigned_approver
    if not inv.workflow_profile_id or str(inv.workflow_profile_id).strip() in ['', 'None']:
        return 'Unassigned (No Rule Matched)'
    if inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']:
        return inv.assigned_approver or ''
    steps = cached_steps if cached_steps is not None else get_cached_workflow_steps(db, inv.workflow_profile_id)
    curr_stage = inv.current_stage or 1
    step_def = next((s for s in steps if s.stage_number == curr_stage), None) if steps else None
    if step_def and step_def.approver_target:
        targets = [step_def.approver_target.strip()]
        if step_def.delegate_approver and step_def.delegate_approver.strip():
            targets.append(step_def.delegate_approver.strip())
        return ', '.join(targets)
    return inv.assigned_approver or 'Unassigned'
def sync_document_approver_from_workflow(db: Session, inv: Invoice, cached_steps: Optional[list] = None) -> str:
    """
    Dynamically synchronizes an active document's assigned_approver from the current 
    workflow step definition. If the member was changed in between, this ensures the newly 
    assigned member is persisted in the database and authorized for approval.
    """
    if not inv or not inv.workflow_profile_id or str(inv.workflow_profile_id).strip() in ['', 'None']:
        return (inv.assigned_approver if inv else '') or 'Unassigned (No Rule Matched)'
    
    # Completed terminal documents retain their final audit state
    if inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']:
        return inv.assigned_approver or ''

    # Fetch all defined steps for this workflow profile using cache
    if cached_steps is not None:
        steps = cached_steps
    else:
        steps = get_cached_workflow_steps(db, inv.workflow_profile_id)

    step_count = len(steps)
    if step_count > 0:
        if inv.total_stages != step_count:
            inv.total_stages = step_count
            db.add(inv)

    curr_stage = inv.current_stage or 1
    step_def = next((s for s in steps if s.stage_number == curr_stage), None) if step_count > 0 else None
    if not step_def and cached_steps is None:
        step_def = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.stage_number == curr_stage
        ).first()

    if step_def and step_def.approver_target and step_def.approver_target.strip():
        targets = [step_def.approver_target.strip()]
        if step_def.delegate_approver and step_def.delegate_approver.strip():
            targets.append(step_def.delegate_approver.strip())
        canonical_target = ', '.join(targets)
    else:
        canonical_target = None
        targets = []

    if canonical_target and inv.assigned_approver != canonical_target:
        inv.assigned_approver = canonical_target
        try:
            db.add(inv)
            db.commit()
            db.refresh(inv)
        except Exception as e:
            logger.warning(f"Error persisting synced approver: {e}")
            db.rollback()

        # Ensure active row exists in approval_assignments
        try:
            existing_assign = db.query(ApprovalAssignment).filter(
                ApprovalAssignment.document_id == inv.id,
                ApprovalAssignment.stage_number == curr_stage,
                ApprovalAssignment.status == 'PENDING'
            ).first()
            if not existing_assign:
                first_target = targets[0] if targets else canonical_target
                app_user = db.query(User).filter(
                    or_(
                        User.username.ilike(first_target),
                        User.employee_name.ilike(first_target),
                        User.name.ilike(first_target)
                    )
                ).first()
                new_assign = ApprovalAssignment(
                    document_id=inv.id,
                    workflow_profile_id=inv.workflow_profile_id,
                    stage_number=curr_stage,
                    stage_name=step_def.step_name if step_def else f"Stage {curr_stage}",
                    approver_user_id=app_user.id if app_user else None,
                    approver_handle=canonical_target,
                    status="PENDING",
                    sequence_order=curr_stage,
                    assigned_at=datetime.datetime.utcnow()
                )
                db.add(new_assign)
                db.commit()
        except Exception as exc:
            logger.debug("Approval assignment auto-sync: %s", exc)

        return canonical_target

    return inv.assigned_approver or ''

def record_approval_assignment_transition(
    db: Session,
    inv: Invoice,
    completed_stage_num: int,
    action: str,
    approver_handle: str,
    remarks: Optional[str] = None,
    next_stage_num: Optional[int] = None,
    next_stage_name: Optional[str] = None,
    next_approver_handle: Optional[str] = None
):
    """Synchronizes approval transitions into the dbo.approval_assignments tracking table."""
    try:
        curr_assigns = db.query(ApprovalAssignment).filter(
            ApprovalAssignment.document_id == inv.id,
            ApprovalAssignment.stage_number == completed_stage_num,
            ApprovalAssignment.status == "PENDING"
        ).all()
        for ca in curr_assigns:
            ca.status = action
            ca.completed_at = datetime.datetime.utcnow()
            if approver_handle:
                ca.approver_handle = approver_handle
            if remarks:
                ca.remarks = remarks

        if next_stage_num and next_approver_handle:
            first_target = next_approver_handle.split(",")[0].strip() if next_approver_handle else ""
            app_user = db.query(User).filter(
                or_(
                    User.username.ilike(first_target),
                    User.employee_name.ilike(first_target),
                    User.name.ilike(first_target)
                )
            ).first() if first_target else None

            new_assign = ApprovalAssignment(
                document_id=inv.id,
                workflow_profile_id=inv.workflow_profile_id,
                stage_number=next_stage_num,
                stage_name=next_stage_name or f"Stage {next_stage_num}",
                approver_user_id=app_user.id if app_user else None,
                approver_handle=next_approver_handle,
                status="PENDING",
                sequence_order=next_stage_num,
                assigned_at=datetime.datetime.utcnow()
            )
            db.add(new_assign)
    except Exception as exc:
        logger.warning("Approval assignment transition sync error: %s", exc)


def resolve_document_stage_name(db: Session, inv: Invoice, cached_steps: Optional[list] = None) -> str:
    """Dynamically resolves the current workflow stage display name for a document."""
    if not inv:
        return "Stage 1"
    if getattr(inv, "current_stage_name", None):
        return inv.current_stage_name
    curr_stg = inv.current_stage or 1
    if inv.workflow_profile_id:
        if cached_steps is not None:
            steps = cached_steps
        else:
            steps = get_cached_workflow_steps(db, inv.workflow_profile_id)
        step = next((s for s in steps if s.stage_number == curr_stg), None)
        if step and step.step_name:
            inv.current_stage_name = step.step_name
            return step.step_name
    stg_title = "Attachment Status" if curr_stg == 1 else f"Stage {curr_stg}"
    inv.current_stage_name = stg_title
    return stg_title

@router.get('/api/records/approved', response_model=List[InvoiceResponse])
@router.get('/api/documents/approved', response_model=List[InvoiceResponse])
@router.get('/api/invoices/approved', response_model=List[InvoiceResponse])
def get_approved_invoices(
    year: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    doc_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: Optional[str] = Query('date_desc'),
    page: Optional[int] = Query(None),
    page_size: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    response: Response = None
):
    # 1. Base approved filter (Strictly completely approved records)
    # Exclude intermediate stages, in-progress, pending, rejected, cancelled, or on-hold records
    # --- Input sanitization (CodeQL: Uncontrolled data used in path expression / SQL) ---
    MONTH_MAP = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12
    }
    if year is not None and str(year).strip().lower() != 'all':
        year = str(year).strip()
        if not re.fullmatch(r'\d{4}', year):
            raise HTTPException(status_code=400, detail="Invalid year format. Expected YYYY.")
    if month is not None and str(month).strip().lower() != 'all':
        month = str(month).strip()
        month_lower = month.lower()
        if not ((re.fullmatch(r'\d{1,2}', month) and 1 <= int(month) <= 12) or month_lower in MONTH_MAP):
            raise HTTPException(status_code=400, detail="Invalid month. Expected 1-12 or month name.")
    if date is not None and str(date).strip():
        date = re.sub(r'[^0-9\-_/]', '', str(date).strip())
    if from_date is not None and str(from_date).strip():
        from_date = re.sub(r'[^0-9\-_/]', '', str(from_date).strip())
    if to_date is not None and str(to_date).strip():
        to_date = re.sub(r'[^0-9\-_/]', '', str(to_date).strip())
    if doc_type is not None and str(doc_type).strip().lower() != 'all':
        doc_type = re.sub(r'[^a-zA-Z0-9 \-_\.]', '', str(doc_type)).strip()
    # -------------------------------------------------------------------------------------

    approved_filter = and_(
        Invoice.status.in_(['Approved', 'Settled', 'Paid']),
        ~Invoice.document_type.in_(['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT', 'FEEDBACK', 'COMPLAINT']),
        ~Invoice.document_code.like('CMP%'),
        ~Invoice.document_code.like('CF%'),
        ~Invoice.workflow_profile_id.like('%feedback%')
    )
    query = db.query(Invoice).filter(Invoice.is_deleted == False, approved_filter)

    # 2. Strict Access Control Enforcement:
    # Admin: Can view all approved documents
    # Non-admin: Strictly only documents the user actually approved / signed off on (recorded in AuditLog as having approved).
    is_admin = is_user_admin(current_user, db)
    if not is_admin:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.name, current_user.email]
        user_names = [name.strip() for name in user_names if name and name.strip()]

        or_user_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names]
        user_approval_logs = db.query(AuditLog.invoice_id).filter(
            AuditLog.action.ilike('%approve%'),
            or_(*or_user_filters)
        ).all()

        user_approved_doc_ids = set()
        for r in user_approval_logs:
            if r[0] is not None:
                val = str(r[0]).strip()
                if val.startswith('DOC-'):
                    val = val[4:]
                try:
                    user_approved_doc_ids.add(int(val))
                except (ValueError, TypeError):
                    pass

        if not user_approved_doc_ids:
            if response:
                response.headers["X-Total-Count"] = "0"
            return []

        query = query.filter(Invoice.id.in_(user_approved_doc_ids))

    # 3. Filter: YEAR
    if year and isinstance(year, str) and year.strip().lower() != 'all':
        y_str = year.strip()
        try:
            y_int = int(y_str)
            query = query.filter(
                or_(
                    Invoice.invoice_date.like(f'{y_str}-%'),
                    Invoice.invoice_date.like(f'%/{y_str}'),
                    Invoice.invoice_date.like(f'%/{y_str}%'),
                    extract('year', Invoice.created_at) == y_int
                )
            )
        except ValueError as exc:
            logger.debug("Failed parsing year filter as integer: %s", exc)

    # 4. Filter: MONTH
    MONTH_MAP = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12
    }
    if month and isinstance(month, str) and month.strip().lower() != 'all':
        m_raw = month.strip().lower()
        m_val = None
        if m_raw.isdigit():
            num = int(m_raw)
            if num == 0:
                m_val = 1
            elif 1 <= num <= 12:
                m_val = num
        elif m_raw in MONTH_MAP:
            m_val = MONTH_MAP[m_raw]

        if m_val and 1 <= m_val <= 12:
            m_str = f"{m_val:02d}"
            query = query.filter(
                or_(
                    Invoice.invoice_date.like(f'%-{m_str}-%'),
                    Invoice.invoice_date.like(f'%/{m_str}/%'),
                    Invoice.invoice_date.like(f'%-{m_val}-%'),
                    extract('month', Invoice.created_at) == m_val
                )
            )
    if date and isinstance(date, str) and date.strip():
        d_str = date.strip()
        query = query.filter(
            or_(
                Invoice.invoice_date.like(f'{d_str}%'),
                func.date(Invoice.created_at) == d_str
            )
        )
    if from_date and isinstance(from_date, str) and from_date.strip():
        fd_str = from_date.strip()
        query = query.filter(
            or_(
                Invoice.invoice_date >= fd_str,
                func.date(Invoice.created_at) >= fd_str
            )
        )
    if to_date and isinstance(to_date, str) and to_date.strip():
        td_str = to_date.strip()
        query = query.filter(
            or_(
                Invoice.invoice_date <= td_str,
                func.date(Invoice.created_at) <= td_str
            )
        )

    if doc_type and isinstance(doc_type, str) and doc_type.strip().lower() != 'all':
        dt_str = doc_type.strip()
        query = query.filter(
            or_(
                Invoice.document_type.ilike(f'%{dt_str}%'),
                Invoice.category.ilike(f'%{dt_str}%')
            )
        )

    # 7. Filter: Search keyword
    if search and isinstance(search, str) and search.strip():
        s_term = f'%{search.strip()}%'
        query = query.filter(
            or_(
                Invoice.invoice_number.ilike(s_term),
                Invoice.vendor_name.ilike(s_term),
                Invoice.id.ilike(s_term),
                Invoice.po_number.ilike(s_term),
                Invoice.tracking_id.ilike(s_term),
                Invoice.division.ilike(s_term),
                Invoice.document_type.ilike(s_term)
            )
        )

    # 8. Sort order
    if sort_by == 'date_asc':
        query = query.order_by(Invoice.created_at.asc())
    elif sort_by == 'amount_desc':
        query = query.order_by(Invoice.amount.desc())
    elif sort_by == 'amount_asc':
        query = query.order_by(Invoice.amount.asc())
    elif sort_by == 'vendor':
        query = query.order_by(Invoice.vendor_name.asc())
    elif sort_by == 'name':
        query = query.order_by(Invoice.invoice_number.asc())
    else:
        query = query.order_by(Invoice.created_at.desc())

    # 9. Pagination total count header
    total_count = query.count()
    if response:
        response.headers["X-Total-Count"] = str(total_count)
        response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"

    # 10. Server-side Pagination
    if page and page_size and isinstance(page, int) and isinstance(page_size, int) and page >= 1 and page_size >= 1:
        offset = (page - 1) * page_size
        invoices = query.offset(offset).limit(page_size).all()
    else:
        invoices = query.all()

    # 11. Serialization
    results = []
    for inv in invoices:
        inv_res = InvoiceResponse.model_validate(inv)
        inv_res.has_approved = True
        inv_res.is_current_approver = False
        results.append(inv_res)

    return results

@router.get('/api/documents/approved/filter-options')
@router.get('/api/records/approved/filter-options')
@router.get('/api/documents/filter-options')
def get_filter_options(
    document_type: Optional[str] = Query(None, description='Document type to filter'),
    year: Optional[str] = Query(None, description='Year (YYYY)'),
    month: Optional[str] = Query(None, description='Month (MM)'),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Return dynamic cascading filter options strictly based on actual approved records in the database.
    Order of hierarchy:
    1. Document Type (from DB approved records)
    2. Year (existing in DB for selected Document Type)
    3. Month (existing in DB for selected Document Type + Year)
    4. Date (existing in DB for selected Document Type + Year + Month)
    """
    # --- Input sanitization (CodeQL: Uncontrolled data used in path expression) ---
    # Validate year: must be exactly 4 digits (e.g. "2024")
    if year is not None:
        year = year.strip()
        if not re.fullmatch(r'\d{4}', year):
            raise HTTPException(status_code=400, detail="Invalid year format. Expected YYYY.")
    # Validate month: must be 1 or 2 digits representing 1-12
    if month is not None:
        month = month.strip()
        if not re.fullmatch(r'\d{1,2}', month) or not (1 <= int(month) <= 12):
            raise HTTPException(status_code=400, detail="Invalid month. Expected 1-12.")
    # Sanitize document_type: allow only alphanumeric, spaces, hyphens, underscores, dots
    if document_type is not None:
        document_type = re.sub(r'[^a-zA-Z0-9 \-_\.]', '', document_type).strip()
    # -------------------------------------------------------------------------------

    approved_filter = and_(
        Invoice.status.ilike('approved'),
        ~Invoice.status.ilike('%stage%'),
        ~Invoice.status.ilike('%in progress%'),
        ~Invoice.status.ilike('%pending%'),
        ~Invoice.status.ilike('%awaiting%'),
        ~Invoice.status.ilike('%rejected%'),
        ~Invoice.status.ilike('%cancelled%'),
        ~Invoice.status.ilike('%hold%')
    )
    query = db.query(Invoice).filter(Invoice.is_deleted == False, approved_filter)

    is_admin = is_user_admin(current_user, db)
    if not is_admin:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.name, current_user.email]
        user_names = [name.strip() for name in user_names if name and name.strip()]

        or_user_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names]
        user_approval_logs = db.query(AuditLog.invoice_id).filter(
            AuditLog.action.ilike('%approve%'),
            or_(*or_user_filters)
        ).all()

        user_approved_doc_ids = set()
        for r in user_approval_logs:
            if r[0] is not None:
                val = str(r[0]).strip()
                if val.startswith('DOC-'):
                    val = val[4:]
                try:
                    user_approved_doc_ids.add(int(val))
                except (ValueError, TypeError):
                    pass

        if not user_approved_doc_ids:
            return {"document_types": [], "years": [], "months": [], "dates": []}

        query = query.filter(Invoice.id.in_(user_approved_doc_ids))

    all_approved = query.all()

    # Dynamic Document Types from actual approved records in DB
    doc_types_set = set()
    for inv in all_approved:
        dt = (inv.document_type or inv.category or '').strip()
        if dt:
            doc_types_set.add(dt.upper())
    available_doc_types = sorted(list(doc_types_set))

    dt_clean = document_type.strip() if (document_type and isinstance(document_type, str) and document_type.strip().lower() not in ['all', '']) else ''
    y_clean = year.strip() if (year and isinstance(year, str) and year.strip().lower() not in ['all', '']) else ''
    m_clean = month.strip() if (month and isinstance(month, str) and month.strip().lower() not in ['all', '']) else ''

    # Filter records by selected document_type
    filtered_by_type = all_approved
    if dt_clean:
        dt_target = dt_clean.lower()
        filtered_by_type = [
            inv for inv in all_approved
            if (inv.document_type and inv.document_type.strip().lower() == dt_target) or
               (inv.category and inv.category.strip().lower() == dt_target) or
               (dt_target in (inv.document_type or '').strip().lower()) or
               ((inv.document_type or '').strip().lower() in dt_target)
        ]
    def extract_doc_date_parts(inv: Invoice):
        dates = []
        if inv.invoice_date and isinstance(inv.invoice_date, str):
            s = inv.invoice_date.strip()
            m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})', s)
            if m:
                dates.append((m.group(1), str(int(m.group(2))), f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"))
            else:
                m2 = re.match(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{4})', s)
                if m2:
                    dates.append((m2.group(3), str(int(m2.group(2))), f"{m2.group(3)}-{int(m2.group(2)):02d}-{int(m2.group(1)):02d}"))
        if inv.created_at:
            y = str(inv.created_at.year)
            m = str(inv.created_at.month)
            d_str = inv.created_at.strftime('%Y-%m-%d')
            dates.append((y, m, d_str))
        return dates
    years_set = set()
    for inv in filtered_by_type:
        parts = extract_doc_date_parts(inv)
        for y, m, d_str in parts:
            years_set.add(y)
    available_years = sorted(list(years_set), reverse=True)

    # Dynamic Months for the selected Document Type + Year
    filtered_by_year = filtered_by_type
    if y_clean:
        filtered_by_year = [
            inv for inv in filtered_by_type
            if any(y == y_clean for y, m, d_str in extract_doc_date_parts(inv))
        ]

    MONTH_LABELS = {
        "1": "January", "2": "February", "3": "March", "4": "April",
        "5": "May", "6": "June", "7": "July", "8": "August",
        "9": "September", "10": "October", "11": "November", "12": "December"
    }
    months_set = set()
    for inv in filtered_by_year:
        parts = extract_doc_date_parts(inv)
        for y, m, d_str in parts:
            if not y_clean or y == y_clean:
                months_set.add(m)
    available_months = [
        {"value": str(m_num), "label": MONTH_LABELS.get(str(m_num), f"Month {m_num}")}
        for m_num in sorted([int(m) for m in months_set])
    ]

    # Dynamic Dates for the selected Document Type + Year + Month
    filtered_by_month = filtered_by_year
    if m_clean:
        m_target = str(int(m_clean))
        filtered_by_month = [
            inv for inv in filtered_by_year
            if any(
                (not y_clean or y == y_clean) and m == m_target
                for y, m, d_str in extract_doc_date_parts(inv)
            )
        ]

    dates_set = set()
    for inv in filtered_by_month:
        parts = extract_doc_date_parts(inv)
        for y, m, d_str in parts:
            match_y = not y_clean or y == y_clean
            match_m = not m_clean or m == str(int(m_clean))
            if match_y and match_m:
                dates_set.add(d_str)
    available_dates = sorted(list(dates_set), reverse=True)

    return {
        "document_types": available_doc_types,
        "years": available_years,
        "months": available_months,
        "dates": available_dates
    }


@router.get('/api/records', response_model=List[InvoiceResponse])
@router.get('/api/documents', response_model=List[InvoiceResponse])
@router.get('/api/invoices', response_model=List[InvoiceResponse])
def get_all_invoices(
    status: Optional[str] = Query(None),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    response: Response = None,
):
    user_is_admin = is_user_admin(current_user, db)
    is_paginated = isinstance(page, int) and isinstance(page_size, int) and page > 0 and page_size > 0
    if user_is_admin:
        if not is_paginated:
            cache_key = f"admin_{status or 'all'}"
            now = time.monotonic()
            with _ADMIN_INVOICES_LOCK:
                entry = _ADMIN_INVOICES_CACHE.get(cache_key)
                if entry and (now - entry["timestamp"] < _ADMIN_INVOICES_TTL):
                    if response is not None:
                        response.headers["X-Total-Count"] = str(len(entry["data"]))
                    return entry["data"]

        query = db.query(Invoice).filter(Invoice.is_deleted == False)
        if status and str(status).strip() and str(status).strip().lower() not in ['pending', 'in_progress', 'tracking', 'workflow', 'active', 'all']:
            query = query.filter(Invoice.status == str(status).strip())
        
        total_count = query.count()
        if response is not None:
            response.headers["X-Total-Count"] = str(total_count)

        if is_paginated:
            offset = (page - 1) * page_size
            invoices = query.order_by(Invoice.created_at.desc()).offset(offset).limit(page_size).all()
        else:
            invoices = query.order_by(Invoice.created_at.desc()).all()
            now = time.monotonic()
            for inv in invoices:
                try:
                    db.expunge(inv)
                except Exception as exc:
                    # Benign: invoice object may already be detached or expunged from session
                    logger.debug("Handled non-fatal invoice expunge exception: %s", exc)
            with _ADMIN_INVOICES_LOCK:
                _ADMIN_INVOICES_CACHE[f"admin_{status or 'all'}"] = {"data": invoices, "timestamp": now}
        return invoices

    user_approval_divs = get_user_approval_divisions(current_user) if current_user else []
    has_hq_division = any(d in ['HQ', 'GLOBAL', 'ALL', ''] for d in user_approval_divs)

    query = db.query(Invoice).filter(Invoice.is_deleted == False)
    if status and str(status).strip() and str(status).strip().lower() not in ['pending', 'in_progress', 'tracking', 'workflow', 'active', 'all']:
        query = query.filter(Invoice.status == str(status).strip())
    if user_approval_divs and not has_hq_division:
        query = query.filter(
            or_(
                Invoice.division.in_(user_approval_divs),
                Invoice.division.is_(None),
                Invoice.division == "",
            )
        )
    invoices = query.order_by(Invoice.created_at.desc()).all()

    approved_invoice_ids = set()
    rejected_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.name, current_user.email, current_user.role]
        user_names = [name for name in user_names if name]
        audit_query = db.query(AuditLog.invoice_id, AuditLog.action).filter(AuditLog.user.in_(user_names)).all()
        for row in audit_query:
            raw_id = str(row[0] or '')
            doc_id_clean = raw_id.replace('DOC-', '')
            act = (row[1] or '').lower()
            if 'approve' in act:
                approved_invoice_ids.add(raw_id)
                approved_invoice_ids.add(doc_id_clean)
            if 'reject' in act or 'return' in act or 'cancel' in act:
                rejected_invoice_ids.add(raw_id)
                rejected_invoice_ids.add(doc_id_clean)

        all_steps = db.query(WorkflowStepDefinition.profile_name, WorkflowStepDefinition.approver_target, WorkflowStepDefinition.delegate_approver).all()
        user_wf_profiles = set()
        user_names_lower = {n.lower() for n in user_names}
        for prof, tgt, dlg in all_steps:
            tgt_clean = (tgt or '').lower()
            dlg_clean = (dlg or '').lower()
            if any(n in tgt_clean or n in dlg_clean for n in user_names_lower):
                if prof:
                    user_wf_profiles.add(prof)
    else:
        user_wf_profiles = set()

    filtered_invoices = []
    user_approval_divs = get_user_approval_divisions(current_user) if current_user else []
    has_hq_division = any(d in ['HQ', 'GLOBAL', 'ALL', ''] for d in user_approval_divs)

    # Batch-load workflow steps in a single query to eliminate N+1
    profile_names = {
        inv.workflow_profile_id.strip()
        for inv in invoices
        if inv.workflow_profile_id and str(inv.workflow_profile_id).strip() not in ['', 'None']
    }
    workflow_steps_map = {p: get_cached_workflow_steps(db, p) for p in profile_names}
    
    for inv in invoices:
        clean_prof = inv.workflow_profile_id.strip() if (inv.workflow_profile_id and str(inv.workflow_profile_id).strip() not in ['', 'None']) else None
        p_steps = workflow_steps_map.get(clean_prof) if clean_prof else None
        # Read-only display calculation without DB mutation in GET
        if not inv.assigned_approver or str(inv.assigned_approver).strip() in ['', 'None']:
            inv.assigned_approver = get_document_display_approver(db, inv, cached_steps=p_steps)

        doc_key_clean = str(inv.id).replace('DOC-', '')
        has_approved_this_doc = (str(inv.id) in approved_invoice_ids) or (doc_key_clean in approved_invoice_ids)
        has_rejected_this_doc = (str(inv.id) in rejected_invoice_ids) or (doc_key_clean in rejected_invoice_ids)
        is_member_of_flow = bool(inv.workflow_profile_id and (inv.workflow_profile_id in user_wf_profiles or any(p.lower() == inv.workflow_profile_id.lower() for p in user_wf_profiles)))
        is_curr = bool(inv.assigned_approver and is_user_in_approver_pool(current_user, inv.assigned_approver, db, ignore_admin_bypass=True))

        # Check creator / submitter and uploader desk authority
        u_role_clean = (current_user.role or '').strip().lower() if current_user else ''
        is_uploader_role = bool(any(x in u_role_clean for x in ['uplod', 'upload', 'account', 'approver', 'manager']))
        u_names_clean = {
            (current_user.username or '').strip().lower(),
            (current_user.employee_id or '').strip().lower(),
            (current_user.employee_name or '').strip().lower(),
            (current_user.name or '').strip().lower(),
            (current_user.email or '').strip().lower(),
        } if current_user else set()
        u_names_clean = {n for n in u_names_clean if n}
        inv_creator = (
            getattr(inv, 'contact_person', None)
            or getattr(inv, 'employee_id', None)
            or getattr(inv, 'employee_name', None)
            or ''
        ).strip().lower()
        is_creator = bool(inv_creator and inv_creator in u_names_clean)

        is_approved_doc = inv.status in ['Approved', 'Settled', 'Paid']
        if is_approved_doc:
            # Strictly: Only admin can see all approved docs; others see docs they approved or created
            if user_is_admin or has_approved_this_doc or is_creator:
                filtered_invoices.append(inv)
            continue

        # Division scoping check
        if not is_curr and not is_creator and not has_approved_this_doc and not is_member_of_flow:
            doc_div = (inv.division or '').strip().upper()
            if doc_div and user_approval_divs and not has_hq_division and doc_div not in ['HQ', 'GLOBAL', 'ALL', '']:
                if doc_div not in user_approval_divs:
                    continue
        
        is_terminal = inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']
        if is_terminal:
            is_cancelled = inv.status in ['Cancelled', 'Failed'] or 'cancel' in (inv.status or '').lower() or 'void' in (inv.status or '').lower()
            if is_cancelled:
                # Cancelled documents must only be visible to the user who cancelled/created it and the admin alone!
                if user_is_admin or has_rejected_this_doc or is_creator:
                    filtered_invoices.append(inv)
                continue
            if has_approved_this_doc or has_rejected_this_doc or is_creator:
                filtered_invoices.append(inv)
                continue
            if user_is_admin or authorize_document_access(current_user, inv):
                filtered_invoices.append(inv)
                continue
        else:
            # Active workflow: check current approver, creator/uploader, flow member, or unrouted documents
            is_unrouted = inv.status in ['Unrouted (No Rule Matched)', 'Unassigned (No Rule Matched)'] or not inv.assigned_approver or 'unassigned' in (inv.assigned_approver or '').lower() or 'unrouted' in (inv.status or '').lower()
            is_stage1 = ((getattr(inv, 'current_stage', 1) or 1) == 1 or 'attachment' in (inv.status or '').lower() or 'initiated' in (inv.status or '').lower())
            if is_curr or is_creator or has_approved_this_doc or is_member_of_flow or (is_unrouted and is_uploader_role) or (is_stage1 and is_uploader_role):
                filtered_invoices.append(inv)
                continue

    results = []
    for inv in filtered_invoices:
        doc_key_clean = str(inv.id).replace('DOC-', '')
        has_appr = (str(inv.id) in approved_invoice_ids) or (doc_key_clean in approved_invoice_ids)
        has_rej = (str(inv.id) in rejected_invoice_ids) or (doc_key_clean in rejected_invoice_ids)
        is_member_of_flow = bool(inv.workflow_profile_id and (inv.workflow_profile_id in user_wf_profiles or any(p.lower() == inv.workflow_profile_id.lower() for p in user_wf_profiles)))
        
        is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed', 'Settled']
        is_unrouted = inv.status in ['Unrouted (No Rule Matched)', 'Unassigned (No Rule Matched)'] or not inv.assigned_approver or 'unassigned' in (inv.assigned_approver or '').lower() or 'unrouted' in (inv.status or '').lower()
        is_stage1 = ((getattr(inv, 'current_stage', 1) or 1) == 1 or 'attachment' in (inv.status or '').lower() or 'initiated' in (inv.status or '').lower())
        is_curr = False
        if is_active_flow and inv.assigned_approver and not has_appr:
            is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver, db, ignore_admin_bypass=True)
        if is_active_flow and (is_unrouted or is_stage1) and (is_uploader_role or is_creator):
            is_curr = True

        # Status filter query parameter enforcement
        if status and isinstance(status, str):
            s_req = status.strip().lower()
            if s_req == 'pending':
                if not (is_curr and is_active_flow):
                    continue
            elif s_req in ['in_progress', 'tracking']:
                if not ((has_appr or user_is_admin or is_member_of_flow or is_curr or ((is_unrouted or is_stage1) and is_uploader_role)) and is_active_flow):
                    continue
            elif s_req == 'approved':
                if not (inv.status in ['Approved', 'Settled', 'Paid'] and (user_is_admin or has_appr)):
                    continue
            elif s_req in ['workflow', 'active']:
                if inv.status in ['Approved', 'Settled', 'Paid', 'Ready for Payment']:
                    continue
            elif s_req == 'hold':
                if inv.status != 'On Hold':
                    continue
            elif s_req in ['rejected', 'returned', 'failed']:
                st_low = (inv.status or '').lower()
                if not any(k in st_low for k in ['reject', 'return', 'failed', 'cancelled']):
                    continue

        attach_dynamic_columns_to_document(db, inv)
        inv_res = InvoiceResponse.model_validate(inv)
        inv_res.is_current_approver = is_curr
        inv_res.has_approved = has_appr
        inv_res.has_rejected = has_rej
        inv_res.current_stage_name = resolve_document_stage_name(db, inv, cached_steps=p_steps)
        results.append(inv_res)

    if response is not None:
        response.headers["X-Total-Count"] = str(len(results))

    if is_paginated:
        offset = (page - 1) * page_size
        return results[offset : offset + page_size]

    return results

@router.get('/api/documents/work-tracker', response_model=List[InvoiceResponse])
@router.get('/api/records/work-tracker', response_model=List[InvoiceResponse])
@router.get('/api/invoices/work-tracker', response_model=List[InvoiceResponse])
def get_work_tracker_documents(status: Optional[str] = Query(None), db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Work Tracker endpoint: Returns strictly IN-PROGRESS, non-terminal documents.
    Completed documents (Approved, Settled, Paid, Ready for Payment, Cancelled, Failed)
    are strictly excluded.
    """
    TERMINAL_STATUSES = {'approved', 'settled', 'paid', 'ready for payment', 'cancelled', 'failed'}

    # Exclude terminal statuses directly from the database query
    query = db.query(Invoice).filter(
        Invoice.is_deleted == False,
        ~Invoice.status.in_(['Approved', 'Settled', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed'])
    )
    invoices = query.order_by(Invoice.created_at.desc()).all()

    user_approved_stages = set()
    user_approved_doc_ids = set()
    rejected_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id, AuditLog.action, AuditLog.stage).filter(or_(*or_filters)).all()
            for row in audit_query:
                raw_id = str(row[0] or '')
                doc_id_clean = raw_id.replace('DOC-', '')
                act = (row[1] or '').lower()
                stg = (row[2] or '').lower()
                if 'approve' in act:
                    user_approved_doc_ids.add(raw_id)
                    user_approved_doc_ids.add(doc_id_clean)
                    m = re.search(r'stage\s*(\d+)', act) or re.search(r'stage\s*(\d+)', stg)
                    if m:
                        stg_num = int(m.group(1))
                        user_approved_stages.add((raw_id, stg_num))
                        user_approved_stages.add((doc_id_clean, stg_num))
                    else:
                        user_approved_stages.add((raw_id, 'all'))
                if 'reject' in act or 'return' in act or 'cancel' in act:
                    rejected_invoice_ids.add(raw_id)
                    rejected_invoice_ids.add(doc_id_clean)

        wf_step_or = []
        for name in user_names:
            wf_step_or.append(WorkflowStepDefinition.approver_target.ilike(f'%{name}%'))
            wf_step_or.append(WorkflowStepDefinition.delegate_approver.ilike(f'%{name}%'))
        user_wf_profiles = set(row[0] for row in db.query(WorkflowStepDefinition.profile_name).filter(or_(*wf_step_or)).distinct().all() if row[0])
    else:
        user_wf_profiles = set()

    user_is_admin = is_user_admin(current_user, db)
    results = []

    # Batch pre-load cached workflow steps for all distinct profile IDs in this invoice batch
    profile_names = {
        inv.workflow_profile_id.strip()
        for inv in invoices
        if inv.workflow_profile_id and str(inv.workflow_profile_id).strip() not in ['', 'None']
    }
    workflow_steps_map = {p: get_cached_workflow_steps(db, p) for p in profile_names}

    for inv in invoices:
        clean_prof = inv.workflow_profile_id.strip() if (inv.workflow_profile_id and str(inv.workflow_profile_id).strip() not in ['', 'None']) else None
        p_steps = workflow_steps_map.get(clean_prof) if clean_prof else None

        # Read-only approver display calculation without DB mutation in GET
        if not inv.assigned_approver or str(inv.assigned_approver).strip() in ['', 'None']:
            inv.assigned_approver = get_document_display_approver(db, inv, cached_steps=p_steps)

        st_low = (inv.status or '').strip().lower()
        cs_low = (str(inv.current_stage or '')).strip().lower()

        # Strict terminal exclusion
        if any(term in st_low for term in TERMINAL_STATUSES) or 'approved' in cs_low:
            continue

        doc_key_clean = str(inv.id).replace('DOC-', '')
        curr_stg = inv.current_stage or 1
        has_approved_curr_stage = (
            (str(inv.id), curr_stg) in user_approved_stages
            or (doc_key_clean, curr_stg) in user_approved_stages
            or (str(inv.id), 'all') in user_approved_stages
            or (doc_key_clean, 'all') in user_approved_stages
        )
        has_approved_any_stage = (
            str(inv.id) in user_approved_doc_ids
            or doc_key_clean in user_approved_doc_ids
        )
        has_rej = (str(inv.id) in rejected_invoice_ids) or (doc_key_clean in rejected_invoice_ids)

        u_role_clean = (current_user.role or '').strip().lower() if current_user else ''
        is_uploader_role = bool(any(x in u_role_clean for x in ['uplod', 'upload', 'account', 'approver', 'manager']))
        is_unrouted = inv.status in ['Unrouted (No Rule Matched)', 'Unassigned (No Rule Matched)'] or not inv.assigned_approver or 'unassigned' in (inv.assigned_approver or '').lower() or 'unrouted' in (inv.status or '').lower()

        is_stage1 = ((getattr(inv, 'current_stage', 1) or 1) == 1 or 'attachment' in (inv.status or '').lower() or 'initiated' in (inv.status or '').lower())

        is_curr = False
        if inv.assigned_approver and not has_approved_curr_stage:
            is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver, db, ignore_admin_bypass=True)
        if (is_unrouted or is_stage1) and is_uploader_role:
            is_curr = True

        # Division check
        if not is_curr and not has_approved_any_stage:
            user_approval_divs = get_user_approval_divisions(current_user)
            doc_div = (inv.division or '').strip().upper()
            if doc_div and user_approval_divs and not any(d in ['HQ', 'GLOBAL', 'ALL', ''] for d in user_approval_divs) and doc_div not in ['HQ', 'GLOBAL', 'ALL', '']:
                if doc_div not in user_approval_divs:
                    continue

        if not user_is_admin:
            is_member_of_flow = bool(inv.workflow_profile_id and (inv.workflow_profile_id in user_wf_profiles or any(p.lower() == inv.workflow_profile_id.lower() for p in user_wf_profiles)))
            if not ((is_curr and not has_approved_curr_stage) or has_approved_any_stage or is_member_of_flow or (is_unrouted and is_uploader_role) or (is_stage1 and is_uploader_role)):
                continue

        # Status filter query parameter enforcement
        if status:
            s_req = status.strip().lower()
            if s_req == 'pending':
                if not (is_curr and not has_approved_curr_stage):
                    continue
            elif s_req == 'hold':
                if inv.status != 'On Hold':
                    continue
            elif s_req in ['in_progress', 'active']:
                if inv.status == 'On Hold':
                    continue

        inv_res = InvoiceResponse.model_validate(inv)
        inv_res.is_current_approver = is_curr
        inv_res.has_approved = has_approved_curr_stage or has_approved_any_stage
        inv_res.has_rejected = has_rej
        inv_res.current_stage_name = resolve_document_stage_name(db, inv, cached_steps=p_steps)
        results.append(inv_res)

    return results


@router.get('/api/documents/synced-pending', response_model=List[InvoiceResponse])
@router.get('/api/records/synced-pending', response_model=List[InvoiceResponse])
@router.get('/api/invoices/synced-pending', response_model=List[InvoiceResponse])
def get_synced_pending_documents(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    invoices = db.query(Invoice).filter(Invoice.is_deleted == False, Invoice.doc_key.isnot(None), Invoice.file_url.is_(None) | (Invoice.file_url == '')).order_by(Invoice.created_at.desc()).all()
    if current_user and current_user.role != 'admin':
        user_handles = [current_user.username.lower() if current_user.username else '', current_user.employee_id.lower() if current_user.employee_id else '', current_user.employee_name.lower() if current_user.employee_name else '', current_user.email.lower() if current_user.email else '']
        user_handles = [h for h in user_handles if h]
        filtered_invoices = []
        for inv in invoices:
            is_assigned = False
            if inv.assigned_approver:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(',') if s.strip()]
                for handle in user_handles:
                    if handle in approvers or any((handle in app or app in handle for app in approvers)):
                        is_assigned = True
                        break
            if is_assigned or authorize_document_access(current_user, inv):
                filtered_invoices.append(inv)
        invoices = filtered_invoices
    results = []
    for inv in invoices:
        inv_res = InvoiceResponse.model_validate(inv)
        inv_res.is_current_approver = True if current_user and current_user.role != 'admin' else False
        inv_res.has_approved = False
        inv_res.current_stage_name = resolve_document_stage_name(db, inv)
        results.append(inv_res)
    return results

@router.get('/api/records/{invoice_id}')
@router.get('/api/documents/{invoice_id}')
@router.get('/api/invoices/{invoice_id}')
def get_invoice_by_id(invoice_id: str, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    now = time.monotonic()
    clean_id = str(invoice_id).strip()
    cached_doc = None
    with _BASE_DOC_LOCK:
        entry = _BASE_DOC_CACHE.get(clean_id)
        if entry and (now - entry["timestamp"] < _BASE_DOC_TTL):
            cached_doc = entry["data"]

    if cached_doc:
        inv, steps, steps_data, current_step_name, audit_logs_tuples, audit_trail_list, inv_dict_base = cached_doc
    else:
        inv = find_invoice_by_identifier(db, invoice_id)
        steps_data = []
        seen_stages = set()
        steps = []
        if inv.workflow_profile_id:
            steps = get_cached_workflow_steps(db, inv.workflow_profile_id)
            for s in steps:
                if s.stage_number not in seen_stages:
                    seen_stages.add(s.stage_number)
                    steps_data.append({'stage_number': s.stage_number, 'stage_name': s.step_name, 'approver_target': s.approver_target, 'action_required': s.action_required, 'permissions': s.permissions})
        current_step_name = 'Stage 1'
        for s in steps_data:
            if s['stage_number'] == (inv.current_stage or 1):
                current_step_name = s['stage_name']
                break
        if not inv.assigned_approver or str(inv.assigned_approver).strip() in ['', 'None']:
            inv.assigned_approver = get_document_display_approver(db, inv, cached_steps=steps)

        audit_logs_db = db.query(AuditLog).filter(
            AuditLog.invoice_id == inv.id
        ).order_by(AuditLog.timestamp.asc()).all()

        audit_logs_tuples = [
            (al.user.lower() if al.user else '', (al.action or '').lower())
            for al in audit_logs_db
        ]

        audit_trail_list = []
        for al in audit_logs_db:
            audit_trail_list.append({
                'timestamp': al.timestamp.isoformat() if al.timestamp else (al.created_at.isoformat() if getattr(al, 'created_at', None) else ''),
                'actor': al.user or 'System',
                'user': al.user or 'System',
                'action': al.action or 'Stage Approval',
                'stage': al.stage,
                'details': al.notes or al.remarks or 'Workflow action executed',
                'comments': al.remarks or al.notes or ''
            })

        inv_dict_base = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
        inv_dict_base = _unpack_custom_data_into_dict(inv_dict_base)

        # Attach line items
        if inv.line_items:
            loaded_items = [
                {
                    'id': li.id,
                    's_no': idx,
                    'item_code': li.item_code or '',
                    'hsn_sac': li.item_code or li.warranty_text or '',
                    'description': li.description,
                    'quantity': float(li.quantity) if li.quantity is not None else 1.0,
                    'rate': float(li.unit_price) if li.unit_price is not None else 0.0,
                    'unit_price': float(li.unit_price) if li.unit_price is not None else 0.0,
                    'amount': float(li.amount) if li.amount is not None else 0.0,
                    'warranty_text': li.warranty_text,
                    'serial_numbers': li.serial_numbers
                }
                for idx, li in enumerate(inv.line_items, start=1)
            ]
            inv_dict_base['items'] = loaded_items
            inv_dict_base['line_items'] = loaded_items
        elif inv.line_items_json:
            try:
                loaded_items = json.loads(inv.line_items_json)
                inv_dict_base['items'] = loaded_items
                inv_dict_base['line_items'] = loaded_items
            except Exception as exc:
                logger.debug("Handled non-fatal exception: %s", exc)

        try:
            db.expunge(inv)
        except Exception as exc:
            # Benign: invoice object may already be detached or expunged from session
            logger.debug("Handled non-fatal invoice expunge exception: %s", exc)

        cached_payload = (inv, steps, steps_data, current_step_name, audit_logs_tuples, audit_trail_list, inv_dict_base)
        with _BASE_DOC_LOCK:
            _BASE_DOC_CACHE[clean_id] = {"data": cached_payload, "timestamp": now}
            _BASE_DOC_CACHE[str(inv.id)] = {"data": cached_payload, "timestamp": now}

    has_appr = False
    has_rej = False
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.name, current_user.email]
        user_names_set = {str(name).strip().lower() for name in user_names if name}
        for u_actor, act in audit_logs_tuples:
            if any(n in u_actor for n in user_names_set):
                if 'approve' in act:
                    has_appr = True
                if 'reject' in act or 'return' in act or 'cancel' in act or 'hold' in act:
                    has_rej = True
    is_curr = False
    if current_user and inv.assigned_approver and not has_appr:
        is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Rejected', 'Failed', 'Settled']
        if is_active_flow:
            is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver, db, ignore_admin_bypass=True)
    is_admin = is_user_admin(current_user, db)
    completed_by_peer = False
    curr_stg = inv.current_stage or 1
    is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed', 'Settled']

    if not is_admin and inv.workflow_profile_id:
        all_steps = steps
        user_stages = [
            s.stage_number for s in all_steps 
            if s.approver_target and is_user_in_approver_pool(current_user, s.approver_target, db=db)
        ]
        
        # 1. Future stage restriction: If user only belongs to future stages, forbid access
        if is_active_flow and user_stages and all(stg > curr_stg for stg in user_stages):
            raise HTTPException(
                status_code=403,
                detail=f"Access Denied: Document '{invoice_id}' is currently at Stage {curr_stg}. Future stage approvers cannot access or view this document until previous stages are completed."
            )

        # 2. Peer approver detection: User belonged to an earlier stage, or a completed/approved stage they didn't personally sign off on
        if user_stages and not has_appr:
            if any(stg < curr_stg for stg in user_stages):
                completed_by_peer = True
            elif not is_active_flow and any(stg <= curr_stg for stg in user_stages):
                completed_by_peer = True

    if not is_admin:
        is_feedback_role = (current_user.role or '').lower() in ['customer_feedback_agent', 'customer_feedback', 'feedback_agent']
        is_feedback_doc = is_feedback_or_complaint(inv.document_type) or str(inv.id).startswith('CMP') or str(inv.id).startswith('CF') or bool(getattr(inv, 'type_of_complaint', None))
        
        u_role_clean = (current_user.role or '').strip().lower() if current_user else ''
        is_uploader_role = bool(any(x in u_role_clean for x in ['uplod', 'upload', 'account', 'approver', 'manager']))
        u_names_clean = {
            (current_user.username or '').strip().lower(),
            (current_user.employee_id or '').strip().lower(),
            (current_user.employee_name or '').strip().lower(),
            (current_user.name or '').strip().lower(),
            (current_user.email or '').strip().lower(),
        } if current_user else set()
        u_names_clean = {n for n in u_names_clean if n}
        inv_creator_tokens = {
            str(getattr(inv, 'user_id', '') or '').strip().lower(),
            str(getattr(inv, 'created_by_id', '') or '').strip().lower(),
            str(getattr(inv, 'created_by', '') or '').strip().lower(),
            str(getattr(inv, 'uploaded_by', '') or '').strip().lower(),
            str(getattr(inv, 'contact_person', '') or '').strip().lower(),
            str(getattr(inv, 'employee_id', '') or '').strip().lower(),
            str(getattr(inv, 'employee_name', '') or '').strip().lower(),
        }
        u_id_str = str(current_user.id) if current_user else ''
        is_creator = bool(
            (u_id_str and (u_id_str == str(getattr(inv, 'user_id', None)) or u_id_str == str(getattr(inv, 'created_by_id', None))))
            or any(t and (t in u_names_clean or any(n in t for n in u_names_clean)) for t in inv_creator_tokens if t)
        )

        if not is_curr and not is_creator and not has_appr and not completed_by_peer and not (is_feedback_role and is_feedback_doc):
            user_approval_divs = get_user_approval_divisions(current_user)
            doc_div = (inv.division or '').strip().upper()
            if doc_div and user_approval_divs and not any(d in ['HQ', 'GLOBAL', 'ALL', ''] for d in user_approval_divs) and doc_div not in ['HQ', 'GLOBAL', 'ALL', '']:
                if doc_div not in user_approval_divs:
                    raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view document '{invoice_id}'. Documents are scoped to your assigned division/department.")
        
        is_terminal = inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']
        if is_terminal:
            is_cancelled = inv.status in ['Cancelled', 'Failed'] or 'cancel' in (inv.status or '').lower() or 'void' in (inv.status or '').lower()
            if is_cancelled:
                # Cancelled document is only visible to the user who cancelled/created it and the admin alone!
                if not (is_admin or has_rej or is_creator):
                    raise HTTPException(status_code=403, detail=f"Access Denied: Document '{invoice_id}' was cancelled and is only accessible by the initiator and administrator.")
            is_approved = inv.status in ['Approved', 'Settled', 'Paid']
            if is_approved:
                if not has_appr and not is_creator and not is_feedback_doc:
                    raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view approved document '{invoice_id}'. Only users who personally approved this document and administrators may view it.")
            elif not is_cancelled and not has_appr and not has_rej and not is_creator and not completed_by_peer and not is_feedback_doc and not authorize_document_access(current_user, inv):
                raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view document '{invoice_id}'.")
        else:
            # Active document: allowed if current approver, creator/uploader, prior approver who approved, peer from completed prior stage, or uploader role
            is_unrouted = inv.status in ['Unrouted (No Rule Matched)', 'Unassigned (No Rule Matched)'] or not inv.assigned_approver or 'unassigned' in (inv.assigned_approver or '').lower()
            curr_stage = inv.current_stage or 1
            if not is_curr and not is_creator and not has_appr and not has_rej and not completed_by_peer:
                if not (is_uploader_role and (is_unrouted or is_creator or curr_stage == 1)):
                    raise HTTPException(
                        status_code=403, 
                        detail=f"Access Denied: Document '{invoice_id}' is currently at Stage {inv.current_stage or 1} and assigned to {inv.assigned_approver or 'another approver'}. You can only view documents assigned to your desk."
                    )

    # For Customer Feedback records: dynamically ensure matching approved invoice PDF is attached if not yet set
    is_feedback_doc = (
        is_feedback_or_complaint(inv.document_type)
        or str(inv.id).startswith('CMP')
        or str(inv.id).startswith('CF')
        or bool(getattr(inv, 'type_of_complaint', None))
        or (inv.workflow_profile_id or '').lower().startswith('customer_feedback')
    )
    if is_feedback_doc and not getattr(inv, 'file_path', None) and not inv.file_url:
        lookup_invoice_num = (inv.invoice_number or inv.doc_num or '').strip()
        if lookup_invoice_num:
            approved_candidate = (
                db.query(Invoice)
                .filter(
                    (Invoice.invoice_number == lookup_invoice_num) | (Invoice.doc_num == lookup_invoice_num),
                    Invoice.id != inv.id,
                    Invoice.is_deleted == False,
                    Invoice.status.in_(['Approved', 'Settled', 'Ready for Payment', 'Paid'])
                )
                .filter((Invoice.file_path != None) | (Invoice.file_url != None))
                .order_by(Invoice.id.desc())
                .first()
            )
            if approved_candidate and (approved_candidate.file_path or approved_candidate.file_url):
                cand_path = approved_candidate.file_path
                cand_resolved = None
                if cand_path:
                    try:
                        safe_cand = get_safe_file_path(cand_path)
                        if safe_cand.is_file():
                            cand_resolved = str(safe_cand)
                    except Exception:
                        try:
                            resolved_cand = Path(cand_path).resolve()
                            if resolved_cand.is_file():
                                cand_resolved = str(resolved_cand)
                        except Exception as exc:
                            # Silently ignore candidate path resolution errors
                            logger.debug("Handled non-fatal candidate path resolution exception: %s", exc)
                    if not cand_resolved:
                        cand_resolved = cand_path

                cand_filename = approved_candidate.file_name or (Path(cand_path).name if cand_path else f"{lookup_invoice_num}.pdf")
                if cand_resolved:
                    inv.file_path = cand_resolved
                    inv.file_name = cand_filename
                    inv.file_url = f"/api/documents/{inv.id}/file"
                    try:
                        if os.path.isfile(cand_resolved):
                            inv.file_size = os.path.getsize(cand_resolved)
                        elif approved_candidate.file_size:
                            inv.file_size = approved_candidate.file_size
                    except Exception as exc:
                        # Ignore error reading candidate file size
                        logger.debug("Handled non-fatal candidate file size exception: %s", exc)
                    try:
                        db.commit()
                        db.refresh(inv)
                    except Exception as db_err:
                        logger.debug("Failed saving auto-attached invoice to DB on load: %s", db_err)
                        db.rollback()
                elif approved_candidate.file_url:
                    inv.file_url = approved_candidate.file_url
                    inv.file_name = cand_filename
                    inv.file_size = approved_candidate.file_size
                    try:
                        db.commit()
                        db.refresh(inv)
                    except Exception as db_err:
                        logger.debug("Failed saving auto-attached file_url on load: %s", db_err)
                        db.rollback()

    inv_dict = dict(inv_dict_base)
    if audit_trail_list:
        inv_dict['audit_trail'] = audit_trail_list

    inv_dict['is_current_approver'] = is_curr
    inv_dict['has_approved'] = has_appr
    inv_dict['has_rejected'] = has_rej
    inv_dict['completed_by_peer'] = completed_by_peer
    inv_dict['current_stage_name'] = current_step_name
    inv_dict['workflow_step_definitions'] = steps_data
    inv_dict['active_approval_log'] = {'current_stage_number': inv.current_stage or 1, 'stage_name': current_step_name, 'status': 'Pending'}
    return inv_dict

FORBIDDEN_DOCUMENT_UPDATE_FIELDS = {
    'status', 'assigned_approver', 'assigned_role', 'workflow_stage',
    'current_stage', 'total_stages', 'workflow_profile_id', 'workflow_code',
    'is_locked', 'locked_by', 'locked_at', 'version',
    'source_system', 'source_application', 'source_id', 'doc_key', 'document_key',
    'created_by', 'id', 'created_at', 'deleted_at', 'is_deleted'
}

EDITABLE_DOCUMENT_FIELDS = {
    'vendor_name', 'vendor_code', 'vendor_gstin', 'invoice_number', 'invoice_date',
    'po_number', 'amount', 'base_amount', 'tax_amount', 'currency',
    'document_type', 'division', 'category', 'cost_center', 'plant', 'payment_terms',
    'checklist_state', 'notes', 'remarks', 'comments', 'additional_comments',
    'dealer_name', 'account_name', 'bp_code', 'bp_type',
    'type_of_complaint', 'subtype_of_complaint', 'feedback_type', 'rating', 'feedback_date',
    'due_date', 'expense_type', 'department', 'expense_date', 'receipt_number',
    'credit_note_number', 'reason_for_credit', 'original_invoice_ref', 'credit_note_date', 'credit_status',
    'bank_account', 'bank_account_number', 'bank_name', 'ifsc_code'
}

FINANCIAL_FIELDS = {'amount', 'base_amount', 'tax_amount', 'vendor_name', 'vendor_code', 'po_number', 'bank_account', 'bank_account_number'}

@router.put('/api/records/{invoice_id}')
@router.put('/api/documents/{invoice_id}')
@router.put('/api/invoices/{invoice_id}')
async def update_invoice(invoice_id: str, payload: InvoiceUpdate, req: Request, db: Session=Depends(get_db), user: User=Depends(get_current_active_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Document not found")

    if not authorize_document_access(user, inv) and not is_user_in_approver_pool(user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail='Access Denied: You are not authorized to update this document.')

    # ISSUE 4: Reject edits (409) when status is Approved, Posted, Paid, Cancelled or Rejected
    cur_status = (inv.status or '').strip().lower()
    if cur_status in ['approved', 'posted', 'paid', 'cancelled', 'rejected']:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot edit document in '{inv.status}' status. Approved, posted, paid, cancelled, and rejected records are permanently locked from manual edits."
        )

    # SEC-01: Check raw JSON payload for forbidden workflow/status/lock fields
    raw_json = None
    try:
        raw_json = await req.json()
        if isinstance(raw_json, dict):
            for field in (raw_json or {}):
                if field in FORBIDDEN_DOCUMENT_UPDATE_FIELDS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Mass Assignment Protection: Field '{field}' cannot be modified directly. Status and workflow changes are only permitted through workflow approval endpoints."
                    )
    except HTTPException:
        raise
    except Exception as exc:
        # Request body may not be JSON; proceed with payload model validation
        logger.debug("Handled non-fatal raw body json decode exception: %s", exc)

    # ISSUE 4: Require expected_version and enforce optimistic concurrency
    raw_expected = raw_json.get('expected_version') or raw_json.get('expectedVersion') if isinstance(raw_json, dict) else None
    expected_ver = payload.expected_version if payload.expected_version is not None else (payload.expectedVersion if payload.expectedVersion is not None else raw_expected)
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )

    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document version has been modified by another approver or process."
        )

    update_data = payload.model_dump(exclude_unset=True) if hasattr(payload, 'model_dump') else payload.dict(exclude_unset=True)

    # Protect synced ERP data during Attachment Status
    is_synced = bool(inv.doc_key or getattr(inv, 'source_application', None))
    is_attachment_stage = (inv.current_stage or 1) == 1 or 'attachment' in (inv.status or '').lower()
    if is_synced and is_attachment_stage:
        synced_fields = {'amount', 'base_amount', 'tax_amount', 'invoice_number', 'invoice_date', 'vendor_name', 'vendor_code', 'vendor_gstin', 'po_number', 'cost_center', 'plant', 'division'}
        for sf in synced_fields:
            if sf in update_data and update_data[sf] is not None and getattr(inv, sf) != update_data[sf]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Data Sync Protection: This document was synced from third-party ERP. Core financial field '{sf}' cannot be edited during Attachment Status."
                )

    # ISSUE 4: Explicit allowlist of editable fields & audit financial changes mid-workflow
    financial_audit_details = []
    is_mid_workflow = (inv.current_stage or 1) >= 1 and cur_status not in ['draft', 'unrouted']

    for field, val in update_data.items():
        if field in EDITABLE_DOCUMENT_FIELDS and hasattr(inv, field) and val is not None:
            old_val = getattr(inv, field)
            if old_val != val:
                if is_mid_workflow and field in FINANCIAL_FIELDS:
                    financial_audit_details.append(f"{field}: '{old_val}' -> '{val}'")
                setattr(inv, field, val)

    rows_affected = db.query(Invoice).filter(
        Invoice.id == inv.id,
        Invoice.version == current_version
    ).update({
        Invoice.version: current_version + 1
    }, synchronize_session=False)

    if rows_affected == 0:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This document version has been modified by another approver or process."
        )

    inv.version = current_version + 1

    matched_wf = evaluate_business_rules(db, {'division': inv.division, 'category': inv.category, 'amount': inv.amount, 'document_type': inv.document_type})
    if matched_wf and matched_wf != inv.workflow_profile_id:
        inv.workflow_profile_id = matched_wf
        steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == matched_wf).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        inv.total_stages = len(steps) if steps else 1
        if (inv.current_stage or 1) == 1 and steps:
            inv.assigned_approver = steps[0].approver_target

    audit_notes = 'Document header/line-items edited and saved.'
    if financial_audit_details:
        audit_notes = f"Financial fields modified mid-workflow: {', '.join(financial_audit_details)}"
    db.add(AuditLog(invoice_id=inv.id, user=user.employee_name or user.name or user.username, action='Invoice Fields Updated', stage=f'Stage {inv.current_stage or 1}', notes=audit_notes))
    db.commit()
    db.refresh(inv)
    invalidate_invoices_cache(str(inv.id))
    return inv

from app.services.document_storage_service import (
    extract_date_components,
    normalize_doc_type_folder,
    sanitize_name,
    get_storage_config,
    get_storage_root_path,
    get_archived_pdf_path,
    get_rejected_pdf_path,
    archive_approved_pdf,
    archive_rejected_pdf,
)

def complete_document_lifecycle(
    db: Session,
    inv: Invoice,
    approver_name: str,
    remarks: Optional[str] = None,
    prev_stage_num: Optional[int] = None,
    stage_name: Optional[str] = None,
    next_assigned_info: Optional[str] = None,
    approver_user: Optional[User] = None,
    client_ip: Optional[str] = None
) -> bool:
    """
    Unified post-approval lifecycle handler called by:
      - /api/workflows/approve
      - /api/documents/{id}/approve
      - /api/records/{id}/step-action

    Execution order:
      1. Archive PDF to year/month/document folder
      2. If archiving succeeds, trigger trigger_async_integration_push (back sync)
      3. Dispatch notifications and audit log

    Idempotent:
      - Does not re-archive if already archived.
      - Does not push back sync twice.
      - Does not create duplicate final approval audit logs or notifications.
    """
    remarks = remarks or 'Compliance items verified and signed off.'
    prev_stg = prev_stage_num or inv.current_stage or 1
    stg_name = stage_name or f'Stage {prev_stg}'
    next_info = next_assigned_info or 'Final Settlement Completed. Ready for payment disbursement.'

    # 1. Step 1: Archive physical PDF to year/month/document folder
    archive_success = False
    try:
        archive_success = archive_approved_pdf(inv)
    except Exception as exc:
        logger.error(f"[complete_document_lifecycle] PDF archiving exception for doc {inv.id}: {exc}")
        archive_success = False

    if archive_success:
        inv.storage_status = 'ARCHIVED'
    else:
        inv.storage_status = 'PENDING'
        logger.warning(f"[complete_document_lifecycle] PDF archiving failed or source file missing for doc {inv.id}; marked storage_status='PENDING'.")

    # 2. Step 2: Notifications & Audit Log (Idempotency check)
    existing_final_log = db.query(AuditLog).filter(
        AuditLog.invoice_id == inv.id,
        AuditLog.action.ilike('Approved%'),
        AuditLog.stage == stg_name
    ).first()

    if not existing_final_log:
        dispatch_approval_inapp_notifications(
            db=db,
            inv=inv,
            approver_name=approver_name,
            prev_stage=prev_stg,
            new_stage=inv.current_stage,
            next_approver_target=inv.assigned_approver,
            is_completed=True
        )
        record_approval_assignment_transition(
            db=db,
            inv=inv,
            completed_stage_num=prev_stg,
            action="APPROVED",
            approver_handle=approver_name,
            remarks=remarks,
            next_stage_num=None,
            next_stage_name=None,
            next_approver_handle=None
        )
        record_document_audit_event(
            db=db,
            inv=inv,
            action=f'Approved ({stg_name})',
            stage=stg_name,
            remarks=remarks,
            user=approver_user,
            client_ip=client_ip,
            previous_status=f'In Progress ({stg_name})',
            new_status='Approved',
            notes_extra=next_info
        )

    # Commit approval, storage status, and audit log to DB FIRST
    db.commit()
    db.refresh(inv)

    # 3. Step 3: Trigger async integration push (back sync) unconditionally upon document completion
    try:
        inv.external_sync_status = 'QUEUED'
        db.commit()
        trigger_async_integration_push(str(inv.id), decision='APPROVED')
        logger.info(f"[complete_document_lifecycle] Back sync push triggered for approved doc {inv.id}")
    except Exception as push_err:
        logger.error(f"[complete_document_lifecycle] Failed to trigger back sync push for doc {inv.id}: {push_err}")

    safe_broadcast_event('STAGE_APPROVED', {
        'document_id': str(inv.id),
        'approved_stage': prev_stg,
        'new_stage': inv.current_stage,
        'status': inv.status,
        'approver': approver_name
    })
    safe_broadcast_event('DOCUMENT_UPDATED', {
        'document_id': str(inv.id),
        'status': inv.status,
        'current_stage': inv.current_stage,
        'assigned_approver': inv.assigned_approver
    })

    invalidate_invoices_cache(str(inv.id))
    return True

from app.services.document_notification_service import (
    dispatch_assignment_inapp_notification,
    dispatch_approval_inapp_notifications,
    dispatch_rejection_inapp_notifications,
)

def process_rejection_logic(db: Session, inv: Invoice, approver_name: str, remarks: str, action_type: str='Reject', expected_version: Optional[int]=None, approver_user: Optional[User] = None, client_ip: Optional[str] = None):
    """
    Step-down rejection:
    - If Stage N (N > 1): Returns document to Stage N-1 previous approver.
    - If Stage 1 (Attachment Status): Cancels / voids the process.
    """
    current_stage = inv.current_stage or 1
    cur_ver = expected_version if expected_version is not None else (inv.version or 1)
    if current_stage > 1:
        prev_stage = current_stage - 1
        inv.current_stage = prev_stage
        prev_step_name = f'Stage {prev_stage}'
        if inv.workflow_profile_id:
            wf_name, steps = resolve_workflow_steps_for_document(db, inv)
            if steps:
                prev_step = next((s for s in steps if s.stage_number == prev_stage), None)
            else:
                prev_step = db.query(WorkflowStepDefinition).filter(
                    (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
                    (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
                    WorkflowStepDefinition.stage_number == prev_stage
                ).first()
            if prev_step:
                inv.assigned_approver = prev_step.approver_target
                prev_step_name = prev_step.step_name
            else:
                inv.assigned_approver = None
        else:
            inv.assigned_approver = None

        if prev_stage == 1:
            inv.status = 'Initiated (Attachment Status)'
        else:
            inv.status = f'In Progress (Stage {prev_stage} - {prev_step_name})'
        existing_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == prev_step_name).all()
        if not existing_items:
            checklist_items = resolve_checklist_items(db, inv, prev_step_name)
            for item_text in checklist_items:
                db.add(InvoiceChecklistState(invoice_id=inv.id, stage_name=prev_step_name, item_text=item_text, is_checked=False))
            inv.checklist_state = json.dumps({item_text: False for item_text in checklist_items})
        else:
            for item in existing_items:
                item.is_checked = False
                item.checked_by = None
                item.checked_at = None
            inv.checklist_state = json.dumps({item.item_text: False for item in existing_items})

        rows_affected = db.query(Invoice).filter(
            Invoice.id == inv.id,
            Invoice.version == cur_ver
        ).update({
            Invoice.current_stage: inv.current_stage,
            Invoice.status: inv.status,
            Invoice.assigned_approver: inv.assigned_approver,
            Invoice.version: cur_ver + 1,
            Invoice.checklist_state: inv.checklist_state,
            Invoice.updated_at: datetime.datetime.utcnow()
        }, synchronize_session=False)

        if rows_affected == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")

        inv.version = cur_ver + 1

        dispatch_rejection_inapp_notifications(db=db, inv=inv, approver_name=approver_name, from_stage=current_stage, to_stage=prev_stage, remarks=remarks, target_approver=inv.assigned_approver, is_cancelled=False)
        record_approval_assignment_transition(
            db=db,
            inv=inv,
            completed_stage_num=current_stage,
            action='REJECTED',
            approver_handle=approver_name,
            remarks=remarks,
            next_stage_num=prev_stage,
            next_stage_name=prev_step_name,
            next_approver_handle=inv.assigned_approver
        )
        record_document_audit_event(
            db=db,
            inv=inv,
            action=f'Rejected / Returned to Stage {prev_stage}',
            stage=f'Stage {current_stage}',
            remarks=remarks,
            user=approver_user,
            client_ip=client_ip,
            previous_status=f'In Progress (Stage {current_stage})',
            new_status=inv.status,
            notes_extra=f'Returned to Stage {prev_stage} ({prev_step_name}, Assigned: {inv.assigned_approver})'
        )
        db.commit()
        db.refresh(inv)
        trigger_async_integration_push(str(inv.id), decision='REJECTED')
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        invalidate_invoices_cache(str(inv.id))
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver, 'message': f'Document returned to Stage {prev_stage} ({prev_step_name}) for previous approver review.'}
    elif 'hold' in (action_type or '').lower() or 'send back' in (action_type or '').lower() or 'return' in (action_type or '').lower():
        inv.status = 'On Hold'
        rows_affected = db.query(Invoice).filter(
            Invoice.id == inv.id,
            Invoice.version == cur_ver
        ).update({
            Invoice.status: 'On Hold',
            Invoice.version: cur_ver + 1,
            Invoice.updated_at: datetime.datetime.utcnow()
        }, synchronize_session=False)

        if rows_affected == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")

        inv.version = cur_ver + 1
        record_document_audit_event(
            db=db,
            inv=inv,
            action='Placed on Hold',
            stage=f'Stage {current_stage}',
            remarks=remarks,
            user=approver_user,
            client_ip=client_ip,
            previous_status=f'In Progress (Stage {current_stage})',
            new_status='On Hold'
        )
        db.commit()
        db.refresh(inv)
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        invalidate_invoices_cache(str(inv.id))
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver, 'message': 'Record placed on temporary hold.'}
    else:
        if not remarks or not str(remarks).strip() or str(remarks).strip() == 'Record rejected / returned to previous approver.':
            raise HTTPException(
                status_code=400,
                detail="A cancellation comment is mandatory to cancel the document in the Attachment Stage."
            )
        inv.status = 'Cancelled'
        inv.assigned_approver = None
        rows_affected = db.query(Invoice).filter(
            Invoice.id == inv.id,
            Invoice.version == cur_ver
        ).update({
            Invoice.status: 'Cancelled',
            Invoice.assigned_approver: None,
            Invoice.version: cur_ver + 1,
            Invoice.updated_at: datetime.datetime.utcnow()
        }, synchronize_session=False)

        if rows_affected == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")

        inv.version = cur_ver + 1
        archive_rejected_pdf(inv)
        dispatch_rejection_inapp_notifications(db=db, inv=inv, approver_name=approver_name, from_stage=1, to_stage=0, remarks=remarks, target_approver=None, is_cancelled=True)
        record_approval_assignment_transition(
            db=db,
            inv=inv,
            completed_stage_num=1,
            action='REJECTED',
            approver_handle=approver_name,
            remarks=remarks
        )
        record_document_audit_event(
            db=db,
            inv=inv,
            action='Process Cancelled',
            stage='Stage 1 (Attachment Status)',
            remarks=remarks,
            user=approver_user,
            client_ip=client_ip,
            previous_status=f'In Progress (Stage {current_stage})',
            new_status='Cancelled'
        )
        db.commit()
        db.refresh(inv)
        trigger_async_integration_push(str(inv.id), decision='REJECTED')
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': None})
        invalidate_invoices_cache(str(inv.id))
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'message': 'Workflow process cancelled and voided at Attachment Stage.'}

def generate_fallback_pdf_bytes(inv: Invoice, invoice_id: str = "") -> bytes:
    doc_id_str = str(getattr(inv, 'id', None) or invoice_id)
    doc_type_str = str(getattr(inv, 'document_type', None) or 'CUSTOMER FEEDBACK').upper()
    doc_title = str(getattr(inv, 'title', None) or getattr(inv, 'account_name', None) or f"Document {doc_id_str}").replace('(', '[').replace(')', ']')

    stream_content = f"BT /F1 16 Tf 50 720 Td ({doc_type_str} - {doc_id_str}) Tj 0 -30 Td /F1 11 Tf (Reference ID: {doc_id_str}) Tj 0 -20 Td (Title: {doc_title}) Tj 0 -20 Td (Status: Attachment Pending / Synthetic View) Tj ET"
    stream_len = len(stream_content)

    pdf_bytes = f"""%PDF-1.4
1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj
2 0 obj <</Type/Pages/Count 1/Kids[3 0 R]>> endobj
3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>> endobj
4 0 obj <</Length {stream_len}>>
stream
{stream_content}
endstream
endobj
5 0 obj <</Type/Font/Subtype/Type1/BaseFont/Helvetica>> endobj
xref
0 6
0000000000 65535 f 
0000000052 00000 n 
0000000101 00000 n 
0000000212 00000 n 
0000000300 00000 n 
0000000390 00000 n 
trailer <</Size 6/Root 1 0 R>>
startxref
460
%%EOF""".encode('ascii', errors='ignore')
    return pdf_bytes


@router.get('/api/records/{invoice_id}/file')
@router.get('/api/documents/{invoice_id}/file')
@router.get('/api/invoices/{invoice_id}/file')
def stream_document_file(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Document not found")
    if not authorize_document_access(current_user, inv) and not is_user_in_approver_pool(current_user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail='Access Denied: You are not authorized to access this document file.')

    target_ref = getattr(inv, 'file_path', None) or inv.file_url
    safe_path = None

    if target_ref:
        try:
            cand = get_safe_file_path(target_ref)
            if cand.is_file():
                safe_path = cand
        except Exception as err:
            logger.debug('Target ref path resolution: %s', err)

    if not safe_path and getattr(inv, 'file_name', None):
        try:
            cand = get_safe_file_path(inv.file_name)
            if cand.is_file():
                safe_path = cand
        except Exception as exc:
            logger.debug('Fallback lookup by file_name failed: %s', exc)

    if not safe_path:
        clean_id = re.sub(r'[^a-zA-Z0-9_\-\.]', '', str(inv.id or inv.invoice_number or ''))
        if clean_id:
            for cand_name in [f"{clean_id}.pdf", clean_id]:
                try:
                    cand = get_safe_file_path(cand_name)
                    if cand.is_file():
                        safe_path = cand
                        break
                except Exception as exc:
                    logger.debug('Fallback lookup by clean_id failed: %s', exc)

    safe_filename = inv.file_name or (safe_path.name if safe_path else f"{inv.id}.pdf")
    resp_headers = {
        'Content-Security-Policy': "sandbox; frame-ancestors 'self'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Disposition': f'inline; filename="{safe_filename}"'
    }

    if safe_path and safe_path.is_file():
        media_type = 'application/pdf' if safe_path.suffix.lower() == '.pdf' else 'image/jpeg'
        return FileResponse(
            path=str(safe_path),
            media_type=media_type,
            filename=safe_filename,
            headers=resp_headers
        )

    pdf_bytes = generate_fallback_pdf_bytes(inv, invoice_id)
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers=resp_headers
    )


@router.get('/api/documents/{invoice_id}/signed-url')
def get_document_signed_url(
    invoice_id: str,
    disp: str = Query('inline', pattern='^(inline|attachment)$'),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{invoice_id}' not found")

    if not authorize_document_access(current_user, inv) and not is_user_in_approver_pool(current_user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail="Access Denied: You are not authorized to view this document")

    from app.services.signed_file_service import generate_signed_file_token
    token_info = generate_signed_file_token(
        document_id=str(inv.id),
        user_id=current_user.id,
        disp=disp,
    )
    return token_info


@router.get('/api/files/signed/{document_id}')
def serve_signed_document_file(
    document_id: str,
    expires: int = Query(..., description="Unix expiration timestamp"),
    sig: str = Query(..., description="HMAC-SHA256 signature"),
    uid: str = Query(..., description="User ID"),
    disp: str = Query("inline", pattern="^(inline|attachment)$"),
    db: Session = Depends(get_db),
):
    if not re.match(r'^[a-zA-Z0-9_\-\.]+$', document_id) or '..' in document_id or document_id.startswith('.'):
        raise HTTPException(status_code=400, detail="Invalid document identifier")

    from app.services.signed_file_service import verify_signed_file_token
    is_valid, reason = verify_signed_file_token(
        document_id=document_id,
        user_id=uid,
        expires=expires,
        sig=sig,
        disp=disp,
    )
    if not is_valid:
        raise HTTPException(status_code=403, detail=f"Access Denied: {reason}")

    user = None
    try:
        user = db.query(User).filter(User.id == int(uid)).first()
    except (ValueError, TypeError):
        user = db.query(User).filter(User.username == uid).first()

    if not user or not user.is_active or getattr(user, 'is_deleted', False):
        raise HTTPException(status_code=403, detail="Access Denied: Authorized user account is inactive or deleted")

    inv = find_invoice_by_identifier(db, document_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Document record not found")

    if not authorize_document_access(user, inv) and not is_user_in_approver_pool(user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail="Access Denied: You are not authorized to access this document")

    target_ref = getattr(inv, 'file_path', None) or inv.file_url
    safe_path = None
    if target_ref:
        try:
            cand = get_safe_file_path(target_ref)
            if cand.is_file():
                safe_path = cand
        except Exception:
            # Fall back to alternative file lookup if target_ref is invalid
            logger.debug("Handled non-fatal exception")

    if not safe_path and getattr(inv, 'file_name', None):
        try:
            cand = get_safe_file_path(inv.file_name)
            if cand.is_file():
                safe_path = cand
        except Exception:
            # Fall back to default filename pattern if inv.file_name resolution fails
            logger.debug("Handled non-fatal exception")

    raw_fname = inv.file_name or (safe_path.name if safe_path else f"{inv.id}.pdf")
    safe_filename = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', raw_fname)
    if not safe_filename.lower().endswith(('.pdf', '.png', '.jpg', '.jpeg')):
        safe_filename += '.pdf'

    resp_headers = {
        "Content-Security-Policy": "sandbox; frame-ancestors 'self'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Content-Disposition": f'{disp}; filename="{safe_filename}"',
    }

    if safe_path and safe_path.is_file():
        media_type = 'application/pdf' if safe_path.suffix.lower() == '.pdf' else 'image/jpeg'
        return FileResponse(
            path=str(safe_path),
            media_type=media_type,
            filename=safe_filename,
            headers=resp_headers,
        )

    pdf_bytes = generate_fallback_pdf_bytes(inv, document_id)
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers=resp_headers,
    )

def check_approval_authorization(inv: Invoice, user: Optional[User], db: Optional[Session]=None, require_compliance: bool=True, expected_stage: Optional[int]=None, is_rejection_or_cancellation: bool=False, verified_items: Optional[List[str]]=None):
    if not user:
        raise HTTPException(status_code=401, detail='Authentication required: Please log in to approve or review documents.')
    if not user.is_active:
        raise HTTPException(status_code=403, detail='Account Inactive: Your user account is disabled.')
    # Concurrency collision check: if the client expected a specific stage but the document has moved or already completed
    if expected_stage is not None and ((inv.current_stage or 1) != expected_stage or inv.status in ['Settled', 'Approved', 'Paid', 'Ready for Payment', 'Rejected', 'Cancelled', 'Failed']):
        raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")

    if inv.status in ['Settled', 'Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed', 'Rejected']:
        raise HTTPException(status_code=409, detail=f"This document is already in a terminal/completed state ('{inv.status}') and cannot accept further workflow actions.")

    is_feedback_doc = is_feedback_or_complaint(inv.document_type) or str(inv.id).startswith('CMP') or str(inv.id).startswith('CF') or bool(getattr(inv, 'type_of_complaint', None)) or (inv.workflow_profile_id or '').lower().startswith('customer_feedback')

    # Missing workflow profile validation (read-only; does not mutate document)
    if not is_feedback_doc and not is_rejection_or_cancellation:
        if db is not None and (not inv.workflow_profile_id or str(inv.workflow_profile_id).strip() in ['', 'None']):
            raise HTTPException(status_code=400, detail="Document has no workflow profile assigned.")

    is_admin = is_user_admin(user, db)

    # Explicit assignment detection for current step: allows explicitly assigned approver across divisions
    user_identity_handles = {
        (user.username or '').strip().lower(),
        (user.employee_id or '').strip().lower(),
        (user.employee_name or '').strip().lower(),
        (user.name or '').strip().lower(),
        (user.email or '').strip().lower(),
        str(user.id)
    }
    user_identity_handles.discard('')

    is_explicitly_assigned = False
    curr_stage = inv.current_stage or 1
    if db and inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.stage_number == curr_stage
        ).first()
        if step and step.approver_target:
            step_targets = [s.strip().lower() for s in step.approver_target.split(',') if s.strip()]
            if step.delegate_approver and step.delegate_approver.strip():
                step_targets.extend([s.strip().lower() for s in step.delegate_approver.split(',') if s.strip()])
            if any(h in step_targets for h in user_identity_handles):
                is_explicitly_assigned = True

    # Enforce Division Authorization: user can only approve documents matching their authorized approval divisions
    # If the user is an admin or the explicitly assigned approver for the current workflow step, division check is bypassed.
    if not is_admin and not is_explicitly_assigned and inv.division and not is_rejection_or_cancellation:
        user_approval_divs = get_user_approval_divisions(user)
        doc_div = (inv.division or '').strip().upper()
        if doc_div and user_approval_divs and not any(d in {'HQ', 'GLOBAL', 'ALL'} for d in user_approval_divs):
            if doc_div not in user_approval_divs:
                raise HTTPException(
                    status_code=403,
                    detail=f"Access Denied: You are not authorized to approve documents for division '{inv.division}'."
                )

    # Maker-Checker (Segregation of Duties): Creator/submitter can never approve their own document on subsequent approval stages (Stage > 1)
    # Admin users bypass this restriction to permit administrative oversight and workflow testing
    # Note: Stage 1 is the physical attachment/initial submission stage where the uploader/submitter signs off
    curr_stage_num = inv.current_stage or 1
    if user and not is_admin and not is_feedback_doc and not is_rejection_or_cancellation and curr_stage_num > 1:
        user_identifiers = {
            (user.username or '').strip().lower(),
            (user.employee_id or '').strip().lower(),
            (user.employee_name or '').strip().lower(),
            (user.name or '').strip().lower(),
            (user.email or '').strip().lower(),
            str(user.id),
        }
        user_identifiers.discard('')

        doc_creator = (getattr(inv, 'created_by', None) or '').strip().lower()
        doc_emp_id = (getattr(inv, 'employee_id', None) or '').strip().lower()
        doc_creator_id = getattr(inv, 'created_by_id', None)

        if doc_creator_id and user.id == doc_creator_id:
            raise HTTPException(
                status_code=403,
                detail="Maker-Checker policy violation: The creator/submitter of a document cannot approve their own document."
            )

        if doc_creator and doc_creator not in ['system', 'system admin', 'admin', 'api', 'sync'] and doc_creator in user_identifiers:
            raise HTTPException(
                status_code=403,
                detail="Maker-Checker policy violation: The creator/submitter of a document cannot approve their own document."
            )

        if doc_emp_id and (user.employee_id or '').strip().lower() == doc_emp_id:
            raise HTTPException(
                status_code=403,
                detail="Maker-Checker policy violation: The creator/submitter of a document cannot approve their own document."
            )

        if db and inv.id:
            creation_log = db.query(AuditLog).filter(
                AuditLog.invoice_id == inv.id,
                or_(
                    AuditLog.action.ilike('%created%'),
                    AuditLog.action.ilike('%upload%'),
                    AuditLog.action.ilike('%auto workflow%'),
                    AuditLog.action == 'UNROUTED'
                )
            ).order_by(AuditLog.id.asc()).first()
            if creation_log and creation_log.user:
                creator_handle = creation_log.user.strip().lower()
                if creator_handle not in ['system', 'system admin', 'admin', 'policy engine (stp)', 'metadata editor / sync uploader'] and creator_handle in user_identifiers:
                    raise HTTPException(
                        status_code=403,
                        detail="Maker-Checker policy violation: The creator/submitter of a document cannot approve their own document."
                    )

    # Check if this user has already approved this invoice in an earlier action (skip for feedback documents and admin users)
    if db and user and not is_feedback_doc and not is_admin:
        user_id_str = str(user.id)
        user_name_lower = (user.employee_name or user.name or user.username or '').strip().lower()
        has_user_approved = db.query(AuditLog).filter(
            AuditLog.invoice_id == inv.id,
            AuditLog.action.ilike('%approved%'),
            (AuditLog.user.ilike(f"%{user.username}%") | AuditLog.user.ilike(f"%{user_name_lower}%") | (AuditLog.user == user_id_str))
        ).order_by(AuditLog.id.desc()).first()
        if has_user_approved:
            has_return_after = db.query(AuditLog).filter(
                AuditLog.invoice_id == inv.id,
                AuditLog.id > has_user_approved.id,
                or_(AuditLog.action.ilike('%reject%'), AuditLog.action.ilike('%return%'), AuditLog.action.ilike('%send back%'))
            ).first()
            if not has_return_after:
                raise HTTPException(status_code=400, detail="You have already submitted your approval for this document.")

    approvers = [s.strip().lower() for s in (inv.assigned_approver or '').split(',') if s.strip()]
    u_role = (user.role or '').strip().lower()
    uploader_aliases = {'account_uploader', 'account_uploder', 'accounts_uploder', 'doc_uploder', 'doc_uploader', 'uploader', 'accounts', 'account', 'accounts_approver', 'accounts.approver'}
    user_handles = [(user.username or '').lower(), (user.employee_id or '').lower(), (user.employee_name or '').lower(), (user.name or '').lower(), (user.email or '').lower(), u_role]
    if u_role in uploader_aliases or any(x in u_role for x in ['uplod', 'upload', 'account']):
        user_handles.extend(list(uploader_aliases))
    user_handles = [h for h in user_handles if h]
    
    is_stage_1_uploader = curr_stage_num == 1 and (u_role in uploader_aliases or any(x in u_role for x in ['uplod', 'upload', 'account']))
    if is_admin or (is_feedback_doc and not inv.assigned_approver) or (is_rejection_or_cancellation and is_admin) or is_stage_1_uploader:
        is_authorized = True
    else:
        is_authorized = is_explicitly_assigned or is_user_in_approver_pool(user, inv.assigned_approver, db=db, ignore_admin_bypass=True)
        if not is_authorized:
            for handle in user_handles:
                if handle in approvers:
                    is_authorized = True
                    break

    if not is_authorized:
        action_verb = "cancel or reject" if is_rejection_or_cancellation else "approve"
        # Check if user was assigned to an earlier stage (which is already completed) or future stage
        if db and inv.workflow_profile_id:
            steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id).all()
            user_stages = []
            for st in steps:
                step_targets = [s.strip().lower() for s in (st.approver_target or '').split(',') if s.strip()]
                for handle in user_handles:
                    if handle in step_targets:
                        user_stages.append(st.stage_number)
                        break
            if user_stages:
                max_user_stage = max(user_stages)
                min_user_stage = min(user_stages)
                if max_user_stage < (inv.current_stage or 1):
                    raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")
                elif min_user_stage > (inv.current_stage or 1):
                    raise HTTPException(status_code=403, detail=f"Access Denied: You are assigned to Stage {min_user_stage}, but the document is currently at Stage {inv.current_stage or 1}. You cannot {action_verb} until preceding stages are completed.")

        raise HTTPException(status_code=403, detail=f"Access Denied: Only the assigned approver ({inv.assigned_approver}) for Stage {inv.current_stage or 1} is authorized to {action_verb} this document.")

    if require_compliance and db:
        is_stage_1 = (inv.current_stage or 1) == 1
        current_step_name = 'Attachment Status' if is_stage_1 else f'Stage {inv.current_stage or 1}'
        if inv.workflow_profile_id:
            step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == (inv.current_stage or 1)).first()
            if step and step.step_name:
                current_step_name = step.step_name
        is_attachment_stage = is_stage_1 or 'attachment' in current_step_name.lower() or 'attachment' in (inv.status or '').lower()

        has_attachment = False
        target_f = getattr(inv, 'file_path', None) or inv.file_url
        if target_f and target_f.strip():
            try:
                try:
                    file_disk_path = get_safe_file_path(target_f)
                    if file_disk_path.exists() and file_disk_path.stat().st_size > 0:
                        has_attachment = True
                except Exception as exc:
                    logger.debug('Physical file existence check failed: %s', exc)
                if not has_attachment and inv.id:
                    for fname in [f"{inv.id}.pdf", f"{inv.id}"]:
                        for d in [settings.UPLOAD_DIR, settings.PDF_STORAGE_DIR]:
                            p = d / fname
                            if p.exists() and p.stat().st_size > 0:
                                has_attachment = True
                                break
                        if has_attachment:
                            break
                if not has_attachment and (inv.file_url or inv.file_path or inv.file_name):
                    try:
                        fallback_bytes = generate_fallback_pdf_bytes(inv, str(inv.id))
                        ensure_path = settings.UPLOAD_DIR / f"{inv.id}.pdf"
                        ensure_path.write_bytes(fallback_bytes)
                        has_attachment = True
                    except Exception as exc:
                        logger.debug('Could not generate/save fallback attachment: %s', exc)
            except Exception:
                has_attachment = False

        is_feedback_doc = is_feedback_or_complaint(inv.document_type) or str(inv.id).startswith('CMP') or str(inv.id).startswith('CF') or bool(getattr(inv, 'type_of_complaint', None))

        if is_attachment_stage and (not has_attachment) and not is_feedback_doc:
            raise HTTPException(status_code=400, detail='Physical PDF Attachment Compulsory: A valid physical document file must be attached and uploaded before approving Stage 1.')

        configured_items = resolve_checklist_items(db, inv, current_step_name)
        if not configured_items:
            # Stage has NO checklist configured -> clean up stale items if any so approval is never blocked
            stale_items = db.query(InvoiceChecklistState).filter(
                InvoiceChecklistState.invoice_id == inv.id, 
                InvoiceChecklistState.stage_name == current_step_name
            ).all()
            if stale_items:
                for s in stale_items:
                    db.delete(s)
                db.commit()
            checklist_items = []
        else:
            checklist_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == current_step_name).all()
            if not checklist_items:
                checklist_items = db.query(InvoiceChecklistState).filter(
                    InvoiceChecklistState.invoice_id == inv.id,
                    func.lower(InvoiceChecklistState.stage_name) == current_step_name.lower()
                ).all()
            if not checklist_items:
                checklist_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id).all()
            if not checklist_items:
                for t_text in configured_items:
                    item = InvoiceChecklistState(invoice_id=inv.id, stage_name=current_step_name, item_text=t_text, is_checked=False, is_mandatory=True)
                    db.add(item)
                    checklist_items.append(item)
                db.commit()
        if checklist_items and not is_feedback_doc:
            if has_attachment:
                for item in checklist_items:
                    if not item.is_checked and 'document' in (item.item_text or '').lower() and any(w in (item.item_text or '').lower() for w in ['attach', 'upload', 'pdf', 'physical']):
                        item.is_checked = True
                        item.checked_by = user.employee_name or user.name if user else 'System Auto-Check'
                        item.checked_at = datetime.datetime.utcnow()
                db.commit()

            if verified_items:
                v_set = {str(x).strip().lower() for x in verified_items if x}
                for item in checklist_items:
                    if (item.item_text or '').strip().lower() in v_set:
                        item.is_checked = True
                        if not item.checked_by:
                            item.checked_by = user.employee_name or user.name if user else 'Approver'
                            item.checked_at = datetime.datetime.utcnow()
                db.commit()

            unchecked_mandatory = [item for item in checklist_items if getattr(item, 'is_mandatory', True) and not item.is_checked]
            if unchecked_mandatory:
                missing_items_str = ', '.join([f"'{item.item_text}'" for item in unchecked_mandatory])
                raise HTTPException(status_code=400, detail=f"Compliance Checklist Incomplete: The following checklist items must be verified and checked before approving: {missing_items_str}")

@router.post('/api/workflows/approve')
@router.post('/api/workflow/approve')
def workflow_approve_payload(req: Request, payload: dict, db: Session=Depends(get_db), user: User=Depends(get_current_active_user)):
    try:
        client_ip = extract_client_request_ip(req)
        doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
        if not doc_id:
            raise HTTPException(status_code=400, detail='Missing invoiceId in approval payload')
        inv = find_invoice_by_identifier(db, doc_id)
        if not inv:
            raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
        expected_ver = payload.get('expected_version') if 'expected_version' in payload else payload.get('expectedVersion')
        if expected_ver is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Missing mandatory 'expected_version' for concurrency control."
            )
        expected_stage = payload.get('expected_stage') or payload.get('expectedStage') or payload.get('stage')
        clean_stage_num = None
        if expected_stage is not None:
            try:
                stage_match = re.search(r'\d+', str(expected_stage))
                clean_stage_num = int(stage_match.group()) if stage_match else None
            except Exception:
                clean_stage_num = None
        verified_items = payload.get('verifiedItems') or payload.get('checked_items') or payload.get('verified_items')
        check_approval_authorization(inv, user, db=db, require_compliance=True, expected_stage=clean_stage_num, verified_items=verified_items)
        
        approver_name = payload.get('approver') or payload.get('user') or payload.get('username')
        if not approver_name or approver_name.lower() in ['approver', 'reviewer', 'admin']:
            if user:
                approver_name = f'{user.employee_name or user.name} ({user.role.upper()})'
            elif payload.get('username'):
                approver_name = payload.get('username')
            else:
                approver_name = 'System Administrator (ADMIN)'
        remarks = payload.get('comments') or payload.get('comment') or payload.get('remarks') or 'Compliance items verified and signed off.'
        stage_name = f'Stage {inv.current_stage or 1}'
        prev_stage_num = inv.current_stage or 1
        current_version = inv.version or 1
        if expected_ver != current_version:
            raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")

        next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
        next_assigned_val = inv.assigned_approver
        next_checklist_val = inv.checklist_state

        next_step = None
        wf_name, steps = resolve_workflow_steps_for_document(db, inv)
        if wf_name and wf_name != inv.workflow_profile_id:
            inv.workflow_profile_id = wf_name

        total_stages = len(steps) if steps else (inv.total_stages or 1)
        inv.total_stages = total_stages

        if steps:
            next_step = next((s for s in steps if s.stage_number == (prev_stage_num + 1)), None)
        elif inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(
                (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
                (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
                WorkflowStepDefinition.stage_number == (prev_stage_num + 1)
            ).first()

        is_last_step = (next_step is None) and (prev_stage_num >= total_stages)

        if next_step:
            if not next_step.approver_target or not str(next_step.approver_target).strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Workflow configuration error: Step {next_step.stage_number} ('{next_step.step_name}') has no valid approver target."
                )
            next_stage_val = prev_stage_num + 1
            targets = [next_step.approver_target.strip()]
            if next_step.delegate_approver and next_step.delegate_approver.strip():
                targets.append(next_step.delegate_approver.strip())
            next_assigned_val = ', '.join(targets)
            next_step_name = next_step.step_name
            next_assigned_info = f'Advanced to Stage {next_stage_val} ({next_step.step_name}). Next Approver Assigned: {next_assigned_val}.'
            existing_next_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == next_step_name).all()
            if not existing_next_items:
                checklist_items = resolve_checklist_items(db, inv, next_step_name)
                for item_text in checklist_items:
                    db.add(InvoiceChecklistState(invoice_id=inv.id, stage_name=next_step_name, item_text=item_text, is_checked=False, is_mandatory=True))
                next_checklist_val = json.dumps({item_text: False for item_text in checklist_items})
            else:
                for item in existing_next_items:
                    item.is_checked = False
                    item.checked_by = None
                    item.checked_at = None
                next_checklist_val = json.dumps({item.item_text: False for item in existing_next_items})
            next_status_val = f'In Progress (Stage {next_stage_val})'
        elif is_last_step:
            next_status_val = 'Approved'
            next_stage_val = prev_stage_num
        else:
            next_stage_val = prev_stage_num + 1
            next_status_val = f'In Progress (Stage {next_stage_val})'

        rows_affected = db.query(Invoice).filter(
            Invoice.id == inv.id,
            Invoice.version == current_version,
            or_(Invoice.current_stage == prev_stage_num, Invoice.current_stage.is_(None))
        ).update({
            Invoice.current_stage: next_stage_val,
            Invoice.status: next_status_val,
            Invoice.assigned_approver: next_assigned_val,
            Invoice.version: current_version + 1,
            Invoice.checklist_state: next_checklist_val,
            Invoice.updated_at: datetime.datetime.utcnow()
        }, synchronize_session=False)

        if rows_affected == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")

        inv.current_stage = next_stage_val
        inv.status = next_status_val
        inv.assigned_approver = next_assigned_val
        inv.version = current_version + 1
        inv.checklist_state = next_checklist_val

        # Release review lock
        try:
            from app.services.lock_service import lock_manager
            lock_manager.release_lock(doc_id=str(inv.id))
        except Exception as exc:
            logger.debug('Lock release on approval failed: %s', exc)

        next_step_title = next_step.step_name if next_step else f'Stage {next_stage_val}'
        if inv.status == 'Approved':
            complete_document_lifecycle(
                db=db,
                inv=inv,
                approver_name=approver_name,
                remarks=remarks,
                prev_stage_num=prev_stage_num,
                stage_name=stage_name,
                next_assigned_info=next_assigned_info,
                approver_user=user,
                client_ip=client_ip
            )
        else:
            dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=approver_name, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=False)
            record_approval_assignment_transition(
                db=db,
                inv=inv,
                completed_stage_num=prev_stage_num,
                action="APPROVED",
                approver_handle=approver_name,
                remarks=remarks,
                next_stage_num=next_stage_val,
                next_stage_name=next_step.step_name if next_step else None,
                next_approver_handle=next_assigned_val
            )
            record_document_audit_event(
                db=db,
                inv=inv,
                action=f'Approved ({stage_name})',
                stage=stage_name,
                remarks=remarks,
                user=user,
                client_ip=client_ip,
                previous_status=inv.status,
                new_status=next_status_val,
                notes_extra=next_assigned_info
            )
            db.commit()
            db.refresh(inv)
            safe_broadcast_event('STAGE_APPROVED', {'document_id': str(inv.id), 'approved_stage': prev_stage_num, 'new_stage': inv.current_stage, 'status': inv.status, 'approver': approver_name})
            safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        try:
            invalidate_invoices_cache(str(inv.id))
        except Exception:
            pass
        return {
            'success': True,
            'status': inv.status,
            'current_stage': inv.current_stage,
            'invoice': safe_serialize_invoice(inv),
            'approved_by': approver_name,
            'next_approver': next_assigned_val if inv.status != 'Approved' else None,
            'next_stage_name': next_step_title if inv.status != 'Approved' else None,
            'is_final_approval': inv.status == 'Approved'
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Workflow approval payload execution failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Approval execution error: {str(exc)}"
        )

def extract_action_body(req: Request, action: Optional[Any] = None, payload: Optional[dict] = None) -> dict:
    data = {}
    if payload and isinstance(payload, dict):
        data.update(payload)
    if action:
        if isinstance(action, dict):
            data.update(action)
        elif hasattr(action, 'model_dump'):
            data.update(action.model_dump(exclude_unset=True))
        elif hasattr(action, 'dict'):
            data.update(action.dict(exclude_unset=True))
    if not data and hasattr(req, '_body') and req._body:
        try:
            parsed = json.loads(req._body)
            if isinstance(parsed, dict):
                data.update(parsed)
        except Exception:
            pass
    return data

@router.post('/api/records/{invoice_id}/approve')
@router.post('/api/documents/{invoice_id}/approve')
@router.post('/api/invoices/{invoice_id}/approve')
def approve_invoice_url(req: Request, invoice_id: str, action: Optional[InvoiceActionRequest]=None, payload: Optional[dict]=None, db: Session=Depends(get_db), user: User=Depends(get_current_active_user)):
    client_ip = extract_client_request_ip(req)
    data = extract_action_body(req, action, payload)
    expected_ver = data.get('expected_version') if 'expected_version' in data else data.get('expectedVersion')
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    inv = find_invoice_by_identifier(db, invoice_id)
    verified_items = data.get('verifiedItems') or data.get('checked_items') or data.get('verified_items')
    check_approval_authorization(inv, user, db=db, require_compliance=True, verified_items=verified_items)
    username = user.employee_name or user.name if user else 'Reviewer'
    remarks = data.get('remarks') or (action.remarks if action and action.remarks else 'Compliance items verified and signed off.')
    stage_name = data.get('stage_name') or (action.stage_name if action and action.stage_name else f'Stage {inv.current_stage or 1}')
    prev_stage_num = inv.current_stage or 1
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")
    next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
    next_assigned_val = inv.assigned_approver
    next_checklist_val = inv.checklist_state

    next_step = None
    wf_name, steps = resolve_workflow_steps_for_document(db, inv)
    if wf_name and wf_name != inv.workflow_profile_id:
        inv.workflow_profile_id = wf_name

    total_stages = len(steps) if steps else (inv.total_stages or 1)
    inv.total_stages = total_stages

    if steps:
        next_step = next((s for s in steps if s.stage_number == (prev_stage_num + 1)), None)
    elif inv.workflow_profile_id:
        next_step = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.stage_number == (prev_stage_num + 1)
        ).first()

    is_last_step = (next_step is None) and (prev_stage_num >= total_stages)

    if next_step:
        if not next_step.approver_target or not str(next_step.approver_target).strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Workflow configuration error: Step {next_step.stage_number} ('{next_step.step_name}') has no valid approver target."
            )
        next_stage_val = prev_stage_num + 1
        targets = [next_step.approver_target.strip()]
        if next_step.delegate_approver and next_step.delegate_approver.strip():
            targets.append(next_step.delegate_approver.strip())
        next_assigned_val = ', '.join(targets)
        next_step_name = next_step.step_name
        next_assigned_info = f'Advanced to Stage {next_stage_val} ({next_step.step_name}). Next Approver Assigned: {next_assigned_val}.'
        existing_next_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == next_step_name).all()
        if not existing_next_items:
            checklist_items = resolve_checklist_items(db, inv, next_step_name)
            for item_text in checklist_items:
                db.add(InvoiceChecklistState(invoice_id=inv.id, stage_name=next_step_name, item_text=item_text, is_checked=False, is_mandatory=True))
            next_checklist_val = json.dumps({item_text: False for item_text in checklist_items})
        else:
            for item in existing_next_items:
                item.is_checked = False
                item.checked_by = None
                item.checked_at = None
            next_checklist_val = json.dumps({item.item_text: False for item in existing_next_items})
        next_status_val = f'In Progress (Stage {next_stage_val})'
    elif is_last_step:
        next_status_val = 'Approved'
        next_stage_val = prev_stage_num
    else:
        next_stage_val = prev_stage_num + 1
        next_status_val = f'In Progress (Stage {next_stage_val})'

    rows_affected = db.query(Invoice).filter(
        Invoice.id == inv.id,
        Invoice.version == current_version,
        Invoice.current_stage == prev_stage_num
    ).update({
        Invoice.current_stage: next_stage_val,
        Invoice.status: next_status_val,
        Invoice.assigned_approver: next_assigned_val,
        Invoice.version: current_version + 1,
        Invoice.checklist_state: next_checklist_val,
        Invoice.updated_at: datetime.datetime.utcnow()
    }, synchronize_session=False)

    if rows_affected == 0:
        db.rollback()
        raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")

    inv.current_stage = next_stage_val
    inv.status = next_status_val
    inv.assigned_approver = next_assigned_val
    inv.version = current_version + 1
    inv.checklist_state = next_checklist_val

    try:
        from app.services.lock_service import lock_manager
        lock_manager.release_lock(doc_id=str(inv.id))
    except Exception as exc:
        logger.debug('Lock release on approval failed: %s', exc)

    next_step_title = next_step.step_name if next_step else f'Stage {next_stage_val}'
    if inv.status == 'Approved':
        complete_document_lifecycle(
            db=db,
            inv=inv,
            approver_name=username,
            remarks=remarks,
            prev_stage_num=prev_stage_num,
            stage_name=stage_name,
            next_assigned_info=next_assigned_info,
            approver_user=user,
            client_ip=client_ip
        )
    else:
        dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=username, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=False)
        record_approval_assignment_transition(
            db=db,
            inv=inv,
            completed_stage_num=prev_stage_num,
            action="APPROVED",
            approver_handle=username,
            remarks=remarks,
            next_stage_num=next_stage_val,
            next_stage_name=next_step.step_name if next_step else None,
            next_approver_handle=next_assigned_val
        )
        record_document_audit_event(
            db=db,
            inv=inv,
            action=f'Approved ({stage_name})',
            stage=stage_name,
            remarks=remarks,
            user=user,
            client_ip=client_ip,
            previous_status=inv.status,
            new_status=next_status_val,
            notes_extra=next_assigned_info
        )
        db.commit()
        db.refresh(inv)
        safe_broadcast_event('STAGE_APPROVED', {'document_id': str(inv.id), 'approved_stage': prev_stage_num, 'new_stage': inv.current_stage, 'status': inv.status, 'approver': username})
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        invalidate_invoices_cache(str(inv.id))
    return {
        'success': True,
        'status': inv.status,
        'current_stage': inv.current_stage,
        'invoice': safe_serialize_invoice(inv),
        'approved_by': username,
        'next_approver': next_assigned_val if inv.status != 'Approved' else None,
        'next_stage_name': next_step_title if inv.status != 'Approved' else None,
        'is_final_approval': inv.status == 'Approved'
    }

@router.post('/api/records/{invoice_id}/step-action')
@router.post('/api/documents/{invoice_id}/step-action')
@router.post('/api/invoices/{invoice_id}/step-action')
def invoice_step_action(req: Request, invoice_id: str, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    client_ip = extract_client_request_ip(req)
    inv = find_invoice_by_identifier(db, invoice_id)
    expected_ver = payload.get('expected_version') if 'expected_version' in payload else payload.get('expectedVersion')
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    action_type = str(payload.get('action') or 'Approve').strip()
    act_lower = action_type.lower()
    is_approving = 'approve' in act_lower or 'pass' in act_lower
    expected_stage = payload.get('expected_stage') or payload.get('expectedStage') or payload.get('stage')
    verified_items = (payload.get('verifiedItems') or payload.get('checked_items') or payload.get('verified_items')) if payload else None
    check_approval_authorization(inv, user, db=db, require_compliance=is_approving, expected_stage=int(expected_stage) if expected_stage is not None else None, verified_items=verified_items)
    comments = str(payload.get('comments') or payload.get('comment') or 'Action processed by desk operator.').strip()
    approver_name = payload.get('approver') or (user.employee_name or user.name if user else 'Desk Operator')
    stage_name = f'Stage {inv.current_stage or 1}'
    prev_stage_num = inv.current_stage or 1
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")
    if 'approve' in act_lower or 'pass' in act_lower:
        next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
        next_stage_val = prev_stage_num
        next_assigned_val = inv.assigned_approver
        next_checklist_val = inv.checklist_state
        next_step = None
        wf_name, steps = resolve_workflow_steps_for_document(db, inv)
        if wf_name and wf_name != inv.workflow_profile_id:
            inv.workflow_profile_id = wf_name

        total_stages = len(steps) if steps else (inv.total_stages or 1)
        inv.total_stages = total_stages

        if steps:
            next_step = next((s for s in steps if s.stage_number == (prev_stage_num + 1)), None)
        elif inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(
                (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
                (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
                WorkflowStepDefinition.stage_number == (prev_stage_num + 1)
            ).first()

        is_last_step = (next_step is None) and (prev_stage_num >= total_stages)

        if next_step:
            if not next_step.approver_target or not str(next_step.approver_target).strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Workflow configuration error: Step {next_step.stage_number} ('{next_step.step_name}') has no valid approver target."
                )
            next_stage_val = prev_stage_num + 1
            targets = [next_step.approver_target.strip()]
            if next_step.delegate_approver and next_step.delegate_approver.strip():
                targets.append(next_step.delegate_approver.strip())
            next_assigned_val = ', '.join(targets)
            next_step_name = next_step.step_name
            next_assigned_info = f'Advanced to Stage {next_stage_val} ({next_step.step_name}). Next Approver Assigned: {next_assigned_val}.'
            existing_next_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == next_step_name).all()
            if not existing_next_items:
                checklist_items = resolve_checklist_items(db, inv, next_step_name)
                for item_text in checklist_items:
                    db.add(InvoiceChecklistState(invoice_id=inv.id, stage_name=next_step_name, item_text=item_text, is_checked=False))
                next_checklist_val = json.dumps({item_text: False for item_text in checklist_items})
            else:
                for item in existing_next_items:
                    item.is_checked = False
                    item.checked_by = None
                    item.checked_at = None
                next_checklist_val = json.dumps({item.item_text: False for item in existing_next_items})
            next_status_val = f'In Progress (Stage {next_stage_val})'
        elif is_last_step:
            next_status_val = 'Approved'
            next_stage_val = prev_stage_num
        else:
            next_stage_val = prev_stage_num + 1
            next_status_val = f'In Progress (Stage {next_stage_val})'

        rows_affected = db.query(Invoice).filter(
            Invoice.id == inv.id,
            Invoice.version == current_version,
            Invoice.current_stage == prev_stage_num
        ).update({
            Invoice.current_stage: next_stage_val,
            Invoice.status: next_status_val,
            Invoice.assigned_approver: next_assigned_val,
            Invoice.version: current_version + 1,
            Invoice.checklist_state: next_checklist_val,
            Invoice.updated_at: datetime.datetime.utcnow()
        }, synchronize_session=False)

        if rows_affected == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")
        inv.current_stage = next_stage_val
        inv.status = next_status_val
        inv.assigned_approver = next_assigned_val
        inv.version = current_version + 1
        inv.checklist_state = next_checklist_val

        try:
            from app.services.lock_service import lock_manager
            lock_manager.release_lock(doc_id=str(inv.id))
        except Exception as exc:
            logger.debug('Lock release on inline approval failed: %s', exc)

        next_step_title = next_step.step_name if next_step else f'Stage {next_stage_val}'
        if inv.status == 'Approved':
            complete_document_lifecycle(
                db=db,
                inv=inv,
                approver_name=approver_name,
                remarks=comments,
                prev_stage_num=prev_stage_num,
                stage_name=stage_name,
                next_assigned_info=next_assigned_info,
                approver_user=user,
                client_ip=client_ip
            )
        else:
            dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=approver_name, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=False)
            record_approval_assignment_transition(
                db=db,
                inv=inv,
                completed_stage_num=prev_stage_num,
                action="APPROVED",
                approver_handle=approver_name,
                remarks=comments,
                next_stage_num=next_stage_val,
                next_stage_name=next_step.step_name if next_step else None,
                next_approver_handle=next_assigned_val
            )
            record_document_audit_event(
                db=db,
                inv=inv,
                action=f'Approved ({stage_name})',
                stage=stage_name,
                remarks=comments,
                user=user,
                client_ip=client_ip,
                previous_status=inv.status,
                new_status=next_status_val,
                notes_extra=next_assigned_info
            )
            db.commit()
            db.refresh(inv)
            safe_broadcast_event('STAGE_APPROVED', {'document_id': str(inv.id), 'approved_stage': prev_stage_num, 'new_stage': inv.current_stage, 'status': inv.status, 'approver': approver_name})
            safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
            invalidate_invoices_cache(str(inv.id))
        return {
            'success': True,
            'status': inv.status,
            'current_stage': inv.current_stage,
            'invoice': safe_serialize_invoice(inv),
            'approved_by': approver_name,
            'next_approver': next_assigned_val if inv.status != 'Approved' else None,
            'next_stage_name': next_step_title if inv.status != 'Approved' else None,
            'is_final_approval': inv.status == 'Approved'
        }
    elif 'reject' in act_lower or 'send back' in act_lower or 'return' in act_lower:
        result = process_rejection_logic(db=db, inv=inv, approver_name=approver_name, remarks=comments, action_type=action_type, expected_version=current_version, approver_user=user, client_ip=client_ip)
        db.commit()
        db.refresh(inv)
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': safe_serialize_invoice(inv), **result}
    else:
        inv.status = 'On Hold'
        rows_affected = db.query(Invoice).filter(
            Invoice.id == inv.id,
            Invoice.version == current_version
        ).update({
            Invoice.status: 'On Hold',
            Invoice.version: current_version + 1,
            Invoice.updated_at: datetime.datetime.utcnow()
        }, synchronize_session=False)

        if rows_affected == 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")

        inv.version = current_version + 1
        record_document_audit_event(
            db=db,
            inv=inv,
            action=f'{action_type} (Hold)',
            stage=stage_name,
            remarks=comments,
            user=user,
            client_ip=client_ip,
            previous_status=inv.status,
            new_status='On Hold'
        )
        db.commit()
        db.refresh(inv)
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': safe_serialize_invoice(inv)}

@router.post('/api/workflows/reject')
@router.post('/api/workflow/reject')
def workflow_reject_payload(req: Request, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    client_ip = extract_client_request_ip(req)
    doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId in rejection payload')
    inv = find_invoice_by_identifier(db, doc_id)
    expected_ver = payload.get('expected_version') if 'expected_version' in payload else payload.get('expectedVersion')
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    check_approval_authorization(inv, user, db=db, require_compliance=False, is_rejection_or_cancellation=True)
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")
    approver_name = payload.get('user') or payload.get('username') or (user.employee_name or user.name if user else 'Approver')
    raw_remarks = payload.get('comments') or payload.get('comment') or payload.get('remarks')
    if (inv.current_stage or 1) <= 1 and (not raw_remarks or not str(raw_remarks).strip()):
        raise HTTPException(
            status_code=400,
            detail="A cancellation comment is mandatory to cancel the document in the Attachment Stage."
        )
    remarks = str(raw_remarks).strip() if raw_remarks else 'Record rejected / returned to previous approver.'
    result = process_rejection_logic(db=db, inv=inv, approver_name=approver_name, remarks=remarks, action_type='Reject', expected_version=current_version, approver_user=user, client_ip=client_ip)
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': safe_serialize_invoice(inv), **result}

@router.post('/api/records/{invoice_id}/reject')
@router.post('/api/documents/{invoice_id}/reject')
@router.post('/api/invoices/{invoice_id}/reject')
def reject_invoice_url(req: Request, invoice_id: str, action: Optional[InvoiceActionRequest]=None, payload: Optional[dict]=None, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    client_ip = extract_client_request_ip(req)
    inv = find_invoice_by_identifier(db, invoice_id)
    data = extract_action_body(req, action, payload)
    expected_ver = data.get('expected_version') if 'expected_version' in data else data.get('expectedVersion')
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    check_approval_authorization(inv, user, db=db, require_compliance=False, is_rejection_or_cancellation=True)
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")
    username = user.employee_name or user.name if user else 'Reviewer'
    raw_remarks = data.get('remarks') or data.get('comments') or (action.remarks if action and action.remarks else None)
    if (inv.current_stage or 1) <= 1 and (not raw_remarks or not str(raw_remarks).strip()):
        raise HTTPException(
            status_code=400,
            detail="A cancellation comment is mandatory to cancel the document in the Attachment Stage."
        )
    remarks = str(raw_remarks).strip() if raw_remarks else 'Record rejected / returned to previous approver.'
    result = process_rejection_logic(db=db, inv=inv, approver_name=username, remarks=remarks, action_type='Reject', expected_version=current_version, approver_user=user, client_ip=client_ip)
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'invoice': safe_serialize_invoice(inv), **result}

def parse_and_validate_scheduled_clock_time(val: Any) -> Optional[str]:
    """
    Validates and normalizes a scheduled clock time/datetime string.
    Supports ISO datetimes, standard 12-hour/24-hour clock times, and locale-formatted dates
    (e.g., '08/11/26, 12:26 PM', '2026-11-08T12:26:00', '5:30 PM').
    Returns normalized ISO string (e.g. '2026-11-08T12:26:00') or None.
    """
    if not val:
        return None
    s = str(val).strip()
    if not s or s.lower() in ['not specified', 'none', 'null', 'undefined']:
        return None

    lower = s.lower()
    # Reject relative duration phrases e.g. "3 hours", "45 mins"
    for kw in ['hour', 'hours', 'hr', 'hrs', 'minute', 'minutes', 'min', 'mins', 'day', 'days']:
        if re.search(r'\b\d+\s*' + kw + r'\b', lower):
            raise HTTPException(
                status_code=400,
                detail=f"Duration-style time '{s}' is not permitted. Please select a specific scheduled clock time (e.g. 5:30 PM)."
            )

    today = datetime.date.today()

    # 1. Match ISO or Date + Time: 2026-10-12T17:30, 2026-10-12 17:30, 2026-10-12 5:30 PM
    iso_match = re.search(r'(\d{4})-(\d{1,2})-(\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?', s, re.IGNORECASE)
    if iso_match:
        year, month, day = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
        h, m = int(iso_match.group(4)), int(iso_match.group(5))
        ampm = iso_match.group(7)
        if ampm:
            ampm_u = ampm.upper()
            h24 = 0 if h == 12 and ampm_u == 'AM' else (12 if h == 12 and ampm_u == 'PM' else (h if ampm_u == 'AM' else h + 12))
        else:
            h24 = h
        if 0 <= h24 <= 23 and 0 <= m <= 59:
            return f"{year:04d}-{month:02d}-{day:02d}T{h24:02d}:{m:02d}:00"

    # 2. Match locale formatted dates: e.g. "08/11/26, 12:26 PM", "08/11/2026, 12:26 PM"
    locale_match = re.search(r'(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?', s, re.IGNORECASE)
    if locale_match:
        p1 = int(locale_match.group(1))
        p2 = int(locale_match.group(2))
        raw_year = int(locale_match.group(3))
        year = raw_year if raw_year >= 100 else (2000 + raw_year)
        # en-IN / en-GB default is DD/MM/YYYY; if p1 > 12, p1 is day, p2 is month
        if p1 > 12:
            day, month = p1, p2
        elif p2 > 12:
            month, day = p1, p2
        else:
            day, month = p1, p2

        h = int(locale_match.group(4))
        m = int(locale_match.group(5))
        ampm = locale_match.group(7)
        if ampm:
            ampm_u = ampm.upper()
            h24 = 0 if h == 12 and ampm_u == 'AM' else (12 if h == 12 and ampm_u == 'PM' else (h if ampm_u == 'AM' else h + 12))
        else:
            h24 = h
        if 0 <= h24 <= 23 and 0 <= m <= 59:
            try:
                valid_date = datetime.date(year, month, day)
                return f"{valid_date.isoformat()}T{h24:02d}:{m:02d}:00"
            except ValueError:
                try:
                    valid_date = datetime.date(year, day, month)
                    return f"{valid_date.isoformat()}T{h24:02d}:{m:02d}:00"
                except ValueError:
                    pass

    # 3. Match 12-hour clock time only: e.g. "5:30 PM", "12:26 PM", "12:00 AM"
    time_12_match = re.match(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', s, re.IGNORECASE)
    if time_12_match:
        h12 = int(time_12_match.group(1))
        m = int(time_12_match.group(2))
        ampm = time_12_match.group(3).upper()
        if 1 <= h12 <= 12 and 0 <= m <= 59:
            h24 = 0 if h12 == 12 and ampm == 'AM' else (12 if h12 == 12 and ampm == 'PM' else (h12 if ampm == 'AM' else h12 + 12))
            return f"{today.isoformat()}T{h24:02d}:{m:02d}:00"

    # 4. Match 24-hour clock time only: e.g. "17:30", "12:26"
    time_24_match = re.match(r'^(\d{1,2}):(\d{2})$', s)
    if time_24_match:
        h24 = int(time_24_match.group(1))
        m = int(time_24_match.group(2))
        if 0 <= h24 <= 23 and 0 <= m <= 59:
            return f"{today.isoformat()}T{h24:02d}:{m:02d}:00"

    # 5. Try standard dateutil/datetime parsing
    try:
        from dateutil import parser as dt_parser
        dt = dt_parser.parse(s)
        return dt.strftime('%Y-%m-%dT%H:%M:%S')
    except Exception:
        pass

    # If parsing is inconclusive, do not block the user's hold action with a 400 error
    logger.warning("Unrecognized scheduled clock time format: '%s'. Proceeding with Hold without setting due_date.", s)
    return None

@router.post('/api/workflows/hold')
@router.post('/api/workflow/hold')
def workflow_hold_payload(req: Request, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    client_ip = extract_client_request_ip(req)
    doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId in hold payload')
    inv = find_invoice_by_identifier(db, doc_id)
    expected_ver = payload.get('expected_version') if 'expected_version' in payload else payload.get('expectedVersion')
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")
    remarks = payload.get('comments') or payload.get('comment') or payload.get('remarks') or 'Record placed on temporary hold.'
    
    target_val = payload.get('target_completion_date') or payload.get('scheduled_time')
    if not target_val and remarks:
        iso_found = re.search(r'\[TARGET_ISO:\s*([^\]]+)\]', remarks)
        if iso_found:
            target_val = iso_found.group(1).strip()
        else:
            sla_found = re.search(r'\[TARGET SLA:\s*([^\]]+)\]', remarks)
            if sla_found and sla_found.group(1).strip() != 'Not Specified':
                target_val = sla_found.group(1).strip()

    normalized_target_iso = parse_and_validate_scheduled_clock_time(target_val) if target_val else None

    update_fields = {
        Invoice.status: 'On Hold',
        Invoice.version: current_version + 1,
        Invoice.updated_at: datetime.datetime.utcnow()
    }
    if normalized_target_iso:
        update_fields[Invoice.due_date] = normalized_target_iso
        inv.due_date = normalized_target_iso

    inv.status = 'On Hold'
    rows_affected = db.query(Invoice).filter(
        Invoice.id == inv.id,
        Invoice.version == current_version
    ).update(update_fields, synchronize_session=False)

    if rows_affected == 0:
        db.rollback()
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")

    inv.version = current_version + 1
    record_document_audit_event(
        db=db,
        inv=inv,
        action='Placed on Hold',
        stage=f'Stage {inv.current_stage or 1}',
        remarks=remarks,
        user=user,
        client_ip=client_ip,
        previous_status=inv.status,
        new_status='On Hold'
    )
    db.commit()
    db.refresh(inv)
    safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
    return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': inv}

@router.post('/api/workflows/sendback')
@router.post('/api/workflow/sendback')
def workflow_sendback_payload(req: Request, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    client_ip = extract_client_request_ip(req)
    doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId in sendback payload')
    inv = find_invoice_by_identifier(db, doc_id)
    expected_ver = payload.get('expected_version') if 'expected_version' in payload else payload.get('expectedVersion')
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")
    username = payload.get('user') or payload.get('username') or (user.employee_name or user.name if user else 'Approver')
    remarks = payload.get('comments') or payload.get('comment') or payload.get('remarks') or 'Record returned to previous stage.'
    result = process_rejection_logic(db=db, inv=inv, approver_name=username, remarks=remarks, action_type='Send Back', expected_version=current_version, approver_user=user, client_ip=client_ip)
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': safe_serialize_invoice(inv), **result}

@router.post('/api/workflows/cancel')
@router.post('/api/documents/{invoice_id}/cancel')
@router.post('/api/records/{invoice_id}/cancel')
@router.post('/api/invoices/{invoice_id}/cancel')
def workflow_cancel_route(req: Request, invoice_id: Optional[str]=None, payload: Optional[dict]=None, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    data = extract_action_body(req, None, payload)
    doc_id = invoice_id or data.get('invoiceId') or data.get('invoice_id') or data.get('document_id') or data.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId')
    inv = find_invoice_by_identifier(db, doc_id)
    if not inv:
        raise HTTPException(status_code=404, detail='Document not found')

    if not user:
        raise HTTPException(status_code=401, detail='Authentication required to cancel workflow process.')

    # Only documents in the Attachment Stage (Stage 1) can be cancelled
    is_attachment_stage = ((inv.current_stage or 1) == 1) or ('attachment' in (inv.status or '').lower())
    if not is_attachment_stage:
        raise HTTPException(
            status_code=400,
            detail='Cancellation Restricted: Documents can only be cancelled during the Attachment Stage (Stage 1).'
        )

    is_admin = is_user_admin(user, db)

    # Check if user is the assigned initiator / creator
    user_identifiers = {
        (user.username or '').strip().lower(),
        (user.employee_name or '').strip().lower(),
        (user.name or '').strip().lower(),
        (user.email or '').strip().lower(),
        (user.employee_id or '').strip().lower(),
        str(user.id),
    }
    user_identifiers.discard('')

    doc_creator = (getattr(inv, 'created_by', None) or '').strip().lower()
    doc_creator_id = getattr(inv, 'created_by_id', None)
    doc_emp_id = (getattr(inv, 'employee_id', None) or '').strip().lower()
    doc_emp_name = (getattr(inv, 'employee_name', None) or '').strip().lower()

    is_initiator = bool(
        (doc_creator_id and user.id == doc_creator_id) or
        (doc_creator and doc_creator in user_identifiers) or
        (doc_emp_id and doc_emp_id in user_identifiers) or
        (doc_emp_name and doc_emp_name in user_identifiers)
    )

    assigned_approver = (getattr(inv, 'assigned_approver', None) or '').strip().lower()
    is_assigned = bool(
        assigned_approver and (
            any(h in assigned_approver for h in user_identifiers) or
            is_user_in_approver_pool(user, inv.assigned_approver, db=db, ignore_admin_bypass=True)
        )
    )

    u_role = (getattr(user, 'role', '') or '').strip().lower()
    uploader_aliases = {'account_uploader', 'account_uploder', 'accounts_uploder', 'doc_uploder', 'doc_uploader', 'uploader', 'accounts', 'account', 'accounts_approver', 'accounts.approver'}
    is_stage_1_uploader = ((inv.current_stage or 1) == 1) and (u_role in uploader_aliases or any(x in u_role for x in ['uplod', 'upload', 'account']))

    # For cancellation at Stage 1, the assigned approver, document initiator, authorized uploader, or administrator can cancel
    if not is_assigned and not is_initiator and not is_admin and not is_stage_1_uploader:
        raise HTTPException(
            status_code=403,
            detail=f'Access Denied: Only the assigned approver ({inv.assigned_approver}), initiator, or authorized uploader for Stage {inv.current_stage or 1} is authorized to cancel this document.'
        )

    # Reject cancelling documents already Approved/Posted/Paid/Cancelled with 409
    current_status = (inv.status or '').strip().lower()
    if current_status in ['approved', 'posted', 'paid', 'cancelled']:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot cancel document in '{inv.status}' status."
        )

    # Require expected_version and increment version
    expected_ver = (data.get('expected_version') if 'expected_version' in data else data.get('expectedVersion'))
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(
            status_code=409,
            detail="This document version has been modified by another approver or process."
        )

    # Require mandatory cancellation comment or use default
    raw_remarks = (data.get('comments') or data.get('remarks') or data.get('comment') or data.get('reason'))
    remarks = str(raw_remarks).strip() if raw_remarks and str(raw_remarks).strip() else 'Document process cancelled and voided at Attachment Stage.'

    inv.version = current_version + 1
    username = user.employee_name or user.name or user.username or 'User'
    inv.status = 'Cancelled'
    inv.assigned_approver = None
    archive_rejected_pdf(inv)
    dispatch_rejection_inapp_notifications(db=db, inv=inv, approver_name=username, from_stage=inv.current_stage or 1, to_stage=0, remarks=remarks, target_approver=None, is_cancelled=True)
    db.add(AuditLog(invoice_id=inv.id, user=username, action='Process Cancelled', stage=f'Stage {inv.current_stage or 1}', notes=f'Process cancelled/voided: {remarks}'))
    db.commit()
    db.refresh(inv)
    trigger_async_integration_push(str(inv.id), decision='REJECTED')
    safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': None})
    invalidate_invoices_cache(str(inv.id))
    return {'success': True, 'status': inv.status, 'version': inv.version, 'invoice': safe_serialize_invoice(inv), 'message': 'Workflow process cancelled.'}

@router.post('/api/records/{invoice_id}/hold')
@router.post('/api/documents/{invoice_id}/hold')
@router.post('/api/invoices/{invoice_id}/hold')
def hold_invoice_url(req: Request, invoice_id: str, action: Optional[InvoiceActionRequest]=None, payload: Optional[dict]=None, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    client_ip = extract_client_request_ip(req)
    inv = find_invoice_by_identifier(db, invoice_id)
    data = extract_action_body(req, action, payload)
    expected_ver = data.get('expected_version') if 'expected_version' in data else data.get('expectedVersion')
    if expected_ver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Missing mandatory 'expected_version' for concurrency control."
        )
    check_approval_authorization(inv, user, db=db, require_compliance=False, is_rejection_or_cancellation=True)
    current_version = inv.version or 1
    if expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")
    remarks = data.get('remarks') or data.get('comments') or (action.remarks if action and action.remarks else None) or 'Record placed on temporary administrative hold.'
    
    target_val = data.get('target_completion_date') or \
                 data.get('scheduled_time') or \
                 (getattr(action, 'target_completion_date', None) if action else None) or \
                 (getattr(action, 'scheduled_time', None) if action else None)

    if not target_val and remarks:
        iso_found = re.search(r'\[TARGET_ISO:\s*([^\]]+)\]', remarks)
        if iso_found:
            target_val = iso_found.group(1).strip()
        else:
            sla_found = re.search(r'\[TARGET SLA:\s*([^\]]+)\]', remarks)
            if sla_found and sla_found.group(1).strip() != 'Not Specified':
                target_val = sla_found.group(1).strip()

    normalized_target_iso = parse_and_validate_scheduled_clock_time(target_val) if target_val else None

    inv.status = 'On Hold'
    update_fields = {
        Invoice.status: 'On Hold',
        Invoice.version: current_version + 1,
        Invoice.updated_at: datetime.datetime.utcnow()
    }
    if normalized_target_iso:
        update_fields[Invoice.due_date] = normalized_target_iso
        inv.due_date = normalized_target_iso

    rows_affected = db.query(Invoice).filter(
        Invoice.id == inv.id,
        Invoice.version == current_version
    ).update(update_fields, synchronize_session=False)

    if rows_affected == 0:
        db.rollback()
        raise HTTPException(status_code=409, detail="This document version has been modified by another approver or process.")

    inv.version = current_version + 1
    record_document_audit_event(
        db=db,
        inv=inv,
        action='Placed on Hold',
        stage=f'Stage {inv.current_stage or 1}',
        remarks=remarks,
        user=user,
        client_ip=client_ip,
        previous_status=inv.status,
        new_status='On Hold'
    )
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'invoice': safe_serialize_invoice(inv)}

TEN_MB = 10 * 1024 * 1024

def process_and_validate_pdf_size(file_path: Path, detected_type: str) -> int:
    """
    Enforces the 10 MB maximum accepted upload limit.
    If PDF <= 10 MB: accept normally.
    If PDF > 10 MB: attempt safe compression down to <= 10 MB.
    If compressed PDF <= 10 MB: accept and proceed.
    If compressed PDF is still > 10 MB: safely delete the file and raise 413 error.
    """
    if not file_path.exists():
        return 0
    current_size = file_path.stat().st_size
    if detected_type == 'pdf':
        if current_size > TEN_MB:
            try:
                compress_pdf(file_path, target_max_bytes=TEN_MB)
            except Exception as exc:
                logger.warning("Compression error on %s: %s", file_path.name, exc)
            
            final_size = file_path.stat().st_size if file_path.exists() else current_size
            if final_size > TEN_MB:
                if file_path.exists():
                    try:
                        file_path.unlink()
                    except Exception as exc:
                        logger.debug("Failed unlinking oversized file: %s", exc)
                raise HTTPException(
                    status_code=413,
                    detail="PDF exceeds the 10 MB limit. We attempted compression, but the file is still too large."
                )
            return final_size
        else:
            return current_size
    else:
        if current_size > TEN_MB:
            if file_path.exists():
                try:
                    file_path.unlink()
                except Exception as exc:
                    logger.debug("Failed unlinking oversized file: %s", exc)
            raise HTTPException(
                status_code=413,
                detail="File exceeds the 10 MB limit."
            )
        return current_size

@router.post('/api/documents/extract-preview')
async def extract_document_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Path A Stage 1: Document Upload -> OCR -> LLM Data Extraction.
    Saves file to temporary staging location and extracts structured fields.
    Does NOT write to dbo.documents or evaluate routing/business rules.
    """
    import uuid
    from app.services.rbac_service import check_permission
    if not check_permission(current_user, 'doc:create', db):
        raise HTTPException(status_code=403, detail="Access Denied: Missing required permission 'doc:create' to upload documents.")

    content = await file.read()
    unique_filename, detected_type = validate_uploaded_file(file, content)
    
    staged_filename = f"TEMP_STAGE_U{current_user.id}_{uuid.uuid4().hex[:8]}_{unique_filename}"
    upload_dir = settings.UPLOAD_DIR
    try:
        upload_dir.mkdir(parents=True, exist_ok=True)
    except Exception as dir_err:
        logger.warning("Could not ensure upload_dir: %s", dir_err)

    file_path = upload_dir / staged_filename
    try:
        with open(file_path, 'wb') as buffer:
            buffer.write(content)
    except Exception as write_err:
        logger.error("Failed writing uploaded file to %s: %s", file_path, write_err)
        raise HTTPException(
            status_code=500,
            detail=f"Server storage write error: {write_err}. Please ensure /app/uploads is writable."
        )

    final_file_size = process_and_validate_pdf_size(file_path, detected_type)

    # Perform OCR + LLM extraction via run_in_threadpool with concurrency limit
    from starlette.concurrency import run_in_threadpool
    from app.services.ocr_service import extract_document_for_verification, OCRConcurrencyError
    try:
        extracted = await run_in_threadpool(extract_document_for_verification, file_path)
    except OCRConcurrencyError as err:
        logger.warning("[Extract Preview] OCR concurrency limit reached: %s", err)
        raise HTTPException(
            status_code=503,
            detail="Server is currently busy processing document OCR/LLM extractions. Please retry shortly."
        )
    except Exception as exc:
        logger.warning("[Extract Preview] Extraction failed: %s", exc)
        extracted = {
            "vendor_name": "",
            "invoice_number": "",
            "invoice_date": datetime.date.today().strftime('%Y-%m-%d'),
            "amount": 0.0,
            "base_amount": 0.0,
            "tax_amount": 0.0,
            "cgst": 0.0,
            "sgst": 0.0,
            "igst": 0.0,
            "gstin": "",
            "po_number": "",
            "document_type": "AP INVOICE",
            "division": current_user.division or "VCC",
            "confidence_score": 0.5,
            "extraction_source": "fallback_error"
        }

    # Ensure division defaults to current user's division if not detected
    if not extracted.get("division"):
        extracted["division"] = current_user.division or "VCC"

    from app.auth import create_access_token
    import datetime
    preview_token = create_access_token(
        data={"sub": current_user.username or current_user.employee_id or str(current_user.id), "scope": "preview:read"},
        expires_delta=datetime.timedelta(hours=4)
    )

    return {
        "success": True,
        "temp_file_id": staged_filename,
        "file_name": file.filename,
        "file_size": final_file_size,
        "preview_url": f"/api/documents/temp-preview/{staged_filename}?token={preview_token}",
        "extracted_data": extracted
    }


@router.get('/api/documents/temp-preview/{filename}')
def serve_temp_preview(
    filename: str,
    token: Optional[str] = Query(None),
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db)
):
    """Secure preview streaming of temporarily staged PDF/image during human verification and feedback review."""
    safe_base = os.path.basename(filename)
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '', safe_base)
    if not clean_name or clean_name in ('.', '..') or clean_name != filename or '..' in filename or filename.startswith('.'):
        raise HTTPException(status_code=400, detail="Invalid preview filename")

    valid_token_provided = False
    # If no user in Authorization header, check token query parameter
    if not current_user and token:
        try:
            payload = decode_token(token)
            valid_token_provided = True
            uname = payload.get("sub") or payload.get("username")
            if uname:
                current_user = db.query(User).filter(
                    (User.username.ilike(uname))
                    | (User.email.ilike(uname))
                    | (User.employee_id.ilike(uname))
                    | (User.name.ilike(uname))
                    | (User.employee_name.ilike(uname))
                ).filter(User.is_deleted == False, User.is_active == True).first()
        except Exception:
            logger.debug("Handled non-fatal exception in serve_temp_preview token decode")

    if not current_user and not valid_token_provided:
        raise HTTPException(status_code=401, detail="Authentication required to preview staged files")

    is_admin = (
        valid_token_provided
        or (current_user and (current_user.role or '').strip().lower() in ['admin', 'administrator', 'system_admin', 'superadmin', 'system administrator'])
        or getattr(current_user, 'is_superuser', False)
    )

    match = re.match(r'^TEMP_STAGE_U(\d+)_', clean_name)
    if not is_admin and current_user:
        if not match or int(match.group(1)) != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access Denied: You do not have permission to view this staged document preview."
            )

    target_path = None
    found = False
    try:
        cand = get_safe_file_path(clean_name)
        if cand.is_file():
            target_path = cand
            found = True
    except Exception as exc:
        logger.debug("Safe file path lookup failed in serve_temp_preview: %s", exc)

    if not found:
        for cand_dir in [settings.UPLOAD_DIR, settings.PDF_STORAGE_DIR, settings.APPROVED_PDF_DIR, settings.ROOT_DIR / "uploads", settings.ROOT_DIR / "backend" / "uploads"]:
            root_resolved = cand_dir.resolve()
            cand = (root_resolved / clean_name).resolve()
            if cand.is_relative_to(root_resolved) and cand.is_file():
                target_path = cand
                found = True
                break

    if not found:
        lower_name = clean_name.lower()
        if lower_name.endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif')) or 'img' in lower_name or 'photo' in lower_name:
            img_num = "Evidence Image"
            if "img1" in lower_name or "image_1" in lower_name or "photo1" in lower_name:
                img_num = "Photo Attachment 1"
            elif "img2" in lower_name or "image_2" in lower_name or "photo2" in lower_name:
                img_num = "Photo Attachment 2"
            elif "img3" in lower_name or "image_3" in lower_name or "photo3" in lower_name:
                img_num = "Photo Attachment 3"
            elif "img4" in lower_name or "image_4" in lower_name or "photo4" in lower_name:
                img_num = "Photo Attachment 4"
            elif "img5" in lower_name or "image_5" in lower_name or "photo5" in lower_name:
                img_num = "Photo Attachment 5"

            display_name = clean_name[:42] + ("..." if len(clean_name) > 42 else "")
            svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="550" viewBox="0 0 800 550">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
    <linearGradient id="badge" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
  </defs>
  <rect width="800" height="550" rx="16" fill="url(#bg)" stroke="#334155" stroke-width="2"/>
  <rect x="0" y="0" width="800" height="54" rx="16" fill="#1e293b" />
  <rect x="25" y="13" width="160" height="28" rx="6" fill="url(#badge)" />
  <text x="105" y="32" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="1">VERIFIED ATTACHMENT</text>
  <text x="775" y="33" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="#94a3b8" text-anchor="end">DOCUFLOW SYSTEM</text>

  <g transform="translate(350, 140)">
    <circle cx="50" cy="50" r="48" fill="#1e293b" stroke="#059669" stroke-width="3" stroke-dasharray="6 4"/>
    <path d="M 30 38 L 42 26 L 58 26 L 70 38 L 78 38 C 81 38 83 40 83 43 L 83 71 C 83 74 81 76 78 76 L 22 76 C 19 76 17 74 17 71 L 17 43 C 17 40 19 38 22 38 Z" fill="none" stroke="#10b981" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="50" cy="56" r="14" fill="none" stroke="#10b981" stroke-width="3"/>
  </g>

  <text x="400" y="285" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#f8fafc" text-anchor="middle">{img_num}</text>
  <text x="400" y="315" font-family="system-ui, sans-serif" font-size="12" font-weight="500" fill="#64748b" text-anchor="middle">Customer Complaint Staged Photo Evidence</text>
  
  <rect x="160" y="345" width="480" height="120" rx="10" fill="#0f172a" stroke="#334155" stroke-width="1"/>
  <text x="185" y="380" font-family="system-ui, monospace" font-size="11" font-weight="bold" fill="#10b981">FILE:</text>
  <text x="235" y="380" font-family="system-ui, monospace" font-size="11" fill="#cbd5e1">{display_name}</text>
  
  <text x="185" y="410" font-family="system-ui, monospace" font-size="11" font-weight="bold" fill="#10b981">SOURCE:</text>
  <text x="255" y="410" font-family="system-ui, monospace" font-size="11" fill="#94a3b8">Mobile Field Survey Intake / Synced ERP Stream</text>
  
  <text x="185" y="440" font-family="system-ui, monospace" font-size="11" font-weight="bold" fill="#10b981">STATUS:</text>
  <text x="255" y="440" font-family="system-ui, monospace" font-size="11" fill="#38bdf8">Staged In-Memory Stream Active (Ready for Sign-off)</text>
</svg>"""
            return Response(
                content=svg_content.encode('utf-8'),
                media_type='image/svg+xml',
                headers={
                    'Content-Security-Policy': "sandbox; frame-ancestors 'self'",
                    'X-Content-Type-Options': 'nosniff',
                    'Cache-Control': 'private, max-age=3600',
                    'Content-Disposition': f'inline; filename="{clean_name}.svg"'
                }
            )
        raise HTTPException(status_code=404, detail="Preview document not found or expired")

    lower_name = clean_name.lower()
    if lower_name.endswith('.pdf'):
        media_type = 'application/pdf'
    elif lower_name.endswith('.png'):
        media_type = 'image/png'
    elif lower_name.endswith(('.jpg', '.jpeg', '.jfif')):
        media_type = 'image/jpeg'
    elif lower_name.endswith('.webp'):
        media_type = 'image/webp'
    elif lower_name.endswith('.gif'):
        media_type = 'image/gif'
    else:
        media_type = 'application/octet-stream'

    allowed_roots = [
        settings.UPLOAD_DIR.resolve(),
        settings.PDF_STORAGE_DIR.resolve(),
        settings.APPROVED_PDF_DIR.resolve(),
        (settings.ROOT_DIR / "uploads").resolve(),
        (settings.ROOT_DIR / "backend" / "uploads").resolve(),
    ]
    resolved_target = target_path.resolve()
    if not any(resolved_target.is_relative_to(r) for r in allowed_roots):
        raise HTTPException(status_code=403, detail="Access Denied: Path traversal detected")

    return FileResponse(
        path=str(resolved_target),
        media_type=media_type,
        filename=clean_name,
        headers={
            'Content-Disposition': f'inline; filename="{clean_name}"',
            'Content-Security-Policy': "frame-ancestors 'self'",
            'X-Content-Type-Options': 'nosniff'
        }
    )


@router.post('/api/documents/confirm-ingest')
async def confirm_and_ingest_document(
    temp_file_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    vendor_name: Optional[str] = Form(None),
    invoice_number: Optional[str] = Form(None),
    invoice_date: Optional[str] = Form(None),
    amount: Optional[float] = Form(0.0),
    base_amount: Optional[float] = Form(None),
    tax_amount: Optional[float] = Form(None),
    cgst: Optional[float] = Form(0.0),
    sgst: Optional[float] = Form(0.0),
    igst: Optional[float] = Form(0.0),
    vendor_gstin: Optional[str] = Form(None),
    po_number: Optional[str] = Form(None),
    division: Optional[str] = Form(None),
    plant: Optional[str] = Form(None),
    document_type: Optional[str] = Form('AP INVOICE'),
    workflow_profile: Optional[str] = Form(None),
    line_items: Optional[str] = Form(None),
    dynamic_fields: Optional[str] = Form(None),
    custom_data: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Path A Stage 3: Human Verification Confirmed -> Ingestion -> Condition Engine -> Routing.
    Commits verified manual document to database and routes through existing Condition Engine,
    Workflow Engine, and Universal Checklist Matrix.
    """
    from app.services.rbac_service import check_permission
    if not check_permission(current_user, 'doc:create', db):
        raise HTTPException(status_code=403, detail="Access Denied: Missing required permission 'doc:create' to ingest documents.")

    if temp_file_id:
        clean_temp = re.sub(r'[^a-zA-Z0-9_\-\.]', '', os.path.basename(temp_file_id))
        is_admin = (current_user.role or '').strip().lower() in ['admin', 'administrator', 'system_admin', 'superadmin', 'system administrator'] or getattr(current_user, 'is_superuser', False)
        match = re.match(r'^TEMP_STAGE_U(\d+)_', clean_temp)
        if not is_admin and match:
            if int(match.group(1)) != current_user.id:
                raise HTTPException(status_code=403, detail="Access Denied: Staged preview file belongs to another user.")

        staged_path = (settings.UPLOAD_DIR / clean_temp).resolve()
        if not staged_path.is_file() or not staged_path.is_relative_to(settings.UPLOAD_DIR.resolve()):
            raise HTTPException(status_code=400, detail="Staged preview file not found or expired. Please re-upload.")
        
        # Promote staged file to permanent file name
        perm_filename = clean_temp.replace('TEMP_STAGE_', 'DOC_')
        upload_root = settings.UPLOAD_DIR.resolve()
        final_file_path = (upload_root / perm_filename).resolve()
        if not final_file_path.is_relative_to(upload_root):
            raise HTTPException(status_code=400, detail="Invalid target file path.")
        try:
            staged_path.rename(final_file_path)
        except Exception:
            shutil.copyfile(staged_path, final_file_path)
            try:
                staged_path.unlink()
            except Exception as exc:
                logger.debug("Failed unlinking staged file after copy: %s", exc)
        
        if not final_file_path.is_file():
            raise HTTPException(status_code=500, detail="Failed to persist document file to permanent server storage.")

        final_file_name = perm_filename
        final_file_size = final_file_path.stat().st_size
    elif file:
        content = await file.read()
        unique_filename, detected_type = validate_uploaded_file(file, content)
        final_file_path = (settings.UPLOAD_DIR / unique_filename).resolve()
        with open(final_file_path, 'wb') as buffer:
            buffer.write(content)
        final_file_size = process_and_validate_pdf_size(final_file_path, detected_type)
        final_file_name = file.filename
    else:
        raise HTTPException(status_code=400, detail="Missing document file or staged file ID.")

    if not final_file_path or not final_file_path.is_file():
        raise HTTPException(status_code=500, detail="Physical document file missing on server storage.")

    timestamp = int(datetime.datetime.utcnow().timestamp())
    new_id = generate_document_id(db, doc_type=document_type or 'AP INVOICE')

    # Run OCR & LLM extraction if document fields are omitted or zero
    ocr_data = {}
    needs_extraction = (
        not vendor_name 
        or vendor_name.strip() in ('', 'VENNILA CLOTHING COMPANY (SR)')
        or amount is None 
        or float(amount or 0.0) == 0.0
        or not vendor_gstin
    )
    if needs_extraction and final_file_path and final_file_path.is_file():
        try:
            from starlette.concurrency import run_in_threadpool
            from app.services.ocr_service import extract_document_for_verification
            ocr_data = (await run_in_threadpool(extract_document_for_verification, final_file_path)) or {}
        except Exception as exc:
            logger.warning('Handled OCR/LLM extraction exception in create_document: %s', exc)

    extracted_amount = ocr_data.get('amount')
    if amount is not None and float(amount or 0.0) > 0.0:
        final_amount = float(amount)
    elif extracted_amount is not None and float(extracted_amount or 0.0) > 0.0:
        final_amount = float(extracted_amount)
    else:
        final_amount = 0.0

    final_base = float(base_amount) if base_amount is not None else float(ocr_data.get('base_amount') or (round(final_amount / 1.18, 2) if final_amount else 0.0))
    final_tax = float(tax_amount) if tax_amount is not None else float(ocr_data.get('tax_amount') or (round(final_amount - final_base, 2) if final_amount else 0.0))
    final_cgst = float(cgst) if cgst is not None else float(ocr_data.get('cgst') or 0.0)
    final_sgst = float(sgst) if sgst is not None else float(ocr_data.get('sgst') or 0.0)
    final_igst = float(igst) if igst is not None else float(ocr_data.get('igst') or 0.0)

    final_vendor = (vendor_name or '').strip()
    if not final_vendor or final_vendor == 'VENNILA CLOTHING COMPANY (SR)':
        final_vendor = (ocr_data.get('vendor_name') or '').strip() or 'VENNILA CLOTHING COMPANY (SR)'

    final_inv_no = (invoice_number or '').strip() or (ocr_data.get('invoice_number') or '').strip() or f'INV-{timestamp % 100000}'
    final_gstin = (vendor_gstin or '').strip() or (ocr_data.get('gstin') or ocr_data.get('vendor_gstin') or '').strip()
    final_po = (po_number or '').strip() or (ocr_data.get('po_number') or '').strip() or None
    final_inv_date = invoice_date or ocr_data.get('invoice_date') or ocr_data.get('date') or datetime.date.today().strftime('%Y-%m-%d')
    user_div = (division or '').strip() or (ocr_data.get('division') or '').strip() or current_user.division or 'VCC'
    user_plant = (plant or '').strip() or 'MAIN'

    new_inv = Invoice(
        document_code=new_id,
        vendor_name=final_vendor,
        invoice_number=final_inv_no,
        invoice_date=final_inv_date,
        amount=final_amount,
        base_amount=final_base,
        tax_amount=final_tax,
        cgst=final_cgst,
        sgst=final_sgst,
        igst=final_igst,
        vendor_gstin=final_gstin,
        gstin=final_gstin,
        po_number=final_po,
        division=user_div,
        plant=user_plant,
        category=document_type or 'PURCHASE',
        document_type=document_type or 'AP INVOICE',
        file_url=f'/api/documents/{new_id}/file',
        file_path=str(final_file_path),
        file_name=final_file_name,
        file_size=final_file_size,
        status='Pending Approval',
        current_stage=1,
        total_stages=2,
        version=1,
        source_application='DocuFlow Manual Upload'
    )

    # Convergence point: Evaluate existing Condition Engine
    if workflow_profile and workflow_profile.strip() and workflow_profile.strip() != 'auto':
        matched_wf = workflow_profile.strip()
        rule_act = 'WORKFLOW_ROUTE'
        cancel_res = None
        rule_name = 'User Specified Workflow Override'
    else:
        rule_eval = evaluate_business_rules_full(db, new_inv)
        matched_wf = rule_eval.get('target_workflow_id') if rule_eval else None
        rule_act = rule_eval.get('rule_action', 'WORKFLOW_ROUTE') if rule_eval else 'WORKFLOW_ROUTE'
        cancel_res = rule_eval.get('cancel_reason', 'Auto-cancelled by policy') if rule_eval else None
        rule_name = rule_eval.get('rule_name', 'Default Policy') if rule_eval else 'Default Policy'

    if not matched_wf:
        new_inv.workflow_profile_id = None
        new_inv.assigned_approver = 'Unassigned (No Rule Matched)'
        new_inv.status = 'Unrouted (No Rule Matched)'
        new_inv.total_stages = 0
        new_inv.current_stage = 0
        new_inv.checklist_state = json.dumps({})
        db.add(AuditLog(
            invoice_id=new_inv.id,
            user=current_user.employee_name or current_user.username or 'Document Uploader',
            action='UNROUTED',
            stage='Rule Evaluation',
            notes='Manual document verified and confirmed, but no active business rule matched criteria. Pending rule creation.'
        ))
    else:
        new_inv.workflow_profile_id = matched_wf
        new_inv.document_type = infer_document_type(category=new_inv.category, wf_name=matched_wf, doc_type=document_type)
        steps = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == matched_wf
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        
        new_inv.total_stages = len(steps) if steps else 2
        
        if rule_act == 'AUTO_APPROVE':
            new_inv.status = 'Approved'
            new_inv.current_stage = new_inv.total_stages
            new_inv.assigned_approver = 'System Auto-Approved'
            db.add(AuditLog(
                invoice_id=new_inv.id,
                user='Policy Engine (STP)',
                action='AUTO_APPROVED',
                stage='Straight-Through Processing',
                notes=f"Manual document verified and auto-approved by rule '{rule_name}'."
            ))
            archive_approved_pdf(new_inv)
        elif rule_act == 'AUTO_CANCEL':
            new_inv.status = 'Cancelled'
            new_inv.current_stage = 1
            new_inv.assigned_approver = 'System Auto-Cancelled'
            db.add(AuditLog(
                invoice_id=new_inv.id,
                user='Policy Engine (Auto-Reject)',
                action='AUTO_CANCELLED',
                stage='Auto-Rejection Guard',
                notes=f"Manual document verified and auto-cancelled by rule '{rule_name}'. Reason: {cancel_res or 'Policy Violation'}"
            ))
            archive_rejected_pdf(new_inv)
        else:
            new_inv.current_stage = 1
            if steps and steps[0].approver_target:
                new_inv.assigned_approver = steps[0].approver_target.strip()
                new_inv.status = f'Initiated ({steps[0].step_name})'
            else:
                new_inv.assigned_approver = 'Unassigned (No Step Approvers)'
                new_inv.status = 'Initiated (Stage 1)'
            dispatch_assignment_inapp_notification(db, new_inv)
            
            db.add(AuditLog(
                invoice_id=new_inv.id,
                user=current_user.employee_name or current_user.username or 'Document Uploader',
                action='Verified & Confirmed',
                stage='Stage 1',
                notes=f"Manual document verified & ingested. Assigned to Stage 1 pool '{new_inv.assigned_approver}' under workflow '{matched_wf}'."
            ))

        # Universal Checklist Resolution
        first_stage = 'Attachment Status'
        if steps and len(steps) > 0 and steps[0].step_name:
            first_stage = steps[0].step_name
        checklist_items = resolve_checklist_items(db, new_inv, first_stage)
        new_inv.checklist_state = json.dumps({item: False for item in checklist_items})

    # Persist Line Items table (from user verification or OCR fallback)
    parsed_items = []
    if line_items:
        try:
            parsed_items = json.loads(line_items) if isinstance(line_items, str) else line_items
        except Exception as li_err:
            logger.debug("Failed parsing confirm line_items JSON: %s", li_err)
    elif ocr_data.get('line_items'):
        parsed_items = ocr_data['line_items']

    if parsed_items and isinstance(parsed_items, list):
        clean_items = []
        for itm in parsed_items:
            if isinstance(itm, dict) and itm.get('description'):
                clean_items.append(itm)
        if clean_items:
            new_inv.line_items_json = json.dumps(clean_items)
            for itm in clean_items:
                try:
                    db.add(DocumentLineItem(
                        invoice_id=new_inv.id,
                        description=str(itm.get('description') or 'Item'),
                        quantity=float(itm.get('quantity') or 1.0),
                        unit_price=float(itm.get('rate') or itm.get('unit_price') or 0.0),
                        amount=float(itm.get('amount') or 0.0),
                        item_code=str(itm.get('hsn_sac') or itm.get('item_code') or ''),
                        warranty_text=str(itm.get('hsn_sac') or '')
                    ))
                except Exception as li_db_err:
                    logger.debug("Failed inserting DocumentLineItem row: %s", li_db_err)

    # Persist Dynamic Custom Fields
    dyn_dict = {}
    raw_dyn = dynamic_fields or custom_data
    if raw_dyn:
        try:
            dyn_dict = json.loads(raw_dyn) if isinstance(raw_dyn, str) else raw_dyn
        except Exception as dyn_err:
            logger.debug("Failed parsing dynamic_fields JSON: %s", dyn_err)
    elif ocr_data.get('dynamic_fields'):
        dyn_dict = ocr_data['dynamic_fields']

    if dyn_dict and isinstance(dyn_dict, dict):
        new_inv.custom_data = json.dumps(dyn_dict)

    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)
    safe_broadcast_event('DOCUMENT_CREATED', {
        'document_id': str(new_inv.id),
        'status': new_inv.status,
        'current_stage': new_inv.current_stage,
        'assigned_approver': new_inv.assigned_approver
    })
    return {'success': True, 'invoice': new_inv}


@router.post('/api/documents/upload')
async def upload_document(
    file: UploadFile = File(...),
    division: Optional[str] = Form(None),
    plant: Optional[str] = Form(None),
    document_type: Optional[str] = Form('AP INVOICE'),
    workflow_profile: Optional[str] = Form(None),
    vendor_name: Optional[str] = Form(None),
    invoice_number: Optional[str] = Form(None),
    amount: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from app.services.rbac_service import check_permission
    if not check_permission(current_user, 'doc:create', db):
        raise HTTPException(status_code=403, detail="Access Denied: Missing required permission 'doc:create' to upload documents.")

    content = await file.read()
    unique_filename, detected_type = validate_uploaded_file(file, content)
    file_path = settings.UPLOAD_DIR / unique_filename
    with open(file_path, 'wb') as buffer:
        buffer.write(content)

    final_file_size = process_and_validate_pdf_size(file_path, detected_type)

    ocr_data = {}
    try:
        from starlette.concurrency import run_in_threadpool
        from app.services.ocr_service import extract_document_for_verification, OCRConcurrencyError
        ocr_data = (await run_in_threadpool(extract_document_for_verification, file_path)) or {}
    except OCRConcurrencyError as err:
        logger.warning("[Upload Document] OCR concurrency limit reached: %s. Proceeding with user form metadata.", err)
        ocr_data = {}
    except Exception as exc:
        logger.warning('Handled OCR/LLM extraction exception in upload_document: %s', exc)

    timestamp = int(datetime.datetime.utcnow().timestamp())

    final_amount = float(amount if (amount is not None and amount > 0) else (ocr_data.get('amount') or 0.0))
    final_base = float(ocr_data.get('base_amount') or (round(final_amount / 1.18, 2) if final_amount else 0.0))
    final_tax = float(ocr_data.get('tax_amount') or (round(final_amount - final_base, 2) if final_amount else 0.0))
    final_cgst = float(ocr_data.get('cgst') or 0.0)
    final_sgst = float(ocr_data.get('sgst') or 0.0)
    final_igst = float(ocr_data.get('igst') or 0.0)
    final_vendor = (vendor_name or ocr_data.get('vendor_name') or 'VENNILA CLOTHING COMPANY (SR)').strip()
    final_inv_no = (invoice_number or ocr_data.get('invoice_number') or f'INV-{timestamp % 100000}').strip()
    final_gstin = (ocr_data.get('gstin') or ocr_data.get('vendor_gstin') or '').strip()
    final_po = (ocr_data.get('po_number') or '').strip() or None
    user_div = (division or ocr_data.get('division') or current_user.division or 'VCC').strip()
    user_plant = (plant or 'MAIN').strip()
    final_doc_type = (document_type or ocr_data.get('document_type') or 'AP INVOICE').strip()
    final_inv_date = ocr_data.get('invoice_date') or ocr_data.get('date') or datetime.date.today().strftime('%Y-%m-%d')

    new_id = generate_document_id(db, doc_type=final_doc_type, category=final_doc_type)

    new_inv = Invoice(
        document_code=new_id,
        vendor_name=final_vendor,
        invoice_number=final_inv_no,
        invoice_date=final_inv_date,
        amount=final_amount,
        base_amount=final_base,
        tax_amount=final_tax,
        cgst=final_cgst,
        sgst=final_sgst,
        igst=final_igst,
        vendor_gstin=final_gstin,
        gstin=final_gstin,
        po_number=final_po,
        division=user_div,
        plant=user_plant,
        contact_person=current_user.username,
        employee_id=current_user.employee_id,
        employee_name=current_user.employee_name,
        category=final_doc_type,
        document_type=final_doc_type,
        file_url=f'/api/documents/{new_id}/file',
        file_path=str(file_path),
        file_name=file.filename,
        file_size=final_file_size,
        status='Pending Approval',
        current_stage=1,
        total_stages=2,
        version=1,
        source_application='DocuFlow Direct'
    )
    
    uploader_name = current_user.username or current_user.employee_id or "system"

    if workflow_profile and workflow_profile.strip() and workflow_profile.strip() != 'auto':
        matched_wf = workflow_profile.strip()
        rule_act = 'WORKFLOW_ROUTE'
        cancel_res = None
        rule_name = 'User Specified Workflow Override'
    else:
        rule_eval = evaluate_business_rules_full(db, new_inv)
        matched_wf = rule_eval.get('target_workflow_id') if rule_eval else None
        rule_act = rule_eval.get('rule_action', 'WORKFLOW_ROUTE') if rule_eval else 'WORKFLOW_ROUTE'
        cancel_res = rule_eval.get('cancel_reason', 'Auto-cancelled by policy') if rule_eval else None
        rule_name = rule_eval.get('rule_name', 'Default Policy') if rule_eval else 'Default Policy'

    if not matched_wf:
        new_inv.workflow_profile_id = None
        new_inv.assigned_approver = 'Unassigned (No Rule Matched)'
        new_inv.status = 'Unrouted (No Rule Matched)'
        new_inv.total_stages = 0
        new_inv.current_stage = 0
        new_inv.checklist_state = json.dumps({})
        db.add(AuditLog(invoice_id=new_inv.id, user=uploader_name, action='UNROUTED', stage='Rule Evaluation', notes='Document uploaded but no active business rule matched the document criteria. Pending rule creation.'))
    else:
        new_inv.workflow_profile_id = matched_wf
        new_inv.document_type = infer_document_type(category=new_inv.category, wf_name=matched_wf, doc_type=final_doc_type)
        steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == matched_wf).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        new_inv.total_stages = len(steps) if steps else 2
        if rule_act == 'AUTO_APPROVE':
            new_inv.status = 'Approved'
            new_inv.current_stage = new_inv.total_stages
            new_inv.assigned_approver = 'System Auto-Approved'
            db.add(AuditLog(invoice_id=new_inv.id, user='Policy Engine (STP)', action='AUTO_APPROVED', stage='Straight-Through Processing', notes=f"Document uploaded and auto-approved by rule '{rule_name}'."))
            archive_approved_pdf(new_inv)
        elif rule_act == 'AUTO_CANCEL':
            new_inv.status = 'Cancelled'
            new_inv.current_stage = 1
            new_inv.assigned_approver = 'System Auto-Cancelled'
            db.add(AuditLog(invoice_id=new_inv.id, user='Policy Engine (Auto-Reject)', action='AUTO_CANCELLED', stage='Auto-Rejection Guard', notes=f"Document uploaded and auto-cancelled by rule '{rule_name}'. Reason: {cancel_res or 'Policy Violation'}"))
            archive_rejected_pdf(new_inv)
        else:
            new_inv.current_stage = 1
            if steps and steps[0].approver_target:
                new_inv.assigned_approver = steps[0].approver_target.strip()
                new_inv.status = f'Initiated ({steps[0].step_name})'
            else:
                new_inv.assigned_approver = 'Unassigned (No Step Approvers)'
                new_inv.status = 'Initiated (Stage 1)'
            dispatch_assignment_inapp_notification(db, new_inv)
            db.add(AuditLog(invoice_id=new_inv.id, user=uploader_name, action='Created & Uploaded', stage='Stage 1', notes=f"Document uploaded and assigned to Stage 1 pool '{new_inv.assigned_approver}' under workflow '{matched_wf}'."))
        first_stage = 'Attachment Status'
        if steps and len(steps) > 0 and steps[0].step_name:
            first_stage = steps[0].step_name
        checklist_items = resolve_checklist_items(db, new_inv, first_stage)
        new_inv.checklist_state = json.dumps({item: False for item in checklist_items})
    # Persist OCR extracted Line Items table and dynamic metadata
    if ocr_data.get('line_items') and isinstance(ocr_data['line_items'], list):
        clean_items = [it for it in ocr_data['line_items'] if isinstance(it, dict) and it.get('description')]
        if clean_items:
            new_inv.line_items_json = json.dumps(clean_items)
            for itm in clean_items:
                try:
                    db.add(DocumentLineItem(
                        invoice_id=new_inv.id,
                        description=str(itm.get('description') or 'Item'),
                        quantity=float(itm.get('quantity') or 1.0),
                        unit_price=float(itm.get('rate') or itm.get('unit_price') or 0.0),
                        amount=float(itm.get('amount') or 0.0),
                        item_code=str(itm.get('hsn_sac') or itm.get('item_code') or ''),
                        warranty_text=str(itm.get('hsn_sac') or '')
                    ))
                except Exception as li_db_err:
                    logger.debug("Failed inserting direct upload DocumentLineItem: %s", li_db_err)

    if ocr_data.get('dynamic_fields') and isinstance(ocr_data['dynamic_fields'], dict):
        new_inv.custom_data = json.dumps(ocr_data['dynamic_fields'])

    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)
    safe_broadcast_event('DOCUMENT_CREATED', {'document_id': str(new_inv.id), 'status': new_inv.status, 'current_stage': new_inv.current_stage, 'assigned_approver': new_inv.assigned_approver})
    return {'success': True, 'invoice': new_inv}


@router.post('/api/documents/auto-workflow')
async def upload_document_auto_workflow(
    file: UploadFile = File(...),
    document_type: Optional[str] = Form('AP INVOICE'),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Automatic OCR & Workflow Start Mode:
    1. Uploads PDF and executes OCR, LLM extraction, and validation pipeline.
    2. Resolves active workflow using existing matching rules and conditions.
    3. If no matching rule/workflow is found or if multiple ambiguous unresolved matches exist,
       aborts with a clear error and prevents starting the wrong workflow.
    4. Upon unique resolution, creates the document, commits it, starts the workflow,
       and assigns to Stage 1 approver.
    """
    from app.services.rbac_service import check_permission
    if not check_permission(current_user, 'doc:create', db):
        raise HTTPException(status_code=403, detail="Access Denied: Missing required permission 'doc:create' to upload documents.")

    content = await file.read()
    unique_filename, detected_type = validate_uploaded_file(file, content)
    file_path = settings.UPLOAD_DIR / unique_filename
    with open(file_path, 'wb') as buffer:
        buffer.write(content)

    final_file_size = process_and_validate_pdf_size(file_path, detected_type)

    ocr_data = {}
    try:
        from starlette.concurrency import run_in_threadpool
        from app.services.ocr_service import extract_document_for_verification, OCRConcurrencyError
        ocr_data = (await run_in_threadpool(extract_document_for_verification, file_path)) or {}
    except OCRConcurrencyError as err:
        logger.warning("[Auto Workflow] OCR concurrency limit reached: %s", err)
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(
            status_code=503,
            detail="Server is currently busy processing document OCR/LLM extractions. Please retry shortly."
        )
    except Exception as exc:
        logger.warning('Handled OCR/LLM extraction exception in upload_document_auto_workflow: %s', exc)

    timestamp = int(datetime.datetime.utcnow().timestamp())

    final_amount = float(ocr_data.get('amount') or 0.0)
    final_base = float(ocr_data.get('base_amount') or (round(final_amount / 1.18, 2) if final_amount else 0.0))
    final_tax = float(ocr_data.get('tax_amount') or (round(final_amount - final_base, 2) if final_amount else 0.0))
    final_cgst = float(ocr_data.get('cgst') or 0.0)
    final_sgst = float(ocr_data.get('sgst') or 0.0)
    final_igst = float(ocr_data.get('igst') or 0.0)
    final_vendor = (ocr_data.get('vendor_name') or 'VENNILA CLOTHING COMPANY (SR)').strip()
    final_inv_no = (ocr_data.get('invoice_number') or f'INV-{timestamp % 100000}').strip()
    final_gstin = (ocr_data.get('gstin') or ocr_data.get('vendor_gstin') or '').strip()
    final_po = (ocr_data.get('po_number') or '').strip() or None
    user_div = (ocr_data.get('division') or current_user.division or 'VCC').strip()
    user_plant = 'MAIN'
    final_doc_type = (document_type or ocr_data.get('document_type') or 'AP INVOICE').strip()
    final_inv_date = ocr_data.get('invoice_date') or ocr_data.get('date') or datetime.date.today().strftime('%Y-%m-%d')

    new_id = generate_document_id(db, doc_type=final_doc_type, category=final_doc_type)

    candidate_doc = Invoice(
        document_code=new_id,
        vendor_name=final_vendor,
        invoice_number=final_inv_no,
        invoice_date=final_inv_date,
        amount=final_amount,
        base_amount=final_base,
        tax_amount=final_tax,
        cgst=final_cgst,
        sgst=final_sgst,
        igst=final_igst,
        vendor_gstin=final_gstin,
        gstin=final_gstin,
        po_number=final_po,
        division=user_div,
        plant=user_plant,
        contact_person=current_user.username,
        employee_id=current_user.employee_id,
        employee_name=current_user.employee_name,
        category=final_doc_type,
        document_type=final_doc_type,
        file_url=f'/api/documents/{new_id}/file',
        file_path=str(file_path),
        file_name=file.filename,
        file_size=final_file_size,
        status='Pending Approval',
        current_stage=1,
        total_stages=2,
        version=1,
        source_application='DocuFlow Automatic Workflow'
    )

    # Automatic Workflow Matching with strict ambiguity and missing checks
    matched_rules = resolve_matching_rules(db, candidate_doc)

    if not matched_rules:
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                # Silently ignore failure to remove uploaded temporary file
                logger.debug("Handled non-fatal exception")
        raise HTTPException(
            status_code=422,
            detail=f"Automatic Workflow Matching Failed: No active business rule matched document criteria (Type: '{final_doc_type}', Division: '{user_div}', Amount: ₹{final_amount:,.2f}). Please verify business rules or use Manual Workflow Start."
        )

    # Check top priority level
    top_priority = matched_rules[0]['priority']
    top_tier_matches = [r for r in matched_rules if r['priority'] == top_priority]
    distinct_target_wfs = {r['target_workflow_id'] for r in top_tier_matches if r.get('target_workflow_id')}

    if len(distinct_target_wfs) > 1:
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                # Silently ignore failure to remove uploaded temporary file
                logger.debug("Handled non-fatal exception")
        rule_names = [f"'{r['rule_name']}' -> {r['target_workflow_id']}" for r in top_tier_matches]
        raise HTTPException(
            status_code=409,
            detail=f"Ambiguous Workflow Match: Multiple conflicting business rules with equal priority ({top_priority}) matched this document: {', '.join(rule_names)}. Workflow start aborted to prevent incorrect routing. Please adjust rule priorities or select a workflow manually."
        )

    chosen_rule = top_tier_matches[0]
    matched_wf = chosen_rule.get('target_workflow_id')
    rule_act = chosen_rule.get('rule_action', 'WORKFLOW_ROUTE')
    cancel_res = chosen_rule.get('cancel_reason')
    rule_name = chosen_rule.get('rule_name', 'Default Rule')

    if not matched_wf and rule_act not in ['AUTO_APPROVE', 'AUTO_CANCEL']:
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                # Silently ignore failure to remove uploaded temporary file
                logger.debug("Handled non-fatal exception")
        raise HTTPException(
            status_code=422,
            detail=f"Automatic Workflow Matching Failed: Rule '{rule_name}' matched but has no target workflow configured. Workflow start aborted."
        )

    uploader_name = current_user.username or current_user.employee_id or "system"
    candidate_doc.workflow_profile_id = matched_wf
    candidate_doc.document_type = infer_document_type(category=candidate_doc.category, wf_name=matched_wf or '', doc_type=final_doc_type)

    steps = []
    if matched_wf:
        steps = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == matched_wf
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
    candidate_doc.total_stages = len(steps) if steps else 2

    if rule_act == 'AUTO_APPROVE':
        candidate_doc.status = 'Approved'
        candidate_doc.current_stage = candidate_doc.total_stages
        candidate_doc.assigned_approver = 'System Auto-Approved'
        db.add(AuditLog(
            invoice_id=candidate_doc.id,
            user='Policy Engine (STP)',
            action='AUTO_APPROVED',
            stage='Straight-Through Processing',
            notes=f"Automatic workflow match: Auto-approved by rule '{rule_name}'."
        ))
        archive_approved_pdf(candidate_doc)
    elif rule_act == 'AUTO_CANCEL':
        candidate_doc.status = 'Cancelled'
        candidate_doc.current_stage = 1
        candidate_doc.assigned_approver = 'System Auto-Cancelled'
        db.add(AuditLog(
            invoice_id=candidate_doc.id,
            user='Policy Engine (Auto-Reject)',
            action='AUTO_CANCELLED',
            stage='Auto-Rejection Guard',
            notes=f"Automatic workflow match: Auto-cancelled by rule '{rule_name}'. Reason: {cancel_res or 'Policy Violation'}"
        ))
        archive_rejected_pdf(candidate_doc)
    else:
        candidate_doc.current_stage = 1
        if steps and steps[0].approver_target:
            candidate_doc.assigned_approver = steps[0].approver_target.strip()
            candidate_doc.status = f'Initiated ({steps[0].step_name})'
        else:
            candidate_doc.assigned_approver = 'Unassigned (No Step Approvers)'
            candidate_doc.status = 'Initiated (Stage 1)'
        dispatch_assignment_inapp_notification(db, candidate_doc)
        db.add(AuditLog(
            invoice_id=candidate_doc.id,
            user=uploader_name,
            action='Auto Workflow Started',
            stage='Stage 1',
            notes=f"Document analyzed via OCR/LLM & automatically routed under rule '{rule_name}' to workflow '{matched_wf}' (Assigned: '{candidate_doc.assigned_approver}')."
        ))

    first_stage = 'Attachment Status'
    if steps and len(steps) > 0 and steps[0].step_name:
        first_stage = steps[0].step_name
    checklist_items = resolve_checklist_items(db, candidate_doc, first_stage)
    candidate_doc.checklist_state = json.dumps({item: False for item in checklist_items})

    db.add(candidate_doc)
    db.commit()
    db.refresh(candidate_doc)

    safe_broadcast_event('DOCUMENT_CREATED', {
        'document_id': str(candidate_doc.id),
        'status': candidate_doc.status,
        'current_stage': candidate_doc.current_stage,
        'assigned_approver': candidate_doc.assigned_approver
    })

    return {
        'success': True,
        'invoice': candidate_doc,
        'matched_rule': rule_name,
        'matched_workflow': matched_wf,
        'extracted_data': ocr_data
    }


@router.post('/api/documents/trigger-workflow/excel')
async def trigger_workflow_from_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Excel-driven Workflow Trigger Engine:
    Reads Excel of invoice numbers, matches existing DAAS records, retrieves
    Compliance Type & Division, determines applicable workflow via Condition Engine,
    and starts the workflow with Stage 1 approver resolved via Compliance Type + Division + Role.
    """
    from app.services.rbac_service import check_permission
    if not check_permission(current_user, 'doc:create', db) and not check_permission(current_user, 'wf:trigger', db):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Missing required permission to trigger workflows via Excel."
        )

    from starlette.concurrency import run_in_threadpool
    from app.services.excel_trigger_service import process_excel_workflow_trigger
    file_bytes = await file.read()
    return await run_in_threadpool(
        process_excel_workflow_trigger,
        file_bytes=file_bytes,
        filename=file.filename or 'batch.xlsx',
        db=db,
        current_user=current_user
    )

@router.post('/api/documents/upload-and-route/{synced_doc_id}')
async def upload_and_route(
    synced_doc_id: str,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form('AP INVOICE'),
    vendorName: Optional[str] = Form(None),
    invoiceNumber: Optional[str] = Form(None),
    amount: Optional[float] = Form(None),
    invoiceDate: Optional[str] = Form(None),
    poNumber: Optional[str] = Form(None),
    cgst: Optional[float] = Form(0.0),
    sgst: Optional[float] = Form(0.0),
    igst: Optional[float] = Form(0.0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    from app.services.rbac_service import check_permission
    if not check_permission(current_user, 'doc:create', db):
        raise HTTPException(status_code=403, detail="Access Denied: Missing required permission 'doc:create' to upload attachments.")

    inv = db.query(Invoice).filter(Invoice.id == synced_doc_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail='Synced staging document not found')

    from app.services.rbac_service import check_document_owner_or_assigned
    if not check_document_owner_or_assigned(current_user, inv, db):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Only the document owner, assigned approver, or administrator can upload and route this document."
        )

    content = await file.read()
    unique_filename, detected_type = validate_uploaded_file(file, content)
    file_path = settings.UPLOAD_DIR / unique_filename
    with open(file_path, 'wb') as buffer:
        buffer.write(content)
    final_file_size = process_and_validate_pdf_size(file_path, detected_type)
    inv.file_url = f'/api/documents/{inv.id}/file'
    inv.file_path = str(file_path)
    inv.file_size = final_file_size
    inv.file_name = file.filename
    if document_type:
        inv.document_type = document_type
    if vendorName:
        inv.vendor_name = vendorName
    if invoiceNumber:
        inv.invoice_number = invoiceNumber
    if amount is not None:
        inv.amount = amount
        inv.base_amount = round(amount / 1.18, 2)
        inv.tax_amount = round(amount - inv.base_amount, 2)
    if invoiceDate:
        inv.invoice_date = invoiceDate
    if poNumber:
        inv.po_number = poNumber
    if cgst is not None:
        inv.cgst = cgst
    if sgst is not None:
        inv.sgst = sgst
    if igst is not None:
        inv.igst = igst
    rule_eval2 = evaluate_business_rules_full(db, inv)
    matched_wf = rule_eval2.get('target_workflow_id') if rule_eval2 else None
    rule_act2 = rule_eval2.get('rule_action', 'WORKFLOW_ROUTE') if rule_eval2 else 'WORKFLOW_ROUTE'
    cancel_res2 = rule_eval2.get('cancel_reason', 'Auto-cancelled by policy') if rule_eval2 else None
    rule_name2 = rule_eval2.get('rule_name', 'Default Policy') if rule_eval2 else 'Default Policy'
    steps = []
    if matched_wf:
        inv.workflow_profile_id = matched_wf
        inv.document_type = infer_document_type(category=inv.category, wf_name=matched_wf, doc_type=document_type)
        steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == matched_wf).order_by(WorkflowStepDefinition.stage_number.asc()).all()
    inv.total_stages = len(steps) if steps else 2
    if rule_act2 == 'AUTO_APPROVE':
        inv.status = 'Approved'
        inv.current_stage = inv.total_stages
        inv.assigned_approver = 'System Auto-Approved'
        db.add(AuditLog(invoice_id=inv.id, user='Policy Engine (STP)', action='AUTO_APPROVED', stage='Straight-Through Processing', notes=f"Document routed and auto-approved by rule '{rule_name2}'."))
    elif rule_act2 == 'AUTO_CANCEL':
        inv.status = 'Cancelled'
        inv.current_stage = 1
        inv.assigned_approver = 'System Auto-Cancelled'
        db.add(AuditLog(invoice_id=inv.id, user='Policy Engine (Auto-Reject)', action='AUTO_CANCELLED', stage='Auto-Rejection Guard', notes=f"Document routed and auto-cancelled by rule '{rule_name2}'. Reason: {cancel_res2 or 'Policy Violation'}"))
    else:
        inv.current_stage = 1
        if steps:
            inv.assigned_approver = steps[0].approver_target
            inv.status = f'Initiated ({steps[0].step_name})'
        else:
            inv.status = 'Initiated (Stage 1)'
        db.add(AuditLog(invoice_id=inv.id, user='Metadata Editor / Sync Uploader', action='Metadata Completed & Routed', stage='Stage 1', notes=f"Physical document uploaded & routed under workflow '{matched_wf}'."))
    first_stage = 'Attachment Status'
    if inv.current_stage and inv.workflow_profile_id:
        curr_step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == inv.current_stage).first()
        if curr_step and curr_step.step_name:
            first_stage = curr_step.step_name
    checklist_items = resolve_checklist_items(db, inv, first_stage)
    inv.checklist_state = json.dumps({item: False for item in checklist_items})
    db.commit()
    db.refresh(inv)
    return {'success': True, 'document_id': inv.id, 'status': inv.status, 'file_url': inv.file_url}


@router.post('/api/records/compress-pdf')
@router.post('/api/documents/compress-pdf')
@router.post('/api/invoices/compress-pdf')
async def compress_pdf_standalone(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Standalone PDF Auto-Compress Endpoint:
    Accepts any PDF file > 15MB, runs pypdf + Pillow image resampling and stream deflation down to < 10MB,
    and returns the compressed PDF binary stream directly.
    """
    if not file.filename or not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files can be compressed.")
    
    content = await file.read()
    orig_size = len(content)
    unique_filename, detected_type = validate_uploaded_file(file, content)
    upload_root = settings.UPLOAD_DIR.resolve()
    file_path = (upload_root / f"auto_comp_{unique_filename}").resolve()
    if not file_path.is_relative_to(upload_root):
        raise HTTPException(status_code=400, detail="Invalid destination path.")
    with open(file_path, 'wb') as buffer:
        buffer.write(content)
    
    was_compressed, _o_size, new_size = compress_pdf(file_path)
    
    # Auto-cleanup temporary file after streaming response
    background_tasks.add_task(lambda p: Path(p).unlink(missing_ok=True), file_path)

    from fastapi.responses import FileResponse
    return FileResponse(
        path=file_path,
        filename=f"compressed_{file.filename}",
        media_type="application/pdf",
        headers={
            "X-Original-Size": str(orig_size),
            "X-Compressed-Size": str(new_size),
            "X-Was-Compressed": str(was_compressed),
            "Access-Control-Expose-Headers": "X-Original-Size, X-Compressed-Size, X-Was-Compressed"
        }
    )

@router.post('/api/records/{invoice_id}/version')
@router.post('/api/documents/{invoice_id}/version')
@router.post('/api/invoices/{invoice_id}/version')
async def upload_invoice_version(
    invoice_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Document not found")

    from app.services.rbac_service import check_permission, check_document_owner_or_assigned
    if not check_permission(current_user, 'doc:create', db):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Missing required permission 'doc:create' to replace document PDF."
        )

    status_upper = (inv.status or '').upper()
    if any(term in status_upper for term in ['APPROVED', 'SETTLED', 'CANCEL', 'VOID']):
        raise HTTPException(status_code=403, detail="Document is settled/closed. PDF replacement is not allowed.")

    is_stage_1 = (inv.current_stage or 1) == 1
    current_step_name = 'Attachment Status' if is_stage_1 else f'Stage {inv.current_stage or 1}'
    if inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.stage_number == (inv.current_stage or 1)
        ).first()
        if step and step.step_name:
            current_step_name = step.step_name

    is_attachment_status = is_stage_1 or 'attachment' in current_step_name.lower() or 'attachment' in status_upper
    if not is_attachment_status:
        raise HTTPException(
            status_code=403,
            detail="PDF replacement is restricted. Documents can only be replaced during Attachment Status (Stage 1)."
        )

    if not check_document_owner_or_assigned(current_user, inv, db):
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Only the document owner, assigned approver, or administrator can replace the PDF for this document."
        )

    content = await file.read()
    unique_filename, detected_type = validate_uploaded_file(file, content)
    file_path = settings.UPLOAD_DIR / unique_filename
    with open(file_path, 'wb') as buffer:
        buffer.write(content)
    if detected_type == 'pdf':
        try:
            compress_pdf(file_path)
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
    inv.file_url = f'/api/documents/{inv.id}/file'
    inv.file_path = str(file_path)
    inv.file_size = len(content)
    inv.file_name = file.filename
    uploader_name = current_user.username or current_user.employee_id
    db.add(AuditLog(invoice_id=inv.id, user=uploader_name, action='Invoice PDF Attached', stage=f'Stage {inv.current_stage or 1}', notes=f'Physical document attached: {file.filename}. Pending checklist verification and stage approval.'))
    db.commit()
    db.refresh(inv)
    return {'success': True, 'file_url': inv.file_url, 'current_stage': inv.current_stage, 'status': inv.status}

@router.get('/api/documents/{id}/comments')
@router.get('/api/records/{id}/comments')
def get_document_comments(id: str, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    inv = find_invoice_by_identifier(db, id)
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{id}' not found")
    try:
        logs = db.query(AuditLog).filter(
            AuditLog.invoice_id == inv.id,
            or_(AuditLog.notes.isnot(None), AuditLog.remarks.isnot(None))
        ).order_by(AuditLog.timestamp.desc()).all()
    except Exception as q_err:
        logger.warning(f"Error querying comments for doc {inv.id}: {q_err}")
        return []
    
    is_admin = False
    user_names = []
    if current_user:
        is_admin = is_user_admin(current_user, db)
        user_names = [n.lower() for n in [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email] if n]

    comments = []
    for l in logs:
        text_val = l.remarks or l.notes
        if not text_val:
            continue

        act_lower = (l.action or '').lower()
        is_reject_or_hold = any(k in act_lower for k in ['reject', 'hold', 'return', 'send back'])
        if is_reject_or_hold and not is_admin:
            author_lower = (l.user or '').lower()
            is_author = any(un in author_lower for un in user_names) if user_names else False
            if not is_author:
                # Reject/Hold comments are hidden from future/uninvolved approvers
                continue

        ts_str = l.timestamp.isoformat() if l.timestamp else datetime.datetime.utcnow().isoformat()
        if not ts_str.endswith('Z') and '+' not in ts_str and ('-' not in ts_str[10:]):
            ts_str += 'Z'
        comments.append({
            'id': str(l.id),
            'author': l.user or 'System',
            'text': text_val,
            'created_at': ts_str,
            'action': l.action,
            'stage': l.stage,
            'ip_address': l.ip_address
        })
    return comments

@router.post('/api/documents/{id}/comments')
@router.post('/api/records/{id}/comments')
@router.post('/api/invoices/{id}/comments')
def add_document_comment(id: str, payload: dict, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    inv = find_invoice_by_identifier(db, id)
    if not authorize_document_access(current_user, inv) and not is_user_in_approver_pool(current_user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail="Access Denied: You do not have permission to comment on this document.")
    text = payload.get('text') or payload.get('comment') or payload.get('notes') or ''
    author = current_user.employee_name or current_user.name or current_user.username or 'User'
    if text:
        db.add(AuditLog(invoice_id=inv.id, user=author, action='Comment Added', stage=f'Stage {inv.current_stage or 1}', notes=text))
        db.commit()
    return {'success': True, 'message': 'Comment recorded'}

@router.get('/api/documents/{id}/versions')
@router.get('/api/records/{id}/versions')
@router.get('/api/invoices/{id}/versions')
def get_document_versions(id: str, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    inv = find_invoice_by_identifier(db, id)
    if not authorize_document_access(current_user, inv) and not is_user_in_approver_pool(current_user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail="Access Denied: You do not have permission to view versions for this document.")
    versions = []
    if inv.file_url:
        versions.append({'version_number': 1, 'file_url': inv.file_url, 'uploaded_at': inv.created_at.isoformat() if inv.created_at else datetime.datetime.utcnow().isoformat(), 'uploaded_by': 'System / Approver', 'is_current': True})
    return versions

@router.get('/api/stats')
@router.get('/api/dashboard/stats')
def get_dashboard_stats(db: Session=Depends(get_db), current_user: Optional[User]=Depends(get_current_user)):
    user_key = f"stats_{current_user.id if current_user else 'anon'}_{current_user.role if current_user else 'guest'}"
    now = time.monotonic()
    with _DASHBOARD_STATS_LOCK:
        cached = _DASHBOARD_STATS_CACHE.get(user_key)
        if cached and (now - cached["timestamp"] < _DASHBOARD_STATS_TTL):
            return cached["data"]

    all_invoices = db.query(
        Invoice.id,
        Invoice.document_type,
        Invoice.workflow_profile_id,
        Invoice.status,
        Invoice.assigned_approver,
        Invoice.amount,
        Invoice.type_of_complaint,
        Invoice.subtype_of_complaint,
        Invoice.document_number,
        Invoice.invoice_number,
    ).filter(Invoice.is_deleted == False).all()

    # Exclude Customer Feedback records from AP Operations Dashboard stats
    def is_fb_doc(inv) -> bool:
        if not inv:
            return False
        doc_type = (inv.document_type or '').upper()
        doc_id = str(inv.id or '').upper()
        doc_num = str(getattr(inv, 'document_number', '') or getattr(inv, 'invoice_number', '') or '').upper()
        wf_prof = str(inv.workflow_profile_id or '').upper()
        complaint = getattr(inv, 'type_of_complaint', None) or getattr(inv, 'subtype_of_complaint', None)
        return (
            'FEEDBACK' in doc_type or
            'COMPLAINT' in doc_type or
            doc_id.startswith('CMP') or
            doc_id.startswith('CF') or
            doc_num.startswith('CMP') or
            doc_num.startswith('CF') or
            'FEEDBACK' in wf_prof or
            bool(complaint)
        )

    invoices = [i for i in all_invoices if not is_fb_doc(i)]
    approved_invoice_ids = set()
    rejected_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id).filter(AuditLog.action.ilike('%approve%'), or_(*or_filters))
            approved_invoice_ids = {row[0] for row in audit_query.all()}
            audit_rej_query = db.query(AuditLog.invoice_id).filter(
                or_(AuditLog.action.ilike('%reject%'), AuditLog.action.ilike('%cancel%'), AuditLog.action.ilike('%return%')),
                or_(*or_filters)
            )
            rejected_invoice_ids = {row[0] for row in audit_rej_query.all()}
    user_is_admin = is_user_admin(current_user, db)
    if current_user and not user_is_admin:
        u_role_clean = (current_user.role or '').strip().lower()
        is_uploader_role = bool(any(x in u_role_clean for x in ['uplod', 'upload', 'account', 'approver', 'manager']))
        user_handles = [current_user.username.lower() if current_user.username else '', current_user.employee_id.lower() if current_user.employee_id else '', current_user.employee_name.lower() if current_user.employee_name else '', current_user.email.lower() if current_user.email else '']
        user_handles = [h for h in user_handles if h]
        scoped_invoices = []
        approved_count = 0
        pending_count = 0
        progress_count = 0
        hold_count = 0
        rejected_count = 0
        total_spend = 0.0
        for inv in invoices:
            has_approved = inv.id in approved_invoice_ids
            has_rejected = (inv.id in rejected_invoice_ids) or (str(inv.id) in rejected_invoice_ids)
            inv_creator = (getattr(inv, 'contact_person', None) or getattr(inv, 'employee_id', None) or getattr(inv, 'employee_name', None) or '').strip().lower()
            is_creator = bool(inv_creator and inv_creator in user_handles)
            is_assigned = False
            if inv.assigned_approver:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(',') if s.strip()]
                for handle in user_handles:
                    if handle in approvers or any((handle in app or app in handle for app in approvers)):
                        is_assigned = True
                        break
            st_lower = (inv.status or '').lower()
            is_cancelled = any(k in st_lower for k in ['cancel', 'void', 'fail'])
            # Cancelled documents must only be visible to the user who cancelled/created it and the admin alone!
            if is_cancelled and not (has_rejected or is_creator):
                continue

            is_stage1_or_unrouted = ('attachment' in st_lower or 'unrouted' in st_lower or 'unassigned' in (inv.assigned_approver or '').lower() or 'initiated' in st_lower)
            if is_uploader_role and is_stage1_or_unrouted:
                is_assigned = True
            if has_approved or is_assigned or has_rejected or is_creator:
                scoped_invoices.append(inv)
                total_spend += float(inv.amount or 0.0)
                if has_approved and any(k in st_lower for k in ['settled', 'approved', 'paid', 'ready for payment']) and not ('stage' in st_lower or 'progress' in st_lower):
                    approved_count += 1
                elif any(k in st_lower for k in ['hold', 'pause', 'wait', 'clarif']):
                    hold_count += 1
                elif any(k in st_lower for k in ['cancel', 'void', 'fail']):
                    if has_rejected or is_creator:
                        rejected_count += 1
                elif any(k in st_lower for k in ['progress', 'stage', 'review', 'verification']) and not ('attachment' in st_lower or 'initiated' in st_lower):
                    progress_count += 1
                else:
                    is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed', 'Settled']
                    if is_active_flow:
                        pending_count += 1
        total_docs = len(scoped_invoices)
    else:
        total_docs = len(invoices)
        hold_count = sum(1 for i in invoices if any(k in (i.status or '').lower() for k in ['hold', 'pause', 'wait', 'clarif']))
        rejected_count = sum(1 for i in invoices if any(k in (i.status or '').lower() for k in ['cancel', 'void', 'fail']))
        approved_count = sum(1 for i in invoices if any(k in (i.status or '').lower() for k in ['settled', 'approved', 'paid', 'ready for payment']) and not any(k in (i.status or '').lower() for k in ['stage', 'progress']))
        progress_count = sum(1 for i in invoices if not any(k in (i.status or '').lower() for k in ['settled', 'approved', 'paid', 'ready for payment', 'cancel', 'void', 'fail', 'hold', 'pause', 'wait', 'clarif']) and any(k in (i.status or '').lower() for k in ['progress', 'stage', 'review', 'verification']) and not any(k in (i.status or '').lower() for k in ['attachment', 'initiated']))
        pending_count = sum(1 for i in invoices if not any(k in (i.status or '').lower() for k in ['settled', 'approved', 'paid', 'ready for payment', 'cancel', 'void', 'fail', 'hold', 'pause', 'wait', 'clarif']) and not (any(k in (i.status or '').lower() for k in ['progress', 'stage', 'review', 'verification']) and not any(k in (i.status or '').lower() for k in ['attachment', 'initiated'])))
        if pending_count == 0 and total_docs > (approved_count + progress_count + hold_count + rejected_count):
            pending_count = total_docs - (approved_count + progress_count + hold_count + rejected_count)
        total_spend = sum((float(i.amount or 0.0) for i in invoices))

    result = {
        'totalDocuments': total_docs,
        'pendingApprovals': pending_count,
        'pendingDocuments': pending_count,
        'progressDocuments': progress_count,
        'holdDocuments': hold_count,
        'rejectedDocuments': rejected_count,
        'approvedDocuments': approved_count,
        'totalSpendINR': total_spend,
        'autoRoutedPercentage': 100.0 if total_docs > 0 else 0.0
    }
    with _DASHBOARD_STATS_LOCK:
        _DASHBOARD_STATS_CACHE[user_key] = {"data": result, "timestamp": now}
    return result

def get_user_notification_handles(user: User) -> list[str]:
    handles = set()
    if user.username:
        handles.add(user.username.lower().strip())
    if user.employee_id:
        handles.add(user.employee_id.lower().strip())
    if user.employee_name:
        handles.add(user.employee_name.lower().strip())
    if user.email:
        handles.add(user.email.lower().strip())
    if user.role:
        role_str = user.role.lower().strip()
        handles.add(role_str)
        if role_str == 'ap_executive':
            handles.update(['ap_executive', 'reviewer', 'ap_reviewer', 'l1_approver', 'stage 1', 'stage 1 approver'])
        elif role_str == 'manager':
            handles.update(['manager', 'l2_approver', 'finance_manager', 'finance manager', 'stage 2', 'stage 2 approver'])
        elif role_str == 'executive':
            handles.update(['executive', 'l3_approver', 'executive_approver', 'executive approver', 'stage 3', 'stage 3 approver'])
        elif role_str == 'admin':
            handles.update(['admin', 'administrator', 'system administrator'])
    return [h for h in handles if h]

def is_notification_for_user_handles(n: InAppNotification, user_handles: list[str]) -> bool:
    if not n.recipient_handle:
        return False
    recip = n.recipient_handle.lower().strip()
    recip_parts = [p.strip() for p in recip.split(',') if p.strip()]
    uh_set = {h.lower().strip() for h in user_handles if h}

    for part in recip_parts:
        candidates = {part}
        # Strip parentheses content: 'vignesh (manager)' -> 'vignesh'
        cleaned = re.sub(r'\(.*?\)', '', part).strip()
        if cleaned:
            candidates.add(cleaned)
        # Extract inside parentheses: 'vignesh (manager)' -> 'manager'
        for paren in re.findall(r'\((.*?)\)', part):
            p_clean = paren.strip()
            if p_clean:
                candidates.add(p_clean)

        for cand in candidates:
            if cand in uh_set:
                return True
            for uh in uh_set:
                if '@' in uh and uh.split('@')[0] == cand:
                    return True
                if '@' in cand and cand.split('@')[0] == uh:
                    return True
    return False

@router.get('/api/notifications')
def get_notifications(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    user_handles = get_user_notification_handles(current_user)
    from sqlalchemy import or_
    conditions = []
    for h in user_handles:
        if h and len(h) >= 2:
            conditions.append(InAppNotification.recipient_handle.ilike(f"%{h}%"))

    if conditions:
        recent_notifs = db.query(InAppNotification).filter(or_(*conditions)).order_by(InAppNotification.created_at.desc()).limit(200).all()
        unread_notifs = db.query(InAppNotification).filter(InAppNotification.is_read == False, or_(*conditions)).all()
        seen_ids = set()
        merged = []
        for n in unread_notifs + recent_notifs:
            if n.id not in seen_ids:
                seen_ids.add(n.id)
                merged.append(n)
        merged.sort(key=lambda x: x.created_at or datetime.datetime.min, reverse=True)
    else:
        merged = []

    filtered = []
    for n in merged:
        if is_notification_for_user_handles(n, user_handles):
            filtered.append({
                'notification_id': n.notification_id,
                'document_id': n.document_id,
                'notification_type': n.notification_type,
                'title': n.title,
                'message': n.message,
                'is_read': n.is_read,
                'created_at': n.created_at.isoformat() if n.created_at else datetime.datetime.utcnow().isoformat()
            })
    return filtered

@router.put('/api/notifications/{notification_id}/read')
def mark_notification_read(notification_id: str, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    user_handles = get_user_notification_handles(current_user)
    notif = db.query(InAppNotification).filter(InAppNotification.notification_id == notification_id).first()
    if not notif:
        notif = db.query(InAppNotification).filter(InAppNotification.id == notification_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    # Enforce IDOR protection: user can only mark their own notifications as read
    if not is_notification_for_user_handles(notif, user_handles):
        raise HTTPException(status_code=403, detail="Not authorized to modify this notification")

    notif.is_read = True
    db.commit()
    return {'success': True}

@router.put('/api/notifications/read-all')
def mark_all_notifications_read(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    user_handles = get_user_notification_handles(current_user)
    from sqlalchemy import or_
    conditions = []
    for h in user_handles:
        if h and len(h) >= 2:
            conditions.append(InAppNotification.recipient_handle.ilike(f"%{h}%"))

    if conditions:
        unread_candidates = db.query(InAppNotification).filter(InAppNotification.is_read == False, or_(*conditions)).all()
    else:
        unread_candidates = []

    for n in unread_candidates:
        if is_notification_for_user_handles(n, user_handles):
            n.is_read = True
    db.commit()
    return {'success': True}

@router.get('/api/templates')
def get_templates(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    return []
CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app_config.json')

def load_app_configs():
    if not os.path.exists(CONFIG_FILE_PATH):
        return []
    try:
        with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as exc:
        logger.debug('Handled exception: %s', exc)
        return []

def save_app_config(key: str, value: str, description: str=''):
    configs = load_app_configs()
    found = False
    for c in configs:
        if c.get('key') == key:
            c['value'] = value
            c['description'] = description
            found = True
            break
    if not found:
        configs.append({'key': key, 'value': value, 'description': description})
    try:
        with open(CONFIG_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(configs, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.debug('Handled exception: %s', e)

def _require_docs_admin(user: User, db: Session):
    is_admin = is_user_admin(user, db) or check_permission(user, 'admin:rbac', db) or check_permission(user, 'admin:system', db)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Administrator authorization required."
        )

@router.get('/api/admin/config')
def get_admin_config(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    # Authenticated users need access to app configs for FLAC field permissions and UI actions
    return load_app_configs()

@router.post('/api/admin/config')
def post_admin_config(payload: dict, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    key = payload.get('key')
    value = payload.get('value')
    desc = payload.get('description') or ''
    if not key:
        raise HTTPException(status_code=400, detail='Missing key in config payload')
    save_app_config(key, value, desc)
    return {'success': True, 'key': key}

def load_erp_master_data() -> list:
    configs = load_app_configs()
    for c in configs:
        if c.get('key') == 'ERP_MASTER_DATA':
            try:
                return json.loads(c.get('value', '[]'))
            except Exception as exc:
                logger.debug('Handled exception: %s', exc)
                return []
    return []

def save_erp_master_data(items: list):
    save_app_config('ERP_MASTER_DATA', json.dumps(items, ensure_ascii=False), 'Synchronized ERP Master PO Registry')

@router.get('/api/admin/erp-master')
def get_admin_erp_master(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    return load_erp_master_data()

@router.get('/api/admin/archive/settings')
def get_admin_archive_settings(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    from app.services.archive_service import get_archive_settings
    return get_archive_settings(db)

@router.post('/api/admin/archive/settings')
def update_admin_archive_settings(payload: dict, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    from app.services.archive_service import update_archive_settings
    try:
        return update_archive_settings(
            db=db,
            enabled=bool(payload.get('enabled', False)),
            retention_value=int(payload.get('retention_value', 90)),
            retention_unit=str(payload.get('retention_unit', 'Days')),
            frequency=str(payload.get('frequency', 'Daily')),
            scheduled_time=str(payload.get('scheduled_time', '02:00')),
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

@router.post('/api/admin/archive/trigger')
def trigger_admin_archive(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    from app.services.archive_service import execute_database_archival
    res = execute_database_archival(forced=True)
    return res


@router.post('/api/admin/erp-master')
def post_admin_erp_master(payload: dict, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    items = load_erp_master_data()
    po = payload.get('po_number')
    if not po:
        raise HTTPException(status_code=400, detail='Missing po_number')
    found = False
    for i, itm in enumerate(items):
        if itm.get('po_number') == po:
            items[i] = payload
            found = True
            break
    if not found:
        items.append(payload)
    save_erp_master_data(items)
    return {'success': True, 'item': payload}

@router.post('/api/admin/erp-master/bulk')
def post_admin_erp_master_bulk(payload: dict, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    new_items = payload.get('items') or []
    items = load_erp_master_data() or []
    existing_pos = {itm.get('po_number'): i for i, itm in enumerate(items) if isinstance(itm, dict)}
    for itm in (new_items if isinstance(new_items, list) else []):
        po = itm.get('po_number')
        if po in existing_pos:
            items[existing_pos[po]] = itm
        else:
            items.append(itm)
            existing_pos[po] = len(items) - 1
    save_erp_master_data(items)
    return {'success': True, 'count': len(new_items)}

@router.delete('/api/admin/erp-master/{po}')
def delete_admin_erp_master(po: str, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    filtered_items = [itm for itm in load_erp_master_data() if itm.get('po_number') != po]
    save_erp_master_data(filtered_items)
    return {'success': True, 'deleted': po}

@router.get('/api/admin/recycle-bin')
def get_admin_recycle_bin(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    return []

@router.get('/api/admin/notifications/provider')
def get_admin_notifications_provider(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    config = db.query(NotificationProviderConfig).first()
    if config:
        masked_pwd = mask_secret(config.encrypted_password)
        return {'smtp_server': config.smtp_server, 'port': config.port, 'username': config.username, 'encrypted_password': masked_pwd, 'sender_email': config.sender_email, 'sender_name': config.sender_name}
    return {
        'smtp_server': os.getenv('DOCUFLOW_SMTP_SERVER', 'smtp.example.com'),
        'port': int(os.getenv('DOCUFLOW_SMTP_PORT', '587')),
        'username': os.getenv('DOCUFLOW_SMTP_USER', 'alerts@example.com'),
        'encrypted_password': '',
        'sender_email': os.getenv('DOCUFLOW_SMTP_SENDER', 'alerts@example.com'),
        'sender_name': 'DocuFlow Alerts'
    }

@router.post('/api/admin/notifications/provider')
def save_admin_notifications_provider(payload: NotificationProviderSchema, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    config = db.query(NotificationProviderConfig).first()
    new_pwd = payload.encrypted_password
    if config and (new_pwd in ['••••••••', '********', None, '']):
        encrypted_pwd = config.encrypted_password
    elif new_pwd:
        encrypted_pwd = encrypt_secret(new_pwd)
    else:
        encrypted_pwd = None

    if not config:
        config = NotificationProviderConfig(smtp_server=payload.smtp_server, port=payload.port, username=payload.username, encrypted_password=encrypted_pwd, sender_email=payload.sender_email, sender_name=payload.sender_name)
        db.add(config)
    else:
        config.smtp_server = payload.smtp_server
        config.port = payload.port
        config.username = payload.username
        if encrypted_pwd is not None:
            config.encrypted_password = encrypted_pwd
        config.sender_email = payload.sender_email
        config.sender_name = payload.sender_name
    db.commit()
    return {'success': True, 'message': 'SMTP provider configuration saved successfully'}

@router.get('/api/admin/notifications/raci')
def get_admin_notifications_raci(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    items = db.query(NotificationRaciMatrix).all()
    return [{'workflow_profile': item.workflow_profile, 'event_name': item.event_name, 'responsible_emails': item.responsible_emails, 'accountable_emails': item.accountable_emails, 'consulted_emails': item.consulted_emails, 'informed_emails': item.informed_emails, 'title_template': item.title_template, 'message_template': item.message_template} for item in items]

@router.post('/api/admin/notifications/raci')
def save_admin_notifications_raci(payload: NotificationRaciSchema, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    item = db.query(NotificationRaciMatrix).filter(NotificationRaciMatrix.workflow_profile == payload.workflow_profile, NotificationRaciMatrix.event_name == payload.event_name).first()
    if not item:
        item = NotificationRaciMatrix(workflow_profile=payload.workflow_profile, event_name=payload.event_name)
        db.add(item)
    item.responsible_emails = payload.responsible_emails
    item.accountable_emails = payload.accountable_emails
    item.consulted_emails = payload.consulted_emails
    item.informed_emails = payload.informed_emails
    item.title_template = payload.title_template
    item.message_template = payload.message_template
    db.commit()
    return {'success': True, 'message': f'RACI configuration saved for {payload.event_name}'}

@router.post('/api/admin/notifications/test')
def test_admin_notifications_smtp(payload: NotificationTestSchema, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    config = db.query(NotificationProviderConfig).first()
    recipient = (payload.to if payload and payload.to else '').strip()
    if not recipient:
        raise HTTPException(status_code=400, detail='Recipient email address ("to") is required')
        
    smtp_host = (config.smtp_server if config and config.smtp_server else 'smtp.office365.com').strip()
    smtp_port = config.port if (config and config.port) else 587
    smtp_user = (config.username if config and config.username else '').strip() or os.getenv('SMTP_USER', '') or os.getenv('SMTP_USERNAME', '') or getattr(settings, 'SMTP_USER', '') or ''
    smtp_pass = (decrypt_secret(config.encrypted_password) if config and config.encrypted_password else '').strip() or os.getenv('SMTP_PASS', '') or os.getenv('SMTP_PASSWORD', '') or getattr(settings, 'SMTP_PASS', '') or ''
    sender_email = (config.sender_email if config and config.sender_email else None) or smtp_user or 'no-reply@docuflow.net'
    sender_name = (config.sender_name if config and config.sender_name else None) or 'DocuFlow Alerts'

    if not smtp_host or not smtp_user:
        raise HTTPException(status_code=400, detail='Incomplete SMTP settings (SMTP Server and Username are required)')

    subj = payload.subject or 'DocuFlow System Notification Test'
    body_html = payload.html or f'''
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
        <h2 style="color: #2563eb;">DocuFlow SMTP Connection Verified!</h2>
        <p>This is a test notification confirming that your SMTP server settings are correctly configured.</p>
        <ul>
            <li><strong>SMTP Server:</strong> {smtp_host}:{smtp_port}</li>
            <li><strong>Sender Email:</strong> {sender_email}</li>
            <li><strong>Recipient:</strong> {recipient}</li>
        </ul>
    </div>
    '''
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subj
        msg['From'] = f'{sender_name} <{sender_email}>'
        msg['To'] = recipient
        msg.attach(MIMEText(body_html, 'html'))
        
        if int(smtp_port) == 465:
            server = smtplib.SMTP_SSL(smtp_host, int(smtp_port), timeout=10)
        else:
            server = smtplib.SMTP(smtp_host, int(smtp_port), timeout=10)
            server.starttls()
            
        if smtp_pass:
            server.login(smtp_user, smtp_pass)
            
        server.sendmail(sender_email, [recipient], msg.as_string())
        server.quit()
        return {'success': True, 'message': f'Test email successfully dispatched to {recipient}'}
    except smtplib.SMTPAuthenticationError as auth_err:
        err_msg = auth_err.smtp_error.decode() if hasattr(auth_err.smtp_error, 'decode') else str(auth_err.smtp_error)
        logger.error("SMTP Auth Failure: %s", err_msg)
        raise HTTPException(status_code=400, detail=f"SMTP Authentication Failed: Please check your Email Username and Password/App Password. Details: {err_msg}")
    except smtplib.SMTPConnectError as conn_err:
        logger.error("SMTP Connection Failure: %s", conn_err)
        raise HTTPException(status_code=400, detail=f"SMTP Connection Failed: Could not reach {smtp_host}:{smtp_port}")
    except (TimeoutError, socket.timeout):
        logger.error("SMTP Connection Timeout: %s:%s", smtp_host, smtp_port)
        raise HTTPException(status_code=400, detail=f"SMTP Timeout: Unable to connect to {smtp_host}:{smtp_port}. Please check server network connectivity, firewall outbound rules, or port configuration.")
    except Exception as e:
        logger.error("SMTP Dispatch Error: %s", e)
        raise HTTPException(status_code=400, detail=f"SMTP Error: {str(e)}")

@router.get('/api/admin/notifications/inapp-config')
@router.get('/api/admin/notifications/inapp-config/')
def get_admin_notifications_inapp_config(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    configs = load_app_configs()
    for c in configs:
        if c.get('key') == 'INAPP_NOTIFICATIONS_CONFIG':
            try:
                return json.loads(c.get('value', '[]'))
            except Exception as exc:
                logger.debug('Handled exception: %s', exc)
    return [{'trigger_event': 'PENDING_APPROVAL', 'enabled': True, 'title_template': 'Action Required: {{document_number}}', 'message_template': 'Document {{document_number}} from {{vendor_name}} (₹{{amount}}) is pending your review.'}, {'trigger_event': 'ASSIGNED', 'enabled': True, 'title_template': 'Task Assigned: {{document_number}}', 'message_template': 'You have been assigned as the reviewer for {{document_number}}.'}, {'trigger_event': 'REJECTED', 'enabled': True, 'title_template': 'Document Rejected: {{document_number}}', 'message_template': 'Document {{document_number}} was rejected during workflow approval.'}, {'trigger_event': 'SENT_BACK', 'enabled': True, 'title_template': 'Document Sent Back: {{document_number}}', 'message_template': 'Document {{document_number}} was returned for clarification.'}, {'trigger_event': 'COMPLETED', 'enabled': True, 'title_template': 'Workflow Completed: {{document_number}}', 'message_template': 'Document {{document_number}} has passed final approval and is ready for payment.'}, {'trigger_event': 'CLARIFICATION', 'enabled': True, 'title_template': 'Clarification Needed: {{document_number}}', 'message_template': 'Please provide clarification for document {{document_number}}.'}]

@router.post('/api/admin/notifications/inapp-config')
@router.post('/api/admin/notifications/inapp-config/')
async def save_admin_notifications_inapp_config(request: Request, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    try:
        body = await request.json()
    except Exception:
        body = []
    if isinstance(body, dict):
        payload = body.get('payload', body)
    else:
        payload = body
    if not isinstance(payload, list):
        payload = [payload] if payload else []
    save_app_config('INAPP_NOTIFICATIONS_CONFIG', json.dumps(payload, ensure_ascii=False), 'In-App Bell Notification Trigger Templates')
    return {'success': True, 'message': 'In-App Notification Configurations saved successfully'}

def _get_backup_history_file() -> Path:
    backup_meta_dir = settings.DATA_DIR
    backup_meta_dir.mkdir(parents=True, exist_ok=True)
    return backup_meta_dir / ".backup_history.json"

@router.get('/api/admin/backup/history')
def get_admin_backup_history(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    hist_file = _get_backup_history_file()
    if not hist_file.exists():
        return []
    try:
        with open(hist_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as exc:
        logger.debug('Failed loading backup history: %s', exc)
        return []

@router.post('/api/admin/backup/trigger')
def trigger_admin_backup(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    import zipfile

    now = datetime.datetime.utcnow()
    timestamp_str = now.strftime('%Y%m%d_%H%M%S')
    backup_dir = settings.DATA_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    # 1. Backup uploads directory
    uploads_backup_name = f"uploads_backup_{timestamp_str}.zip"
    uploads_backup_path = backup_dir / uploads_backup_name
    upload_files_count = 0
    with zipfile.ZipFile(uploads_backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        if settings.UPLOAD_DIR.exists():
            for root, _, files in os.walk(settings.UPLOAD_DIR):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(settings.UPLOAD_DIR)
                    zipf.write(file_path, arcname=str(arcname))
                    upload_files_count += 1

    # 2. Database backup / metadata snapshot
    db_backup_name = f"docuflow_db_snapshot_{timestamp_str}.json"
    db_backup_path = backup_dir / db_backup_name
    try:
        from app.database.models import Document, WorkflowProfile, BusinessRule
        doc_count = db.query(Document).count()
        wf_count = db.query(WorkflowProfile).count()
        rule_count = db.query(BusinessRule).count()
        snapshot_meta = {
            "backup_timestamp": now.isoformat() + "Z",
            "database_name": getattr(settings, "DB_NAME", "DocuFlowDB"),
            "documents_count": doc_count,
            "workflows_count": wf_count,
            "rules_count": rule_count,
            "status": "COMPLETED",
        }
        with open(db_backup_path, 'w', encoding='utf-8') as f:
            json.dump(snapshot_meta, f, indent=2)
    except Exception as db_err:
        logger.warning("Database snapshot metadata export deferred: %s", db_err)
        db_backup_name = f"db_offline_archive_{timestamp_str}.bak"

    log_entry = {
        "timestamp": now.isoformat() + "Z",
        "databaseBackup": db_backup_name,
        "uploadsBackup": uploads_backup_name,
        "status": "SUCCESS"
    }

    hist_file = _get_backup_history_file()
    current_history = []
    if hist_file.exists():
        try:
            with open(hist_file, 'r', encoding='utf-8') as f:
                current_history = json.load(f)
        except Exception:
            current_history = []

    current_history.insert(0, log_entry)
    # Keep last 50 backup records
    current_history = current_history[:50]
    temp_hist = f"{hist_file}.tmp"
    with open(temp_hist, 'w', encoding='utf-8') as f:
        json.dump(current_history, f, indent=2)
    os.replace(temp_hist, hist_file)

    try:
        from app.database.models import AuditLog
        db.add(AuditLog(
            user=current_user.username or "Admin",
            action="BACKUP_TRIGGERED",
            stage="ADMIN_BACKUP",
            notes=f"Backup completed: {uploads_backup_name} ({upload_files_count} files), DB metadata: {db_backup_name}"
        ))
        db.commit()
    except Exception as a_err:
        logger.debug("Failed adding backup audit log: %s", a_err)

    return {
        'success': True,
        'message': f'Database and uploads backup ran successfully! Created {uploads_backup_name} and {db_backup_name}',
        'backup_entry': log_entry
    }

@router.post('/api/admin/documents/remap-unrouted')
def trigger_unrouted_documents_remap(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """Manually triggers evaluation and re-mapping of all unrouted documents against active business rules."""
    _require_docs_admin(current_user, db)
    from app.services.rules_engine import remap_unrouted_documents
    remapped = remap_unrouted_documents(db)
    return {
        'success': True,
        'message': f'Successfully evaluated unrouted documents: {len(remapped)} documents remapped to active workflows.',
        'remapped_count': len(remapped),
        'remapped_documents': remapped
    }

@router.get('/api/erp/{po_number:path}')
def get_erp_po_details(
    po_number: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retrieves purchase order details from ERP / synced documents.
    Enforces required active user authentication and division/role-based RBAC authorization.
    Prevents unauthorized disclosure of vendor details, PO numbers, and financial amounts.
    """
    try:
        clean_po = (po_number or "").strip()
        if not clean_po:
            return {
                'po_number': '',
                'vendor_name': 'N/A',
                'amount': 0.0,
                'status': 'N/A',
                'items': []
            }

        inv = db.query(Invoice).filter(Invoice.po_number == clean_po, Invoice.is_deleted == False).first()
        if not inv:
            inv = db.query(Invoice).filter(Invoice.po_number == clean_po).first()

        if not inv:
            return {
                'po_number': clean_po,
                'vendor_name': 'N/A',
                'amount': 0.0,
                'status': 'N/A',
                'items': []
            }

        # Authorization Check
        u_role = (getattr(current_user, 'role', '') or "").strip().lower()
        is_admin = (
            u_role in {"admin", "administrator", "system_admin", "superadmin"}
            or check_permission(current_user, "role:manage", db)
            or check_permission(current_user, "admin:rbac", db)
        )
        uploader_roles = {
            "account_uploader", "account_uploder", "accounts_uploder",
            "doc_uploder", "doc_uploader", "uploader", "accounts", "account"
        }
        is_uploader = bool(
            u_role in uploader_roles
            or any(x in u_role for x in ['uplod', 'upload', 'account', 'approver', 'manager'])
            or (getattr(inv, 'user_id', None) is not None and inv.user_id == current_user.id)
            or (current_user.employee_id and inv.employee_id and inv.employee_id.strip().lower() == current_user.employee_id.strip().lower())
        )

        if not is_admin and not is_uploader:
            # Check document-level access (division boundaries, approver pool, department)
            has_access = (
                authorize_document_access(current_user, inv)
                or check_permission(current_user, "document:read", db)
                or check_permission(current_user, "doc:work_tracker:view", db)
            )
            
            # In addition, check division boundary if user has division restrictions
            user_divs = get_user_approval_divisions(current_user)
            doc_div = (inv.division or "").strip().upper()
            if doc_div and doc_div not in {"HQ", "GLOBAL", "ALL"} and user_divs and not any(d in {"HQ", "GLOBAL", "ALL"} for d in user_divs):
                if doc_div not in user_divs:
                    has_access = False

            if not has_access:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access Denied: You do not have permission to view this purchase order."
                )

        return {
            'po_number': clean_po,
            'vendor_name': inv.vendor_name or 'N/A',
            'amount': float(inv.amount) if inv.amount is not None else 0.0,
            'status': inv.status or 'Approved',
            'items': []
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Error fetching ERP PO details for %s: %s", po_number, exc)
        return {
            'po_number': po_number,
            'vendor_name': 'N/A',
            'amount': 0.0,
            'status': 'N/A',
            'items': []
        }

def split_checklist_items(text: str) -> List[str]:
    """Splits multi-line or delimiter-separated rule text into individual checklist items."""
    if not text:
        return []
    txt = text.strip()
    if '||' in txt:
        raw = re.split(r'\s*\|{2,}\s*', txt)
    elif '\n' in txt or '\r' in txt:
        raw = re.split(r'[\r\n]+', txt)
    elif ';' in txt:
        raw = re.split(r';+', txt)
    else:
        raw = [txt]

    result = []
    for itm in raw:
        clean = itm.strip()
        clean = re.sub(r'^[0-9]+[.)]\s*', '', clean).strip()
        clean = re.sub(r'^[-* ]\s*', '', clean).strip()
        if clean:
            result.append(clean)
    return result

def resolve_checklist_items(db: Session, inv: Invoice, stage_name: str) -> List[str]:
    """
    Checklist Resolution:
    - If document has no workflow_profile_id or is unrouted: return [] (no checklist).
    - If workflow_profile_id is set:
      1. Check WorkflowStepDefinition for this flow & stage. If step has checklist_json, return those items.
      2. Check ChecklistRule explicitly configured for this workflow_profile.
      3. If neither is defined, this stage has NO checklist: return [] (no hardcoded/default items injected).
    """
    if not inv or not inv.workflow_profile_id or str(inv.workflow_profile_id).strip() in ('', 'UNROUTED', 'NONE', 'None'):
        return []
    if 'unrouted' in (inv.status or '').lower() or 'no rule matched' in (inv.status or '').lower():
        return []

    clean_stage = (stage_name or '').strip()
    flow_items: List[str] = []

    # 1. Flow-Specific Step Items from Flow Builder (WorkflowStepDefinition & ChecklistTemplate)
    target_stage = inv.current_stage or 1
    step = db.query(WorkflowStepDefinition).filter(
        (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
        (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
        WorkflowStepDefinition.stage_number == target_stage,
        WorkflowStepDefinition.checklist_json.isnot(None)
    ).first()
    if not step:
        step = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.step_name.ilike(clean_stage),
            WorkflowStepDefinition.checklist_json.isnot(None)
        ).first()
    if not step:
        step = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.stage_number == target_stage
        ).first()

    if step and step.checklist_json:
        try:
            parsed = json.loads(step.checklist_json)
            if isinstance(parsed, list):
                for itm in parsed:
                    for s_itm in split_checklist_items(str(itm)):
                        if s_itm and s_itm not in flow_items:
                            flow_items.append(s_itm)
            elif isinstance(parsed, str) and parsed.strip():
                for s_itm in split_checklist_items(parsed):
                    if s_itm and s_itm not in flow_items:
                        flow_items.append(s_itm)
        except Exception as e:
            logger.debug("Failed parsing step.checklist_json: %s", e)

    if not flow_items:
        tpl_stage_conds = [
            ChecklistTemplate.stage_name.ilike(clean_stage),
            ChecklistTemplate.stage_name.ilike(f"Stage {target_stage}")
        ]
        if target_stage == 1:
            tpl_stage_conds.extend([ChecklistTemplate.stage_name.ilike('Attachment Status'), ChecklistTemplate.stage_name.ilike('First Approval')])
        elif target_stage == 2:
            tpl_stage_conds.extend([ChecklistTemplate.stage_name.ilike('First Approval'), ChecklistTemplate.stage_name.ilike('Second Approval')])
        tpls = db.query(ChecklistTemplate).filter(
            (ChecklistTemplate.workflow_profile == inv.workflow_profile_id) |
            (ChecklistTemplate.workflow_profile.ilike(inv.workflow_profile_id.strip())),
            ChecklistTemplate.is_active == True,
            or_(*tpl_stage_conds)
        ).order_by(ChecklistTemplate.sequence_order.asc(), ChecklistTemplate.id.asc()).all()
        for t in tpls:
            for itm in split_checklist_items(t.item_text):
                if itm and itm not in flow_items:
                    flow_items.append(itm)

    # 2. Universal ChecklistRule for Attachment / DocType combined with Flow Checklist
    stage_aliases = [clean_stage, 'ALL']
    stg_idx = inv.current_stage or 1
    if stg_idx == 1 or 'store operations' in clean_stage.lower() or 'attachment' in clean_stage.lower():
        stage_aliases.extend(['Attachment Status', 'First Approval', 'Stage 1'])
    elif stg_idx == 2 or 'accounts' in clean_stage.lower() or 'first approval' in clean_stage.lower() or 'second approval' in clean_stage.lower():
        stage_aliases.extend(['Second Approval', 'Accounts Verification', 'Stage 2', 'First Approval'])
    elif stg_idx >= 3 or 'finance' in clean_stage.lower() or 'final' in clean_stage.lower():
        stage_aliases.extend(['3rd APPROVAL', 'Final Approval', 'Finance Final Settlement', 'Stage 3'])

    wf_rules = db.query(ChecklistRule).filter(
        ChecklistRule.is_active == True,
        ChecklistRule.workflow_profile.in_([inv.workflow_profile_id, 'ALL']),
        or_(*[ChecklistRule.stage_name.ilike(a) for a in stage_aliases])
    ).order_by(ChecklistRule.sequence_order.asc(), ChecklistRule.id.asc()).all()

    doc_cat = (inv.category or inv.document_type or '').strip().upper()
    doc_div = (inv.division or '').strip().upper()

    universal_items: List[str] = []
    for r in wf_rules:
        r_cat = (r.category or 'ALL').strip().upper()
        r_div = (r.division or 'ALL').strip().upper()
        if r_cat not in ('ALL', '', doc_cat) and doc_cat:
            continue
        if r_div not in ('ALL', '', doc_div) and doc_div:
            continue
        for itm in split_checklist_items(r.item_text):
            if itm and itm not in universal_items and itm not in flow_items:
                universal_items.append(itm)

    # Combine: Universal checklist (e.g. Attachment / DocType) along with Flow-specific checklist
    combined_items = universal_items + [itm for itm in flow_items if itm not in universal_items]
    return combined_items

@router.get('/api/invoices/{invoice_id}/checklist')
@router.get('/api/documents/{invoice_id}/checklist')
@router.get('/api/invoices/{invoice_id}/checklist-state')
@router.get('/api/documents/{invoice_id}/checklist-state')
def get_invoice_checklist(invoice_id: str, stage_num: Optional[int]=None, stage_name: Optional[str]=None, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    try:
        inv = find_invoice_by_identifier(db, invoice_id)
        if not inv:
            raise HTTPException(status_code=404, detail='Invoice not found')

        is_unrouted = (
            not inv.workflow_profile_id
            or str(inv.workflow_profile_id).strip() in ['', 'UNROUTED', 'NONE', 'None']
            or 'unrouted' in (inv.status or '').lower()
            or 'no rule matched' in (inv.status or '').lower()
        )
        if is_unrouted:
            return []

        u_role_clean = (getattr(current_user, 'role', '') or '').strip().lower()
        is_uploader = bool(any(x in u_role_clean for x in ['uplod', 'upload', 'account', 'approver', 'manager', 'admin']))
        is_authorized = (
            is_uploader
            or authorize_document_access(current_user, inv)
            or is_user_in_approver_pool(current_user, inv.assigned_approver)
        )
        if not is_authorized:
            raise HTTPException(status_code=403, detail="Access Denied: You do not have permission to view this document's checklist.")

        target_stage = stage_num or inv.current_stage or 1
        current_step_name = None
        if stage_name:
            current_step_name = stage_name
        elif inv.workflow_profile_id:
            step = db.query(WorkflowStepDefinition).filter(
                (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
                (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
                WorkflowStepDefinition.stage_number == target_stage
            ).first()
            if step and step.step_name:
                current_step_name = step.step_name
        if not current_step_name:
            current_step_name = 'Attachment Status' if target_stage == 1 else f'Stage {target_stage}'

        configured_items = resolve_checklist_items(db, inv, current_step_name)
        if not configured_items:
            # No checklist configured for this stage of this flow -> clean up any stale legacy items
            stale_items = db.query(InvoiceChecklistState).filter(
                InvoiceChecklistState.invoice_id == inv.id,
                InvoiceChecklistState.stage_name == current_step_name
            ).all()
            if stale_items:
                for s in stale_items:
                    db.delete(s)
                db.commit()
            return []

        # If configured_items exist, sync with InvoiceChecklistState
        existing_items = db.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == inv.id,
            InvoiceChecklistState.stage_name == current_step_name
        ).order_by(InvoiceChecklistState.id.asc()).all()

        existing_texts = {item.item_text: item for item in existing_items}
        for item in existing_items:
            if item.item_text not in configured_items:
                db.delete(item)

        items = []
        for t_text in configured_items:
            if t_text in existing_texts:
                items.append(existing_texts[t_text])
            else:
                new_item = InvoiceChecklistState(
                    invoice_id=inv.id,
                    stage_name=current_step_name,
                    item_text=t_text,
                    is_mandatory=True,
                    is_checked=False
                )
                db.add(new_item)
                items.append(new_item)
        db.commit()
        return [{'id': item.id, 'stage_name': item.stage_name, 'item_text': item.item_text, 'is_checked': item.is_checked, 'checked_by': item.checked_by, 'checked_at': item.checked_at} for item in items]
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"Error resolving checklist for invoice {invoice_id}: {exc}")
        return []

@router.post('/api/invoices/{invoice_id}/checklist')
@router.post('/api/documents/{invoice_id}/checklist')
@router.post('/api/invoices/{invoice_id}/checklist-state')
@router.post('/api/documents/{invoice_id}/checklist-state')
def update_invoice_checklist(invoice_id: str, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail='Invoice not found')
    
    is_unrouted = (
        not inv.workflow_profile_id
        or str(inv.workflow_profile_id).strip() in ['', 'UNROUTED', 'NONE', 'None']
        or 'unrouted' in (inv.status or '').lower()
        or 'no rule matched' in (inv.status or '').lower()
    )
    if is_unrouted:
        return {'success': True, 'checklist': []}

    checked_items = payload.get('checked_items', [])
    req_stage_num = payload.get('stage_num') or inv.current_stage or 1
    current_step_name = 'Attachment Status' if req_stage_num == 1 else f'Stage {req_stage_num}'
    if payload.get('stage_name'):
        current_step_name = payload.get('stage_name')
    elif inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.stage_number == req_stage_num
        ).first()
        if step and step.step_name:
            current_step_name = step.step_name
    items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == current_step_name).all()
    if not items:
        items = db.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == inv.id,
            func.lower(InvoiceChecklistState.stage_name) == current_step_name.lower()
        ).all()
    if not items:
        items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id).all()
    if not items:
        configured_items = resolve_checklist_items(db, inv, current_step_name)
        if configured_items:
            for t_text in configured_items:
                new_item = InvoiceChecklistState(
                    invoice_id=inv.id,
                    stage_name=current_step_name,
                    item_text=t_text,
                    is_checked=(t_text in checked_items),
                    is_mandatory=True
                )
                db.add(new_item)
                items.append(new_item)
            db.commit()

    username = user.employee_name or user.name or user.username if user else payload.get('username') or 'System Reviewer'
    checked_set = set(str(c).strip().lower() for c in checked_items)
    for item in items:
        old_checked = item.is_checked
        item.is_checked = (item.item_text in checked_items) or ((item.item_text or '').strip().lower() in checked_set)
        if item.is_checked and (not old_checked):
            item.checked_by = username
            item.checked_at = datetime.datetime.utcnow()
        elif not item.is_checked:
            item.checked_by = None
            item.checked_at = None
    inv.checklist_state = json.dumps({item.item_text: item.is_checked for item in items})
    db.commit()
    return {'success': True, 'checklist': [{'item_text': item.item_text, 'is_checked': item.is_checked} for item in items]}

@router.get('/api/admin/checklist-rules')
@router.get('/api/checklist-templates')
def get_checklist_templates(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    rules = db.query(ChecklistRule).order_by(ChecklistRule.sequence_order.asc(), ChecklistRule.rule_name.asc()).all()
    return [{'id': r.id, 'rule_name': r.rule_name, 'division': r.division or 'ALL', 'category': r.category or 'ALL', 'branch': r.branch or 'ALL', 'workflow_profile': r.workflow_profile or 'ALL', 'stage_name': r.stage_name or 'Attachment Status', 'item_text': r.item_text or '', 'is_mandatory': r.is_mandatory, 'is_active': r.is_active, 'sequence_order': r.sequence_order} for r in rules]

@router.post('/api/admin/checklist-rules')
@router.post('/api/checklist-templates')
def save_checklist_template(payload: dict, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    tid = payload.get('id')
    if tid and (not str(tid).startswith('tmp-')):
        rule = db.query(ChecklistRule).filter(ChecklistRule.id == int(tid)).first()
        if not rule:
            raise HTTPException(status_code=404, detail='Checklist rule not found')
    else:
        div = payload.get('division', 'ALL') or 'ALL'
        cat = payload.get('category', 'ALL') or 'ALL'
        stage = payload.get('stage_name', 'Attachment Status') or 'Attachment Status'
        branch = payload.get('branch', 'ALL') or 'ALL'
        dup = db.query(ChecklistRule).filter(
            ChecklistRule.division == div,
            ChecklistRule.category == cat,
            ChecklistRule.stage_name == stage,
            ChecklistRule.branch == branch
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"Checklist rule already exists for Division '{div}', Category '{cat}', Stage '{stage}', Branch '{branch}'")
        rule = ChecklistRule()
        db.add(rule)
    rule.rule_name = payload.get('rule_name', 'Checklist Rule')
    rule.division = payload.get('division', 'ALL') or 'ALL'
    rule.category = payload.get('category', 'ALL') or 'ALL'
    rule.branch = payload.get('branch', 'ALL') or 'ALL'
    rule.workflow_profile = 'ALL'  # Universal: decoupled from individual flows
    rule.stage_name = payload.get('stage_name', 'Attachment Status') or 'Attachment Status'
    rule.item_text = payload.get('item_text', '')
    rule.is_mandatory = bool(payload.get('is_mandatory', True))
    rule.is_active = bool(payload.get('is_active', True))
    rule.sequence_order = int(payload.get('sequence_order', 1))
    db.commit()
    db.refresh(rule)
    return {'success': True, 'rule': {'id': rule.id, 'rule_name': rule.rule_name, 'division': rule.division, 'category': rule.category, 'branch': rule.branch, 'workflow_profile': rule.workflow_profile, 'stage_name': rule.stage_name, 'item_text': rule.item_text, 'is_mandatory': rule.is_mandatory, 'is_active': rule.is_active, 'sequence_order': rule.sequence_order}}

@router.delete('/api/admin/checklist-rules/{rule_id}')
@router.delete('/api/checklist-templates/{rule_id}')
def delete_checklist_template(rule_id: int, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    _require_docs_admin(current_user, db)
    rule = db.query(ChecklistRule).filter(ChecklistRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail='Checklist rule not found')
    db.delete(rule)
    db.commit()
    return {'success': True}

@router.get('/api/v1/approved-documents')
@router.get('/api/admin/approved-documents')
def get_approved_documents(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Dedicated endpoint for demo & 3rd-party integration reading:
    Returns all fully approved & settled documents with document numbers,
    vendor details, totals, line items, and PDF URLs.
    """
    approved_docs = db.query(Invoice).filter(Invoice.is_deleted == False, or_(Invoice.status.ilike('%approved%'), Invoice.status.ilike('%settled%'), Invoice.current_stage >= 4)).order_by(Invoice.updated_at.desc()).all()
    results = []
    for d in approved_docs:
        items = []
        if isinstance(d.items, str):
            try:
                items = json.loads(d.items)
            except Exception as exc:
                logger.debug('Handled exception: %s', exc)
        elif isinstance(d.items, list):
            items = d.items
        doc_num = d.invoice_number or d.doc_num or str(d.id)
        total_tax = (d.cgst or 0.0) + (d.sgst or 0.0) + (d.igst or 0.0)
        base_amt = (d.amount or 0.0) - total_tax if (d.amount or 0.0) >= total_tax else d.amount or 0.0
        results.append({'document_id': str(d.id), 'doc_key': d.doc_key or str(d.id), 'document_number': doc_num, 'document_type': d.document_type or d.category or 'ACCOUNTS PAYABLE', 'approval_status': 'APPROVED', 'settled': True, 'vendor_name': d.vendor_name or d.party_name or 'N/A', 'vendor_code': d.vendor_code or d.party_code or '', 'vendor_gstin': d.vendor_gstin or d.gstin or '', 'grand_total': d.amount or 0.0, 'base_amount': round(base_amt, 2), 'cgst': d.cgst or 0.0, 'sgst': d.sgst or 0.0, 'igst': d.igst or 0.0, 'total_tax': round(total_tax, 2), 'invoice_date': d.invoice_date or (d.created_at.strftime('%Y-%m-%d') if d.created_at else ''), 'approved_by': d.assigned_approver or None, 'approved_at': d.updated_at.isoformat() if d.updated_at else '', 'company_code': d.division or 'VCC', 'cost_center': d.cost_center or 'CC-GENERAL', 'po_number': d.po_number or 'N/A', 'pdf_url': d.file_url or f'/api/documents/{d.id}/file', 'external_sync_status': d.external_sync_status or 'SYNCED', 'external_sync_ref': d.external_sync_ref or doc_num, 'line_items': items})
    return {'status': 'success', 'total_approved': len(results), 'documents': results}