

import os
import json
import base64
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog, SystemLog
from app.schemas import (
    DocumentSyncRequest, DocumentSyncResponse,
    BatchSyncRequest, BatchSyncResponse, BatchSyncItemResult,
    Base64AttachmentSyncRequest, AttachmentSyncResponse
)
from app.services.rules_engine import evaluate_business_rules
from app.services.ocr_service import extract_text_from_pdf

router = APIRouter(prefix="/api/sync", tags=["Enterprise Data & Attachment Sync"])

def generate_compliance_checklist_for_category(category: Optional[str], doc_type: Optional[str]) -> List[str]:
    cat = (category or "").lower()
    
    if any(k in cat for k in ["rent", "eb", "deposit", "electricity", "tel"]):
        return [
            "Rental Agreement / EB Bill Copy Attached",
            "Meter Reading & Tariff Slab Verified",
            "Premises / Branch Address Verified",
            "Landlord / Service Provider Bank Details Verified",
            "TDS Deduction (Sec 194I / 194C) Calculated",
            "Prior Month Advance / Arrears Reconciled",
            "Cost Center & Plant GL Code Validated",
            "Authorized Signatory Sign-off Verified"
        ]
    elif any(k in cat for k in ["asset", "capex", "machinery", "equipment"]):
        return [
            "Asset Purchase Order & Approval Attached",
            "Physical Asset Delivery & Serial No. Verified",
            "Vendor GSTIN & Tax Invoice Verified",
            "Plant & Cost Center Tagging Verified",
            "Gate Inward / GRN Verified",
            "Asset Capitalization & Depreciation GL Validated",
            "Advance / Retention Amount Adjusted",
            "Authorized Signatory & HOD Approval Verified"
        ]
    elif any(k in cat for k in ["freight", "transport", "logistics", "courier"]):
        return [
            "Consignment Note / Lorry Receipt (LR) Attached",
            "Trip Sheet & Vehicle Number Verified",
            "Weight, Distance & Freight Rate Verified",
            "Vendor GSTIN & Tax Invoice Verified",
            "RCM (Reverse Charge Mechanism) Applicability Verified",
            "Gate Inward Verification Completed",
            "Cost Center & Plant Accounting Verified"
        ]
    else:
        return [
            "Documents Attached",
            "Party Name & Total Amount Verified",
            "Vendor GST no, Signaure Verified",
            "Bill No ,Date & Address Verified",
            "Tax portion verified (GST, TDS, etc..)",
            "RO/PO Verified",
            "Gate Inward, GRN, Debit/Credit Note Verified",
            "SAP Entry ( DR/CR & GL , COST CENTER ) Verified",
            "Advance, Narration, Supportive Copy (If Any)"
        ]

