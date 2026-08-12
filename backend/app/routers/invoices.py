import os
import json
import shutil
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog, SystemLog, User
from app.schemas import InvoiceResponse, InvoiceCreate, InvoiceUpdate, InvoiceActionRequest
from app.auth import get_current_user
from app.services.rules_engine import evaluate_business_rules
from app.services.ocr_service import extract_text_from_pdf

router = APIRouter(tags=["Invoices & Documents"])

def find_invoice_by_identifier(db: Session, invoice_id: str) -> Invoice:
    raw_str = str(invoice_id).strip()
    id_clean = raw_str.upper().replace("DOC-", "").replace("DOC", "").strip()
    
    # 1. Strict string comparison on varchar column Invoice.id and Invoice.invoice_number
    inv = db.query(Invoice).filter(
        (Invoice.id == raw_str) | 
        (Invoice.id == f"DOC-{id_clean}") |
        (Invoice.id == id_clean) |
        (Invoice.invoice_number == raw_str) |
        (Invoice.invoice_number == id_clean)
    ).first()
    
    # 2. Integer comparison ONLY on integer column Invoice.doc_key
    if not inv and id_clean.isdigit():
        num = int(id_clean)
        inv = db.query(Invoice).filter(Invoice.doc_key == num).first()
        
    if not inv and raw_str.isdigit():
        num = int(raw_str)
        inv = db.query(Invoice).filter(Invoice.doc_key == num).first()
        
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{invoice_id}' not found")
    return inv

@router.get("/api/records", response_model=List[InvoiceResponse])
@router.get("/api/documents", response_model=List[InvoiceResponse])
@router.get("/api/invoices", response_model=List[InvoiceResponse])
def get_all_invoices(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).order_by(Invoice.created_at.desc()).all()
    return invoices

@router.get("/api/records/{invoice_id}")
@router.get("/api/documents/{invoice_id}")
@router.get("/api/invoices/{invoice_id}")
def get_invoice_by_id(invoice_id: str, db: Session = Depends(get_db)):
    inv = find_invoice_by_identifier(db, invoice_id)
    
    steps_data = []
    if inv.workflow_profile_id:
        steps = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        for s in steps:
            steps_data.append({
                "stage_number": s.stage_number,
                "stage_name": s.step_name,
                "approver_target": s.approver_target,
                "action_required": s.action_required,
                "permissions": s.permissions
            })
    
    if not steps_data:
        if inv.division in ["ACC", "ENES", "EIC", "RCH", "RMPL", "RRTC"]:
            steps_data = [
                {"stage_number": 1, "stage_name": "ATTACHMENT STATUS", "approver_target": "NATHIYA, REVATHI, RAMANA, RISHI"},
                {"stage_number": 2, "stage_name": "FIRST APPROVAL", "approver_target": "KANNADHASAN"},
                {"stage_number": 3, "stage_name": "IA APPROVAL", "approver_target": "ABINAYA, DINESH"},
                {"stage_number": 4, "stage_name": "FINAL APPROVAL", "approver_target": "PGMOHAN, RAJAVEL"}
            ]
        else:
            steps_data = [
                {"stage_number": 1, "stage_name": "FIRST APPROVAL", "approver_target": inv.assigned_approver or "SIBITHA, VIVEK"},
                {"stage_number": 2, "stage_name": "IA APPROVAL", "approver_target": "ABINAYA, DINESH"}
            ]
    
    current_step_name = "Stage 1"
    for s in steps_data:
        if s["stage_number"] == (inv.current_stage or 1):
            current_step_name = s["stage_name"]
            break

    inv_dict = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
    inv_dict["workflow_step_definitions"] = steps_data
    inv_dict["active_approval_log"] = {
        "current_stage_number": inv.current_stage or 1,
        "stage_name": current_step_name,
        "status": "Pending"
    }
    return inv_dict

@router.put("/api/records/{invoice_id}")
@router.put("/api/documents/{invoice_id}")
@router.put("/api/invoices/{invoice_id}")
def update_invoice(
    invoice_id: str,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)

    update_data = payload.dict(exclude_unset=True)
    for field, val in update_data.items():
        if hasattr(inv, field) and val is not None:
            setattr(inv, field, val)

    # Re-evaluate routing matrix
    matched_wf = evaluate_business_rules(db, {
        "division": inv.division,
        "category": inv.category,
        "amount": inv.amount,
        "document_type": inv.document_type
    })

    if matched_wf and matched_wf != inv.workflow_profile_id:
        inv.workflow_profile_id = matched_wf
        steps = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == matched_wf
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        inv.total_stages = len(steps) if steps else 1
        if (inv.current_stage or 1) == 1 and steps:
            inv.assigned_approver = steps[0].approver_target

    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=user.name if user else "Reviewer",
        action="Invoice Fields Updated",
        stage=f"Stage {inv.current_stage or 1}",
        notes="Document header/line-items edited and saved."
    ))

    db.commit()
    db.refresh(inv)
    return inv

