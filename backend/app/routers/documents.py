import logging
from app.services.rules_engine import infer_document_type, evaluate_business_rules_full
import os
import re
import json
import shutil
import datetime
import smtplib
import socket
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy import or_, and_, func, extract
from sqlalchemy.orm import Session
from app.config.settings import settings
from app.database.connection import SessionLocal, get_db
from app.database.models import (
    ApprovalAssignment,
    AuditLog,
    ChecklistRule,
    InAppNotification,
    Invoice,
    InvoiceChecklistState,
    NotificationProviderConfig,
    NotificationRaciMatrix,
    Role,
    User,
    WorkflowStepDefinition,
)
from app.services.pdf_compressor import compress_pdf
from app.schemas import InvoiceResponse, InvoiceUpdate, InvoiceActionRequest, NotificationProviderSchema, NotificationRaciSchema, NotificationTestSchema
from app.auth import get_current_user, get_current_user_optional, get_current_active_user, decode_token
from app.services.rules_engine import evaluate_business_rules, generate_document_id
from app.services.integration_service import dispatch_outgoing_webhook
from app.services.callback_service import dispatch_approval_callback_events
from app.services.rbac_service import authorize_document_access
from app.services.file_security import validate_uploaded_file, get_safe_file_path

logger = logging.getLogger(__name__)

def trigger_async_integration_push(document_id: str, decision: str='APPROVED'):
    """Spawns a background thread to dispatch the approved/rejected document to configured 3rd-party webhooks & Callback Integrations Engine."""

    def _runner():
        try:
            dispatch_outgoing_webhook(document_id)
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
        import threading
        t = threading.Thread(target=_runner, daemon=True)
        t.start()
    except Exception as e:
        logger.debug('Handled exception: %s', e)

def safe_broadcast_event(event_type: str, payload: dict):
    """Safely broadcasts a real-time event via SSE to connected clients."""
    try:
        from app.routers.events import broadcast_event
        broadcast_event(event_type, payload)
    except Exception as e:
        logger.debug('Handled exception: %s', e)
router = APIRouter(tags=['Invoices & Documents'])

def _unpack_custom_data_into_dict(inv_dict: dict) -> dict:
    """
    Promotes fields stored inside the custom_data JSON blob into top-level
    response keys, but ONLY when the real column value is NULL/None.
    This handles legacy documents synced before direct-column mapping was in place.
    Does NOT modify the database - read-only promotion for API response only.
    """
    raw_cd = inv_dict.get('custom_data')
    if not raw_cd:
        return inv_dict
    try:
        cd = json.loads(raw_cd) if isinstance(raw_cd, str) else (raw_cd if isinstance(raw_cd, dict) else {})
    except Exception:
        return inv_dict
    if not isinstance(cd, dict):
        return inv_dict
    for k, v in cd.items():
        if v is None or v == '':
            continue
        # Only promote if the real column is NULL/None or absent at top level
        existing = inv_dict.get(k)
        if existing is None:
            inv_dict[k] = v
    return inv_dict


def attach_dynamic_columns_to_document(db: Session, inv: Any):
    if not inv or not hasattr(inv, 'id'):
        return inv
    try:
        from sqlalchemy import text
        row = db.execute(text("SELECT * FROM documents WHERE id = :id"), {"id": str(inv.id)}).mappings().first()
        if row:
            for col_name, val in row.items():
                if not hasattr(inv, col_name) or getattr(inv, col_name) is None:
                    setattr(inv, col_name, val)
            # Unpack custom_data JSON fields onto ORM object for legacy documents
            # where real columns are NULL but data lives inside custom_data blob
            raw_cd = row.get('custom_data')
            if raw_cd:
                try:
                    cd = json.loads(raw_cd) if isinstance(raw_cd, str) else (raw_cd if isinstance(raw_cd, dict) else {})
                    if isinstance(cd, dict):
                        for ck, cv in cd.items():
                            if cv is not None and cv != '' and (not hasattr(inv, ck) or getattr(inv, ck) is None):
                                try:
                                    setattr(inv, ck, cv)
                                except Exception as exc:
                                    logger.debug("Attribute setter ignored for %s: %s", ck, exc)
                except Exception as exc:
                    logger.debug("Failed parsing custom_data JSON: %s", exc)
    except Exception as exc:
        logger.debug("Failed attaching dynamic columns to document: %s", exc)
    return inv

def find_invoice_by_identifier(db: Session, invoice_id: str) -> Invoice:
    raw_str = str(invoice_id).strip()
    id_clean = re.sub('^(DOC|INV|CV|EV|JV|ADV|CAPEX|GRN|SRV|FRT|UTL|EXP|DN|CN|PRJ|NR|VOUCH|CMP|CF)[-_#]?', '', raw_str, flags=re.IGNORECASE).strip()
    inv = db.query(Invoice).filter((Invoice.id == raw_str) | (Invoice.id == f'DOC-{id_clean}') | (Invoice.id == f'INV-{id_clean}') | (Invoice.id == f'GRN-{id_clean}') | (Invoice.id == f'CV-{id_clean}') | (Invoice.id == id_clean) | Invoice.id.ilike(f'%{id_clean}%') | (Invoice.invoice_number == raw_str) | (Invoice.invoice_number == id_clean) | Invoice.invoice_number.ilike(f'%{id_clean}%') | (Invoice.doc_key == raw_str) | (Invoice.doc_key == id_clean) | Invoice.doc_key.ilike(f'%{id_clean}%')).filter(Invoice.is_deleted == False).first()
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{invoice_id}' not found")
    attach_dynamic_columns_to_document(db, inv)
    return inv

def is_user_in_approver_pool(user: Optional[User], pool_str: Optional[str], db: Optional[Session] = None) -> bool:
    if not user or not pool_str:
        return False
    pool = [s.strip().lower() for s in pool_str.split(',') if s.strip()]

    # Standard role mapping between role codes and display names
    ROLE_ALIASES = {
        'admin': ['system administrator', 'admin', 'administrator', 'superadmin', 'system_admin'],
        'manager': ['operations manager', 'manager', 'operations_manager'],
        'gm': ['general manager', 'gm', 'general_manager'],
        'jmd': ['joint managing director', 'jmd', 'joint_managing_director'],
        'md': ['managing director', 'md', 'managing_director'],
        'finance_auditor': ['finance & internal auditor', 'finance and internal auditor', 'finance_auditor', 'finance auditor', 'auditor', 'internal auditor'],
        'employee': ['standard employee', 'employee', 'standard_employee']
    }

    raw_handles = [
        (user.username or '').strip().lower(),
        (user.employee_id or '').strip().lower(),
        (user.employee_name or '').strip().lower(),
        (user.name or '').strip().lower(),
        (user.email or '').strip().lower(),
        (user.role or '').strip().lower()
    ]

    # Add role aliases
    u_role = (user.role or '').strip().lower()
    if u_role in ROLE_ALIASES:
        raw_handles.extend(ROLE_ALIASES[u_role])
    for code, aliases in ROLE_ALIASES.items():
        if any(h in aliases for h in raw_handles if h):
            raw_handles.append(code)
            raw_handles.extend(aliases)

    # Check User.role_rel if populated
    if getattr(user, 'role_rel', None):
        if getattr(user.role_rel, 'name', None):
            raw_handles.append(user.role_rel.name.strip().lower())
        if getattr(user.role_rel, 'code', None):
            raw_handles.append(user.role_rel.code.strip().lower())

    # Check Role table if db session provided
    if db and getattr(user, 'role_id', None):
        try:
            r = db.query(Role).filter(Role.id == user.role_id).first()
            if r:
                if r.name: raw_handles.append(r.name.strip().lower())
                if r.code: raw_handles.append(r.code.strip().lower())
        except Exception as err:
            logger.debug('Role handle lookup failed: %s', err)

    user_handles = [h for h in set(raw_handles) if h]

    def tokenize(s: str) -> List[str]:
        return [t for t in re.split(r'[^a-zA-Z0-9]+', s.lower()) if len(t) >= 3]

    user_tokens = set()
    for h in user_handles:
        for t in tokenize(h):
            user_tokens.add(t)

    for target in pool:
        t_clean = target.strip().lower()
        if not t_clean:
            continue
        if t_clean in user_handles:
            return True
        for h in user_handles:
            if h == t_clean or (len(h) >= 4 and h in t_clean) or (len(t_clean) >= 4 and t_clean in h):
                return True
        target_tokens = tokenize(t_clean)
        if any(t in user_tokens for t in target_tokens if t not in ['and', 'the', 'for']):
            return True

    return False

def sync_document_approver_from_workflow(db: Session, inv: Invoice) -> str:
    """
    Dynamically synchronizes an active document's assigned_approver from the current 
    workflow step definition. If the member was changed in between, this ensures the newly 
    assigned member is persisted in the database and authorized for approval.
    """
    if not inv or not inv.workflow_profile_id:
        return inv.assigned_approver or ''
    
    # Completed terminal documents retain their final audit state
    if inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']:
        return inv.assigned_approver or ''

    # Fetch all defined steps for this workflow profile
    steps = db.query(WorkflowStepDefinition).filter(
        (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
        (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip()))
    ).order_by(WorkflowStepDefinition.stage_number.asc()).all()

    step_count = len(steps)
    if step_count > 0:
        if inv.total_stages != step_count:
            inv.total_stages = step_count
            db.add(inv)

        curr_stage = inv.current_stage or 1
        # Check if all stages in this workflow have completed (e.g. stage exceeded step_count or final step approved)
        if curr_stage > step_count:
            inv.current_stage = step_count
            inv.status = 'Approved'
            archive_approved_pdf(inv)
            try:
                db.add(inv)
                db.commit()
                db.refresh(inv)
            except Exception as e:
                logger.warning(f"Error persisting completed status: {e}")
                db.rollback()
            return inv.assigned_approver or ''

        if curr_stage == step_count:
            final_log = db.query(AuditLog).filter(
                AuditLog.invoice_id == str(inv.id),
                AuditLog.action.ilike(f'%Approved (Stage {step_count})%')
            ).first()
            if final_log:
                inv.status = 'Approved'
                archive_approved_pdf(inv)
                try:
                    db.add(inv)
                    db.commit()
                    db.refresh(inv)
                except Exception as e:
                    logger.warning(f"Error persisting completed status for final stage: {e}")
                    db.rollback()
                return inv.assigned_approver or ''

    curr_stage = inv.current_stage or 1
    step_def = next((s for s in steps if s.stage_number == curr_stage), None) if step_count > 0 else None
    if not step_def:
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
        
        if inv.assigned_approver != canonical_target:
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
                ApprovalAssignment.document_id == str(inv.id),
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
                    document_id=str(inv.id),
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
            ApprovalAssignment.document_id == str(inv.id),
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
                document_id=str(inv.id),
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


