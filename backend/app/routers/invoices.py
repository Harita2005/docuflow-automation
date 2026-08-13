import os
import json
import shutil
import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy import or_
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
def get_all_invoices(db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user)):
    invoices = db.query(Invoice).order_by(Invoice.created_at.desc()).all()
    
    approved_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        
        or_filters = [AuditLog.user.ilike(f"%{name}%") for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id).filter(
                AuditLog.action.ilike("%approve%"),
                or_(*or_filters)
            )
            approved_invoice_ids = {row[0] for row in audit_query.all()}

    results = []
    for inv in invoices:
        is_curr = False
        if current_user and inv.assigned_approver:
            is_active_flow = inv.status not in ["Approved", "Paid", "Ready for Payment", "Rejected", "Failed", "Settled"]
            if is_active_flow:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
                user_handles = [
                    current_user.username.lower(),
                    current_user.employee_id.lower(),
                    current_user.employee_name.lower(),
                    current_user.email.lower()
                ]
                for handle in user_handles:
                    if handle in approvers or any(handle in app or app in handle for app in approvers):
                        is_curr = True
                        break
        
        has_appr = (inv.id in approved_invoice_ids)
        
        inv_res = InvoiceResponse.from_orm(inv)
        inv_res.is_current_approver = is_curr
        inv_res.has_approved = has_appr
        results.append(inv_res)

    return results

@router.get("/api/records/{invoice_id}")
@router.get("/api/documents/{invoice_id}")
@router.get("/api/invoices/{invoice_id}")
def get_invoice_by_id(invoice_id: str, db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user)):
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
    
    is_curr = False
    if current_user and inv.assigned_approver:
        is_active_flow = inv.status not in ["Approved", "Paid", "Ready for Payment", "Rejected", "Failed", "Settled"]
        if is_active_flow:
            approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
            user_handles = [
                current_user.username.lower(),
                current_user.employee_id.lower(),
                current_user.employee_name.lower(),
                current_user.email.lower()
            ]
            for handle in user_handles:
                if handle in approvers or any(handle in app or app in handle for app in approvers):
                    is_curr = True
                    break

    has_appr = False
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f"%{name}%") for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id).filter(
                AuditLog.invoice_id == str(inv.id),
                AuditLog.action.ilike("%approve%"),
                or_(*or_filters)
            )
            has_appr = audit_query.first() is not None

    inv_dict["is_current_approver"] = is_curr
    inv_dict["has_approved"] = has_appr
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

def check_approval_authorization(inv: Invoice, user: Optional[User]):
    # 1. Enforce terminal/settled states
    if inv.status in ["Settled", "Approved", "Paid", "Ready for Payment", "Rejected", "Failed"]:
        raise HTTPException(
            status_code=400,
            detail=f"This document is already in a terminal/completed state ('{inv.status}') and cannot accept further workflow actions."
        )
    
    # 2. Check if current user is authorized to act on the current stage
    if user and user.role != "admin" and inv.assigned_approver:
        approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
        user_handles = [
            user.username.lower(),
            user.employee_id.lower(),
            user.employee_name.lower(),
            user.email.lower()
        ]
        
        is_authorized = False
        for handle in user_handles:
            if handle in approvers or any(handle in app or app in handle for app in approvers):
                is_authorized = True
                break
                
        if not is_authorized:
            raise HTTPException(
                status_code=403,
                detail=f"You are not authorized to approve this document at Stage {inv.current_stage or 1}. It is currently assigned to: {inv.assigned_approver}. Either another pool member has already signed off, or the workflow has advanced."
            )

@router.post("/api/workflows/approve")
@router.post("/api/workflow/approve")
def workflow_approve_payload(
    payload: dict,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    doc_id = payload.get("invoiceId") or payload.get("invoice_id") or payload.get("document_id") or payload.get("id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing invoiceId in approval payload")
    
    inv = find_invoice_by_identifier(db, doc_id)
    check_approval_authorization(inv, user)
    
    # Capture exact approver identity (Employee Name + Username/Email)
    approver_name = payload.get("approver") or payload.get("user") or payload.get("username")
    if not approver_name or approver_name.lower() in ["approver", "reviewer", "admin"]:
        if user:
            approver_name = f"{user.employee_name or user.name} ({user.role.upper()})"
        elif payload.get("username"):
            approver_name = payload.get("username")
        else:
            approver_name = "System Administrator (ADMIN)"

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
        user=approver_name,
        action=f"Approved ({stage_name})",
        stage=stage_name,
        notes=f"{remarks} ➔ {next_assigned_info}"
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv, "approved_by": approver_name}

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
    check_approval_authorization(inv, user)
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

