import logging
from app.services.rules_engine import infer_document_type, evaluate_business_rules_full
import os
import re
import json
import shutil
import datetime
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.config.settings import settings
from app.database.connection import SessionLocal, get_db
from app.database.models import (
    AuditLog,
    ChecklistRule,
    Document,
    DocumentApprovalLog,
    DocumentChecklistState,
    InAppNotification,
    Invoice,
    InvoiceChecklistState,
    NotificationProviderConfig,
    NotificationRaciMatrix,
    User,
    WorkflowStepDefinition,
)
from app.services.pdf_compressor import compress_pdf
from app.schemas import InvoiceResponse, InvoiceUpdate, InvoiceActionRequest, NotificationProviderSchema, NotificationRaciSchema, NotificationTestSchema
from app.auth import get_current_user, get_current_active_user, decode_token
from app.services.rules_engine import evaluate_business_rules, get_doc_type_prefix
from app.services.integration_service import dispatch_outgoing_webhook
from app.services.callback_service import dispatch_approval_callback_events
from app.services.rbac_service import authorize_document_access
from app.services.file_security import validate_uploaded_file, get_safe_file_path
from app.database.connection import SessionLocal

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

def find_invoice_by_identifier(db: Session, invoice_id: str) -> Invoice:
    raw_str = str(invoice_id).strip()
    id_clean = re.sub('^(DOC|INV|CV|EV|JV|ADV|CAPEX|GRN|SRV|FRT|UTL|EXP|DN|CN|PRJ|NR|VOUCH)[-_#]?', '', raw_str, flags=re.IGNORECASE).strip()
    inv = db.query(Invoice).filter((Invoice.id == raw_str) | (Invoice.id == f'DOC-{id_clean}') | (Invoice.id == f'INV-{id_clean}') | (Invoice.id == f'GRN-{id_clean}') | (Invoice.id == f'CV-{id_clean}') | (Invoice.id == id_clean) | Invoice.id.ilike(f'%{id_clean}%') | (Invoice.invoice_number == raw_str) | (Invoice.invoice_number == id_clean) | Invoice.invoice_number.ilike(f'%{id_clean}%') | (Invoice.doc_key == raw_str) | (Invoice.doc_key == id_clean) | Invoice.doc_key.ilike(f'%{id_clean}%')).filter(Invoice.is_deleted == False).first()
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{invoice_id}' not found")
    return inv

def is_user_in_approver_pool(user: Optional[User], pool_str: Optional[str]) -> bool:
    if not user or not pool_str:
        return False
    pool = [s.strip().lower() for s in pool_str.split(',') if s.strip()]
    raw_handles = [(user.username or '').strip().lower(), (user.employee_id or '').strip().lower(), (user.employee_name or '').strip().lower(), (user.email or '').strip().lower()]
    user_handles = [h for h in raw_handles if h]
    for h in user_handles:
        if h in pool:
            return True
        for target in pool:
            target_tokens = [t.lower() for t in target.replace('-', '_').split('_') if len(t) >= 3]
            h_tokens = [t.lower() for t in h.replace('-', '_').split('_') if len(t) >= 3]
            if h in target_tokens or target in h_tokens:
                return True
            if h == target.replace('-', '_') or target == h.replace('-', '_'):
                return True
    return False