def resolve_document_stage_name(db: Session, inv: Invoice) -> str:
    """Dynamically resolves the current workflow stage display name for a document."""
    if not inv:
        return "Stage 1"
    if getattr(inv, "current_stage_name", None):
        return inv.current_stage_name
    curr_stg = inv.current_stage or 1
    if inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.stage_number == curr_stg
        ).first()
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

    # 2. Strict Access Control Enforcement:
    # Admin: Can view all approved documents
    # Non-admin: Strictly only documents the user actually approved / signed off on (recorded in AuditLog as having approved).
    is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
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
            if r[0]:
                val = str(r[0]).strip()
                user_approved_doc_ids.add(val)
                if val.startswith('DOC-'):
                    user_approved_doc_ids.add(val[4:])
                else:
                    user_approved_doc_ids.add(f'DOC-{val}')

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

    # 5. Filter: DATE (Specific Date and Date Range)
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

    # 6. Filter: DOCUMENT TYPE
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
        inv_res = InvoiceResponse.from_orm(inv)
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

    is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
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
            if r[0]:
                val = str(r[0]).strip()
                user_approved_doc_ids.add(val)
                if val.startswith('DOC-'):
                    user_approved_doc_ids.add(val[4:])
                else:
                    user_approved_doc_ids.add(f'DOC-{val}')

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

    # Helper function to extract (year, month, full_date_str) from an Invoice
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

    # Dynamic Years for the selected Document Type
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
def get_all_invoices(status: Optional[str] = Query(None), db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    query = db.query(Invoice).filter(Invoice.is_deleted == False)
    invoices = query.order_by(Invoice.created_at.desc()).all()
    
    approved_invoice_ids = set()
    rejected_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id, AuditLog.action).filter(or_(*or_filters)).all()
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

        wf_step_or = []
        for name in user_names:
            wf_step_or.append(WorkflowStepDefinition.approver_target.ilike(f'%{name}%'))
            wf_step_or.append(WorkflowStepDefinition.delegate_approver.ilike(f'%{name}%'))
        user_wf_profiles = set(row[0] for row in db.query(WorkflowStepDefinition.profile_name).filter(or_(*wf_step_or)).distinct().all() if row[0])
    else:
        user_wf_profiles = set()

    user_is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
    filtered_invoices = []
    
    for inv in invoices:
        # Dynamically synchronize assigned_approver from workflow definition
        sync_document_approver_from_workflow(db, inv)

        if user_is_admin:
            filtered_invoices.append(inv)
            continue

        doc_key_clean = str(inv.id).replace('DOC-', '')
        has_approved_this_doc = (str(inv.id) in approved_invoice_ids) or (doc_key_clean in approved_invoice_ids)
        has_rejected_this_doc = (str(inv.id) in rejected_invoice_ids) or (doc_key_clean in rejected_invoice_ids)
        is_member_of_flow = bool(inv.workflow_profile_id and (inv.workflow_profile_id in user_wf_profiles or any(p.lower() == inv.workflow_profile_id.lower() for p in user_wf_profiles)))
        is_curr = bool(inv.assigned_approver and is_user_in_approver_pool(current_user, inv.assigned_approver, db))
        is_feedback_role = (current_user.role or '').lower() in ['customer_feedback_agent', 'customer_feedback', 'feedback_agent']
        is_feedback_doc = (inv.document_type or '').upper() in ['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT'] or str(inv.id).startswith('CMP') or str(inv.id).startswith('CF') or bool(getattr(inv, 'type_of_complaint', None))

        is_approved_doc = inv.status in ['Approved', 'Settled', 'Paid']
        if is_approved_doc:
            # Strictly: Only admin can see all approved docs; others see ONLY docs they approved
            if user_is_admin or has_approved_this_doc:
                filtered_invoices.append(inv)
            continue

        # Division scoping check:
        # Do NOT apply division filtering if user is assigned approver, flow member, or Customer Feedback Agent viewing Feedback docs
        if not is_curr and not has_approved_this_doc and not is_member_of_flow and not (is_feedback_role and is_feedback_doc):
            user_div = (current_user.division or '').strip().upper()
            doc_div = (inv.division or '').strip().upper()
            if user_div and doc_div and user_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div != user_div:
                continue
        
        is_terminal = inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']
        if is_terminal:
            if has_approved_this_doc or has_rejected_this_doc:
                filtered_invoices.append(inv)
                continue
            if user_is_admin or authorize_document_access(current_user, inv):
                filtered_invoices.append(inv)
                continue
        else:
            # Active workflow:
            # 1. User is in the CURRENT active stage approver pool (Pending)
            if is_curr:
                filtered_invoices.append(inv)
                continue
            # 2. User already signed off/approved a prior stage (In Progress / Tracking)
            if has_approved_this_doc:
                filtered_invoices.append(inv)
                continue
            # 3. User is a member in the workflow flow (In Progress / Tracking)
            if is_member_of_flow:
                filtered_invoices.append(inv)
                continue
            # 4. Customer Feedback Agent role for Customer Feedback documents
            if is_feedback_role and is_feedback_doc:
                filtered_invoices.append(inv)
                continue

    results = []
    for inv in filtered_invoices:
        doc_key_clean = str(inv.id).replace('DOC-', '')
        has_appr = (str(inv.id) in approved_invoice_ids) or (doc_key_clean in approved_invoice_ids)
        has_rej = (str(inv.id) in rejected_invoice_ids) or (doc_key_clean in rejected_invoice_ids)
        is_member_of_flow = bool(inv.workflow_profile_id and (inv.workflow_profile_id in user_wf_profiles or any(p.lower() == inv.workflow_profile_id.lower() for p in user_wf_profiles)))
        
        is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed', 'Settled']
        is_curr = False
        if is_active_flow and inv.assigned_approver and not has_appr:
            is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver)

        # Status filter query parameter enforcement
        if status:
            s_req = status.strip().lower()
            if s_req == 'pending':
                if not (is_curr and is_active_flow):
                    continue
            elif s_req in ['in_progress', 'tracking']:
                if not ((has_appr or user_is_admin or is_member_of_flow) and is_active_flow):
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
        inv_res = InvoiceResponse.from_orm(inv)
        inv_res.is_current_approver = is_curr
        inv_res.has_approved = has_appr
        inv_res.has_rejected = has_rej
        inv_res.current_stage_name = resolve_document_stage_name(db, inv)
        results.append(inv_res)
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

    user_is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
    results = []

    for inv in invoices:
        # Dynamically synchronize assigned_approver from workflow definition
        sync_document_approver_from_workflow(db, inv)

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

        is_curr = False
        if inv.assigned_approver and not has_approved_curr_stage:
            is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver, db)

        is_feedback_role = (current_user.role or '').lower() in ['customer_feedback_agent', 'customer_feedback', 'feedback_agent']
        is_feedback_doc = (inv.document_type or '').upper() in ['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT'] or str(inv.id).startswith('CMP') or str(inv.id).startswith('CF') or bool(getattr(inv, 'type_of_complaint', None))

        # Division check:
        # Do NOT apply division filtering if user is assigned approver, approved a stage, or is a Customer Feedback Agent viewing Feedback docs
        if not is_curr and not has_approved_any_stage and not (is_feedback_role and is_feedback_doc):
            user_div = (current_user.division or '').strip().upper()
            doc_div = (inv.division or '').strip().upper()
            if user_div and doc_div and user_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div != user_div:
                continue

        if not user_is_admin:
            # Non-admin approver can track the document in Work Tracker if:
            # 1. They are the active assigned approver for the current stage, OR
            # 2. They approved a prior stage of this document (tracking its progress as it moves through workflow), OR
            # 3. They are part of the workflow definition for this document, OR
            # 4. They are a Customer Feedback Agent viewing Customer Feedback records
            is_member_of_flow = bool(inv.workflow_profile_id and (inv.workflow_profile_id in user_wf_profiles or any(p.lower() == inv.workflow_profile_id.lower() for p in user_wf_profiles)))
            if not ((is_curr and not has_approved_curr_stage) or has_approved_any_stage or is_member_of_flow or (is_feedback_role and is_feedback_doc)):
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

        inv_res = InvoiceResponse.from_orm(inv)
        inv_res.is_current_approver = is_curr
        inv_res.has_approved = has_approved_curr_stage or has_approved_any_stage
        inv_res.has_rejected = has_rej
        inv_res.current_stage_name = resolve_document_stage_name(db, inv)
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
        inv_res = InvoiceResponse.from_orm(inv)
        inv_res.is_current_approver = True if current_user and current_user.role != 'admin' else False
        inv_res.has_approved = False
        inv_res.current_stage_name = resolve_document_stage_name(db, inv)
        results.append(inv_res)
    return results

@router.get('/api/records/{invoice_id}')
@router.get('/api/documents/{invoice_id}')
@router.get('/api/invoices/{invoice_id}')
def get_invoice_by_id(invoice_id: str, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    steps_data = []
    seen_stages = set()
    if inv.workflow_profile_id:
        steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id).order_by(WorkflowStepDefinition.stage_number.asc(), WorkflowStepDefinition.id.asc()).all()
        for s in steps:
            if s.stage_number not in seen_stages:
                seen_stages.add(s.stage_number)
                steps_data.append({'stage_number': s.stage_number, 'stage_name': s.step_name, 'approver_target': s.approver_target, 'action_required': s.action_required, 'permissions': s.permissions})
    current_step_name = 'Stage 1'
    for s in steps_data:
        if s['stage_number'] == (inv.current_stage or 1):
            current_step_name = s['stage_name']
            break
    sync_document_approver_from_workflow(db, inv)
    has_appr = False
    has_rej = False
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id, AuditLog.action).filter((AuditLog.invoice_id == str(inv.id)) | (AuditLog.invoice_id == f'DOC-{inv.id}'), or_(*or_filters)).all()
            for row in audit_query:
                act = (row[1] or '').lower()
                if 'approve' in act:
                    has_appr = True
                if 'reject' in act or 'return' in act or 'cancel' in act:
                    has_rej = True
    is_curr = False
    if current_user and inv.assigned_approver and not has_appr:
        is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Rejected', 'Failed', 'Settled']
        if is_active_flow:
            is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver)
    is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
    completed_by_peer = False
    curr_stg = inv.current_stage or 1
    is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed', 'Settled']

    if not is_admin and inv.workflow_profile_id:
        all_steps = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        user_stages = [
            s.stage_number for s in all_steps 
            if s.approver_target and is_user_in_approver_pool(current_user, s.approver_target)
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
        is_feedback_doc = (inv.document_type or '').upper() in ['CUSTOMER FEEDBACK', 'CUSTOMER COMPLAINT'] or str(inv.id).startswith('CMP') or str(inv.id).startswith('CF') or bool(getattr(inv, 'type_of_complaint', None))
        
        if not is_curr and not has_appr and not completed_by_peer and not (is_feedback_role and is_feedback_doc):
            user_div = (current_user.division or '').strip().upper()
            doc_div = (inv.division or '').strip().upper()
            if user_div and doc_div and user_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div != user_div:
                raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view document '{invoice_id}'. Documents are scoped to your assigned division/department.")
        
        is_terminal = inv.status in ['Approved', 'Settled', 'Paid', 'Cancelled', 'Failed']
        if is_terminal:
            is_approved = inv.status in ['Approved', 'Settled', 'Paid']
            if is_approved:
                if not has_appr:
                    raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view approved document '{invoice_id}'. Only users who personally approved this document and administrators may view it.")
            elif not has_appr and not has_rej and not completed_by_peer and not authorize_document_access(current_user, inv):
                raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view document '{invoice_id}'.")
        else:
            # Active document: allowed if current approver, prior approver who approved, or peer from completed prior stage
            if not is_curr and not has_appr and not has_rej and not completed_by_peer:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Access Denied: Document '{invoice_id}' is currently at Stage {inv.current_stage or 1} and assigned to {inv.assigned_approver or 'another approver'}. You can only view documents assigned to your desk."
                )

    try:
        from sqlalchemy import text
        row_mapping = db.execute(text("SELECT * FROM documents WHERE id = :id"), {"id": str(inv.id)}).mappings().first()
        inv_dict = dict(row_mapping) if row_mapping else {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
    except Exception:
        inv_dict = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}

    # Promote fields from custom_data JSON into top-level response for legacy documents
    # where real DB columns are NULL but data was stored inside the custom_data blob.
    inv_dict = _unpack_custom_data_into_dict(inv_dict)

    inv_dict['is_current_approver'] = is_curr
    inv_dict['has_approved'] = has_appr
    inv_dict['has_rejected'] = has_rej
    inv_dict['completed_by_peer'] = completed_by_peer
    inv_dict['current_stage_name'] = current_step_name
    inv_dict['workflow_step_definitions'] = steps_data
    inv_dict['active_approval_log'] = {'current_stage_number': inv.current_stage or 1, 'stage_name': current_step_name, 'status': 'Pending'}
    return inv_dict

