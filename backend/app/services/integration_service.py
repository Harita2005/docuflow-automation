import logging
import json
import hmac
import hashlib
import datetime
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.database.connection import SessionLocal
from app.database.models import Document, IntegrationSyncLog, ThirdPartyWebhookConfig

logger = logging.getLogger(__name__)

RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600]  # 1m, 5m, 15m, 1h
MAX_RETRY_ATTEMPTS = 5

def get_sync_retry_meta(inv: Document) -> Dict[str, Any]:
    """Extracts structured retry metadata from Document.external_sync_error."""
    if not inv:
        return {"attempt_count": 0, "last_error": None, "next_retry_at": None, "max_attempts": MAX_RETRY_ATTEMPTS}
    err_text = getattr(inv, 'external_sync_error', None)
    if err_text:
        try:
            parsed = json.loads(err_text)
            if isinstance(parsed, dict) and 'attempt_count' in parsed:
                return {
                    "attempt_count": int(parsed.get('attempt_count', 0)),
                    "last_error": parsed.get('last_error'),
                    "next_retry_at": parsed.get('next_retry_at'),
                    "max_attempts": int(parsed.get('max_attempts', MAX_RETRY_ATTEMPTS))
                }
        except Exception:
            pass
    return {
        "attempt_count": 1 if err_text else 0,
        "last_error": err_text,
        "next_retry_at": None,
        "max_attempts": MAX_RETRY_ATTEMPTS
    }