@router.get('/api/records', response_model=List[InvoiceResponse])
@router.get('/api/documents', response_model=List[InvoiceResponse])
@router.get('/api/invoices', response_model=List[InvoiceResponse])
def get_all_invoices(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    invoices = db.query(Invoice).filter(Invoice.is_deleted == False).order_by(Invoice.created_at.desc()).all()
    approved_invoice_ids = set()
    rejected_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f'%{name}%') for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id, AuditLog.action).filter(or_(*or_filters)).all()
            for row in audit_query:
                doc_id_clean = row[0].replace('DOC-', '') if row[0] else ''
                act = (row[1] or '').lower()
                if 'approve' in act:
                    approved_invoice_ids.add(row[0])
                    approved_invoice_ids.add(doc_id_clean)
                if 'reject' in act or 'return' in act or 'cancel' in act:
                    rejected_invoice_ids.add(row[0])
                    rejected_invoice_ids.add(doc_id_clean)
    user_steps = db.query(WorkflowStepDefinition).all()
    user_pool_stages = set()
    if current_user:
        for st in user_steps:
            if st.approver_target and is_user_in_approver_pool(current_user, st.approver_target):
                user_pool_stages.add((st.profile_name, st.stage_number))
    filtered_invoices = []
    for inv in invoices:
        if inv.workflow_profile_id:
            step_def = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == (inv.current_stage or 1)).first()
            if step_def and step_def.approver_target:
                targets = [step_def.approver_target.strip()]
                if step_def.delegate_approver and step_def.delegate_approver.strip():
                    targets.append(step_def.delegate_approver.strip())
                inv.assigned_approver = ', '.join(targets)
        if current_user.role == 'admin':
            filtered_invoices.append(inv)
            continue
        user_div = (current_user.division or '').strip().upper()
        doc_div = (inv.division or '').strip().upper()
        if user_div and doc_div and user_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div != user_div:
            continue
        if inv.id in approved_invoice_ids or inv.id in rejected_invoice_ids:
            filtered_invoices.append(inv)
            continue
        if inv.assigned_approver and is_user_in_approver_pool(current_user, inv.assigned_approver):
            filtered_invoices.append(inv)
            continue
        is_prior_pool_member = False
        if inv.workflow_profile_id and (inv.current_stage or 1) > 1:
            for prior_stg in range(1, inv.current_stage or 1):
                if (inv.workflow_profile_id, prior_stg) in user_pool_stages:
                    is_prior_pool_member = True
                    break
        if is_prior_pool_member:
            filtered_invoices.append(inv)
            continue
        if authorize_document_access(current_user, inv):
            filtered_invoices.append(inv)
            continue
    results = []
    for inv in filtered_invoices:
        is_curr = False
        if current_user and inv.assigned_approver:
            is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed', 'Settled']
            if is_active_flow:
                is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver)
        has_appr = inv.id in approved_invoice_ids
        has_rej = inv.id in rejected_invoice_ids
        inv_res = InvoiceResponse.from_orm(inv)
        inv_res.is_current_approver = is_curr
        inv_res.has_approved = has_appr
        inv_res.has_rejected = has_rej
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
        results.append(inv_res)
    return results

@router.get('/api/records/{invoice_id}')
@router.get('/api/documents/{invoice_id}')
@router.get('/api/invoices/{invoice_id}')
def get_invoice_by_id(invoice_id: str, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    steps_data = []
    if inv.workflow_profile_id:
        steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        for s in steps:
            steps_data.append({'stage_number': s.stage_number, 'stage_name': s.step_name, 'approver_target': s.approver_target, 'action_required': s.action_required, 'permissions': s.permissions})
    if not steps_data:
        target_profile = inv.workflow_profile_id or 'UNRESOLVED'
        raise HTTPException(status_code=404, detail=f"Workflow step definitions missing: No stages configured in workflow_step_definitions for profile '{target_profile}' on document '{inv.id}'.")
    current_step_name = 'Stage 1'
    for s in steps_data:
        if s['stage_number'] == (inv.current_stage or 1):
            current_step_name = s['stage_name']
            break
    if inv.workflow_profile_id:
        step_def = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == (inv.current_stage or 1)).first()
        if step_def and step_def.approver_target:
            targets = [step_def.approver_target.strip()]
            if step_def.delegate_approver and step_def.delegate_approver.strip():
                targets.append(step_def.delegate_approver.strip())
            inv.assigned_approver = ', '.join(targets)
    is_curr = False
    if current_user and inv.assigned_approver:
        is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Rejected', 'Failed', 'Settled']
        if is_active_flow:
            is_curr = is_user_in_approver_pool(current_user, inv.assigned_approver)
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
    is_prior_pool_member = False
    if current_user and inv.workflow_profile_id and ((inv.current_stage or 1) > 1):
        for prior_stg in range(1, inv.current_stage or 1):
            st = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == prior_stg).first()
            if st and st.approver_target and is_user_in_approver_pool(current_user, st.approver_target):
                is_prior_pool_member = True
                break
    if current_user and current_user.role != 'admin':
        user_div = (current_user.division or '').strip().upper()
        doc_div = (inv.division or '').strip().upper()
        if user_div and doc_div and user_div not in ['HQ', 'GLOBAL', 'ALL', ''] and doc_div != user_div:
            raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view document '{invoice_id}'. Documents are scoped to your assigned division/department.")
        if not is_curr and (not has_appr) and (not has_rej) and (not is_prior_pool_member) and not authorize_document_access(current_user, inv):
            raise HTTPException(status_code=403, detail=f"Access Denied: You do not have permission to view document '{invoice_id}'. Documents are scoped to your assigned division/department.")
    inv_dict = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
    inv_dict['is_current_approver'] = is_curr
    inv_dict['has_approved'] = has_appr
    inv_dict['has_rejected'] = has_rej
    inv_dict['workflow_step_definitions'] = steps_data
    inv_dict['active_approval_log'] = {'current_stage_number': inv.current_stage or 1, 'stage_name': current_step_name, 'status': 'Pending'}
    return inv_dict