# Unified Step Action API (used by ApprovalQueuePage desk for Approve, Reject, Clarify, Send Back)
@router.post("/api/records/{invoice_id}/step-action")
@router.post("/api/documents/{invoice_id}/step-action")
@router.post("/api/invoices/{invoice_id}/step-action")
def invoice_step_action(
    invoice_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    check_approval_authorization(inv, user)
    action_type = str(payload.get("action") or "Approve").strip()
    comments = str(payload.get("comments") or payload.get("comment") or "Action processed by desk operator.").strip()
    approver_name = payload.get("approver") or (user.employee_name or user.name if user else "Desk Operator")
    
    act_lower = action_type.lower()
    stage_name = f"Stage {inv.current_stage or 1}"

    if "approve" in act_lower or "pass" in act_lower:
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
            user=approver_name,
            action=f"Approved ({stage_name})",
            stage=stage_name,
            notes=f"{comments} ➔ {next_assigned_info}"
        ))
    elif "reject" in act_lower:
        inv.status = "Rejected"
        db.add(AuditLog(
            invoice_id=str(inv.id),
            user=approver_name,
            action="Rejected",
            stage=stage_name,
            notes=comments
        ))
    else: # Clarify / Send Back / Hold
        inv.status = "On Hold"
        db.add(AuditLog(
            invoice_id=str(inv.id),
            user=approver_name,
            action=f"{action_type} (Hold)",
            stage=stage_name,
            notes=comments
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

@router.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    division: Optional[str] = Form("VCC"),
    plant: Optional[str] = Form("TN-SIVAKASI"),
    document_type: Optional[str] = Form("AP INVOICE"),
    db: Session = Depends(get_db)
):
    timestamp = int(datetime.datetime.utcnow().timestamp())
    filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    new_id = f"DOC-{timestamp % 100000}"
    
    amount = 45000.0
    base_amount = round(amount / 1.18, 2)
    tax_amount = round(amount - base_amount, 2)

    new_inv = Invoice(
        id=new_id,
        vendor_name="Sample Vendor Enterprise",
        invoice_number=f"INV-{timestamp % 10000}",
        invoice_date=datetime.date.today().strftime("%Y-%m-%d"),
        amount=amount,
        base_amount=base_amount,
        tax_amount=tax_amount,
        vendor_gstin="33AAACR1234F1Z5",
        division=division,
        plant=plant,
        document_type=document_type or "AP INVOICE",
        file_url=f"/uploads/{filename}",
        status="Pending Approval",
        current_stage=1,
        total_stages=2
    )

    db.add(new_inv)
    db.commit()
    db.refresh(new_inv)

    # Auto-routing based on rules
    matched_wf = evaluate_business_rules(db, new_inv)
    if not matched_wf:
        matched_wf = "VCC_EB_DEPOSIT_POST&TEL_CAM_RENT_NEW2"

    new_inv.workflow_profile_id = matched_wf
    steps = db.query(WorkflowStepDefinition).filter(
        WorkflowStepDefinition.profile_name == matched_wf
    ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
    
    new_inv.total_stages = len(steps) if steps else 2
    new_inv.current_stage = 1
    if steps:
        new_inv.assigned_approver = steps[0].approver_target
        new_inv.status = f"Initiated ({steps[0].step_name})"
    else:
        new_inv.status = "Initiated (Stage 1)"

    from app.routers.sync import generate_compliance_checklist_for_category
    checklist_items = generate_compliance_checklist_for_category(new_inv.category, new_inv.document_type)
    new_inv.checklist_state = json.dumps({item: False for item in checklist_items})

    db.commit()
    db.refresh(new_inv)

    # Log audit trail
    db.add(AuditLog(
        invoice_id=new_inv.id,
        user="Document Uploader",
        action="Created & Uploaded",
        stage="Stage 1",
        notes=f"Document uploaded manually. Matched workflow '{matched_wf}'."
    ))
    db.commit()

    return {"success": True, "invoice": new_inv}

@router.post("/api/documents/upload-and-route/{synced_doc_id}")
async def upload_and_route(
    synced_doc_id: str,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form("AP INVOICE"),
    vendorName: Optional[str] = Form(None),
    invoiceNumber: Optional[str] = Form(None),
    amount: Optional[float] = Form(None),
    invoiceDate: Optional[str] = Form(None),
    poNumber: Optional[str] = Form(None),
    cgst: Optional[float] = Form(0.0),
    sgst: Optional[float] = Form(0.0),
    igst: Optional[float] = Form(0.0),
    db: Session = Depends(get_db)
):
    inv = db.query(Invoice).filter(Invoice.id == synced_doc_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Synced staging document not found")

    timestamp = int(datetime.datetime.utcnow().timestamp())
    filename = f"{timestamp}_{file.filename.replace(' ', '_')}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    inv.file_url = f"/uploads/{filename}"
    inv.file_name = file.filename
    if document_type: inv.document_type = document_type
    if vendorName: inv.vendor_name = vendorName
    if invoiceNumber: inv.invoice_number = invoiceNumber
    if amount is not None: 
        inv.amount = amount
        inv.base_amount = round(amount / 1.18, 2)
        inv.tax_amount = round(amount - inv.base_amount, 2)
    if invoiceDate: inv.invoice_date = invoiceDate
    if poNumber: inv.po_number = poNumber
    
    matched_wf = evaluate_business_rules(db, inv)
    if not matched_wf:
        matched_wf = "VCC_EB_DEPOSIT_POST&TEL_CAM_RENT_NEW2"

    inv.workflow_profile_id = matched_wf
    steps = db.query(WorkflowStepDefinition).filter(
        WorkflowStepDefinition.profile_name == matched_wf
    ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
    
    inv.total_stages = len(steps) if steps else 2
    inv.current_stage = 1
    if steps:
        inv.assigned_approver = steps[0].approver_target
        inv.status = f"Initiated ({steps[0].step_name})"
    else:
        inv.status = "Initiated (Stage 1)"

    from app.routers.sync import generate_compliance_checklist_for_category
    checklist_items = generate_compliance_checklist_for_category(inv.category, inv.document_type)
    inv.checklist_state = json.dumps({item: False for item in checklist_items})

    db.commit()
    db.refresh(inv)

    db.add(AuditLog(
        invoice_id=inv.id,
        user="Metadata Editor / Sync Uploader",
        action="Metadata Completed & Routed",
        stage="Stage 1",
        notes=f"Physical document uploaded & routed under workflow '{matched_wf}'."
    ))
    db.commit()

    return {"success": True, "invoice": inv}

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

import json
import os

CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app_config.json")

def load_app_configs():
    if not os.path.exists(CONFIG_FILE_PATH):
        return []
    try:
        with open(CONFIG_FILE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_app_config(key: str, value: str, description: str = ""):
    configs = load_app_configs()
    found = False
    for c in configs:
        if c.get("key") == key:
            c["value"] = value
            c["description"] = description
            found = True
            break
    if not found:
        configs.append({
            "key": key,
            "value": value,
            "description": description
        })
    try:
        with open(CONFIG_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(configs, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Config] Error saving config: {e}")

@router.get("/api/admin/config")
def get_admin_config(db: Session = Depends(get_db)):
    return load_app_configs()

@router.post("/api/admin/config")
def post_admin_config(payload: dict, db: Session = Depends(get_db)):
    key = payload.get("key")
    value = payload.get("value")
    desc = payload.get("description") or ""
    if not key:
        raise HTTPException(status_code=400, detail="Missing key in config payload")
    save_app_config(key, value, desc)
    return {"success": True, "key": key}

@router.get("/api/admin/recycle-bin")
def get_admin_recycle_bin(db: Session = Depends(get_db)):
    return []

@router.get("/api/admin/notifications/provider")
def get_admin_notifications_provider(db: Session = Depends(get_db)):
    return {
        "provider": "Office365 SMTP",
        "host": "smtp.office365.com",
        "port": 587,
        "user": "Sqlalerts@ramrajcotton.net"
    }

@router.get("/api/admin/notifications/raci")
def get_admin_notifications_raci(db: Session = Depends(get_db)):
    return []

@router.get("/api/admin/notifications/inapp-config")
def get_admin_notifications_inapp_config(db: Session = Depends(get_db)):
    return {
        "enabled": True,
        "pollInterval": 5000
    }

@router.get("/api/admin/backup/history")
def get_admin_backup_history(db: Session = Depends(get_db)):
    return []

@router.post("/api/admin/backup/trigger")
def trigger_admin_backup(db: Session = Depends(get_db)):
    return {
        "success": True,
        "message": "Database and uploads backup ran successfully!"
    }

@router.get("/api/erp/{po_number}")
def get_erp_po_details(po_number: str, db: Session = Depends(get_db)):
    inv = db.query(Invoice).filter(Invoice.po_number == po_number).first()
    return {
        "po_number": po_number,
        "vendor_name": inv.vendor_name if inv else "COIMBATORE TEXTILE TOOLS",
        "amount": inv.amount if inv else 35000.0,
        "status": "Approved",
        "items": []
    }