def build_universal_export_payload(inv: Document, base_url: str='') -> Dict[str, Any]:
    """
    Constructs a standardized, enterprise-ready JSON payload for SAP / 3rd-party ERP consumption.
    Includes headers, financials, line items, cost center tags, checklist states, and audit signoffs.
    """
    line_items = []
    if inv.line_items:
        for item in inv.line_items:
            line_items.append({'id': item.id, 'item_code': item.item_code, 'description': item.description, 'quantity': float(item.quantity) if item.quantity is not None else 1.0, 'unit_price': float(item.unit_price) if item.unit_price is not None else 0.0, 'amount': float(item.amount) if item.amount is not None else 0.0, 'warranty_text': item.warranty_text, 'serial_numbers': item.serial_numbers})
    elif inv.line_items_json:
        try:
            parsed = json.loads(inv.line_items_json)
            if isinstance(parsed, list):
                line_items = parsed
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
    checklists = []
    if inv.checklist_states:
        for c in inv.checklist_states:
            checklists.append({'item_text': c.item_text, 'is_checked': bool(c.is_checked), 'checked_by': c.checked_by, 'checked_at': c.checked_at.isoformat() if c.checked_at else None, 'stage': getattr(c, 'stage_name', getattr(c, 'stage', None))})
    elif inv.checklist_state:
        try:
            parsed_cl = json.loads(inv.checklist_state)
            if isinstance(parsed_cl, dict):
                checklists = [{'item_text': k, 'is_checked': bool(v)} for k, v in parsed_cl.items()]
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
    approval_trail = []
    if inv.approval_logs:
        for log in sorted(inv.approval_logs, key=lambda x: x.timestamp or datetime.datetime.min):
            approval_trail.append({'user': log.user, 'action': log.action, 'stage': log.stage, 'notes': log.notes, 'ip_address': log.ip_address, 'timestamp': log.timestamp.isoformat() if log.timestamp else None})
    custom_data = {}
    if inv.custom_data:
        try:
            custom_data = json.loads(inv.custom_data) if isinstance(inv.custom_data, str) else inv.custom_data
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
    clean_base = base_url.rstrip('/') if base_url else ''
    pdf_download_url = f'{clean_base}/api/integrations/v1/documents/{inv.id}/download-pdf' if clean_base else f'/api/integrations/v1/documents/{inv.id}/download-pdf'
    clean_pdf_url = inv.file_url
    if not clean_pdf_url or clean_pdf_url.startswith('/uploads/') or clean_pdf_url.startswith('/stored_pdfs/'):
        clean_pdf_url = f'/api/documents/{inv.id}/file'
    return {'event': 'document.settled', 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z', 'docuflow_version': '2.0', 'document': {'id': inv.id, 'doc_num': inv.doc_num or inv.invoice_number, 'doc_key': inv.doc_key, 'doc_date': inv.doc_date or inv.invoice_date, 'invoice_number': inv.invoice_number, 'invoice_date': inv.invoice_date, 'po_number': inv.po_number, 'document_type': inv.document_type or 'AP INVOICE', 'status': inv.status, 'division': inv.division, 'plant': inv.plant, 'category': inv.category, 'cost_center': inv.cost_center, 'pay_mode': inv.pay_mode, 'payment_terms': inv.payment_terms, 'vendor': {'name': inv.vendor_name or inv.party_name, 'code': inv.vendor_code or inv.party_code, 'gstin': inv.vendor_gstin or inv.party_tax_id or inv.gstin}, 'financials': {'currency': inv.currency or 'INR', 'gross_amount': float(inv.amount) if inv.amount is not None else 0.0, 'base_amount': float(inv.base_amount) if inv.base_amount is not None else 0.0, 'tax_amount': float(inv.tax_amount) if inv.tax_amount is not None else 0.0, 'cgst': float(inv.cgst) if inv.cgst is not None else 0.0, 'sgst': float(inv.sgst) if inv.sgst is not None else 0.0, 'igst': float(inv.igst) if inv.igst is not None else 0.0}, 'line_items': line_items, 'compliance_checklists': checklists, 'approval_trail': approval_trail, 'custom_data': custom_data, 'pdf_url': clean_pdf_url, 'pdf_download_endpoint': pdf_download_url, 'sync_status': {'status': inv.external_sync_status or 'UNSYNCED', 'external_ref': inv.external_sync_ref, 'synced_at': inv.external_synced_at.isoformat() if inv.external_synced_at else None, 'target_system': inv.external_sync_system}}}

def compute_hmac_signature(payload_str: str, secret: str) -> str:
    """Computes SHA-256 HMAC signature for webhook payload authentication."""
    if not secret:
        return ''
    return hmac.new(secret.encode('utf-8'), payload_str.encode('utf-8'), hashlib.sha256).hexdigest()

def dispatch_outgoing_webhook(document_id: str, base_url: str='') -> Dict[str, Any]:
    """
    Dispatches real-time outbound webhook to configured 3rd-party endpoint.
    Performs retries with exponential backoff, records logs in IntegrationSyncLog,
    updates Document status with stable idempotency key, and elevates failures to error logging.
    """
    db: Session = SessionLocal()
    try:
        inv: Optional[Document] = db.query(Document).filter(Document.id == document_id).first()
        if not inv:
            return {'success': False, 'error': f"Document '{document_id}' not found"}
        config: Optional[ThirdPartyWebhookConfig] = db.query(ThirdPartyWebhookConfig).filter(ThirdPartyWebhookConfig.is_active == True).first()
        if not config or not config.target_url:
            inv.external_sync_status = 'NOT_CONFIGURED'
            db.commit()
            return {'success': False, 'message': 'No active third-party webhook URL configured'}

        # Stable idempotency reference key
        if not inv.external_sync_ref:
            inv.external_sync_ref = f"DOCUFLOW-{inv.id}-{getattr(inv, 'version', 1)}"
        idempotency_key = inv.external_sync_ref

        # Read current retry attempts
        meta = get_sync_retry_meta(inv)
        attempt_count = meta.get('attempt_count', 0) + 1

        payload_dict = build_universal_export_payload(inv, base_url=base_url)
        if 'document' in payload_dict:
            payload_dict['document']['idempotency_key'] = idempotency_key
            if 'sync_status' in payload_dict['document']:
                payload_dict['document']['sync_status']['external_ref'] = idempotency_key
        payload_json = json.dumps(payload_dict, default=str)
        payload_bytes = payload_json.encode('utf-8')

        headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'DocuFlow-Automation-Webhook/2.0',
            'X-DocuFlow-Event': 'document.settled',
            'X-DocuFlow-Document-ID': str(inv.id),
            'Idempotency-Key': idempotency_key,
            'X-DocuFlow-Idempotency-Key': idempotency_key,
            'X-DocuFlow-Reference-Key': idempotency_key
        }
        from app.services.crypto_service import decrypt_secret
        if config.auth_header_name and config.auth_token:
            headers[config.auth_header_name] = decrypt_secret(config.auth_token)
        if config.hmac_secret:
            signature = compute_hmac_signature(payload_json, decrypt_secret(config.hmac_secret))
            headers['X-DocuFlow-Signature'] = f'sha256={signature}'

        last_error = None
        status_code = None
        response_text = ''
        try:
            req = urllib.request.Request(config.target_url, data=payload_bytes, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=15) as response:
                status_code = response.status
                response_text = response.read().decode('utf-8', errors='ignore')
                if 200 <= status_code < 300:
                    inv.external_sync_status = 'SYNCED'
                    inv.external_synced_at = datetime.datetime.utcnow()
                    inv.external_sync_system = config.name or 'ThirdPartyWebhook'
                    inv.external_sync_error = None
                    db.add(IntegrationSyncLog(
                        document_id=inv.id,
                        sync_direction='PUSH',
                        target_system=config.name or 'ThirdPartyWebhook',
                        request_url=config.target_url,
                        status_code=status_code,
                        status='SUCCESS',
                        external_reference=idempotency_key,
                        payload_snapshot=payload_json[:4000],
                        response_body=response_text[:4000]
                    ))
                    db.commit()
                    return {'success': True, 'status_code': status_code, 'attempt': attempt_count, 'response': response_text}
                else:
                    last_error = f"HTTP {status_code}: {response_text[:300]}"
                    logger.error("[OutboundWebhook] Outbound sync failure for document %s (attempt %s/%s): HTTP %s", document_id, attempt_count, MAX_RETRY_ATTEMPTS, status_code)
        except urllib.error.HTTPError as he:
            status_code = he.code
            last_error = f"HTTP {he.code}: {he.reason}"
            logger.error("[OutboundWebhook] HTTP error pushing document %s (attempt %s/%s): %s", document_id, attempt_count, MAX_RETRY_ATTEMPTS, last_error)
        except Exception as ex:
            last_error = str(ex)
            logger.error("[OutboundWebhook] Network/connection failure pushing document %s (attempt %s/%s): %s", document_id, attempt_count, MAX_RETRY_ATTEMPTS, last_error)

        # Exponential backoff calculation
        if attempt_count >= MAX_RETRY_ATTEMPTS:
            new_status = 'DEAD'  # Terminal failure requiring attention
            next_retry_at = None
        else:
            backoff_secs = RETRY_BACKOFF_SECONDS[min(attempt_count - 1, len(RETRY_BACKOFF_SECONDS) - 1)]
            next_retry_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=backoff_secs)
            new_status = 'FAILED'

        meta_dict = {
            'attempt_count': attempt_count,
            'last_error': last_error,
            'next_retry_at': next_retry_at.isoformat() if next_retry_at else None,
            'max_attempts': MAX_RETRY_ATTEMPTS
        }
        inv.external_sync_status = new_status
        inv.external_sync_error = json.dumps(meta_dict)
        db.add(IntegrationSyncLog(
            document_id=inv.id,
            sync_direction='PUSH',
            target_system=config.name or 'ThirdPartyWebhook',
            request_url=config.target_url,
            status_code=status_code,
            status='FAILED',
            error_message=last_error,
            external_reference=idempotency_key,
            payload_snapshot=payload_json[:4000],
            response_body=response_text[:4000]
        ))
        db.commit()
        return {'success': False, 'status_code': status_code, 'error': last_error, 'attempts': attempt_count, 'next_retry_at': next_retry_at}
    except Exception as e:
        logger.error('[OutboundWebhook] Critical unhandled error in dispatch_outgoing_webhook: %s', e)
        return {'success': False, 'error': str(e)}
    finally:
        db.close()