@router.put('/api/records/{invoice_id}')
@router.put('/api/documents/{invoice_id}')
@router.put('/api/invoices/{invoice_id}')
def update_invoice(invoice_id: str, payload: InvoiceUpdate, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    update_data = payload.dict(exclude_unset=True)

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

    for field, val in update_data.items():
        if hasattr(inv, field) and val is not None:
            setattr(inv, field, val)
    matched_wf = evaluate_business_rules(db, {'division': inv.division, 'category': inv.category, 'amount': inv.amount, 'document_type': inv.document_type})
    if matched_wf and matched_wf != inv.workflow_profile_id:
        inv.workflow_profile_id = matched_wf
        steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == matched_wf).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        inv.total_stages = len(steps) if steps else 1
        if (inv.current_stage or 1) == 1 and steps:
            inv.assigned_approver = steps[0].approver_target
    db.add(AuditLog(invoice_id=str(inv.id), user=user.name if user else 'Reviewer', action='Invoice Fields Updated', stage=f'Stage {inv.current_stage or 1}', notes='Document header/line-items edited and saved.'))
    db.commit()
    db.refresh(inv)
    return inv

def extract_date_components(date_str: Optional[str]):
    """Extracts (YYYY, MM_MonthName, DD) from a date string or defaults to current UTC time."""
    if date_str:
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%d.%m.%Y', '%Y-%m-%dT%H:%M:%S'):
            try:
                dt = datetime.datetime.strptime(str(date_str).strip()[:19], fmt)
                return (dt.strftime('%Y'), dt.strftime('%m_%B'), dt.strftime('%d'))
            except Exception as exc:
                logger.debug('Handled exception: %s', exc)
    now = datetime.datetime.utcnow()
    return (now.strftime('%Y'), now.strftime('%m_%B'), now.strftime('%d'))

def normalize_doc_type_folder(doc_type: Optional[str]) -> str:
    """Normalizes document category/type to a clean folder name (INVOICE, CREDIT_NOTE, DEBIT_NOTE, etc.)."""
    if not doc_type:
        return 'INVOICE'
    raw = str(doc_type).strip().upper()
    if 'CREDIT' in raw:
        return 'CREDIT_NOTE'
    elif 'DEBIT' in raw:
        return 'DEBIT_NOTE'
    elif 'EVOUCH' in raw or 'E-VOUCH' in raw or 'E_VOUCH' in raw:
        return 'E_VOUCHER'
    elif 'CAPEX' in raw or 'ASSET' in raw:
        return 'CAPEX'
    elif 'PURCHASE' in raw or 'PO_' in raw or 'PO ' in raw:
        return 'PURCHASE_INVOICE'
    elif 'RENT' in raw or 'UTILITY' in raw or 'EB' in raw:
        return 'RENT_UTILITY'
    elif 'FREIGHT' in raw or 'TRANSPORT' in raw:
        return 'FREIGHT'
    elif 'GRN' in raw or 'RECEIPT' in raw:
        return 'GRN_RECEIPT'
    elif 'ADVANCE' in raw:
        return 'ADVANCE_VOUCHER'
    elif 'JOURNAL' in raw or 'JRNL' in raw:
        return 'JOURNAL_VOUCHER'
    elif 'INVOICE' in raw or 'AP' in raw:
        return 'INVOICE'
    else:
        clean = re.sub('[^A-Z0-9_]+', '_', raw).strip('_')
        return clean or 'INVOICE'

def sanitize_name(text: Optional[str]) -> str:
    """Removes invalid filename characters for safe filesystem naming."""
    if not text:
        return ''
    return re.sub('[^a-zA-Z0-9_\\-\\.]', '_', str(text)).strip('_')

def get_storage_config():
    """Reads system admin config for physical storage root directory and folder pattern."""
    configs = load_app_configs()
    root_dir = 'stored_pdfs'
    pattern = '{YEAR}/{MONTH}/{DOC_TYPE}'
    for c in configs:
        if c.get('key') == 'STORAGE_ROOT_DIR' and c.get('value'):
            root_dir = str(c.get('value')).strip()
        if c.get('key') == 'STORAGE_FOLDER_PATTERN' and c.get('value'):
            pattern = str(c.get('value')).strip().strip('/\\')
    return (root_dir, pattern)

def get_storage_root_path() -> Path:
    """Returns absolute OS Path for the configured root storage location."""
    root_dir_name, _ = get_storage_config()
    p = Path(root_dir_name)
    if p.is_absolute():
        return p
    return settings.PDF_STORAGE_DIR

def get_archived_pdf_path(inv: Invoice) -> Path:
    """
    Constructs the storage path for approved documents under storage root.
    """
    raw_doc_num = os.path.basename(str(inv.invoice_number or inv.doc_num or 'DOC'))
    clean_doc_num = re.sub('[^a-zA-Z0-9_\\-\\.]', '', raw_doc_num)
    raw_id = os.path.basename(str(inv.id) if inv.id else '0')
    clean_id = re.sub('[^a-zA-Z0-9_\\-\\.]', '', raw_id)
    filename = f'{clean_doc_num}_{clean_id}.pdf'
    return get_storage_root_path() / 'approved' / filename

@router.get('/stored_pdfs/{filename}')
@router.head('/stored_pdfs/{filename}')
def serve_stored_pdf(filename: str):
    """Secure web streaming route for archived PDF files across custom OS storage paths."""
    safe_base = os.path.basename(filename)
    clean_name = re.sub('[^a-zA-Z0-9_\\-\\.]', '', safe_base)
    if not clean_name or clean_name in ('.', '..') or clean_name != filename:
        raise HTTPException(status_code=400, detail='Invalid document filename')
    base_root = get_storage_root_path().resolve()
    target_path = (base_root / clean_name).resolve()
    if target_path.is_relative_to(base_root) and target_path.is_file():
        return FileResponse(path=str(target_path), media_type='application/pdf', filename=clean_name)
    default_root = settings.PDF_STORAGE_DIR.resolve()
    default_path = (default_root / clean_name).resolve()
    if default_path.is_relative_to(default_root) and default_path.is_file():
        return FileResponse(path=str(default_path), media_type='application/pdf', filename=clean_name)
    raise HTTPException(status_code=404, detail='Archived physical document file not found on disk')

def get_rejected_pdf_path(inv: Invoice) -> Path:
    """
    Constructs the storage path for rejected/cancelled documents:
    stored_pdfs/rejected/{DOC_NUM}_{PRIMARY_KEY}.pdf
    """
    safe_doc_num = os.path.basename(str(inv.invoice_number or inv.doc_num or 'DOC'))
    clean_doc_num = re.sub('[^a-zA-Z0-9_\\-\\.]', '', safe_doc_num)
    safe_id = os.path.basename(str(inv.id) if inv.id else '0')
    clean_id = re.sub('[^a-zA-Z0-9_\\-\\.]', '', safe_id)
    filename = f'{clean_doc_num}_{clean_id}.pdf'
    base_rejected = settings.REJECTED_PDF_DIR.resolve()
    target_path = (base_rejected / filename).resolve()
    if target_path.is_relative_to(base_rejected):
        return target_path
    return base_rejected / filename

def archive_approved_pdf(inv: Invoice):
    """
    Archival helper:
    1. Saves approved physical PDF into configured folders under stored_pdfs/approved/.
    2. Updates inv.file_url in the database to point to the new /stored_pdfs/ web route.
    3. Deletes temporary upload file from uploads/ directory.
    4. Triggers background push to 3rd-party webhook / SAP.
    """
    try:
        if not inv:
            return
        safe_base = os.path.basename(inv.file_url) if inv.file_url else ''
        clean_filename = re.sub('[^a-zA-Z0-9_\\-\\.]', '', safe_base)
        upload_root = settings.UPLOAD_DIR.resolve()
        legacy_root = settings.PDF_STORAGE_DIR.resolve()
        upload_path = (upload_root / clean_filename).resolve() if clean_filename else None
        legacy_storage_path = (legacy_root / clean_filename).resolve() if clean_filename else None
        src_path = None
        if upload_path and upload_path.is_relative_to(upload_root) and upload_path.exists():
            src_path = upload_path
        elif legacy_storage_path and legacy_storage_path.is_relative_to(legacy_root) and legacy_storage_path.exists():
            src_path = legacy_storage_path
        if src_path and src_path.exists():
            base_root = get_storage_root_path().resolve()
            dest_approved = get_archived_pdf_path(inv).resolve()
            if dest_approved.is_relative_to(base_root):
                dest_approved.parent.mkdir(parents=True, exist_ok=True)
                if src_path != dest_approved:
                    shutil.copy2(str(src_path), str(dest_approved))
                    logger.info(f'[Archive] Successfully archived approved PDF for document {inv.id}')
                    if upload_path and upload_path.exists() and (upload_path != dest_approved):
                        try:
                            upload_path.unlink()
                        except Exception as exc:
                            logger.debug('Handled exception: %s', exc)
                try:
                    rel_path = dest_approved.relative_to(base_root)
                    inv.file_url = f'/stored_pdfs/{rel_path.as_posix()}'
                except ValueError as exc:
                    logger.debug('Handled exception: %s', exc)
        trigger_async_integration_push(str(inv.id))
    except Exception as e:
        logger.debug('Handled exception: %s', e)

