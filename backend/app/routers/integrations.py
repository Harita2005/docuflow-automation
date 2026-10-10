import logging
import json
import requests
import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.config.settings import settings
from app.database.connection import get_db
from app.database.models import AuditLog, Document, IntegrationSyncLog, ThirdPartyWebhookConfig, User
from app.schemas import ThirdPartyWebhookConfigCreate, ThirdPartyWebhookConfigResponse, ThirdPartyWebhookTestRequest, IntegrationAcknowledgmentRequest, IntegrationAcknowledgmentResponse
from app.services.integration_service import build_universal_export_payload, dispatch_outgoing_webhook, compute_hmac_signature
from app.auth import get_current_active_user, verify_service_api_key
from app.services.rbac_service import check_permission
from app.services.crypto_service import encrypt_secret, decrypt_secret, mask_secret

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/integrations/v1', tags=['Third-Party & SAP Integrations'])

def _require_integration_admin(user: User, db: Session):
    is_admin = (user.role or '').lower() in ['admin', 'administrator', 'system_admin', 'superadmin'] or check_permission(user, 'admin:rbac', db) or check_permission(user, 'integration:manage', db)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Administrator authorization required to manage integrations."
        )

@router.get('/approved-documents')
def get_approved_documents(division: Optional[str]=Query(None, description='Filter by Company Division (e.g. VCC, SD, ACC)'), plant: Optional[str]=Query(None, description='Filter by Plant / Branch location'), sync_status: Optional[str]=Query('UNSYNCED', description='Filter by sync state: UNSYNCED, SYNCED, ALL, FAILED'), since: Optional[datetime.datetime]=Query(None, description='Filter documents approved/settled since ISO timestamp'), limit: int=Query(50, ge=1, le=200, description='Max records to return'), request: Request=None, db: Session=Depends(get_db), _auth: bool=Depends(verify_service_api_key)):
    """
    [PULL API] Polling endpoint for SAP, Oracle, Tally, or external ERPs to query newly approved documents.
    Returns standard serialized payloads including line items, GL / cost center tags, and PDF download links.
    """
    query = db.query(Document).filter(Document.is_deleted == False, Document.status == 'Settled')
    if division:
        query = query.filter(Document.division.ilike(f'%{division}%'))
    if plant:
        query = query.filter(Document.plant.ilike(f'%{plant}%'))
    if since:
        query = query.filter(Document.updated_at >= since)
    if sync_status and sync_status.upper() != 'ALL':
        if sync_status.upper() == 'UNSYNCED':
            query = query.filter((Document.external_sync_status == 'UNSYNCED') | Document.external_sync_status.is_(None))
        else:
            query = query.filter(Document.external_sync_status == sync_status.upper())
    docs = query.order_by(Document.updated_at.desc()).limit(limit).all()
    base_url = str(request.base_url).rstrip('/') if request else ''
    results = [build_universal_export_payload(d, base_url=base_url) for d in docs]
    return {'success': True, 'count': len(results), 'filter': {'division': division, 'plant': plant, 'sync_status': sync_status, 'since': since.isoformat() if since else None}, 'data': results}