# Global handle for background retry thread
_retry_worker_thread = None
_retry_worker_stop_event = None

def process_pending_sync_retries() -> int:
    """
    Worker that scans for documents in PENDING or FAILED sync status,
    checks if next_retry_at has arrived, atomically claims the row (PROCESSING)
    to prevent duplicate delivery across multiple concurrent workers,
    and retries the outbound push.
    """
    db: Session = SessionLocal()
    retried_count = 0
    try:
        now = datetime.datetime.utcnow()
        # Find candidates eligible for retry
        docs = db.query(Document).filter(
            Document.external_sync_status.in_(['PENDING', 'FAILED']),
            Document.is_deleted == False
        ).all()

        candidate_ids = []
        for d in docs:
            meta = get_sync_retry_meta(d)
            next_retry_str = meta.get('next_retry_at')
            should_retry = False
            if not next_retry_str:
                should_retry = True
            else:
                try:
                    next_dt = datetime.datetime.fromisoformat(next_retry_str.rstrip('Z'))
                    if now >= next_dt:
                        should_retry = True
                except Exception:
                    should_retry = True
            if should_retry:
                candidate_ids.append(d.id)

        # Multi-worker safe atomic claim:
        # Atomically transition from PENDING/FAILED -> PROCESSING.
        # Only the worker that updates 1 row proceeds with dispatch.
        for doc_id in candidate_ids:
            claimed_rows = db.query(Document).filter(
                Document.id == doc_id,
                Document.external_sync_status.in_(['PENDING', 'FAILED']),
                Document.is_deleted == False
            ).update(
                {Document.external_sync_status: 'PROCESSING'},
                synchronize_session=False
            )
            db.commit()

            if claimed_rows == 1:
                try:
                    dispatch_outgoing_webhook(document_id=doc_id)
                    retried_count += 1
                except Exception as dispatch_err:
                    logger.error("[OutboundWebhook] Failed dispatch for claimed doc %s: %s", doc_id, dispatch_err)
            else:
                logger.debug("[OutboundWebhook] Doc %s already claimed by another worker; skipping.", doc_id)

    except Exception as exc:
        logger.error("[OutboundWebhook] Error processing pending sync retries: %s", exc)
    finally:
        db.close()
    return retried_count

