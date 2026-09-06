import json
import hmac
import hashlib
import urllib.request
import urllib.error
import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Document, ThirdPartyWebhookConfig, IntegrationSyncLog

def build_universal_export_payload(inv: Document, base_url: str = "") -> Dict[str, Any]:
    """
    Constructs a standardized, enterprise-ready JSON payload for SAP / 3rd-party ERP consumption.
    Includes headers, financials, line items, cost center tags, checklist states, and audit signoffs.
    """
    # 1. Line Items Breakdown
    line_items = []
    if inv.line_items:
        for item in inv.line_items:
            line_items.append({
                "id": item.id,
                "item_code": item.item_code,
                "description": item.description,
                "quantity": float(item.quantity) if item.quantity is not None else 1.0,
                "unit_price": float(item.unit_price) if item.unit_price is not None else 0.0,
                "amount": float(item.amount) if item.amount is not None else 0.0,
                "warranty_text": item.warranty_text,
                "serial_numbers": item.serial_numbers
            })
    elif inv.line_items_json:
        try:
            parsed = json.loads(inv.line_items_json)
            if isinstance(parsed, list):
                line_items = parsed
        except Exception:
            pass

    # 2. Checklists
    checklists = []
    if inv.checklist_states:
        for c in inv.checklist_states:
            checklists.append({
                "item_text": c.item_text,
                "is_checked": bool(c.is_checked),
                "checked_by": c.checked_by,
                "checked_at": c.checked_at.isoformat() if c.checked_at else None,
                "stage": getattr(c, "stage_name", getattr(c, "stage", None))
            })
    elif inv.checklist_state:
        try:
            parsed_cl = json.loads(inv.checklist_state)
            if isinstance(parsed_cl, dict):
                checklists = [{"item_text": k, "is_checked": bool(v)} for k, v in parsed_cl.items()]
        except Exception:
            pass

    # 3. Approval Sign-off Trail
    approval_trail = []
    if inv.approval_logs:
        for log in sorted(inv.approval_logs, key=lambda x: x.timestamp or datetime.datetime.min):
            approval_trail.append({
                "user": log.user,
                "action": log.action,
                "stage": log.stage,
                "notes": log.notes,
                "ip_address": log.ip_address,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None
            })

    # 4. Custom Data / OCR Overrides
    custom_data = {}
    if inv.custom_data:
        try:
            custom_data = json.loads(inv.custom_data) if isinstance(inv.custom_data, str) else inv.custom_data
        except Exception:
            custom_data = {"raw": str(inv.custom_data)}

    # Construct complete payload
    clean_base = base_url.rstrip("/") if base_url else ""
    pdf_download_url = f"{clean_base}/api/integrations/v1/documents/{inv.id}/download-pdf" if clean_base else f"/api/integrations/v1/documents/{inv.id}/download-pdf"

    return {
        "event": "document.settled",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "docuflow_version": "2.0",
        "document": {
            "id": inv.id,
            "doc_num": inv.doc_num or inv.invoice_number,
            "doc_key": inv.doc_key,
            "doc_date": inv.doc_date or inv.invoice_date,
            "invoice_number": inv.invoice_number,
            "invoice_date": inv.invoice_date,
            "po_number": inv.po_number,
            "document_type": inv.document_type or "AP INVOICE",
            "status": inv.status,
            "division": inv.division,
            "plant": inv.plant,
            "category": inv.category,
            "cost_center": inv.cost_center,
            "pay_mode": inv.pay_mode,
            "payment_terms": inv.payment_terms,
            "vendor": {
                "name": inv.vendor_name or inv.party_name,
                "code": inv.vendor_code or inv.party_code,
                "gstin": inv.vendor_gstin or inv.party_tax_id or inv.gstin
            },
            "financials": {
                "currency": inv.currency or "INR",
                "gross_amount": float(inv.amount) if inv.amount is not None else 0.0,
                "base_amount": float(inv.base_amount) if inv.base_amount is not None else 0.0,
                "tax_amount": float(inv.tax_amount) if inv.tax_amount is not None else 0.0,
                "cgst": float(inv.cgst) if inv.cgst is not None else 0.0,
                "sgst": float(inv.sgst) if inv.sgst is not None else 0.0,
                "igst": float(inv.igst) if inv.igst is not None else 0.0
            },
            "line_items": line_items,
            "compliance_checklists": checklists,
            "approval_trail": approval_trail,
            "custom_data": custom_data,
            "pdf_url": inv.file_url,
            "pdf_download_endpoint": pdf_download_url,
            "sync_status": {
                "status": inv.external_sync_status or "UNSYNCED",
                "external_ref": inv.external_sync_ref,
                "synced_at": inv.external_synced_at.isoformat() if inv.external_synced_at else None,
                "target_system": inv.external_sync_system
            }
        }
    }