@router.get('/documents/{document_id}')
def get_single_document_export(document_id: str, request: Request=None, db: Session=Depends(get_db), _auth: bool=Depends(verify_service_api_key)):
    """
    [PULL API] Fetches full serialized export details for a single document.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    base_url = str(request.base_url).rstrip('/') if request else ''
    return {'success': True, 'data': build_universal_export_payload(doc, base_url=base_url)}

@router.post('/documents/{document_id}/acknowledge', response_model=IntegrationAcknowledgmentResponse)
def acknowledge_document_sync(document_id: str, body: IntegrationAcknowledgmentRequest, db: Session=Depends(get_db), _auth: bool=Depends(verify_service_api_key)):
    """
    [PULL API] Called by 3rd-party ERP after successfully ingesting the document.
    Saves external reference number (e.g. SAP Doc #), updates sync timestamp, and adds an audit log entry.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    now = datetime.datetime.utcnow()
    doc.external_sync_status = body.posting_status or 'SYNCED'
    doc.external_sync_ref = body.external_reference_id
    doc.external_synced_at = now
    doc.external_sync_system = body.external_system_name
    db.add(IntegrationSyncLog(document_id=doc.id, sync_direction='PULL', target_system=body.external_system_name, status=body.posting_status or 'SYNCED', external_reference=body.external_reference_id, response_body=body.notes or f'Acknowledged by {body.external_system_name}'))
    db.add(AuditLog(invoice_id=doc.id, user=f'API Integration ({body.external_system_name})', action='ERP_POSTED', stage='EXTERNAL SYNC', notes=f"Document successfully synced to {body.external_system_name}. Reference ID: {body.external_reference_id}. Notes: {body.notes or 'None'}"))
    db.commit()
    return IntegrationAcknowledgmentResponse(success=True, document_id=doc.id, external_sync_status=doc.external_sync_status, external_sync_ref=doc.external_sync_ref, external_synced_at=doc.external_synced_at, message=f'Sync status successfully recorded for document {doc.id}')

@router.get('/documents/{document_id}/download-pdf')
def download_approved_document_pdf(document_id: str, db: Session=Depends(get_db), _auth: bool=Depends(verify_service_api_key)):
    """
    [PULL API] Streams the physical or stamped PDF of the approved document directly to 3rd-party systems.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    file_url = doc.file_url or ''
    from app.routers.documents import get_archived_pdf_path
    structured_path = get_archived_pdf_path(doc)
    candidate_paths = [structured_path, Path(file_url), settings.UPLOAD_DIR / Path(file_url).name if file_url else None, settings.PDF_STORAGE_DIR / Path(file_url).name if file_url else None, Path('uploads') / file_url.lstrip('/uploads/').lstrip('uploads/'), Path('stored_pdfs/approved') / f'{doc.id}_approved.pdf', Path('stored_pdfs/approved') / f'{doc.id}.pdf', Path('stored_pdfs') / f'{doc.id}.pdf', Path('backend/uploads') / file_url.lstrip('/uploads/').lstrip('uploads/')]
    
    allowed_roots = [
        settings.UPLOAD_DIR.resolve(),
        settings.PDF_STORAGE_DIR.resolve(),
        settings.APPROVED_PDF_DIR.resolve(),
        Path('uploads').resolve(),
        Path('stored_pdfs').resolve(),
        Path('backend/uploads').resolve(),
    ]
    valid_candidates = []
    for p in candidate_paths:
        if p is not None:
            try:
                res_p = p.resolve()
                if any(res_p.is_relative_to(root) for root in allowed_roots):
                    valid_candidates.append(res_p)
            except (OSError, RuntimeError, ValueError, Exception):
                # Intentionally ignored: path resolution or boundary validation on unresolvable path is skipped
                pass
                
    found_path = next((p for p in valid_candidates if p.is_file()), None)
    if not found_path and settings.APPROVED_PDF_DIR.exists():
        matches = list(settings.APPROVED_PDF_DIR.glob(f'**/*{doc.id}*.pdf'))
        if matches:
            found_path = matches[0]
    if not found_path:
        raise HTTPException(status_code=404, detail='Approved PDF file attachment not found on disk')
    filename = f'{doc.invoice_number or doc.id}_approved.pdf'
    return FileResponse(path=str(found_path), media_type='application/pdf', filename=filename)

@router.get('/webhook-config', response_model=Optional[ThirdPartyWebhookConfigResponse])
def get_webhook_config(db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Returns current outbound webhook configuration with masked secrets.
    """
    _require_integration_admin(current_user, db)
    config = db.query(ThirdPartyWebhookConfig).first()
    if not config:
        return None
    return ThirdPartyWebhookConfigResponse(
        id=config.id,
        name=config.name,
        target_url=config.target_url,
        auth_header_name=config.auth_header_name,
        auth_token=mask_secret(config.auth_token),
        hmac_secret=mask_secret(config.hmac_secret),
        is_active=config.is_active,
        retry_count=config.retry_count,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )

@router.post('/webhook-config', response_model=ThirdPartyWebhookConfigResponse)
def save_webhook_config(body: ThirdPartyWebhookConfigCreate, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Creates or updates the outbound webhook endpoint for real-time pushing.
    """
    _require_integration_admin(current_user, db)
    if body.target_url:
        from app.services.security_service import validate_and_reconstruct_url
        try:
            body.target_url = validate_and_reconstruct_url(body.target_url)
        except Exception as url_err:
            raise HTTPException(status_code=400, detail=f"Invalid webhook target URL: {getattr(url_err, 'detail', str(url_err))}")
    config = db.query(ThirdPartyWebhookConfig).first()
    if not config:
        config = ThirdPartyWebhookConfig()
        db.add(config)
    config.name = body.name or 'Primary ERP Integration Endpoint'
    config.target_url = body.target_url
    config.auth_header_name = body.auth_header_name or 'Authorization'
    if body.auth_token and body.auth_token != '********':
        config.auth_token = encrypt_secret(body.auth_token)
    elif not body.auth_token:
        config.auth_token = None

    if body.hmac_secret and body.hmac_secret != '********':
        config.hmac_secret = encrypt_secret(body.hmac_secret)
    elif not body.hmac_secret:
        config.hmac_secret = None

    config.is_active = body.is_active if body.is_active is not None else True
    config.retry_count = body.retry_count or 3
    config.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(config)
    return ThirdPartyWebhookConfigResponse(
        id=config.id,
        name=config.name,
        target_url=config.target_url,
        auth_header_name=config.auth_header_name,
        auth_token=mask_secret(config.auth_token),
        hmac_secret=mask_secret(config.hmac_secret),
        is_active=config.is_active,
        retry_count=config.retry_count,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )

@router.post('/webhook-test')
def test_webhook_connection(body: ThirdPartyWebhookTestRequest, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Sends a test ping event to the target webhook URL to verify network connectivity and authentication.
    """
    _require_integration_admin(current_user, db)
    target_url = body.target_url
    auth_header_name = body.auth_header_name or 'Authorization'
    auth_token = body.auth_token
    hmac_secret = body.hmac_secret
    if not target_url or auth_token == '********' or hmac_secret == '********':
        saved_config = db.query(ThirdPartyWebhookConfig).first()
        if saved_config:
            if not target_url:
                target_url = saved_config.target_url
                auth_header_name = saved_config.auth_header_name
            if not auth_token or auth_token == '********':
                auth_token = decrypt_secret(saved_config.auth_token)
            if not hmac_secret or hmac_secret == '********':
                hmac_secret = decrypt_secret(saved_config.hmac_secret)
    if not target_url:
        raise HTTPException(status_code=400, detail='No target URL provided or configured')
    test_payload = {'event': 'ping', 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z', 'message': 'DocuFlow Automation Webhook Connectivity Test', 'docuflow_version': '2.0'}
    payload_json = json.dumps(test_payload)
    headers = {'Content-Type': 'application/json', 'User-Agent': 'DocuFlow-Automation-Webhook-Test/2.0', 'X-DocuFlow-Event': 'ping'}
    if auth_header_name and auth_token:
        headers[auth_header_name] = auth_token
    if hmac_secret:
        headers['X-DocuFlow-Signature'] = f'sha256={compute_hmac_signature(payload_json, hmac_secret)}'
    from app.services.security_service import validate_and_reconstruct_url
    try:
        safe_target_url = validate_and_reconstruct_url(target_url)
    except Exception as url_err:
        logger.debug('Handled exception: %s', url_err)
        return {'success': False, 'target_url': target_url, 'error': str(getattr(url_err, 'detail', url_err))}
    try:
        resp = requests.post(safe_target_url, data=payload_json.encode('utf-8'), headers=headers, timeout=10, allow_redirects=False)
        return {'success': resp.status_code < 400, 'status_code': resp.status_code, 'target_url': safe_target_url, 'response': resp.text[:1000]}
    except Exception as e:
        logger.debug('Handled exception: %s', e)
        return {'success': False, 'target_url': safe_target_url, 'error': f'Request dispatch failed: {type(e).__name__}'}

alias_router = APIRouter(prefix='/api/integrations', tags=['Third-Party & SAP Integrations'])

@router.post('/documents/{document_id}/retry-push')
@alias_router.post('/documents/{document_id}/retry-push')
def retry_document_push(document_id: str, background_tasks: BackgroundTasks, request: Request=None, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Manually re-triggers outgoing webhook push for a specific document.
    """
    _require_integration_admin(current_user, db)
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")
    doc.external_sync_status = 'PENDING'
    db.commit()
    base_url = str(request.base_url).rstrip('/') if request else ''
    background_tasks.add_task(dispatch_outgoing_webhook, document_id=doc.id, base_url=base_url)
    return {'success': True, 'document_id': doc.id, 'message': f'Push event queued in background for document {doc.id}'}

@router.get('/failed-syncs')
@alias_router.get('/failed-syncs')
def get_failed_sync_documents(limit: int=50, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Returns documents that failed or are pending external synchronization.
    Displays attempt count, last error, and next scheduled retry for admin oversight and manual retry.
    """
    _require_integration_admin(current_user, db)
    docs = db.query(Document).filter(
        Document.external_sync_status.in_(['FAILED', 'DEAD', 'NEEDS_ATTENTION', 'PENDING']),
        Document.is_deleted == False
    ).order_by(Document.updated_at.desc()).limit(limit).all()

    from app.services.integration_service import get_sync_retry_meta
    results = []
    for d in docs:
        meta = get_sync_retry_meta(d)
        results.append({
            'document_id': d.id,
            'invoice_number': d.invoice_number or d.doc_num,
            'vendor_name': d.vendor_name or d.party_name,
            'amount': float(d.amount) if d.amount else 0.0,
            'status': d.status,
            'external_sync_status': d.external_sync_status,
            'external_sync_system': d.external_sync_system,
            'external_sync_ref': d.external_sync_ref,
            'attempt_count': meta.get('attempt_count', 0),
            'last_error': meta.get('last_error'),
            'next_retry_at': meta.get('next_retry_at'),
            'max_attempts': meta.get('max_attempts', 5),
            'updated_at': d.updated_at.isoformat() if d.updated_at else None
        })
    return {'success': True, 'count': len(results), 'data': results}

@router.get('/sync-logs')
@alias_router.get('/sync-logs')
def get_integration_sync_logs(limit: int=50, db: Session=Depends(get_db), current_user: User=Depends(get_current_active_user)):
    """
    Returns recent integration sync logs (both PUSH and PULL) for system auditing.
    """
    _require_integration_admin(current_user, db)
    logs = db.query(IntegrationSyncLog).order_by(IntegrationSyncLog.timestamp.desc()).limit(limit).all()
    return {'success': True, 'count': len(logs), 'data': [{'id': l.id, 'document_id': l.document_id, 'sync_direction': l.sync_direction, 'target_system': l.target_system, 'status': l.status, 'status_code': l.status_code, 'external_reference': l.external_reference, 'error_message': l.error_message, 'timestamp': l.timestamp.isoformat() if l.timestamp else None} for l in logs]}