def _upsert_single_document(req: DocumentSyncRequest, db: Session) -> Invoice:
    """Internal helper to idempotently insert or update an invoice from sync data."""
    effective_division = req.company_code or req.division or "VCC"
    
    # 1. Look for existing document by DocKey or (InvoiceNumber + Division)
    existing: Optional[Invoice] = None
    if req.doc_key:
        existing = db.query(Invoice).filter(Invoice.doc_key == req.doc_key).first()
    
    if not existing and req.invoice_number:
        existing = db.query(Invoice).filter(
            Invoice.invoice_number == req.invoice_number,
            Invoice.division == effective_division
        ).first()

    # Calculate base and tax amounts if not provided
    calculated_base = req.base_amount
    calculated_tax = req.tax_amount
    if req.amount > 0 and (calculated_base is None or calculated_tax is None):
        calculated_base = round(req.amount / 1.18, 2)
        calculated_tax = round(req.amount - calculated_base, 2)

    line_items_str = json.dumps(req.line_items) if req.line_items else None
    custom_data_str = json.dumps(req.custom_data) if req.custom_data else None

    if existing:
        # Update existing record
        existing.doc_num = req.doc_num or existing.doc_num
        existing.vendor_name = req.vendor_name or existing.vendor_name
        existing.vendor_code = req.vendor_code or existing.vendor_code
        existing.vendor_gstin = req.vendor_gstin or existing.vendor_gstin
        existing.invoice_number = req.invoice_number or existing.invoice_number
        existing.invoice_date = req.invoice_date or existing.invoice_date
        existing.po_number = req.po_number or existing.po_number
        existing.amount = req.amount if req.amount > 0 else existing.amount
        existing.base_amount = calculated_base if calculated_base else existing.base_amount
        existing.tax_amount = calculated_tax if calculated_tax else existing.tax_amount
        existing.document_type = req.document_type or existing.document_type
        existing.division = effective_division
        existing.category = req.category or existing.category
        existing.cost_center = req.cost_center or existing.cost_center
        existing.plant = req.plant or existing.plant
        existing.payment_terms = req.payment_terms or existing.payment_terms
        if line_items_str: existing.line_items_json = line_items_str
        if custom_data_str: existing.custom_data = custom_data_str
        
        target_inv = existing
        action_type = "Updated via Sync"
    else:
        # Create new record
        timestamp = int(datetime.datetime.utcnow().timestamp() * 1000)
        doc_id = f"DOC-{req.doc_key if req.doc_key else (timestamp % 100000)}"
        
        new_inv = Invoice(
            id=doc_id,
            doc_key=req.doc_key,
            doc_num=str(req.doc_num) if req.doc_num is not None else None,
            doc_date=req.invoice_date,
            vendor_name=req.vendor_name or "Unknown Vendor",
            vendor_code=req.vendor_code,
            vendor_gstin=req.vendor_gstin,
            invoice_number=req.invoice_number or f"INV-{timestamp % 10000}",
            invoice_date=req.invoice_date or datetime.date.today().strftime("%Y-%m-%d"),
            po_number=req.po_number,
            amount=req.amount,
            base_amount=calculated_base or 0.0,
            tax_amount=calculated_tax or 0.0,
            currency=req.currency or "INR",
            document_type=req.document_type or "AP INVOICE",
            division=effective_division,
            category=req.category,
            cost_center=req.cost_center,
            plant=req.plant,
            payment_terms=req.payment_terms or "Net 30",
            status="Pending Approval",
            current_stage=1,
            total_stages=2,
            line_items_json=line_items_str,
            custom_data=custom_data_str
        )
        db.add(new_inv)
        target_inv = new_inv
        action_type = "Created via Sync"

    db.commit()
    db.refresh(target_inv)

    # 2. Automated Business Rules Evaluation & Flow Initiation
    if req.auto_route:
        target_wf = evaluate_business_rules(db, target_inv)
        if not target_wf:
            target_wf = "VCC_EB_DEPOSIT_POST&TEL_CAM_RENT_NEW2"

        profile = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == target_wf).first()
        if profile:
            target_inv.workflow_profile_id = profile.profile_name
            steps = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == profile.profile_name
            ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
            
            target_inv.total_stages = len(steps) if steps else 2
            target_inv.current_stage = 1
            if steps:
                target_inv.assigned_approver = steps[0].approver_target
                target_inv.status = f"Initiated ({steps[0].step_name})"
            else:
                target_inv.status = "Initiated (Stage 1)"

            # Initialize tailored compliance checklist
            checklist_items = generate_compliance_checklist_for_category(target_inv.category, target_inv.document_type)
            target_inv.checklist_state = json.dumps({item: False for item in checklist_items})

            db.commit()
            db.refresh(target_inv)

    # 3. Log Sync Audit Entry
    db.add(AuditLog(
        invoice_id=target_inv.id,
        user="ERP Data Sync",
        action=f"Flow {action_type}",
        stage=f"Stage {target_inv.current_stage}",
        notes=f"Data synced to DB. Matched workflow '{target_inv.workflow_profile_id}' at Stage 1. Assigned approvers: {target_inv.assigned_approver}."
    ))
    db.add(SystemLog(
        invoice_id=target_inv.id,
        action=f"Data Sync & Flow Initiation",
        user="Sync Engine",
        details=f"ERP Key: {target_inv.doc_key}, Total: ₹{target_inv.amount}, Plant: {target_inv.plant}, Status: {target_inv.status}"
    ))
    db.commit()

    return target_inv


