import os
import json
import urllib.request
import urllib.error
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, status, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import Document, Invoice, ThirdPartyWebhookConfig, IntegrationSyncLog, AuditLog
from app.schemas import (
    ThirdPartyWebhookConfigCreate,
    ThirdPartyWebhookConfigResponse,
    ThirdPartyWebhookTestRequest,
    IntegrationAcknowledgmentRequest,
    IntegrationAcknowledgmentResponse
)
from app.services.integration_service import (
    build_universal_export_payload,
    dispatch_outgoing_webhook,
    compute_hmac_signature
)

router = APIRouter(prefix="/api/integrations/v1", tags=["Third-Party & SAP Integrations"])

# =========================================================================
# 1. PULL INTEGRATION ENDPOINTS (FOR THIRD PARTIES / SAP TO FETCH DATA)
# =========================================================================

@router.get("/approved-documents")
def get_approved_documents(
    division: Optional[str] = Query(None, description="Filter by Company Division (e.g. VCC, SD, ACC)"),
    plant: Optional[str] = Query(None, description="Filter by Plant / Branch location"),
    sync_status: Optional[str] = Query("UNSYNCED", description="Filter by sync state: UNSYNCED, SYNCED, ALL, FAILED"),
    since: Optional[datetime.datetime] = Query(None, description="Filter documents approved/settled since ISO timestamp"),
    limit: int = Query(50, ge=1, le=200, description="Max records to return"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    [PULL API] Polling endpoint for SAP, Oracle, Tally, or external ERPs to query newly approved documents.
    Returns standard serialized payloads including line items, GL / cost center tags, and PDF download links.
    """
    query = db.query(Document).filter(
        Document.is_deleted == False,
        Document.status == "Settled"
    )

    if division:
        query = query.filter(Document.division.ilike(f"%{division}%"))
    if plant:
        query = query.filter(Document.plant.ilike(f"%{plant}%"))
    if since:
        query = query.filter(Document.updated_at >= since)

    if sync_status and sync_status.upper() != "ALL":
        if sync_status.upper() == "UNSYNCED":
            query = query.filter((Document.external_sync_status == "UNSYNCED") | (Document.external_sync_status == None))
        else:
            query = query.filter(Document.external_sync_status == sync_status.upper())

    docs = query.order_by(Document.updated_at.desc()).limit(limit).all()

    base_url = str(request.base_url).rstrip("/") if request else ""
    results = [build_universal_export_payload(d, base_url=base_url) for d in docs]

    return {
        "success": True,
        "count": len(results),
        "filter": {
            "division": division,
            "plant": plant,
            "sync_status": sync_status,
            "since": since.isoformat() if since else None
        },
        "data": results
    }

@router.get("/documents/{document_id}")
def get_single_document_export(
    document_id: str,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    [PULL API] Fetches full serialized export details for a single document.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    base_url = str(request.base_url).rstrip("/") if request else ""
    return {
        "success": True,
        "data": build_universal_export_payload(doc, base_url=base_url)
    }

@router.post("/documents/{document_id}/acknowledge", response_model=IntegrationAcknowledgmentResponse)
def acknowledge_document_sync(
    document_id: str,
    body: IntegrationAcknowledgmentRequest,
    db: Session = Depends(get_db)
):
    """
    [PULL API] Called by 3rd-party ERP after successfully ingesting the document.
    Saves external reference number (e.g. SAP Doc #), updates sync timestamp, and adds an audit log entry.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    now = datetime.datetime.utcnow()
    doc.external_sync_status = body.posting_status or "SYNCED"
    doc.external_sync_ref = body.external_reference_id
    doc.external_synced_at = now
    doc.external_sync_system = body.external_system_name

    # Record in Integration Sync Log
    db.add(IntegrationSyncLog(
        document_id=doc.id,
        sync_direction="PULL",
        target_system=body.external_system_name,
        status=body.posting_status or "SYNCED",
        external_reference=body.external_reference_id,
        response_body=body.notes or f"Acknowledged by {body.external_system_name}"
    ))

    # Record in Immutable Audit Log
    db.add(AuditLog(
        invoice_id=doc.id,
        user=f"API Integration ({body.external_system_name})",
        action="ERP_POSTED",
        stage="EXTERNAL SYNC",
        notes=f"Document successfully synced to {body.external_system_name}. Reference ID: {body.external_reference_id}. Notes: {body.notes or 'None'}"
    ))

    db.commit()

    return IntegrationAcknowledgmentResponse(
        success=True,
        document_id=doc.id,
        external_sync_status=doc.external_sync_status,
        external_sync_ref=doc.external_sync_ref,
        external_synced_at=doc.external_synced_at,
        message=f"Sync status successfully recorded for document {doc.id}"
    )

@router.get("/documents/{document_id}/download-pdf")
def download_approved_document_pdf(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    [PULL API] Streams the physical or stamped PDF of the approved document directly to 3rd-party systems.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    file_url = doc.file_url or ""
    
    # 1. Check direct structured path
    from app.routers.documents import get_archived_pdf_path
    structured_path = get_archived_pdf_path(doc)

    candidate_paths = [
        structured_path,
        Path(file_url),
        settings.UPLOAD_DIR / Path(file_url).name if file_url else None,
        settings.PDF_STORAGE_DIR / Path(file_url).name if file_url else None,
        Path("uploads") / file_url.lstrip("/uploads/").lstrip("uploads/"),
        Path("stored_pdfs/approved") / f"{doc.id}_approved.pdf",
        Path("stored_pdfs/approved") / f"{doc.id}.pdf",
        Path("stored_pdfs") / f"{doc.id}.pdf",
        Path("backend/uploads") / file_url.lstrip("/uploads/").lstrip("uploads/")
    ]

    # Filter non-None candidates
    valid_candidates = [p for p in candidate_paths if p is not None]
    found_path = next((p for p in valid_candidates if p.is_file()), None)

    # If still not found, search recursively inside approved directory
    if not found_path and settings.APPROVED_PDF_DIR.exists():
        matches = list(settings.APPROVED_PDF_DIR.glob(f"**/*{doc.id}*.pdf"))
        if matches:
            found_path = matches[0]

    if not found_path:
        raise HTTPException(status_code=404, detail="Approved PDF file attachment not found on disk")

    filename = f"{doc.invoice_number or doc.id}_approved.pdf"
    return FileResponse(
        path=str(found_path),
        media_type="application/pdf",
        filename=filename
    )


# =========================================================================
# 2. PUSH / WEBHOOK MANAGEMENT ENDPOINTS (FOR ADMIN CONFIGURATION & RETRIES)
# =========================================================================

@router.get("/webhook-config", response_model=Optional[ThirdPartyWebhookConfigResponse])
def get_webhook_config(db: Session = Depends(get_db)):
    """
    Returns current outbound webhook configuration.
    """
    config = db.query(ThirdPartyWebhookConfig).first()
    return config

@router.post("/webhook-config", response_model=ThirdPartyWebhookConfigResponse)
def save_webhook_config(
    body: ThirdPartyWebhookConfigCreate,
    db: Session = Depends(get_db)
):
    """
    Creates or updates the outbound webhook endpoint for real-time pushing.
    """
    config = db.query(ThirdPartyWebhookConfig).first()
    if not config:
        config = ThirdPartyWebhookConfig()
        db.add(config)

    config.name = body.name or "Primary ERP Integration Endpoint"
    config.target_url = body.target_url
    config.auth_header_name = body.auth_header_name or "Authorization"
    config.auth_token = body.auth_token
    config.hmac_secret = body.hmac_secret
    config.is_active = body.is_active if body.is_active is not None else True
    config.retry_count = body.retry_count or 3
    config.updated_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(config)
    return config

@router.post("/webhook-test")
def test_webhook_connection(
    body: ThirdPartyWebhookTestRequest,
    db: Session = Depends(get_db)
):
    """
    Sends a test ping event to the target webhook URL to verify network connectivity and authentication.
    """
    target_url = body.target_url
    auth_header_name = body.auth_header_name or "Authorization"
    auth_token = body.auth_token
    hmac_secret = body.hmac_secret

    if not target_url:
        saved_config = db.query(ThirdPartyWebhookConfig).first()
        if saved_config:
            target_url = saved_config.target_url
            auth_header_name = saved_config.auth_header_name
            auth_token = saved_config.auth_token
            hmac_secret = saved_config.hmac_secret

    if not target_url:
        raise HTTPException(status_code=400, detail="No target URL provided or configured")

    test_payload = {
        "event": "ping",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "message": "DocuFlow Automation Webhook Connectivity Test",
        "docuflow_version": "2.0"
    }

    payload_json = json.dumps(test_payload)
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "DocuFlow-Automation-Webhook-Test/2.0",
        "X-DocuFlow-Event": "ping"
    }

    if auth_header_name and auth_token:
        headers[auth_header_name] = auth_token

    if hmac_secret:
        headers["X-DocuFlow-Signature"] = f"sha256={compute_hmac_signature(payload_json, hmac_secret)}"

    parsed_url = urllib.parse.urlparse(target_url)
    if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
        return {
            "success": False,
            "target_url": target_url,
            "error": "Invalid or untrusted target URL scheme. Only HTTP and HTTPS are permitted."
        }

    try:
        req = urllib.request.Request(
            target_url,
            data=payload_json.encode('utf-8'),
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.status
            response_body = response.read().decode('utf-8', errors='ignore')
            return {
                "success": True,
                "status_code": status_code,
                "target_url": target_url,
                "response": response_body[:1000]
            }
    except urllib.error.HTTPError as he:
        return {
            "success": False,
            "status_code": he.code,
            "target_url": target_url,
            "error": f"HTTP Error {he.code}"
        }
    except Exception as e:
        return {
            "success": False,
            "target_url": target_url,
            "error": f"Request dispatch failed: {type(e).__name__}"
        }

@router.post("/documents/{document_id}/retry-push")
def retry_document_push(
    document_id: str,
    background_tasks: BackgroundTasks,
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    Manually re-triggers outgoing webhook push for a specific document.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found")

    base_url = str(request.base_url).rstrip("/") if request else ""
    background_tasks.add_task(dispatch_outgoing_webhook, document_id=doc.id, base_url=base_url)

    return {
        "success": True,
        "document_id": doc.id,
        "message": f"Push event queued in background for document {doc.id}"
    }

@router.get("/sync-logs")
def get_integration_sync_logs(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """
    Returns recent integration sync logs (both PUSH and PULL) for system auditing.
    """
    logs = db.query(IntegrationSyncLog).order_by(IntegrationSyncLog.timestamp.desc()).limit(limit).all()
    return {
        "success": True,
        "count": len(logs),
        "data": [
            {
                "id": l.id,
                "document_id": l.document_id,
                "sync_direction": l.sync_direction,
                "target_system": l.target_system,
                "status": l.status,
                "status_code": l.status_code,
                "external_reference": l.external_reference,
                "error_message": l.error_message,
                "timestamp": l.timestamp.isoformat() if l.timestamp else None
            }
            for l in logs
        ]
    }