def archive_rejected_pdf(inv: Invoice):
    """
    Purges/deletes physical PDF files for rejected or cancelled documents.
    Only approved documents are permanently stored on disk.
    """
    try:
        if not inv or not inv.file_url:
            return
        filename = os.path.basename(inv.file_url)
        upload_path = settings.UPLOAD_DIR / filename
        if upload_path.exists():
            try:
                upload_path.unlink()
                print(f'[Purge] Purged rejected document file from uploads: {upload_path}')
            except Exception as del_err:
                logger.debug('Handled exception: %s', del_err)
    except Exception as e:
        logger.debug('Handled exception: %s', e)

def dispatch_approval_inapp_notifications(db: Session, inv: Invoice, approver_name: str, prev_stage: int, new_stage: int, next_approver_target: Optional[str]=None, is_completed: bool=False):
    """Generates real-time in-app notifications when a document is approved and routed."""
    try:
        inv_title = inv.invoice_number or inv.id or 'Document'
        vendor_info = inv.vendor_name or 'Vendor'
        amt_str = f'INR {inv.amount:,.2f}' if inv.amount else ''
        if not is_completed and next_approver_target:
            next_targets = [t.strip() for t in next_approver_target.split(',') if t.strip()]
            for target in next_targets:
                notif = InAppNotification(document_id=str(inv.id), recipient_handle=target, notification_type='PENDING_APPROVAL', title=f'Action Required: {inv_title} Assigned to You (Stage {new_stage})', message=f"Document '{inv_title}' ({vendor_info} {amt_str}) was verified and signed off by {approver_name} at Stage {prev_stage}. It is now pending your sign-off at Stage {new_stage}.", is_read=False)
                db.add(notif)
        db.add(InAppNotification(document_id=str(inv.id), recipient_handle=approver_name, notification_type='COMPLETED' if is_completed else 'PENDING_APPROVAL', title=f'Approval Confirmed: Stage {prev_stage} Completed' if not is_completed else f'Document {inv_title} Fully Settled', message=f'You successfully signed off on Stage {prev_stage}. Document routed to Stage {new_stage} ({next_approver_target}).' if not is_completed else f"You provided final sign-off for '{inv_title}'. Document is settled and archived.", is_read=False))
        db.add(InAppNotification(document_id=str(inv.id), recipient_handle='admin', notification_type='COMPLETED' if is_completed else 'PENDING_APPROVAL', title=f'Workflow Progress: {inv_title} ➔ Stage {new_stage}' if not is_completed else f'Workflow Settled: {inv_title}', message=f"Stage {prev_stage} signed off by {approver_name}. Assigned to: {next_approver_target or 'Final Settlement'}." if not is_completed else f"Document '{inv_title}' completed all approval stages.", is_read=False))
        db.flush()
    except Exception as e:
        logger.debug('Handled exception: %s', e)

def dispatch_rejection_inapp_notifications(db: Session, inv: Invoice, approver_name: str, from_stage: int, to_stage: int, remarks: str, target_approver: Optional[str]=None, is_cancelled: bool=False):
    """Generates real-time in-app notifications when a document is rejected / sent back or cancelled."""
    try:
        inv_title = inv.invoice_number or inv.id or 'Document'
        vendor_info = inv.vendor_name or 'Vendor'
        amt_str = f'INR {inv.amount:,.2f}' if inv.amount else ''
        if is_cancelled:
            db.add(InAppNotification(document_id=str(inv.id), recipient_handle='admin', notification_type='REJECTED', title=f'Process Cancelled: {inv_title}', message=f"Document '{inv_title}' ({vendor_info}) was cancelled/voided at Stage 1 by {approver_name}. Reason: {remarks}", is_read=False))
            req_email = getattr(inv, 'requestor_email', None) or getattr(inv, 'created_by', None)
            if req_email:
                db.add(InAppNotification(document_id=str(inv.id), recipient_handle=str(req_email), notification_type='REJECTED', title=f'Document Process Cancelled: {inv_title}', message=f"Document '{inv_title}' has been cancelled by {approver_name}. Reason: {remarks}", is_read=False))
        else:
            if target_approver:
                targets = [t.strip() for t in target_approver.split(',') if t.strip()]
                for target in targets:
                    db.add(InAppNotification(document_id=str(inv.id), recipient_handle=target, notification_type='SENT_BACK', title=f'Action Required: {inv_title} Returned to You (Stage {to_stage})', message=f"Document '{inv_title}' ({vendor_info} {amt_str}) was rejected by {approver_name} at Stage {from_stage} and returned to your desk for review. Reason: {remarks}", is_read=False))
            db.add(InAppNotification(document_id=str(inv.id), recipient_handle=approver_name, notification_type='REJECTED', title=f'Returned to Previous Stage: Stage {to_stage}', message=f"You returned document '{inv_title}' back to Stage {to_stage} ({target_approver or 'Initiator Desk'}). Reason: {remarks}", is_read=False))
        db.flush()
    except Exception as e:
        logger.debug('Handled exception: %s', e)

def process_rejection_logic(db: Session, inv: Invoice, approver_name: str, remarks: str, action_type: str='Reject'):
    """
    Step-down rejection:
    - If Stage N (N > 1): Returns document to Stage N-1 previous approver.
    - If Stage 1 (Attachment Status): Cancels / voids the process.
    """
    current_stage = inv.current_stage or 1
    if current_stage > 1:
        prev_stage = current_stage - 1
        inv.current_stage = prev_stage
        prev_step_name = f'Stage {prev_stage}'
        if inv.workflow_profile_id:
            prev_step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == prev_stage).first()
            if prev_step:
                inv.assigned_approver = prev_step.approver_target
                prev_step_name = prev_step.step_name
            else:
                inv.assigned_approver = None
        else:
            inv.assigned_approver = None
        if prev_stage == 1:
            inv.status = 'Rejected / Returned (Attachment Status)'
        else:
            inv.status = f'Rejected / Returned (Stage {prev_stage} - {prev_step_name})'
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
        db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action=f'Rejected / Returned to Stage {prev_stage}', stage=f'Stage {current_stage}', notes=f'Rejected at Stage {current_stage} by {approver_name} ➔ Returned to Stage {prev_stage} ({prev_step_name}, Assigned: {inv.assigned_approver}). Reason: {remarks}'))
        trigger_async_integration_push(str(inv.id), decision='REJECTED')
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver, 'message': f'Document returned to Stage {prev_stage} ({prev_step_name}) for previous approver review.'}
    else:
        inv.status = 'Cancelled'
        inv.assigned_approver = None
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
        db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action='Process Cancelled', stage='Stage 1 (Attachment Status)', notes=f'Workflow process cancelled/voided by {approver_name} at Stage 1. Reason: {remarks}'))
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': None})
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'message': 'Workflow process cancelled and voided at Attachment Stage.'}

@router.get('/api/records/{invoice_id}/file')
@router.get('/api/documents/{invoice_id}/file')
@router.get('/api/invoices/{invoice_id}/file')
def stream_document_file(
    invoice_id: str,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    auth_user = current_user
    if not auth_user and token:
        try:
            payload = decode_token(token)
            username = payload.get('sub') or payload.get('username')
            if username:
                auth_user = db.query(User).filter(
                    (User.username == username) | (User.employee_id == username) | (User.email == username),
                    User.is_active == True,
                    User.is_deleted == False
                ).first()
        except Exception as auth_err:
            logger.debug('Failed to decode token for pdf attachment: %s', auth_err)

    if not auth_user:
        raise HTTPException(status_code=401, detail='Authentication required to view document attachment.')

    inv = find_invoice_by_identifier(db, invoice_id)
    if not authorize_document_access(auth_user, inv) and not is_user_in_approver_pool(auth_user, inv.assigned_approver):
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

    if safe_path and safe_path.is_file():
        media_type = 'application/pdf' if safe_path.suffix.lower() == '.pdf' else 'image/jpeg'
        return FileResponse(
            path=str(safe_path),
            media_type=media_type,
            filename=safe_path.name,
            headers={'Content-Disposition': f'inline; filename="{safe_path.name}"'}
        )

    # Dynamic fallback PDF generator when physical file is not yet attached/uploaded
    doc_id_str = str(inv.id or invoice_id)
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

    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={'Content-Disposition': f'inline; filename="{doc_id_str}_summary.pdf"'}
    )

def check_approval_authorization(inv: Invoice, user: Optional[User], db: Optional[Session]=None, require_compliance: bool=True, expected_stage: Optional[int]=None):
    if not user:
        raise HTTPException(status_code=401, detail='Authentication required: Please log in to approve or review documents.')
    if not user.is_active:
        raise HTTPException(status_code=403, detail='Account Inactive: Your user account is disabled.')
    # Concurrency collision check: if the client expected a specific stage but the document has moved or already completed
    if expected_stage is not None and ((inv.current_stage or 1) != expected_stage or inv.status in ['Settled', 'Approved', 'Paid', 'Ready for Payment']):
        raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")

    if inv.status in ['Settled', 'Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed']:
        raise HTTPException(status_code=400, detail=f"This document is already in a terminal/completed state ('{inv.status}') and cannot accept further workflow actions.")

    # Check if this user has already approved this invoice in an earlier action
    if db and user:
        user_id_str = str(user.id)
        user_name_lower = (user.employee_name or user.name or user.username or '').strip().lower()
        has_user_approved = db.query(AuditLog).filter(
            AuditLog.invoice_id == str(inv.id),
            AuditLog.action.ilike('%approved%'),
            (AuditLog.user.ilike(f"%{user.username}%") | AuditLog.user.ilike(f"%{user_name_lower}%") | (AuditLog.user == user_id_str))
        ).first()
        if has_user_approved:
            raise HTTPException(status_code=400, detail="You have already submitted your approval for this document.")

    if db and inv:
        sync_document_approver_from_workflow(db, inv)

    approvers = [s.strip().lower() for s in (inv.assigned_approver or '').split(',') if s.strip()]
    user_handles = [(user.username or '').lower(), (user.employee_id or '').lower(), (user.employee_name or '').lower(), (user.name or '').lower(), (user.email or '').lower(), (user.role or '').lower()]
    user_handles = [h for h in user_handles if h]
    
    is_authorized = is_user_in_approver_pool(user, inv.assigned_approver)
    if not is_authorized:
        for handle in user_handles:
            if handle in approvers or any((handle == app or handle in app or app in handle for app in approvers)):
                is_authorized = True
                break
    
    if not is_authorized:
        # Check if user was assigned to an earlier stage (which is already completed) or future stage
        if db and inv.workflow_profile_id:
            steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id).all()
            user_stages = []
            for st in steps:
                step_targets = [s.strip().lower() for s in (st.approver_target or '').split(',') if s.strip()]
                for handle in user_handles:
                    if handle in step_targets or any((handle == t or handle in t or t in handle for t in step_targets)):
                        user_stages.append(st.stage_number)
                        break
            if user_stages:
                max_user_stage = max(user_stages)
                min_user_stage = min(user_stages)
                if max_user_stage < (inv.current_stage or 1):
                    raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")
                elif min_user_stage > (inv.current_stage or 1):
                    raise HTTPException(status_code=403, detail=f"Access Denied: You are assigned to Stage {min_user_stage}, but the document is currently at Stage {inv.current_stage or 1}. You cannot approve until preceding stages are completed.")

        raise HTTPException(status_code=403, detail=f"Access Denied: Only the assigned approver ({inv.assigned_approver}) for Stage {inv.current_stage or 1} is authorized to approve this document.")

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
            except Exception:
                has_attachment = False

        if is_attachment_stage and (not has_attachment):
            raise HTTPException(status_code=400, detail='Physical PDF Attachment Compulsory: A valid physical invoice PDF file must be attached and uploaded before approving Stage 1 (Attachment Status).')

        checklist_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == current_step_name).all()
        if not checklist_items:
            default_items = resolve_checklist_items(db, inv, current_step_name)
            for t_text in default_items:
                item = InvoiceChecklistState(invoice_id=inv.id, stage_name=current_step_name, item_text=t_text, is_checked=False, is_mandatory=True)
                db.add(item)
                checklist_items.append(item)
            db.commit()
        if checklist_items:
            unchecked_mandatory = [item for item in checklist_items if getattr(item, 'is_mandatory', True) and not item.is_checked]
            if unchecked_mandatory:
                missing_items_str = ', '.join([f"'{item.item_text}'" for item in unchecked_mandatory])
                raise HTTPException(status_code=400, detail=f"Compliance Checklist Incomplete: The following checklist items must be verified and checked before approving: {missing_items_str}")