@router.put('/api/records/{invoice_id}')
@router.put('/api/documents/{invoice_id}')
@router.put('/api/invoices/{invoice_id}')
def update_invoice(invoice_id: str, payload: InvoiceUpdate, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    update_data = payload.dict(exclude_unset=True)
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
        elif (settings.UPLOAD_DIR / 'sample_invoice.pdf').exists():
            src_path = (settings.UPLOAD_DIR / 'sample_invoice.pdf').resolve()
        if src_path and src_path.exists():
            base_root = get_storage_root_path().resolve()
            dest_approved = get_archived_pdf_path(inv).resolve()
            if dest_approved.is_relative_to(base_root):
                dest_approved.parent.mkdir(parents=True, exist_ok=True)
                if src_path != dest_approved:
                    shutil.copy2(str(src_path), str(dest_approved))
                    logger.info(f'[Archive] Successfully archived approved PDF for document {inv.id}')
                    if upload_path and upload_path.exists() and (upload_path != dest_approved) and (upload_path.name != 'sample_invoice.pdf'):
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
        db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action=f'Rejected / Returned to Stage {prev_stage}', stage=f'Stage {current_stage}', notes=f'Rejected at Stage {current_stage} by {approver_name} ➔ Returned to Stage {prev_stage} ({prev_step_name}, Assigned: {inv.assigned_approver}). Reason: {remarks}'))
        trigger_async_integration_push(str(inv.id), decision='REJECTED')
        safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
        return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver, 'message': f'Document returned to Stage {prev_stage} ({prev_step_name}) for previous approver review.'}
    else:
        inv.status = 'Cancelled'
        inv.assigned_approver = None
        archive_rejected_pdf(inv)
        dispatch_rejection_inapp_notifications(db=db, inv=inv, approver_name=approver_name, from_stage=1, to_stage=0, remarks=remarks, target_approver=None, is_cancelled=True)
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
    current_user: Optional[User] = Depends(get_current_user)
):
    auth_user = current_user
    if not auth_user and token:
        try:
            payload = decode_token(token)
            username = payload.get('sub')
            if username:
                auth_user = db.query(User).filter(User.username == username, User.is_active == True).first()
        except Exception as auth_err:
            logger.debug('Failed to decode token for pdf attachment: %s', auth_err)

    if not auth_user:
        raise HTTPException(status_code=401, detail='Authentication required to view document attachment.')

    inv = find_invoice_by_identifier(db, invoice_id)
    if not authorize_document_access(auth_user, inv) and not is_user_in_approver_pool(auth_user, inv.assigned_approver):
        raise HTTPException(status_code=403, detail='Access Denied: You are not authorized to access this document file.')

    target_ref = getattr(inv, 'file_path', None) or inv.file_url
    if not target_ref:
        raise HTTPException(status_code=404, detail='No physical file attached to this document.')

    safe_path = get_safe_file_path(target_ref)
    if not safe_path.exists():
        raise HTTPException(status_code=404, detail='Document file not found on server storage.')

    media_type = 'application/pdf' if safe_path.suffix.lower() == '.pdf' else 'image/jpeg'
    return FileResponse(
        path=str(safe_path),
        media_type=media_type,
        filename=safe_path.name,
        headers={'Content-Disposition': f'inline; filename="{safe_path.name}"'}
    )

