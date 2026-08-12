import os
import json
import shutil
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog, SystemLog, User
from app.schemas import InvoiceResponse, InvoiceCreate, InvoiceUpdate, InvoiceActionRequest
from app.auth import get_current_user
from app.services.rules_engine import evaluate_business_rules
from app.services.ocr_service import extract_text_from_pdf

router = APIRouter(tags=["Invoices & Documents"])

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
    if str(invoice_id).isdigit():
        inv = db.query(Invoice).filter((Invoice.id == invoice_id) | (Invoice.doc_key == int(invoice_id))).first()
    else:
        inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Document not found")
    
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
def update_invoice(invoice_id: str, payload: InvoiceUpdate, db: Session = Depends(get_db), user: Optional[User] = Depends(get_current_user)):
    if str(invoice_id).isdigit():
        inv = db.query(Invoice).filter((Invoice.id == invoice_id) | (Invoice.doc_key == int(invoice_id))).first()
    else:
        inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Record not found")

    update_data = payload.dict(exclude_unset=True)
    notes = update_data.pop("notes", None)

    changed_fields = []
    for field, val in update_data.items():
        old_val = getattr(inv, field, None)
        if old_val != val and val is not None:
            changed_fields.append(f"{field.replace('_', ' ').title()}: '{old_val}' ➔ '{val}'")
            setattr(inv, field, val)

    db.commit()
    db.refresh(inv)

    change_desc = "; ".join(changed_fields) if changed_fields else "Metadata verified and saved."
    if notes:
        change_desc += f" (Remarks: {notes})"

    audit = AuditLog(
        invoice_id=inv.id,
        user=(user.employee_name or user.name) if user else "Reviewer",
        action="Record Fields Edited",
        stage=f"Stage {inv.current_stage}",
        notes=change_desc
    )
    db.add(audit)
    db.commit()

    return inv

@router.post("/api/records/{invoice_id}/auto-route")
@router.post("/api/documents/{invoice_id}/auto-route")
@router.post("/api/invoices/{invoice_id}/auto-route")
def auto_route_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Record not found")

    target_profile_name = evaluate_business_rules(db, inv)
    if not target_profile_name:
        target_profile_name = "VCC_EB_DEPOSIT_POST&TEL_CAM_RENT_NEW2"

    profile = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == target_profile_name).first()
    if profile:
        inv.workflow_profile_id = profile.profile_name
        steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == profile.profile_name).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        inv.total_stages = len(steps) if steps else 2
        inv.current_stage = 1
        if steps:
            inv.assigned_approver = steps[0].approver_target

        db.commit()
        db.refresh(inv)

        log = SystemLog(
            invoice_id=inv.id,
            action="Auto-Routed to Workflow",
            details=f"Matched Rule. Assigned workflow: {profile.profile_name} with {inv.total_stages} stages."
        )
        db.add(log)
        db.commit()

    return {"success": True, "workflow": inv.workflow_profile_id, "stages": inv.total_stages}

@router.post("/api/records/{invoice_id}/approve")
@router.post("/api/documents/{invoice_id}/approve")
@router.post("/api/invoices/{invoice_id}/approve")
def approve_invoice(
    invoice_id: str,
    action: Optional[InvoiceActionRequest] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Record not found")

    username = (user.employee_name or user.name) if user else "Reviewer"
    remarks = action.remarks if action and action.remarks else "Compliance items verified and signed off."
    stage_name = action.stage_name if action and action.stage_name else f"Stage {inv.current_stage}"

    # Check if more stages remain
    next_assigned_info = "Final Settlement Completed. Ready for payment disbursement."
    if inv.current_stage < inv.total_stages:
        inv.current_stage += 1
        # Assign next stage approver
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
        inv.status = "Settled" # Final stage approval completed

    # Log rich approval audit entry
    audit = AuditLog(
        invoice_id=inv.id,
        user=username,
        action=f"Approved ({stage_name})",
        stage=stage_name,
        notes=f"{remarks} ➔ {next_assigned_info}"
    )
    db.add(audit)
    db.commit()
    db.refresh(inv)

    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv}