def compute_hmac_signature(payload_str: str, secret: str) -> str:
    """Computes SHA-256 HMAC signature for webhook payload authentication."""
    if not secret:
        return ""
    return hmac.new(
        secret.encode('utf-8'),
        payload_str.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def dispatch_outgoing_webhook(document_id: str, base_url: str = "") -> Dict[str, Any]:
    """
    Dispatches real-time outbound webhook to configured 3rd-party endpoint.
    Performs retries, records logs in IntegrationSyncLog, and updates Document status.
    """
    db: Session = SessionLocal()
    try:
        inv: Optional[Document] = db.query(Document).filter(Document.id == document_id).first()
        if not inv:
            return {"success": False, "error": f"Document '{document_id}' not found"}

        config: Optional[ThirdPartyWebhookConfig] = db.query(ThirdPartyWebhookConfig).filter(
            ThirdPartyWebhookConfig.is_active == True
        ).first()

        if not config or not config.target_url:
            inv.external_sync_status = "NOT_CONFIGURED"
            db.commit()
            return {"success": False, "message": "No active third-party webhook URL configured"}

        payload_dict = build_universal_export_payload(inv, base_url=base_url)
        payload_json = json.dumps(payload_dict, default=str)
        payload_bytes = payload_json.encode('utf-8')

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "DocuFlow-Automation-Webhook/2.0",
            "X-DocuFlow-Event": "document.settled",
            "X-DocuFlow-Document-ID": str(inv.id)
        }

        # Auth Header (e.g. Bearer token or ApiKey)
        if config.auth_header_name and config.auth_token:
            headers[config.auth_header_name] = config.auth_token

        # HMAC Signature Header
        if config.hmac_secret:
            signature = compute_hmac_signature(payload_json, config.hmac_secret)
            headers["X-DocuFlow-Signature"] = f"sha256={signature}"

        max_attempts = config.retry_count or 3
        last_error = None
        status_code = None
        response_text = ""

        for attempt in range(1, max_attempts + 1):
            try:
                req = urllib.request.Request(
                    config.target_url,
                    data=payload_bytes,
                    headers=headers,
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=15) as response:
                    status_code = response.status
                    response_text = response.read().decode('utf-8', errors='ignore')
                    if 200 <= status_code < 300:
                        # Success
                        inv.external_sync_status = "SYNCED"
                        inv.external_synced_at = datetime.datetime.utcnow()
                        inv.external_sync_system = config.name or "ThirdPartyWebhook"
                        inv.external_sync_error = None

                        db.add(IntegrationSyncLog(
                            document_id=inv.id,
                            sync_direction="PUSH",
                            target_system=config.name or "ThirdPartyWebhook",
                            request_url=config.target_url,
                            status_code=status_code,
                            status="SUCCESS",
                            payload_snapshot=payload_json[:4000],
                            response_body=response_text[:4000]
                        ))
                        db.commit()
                        return {
                            "success": True,
                            "status_code": status_code,
                            "attempt": attempt,
                            "response": response_text
                        }
            except urllib.error.HTTPError as he:
                status_code = he.code
                response_text = he.read().decode('utf-8', errors='ignore')
                last_error = f"HTTP {status_code}: {response_text}"
            except Exception as ex:
                last_error = str(ex)

        # All attempts failed
        inv.external_sync_status = "FAILED"
        inv.external_sync_error = f"Failed after {max_attempts} attempts. Error: {last_error}"
        db.add(IntegrationSyncLog(
            document_id=inv.id,
            sync_direction="PUSH",
            target_system=config.name or "ThirdPartyWebhook",
            request_url=config.target_url,
            status_code=status_code,
            status="FAILED",
            error_message=last_error,
            payload_snapshot=payload_json[:4000],
            response_body=response_text[:4000]
        ))
        db.commit()
        return {
            "success": False,
            "status_code": status_code,
            "error": last_error,
            "attempts": max_attempts
        }
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}
    finally:
        db.close()