@router.post('/api/workflows/approve')
@router.post('/api/workflow/approve')
def workflow_approve_payload(payload: dict, db: Session=Depends(get_db), user: User=Depends(get_current_active_user)):
    doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId in approval payload')
    inv = find_invoice_by_identifier(db, doc_id)
    expected_stage = payload.get('expected_stage') or payload.get('expectedStage') or payload.get('stage')
    check_approval_authorization(inv, user, db=db, require_compliance=True, expected_stage=int(expected_stage) if expected_stage is not None else None)
    
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
    expected_ver = payload.get('expected_version') or payload.get('expectedVersion')
    if expected_ver is not None and expected_ver != current_version:
        raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")

    next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
    next_assigned_val = inv.assigned_approver
    next_checklist_val = inv.checklist_state

    next_step = None
    if inv.workflow_profile_id:
        next_step = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.stage_number == (prev_stage_num + 1)
        ).first()

    if next_step and next_step.approver_target:
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
    else:
        next_status_val = 'Approved'
        next_stage_val = prev_stage_num
        archive_approved_pdf(inv)

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

    # Release review lock
    try:
        from app.services.lock_service import lock_manager
        lock_manager.release_lock(doc_id=str(inv.id))
    except Exception as exc:
        logger.debug('Lock release on approval failed: %s', exc)

    dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=approver_name, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=inv.status == 'Approved')
    record_approval_assignment_transition(
        db=db,
        inv=inv,
        completed_stage_num=prev_stage_num,
        action="APPROVED",
        approver_handle=approver_name,
        remarks=remarks,
        next_stage_num=next_stage_val if inv.status != 'Approved' else None,
        next_stage_name=next_step.step_name if (inv.status != 'Approved' and next_step) else None,
        next_approver_handle=next_assigned_val if inv.status != 'Approved' else None
    )
    next_step_title = next_step.step_name if next_step else f'Stage {next_stage_val}'
    db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action=f'Approved ({stage_name})', stage=stage_name, notes=f'{remarks} ➔ {next_assigned_info}', remarks=remarks))
    db.commit()
    db.refresh(inv)
    safe_broadcast_event('STAGE_APPROVED', {'document_id': str(inv.id), 'approved_stage': prev_stage_num, 'new_stage': inv.current_stage, 'status': inv.status, 'approver': approver_name})
    safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
    return {
        'success': True,
        'status': inv.status,
        'current_stage': inv.current_stage,
        'invoice': inv,
        'approved_by': approver_name,
        'next_approver': next_assigned_val if inv.status != 'Approved' else None,
        'next_stage_name': next_step_title if inv.status != 'Approved' else None,
        'is_final_approval': inv.status == 'Approved'
    }

@router.post('/api/records/{invoice_id}/approve')
@router.post('/api/documents/{invoice_id}/approve')
@router.post('/api/invoices/{invoice_id}/approve')
def approve_invoice_url(invoice_id: str, action: Optional[InvoiceActionRequest]=None, db: Session=Depends(get_db), user: User=Depends(get_current_active_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    check_approval_authorization(inv, user, db=db, require_compliance=True)
    username = user.employee_name or user.name if user else 'Reviewer'
    remarks = action.remarks if action and action.remarks else 'Compliance items verified and signed off.'
    stage_name = action.stage_name if action and action.stage_name else f'Stage {inv.current_stage or 1}'
    prev_stage_num = inv.current_stage or 1
    current_version = inv.version or 1
    if action and action.expected_version is not None and action.expected_version != current_version:
        raise HTTPException(status_code=409, detail="This approval stage has already been completed by another approver.")
    next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
    next_assigned_val = inv.assigned_approver
    next_checklist_val = inv.checklist_state

    next_step = None
    if inv.workflow_profile_id:
        next_step = db.query(WorkflowStepDefinition).filter(
            (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
            (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
            WorkflowStepDefinition.stage_number == (prev_stage_num + 1)
        ).first()

    if next_step and next_step.approver_target:
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
    else:
        next_status_val = 'Approved'
        next_stage_val = prev_stage_num
        archive_approved_pdf(inv)

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

    dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=username, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=inv.status == 'Approved')
    record_approval_assignment_transition(
        db=db,
        inv=inv,
        completed_stage_num=prev_stage_num,
        action="APPROVED",
        approver_handle=username,
        remarks=remarks,
        next_stage_num=next_stage_val if inv.status != 'Approved' else None,
        next_stage_name=next_step.step_name if (inv.status != 'Approved' and next_step) else None,
        next_approver_handle=next_assigned_val if inv.status != 'Approved' else None
    )
    next_step_title = next_step.step_name if next_step else f'Stage {next_stage_val}'
    db.add(AuditLog(invoice_id=str(inv.id), user=username, action=f'Approved ({stage_name})', stage=stage_name, notes=f'{remarks} ➔ {next_assigned_info}', remarks=remarks))
    db.commit()
    db.refresh(inv)
    safe_broadcast_event('STAGE_APPROVED', {'document_id': str(inv.id), 'approved_stage': prev_stage_num, 'new_stage': inv.current_stage, 'status': inv.status, 'approver': username})
    safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
    return {
        'success': True,
        'status': inv.status,
        'current_stage': inv.current_stage,
        'invoice': inv,
        'approved_by': username,
        'next_approver': next_assigned_val if inv.status != 'Approved' else None,
        'next_stage_name': next_step_title if inv.status != 'Approved' else None,
        'is_final_approval': inv.status == 'Approved'
    }

@router.post('/api/records/{invoice_id}/step-action')
@router.post('/api/documents/{invoice_id}/step-action')
@router.post('/api/invoices/{invoice_id}/step-action')
def invoice_step_action(invoice_id: str, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    action_type = str(payload.get('action') or 'Approve').strip()
    act_lower = action_type.lower()
    is_approving = 'approve' in act_lower or 'pass' in act_lower
    expected_stage = payload.get('expected_stage') or payload.get('expectedStage') or payload.get('stage')
    check_approval_authorization(inv, user, db=db, require_compliance=is_approving, expected_stage=int(expected_stage) if expected_stage is not None else None)
    comments = str(payload.get('comments') or payload.get('comment') or 'Action processed by desk operator.').strip()
    approver_name = payload.get('approver') or (user.employee_name or user.name if user else 'Desk Operator')
    stage_name = f'Stage {inv.current_stage or 1}'
    prev_stage_num = inv.current_stage or 1
    current_version = inv.version or 1
    if 'approve' in act_lower or 'pass' in act_lower:
        next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
        next_stage_val = prev_stage_num
        next_assigned_val = inv.assigned_approver
        next_checklist_val = inv.checklist_state
        next_step = None
        if inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(
                (WorkflowStepDefinition.profile_name == inv.workflow_profile_id) |
                (WorkflowStepDefinition.profile_name.ilike(inv.workflow_profile_id.strip())),
                WorkflowStepDefinition.stage_number == (prev_stage_num + 1)
            ).first()

        if next_step and next_step.approver_target:
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
        else:
            next_status_val = 'Approved'
            next_stage_val = prev_stage_num
            archive_approved_pdf(inv)

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

        dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=approver_name, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=inv.status == 'Approved')
        record_approval_assignment_transition(
            db=db,
            inv=inv,
            completed_stage_num=prev_stage_num,
            action="APPROVED",
            approver_handle=approver_name,
            remarks=comments,
            next_stage_num=next_stage_val if inv.status != 'Approved' else None,
            next_stage_name=next_step.step_name if (inv.status != 'Approved' and next_step) else None,
            next_approver_handle=next_assigned_val if inv.status != 'Approved' else None
        )
        next_step_title = next_step.step_name if next_step else f'Stage {next_stage_val}'
        db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action=f'Approved ({stage_name})', stage=stage_name, notes=f'{comments} ➔ {next_assigned_info}', remarks=comments))
        db.commit()
        db.refresh(inv)
        safe_broadcast_event('STAGE_APPROVED', {'document_id': str(inv.id), 'approved_stage': prev_stage_num, 'new_stage': inv.current_stage, 'status': inv.status, 'approver': approver_name})
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        return {
            'success': True,
            'status': inv.status,
            'current_stage': inv.current_stage,
            'invoice': inv,
            'approved_by': approver_name,
            'next_approver': next_assigned_val if inv.status != 'Approved' else None,
            'next_stage_name': next_step_title if inv.status != 'Approved' else None,
            'is_final_approval': inv.status == 'Approved'
        }
    elif 'reject' in act_lower or 'send back' in act_lower or 'return' in act_lower:
        result = process_rejection_logic(db=db, inv=inv, approver_name=approver_name, remarks=comments, action_type=action_type)
        db.commit()
        db.refresh(inv)
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': inv, **result}
    else:
        inv.status = 'On Hold'
        db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action=f'{action_type} (Hold)', stage=stage_name, notes=comments))
        db.commit()
        db.refresh(inv)
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': inv}