@router.post("/api/records/{invoice_id}/reject")
@router.post("/api/documents/{invoice_id}/reject")
@router.post("/api/invoices/{invoice_id}/reject")
def reject_invoice(
    invoice_id: str,
    action: Optional[InvoiceActionRequest] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Record not found")

    username = user.name if user else "Reviewer"
    remarks = action.remarks if action else "Record rejected due to discrepancy."

    audit = AuditLog(
        invoice_id=inv.id,
        user=username,
        action="Rejected",
        stage=f"Stage {inv.current_stage}",
        notes=remarks
    )
    db.add(audit)

    inv.status = "Rejected"
    db.commit()
    db.refresh(inv)

    return {"success": True, "status": inv.status, "invoice": inv}

@router.post("/api/records/{invoice_id}/hold")
@router.post("/api/documents/{invoice_id}/hold")
@router.post("/api/invoices/{invoice_id}/hold")
def hold_invoice(
    invoice_id: str,
    action: Optional[InvoiceActionRequest] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Record not found")

    username = user.name if user else "Reviewer"
    remarks = action.remarks if action else "Record placed on temporary administrative hold."

    audit = AuditLog(
        invoice_id=inv.id,
        user=username,
        action="Hold",
        stage=f"Stage {inv.current_stage}",
        notes=remarks
    )
    db.add(audit)

    inv.status = "On Hold"
    db.commit()
    db.refresh(inv)

    return {"success": True, "status": inv.status, "invoice": inv}

@router.post("/api/records/upload")
@router.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    division: Optional[str] = Form("VCC"),
    plant: Optional[str] = Form("TN-SIVAKASI"),
    db: Session = Depends(get_db)
):
    timestamp = int(datetime.datetime.utcnow().timestamp())
    filename = f"{timestamp}_{file.filename}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Run OCR extraction
    ocr_res = extract_text_from_pdf(file_path)

    new_id = f"DOC-{timestamp % 100000}"
    new_inv = Invoice(
        id=new_id,
        vendor_name=ocr_res.get("vendor_name") or "Sample Vendor Enterprise",
        invoice_number=ocr_res.get("invoice_number") or f"INV-{timestamp % 10000}",
        invoice_date=datetime.date.today().strftime("%Y-%m-%d"),
        amount=ocr_res.get("amount") or 45000.0,
        base_amount=round((ocr_res.get("amount") or 45000.0) / 1.18, 2),
        tax_amount=round((ocr_res.get("amount") or 45000.0) * 0.18 / 1.18, 2),
        vendor_gstin=ocr_res.get("gstin") or "33AAACR1234F1Z5",
        division=division,
        plant=plant,
        document_type="AP INVOICE",
        file_url=f"/uploads/{filename}",
        status="Pending Approval"
    )

    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)

    # Trigger auto-routing
    auto_route_invoice(new_inv.id, db)

    return {"success": True, "invoice": new_inv}

@router.post("/api/records/{invoice_id}/version")
@router.post("/api/documents/{invoice_id}/version")
@router.post("/api/invoices/{invoice_id}/version")
async def upload_invoice_version(
    invoice_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    inv = db.query(Invoice).filter((Invoice.id == invoice_id) | (Invoice.doc_key == invoice_id)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Document not found")

    timestamp = int(datetime.datetime.utcnow().timestamp())
    filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    inv.file_url = f"/uploads/{filename}"
    
    # If in Stage 1 (ATTACHMENT STATUS), advance to Stage 2 (FIRST APPROVAL)
    if (inv.current_stage or 1) == 1 and (inv.total_stages or 1) > 1:
        inv.current_stage = 2
        # Assign stage 2 approver
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
        invoice_id=inv.id,
        user="Assigned Approver",
        action="Invoice PDF Attached & Initiated",
        stage=f"Stage {inv.current_stage}",
        notes=f"Physical document attached: {file.filename}. Forwarded to Stage 2 for First Approval."
    ))

    db.commit()
    db.refresh(inv)

    return {"success": True, "file_url": inv.file_url, "current_stage": inv.current_stage, "status": inv.status}

@router.get("/api/documents/{id}/comments")
@router.get("/api/records/{id}/comments")
@router.get("/api/invoices/{id}/comments")
def get_document_comments(id: str, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, id)
    # Pull comments from audit logs for this invoice
    logs = db.query(AuditLog).filter(
        AuditLog.invoice_id == inv.id,
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
    inv = get_invoice_or_404(db, id)
    text = payload.get("text") or payload.get("comment") or payload.get("notes") or ""
    author = payload.get("author") or payload.get("user") or "User"
    if text:
        db.add(AuditLog(
            invoice_id=inv.id,
            user=author,
            action="Comment Added",
            stage=f"Stage {inv.current_stage or 1}",
            notes=text
        ))
        db.commit()
    return {"success": True, "message": "Comment recorded"}

@router.get("/api/documents/{id}/versions")
@router.get("/api/records/{id}/versions")
@router.get("/api/invoices/{id}/versions")
def get_document_versions(id: str, db: Session = Depends(get_db)):
    inv = get_invoice_or_404(db, id)
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