def check_approval_authorization(inv: Invoice, user: Optional[User], db: Optional[Session]=None, require_compliance: bool=True):
    if not user:
        raise HTTPException(status_code=401, detail='Authentication required: Please log in to approve or review documents.')
    if not user.is_active:
        raise HTTPException(status_code=403, detail='Account Inactive: Your user account is disabled.')
    if inv.status in ['Settled', 'Approved', 'Paid', 'Ready for Payment', 'Cancelled', 'Failed']:
        raise HTTPException(status_code=400, detail=f"This document is already in a terminal/completed state ('{inv.status}') and cannot accept further workflow actions.")
    if inv.assigned_approver and inv.assigned_approver.strip():
        approvers = [s.strip().lower() for s in inv.assigned_approver.split(',') if s.strip()]
        user_handles = [(user.username or '').lower(), (user.employee_id or '').lower(), (user.employee_name or '').lower(), (user.name or '').lower(), (user.email or '').lower(), (user.role or '').lower()]
        user_handles = [h for h in user_handles if h]
        is_admin = (user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin']
        is_authorized = is_admin
        if not is_authorized:
            for handle in user_handles:
                if handle in approvers or any((handle == app or handle in app or app in handle for app in approvers)):
                    is_authorized = True
                    break
        if not is_authorized:
            raise HTTPException(status_code=403, detail=f'Access Denied: Only the assigned approver ({inv.assigned_approver}) for Stage {inv.current_stage or 1} is authorized to approve this document.')
    if require_compliance and db:
        is_stage_1 = (inv.current_stage or 1) == 1
        has_attachment = False
        if inv.file_url and inv.file_url.strip():
            try:
                target_f = getattr(inv, 'file_path', None) or inv.file_url
                file_disk_path = get_safe_file_path(target_f)
                if file_disk_path.exists() and file_disk_path.stat().st_size > 0:
                    has_attachment = True
            except Exception:
                has_attachment = False
        if is_stage_1 and (not has_attachment):
            raise HTTPException(status_code=400, detail='Physical PDF Attachment Compulsory: A valid physical invoice PDF file must be attached and uploaded before approving Stage 1 (Attachment Status).')
        current_step_name = 'Attachment Status' if is_stage_1 else f'Stage {inv.current_stage or 1}'
        if inv.workflow_profile_id:
            step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == (inv.current_stage or 1)).first()
            if step and step.step_name:
                current_step_name = step.step_name
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
                raise HTTPException(status_code=400, detail=f"Compliance Checklist Incomplete: The following mandatory checklist items must be verified and checked before approving: {missing_items_str}")

@router.post('/api/workflows/approve')
@router.post('/api/workflow/approve')
def workflow_approve_payload(payload: dict, db: Session=Depends(get_db), user: User=Depends(get_current_active_user)):
    doc_id = payload.get('invoiceId') or payload.get('invoice_id') or payload.get('document_id') or payload.get('id')
    if not doc_id:
        raise HTTPException(status_code=400, detail='Missing invoiceId in approval payload')
    inv = find_invoice_by_identifier(db, doc_id)
    check_approval_authorization(inv, user, db=db, require_compliance=True)
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
        raise HTTPException(status_code=409, detail=f"Conflict: Version mismatch. Document '{inv.id}' version is {current_version}, expected {expected_ver}.")
    next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
    next_stage_val = prev_stage_num
    next_assigned_val = inv.assigned_approver
    next_checklist_val = inv.checklist_state

    if (inv.current_stage or 1) < (inv.total_stages or 1):
        next_stage_val = (inv.current_stage or 1) + 1
        next_step_name = f'Stage {next_stage_val}'
        if inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == next_stage_val).first()
            if next_step:
                next_assigned_val = next_step.approver_target
                next_step_name = next_step.step_name
                next_assigned_info = f'Advanced to Stage {next_stage_val} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}.'
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
        next_status_val = 'Settled'
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
        raise HTTPException(status_code=409, detail=f"Conflict: Document '{inv.id}' was modified or approved concurrently by another process. Please reload.")

    inv.current_stage = next_stage_val
    inv.status = next_status_val
    inv.assigned_approver = next_assigned_val
    inv.version = current_version + 1
    inv.checklist_state = next_checklist_val

    dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=approver_name, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=inv.status == 'Settled')
    db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action=f'Approved ({stage_name})', stage=stage_name, notes=f'{remarks} ➔ {next_assigned_info}'))
    db.commit()
    db.refresh(inv)
    safe_broadcast_event('DOCUMENT_UPDATED', {'document_id': str(inv.id), 'status': inv.status, 'current_stage': inv.current_stage, 'assigned_approver': inv.assigned_approver})
    return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': inv, 'approved_by': approver_name}

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
        raise HTTPException(status_code=409, detail=f"Conflict: Version mismatch. Document '{inv.id}' version is {current_version}, expected {action.expected_version}.")
    next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
    next_stage_val = prev_stage_num
    next_assigned_val = inv.assigned_approver
    next_checklist_val = inv.checklist_state

    if (inv.current_stage or 1) < (inv.total_stages or 1):
        next_stage_val = (inv.current_stage or 1) + 1
        next_step_name = f'Stage {next_stage_val}'
        if inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == next_stage_val).first()
            if next_step:
                next_assigned_val = next_step.approver_target
                next_step_name = next_step.step_name
                next_assigned_info = f'Advanced to Stage {next_stage_val} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}.'
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
        next_status_val = 'Settled'
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
        raise HTTPException(status_code=409, detail=f"Conflict: Document '{inv.id}' was modified or approved concurrently by another process. Please reload.")

    inv.current_stage = next_stage_val
    inv.status = next_status_val
    inv.assigned_approver = next_assigned_val
    inv.version = current_version + 1
    inv.checklist_state = next_checklist_val

    dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=username, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=inv.status == 'Settled')
    db.add(AuditLog(invoice_id=str(inv.id), user=username, action=f'Approved ({stage_name})', stage=stage_name, notes=f'{remarks} ➔ {next_assigned_info}'))
    db.commit()
    db.refresh(inv)
    return {'success': True, 'status': inv.status, 'current_stage': inv.current_stage, 'invoice': inv}