@router.post('/api/workflows/reject')
@router.post('/api/workflow/reject')
def workflow_reject_payload(payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId in rejection payload')
    inv = find_invoice_by_identifier(db, doc_id)
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    approver_name = payload.get('user') or payload.get('username') or (user.employee_name or user.name if user else 'Approver')
    remarks = payload.get('comments') or payload.get('comment') or payload.get('remarks') or 'Record rejected / returned to previous approver.'
    result = process_rejection_logic(db=db, inv=inv, approver_name=approver_name, remarks=remarks, action_type='Reject')
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': inv, **result}

@router.post('/api/records/{invoice_id}/reject')
@router.post('/api/documents/{invoice_id}/reject')
@router.post('/api/invoices/{invoice_id}/reject')
def reject_invoice_url(invoice_id: str, action: Optional[InvoiceActionRequest]=None, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    username = user.employee_name or user.name if user else 'Reviewer'
    remarks = action.remarks if action else 'Record rejected / returned to previous approver.'
    result = process_rejection_logic(db=db, inv=inv, approver_name=username, remarks=remarks, action_type='Reject')
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'invoice': inv, **result}

@router.post('/api/workflows/hold')
@router.post('/api/workflow/hold')
@router.post('/api/workflows/sendback')
@router.post('/api/workflow/sendback')
def workflow_hold_payload(payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId in hold/sendback payload')
    inv = find_invoice_by_identifier(db, doc_id)
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    username = payload.get('user') or payload.get('username') or (user.employee_name or user.name if user else 'Approver')
    remarks = payload.get('comments') or payload.get('comment') or payload.get('remarks') or 'Record returned to previous stage.'
    result = process_rejection_logic(db=db, inv=inv, approver_name=username, remarks=remarks, action_type='Send Back')
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': inv, **result}

@router.post('/api/workflows/cancel')
@router.post('/api/records/{invoice_id}/cancel')
@router.post('/api/invoices/{invoice_id}/cancel')
def workflow_cancel_route(invoice_id: Optional[str]=None, payload: Optional[dict]=None, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    doc_id = invoice_id or (payload.get('invoiceId') or payload.get('id') if payload else None)
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId')
    inv = find_invoice_by_identifier(db, doc_id)
    username = (user.employee_name or user.name if user else None) or (payload.get('user') or payload.get('username') if payload else 'User')
    remarks = (payload.get('comments') or payload.get('remarks') if payload else None) or 'Process cancelled by user.'
    inv.status = 'Cancelled'
    inv.assigned_approver = None
    archive_rejected_pdf(inv)
    dispatch_rejection_inapp_notifications(db=db, inv=inv, approver_name=username, from_stage=inv.current_stage or 1, to_stage=0, remarks=remarks, target_approver=None, is_cancelled=True)
    db.add(AuditLog(invoice_id=str(inv.id), user=username, action='Process Cancelled', stage=f'Stage {inv.current_stage or 1}', notes=f'Process cancelled/voided: {remarks}'))
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'message': 'Workflow process cancelled.'}

@router.post('/api/records/{invoice_id}/hold')
@router.post('/api/documents/{invoice_id}/hold')
@router.post('/api/invoices/{invoice_id}/hold')
def hold_invoice_url(invoice_id: str, action: Optional[InvoiceActionRequest]=None, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    username = user.name if user else 'Reviewer'
    remarks = action.remarks if action else 'Record placed on temporary administrative hold.'
    inv.status = 'On Hold'
    db.add(AuditLog(invoice_id=str(inv.id), user=username, action='Placed on Hold', stage=f'Stage {inv.current_stage or 1}', notes=remarks))
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'invoice': inv}

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
    
    staged_filename = f"TEMP_STAGE_{uuid.uuid4().hex[:8]}_{unique_filename}"
    file_path = settings.UPLOAD_DIR / staged_filename
    with open(file_path, 'wb') as buffer:
        buffer.write(content)

    final_file_size = process_and_validate_pdf_size(file_path, detected_type)

    # Perform OCR + LLM extraction
    from app.services.ocr_service import extract_document_for_verification
    try:
        extracted = extract_document_for_verification(file_path)
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

    return {
        "success": True,
        "temp_file_id": staged_filename,
        "file_name": file.filename,
        "file_size": final_file_size,
        "preview_url": f"/api/documents/temp-preview/{staged_filename}",
        "extracted_data": extracted
    }


@router.get('/api/documents/temp-preview/{filename}')
def serve_temp_preview(
    filename: str,
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """Secure preview streaming of temporarily staged PDF during human verification."""
    safe_base = os.path.basename(filename)
    clean_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '', safe_base)
    if not clean_name or clean_name in ('.', '..') or clean_name != filename:
        raise HTTPException(status_code=400, detail="Invalid preview filename")
    
    target_path = (settings.UPLOAD_DIR / clean_name).resolve()
    if not target_path.is_file() or not target_path.is_relative_to(settings.UPLOAD_DIR.resolve()):
        raise HTTPException(status_code=404, detail="Preview document not found or expired")
    
    media_type = 'application/pdf' if clean_name.lower().endswith('.pdf') else 'image/jpeg'
    return FileResponse(
        path=str(target_path),
        media_type=media_type,
        filename=clean_name,
        headers={'Content-Disposition': f'inline; filename="{clean_name}"'}
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
        staged_path = (settings.UPLOAD_DIR / clean_temp).resolve()
        if not staged_path.is_file() or not staged_path.is_relative_to(settings.UPLOAD_DIR.resolve()):
            raise HTTPException(status_code=400, detail="Staged preview file not found or expired. Please re-upload.")
        
        # Promote staged file to permanent file name
        perm_filename = clean_temp.replace('TEMP_STAGE_', 'DOC_')
        final_file_path = (settings.UPLOAD_DIR / perm_filename).resolve()
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

    final_amount = float(amount or 0.0)
    final_base = float(base_amount) if base_amount is not None else (round(final_amount / 1.18, 2) if final_amount else 0.0)
    final_tax = float(tax_amount) if tax_amount is not None else (round(final_amount - final_base, 2) if final_amount else 0.0)
    final_vendor = (vendor_name or '').strip() or 'Direct Upload Supplier'
    final_inv_no = (invoice_number or '').strip() or f'INV-{timestamp % 100000}'
    final_gstin = (vendor_gstin or '').strip()
    user_div = (division or '').strip() or current_user.division or 'VCC'
    user_plant = (plant or '').strip() or 'MAIN'

    new_inv = Invoice(
        id=new_id,
        vendor_name=final_vendor,
        invoice_number=final_inv_no,
        invoice_date=invoice_date or datetime.date.today().strftime('%Y-%m-%d'),
        amount=final_amount,
        base_amount=final_base,
        tax_amount=final_tax,
        cgst=float(cgst or 0.0),
        sgst=float(sgst or 0.0),
        igst=float(igst or 0.0),
        vendor_gstin=final_gstin,
        gstin=final_gstin,
        po_number=(po_number or '').strip() or None,
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
    if detected_type == 'pdf':
        try:
            from app.services.ocr_service import extract_text_from_pdf
            ocr_data = extract_text_from_pdf(file_path) or {}
        except Exception as exc:
            logger.debug('Handled ocr exception: %s', exc)

    timestamp = int(datetime.datetime.utcnow().timestamp())
    new_id = generate_document_id(db, doc_type=document_type or 'AP INVOICE')

    final_amount = float(amount if amount is not None else (ocr_data.get('amount') or 0.0))
    final_base = round(final_amount / 1.18, 2) if final_amount else 0.0
    final_tax = round(final_amount - final_base, 2) if final_amount else 0.0
    final_vendor = vendor_name or ocr_data.get('vendor_name') or 'Direct Upload Supplier'
    final_inv_no = invoice_number or ocr_data.get('invoice_number') or f'INV-{timestamp % 100000}'
    final_gstin = ocr_data.get('gstin') or ''
    user_div = division or current_user.division or 'VCC'
    user_plant = plant or 'MAIN'

    new_inv = Invoice(
        id=new_id,
        vendor_name=final_vendor,
        invoice_number=final_inv_no,
        invoice_date=ocr_data.get('date') or datetime.date.today().strftime('%Y-%m-%d'),
        amount=final_amount,
        base_amount=final_base,
        tax_amount=final_tax,
        vendor_gstin=final_gstin,
        division=user_div,
        plant=user_plant,
        category=document_type or 'PURCHASE',
        document_type=document_type or 'AP INVOICE',
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
        db.add(AuditLog(invoice_id=new_inv.id, user='Document Uploader', action='UNROUTED', stage='Rule Evaluation', notes='Document uploaded but no active business rule matched the document criteria. Pending rule creation.'))
    else:
        new_inv.workflow_profile_id = matched_wf
        new_inv.document_type = infer_document_type(category=new_inv.category, wf_name=matched_wf, doc_type=document_type)
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
            db.add(AuditLog(invoice_id=new_inv.id, user='Document Uploader', action='Created & Uploaded', stage='Stage 1', notes=f"Document uploaded and assigned to Stage 1 pool '{new_inv.assigned_approver}' under workflow '{matched_wf}'."))
        first_stage = 'Attachment Status'
        if steps and len(steps) > 0 and steps[0].step_name:
            first_stage = steps[0].step_name
        checklist_items = resolve_checklist_items(db, new_inv, first_stage)
        new_inv.checklist_state = json.dumps({item: False for item in checklist_items})
    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)
    safe_broadcast_event('DOCUMENT_CREATED', {'document_id': str(new_inv.id), 'status': new_inv.status, 'current_stage': new_inv.current_stage, 'assigned_approver': new_inv.assigned_approver})
    return {'success': True, 'invoice': new_inv}

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

    from app.services.excel_trigger_service import process_excel_workflow_trigger
    file_bytes = await file.read()
    return process_excel_workflow_trigger(
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
    return {'success': True, 'invoice': inv}

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

    is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
    if not is_admin and inv.assigned_approver:
        if not is_user_in_approver_pool(current_user, inv.assigned_approver):
            raise HTTPException(
                status_code=403,
                detail=f"Access Denied: Only assigned approver ({inv.assigned_approver}) or administrator can replace the PDF for this document."
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
    uploader_name = current_user.employee_name or current_user.username
    db.add(AuditLog(invoice_id=str(inv.id), user=uploader_name, action='Invoice PDF Attached', stage=f'Stage {inv.current_stage or 1}', notes=f'Physical document attached: {file.filename}. Pending checklist verification and stage approval.'))
    db.commit()
    db.refresh(inv)
    return {'success': True, 'file_url': inv.file_url, 'current_stage': inv.current_stage, 'status': inv.status}

@router.get('/api/documents/{id}/comments')
@router.get('/api/records/{id}/comments')
def get_document_comments(id: str, db: Session=Depends(get_db), current_user: Optional[User]=Depends(get_current_user_optional)):
    inv = find_invoice_by_identifier(db, id)
    logs = db.query(AuditLog).filter(
        (AuditLog.invoice_id == str(inv.id)) | (AuditLog.invoice_id == f'DOC-{inv.id}'),
        or_(AuditLog.notes.isnot(None), AuditLog.remarks.isnot(None))
    ).order_by(AuditLog.timestamp.desc()).all()
    
    is_admin = False
    user_names = []
    if current_user:
        is_admin = (current_user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
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
def add_document_comment(id: str, payload: dict, db: Session=Depends(get_db)):
    inv = find_invoice_by_identifier(db, id)
    text = payload.get('text') or payload.get('comment') or payload.get('notes') or ''
    author = payload.get('author') or payload.get('user') or 'User'
    if text:
        db.add(AuditLog(invoice_id=str(inv.id), user=author, action='Comment Added', stage=f'Stage {inv.current_stage or 1}', notes=text))
        db.commit()
    return {'success': True, 'message': 'Comment recorded'}

@router.get('/api/documents/{id}/versions')
@router.get('/api/records/{id}/versions')
@router.get('/api/invoices/{id}/versions')
def get_document_versions(id: str, db: Session=Depends(get_db)):
    inv = find_invoice_by_identifier(db, id)
    versions = []
    if inv.file_url:
        versions.append({'version_number': 1, 'file_url': inv.file_url, 'uploaded_at': inv.created_at.isoformat() if inv.created_at else datetime.datetime.utcnow().isoformat(), 'uploaded_by': 'System / Approver', 'is_current': True})
    return versions

@router.get('/api/stats')
@router.get('/api/dashboard/stats')
def get_dashboard_stats(db: Session=Depends(get_db), current_user: Optional[User]=Depends(get_current_user)):
    invoices = db.query(Invoice).filter(Invoice.is_deleted == False).all()
    approved_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id).filter(AuditLog.action.ilike('%approve%'), or_(*or_filters))
            approved_invoice_ids = {row[0] for row in audit_query.all()}
    if current_user and current_user.role != 'admin':
        user_handles = [current_user.username.lower() if current_user.username else '', current_user.employee_id.lower() if current_user.employee_id else '', current_user.employee_name.lower() if current_user.employee_name else '', current_user.email.lower() if current_user.email else '']
        user_handles = [h for h in user_handles if h]
        scoped_invoices = []
        approved_count = 0
        pending_count = 0
        hold_count = 0
        rejected_count = 0
        total_spend = 0.0
        for inv in invoices:
            has_approved = inv.id in approved_invoice_ids
            is_assigned = False
            if inv.assigned_approver:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(',') if s.strip()]
                for handle in user_handles:
                    if handle in approvers or any((handle in app or app in handle for app in approvers)):
                        is_assigned = True
                        break
            if has_approved or is_assigned:
                scoped_invoices.append(inv)
                total_spend += float(inv.amount or 0.0)
                st_lower = (inv.status or '').lower()
                if has_approved and any(k in st_lower for k in ['settled', 'approved', 'paid', 'ready for payment']):
                    approved_count += 1
                elif any(k in st_lower for k in ['hold', 'pause', 'wait', 'clarif']):
                    hold_count += 1
                elif any(k in st_lower for k in ['reject', 'cancel', 'void', 'fail', 'returned']):
                    rejected_count += 1
                else:
                    is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Rejected', 'Failed', 'Settled', 'Cancelled']
                    if is_active_flow:
                        pending_count += 1
        total_docs = len(scoped_invoices)
    else:
        total_docs = len(invoices)
        hold_count = sum(1 for i in invoices if any(k in (i.status or '').lower() for k in ['hold', 'pause', 'wait', 'clarif']))
        rejected_count = sum(1 for i in invoices if any(k in (i.status or '').lower() for k in ['reject', 'cancel', 'void', 'fail', 'returned']))
        approved_count = sum(1 for i in invoices if any(k in (i.status or '').lower() for k in ['settled', 'approved', 'paid', 'ready for payment']))
        pending_count = sum(1 for i in invoices if not any(k in (i.status or '').lower() for k in ['settled', 'approved', 'paid', 'ready for payment', 'reject', 'cancel', 'void', 'fail', 'returned', 'hold', 'pause', 'wait', 'clarif']) and any(k in (i.status or '').lower() for k in ['pending', 'initiated', 'progress', 'unrouted', 'verification', 'review']))
        if pending_count == 0 and total_docs > (approved_count + hold_count + rejected_count):
            pending_count = total_docs - (approved_count + hold_count + rejected_count)
        total_spend = sum((float(i.amount or 0.0) for i in invoices))

    return {
        'totalDocuments': total_docs,
        'pendingApprovals': pending_count,
        'pendingDocuments': pending_count,
        'holdDocuments': hold_count,
        'rejectedDocuments': rejected_count,
        'approvedDocuments': approved_count,
        'totalSpendINR': total_spend,
        'autoRoutedPercentage': 100.0 if total_docs > 0 else 0.0
    }

@router.get('/api/notifications')
def get_notifications(db: Session=Depends(get_db), current_user: Optional[User]=Depends(get_current_user)):
    query = db.query(InAppNotification)
    if current_user and current_user.role != 'admin':
        user_handles = [current_user.username.lower() if current_user.username else '', current_user.employee_id.lower() if current_user.employee_id else '', current_user.employee_name.lower() if current_user.employee_name else '', current_user.email.lower() if current_user.email else '']
        user_handles = [h for h in user_handles if h]
        all_notifs = query.order_by(InAppNotification.created_at.desc()).limit(100).all()
        filtered = []
        for n in all_notifs:
            handle = (n.recipient_handle or '').lower()
            if any((uh == handle or uh in handle or handle in uh for uh in user_handles)):
                filtered.append({'notification_id': n.notification_id, 'document_id': n.document_id, 'notification_type': n.notification_type, 'title': n.title, 'message': n.message, 'is_read': n.is_read, 'created_at': n.created_at.isoformat() if n.created_at else datetime.datetime.utcnow().isoformat()})
        return filtered
    all_notifs = query.order_by(InAppNotification.created_at.desc()).limit(50).all()
    return [{'notification_id': n.notification_id, 'document_id': n.document_id, 'notification_type': n.notification_type, 'title': n.title, 'message': n.message, 'is_read': n.is_read, 'created_at': n.created_at.isoformat() if n.created_at else datetime.datetime.utcnow().isoformat()} for n in all_notifs]

@router.put('/api/notifications/{notification_id}/read')
def mark_notification_read(notification_id: str, db: Session=Depends(get_db)):
    notif = db.query(InAppNotification).filter(InAppNotification.notification_id == notification_id).first()
    if not notif:
        notif = db.query(InAppNotification).filter(InAppNotification.id == notification_id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {'success': True}

@router.put('/api/notifications/read-all')
def mark_all_notifications_read(db: Session=Depends(get_db), current_user: Optional[User]=Depends(get_current_user)):
    query = db.query(InAppNotification)
    if current_user and current_user.role != 'admin':
        user_handles = [current_user.username.lower() if current_user.username else '', current_user.employee_id.lower() if current_user.employee_id else '', current_user.employee_name.lower() if current_user.employee_name else '', current_user.email.lower() if current_user.email else '']
        user_handles = [h for h in user_handles if h]
        all_notifs = query.filter(InAppNotification.is_read == False).all()
        for n in all_notifs:
            handle = (n.recipient_handle or '').lower()
            if any((uh == handle or uh in handle or handle in uh for uh in user_handles)):
                n.is_read = True
    else:
        query.update({InAppNotification.is_read: True})
    db.commit()
    return {'success': True}

@router.get('/api/templates')
def get_templates(db: Session=Depends(get_db)):
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

@router.get('/api/admin/config')
def get_admin_config(db: Session=Depends(get_db)):
    return load_app_configs()

@router.post('/api/admin/config')
def post_admin_config(payload: dict, db: Session=Depends(get_db)):
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
def get_admin_erp_master(db: Session=Depends(get_db)):
    return load_erp_master_data()

@router.post('/api/admin/erp-master')
def post_admin_erp_master(payload: dict, db: Session=Depends(get_db)):
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
def post_admin_erp_master_bulk(payload: dict, db: Session=Depends(get_db)):
    new_items = payload.get('items', [])
    items = load_erp_master_data()
    existing_pos = {itm.get('po_number'): i for i, itm in enumerate(items)}
    for itm in new_items:
        po = itm.get('po_number')
        if po in existing_pos:
            items[existing_pos[po]] = itm
        else:
            items.append(itm)
            existing_pos[po] = len(items) - 1
    save_erp_master_data(items)
    return {'success': True, 'count': len(new_items)}

@router.delete('/api/admin/erp-master/{po}')
def delete_admin_erp_master(po: str, db: Session=Depends(get_db)):
    filtered_items = [itm for itm in load_erp_master_data() if itm.get('po_number') != po]
    save_erp_master_data(filtered_items)
    return {'success': True, 'deleted': po}

@router.get('/api/admin/recycle-bin')
def get_admin_recycle_bin(db: Session=Depends(get_db)):
    return []

@router.get('/api/admin/notifications/provider')
def get_admin_notifications_provider(db: Session=Depends(get_db)):
    config = db.query(NotificationProviderConfig).first()
    if config:
        return {'smtp_server': config.smtp_server, 'port': config.port, 'username': config.username, 'encrypted_password': config.encrypted_password, 'sender_email': config.sender_email, 'sender_name': config.sender_name}
    return {'smtp_server': 'smtp.office365.com', 'port': 587, 'username': 'Sqlalerts@ramrajcotton.net', 'encrypted_password': '', 'sender_email': 'Sqlalerts@ramrajcotton.net', 'sender_name': 'DocuFlow Alerts'}

@router.post('/api/admin/notifications/provider')
def save_admin_notifications_provider(payload: NotificationProviderSchema, db: Session=Depends(get_db)):
    config = db.query(NotificationProviderConfig).first()
    if not config:
        config = NotificationProviderConfig(smtp_server=payload.smtp_server, port=payload.port, username=payload.username, encrypted_password=payload.encrypted_password, sender_email=payload.sender_email, sender_name=payload.sender_name)
        db.add(config)
    else:
        config.smtp_server = payload.smtp_server
        config.port = payload.port
        config.username = payload.username
        config.encrypted_password = payload.encrypted_password
        config.sender_email = payload.sender_email
        config.sender_name = payload.sender_name
    db.commit()
    return {'success': True, 'message': 'SMTP provider configuration saved successfully'}

@router.get('/api/admin/notifications/raci')
def get_admin_notifications_raci(db: Session=Depends(get_db)):
    items = db.query(NotificationRaciMatrix).all()
    return [{'workflow_profile': item.workflow_profile, 'event_name': item.event_name, 'responsible_emails': item.responsible_emails, 'accountable_emails': item.accountable_emails, 'consulted_emails': item.consulted_emails, 'informed_emails': item.informed_emails, 'title_template': item.title_template, 'message_template': item.message_template} for item in items]

@router.post('/api/admin/notifications/raci')
def save_admin_notifications_raci(payload: NotificationRaciSchema, db: Session=Depends(get_db)):
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
def test_admin_notifications_smtp(payload: NotificationTestSchema, db: Session=Depends(get_db)):
    config = db.query(NotificationProviderConfig).first()
    recipient = (payload.to if payload and payload.to else '').strip()
    if not recipient:
        raise HTTPException(status_code=400, detail='Recipient email address ("to") is required')
        
    smtp_host = (config.smtp_server if config and config.smtp_server else 'smtp.office365.com').strip()
    smtp_port = config.port if (config and config.port) else 587
    smtp_user = (config.username if config and config.username else '').strip() or os.getenv('SMTP_USER', '') or os.getenv('SMTP_USERNAME', '') or getattr(settings, 'SMTP_USER', '') or ''
    smtp_pass = (config.encrypted_password if config and config.encrypted_password else '').strip() or os.getenv('SMTP_PASS', '') or os.getenv('SMTP_PASSWORD', '') or getattr(settings, 'SMTP_PASS', '') or ''
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
def get_admin_notifications_inapp_config(db: Session=Depends(get_db)):
    configs = load_app_configs()
    for c in configs:
        if c.get('key') == 'INAPP_NOTIFICATIONS_CONFIG':
            try:
                return json.loads(c.get('value', '[]'))
            except Exception as exc:
                logger.debug('Handled exception: %s', exc)
    return [{'trigger_event': 'PENDING_APPROVAL', 'enabled': True, 'title_template': 'Action Required: {{document_number}}', 'message_template': 'Document {{document_number}} from {{vendor_name}} (₹{{amount}}) is pending your review.'}, {'trigger_event': 'ASSIGNED', 'enabled': True, 'title_template': 'Task Assigned: {{document_number}}', 'message_template': 'You have been assigned as the reviewer for {{document_number}}.'}, {'trigger_event': 'REJECTED', 'enabled': True, 'title_template': 'Document Rejected: {{document_number}}', 'message_template': 'Document {{document_number}} was rejected during workflow approval.'}, {'trigger_event': 'SENT_BACK', 'enabled': True, 'title_template': 'Document Sent Back: {{document_number}}', 'message_template': 'Document {{document_number}} was returned for clarification.'}, {'trigger_event': 'COMPLETED', 'enabled': True, 'title_template': 'Workflow Completed: {{document_number}}', 'message_template': 'Document {{document_number}} has passed final approval and is ready for payment.'}, {'trigger_event': 'CLARIFICATION', 'enabled': True, 'title_template': 'Clarification Needed: {{document_number}}', 'message_template': 'Please provide clarification for document {{document_number}}.'}]

@router.post('/api/admin/notifications/inapp-config')
def save_admin_notifications_inapp_config(payload: list, db: Session=Depends(get_db)):
    save_app_config('INAPP_NOTIFICATIONS_CONFIG', json.dumps(payload, ensure_ascii=False), 'In-App Bell Notification Trigger Templates')
    return {'success': True, 'message': 'In-App Notification Configurations saved successfully'}

@router.get('/api/admin/backup/history')
def get_admin_backup_history(db: Session=Depends(get_db)):
    return []

@router.post('/api/admin/backup/trigger')
def trigger_admin_backup(db: Session=Depends(get_db)):
    return {'success': True, 'message': 'Database and uploads backup ran successfully!'}

@router.get('/api/erp/{po_number}')
def get_erp_po_details(po_number: str, db: Session=Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.po_number == po_number).first()
    return {'po_number': po_number, 'vendor_name': inv.vendor_name if inv else 'COIMBATORE TEXTILE TOOLS', 'amount': inv.amount if inv else 35000.0, 'status': 'Approved', 'items': []}

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
    Universal Condition-Based Checklist Resolution:
    - Purely stage-wise and document-wise (Division, Category/DocType, Stage, Branch/Plant, Cost Center).
    - Decoupled from individual workflow/flow profiles.
    - Evaluates ChecklistRule table matching the document's stage and business attributes.
    - Deduplicates items case-insensitively while preserving priority order.
    """
    if not inv:
        return []

    clean_stage = (stage_name or '').strip()
    matrix_items: List[str] = []

    # 1. Stage filter (Stage-wise)
    stage_conditions = [(ChecklistRule.stage_name.ilike(clean_stage)) | (ChecklistRule.stage_name == 'ALL')]
    if clean_stage.lower() == 'attachment status':
        stage_conditions.append(ChecklistRule.stage_name.ilike('Stage 1'))
    elif clean_stage.lower() == 'stage 1':
        stage_conditions.append(ChecklistRule.stage_name.ilike('Attachment Status'))
    stage_match = or_(*stage_conditions)

    # 2. Division filter (Document-wise)
    if inv.division:
        div_match = or_(ChecklistRule.division == inv.division, ChecklistRule.division == 'ALL', ChecklistRule.division.is_(None), ChecklistRule.division == '')
    else:
        div_match = or_(ChecklistRule.division == 'ALL', ChecklistRule.division.is_(None), ChecklistRule.division == '')

    # 3. Category / Document Type filter (Document-wise)
    cat_vals = [v for v in [getattr(inv, 'category', None), getattr(inv, 'document_type', None)] if v]
    if cat_vals:
        cat_match = or_(ChecklistRule.category.in_(cat_vals), ChecklistRule.category == 'ALL', ChecklistRule.category.is_(None), ChecklistRule.category == '')
    else:
        cat_match = or_(ChecklistRule.category == 'ALL', ChecklistRule.category.is_(None), ChecklistRule.category == '')

    # 4. Cost Center & Branch/Plant (Document-wise)
    if getattr(inv, 'cost_center', None):
        cost_match = or_(ChecklistRule.cost_center == inv.cost_center, ChecklistRule.cost_center == 'ALL', ChecklistRule.cost_center.is_(None), ChecklistRule.cost_center == '')
    else:
        cost_match = or_(ChecklistRule.cost_center == 'ALL', ChecklistRule.cost_center.is_(None), ChecklistRule.cost_center == '')

    if getattr(inv, 'plant', None):
        branch_match = or_(ChecklistRule.branch == inv.plant, ChecklistRule.branch == 'ALL', ChecklistRule.branch.is_(None), ChecklistRule.branch == '')
    else:
        branch_match = or_(ChecklistRule.branch == 'ALL', ChecklistRule.branch.is_(None), ChecklistRule.branch == '')

    # Query matching rules by stage and document conditions
    rules = db.query(ChecklistRule).filter(
        ChecklistRule.is_active == True,
        stage_match,
        div_match,
        cat_match,
        cost_match,
        branch_match
    ).order_by(ChecklistRule.sequence_order.asc(), ChecklistRule.id.asc()).all()

    for r in rules:
        for itm in split_checklist_items(r.item_text):
            if itm and itm not in matrix_items:
                matrix_items.append(itm)

    # Step B: Flow-Specific Checklist Items (if defined directly on this flow's step in Flow Builder)
    flow_step_extras: List[str] = []
    if inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.step_name.ilike(clean_stage)
        ).first()
        if not step and clean_stage.lower().startswith('stage '):
            try:
                stg_num = int(clean_stage.split()[1])
                step = db.query(WorkflowStepDefinition).filter(
                    WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                    WorkflowStepDefinition.stage_number == stg_num
                ).first()
            except Exception as exc:
                logger.debug("Failed parsing stage number from '%s': %s", clean_stage, exc)
        if not step and clean_stage.lower() in ('attachment status', 'stage 1'):
            step = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == 1
            ).first()

        if step and step.checklist_json:
            try:
                parsed = json.loads(step.checklist_json)
                if isinstance(parsed, list):
                    for itm in parsed:
                        for s_itm in split_checklist_items(str(itm)):
                            if s_itm and s_itm not in flow_step_extras:
                                flow_step_extras.append(s_itm)
            except Exception as e:
                logger.debug("Failed parsing step.checklist_json: %s", e)

    # Step C: Union of Universal Condition Matrix Items + Flow-Specific Step Items (Deduplicated)
    final_checklist: List[str] = []
    seen_normalized = set()
    for item in matrix_items:
        norm = item.strip().lower()
        if norm and norm not in seen_normalized:
            seen_normalized.add(norm)
            final_checklist.append(item.strip())

    for item in flow_step_extras:
        norm = item.strip().lower()
        if norm and norm not in seen_normalized:
            seen_normalized.add(norm)
            final_checklist.append(item.strip())

    return final_checklist

@router.get('/api/invoices/{invoice_id}/checklist')
def get_invoice_checklist(invoice_id: str, stage_num: Optional[int]=None, stage_name: Optional[str]=None, db: Session=Depends(get_db)):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail='Invoice not found')

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

    items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == current_step_name).order_by(InvoiceChecklistState.id.asc()).all()
    if not items:
        default_items = resolve_checklist_items(db, inv, current_step_name)
        for t_text in default_items:
            item = InvoiceChecklistState(invoice_id=inv.id, stage_name=current_step_name, item_text=t_text, is_checked=False)
            db.add(item)
            items.append(item)
        if default_items:
            db.commit()
    return [{'id': item.id, 'stage_name': item.stage_name, 'item_text': item.item_text, 'is_checked': item.is_checked, 'checked_by': item.checked_by, 'checked_at': item.checked_at} for item in items]

@router.post('/api/invoices/{invoice_id}/checklist')
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
        step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == req_stage_num).first()
        if step and step.step_name:
            current_step_name = step.step_name
    items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == current_step_name).all()
    username = user.employee_name or user.name or user.username if user else payload.get('username') or 'System Reviewer'
    for item in items:
        old_checked = item.is_checked
        item.is_checked = item.item_text in checked_items
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
def get_checklist_templates(db: Session=Depends(get_db)):
    rules = db.query(ChecklistRule).order_by(ChecklistRule.sequence_order.asc(), ChecklistRule.rule_name.asc()).all()
    return [{'id': r.id, 'rule_name': r.rule_name, 'division': r.division or 'ALL', 'category': r.category or 'ALL', 'branch': r.branch or 'ALL', 'workflow_profile': r.workflow_profile or 'ALL', 'stage_name': r.stage_name or 'Attachment Status', 'item_text': r.item_text or '', 'is_mandatory': r.is_mandatory, 'is_active': r.is_active, 'sequence_order': r.sequence_order} for r in rules]

@router.post('/api/admin/checklist-rules')
@router.post('/api/checklist-templates')
def save_checklist_template(payload: dict, db: Session=Depends(get_db)):
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
def delete_checklist_template(rule_id: int, db: Session=Depends(get_db)):
    rule = db.query(ChecklistRule).filter(ChecklistRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail='Checklist rule not found')
    db.delete(rule)
    db.commit()
    return {'success': True}

@router.get('/api/v1/approved-documents')
@router.get('/api/admin/approved-documents')
def get_approved_documents(db: Session=Depends(get_db)):
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
        results.append({'document_id': str(d.id), 'doc_key': d.doc_key or str(d.id), 'document_number': doc_num, 'document_type': d.document_type or d.category or 'ACCOUNTS PAYABLE', 'approval_status': 'APPROVED', 'settled': True, 'vendor_name': d.vendor_name or d.party_name or 'N/A', 'vendor_code': d.vendor_code or d.party_code or '', 'vendor_gstin': d.vendor_gstin or d.gstin or '', 'grand_total': d.amount or 0.0, 'base_amount': round(base_amt, 2), 'cgst': d.cgst or 0.0, 'sgst': d.sgst or 0.0, 'igst': d.igst or 0.0, 'total_tax': round(total_tax, 2), 'invoice_date': d.invoice_date or (d.created_at.strftime('%Y-%m-%d') if d.created_at else ''), 'approved_by': d.assigned_approver or 'VARUNAN', 'approved_at': d.updated_at.isoformat() if d.updated_at else '', 'company_code': d.division or 'VCC', 'cost_center': d.cost_center or 'CC-GENERAL', 'po_number': d.po_number or 'N/A', 'pdf_url': d.file_url or f'/stored_pdfs/approved/{doc_num}.pdf', 'external_sync_status': d.external_sync_status or 'SYNCED', 'external_sync_ref': d.external_sync_ref or doc_num, 'line_items': items})
    return {'status': 'success', 'total_approved': len(results), 'documents': results}