# Unified Approval Route (supports both POST payload {invoiceId: ...} and URL param)
@router.post("/api/workflows/approve")
@router.post("/api/workflow/approve")
def workflow_approve_payload(payload: dict, db: Session = Depends(get_db)):
    doc_id = payload.get("invoiceId") or payload.get("invoice_id") or payload.get("document_id") or payload.get("id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing invoiceId in approval payload")
    
    inv = find_invoice_by_identifier(db, doc_id)
    username = payload.get("user") or payload.get("username") or "Approver"
    remarks = payload.get("comments") or payload.get("comment") or payload.get("remarks") or "Compliance items verified and signed off."
    stage_name = f"Stage {inv.current_stage or 1}"

    next_assigned_info = "Final Settlement Completed. Ready for payment disbursement."
    if (inv.current_stage or 1) < (inv.total_stages or 1):
        inv.current_stage = (inv.current_stage or 1) + 1
        if inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == inv.current_stage
            ).first()
            if next_step:
                inv.assigned_approver = next_step.approver_target
                next_assigned_info = f"Advanced to Stage {inv.current_stage} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}."
        inv.status = f"In Progress (Stage {inv.current_stage})"
    else:
        inv.status = "Settled"

    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=username,
        action=f"Approved ({stage_name})",
        stage=stage_name,
        notes=f"{remarks} ➔ {next_assigned_info}"
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv}

@router.post("/api/records/{invoice_id}/approve")
@router.post("/api/documents/{invoice_id}/approve")
@router.post("/api/invoices/{invoice_id}/approve")
def approve_invoice_url(
    invoice_id: str,
    action: Optional[InvoiceActionRequest] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    username = (user.employee_name or user.name) if user else "Reviewer"
    remarks = action.remarks if action and action.remarks else "Compliance items verified and signed off."
    stage_name = action.stage_name if action and action.stage_name else f"Stage {inv.current_stage or 1}"

    next_assigned_info = "Final Settlement Completed. Ready for payment disbursement."
    if (inv.current_stage or 1) < (inv.total_stages or 1):
        inv.current_stage = (inv.current_stage or 1) + 1
        if inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == inv.current_stage
            ).first()
            if next_step:
                inv.assigned_approver = next_step.approver_target
                next_assigned_info = f"Advanced to Stage {inv.current_stage} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}."
        inv.status = f"In Progress (Stage {inv.current_stage})"
    else:
        inv.status = "Settled"

    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=username,
        action=f"Approved ({stage_name})",
        stage=stage_name,
        notes=f"{remarks} ➔ {next_assigned_info}"
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv}

# Unified Rejection Routes
@router.post("/api/workflows/reject")
@router.post("/api/workflow/reject")
def workflow_reject_payload(payload: dict, db: Session = Depends(get_db)):
    doc_id = payload.get("invoiceId") or payload.get("invoice_id") or payload.get("document_id") or payload.get("id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing invoiceId in rejection payload")
    
    inv = find_invoice_by_identifier(db, doc_id)
    username = payload.get("user") or payload.get("username") or "Approver"
    remarks = payload.get("comments") or payload.get("comment") or payload.get("remarks") or "Record rejected due to discrepancy."
    
    inv.status = "Rejected"
    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=username,
        action="Rejected",
        stage=f"Stage {inv.current_stage or 1}",
        notes=remarks
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv}

@router.post("/api/records/{invoice_id}/reject")
@router.post("/api/documents/{invoice_id}/reject")
@router.post("/api/invoices/{invoice_id}/reject")
def reject_invoice_url(
    invoice_id: str,
    action: Optional[InvoiceActionRequest] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    username = user.name if user else "Reviewer"
    remarks = action.remarks if action else "Record rejected due to discrepancy."

    inv.status = "Rejected"
    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=username,
        action="Rejected",
        stage=f"Stage {inv.current_stage or 1}",
        notes=remarks
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "invoice": inv}

# Unified Hold / Sendback Routes
@router.post("/api/workflows/hold")
@router.post("/api/workflow/hold")
@router.post("/api/workflows/sendback")
@router.post("/api/workflow/sendback")
def workflow_hold_payload(payload: dict, db: Session = Depends(get_db)):
    doc_id = payload.get("invoiceId") or payload.get("invoice_id") or payload.get("document_id") or payload.get("id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing invoiceId in hold payload")
    
    inv = find_invoice_by_identifier(db, doc_id)
    username = payload.get("user") or payload.get("username") or "Approver"
    remarks = payload.get("comments") or payload.get("comment") or payload.get("remarks") or "Record placed on hold."
    
    inv.status = "On Hold"
    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=username,
        action="Placed on Hold",
        stage=f"Stage {inv.current_stage or 1}",
        notes=remarks
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv}