# --- 1. SINGLE RECORD / DOCUMENT SYNC ---
@router.post("/record", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/records", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/document", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/documents", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/invoice", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
@router.post("/invoices", response_model=DocumentSyncResponse, status_code=status.HTTP_200_OK)
def sync_single_document(payload: DocumentSyncRequest, db: Session = Depends(get_db)):
    """
    Production-grade idempotent endpoint for syncing single records from ERP, SAP, or Tally.
    Auto-evaluates business rules, sets branch approver, and logs audit trail.
    """
    try:
        inv = _upsert_single_document(payload, db)
        return DocumentSyncResponse(
            success=True,
            message="Record synchronized and auto-routed successfully",
            document_id=inv.id,
            doc_key=inv.doc_key,
            invoice_number=inv.invoice_number,
            vendor_name=inv.vendor_name,
            amount=inv.amount,
            division=inv.division,
            plant=inv.plant,
            workflow_profile_id=inv.workflow_profile_id,
            total_stages=inv.total_stages,
            current_stage=inv.current_stage,
            assigned_approver=inv.assigned_approver,
            status=inv.status
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Data synchronization failed: {str(e)}")


# --- 2. BATCH / BULK RECORD SYNC ---
@router.post("/records/batch", response_model=BatchSyncResponse)
@router.post("/batch", response_model=BatchSyncResponse)
@router.post("/invoices/batch", response_model=BatchSyncResponse)
def sync_batch_documents(payload: BatchSyncRequest, db: Session = Depends(get_db)):
    """
    High-throughput bulk synchronization endpoint for scheduled ERP batch cron jobs (up to 500 records per call).
    Provides atomic isolation: single item failure does not disrupt the entire batch.
    """
    results: List[BatchSyncItemResult] = []
    success_count = 0
    failed_count = 0

    for idx, doc_req in enumerate(payload.documents):
        try:
            inv = _upsert_single_document(doc_req, db)
            results.append(BatchSyncItemResult(
                index=idx,
                document_id=inv.id,
                doc_key=inv.doc_key,
                invoice_number=inv.invoice_number,
                status="SUCCESS"
            ))
            success_count += 1
        except Exception as e:
            results.append(BatchSyncItemResult(
                index=idx,
                doc_key=doc_req.doc_key,
                invoice_number=doc_req.invoice_number,
                status="FAILED",
                error=str(e)
            ))
            failed_count += 1

    return BatchSyncResponse(
        total_received=len(payload.documents),
        successful_count=success_count,
        failed_count=failed_count,
        results=results
    )


# --- 3. ATTACHMENT MULTIPART FILE SYNC ---
@router.post("/attachment/upload", response_model=AttachmentSyncResponse)
async def sync_attachment_upload(
    file: UploadFile = File(..., description="Binary attachment file (PDF, PNG, JPG, TIFF)"),
    doc_key: Optional[int] = Form(None, description="ERP DocKey"),
    record_id: Optional[str] = Form(None, description="Target Record ID (e.g. DOC-101)"),
    invoice_id: Optional[str] = Form(None, description="Target Record/Invoice ID (e.g. DOC-101)"),
    attachment_type: str = Form("Original Invoice", description="Type of attachment"),
    uploaded_by: str = Form("ERP Sync Service", description="Sync source or user"),
    db: Session = Depends(get_db)
):
    """
    Multipart file attachment synchronization.
    Saves document to secure storage, executes OCR extraction, and binds to the record.
    """
    target_id = record_id or invoice_id
    inv = None
    if doc_key:
        inv = db.query(Invoice).filter(Invoice.doc_key == doc_key).first()
    if not inv and target_id:
        if str(target_id).isdigit():
            inv = db.query(Invoice).filter((Invoice.id == target_id) | (Invoice.doc_key == int(target_id))).first()
        else:
            inv = db.query(Invoice).filter(Invoice.id == target_id).first()

    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"Target record not found for DocKey: {doc_key} or ID: {target_id}. Sync record data first."
        )

    # 2. Save binary file
    timestamp = int(datetime.datetime.utcnow().timestamp())
    safe_name = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = settings.UPLOAD_DIR / safe_name

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    file_size = len(contents)
    file_url = f"/uploads/{safe_name}"

    # 3. OCR Text Extraction
    ocr_data = {}
    if file.filename.lower().endswith(".pdf"):
        ocr_data = extract_text_from_pdf(file_path)

    # 4. Bind to record
    inv.file_url = file_url
    db.commit()

    # 5. Log audit
    db.add(AuditLog(
        invoice_id=inv.id,
        user=uploaded_by,
        action="Attachment Synced",
        stage=f"Stage {inv.current_stage}",
        notes=f"Attached {attachment_type}: {file.filename} ({round(file_size/1024, 1)} KB)."
    ))
    db.commit()

    return AttachmentSyncResponse(
        success=True,
        message="Attachment synchronized and bound to record successfully",
        document_id=inv.id,
        file_name=file.filename,
        file_url=file_url,
        file_size_bytes=file_size,
        ocr_extracted_fields=ocr_data
    )


# --- 4. ATTACHMENT BASE64 SYNC (FOR SAP / MIDDLEWARE JSON PAYLOADS) ---
@router.post("/attachment/base64", response_model=AttachmentSyncResponse)
def sync_attachment_base64(payload: Base64AttachmentSyncRequest, db: Session = Depends(get_db)):
    """
    Base64 encoded attachment synchronizer for JSON-only enterprise ESB pipelines (SAP PI/PO, MuleSoft, WebMethods).
    Decodes binary, stores file, runs OCR validation, and attaches to the target record.
    """
    target_id = getattr(payload, 'record_id', None) or payload.invoice_id
    inv = None
    if payload.doc_key:
        inv = db.query(Invoice).filter(Invoice.doc_key == payload.doc_key).first()
    if not inv and target_id:
        if str(target_id).isdigit():
            inv = db.query(Invoice).filter((Invoice.id == target_id) | (Invoice.doc_key == int(target_id))).first()
        else:
            inv = db.query(Invoice).filter(Invoice.id == target_id).first()

    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"Target record not found for DocKey: {payload.doc_key} or ID: {target_id}."
        )

    # 2. Decode Base64
    try:
        binary_data = base64.b64decode(payload.file_content_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Base64 payload: {str(e)}")

    timestamp = int(datetime.datetime.utcnow().timestamp())
    safe_name = f"{timestamp}_{payload.file_name.replace(' ', '_')}"
    file_path = settings.UPLOAD_DIR / safe_name

    with open(file_path, "wb") as f:
        f.write(binary_data)

    file_size = len(binary_data)
    file_url = f"/uploads/{safe_name}"

    # 3. OCR Extraction
    ocr_data = {}
    if payload.file_name.lower().endswith(".pdf"):
        ocr_data = extract_text_from_pdf(file_path)

    # 4. Bind to invoice
    inv.file_url = file_url
    db.commit()

    # 5. Log audit
    db.add(AuditLog(
        invoice_id=inv.id,
        user=payload.uploaded_by or "ERP Base64 Sync",
        action="Attachment Synced (Base64)",
        stage=f"Stage {inv.current_stage}",
        notes=f"Attached {payload.attachment_type}: {payload.file_name} ({round(file_size/1024, 1)} KB)."
    ))
    db.commit()

    return AttachmentSyncResponse(
        success=True,
        message="Base64 attachment decoded, saved, and linked successfully",
        document_id=inv.id,
        file_name=payload.file_name,
        file_url=file_url,
        file_size_bytes=file_size,
        ocr_extracted_fields=ocr_data
    )