def run_retry_worker_loop(stop_event, poll_interval: int = 60):
    """Loop that runs in a background thread to process sync retries at periodic intervals."""
    import time
    logger.info("[OutboundWebhook] Background retry worker loop started with poll_interval=%ss", poll_interval)
    while not stop_event.is_set():
        try:
            process_pending_sync_retries()
        except Exception as e:
            logger.error("[OutboundWebhook] Unexpected error in retry loop: %s", e)
        # Sleep in small slices to respond promptly to stop_event
        for _ in range(poll_interval):
            if stop_event.is_set():
                break
            time.sleep(1)
    logger.info("[OutboundWebhook] Background retry worker loop stopped.")

def start_background_retry_worker(poll_interval: int = 60):
    """Starts the background retry worker thread if not already active."""
    global _retry_worker_thread, _retry_worker_stop_event
    import threading
    if _retry_worker_thread is not None and _retry_worker_thread.is_alive():
        logger.info("[OutboundWebhook] Background retry worker is already running.")
        return
    _retry_worker_stop_event = threading.Event()
    _retry_worker_thread = threading.Thread(
        target=run_retry_worker_loop,
        args=(_retry_worker_stop_event, poll_interval),
        daemon=True,
        name="DocuFlow-SyncRetryWorker"
    )
    _retry_worker_thread.start()
    logger.info("[OutboundWebhook] Started background retry worker thread.")

def stop_background_retry_worker():
    """Stops the background retry worker thread gracefully."""
    global _retry_worker_thread, _retry_worker_stop_event
    if _retry_worker_stop_event:
        _retry_worker_stop_event.set()
    if _retry_worker_thread and _retry_worker_thread.is_alive():
        _retry_worker_thread.join(timeout=5)
    _retry_worker_thread = None
    _retry_worker_stop_event = None
    logger.info("[OutboundWebhook] Stopped background retry worker.")