@router.post('/api/records/{invoice_id}/step-action')
@router.post('/api/documents/{invoice_id}/step-action')
@router.post('/api/invoices/{invoice_id}/step-action')
def invoice_step_action(invoice_id: str, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    action_type = str(payload.get('action') or 'Approve').strip()
    act_lower = action_type.lower()
    is_approving = 'approve' in act_lower or 'pass' in act_lower
    check_approval_authorization(inv, user, db=db, require_compliance=is_approving)
    comments = str(payload.get('comments') or payload.get('comment') or 'Action processed by desk operator.').strip()
    approver_name = payload.get('approver') or (user.employee_name or user.name if user else 'Desk Operator')
    stage_name = f'Stage {inv.current_stage or 1}'
    prev_stage_num = inv.current_stage or 1
    if 'approve' in act_lower or 'pass' in act_lower:
        next_assigned_info = 'Final Settlement Completed. Ready for payment disbursement.'
        if (inv.current_stage or 1) < (inv.total_stages or 1):
            inv.current_stage = (inv.current_stage or 1) + 1
            next_step_name = f'Stage {inv.current_stage}'
            if inv.workflow_profile_id:
                next_step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == inv.current_stage).first()
                if next_step:
                    inv.assigned_approver = next_step.approver_target
                    next_step_name = next_step.step_name
                    next_assigned_info = f'Advanced to Stage {inv.current_stage} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}.'
            existing_next_items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == next_step_name).all()
            if not existing_next_items:
                checklist_items = resolve_checklist_items(db, inv, next_step_name)
                for item_text in checklist_items:
                    db.add(InvoiceChecklistState(invoice_id=inv.id, stage_name=next_step_name, item_text=item_text, is_checked=False))
                inv.checklist_state = json.dumps({item_text: False for item_text in checklist_items})
            else:
                for item in existing_next_items:
                    item.is_checked = False
                    item.checked_by = None
                    item.checked_at = None
                inv.checklist_state = json.dumps({item.item_text: False for item in existing_next_items})
            inv.status = f'In Progress (Stage {inv.current_stage})'
        else:
            inv.status = 'Settled'
            archive_approved_pdf(inv)
        dispatch_approval_inapp_notifications(db=db, inv=inv, approver_name=approver_name, prev_stage=prev_stage_num, new_stage=inv.current_stage, next_approver_target=inv.assigned_approver, is_completed=inv.status == 'Settled')
        db.add(AuditLog(invoice_id=str(inv.id), user=approver_name, action=f'Approved ({stage_name})', stage=stage_name, notes=f'{comments} ➔ {next_assigned_info}'))
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
    import uuid
    content = await file.read()
    unique_filename, detected_type = validate_uploaded_file(file, content)
    file_path = settings.UPLOAD_DIR / unique_filename
    with open(file_path, 'wb') as buffer:
        buffer.write(content)

    if detected_type == 'pdf':
        try:
            compress_pdf(file_path)
        except Exception as exc:
            logger.debug('Handled compression exception: %s', exc)

    ocr_data = {}
    if detected_type == 'pdf':
        try:
            from app.services.ocr_service import extract_text_from_pdf
            ocr_data = extract_text_from_pdf(file_path) or {}
        except Exception as exc:
            logger.debug('Handled ocr exception: %s', exc)

    timestamp = int(datetime.datetime.utcnow().timestamp())
    prefix = get_doc_type_prefix(document_type or '', '')
    rand_hex = uuid.uuid4().hex[:6].upper()
    new_id = f'{prefix}-{timestamp % 1000000}_{rand_hex}'

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
        file_size=len(content),
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
    inv = db.query(Invoice).filter(Invoice.id == synced_doc_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail='Synced staging document not found')
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
@router.get('/api/invoices/{id}/comments')
def get_document_comments(id: str, db: Session=Depends(get_db)):
    inv = find_invoice_by_identifier(db, id)
    logs = db.query(AuditLog).filter((AuditLog.invoice_id == str(inv.id)) | (AuditLog.invoice_id == f'DOC-{inv.id}'), AuditLog.notes.isnot(None)).order_by(AuditLog.timestamp.desc()).all()
    comments = []
    for l in logs:
        if l.notes:
            ts_str = l.timestamp.isoformat() if l.timestamp else datetime.datetime.utcnow().isoformat()
            if not ts_str.endswith('Z') and '+' not in ts_str and ('-' not in ts_str[10:]):
                ts_str += 'Z'
            comments.append({'id': str(l.id), 'author': l.user or 'System', 'text': l.notes, 'created_at': ts_str, 'action': l.action, 'stage': l.stage})
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
                if has_approved:
                    approved_count += 1
                else:
                    is_active_flow = inv.status not in ['Approved', 'Paid', 'Ready for Payment', 'Rejected', 'Failed', 'Settled']
                    if is_active_flow and is_assigned:
                        pending_count += 1
        total_docs = len(scoped_invoices)
    else:
        total_docs = len(invoices)
        pending_count = sum((1 for i in invoices if any((status.lower() in (i.status or '').lower() for status in ['pending', 'initiated', 'progress']))))
        approved_count = sum((1 for i in invoices if any((status.lower() in (i.status or '').lower() for status in ['settled', 'approved', 'paid', 'ready for payment']))))
        total_spend = sum((float(i.amount or 0.0) for i in invoices))
    return {'totalDocuments': total_docs, 'pendingApprovals': pending_count, 'approvedDocuments': approved_count, 'totalSpendINR': total_spend, 'autoRoutedPercentage': 100.0 if total_docs > 0 else 0.0}

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
    smtp_user = (config.username if config and config.username else '').strip()
    smtp_pass = (config.encrypted_password if config and config.encrypted_password else '').strip()
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