@router.post("/api/records/{invoice_id}/hold")
@router.post("/api/documents/{invoice_id}/hold")
@router.post("/api/invoices/{invoice_id}/hold")
def hold_invoice_url(
    invoice_id: str,
    action: Optional[InvoiceActionRequest] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    username = user.name if user else "Reviewer"
    remarks = action.remarks if action else "Record placed on temporary administrative hold."

    inv.status = "On Hold"
    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=username,
        action="Placed on Hold",
        stage=f"Stage {inv.current_stage or 1}",
        notes=remarks
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "invoice": inv}

# PDF File Upload & Version Management
@router.post("/api/records/{invoice_id}/version")
@router.post("/api/documents/{invoice_id}/version")
@router.post("/api/invoices/{invoice_id}/version")
async def upload_invoice_version(
    invoice_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    inv = find_invoice_by_identifier(db, invoice_id)

    timestamp = int(datetime.datetime.utcnow().timestamp())
    filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    inv.file_url = f"/uploads/{filename}"
    inv.file_name = file.filename
    
    # If in Stage 1 (ATTACHMENT STATUS), advance to Stage 2 (FIRST APPROVAL)
    if (inv.current_stage or 1) == 1 and (inv.total_stages or 1) > 1:
        inv.current_stage = 2
        if inv.workflow_profile_id:
            s2 = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == 2
            ).first()
            if s2:
                inv.assigned_approver = s2.approver_target
        inv.status = f"In Progress (Stage 2 - FIRST APPROVAL)"
    else:
        inv.status = "In Progress"

    db.add(AuditLog(
        invoice_id=str(inv.id),
        user="Assigned Approver",
        action="Invoice PDF Attached & Initiated",
        stage=f"Stage {inv.current_stage}",
        notes=f"Physical document attached: {file.filename}. Forwarded to Stage 2 for First Approval."
    ))

    db.commit()
    db.refresh(inv)
    return {"success": True, "file_url": inv.file_url, "current_stage": inv.current_stage, "status": inv.status}

# Document Comments API
@router.get("/api/documents/{id}/comments")
@router.get("/api/records/{id}/comments")
@router.get("/api/invoices/{id}/comments")
def get_document_comments(id: str, db: Session = Depends(get_db)):
    inv = find_invoice_by_identifier(db, id)
    logs = db.query(AuditLog).filter(
        (AuditLog.invoice_id == str(inv.id)) | (AuditLog.invoice_id == f"DOC-{inv.id}"),
        AuditLog.notes.isnot(None)
    ).order_by(AuditLog.timestamp.desc()).all()
    
    comments = []
    for l in logs:
        if l.notes:
            comments.append({
                "id": str(l.id),
                "author": l.user or "System",
                "text": l.notes,
                "created_at": l.timestamp.isoformat() if l.timestamp else datetime.datetime.utcnow().isoformat(),
                "action": l.action,
                "stage": l.stage
            })
    return comments

@router.post("/api/documents/{id}/comments")
@router.post("/api/records/{id}/comments")
@router.post("/api/invoices/{id}/comments")
def add_document_comment(id: str, payload: dict, db: Session = Depends(get_db)):
    inv = find_invoice_by_identifier(db, id)
    text = payload.get("text") or payload.get("comment") or payload.get("notes") or ""
    author = payload.get("author") or payload.get("user") or "User"
    if text:
        db.add(AuditLog(
            invoice_id=str(inv.id),
            user=author,
            action="Comment Added",
            stage=f"Stage {inv.current_stage or 1}",
            notes=text
        ))
        db.commit()
    return {"success": True, "message": "Comment recorded"}

# Document Versions API
@router.get("/api/documents/{id}/versions")
@router.get("/api/records/{id}/versions")
@router.get("/api/invoices/{id}/versions")
def get_document_versions(id: str, db: Session = Depends(get_db)):
    inv = find_invoice_by_identifier(db, id)
    versions = []
    if inv.file_url:
        versions.append({
            "version_number": 1,
            "file_url": inv.file_url,
            "uploaded_at": inv.created_at.isoformat() if inv.created_at else datetime.datetime.utcnow().isoformat(),
            "uploaded_by": "System / Approver",
            "is_current": True
        })
    return versions

# Stats & Analytical Dashboard Endpoints
@router.get("/api/stats")
@router.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    total = db.query(Invoice).count()
    pending = db.query(Invoice).filter(Invoice.status.ilike("%Pending%") | Invoice.status.ilike("%Initiated%") | Invoice.status.ilike("%Progress%")).count()
    approved = db.query(Invoice).filter(Invoice.status.ilike("%Settled%") | Invoice.status.ilike("%Approved%")).count()
    total_val = sum(float(i.amount or 0.0) for i in db.query(Invoice).all())
    return {
        "totalDocuments": total,
        "pendingApprovals": pending,
        "approvedDocuments": approved,
        "totalSpendINR": total_val,
        "autoRoutedPercentage": 100.0 if total > 0 else 0.0
    }

@router.get("/api/notifications")
def get_notifications(db: Session = Depends(get_db)):
    return []

@router.get("/api/templates")
def get_templates(db: Session = Depends(get_db)):
    return []

@router.get("/api/admin/config")
def get_admin_config(db: Session = Depends(get_db)):
    return []