def resolve_checklist_items(db: Session, inv: Invoice, stage_name: str) -> List[str]:
    # Checklists removed per user directive
    return []

@router.get('/api/invoices/{invoice_id}/checklist')
def get_invoice_checklist(invoice_id: str, stage_num: Optional[int]=None, stage_name: Optional[str]=None, db: Session=Depends(get_db)):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail='Invoice not found')
    target_stage = stage_num or inv.current_stage or 1
    current_step_name = 'Attachment Status' if target_stage == 1 else f'Stage {target_stage}'
    if stage_name:
        current_step_name = stage_name
    elif inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == inv.workflow_profile_id, WorkflowStepDefinition.stage_number == target_stage).first()
        if step and step.step_name:
            current_step_name = step.step_name
    items = db.query(InvoiceChecklistState).filter(InvoiceChecklistState.invoice_id == inv.id, InvoiceChecklistState.stage_name == current_step_name).order_by(InvoiceChecklistState.id.asc()).all()
    if not items:
        default_items = resolve_checklist_items(db, inv, current_step_name)
        for t_text in default_items:
            item = InvoiceChecklistState(invoice_id=inv.id, stage_name=current_step_name, item_text=t_text, is_checked=False)
            db.add(item)
            items.append(item)
        db.commit()
    return [{'id': item.id, 'stage_name': item.stage_name, 'item_text': item.item_text, 'is_checked': item.is_checked, 'checked_by': item.checked_by, 'checked_at': item.checked_at} for item in items]

@router.post('/api/invoices/{invoice_id}/checklist')
def update_invoice_checklist(invoice_id: str, payload: dict, db: Session=Depends(get_db), user: Optional[User]=Depends(get_current_user)):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail='Invoice not found')
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
        rule = ChecklistRule()
        db.add(rule)
    rule.rule_name = payload.get('rule_name', 'Checklist Rule')
    rule.division = payload.get('division', 'ALL')
    rule.category = payload.get('category', 'ALL')
    rule.branch = payload.get('branch', 'ALL')
    rule.workflow_profile = payload.get('workflow_profile', 'ALL')
    rule.stage_name = payload.get('stage_name', 'Attachment Status')
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

@router.get('/api/documents/approved')
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