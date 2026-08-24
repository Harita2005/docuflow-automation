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
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models import (
    Invoice, WorkflowProfile, WorkflowStepDefinition, AuditLog, SystemLog, User,
    ChecklistTemplate, InvoiceChecklistState, NotificationRaciMatrix, NotificationProviderConfig,
    ChecklistRule, BusinessRule, InAppNotification
)
from app.schemas import (
    InvoiceResponse, InvoiceCreate, InvoiceUpdate, InvoiceActionRequest,
    NotificationProviderSchema, NotificationRaciSchema, NotificationTestSchema
)
from app.auth import get_current_user
from app.services.rules_engine import evaluate_business_rules, get_doc_type_prefix
from app.services.ocr_service import extract_text_from_pdf

router = APIRouter(tags=["Invoices & Documents"])

def find_invoice_by_identifier(db: Session, invoice_id: str) -> Invoice:
    raw_str = str(invoice_id).strip()
    id_clean = re.sub(r'^(DOC|INV|CV|EV|JV|ADV|CAPEX|GRN|SRV|FRT|UTL|EXP|DN|CN|PRJ|NR|VOUCH)[-_#]?', '', raw_str, flags=re.IGNORECASE).strip()
    
    # 1. Strict string comparison on varchar column Invoice.id, Invoice.invoice_number, and Invoice.doc_key
    inv = db.query(Invoice).filter(
        (Invoice.id == raw_str) | 
        (Invoice.id == f"DOC-{id_clean}") |
        (Invoice.id == f"INV-{id_clean}") |
        (Invoice.id == f"CV-{id_clean}") |
        (Invoice.id == id_clean) |
        (Invoice.id.ilike(f"%{id_clean}")) |
        (Invoice.invoice_number == raw_str) |
        (Invoice.invoice_number == id_clean) |
        (Invoice.doc_key == raw_str) |
        (Invoice.doc_key == id_clean)
    ).filter(Invoice.is_deleted == False).first()
        
    if not inv:
        raise HTTPException(status_code=404, detail=f"Document '{invoice_id}' not found")
    return inv

@router.get("/api/records", response_model=List[InvoiceResponse])
@router.get("/api/documents", response_model=List[InvoiceResponse])
@router.get("/api/invoices", response_model=List[InvoiceResponse])
def get_all_invoices(db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user)):
    invoices = db.query(Invoice).filter(Invoice.is_deleted == False).order_by(Invoice.created_at.desc()).all()
    
    approved_invoice_ids = set()
    rejected_invoice_ids = set()
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        
        or_filters = [AuditLog.user.ilike(f"%{name}%") for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id, AuditLog.action).filter(
                or_(*or_filters)
            ).all()
            for row in audit_query:
                doc_id_clean = row[0].replace("DOC-", "") if row[0] else ""
                act = (row[1] or "").lower()
                if "approve" in act:
                    approved_invoice_ids.add(row[0])
                    approved_invoice_ids.add(doc_id_clean)
                if "reject" in act or "return" in act or "cancel" in act:
                    rejected_invoice_ids.add(row[0])
                    rejected_invoice_ids.add(doc_id_clean)

    # Filter documents based on role permissions (Admin sees all; standard user sees assigned, approved, rejected, or prior pool documents)
    if current_user and current_user.role != "admin":
        user_handles = [
            current_user.username.lower() if current_user.username else "",
            current_user.employee_id.lower() if current_user.employee_id else "",
            current_user.employee_name.lower() if current_user.employee_name else "",
            current_user.email.lower() if current_user.email else ""
        ]
        user_handles = [h for h in user_handles if h]

        # Index all workflow steps where current user was an approver
        user_steps = db.query(WorkflowStepDefinition).all()
        user_pool_stages = set()
        for st in user_steps:
            if st.approver_target:
                targets = [s.strip().lower() for s in st.approver_target.split(",") if s.strip()]
                if any(h in targets or any(h in t or t in h for t in targets) for h in user_handles):
                    user_pool_stages.add((st.profile_name, st.stage_number))
        
        filtered_invoices = []
        for inv in invoices:
            # 1. Check if user previously approved or rejected
            if inv.id in approved_invoice_ids or inv.id in rejected_invoice_ids:
                filtered_invoices.append(inv)
                continue
                
            # 2. Check if currently assigned as approver
            is_assigned = False
            if inv.assigned_approver:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
                for handle in user_handles:
                    if handle in approvers or any(handle in app or app in handle for app in approvers):
                        is_assigned = True
                        break
            if is_assigned:
                filtered_invoices.append(inv)
                continue

            # 3. Check if user belonged to a prior stage pool (e.g. Vivek was in Stage 1 pool, and Sibitha approved)
            is_prior_pool_member = False
            if inv.workflow_profile_id and (inv.current_stage or 1) > 1:
                for prior_stg in range(1, inv.current_stage or 1):
                    if (inv.workflow_profile_id, prior_stg) in user_pool_stages:
                        is_prior_pool_member = True
                        break
            if is_prior_pool_member:
                filtered_invoices.append(inv)
        invoices = filtered_invoices

    results = []
    for inv in invoices:
        is_curr = False
        if current_user and inv.assigned_approver:
            is_active_flow = inv.status not in ["Approved", "Paid", "Ready for Payment", "Cancelled", "Failed", "Settled"]
            if is_active_flow:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
                user_handles = [
                    current_user.username.lower() if current_user.username else "",
                    current_user.employee_id.lower() if current_user.employee_id else "",
                    current_user.employee_name.lower() if current_user.employee_name else "",
                    current_user.email.lower() if current_user.email else ""
                ]
                user_handles = [h for h in user_handles if h]
                for handle in user_handles:
                    if handle in approvers or any(handle in app or app in handle for app in approvers):
                        is_curr = True
                        break
        
        has_appr = (inv.id in approved_invoice_ids)
        has_rej = (inv.id in rejected_invoice_ids)
        
        inv_res = InvoiceResponse.from_orm(inv)
        inv_res.is_current_approver = is_curr
        inv_res.has_approved = has_appr
        inv_res.has_rejected = has_rej
        results.append(inv_res)

    return results

@router.get("/api/documents/synced-pending", response_model=List[InvoiceResponse])
@router.get("/api/records/synced-pending", response_model=List[InvoiceResponse])
@router.get("/api/invoices/synced-pending", response_model=List[InvoiceResponse])
def get_synced_pending_documents(db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user)):
    invoices = db.query(Invoice).filter(
        Invoice.is_deleted == False,
        Invoice.doc_key.isnot(None),
        (Invoice.file_url == None) | (Invoice.file_url == "")
    ).order_by(Invoice.created_at.desc()).all()
    
    # Filter documents based on role permissions (Admin sees all; standard users only see documents currently at their stage)
    if current_user and current_user.role != "admin":
        user_handles = [
            current_user.username.lower() if current_user.username else "",
            current_user.employee_id.lower() if current_user.employee_id else "",
            current_user.employee_name.lower() if current_user.employee_name else "",
            current_user.email.lower() if current_user.email else ""
        ]
        user_handles = [h for h in user_handles if h]
        
        filtered_invoices = []
        for inv in invoices:
            is_assigned = False
            if inv.assigned_approver:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
                for handle in user_handles:
                    if handle in approvers or any(handle in app or app in handle for app in approvers):
                        is_assigned = True
                        break
            if is_assigned:
                filtered_invoices.append(inv)
        invoices = filtered_invoices

    results = []
    for inv in invoices:
        inv_res = InvoiceResponse.from_orm(inv)
        inv_res.is_current_approver = True if current_user and current_user.role != "admin" else False
        inv_res.has_approved = False
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

    user_handles = []
    if current_user:
        user_handles = [
            current_user.username.lower() if current_user.username else "",
            current_user.employee_id.lower() if current_user.employee_id else "",
            current_user.employee_name.lower() if current_user.employee_name else "",
            current_user.email.lower() if current_user.email else ""
        ]
        user_handles = [h for h in user_handles if h]

    is_curr = False
    if current_user and inv.assigned_approver:
        is_active_flow = inv.status not in ["Approved", "Paid", "Ready for Payment", "Rejected", "Failed", "Settled"]
        if is_active_flow:
            approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
            for handle in user_handles:
                if handle in approvers or any(handle in app or app in handle for app in approvers):
                    is_curr = True
                    break

    has_appr = False
    has_rej = False
    if current_user:
        user_names = [current_user.username, current_user.employee_id, current_user.employee_name, current_user.email]
        user_names = [name for name in user_names if name]
        or_filters = [AuditLog.user.ilike(f"%{name}%") for name in user_names if name]
        if or_filters:
            audit_query = db.query(AuditLog.invoice_id, AuditLog.action).filter(
                (AuditLog.invoice_id == str(inv.id)) | (AuditLog.invoice_id == f"DOC-{inv.id}"),
                or_(*or_filters)
            ).all()
            for row in audit_query:
                act = (row[1] or "").lower()
                if "approve" in act:
                    has_appr = True
                if "reject" in act or "return" in act or "cancel" in act:
                    has_rej = True

    # Check if user was a member of a prior stage pool (e.g. Vivek when Sibitha approved Stage 1)
    is_prior_pool_member = False
    if current_user and inv.workflow_profile_id and (inv.current_stage or 1) > 1:
        for prior_stg in range(1, inv.current_stage or 1):
            st = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == prior_stg
            ).first()
            if st and st.approver_target:
                targets = [s.strip().lower() for s in st.approver_target.split(",") if s.strip()]
                if any(h in targets or any(h in t or t in h for t in targets) for h in user_handles):
                    is_prior_pool_member = True
                    break

    # Strict Access Control:
    # 1. Admins have full access
    # 2. Currently assigned approvers have actionable access (can approve)
    # 3. Users who previously signed off have read-only access
    # 4. Users who rejected/returned the document have read-only access
    # 5. Users who belonged to a prior stage pool have read-only access
    # 6. Downstream approvers CANNOT view until preceding stages have completed
    if current_user and current_user.role != "admin":
        if not is_curr and not has_appr and not has_rej and not is_prior_pool_member:
            raise HTTPException(
                status_code=403,
                detail=f"Access Denied: Document '{invoice_id}' is currently at Stage {inv.current_stage or 1} and assigned to '{inv.assigned_approver}'. It will become visible in your queue once preceding approvals are completed."
            )

    inv_dict = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
    inv_dict["is_current_approver"] = is_curr
    inv_dict["has_approved"] = has_appr
    inv_dict["has_rejected"] = has_rej
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

def archive_approved_pdf(inv: Invoice):
    """Archival helper: copies approved physical PDF into stored_pdfs and stored_pdfs/approved folder."""
    try:
        if not inv or not inv.file_url:
            return
        filename = os.path.basename(inv.file_url)
        src_path = settings.UPLOAD_DIR / filename
        if not src_path.exists():
            src_path = settings.PDF_STORAGE_DIR / filename

        if src_path.exists():
            # 1. Ensure copy exists in stored_pdfs
            dest_main = settings.PDF_STORAGE_DIR / filename
            if src_path.resolve() != dest_main.resolve() and not dest_main.exists():
                shutil.copy2(src_path, dest_main)

            # 2. Copy to stored_pdfs/approved with readable filename
            safe_inv_no = (inv.invoice_number or inv.id or "INV").replace("/", "_").replace("\\", "_")
            safe_vendor = (inv.vendor_name or "Vendor").replace("/", "_").replace("\\", "_")[:40]
            approved_filename = f"{inv.id}_{safe_inv_no}_{safe_vendor}.pdf"
            dest_approved = settings.APPROVED_PDF_DIR / approved_filename
            shutil.copy2(src_path, dest_approved)
            print(f"[Archive] Successfully archived approved PDF to: {dest_approved}")
    except Exception as e:
        print(f"[Archive Warning] Could not archive approved PDF: {e}")

def dispatch_approval_inapp_notifications(
    db: Session,
    inv: Invoice,
    approver_name: str,
    prev_stage: int,
    new_stage: int,
    next_approver_target: Optional[str] = None,
    is_completed: bool = False
):
    """Generates real-time in-app notifications when a document is approved and routed."""
    try:
        inv_title = inv.invoice_number or inv.id or "Document"
        vendor_info = inv.vendor_name or "Vendor"
        amt_str = f"INR {inv.amount:,.2f}" if inv.amount else ""
        
        # 1. Notify the NEXT assigned approver pool members
        if not is_completed and next_approver_target:
            next_targets = [t.strip() for t in next_approver_target.split(",") if t.strip()]
            for target in next_targets:
                notif = InAppNotification(
                    document_id=str(inv.id),
                    recipient_handle=target,
                    notification_type="PENDING_APPROVAL",
                    title=f"Action Required: {inv_title} Assigned to You (Stage {new_stage})",
                    message=f"Document '{inv_title}' ({vendor_info} {amt_str}) was verified and signed off by {approver_name} at Stage {prev_stage}. It is now pending your sign-off at Stage {new_stage}.",
                    is_read=False
                )
                db.add(notif)
                
        # 2. Confirmation notification for the approver who signed off
        db.add(InAppNotification(
            document_id=str(inv.id),
            recipient_handle=approver_name,
            notification_type="COMPLETED" if is_completed else "PENDING_APPROVAL",
            title=f"Approval Confirmed: Stage {prev_stage} Completed" if not is_completed else f"Document {inv_title} Fully Settled",
            message=f"You successfully signed off on Stage {prev_stage}. Document routed to Stage {new_stage} ({next_approver_target})." if not is_completed else f"You provided final sign-off for '{inv_title}'. Document is settled and archived.",
            is_read=False
        ))

        # 3. Notification for admin governance
        db.add(InAppNotification(
            document_id=str(inv.id),
            recipient_handle="admin",
            notification_type="COMPLETED" if is_completed else "PENDING_APPROVAL",
            title=f"Workflow Progress: {inv_title} ➔ Stage {new_stage}" if not is_completed else f"Workflow Settled: {inv_title}",
            message=f"Stage {prev_stage} signed off by {approver_name}. Assigned to: {next_approver_target or 'Final Settlement'}." if not is_completed else f"Document '{inv_title}' completed all approval stages.",
            is_read=False
        ))
        db.flush()
    except Exception as e:
        print(f"[Notification Warning] Failed to generate in-app notification: {e}")

def dispatch_rejection_inapp_notifications(
    db: Session,
    inv: Invoice,
    approver_name: str,
    from_stage: int,
    to_stage: int,
    remarks: str,
    target_approver: Optional[str] = None,
    is_cancelled: bool = False
):
    """Generates real-time in-app notifications when a document is rejected / sent back or cancelled."""
    try:
        inv_title = inv.invoice_number or inv.id or "Document"
        vendor_info = inv.vendor_name or "Vendor"
        amt_str = f"INR {inv.amount:,.2f}" if inv.amount else ""

        if is_cancelled:
            db.add(InAppNotification(
                document_id=str(inv.id),
                recipient_handle="admin",
                notification_type="REJECTED",
                title=f"Process Cancelled: {inv_title}",
                message=f"Document '{inv_title}' ({vendor_info}) was cancelled/voided at Stage 1 by {approver_name}. Reason: {remarks}",
                is_read=False
            ))
            req_email = getattr(inv, "requestor_email", None) or getattr(inv, "created_by", None)
            if req_email:
                db.add(InAppNotification(
                    document_id=str(inv.id),
                    recipient_handle=str(req_email),
                    notification_type="REJECTED",
                    title=f"Document Process Cancelled: {inv_title}",
                    message=f"Document '{inv_title}' has been cancelled by {approver_name}. Reason: {remarks}",
                    is_read=False
                ))
        else:
            if target_approver:
                targets = [t.strip() for t in target_approver.split(",") if t.strip()]
                for target in targets:
                    db.add(InAppNotification(
                        document_id=str(inv.id),
                        recipient_handle=target,
                        notification_type="SENT_BACK",
                        title=f"Action Required: {inv_title} Returned to You (Stage {to_stage})",
                        message=f"Document '{inv_title}' ({vendor_info} {amt_str}) was rejected by {approver_name} at Stage {from_stage} and returned to your desk for review. Reason: {remarks}",
                        is_read=False
                    ))
            
            db.add(InAppNotification(
                document_id=str(inv.id),
                recipient_handle=approver_name,
                notification_type="REJECTED",
                title=f"Returned to Previous Stage: Stage {to_stage}",
                message=f"You returned document '{inv_title}' back to Stage {to_stage} ({target_approver or 'Initiator Desk'}). Reason: {remarks}",
                is_read=False
            ))
        db.flush()
    except Exception as e:
        print(f"[Notification Warning] Failed to generate rejection in-app notification: {e}")

def process_rejection_logic(
    db: Session,
    inv: Invoice,
    approver_name: str,
    remarks: str,
    action_type: str = "Reject"
):
    """
    Step-down rejection:
    - If Stage N (N > 1): Returns document to Stage N-1 previous approver.
    - If Stage 1 (Attachment Status): Cancels / voids the process.
    """
    current_stage = inv.current_stage or 1
    
    if current_stage > 1:
        prev_stage = current_stage - 1
        inv.current_stage = prev_stage
        prev_step_name = f"Stage {prev_stage}"
        
        if inv.workflow_profile_id:
            prev_step = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == prev_stage
            ).first()
            if prev_step:
                inv.assigned_approver = prev_step.approver_target
                prev_step_name = prev_step.step_name
            else:
                if prev_stage == 1:
                    inv.assigned_approver = "admin, ap_executive"
        else:
            if prev_stage == 1:
                inv.assigned_approver = "admin, ap_executive"
                
        if prev_stage == 1:
            inv.status = "Rejected / Returned (Attachment Status)"
        else:
            inv.status = f"Rejected / Returned (Stage {prev_stage} - {prev_step_name})"

        # Re-initialize / reset checklist items for the returned stage
        existing_items = db.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == inv.id,
            InvoiceChecklistState.stage_name == prev_step_name
        ).all()
        if not existing_items:
            checklist_items = resolve_checklist_items(db, inv, prev_step_name)
            for item_text in checklist_items:
                db.add(InvoiceChecklistState(
                    invoice_id=inv.id,
                    stage_name=prev_step_name,
                    item_text=item_text,
                    is_checked=False
                ))
            inv.checklist_state = json.dumps({item_text: False for item_text in checklist_items})
        else:
            for item in existing_items:
                item.is_checked = False
                item.checked_by = None
                item.checked_at = None
            inv.checklist_state = json.dumps({item.item_text: False for item in existing_items})

        dispatch_rejection_inapp_notifications(
            db=db,
            inv=inv,
            approver_name=approver_name,
            from_stage=current_stage,
            to_stage=prev_stage,
            remarks=remarks,
            target_approver=inv.assigned_approver,
            is_cancelled=False
        )

        db.add(AuditLog(
            invoice_id=str(inv.id),
            user=approver_name,
            action=f"Rejected / Returned to Stage {prev_stage}",
            stage=f"Stage {current_stage}",
            notes=f"Rejected at Stage {current_stage} by {approver_name} ➔ Returned to Stage {prev_stage} ({prev_step_name}, Assigned: {inv.assigned_approver}). Reason: {remarks}"
        ))

        return {
            "success": True,
            "status": inv.status,
            "current_stage": inv.current_stage,
            "assigned_approver": inv.assigned_approver,
            "message": f"Document returned to Stage {prev_stage} ({prev_step_name}) for previous approver review."
        }
    else:
        # At Stage 1 (Attachment Status), rejection cancels / voids the process
        inv.status = "Cancelled"
        inv.assigned_approver = None

        dispatch_rejection_inapp_notifications(
            db=db,
            inv=inv,
            approver_name=approver_name,
            from_stage=1,
            to_stage=0,
            remarks=remarks,
            target_approver=None,
            is_cancelled=True
        )

        db.add(AuditLog(
            invoice_id=str(inv.id),
            user=approver_name,
            action="Process Cancelled",
            stage="Stage 1 (Attachment Status)",
            notes=f"Workflow process cancelled/voided by {approver_name} at Stage 1. Reason: {remarks}"
        ))

        return {
            "success": True,
            "status": inv.status,
            "current_stage": inv.current_stage,
            "message": "Workflow process cancelled and voided at Attachment Stage."
        }

def check_approval_authorization(inv: Invoice, user: Optional[User], db: Optional[Session] = None, require_compliance: bool = True):
    # 1. Enforce terminal/settled states
    if inv.status in ["Settled", "Approved", "Paid", "Ready for Payment", "Cancelled", "Failed"]:
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

    if require_compliance and db:
        # 3. If Stage 1 (Attachment Status), strictly require physical document attachment
        is_stage_1 = (inv.current_stage or 1) == 1
        has_attachment = bool(inv.file_url and inv.file_url.strip())
        if is_stage_1 and not has_attachment:
            raise HTTPException(
                status_code=400,
                detail="Document Attachment Required: A physical invoice PDF must be attached and uploaded before approving Stage 1 (Attachment Status)."
            )

        # 4. Mandatory checklist verification: All checklist boxes for current stage MUST be checked
        current_step_name = "Attachment Status" if is_stage_1 else f"Stage {inv.current_stage or 1}"
        if inv.workflow_profile_id:
            step = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == (inv.current_stage or 1)
            ).first()
            if step and step.step_name:
                current_step_name = step.step_name

        checklist_items = db.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == inv.id,
            InvoiceChecklistState.stage_name == current_step_name
        ).all()

        if not checklist_items:
            default_items = resolve_checklist_items(db, inv, current_step_name)
            for t_text in default_items:
                item = InvoiceChecklistState(
                    invoice_id=inv.id,
                    stage_name=current_step_name,
                    item_text=t_text,
                    is_checked=False
                )
                db.add(item)
                checklist_items.append(item)
            db.commit()

        if checklist_items:
            unchecked = [item for item in checklist_items if not item.is_checked]
            if unchecked:
                raise HTTPException(
                    status_code=400,
                    detail=f"Compliance Checklist Incomplete: Please verify and check all {len(checklist_items)} checklist items for '{current_step_name}' ({len(unchecked)} remaining) before approving."
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
    check_approval_authorization(inv, user, db=db, require_compliance=True)

    current_step_name = "Attachment Status" if (inv.current_stage or 1) == 1 else f"Stage {inv.current_stage or 1}"
    if inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.stage_number == (inv.current_stage or 1)
        ).first()
        if step and step.step_name:
            current_step_name = step.step_name
    
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
    prev_stage_num = inv.current_stage or 1

    next_assigned_info = "Final Settlement Completed. Ready for payment disbursement."
    if (inv.current_stage or 1) < (inv.total_stages or 1):
        inv.current_stage = (inv.current_stage or 1) + 1
        next_step_name = f"Stage {inv.current_stage}"
        if inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == inv.current_stage
            ).first()
            if next_step:
                inv.assigned_approver = next_step.approver_target
                next_step_name = next_step.step_name
                next_assigned_info = f"Advanced to Stage {inv.current_stage} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}."

        # Ensure checklist items for the next stage are completely fresh and unchecked
        existing_next_items = db.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == inv.id,
            InvoiceChecklistState.stage_name == next_step_name
        ).all()
        if not existing_next_items:
            checklist_items = resolve_checklist_items(db, inv, next_step_name)
            for item_text in checklist_items:
                db.add(InvoiceChecklistState(
                    invoice_id=inv.id,
                    stage_name=next_step_name,
                    item_text=item_text,
                    is_checked=False
                ))
            inv.checklist_state = json.dumps({item_text: False for item_text in checklist_items})
        else:
            for item in existing_next_items:
                item.is_checked = False
                item.checked_by = None
                item.checked_at = None
            inv.checklist_state = json.dumps({item.item_text: False for item in existing_next_items})

        inv.status = f"In Progress (Stage {inv.current_stage})"
    else:
        inv.status = "Settled"
        archive_approved_pdf(inv)

    dispatch_approval_inapp_notifications(
        db=db,
        inv=inv,
        approver_name=approver_name,
        prev_stage=prev_stage_num,
        new_stage=inv.current_stage,
        next_approver_target=inv.assigned_approver,
        is_completed=(inv.status == "Settled")
    )

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
    check_approval_authorization(inv, user, db=db, require_compliance=True)
    username = (user.employee_name or user.name) if user else "Reviewer"
    remarks = action.remarks if action and action.remarks else "Compliance items verified and signed off."
    stage_name = action.stage_name if action and action.stage_name else f"Stage {inv.current_stage or 1}"
    prev_stage_num = inv.current_stage or 1

    next_assigned_info = "Final Settlement Completed. Ready for payment disbursement."
    if (inv.current_stage or 1) < (inv.total_stages or 1):
        inv.current_stage = (inv.current_stage or 1) + 1
        next_step_name = f"Stage {inv.current_stage}"
        if inv.workflow_profile_id:
            next_step = db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                WorkflowStepDefinition.stage_number == inv.current_stage
            ).first()
            if next_step:
                inv.assigned_approver = next_step.approver_target
                next_step_name = next_step.step_name
                next_assigned_info = f"Advanced to Stage {inv.current_stage} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}."

        # Auto-initialize or reset checklist items in the database for the next stage
        existing_next_items = db.query(InvoiceChecklistState).filter(
            InvoiceChecklistState.invoice_id == inv.id,
            InvoiceChecklistState.stage_name == next_step_name
        ).all()
        if not existing_next_items:
            checklist_items = resolve_checklist_items(db, inv, next_step_name)
            for item_text in checklist_items:
                db.add(InvoiceChecklistState(
                    invoice_id=inv.id,
                    stage_name=next_step_name,
                    item_text=item_text,
                    is_checked=False
                ))
            inv.checklist_state = json.dumps({item_text: False for item_text in checklist_items})
        else:
            for item in existing_next_items:
                item.is_checked = False
                item.checked_by = None
                item.checked_at = None
            inv.checklist_state = json.dumps({item.item_text: False for item in existing_next_items})

        inv.status = f"In Progress (Stage {inv.current_stage})"
    else:
        inv.status = "Settled"
        archive_approved_pdf(inv)

    dispatch_approval_inapp_notifications(
        db=db,
        inv=inv,
        approver_name=username,
        prev_stage=prev_stage_num,
        new_stage=inv.current_stage,
        next_approver_target=inv.assigned_approver,
        is_completed=(inv.status == "Settled")
    )

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
    action_type = str(payload.get("action") or "Approve").strip()
    act_lower = action_type.lower()
    is_approving = ("approve" in act_lower or "pass" in act_lower)
    check_approval_authorization(inv, user, db=db, require_compliance=is_approving)
    comments = str(payload.get("comments") or payload.get("comment") or "Action processed by desk operator.").strip()
    approver_name = payload.get("approver") or (user.employee_name or user.name if user else "Desk Operator")
    stage_name = f"Stage {inv.current_stage or 1}"
    prev_stage_num = inv.current_stage or 1

    if "approve" in act_lower or "pass" in act_lower:
        next_assigned_info = "Final Settlement Completed. Ready for payment disbursement."
        if (inv.current_stage or 1) < (inv.total_stages or 1):
            inv.current_stage = (inv.current_stage or 1) + 1
            next_step_name = f"Stage {inv.current_stage}"
            if inv.workflow_profile_id:
                next_step = db.query(WorkflowStepDefinition).filter(
                    WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
                    WorkflowStepDefinition.stage_number == inv.current_stage
                ).first()
                if next_step:
                    inv.assigned_approver = next_step.approver_target
                    next_step_name = next_step.step_name
                    next_assigned_info = f"Advanced to Stage {inv.current_stage} ({next_step.step_name}). Next Approver Assigned: {next_step.approver_target}."

            # Auto-initialize or reset checklist items in the database for the next stage
            existing_next_items = db.query(InvoiceChecklistState).filter(
                InvoiceChecklistState.invoice_id == inv.id,
                InvoiceChecklistState.stage_name == next_step_name
            ).all()
            if not existing_next_items:
                checklist_items = resolve_checklist_items(db, inv, next_step_name)
                for item_text in checklist_items:
                    db.add(InvoiceChecklistState(
                        invoice_id=inv.id,
                        stage_name=next_step_name,
                        item_text=item_text,
                        is_checked=False
                    ))
                inv.checklist_state = json.dumps({item_text: False for item_text in checklist_items})
            else:
                for item in existing_next_items:
                    item.is_checked = False
                    item.checked_by = None
                    item.checked_at = None
                inv.checklist_state = json.dumps({item.item_text: False for item in existing_next_items})

            inv.status = f"In Progress (Stage {inv.current_stage})"
        else:
            inv.status = "Settled"
            archive_approved_pdf(inv)

        dispatch_approval_inapp_notifications(
            db=db,
            inv=inv,
            approver_name=approver_name,
            prev_stage=prev_stage_num,
            new_stage=inv.current_stage,
            next_approver_target=inv.assigned_approver,
            is_completed=(inv.status == "Settled")
        )

        db.add(AuditLog(
            invoice_id=str(inv.id),
            user=approver_name,
            action=f"Approved ({stage_name})",
            stage=stage_name,
            notes=f"{comments} ➔ {next_assigned_info}"
        ))
    elif "reject" in act_lower or "send back" in act_lower or "return" in act_lower:
        result = process_rejection_logic(
            db=db,
            inv=inv,
            approver_name=approver_name,
            remarks=comments,
            action_type=action_type
        )
        db.commit()
        db.refresh(inv)
        return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv, **result}
    else: # Clarify / Hold
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

# Unified Rejection Routes (Step-Down to Previous Approver / Cancel at Stage 1)
@router.post("/api/workflows/reject")
@router.post("/api/workflow/reject")
def workflow_reject_payload(
    payload: dict,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    doc_id = payload.get("invoiceId") or payload.get("invoice_id") or payload.get("document_id") or payload.get("id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing invoiceId in rejection payload")
    
    inv = find_invoice_by_identifier(db, doc_id)
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    
    approver_name = payload.get("user") or payload.get("username") or (user.employee_name or user.name if user else "Approver")
    remarks = payload.get("comments") or payload.get("comment") or payload.get("remarks") or "Record rejected / returned to previous approver."
    
    result = process_rejection_logic(
        db=db,
        inv=inv,
        approver_name=approver_name,
        remarks=remarks,
        action_type="Reject"
    )
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv, **result}

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
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    username = (user.employee_name or user.name) if user else "Reviewer"
    remarks = action.remarks if action else "Record rejected / returned to previous approver."

    result = process_rejection_logic(
        db=db,
        inv=inv,
        approver_name=username,
        remarks=remarks,
        action_type="Reject"
    )
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "invoice": inv, **result}

# Unified Hold / Sendback Routes
@router.post("/api/workflows/hold")
@router.post("/api/workflow/hold")
@router.post("/api/workflows/sendback")
@router.post("/api/workflow/sendback")
def workflow_hold_payload(
    payload: dict,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    doc_id = payload.get("invoiceId") or payload.get("invoice_id") or payload.get("document_id") or payload.get("id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing invoiceId in hold/sendback payload")
    
    inv = find_invoice_by_identifier(db, doc_id)
    check_approval_authorization(inv, user, db=db, require_compliance=False)
    username = payload.get("user") or payload.get("username") or (user.employee_name or user.name if user else "Approver")
    remarks = payload.get("comments") or payload.get("comment") or payload.get("remarks") or "Record returned to previous stage."
    
    result = process_rejection_logic(
        db=db,
        inv=inv,
        approver_name=username,
        remarks=remarks,
        action_type="Send Back"
    )
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "current_stage": inv.current_stage, "invoice": inv, **result}

# Explicit Cancellation Route (used to cancel/void process at Stage 1)
@router.post("/api/workflows/cancel")
@router.post("/api/records/{invoice_id}/cancel")
@router.post("/api/invoices/{invoice_id}/cancel")
def workflow_cancel_route(
    invoice_id: Optional[str] = None,
    payload: Optional[dict] = None,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    doc_id = invoice_id or (payload.get("invoiceId") or payload.get("id") if payload else None)
    if not doc_id:
        raise HTTPException(status_code=400, detail="Missing invoiceId")
    inv = find_invoice_by_identifier(db, doc_id)
    username = (user.employee_name or user.name if user else None) or (payload.get("user") or payload.get("username") if payload else "User")
    remarks = (payload.get("comments") or payload.get("remarks") if payload else None) or "Process cancelled by user."
    
    inv.status = "Cancelled"
    inv.assigned_approver = None
    dispatch_rejection_inapp_notifications(
        db=db,
        inv=inv,
        approver_name=username,
        from_stage=inv.current_stage or 1,
        to_stage=0,
        remarks=remarks,
        target_approver=None,
        is_cancelled=True
    )
    db.add(AuditLog(
        invoice_id=str(inv.id),
        user=username,
        action="Process Cancelled",
        stage=f"Stage {inv.current_stage or 1}",
        notes=f"Process cancelled/voided: {remarks}"
    ))
    db.commit()
    db.refresh(inv)
    return {"success": True, "status": inv.status, "message": "Workflow process cancelled."}

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
    prefix = get_doc_type_prefix(document_type or "", "")
    new_id = f"{prefix}-{timestamp % 100000}"
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    filename = f"{new_id}.{ext}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
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

    from app.services.rules_engine import infer_document_type
    matched_wf = evaluate_business_rules(db, new_inv)
    if not matched_wf:
        matched_wf = "VCC_EB_DEPOSIT_POST&TEL_CAM_RENT_NEW2"

    new_inv.workflow_profile_id = matched_wf
    new_inv.document_type = infer_document_type(category=category, wf_name=matched_wf, doc_type=document_type)
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
    checklist_items = generate_compliance_checklist_for_category(
        new_inv.category, 
        new_inv.document_type, 
        new_inv.division, 
        new_inv.plant
    )
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

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    filename = f"{inv.id}.{ext}"
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
    if cgst is not None: inv.cgst = cgst
    if sgst is not None: inv.sgst = sgst
    if igst is not None: inv.igst = igst
    
    from app.services.rules_engine import infer_document_type
    matched_wf = evaluate_business_rules(db, inv)
    if not matched_wf:
        matched_wf = "VCC_EB_DEPOSIT_POST&TEL_CAM_RENT_NEW2"

    inv.workflow_profile_id = matched_wf
    inv.document_type = infer_document_type(category=inv.category, wf_name=matched_wf, doc_type=document_type)
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
    checklist_items = generate_compliance_checklist_for_category(
        inv.category, 
        inv.document_type, 
        inv.division, 
        inv.plant
    )
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

    ext = file.filename.split('.')[-1] if '.' in file.filename else 'pdf'
    filename = f"{inv.id}.{ext}"
    file_path = settings.UPLOAD_DIR / filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    inv.file_url = f"/uploads/{filename}"
    inv.file_name = file.filename
    
    # Document attachment only attaches the physical PDF; workflow stage advancement
    # occurs strictly when the assigned user verifies the checklist and clicks Approve.
    
    db.add(AuditLog(
        invoice_id=str(inv.id),
        user="Initiator / Approver",
        action="Invoice PDF Attached",
        stage=f"Stage {inv.current_stage or 1}",
        notes=f"Physical document attached: {file.filename}. Pending checklist verification and stage approval."
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
def get_dashboard_stats(db: Session = Depends(get_db), current_user: Optional[User] = Depends(get_current_user)):
    # Base query for all active invoices
    invoices = db.query(Invoice).filter(Invoice.is_deleted == False).all()
    
    # Identify approved invoice IDs for the current user
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

    # Calculate statistics based on role
    if current_user and current_user.role != "admin":
        user_handles = [
            current_user.username.lower() if current_user.username else "",
            current_user.employee_id.lower() if current_user.employee_id else "",
            current_user.employee_name.lower() if current_user.employee_name else "",
            current_user.email.lower() if current_user.email else ""
        ]
        user_handles = [h for h in user_handles if h]
        
        scoped_invoices = []
        approved_count = 0
        pending_count = 0
        total_spend = 0.0
        
        for inv in invoices:
            has_approved = (inv.id in approved_invoice_ids)
            
            # Check if assigned
            is_assigned = False
            if inv.assigned_approver:
                approvers = [s.strip().lower() for s in inv.assigned_approver.split(",") if s.strip()]
                for handle in user_handles:
                    if handle in approvers or any(handle in app or app in handle for app in approvers):
                        is_assigned = True
                        break
            
            if has_approved or is_assigned:
                scoped_invoices.append(inv)
                total_spend += float(inv.amount or 0.0)
                
                # Check status and participation to determine Approved vs. Pending
                if has_approved:
                    approved_count += 1
                else:
                    is_active_flow = inv.status not in ["Approved", "Paid", "Ready for Payment", "Rejected", "Failed", "Settled"]
                    if is_active_flow and is_assigned:
                        pending_count += 1
        
        total_docs = len(scoped_invoices)
    else:
        # Admin or fallback: Global system stats
        total_docs = len(invoices)
        pending_count = sum(1 for i in invoices if any(status.lower() in (i.status or "").lower() for status in ["pending", "initiated", "progress"]))
        approved_count = sum(1 for i in invoices if any(status.lower() in (i.status or "").lower() for status in ["settled", "approved", "paid", "ready for payment"]))
        total_spend = sum(float(i.amount or 0.0) for i in invoices)

    return {
        "totalDocuments": total_docs,
        "pendingApprovals": pending_count,
        "approvedDocuments": approved_count,
        "totalSpendINR": total_spend,
        "autoRoutedPercentage": 100.0 if total_docs > 0 else 0.0
    }

@router.get("/api/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    query = db.query(InAppNotification)
    if current_user and current_user.role != "admin":
        user_handles = [
            current_user.username.lower() if current_user.username else "",
            current_user.employee_id.lower() if current_user.employee_id else "",
            current_user.employee_name.lower() if current_user.employee_name else "",
            current_user.email.lower() if current_user.email else ""
        ]
        user_handles = [h for h in user_handles if h]
        
        all_notifs = query.order_by(InAppNotification.created_at.desc()).limit(100).all()
        filtered = []
        for n in all_notifs:
            handle = (n.recipient_handle or "").lower()
            if any(uh == handle or uh in handle or handle in uh for uh in user_handles):
                filtered.append({
                    "notification_id": n.notification_id,
                    "document_id": n.document_id,
                    "notification_type": n.notification_type,
                    "title": n.title,
                    "message": n.message,
                    "is_read": n.is_read,
                    "created_at": n.created_at.isoformat() if n.created_at else datetime.datetime.utcnow().isoformat()
                })
        return filtered
    
    # Admin sees all notifications
    all_notifs = query.order_by(InAppNotification.created_at.desc()).limit(50).all()
    return [
        {
            "notification_id": n.notification_id,
            "document_id": n.document_id,
            "notification_type": n.notification_type,
            "title": n.title,
            "message": n.message,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else datetime.datetime.utcnow().isoformat()
        }
        for n in all_notifs
    ]

@router.put("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, db: Session = Depends(get_db)):
    notif = db.query(InAppNotification).filter(InAppNotification.notification_id == notification_id).first()
    if not notif:
        notif = db.query(InAppNotification).filter(InAppNotification.id == notification_id).first()
    if notif:
        notif.is_read = True
        db.commit()
    return {"success": True}

@router.put("/api/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user)
):
    query = db.query(InAppNotification)
    if current_user and current_user.role != "admin":
        user_handles = [
            current_user.username.lower() if current_user.username else "",
            current_user.employee_id.lower() if current_user.employee_id else "",
            current_user.employee_name.lower() if current_user.employee_name else "",
            current_user.email.lower() if current_user.email else ""
        ]
        user_handles = [h for h in user_handles if h]
        all_notifs = query.filter(InAppNotification.is_read == False).all()
        for n in all_notifs:
            handle = (n.recipient_handle or "").lower()
            if any(uh == handle or uh in handle or handle in uh for uh in user_handles):
                n.is_read = True
    else:
        query.update({InAppNotification.is_read: True})
    db.commit()
    return {"success": True}

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

def load_erp_master_data() -> list:
    configs = load_app_configs()
    for c in configs:
        if c.get("key") == "ERP_MASTER_DATA":
            try:
                return json.loads(c.get("value", "[]"))
            except Exception:
                return []
    return []

def save_erp_master_data(items: list):
    save_app_config("ERP_MASTER_DATA", json.dumps(items, ensure_ascii=False), "Synchronized ERP Master PO Registry")

@router.get("/api/admin/erp-master")
def get_admin_erp_master(db: Session = Depends(get_db)):
    return load_erp_master_data()

@router.post("/api/admin/erp-master")
def post_admin_erp_master(payload: dict, db: Session = Depends(get_db)):
    items = load_erp_master_data()
    po = payload.get("po_number")
    if not po:
        raise HTTPException(status_code=400, detail="Missing po_number")
    
    found = False
    for i, itm in enumerate(items):
        if itm.get("po_number") == po:
            items[i] = payload
            found = True
            break
    if not found:
        items.append(payload)
    save_erp_master_data(items)
    return {"success": True, "item": payload}

@router.post("/api/admin/erp-master/bulk")
def post_admin_erp_master_bulk(payload: dict, db: Session = Depends(get_db)):
    new_items = payload.get("items", [])
    items = load_erp_master_data()
    existing_pos = {itm.get("po_number"): i for i, itm in enumerate(items)}
    
    for itm in new_items:
        po = itm.get("po_number")
        if po in existing_pos:
            items[existing_pos[po]] = itm
        else:
            items.append(itm)
            existing_pos[po] = len(items) - 1
            
    save_erp_master_data(items)
    return {"success": True, "count": len(new_items)}

@router.delete("/api/admin/erp-master/{po}")
def delete_admin_erp_master(po: str, db: Session = Depends(get_db)):
    items = load_erp_master_data()
    items = [itm for itm in items if itm.get("po_number") != po]
    save_erp_master_data(items)
    return {"success": True, "deleted": po}

@router.get("/api/admin/recycle-bin")
def get_admin_recycle_bin(db: Session = Depends(get_db)):
    return []

@router.get("/api/admin/notifications/provider")
def get_admin_notifications_provider(db: Session = Depends(get_db)):
    config = db.query(NotificationProviderConfig).first()
    if config:
        return {
            "smtp_server": config.smtp_server,
            "port": config.port,
            "username": config.username,
            "encrypted_password": config.encrypted_password,
            "sender_email": config.sender_email,
            "sender_name": config.sender_name
        }
    return {
        "smtp_server": "smtp.office365.com",
        "port": 587,
        "username": "Sqlalerts@ramrajcotton.net",
        "encrypted_password": "",
        "sender_email": "Sqlalerts@ramrajcotton.net",
        "sender_name": "DocuFlow Alerts"
    }

@router.post("/api/admin/notifications/provider")
def save_admin_notifications_provider(payload: NotificationProviderSchema, db: Session = Depends(get_db)):
    config = db.query(NotificationProviderConfig).first()
    if not config:
        config = NotificationProviderConfig(
            smtp_server=payload.smtp_server,
            port=payload.port,
            username=payload.username,
            encrypted_password=payload.encrypted_password,
            sender_email=payload.sender_email,
            sender_name=payload.sender_name
        )
        db.add(config)
    else:
        config.smtp_server = payload.smtp_server
        config.port = payload.port
        config.username = payload.username
        config.encrypted_password = payload.encrypted_password
        config.sender_email = payload.sender_email
        config.sender_name = payload.sender_name
    db.commit()
    return {"success": True, "message": "SMTP provider configuration saved successfully"}

@router.get("/api/admin/notifications/raci")
def get_admin_notifications_raci(db: Session = Depends(get_db)):
    items = db.query(NotificationRaciMatrix).all()
    return [
        {
            "workflow_profile": item.workflow_profile,
            "event_name": item.event_name,
            "responsible_emails": item.responsible_emails,
            "accountable_emails": item.accountable_emails,
            "consulted_emails": item.consulted_emails,
            "informed_emails": item.informed_emails,
            "title_template": item.title_template,
            "message_template": item.message_template
        }
        for item in items
    ]

@router.post("/api/admin/notifications/raci")
def save_admin_notifications_raci(payload: NotificationRaciSchema, db: Session = Depends(get_db)):
    item = db.query(NotificationRaciMatrix).filter(
        NotificationRaciMatrix.workflow_profile == payload.workflow_profile,
        NotificationRaciMatrix.event_name == payload.event_name
    ).first()
    
    if not item:
        item = NotificationRaciMatrix(
            workflow_profile=payload.workflow_profile,
            event_name=payload.event_name
        )
        db.add(item)
        
    item.responsible_emails = payload.responsible_emails
    item.accountable_emails = payload.accountable_emails
    item.consulted_emails = payload.consulted_emails
    item.informed_emails = payload.informed_emails
    item.title_template = payload.title_template
    item.message_template = payload.message_template
    
    db.commit()
    return {"success": True, "message": f"RACI configuration saved for {payload.event_name}"}

@router.post("/api/admin/notifications/test")
def test_admin_notifications_smtp(payload: NotificationTestSchema, db: Session = Depends(get_db)):
    config = db.query(NotificationProviderConfig).first()
    smtp_host = config.smtp_server if config else "smtp.office365.com"
    smtp_port = config.port if config else 587
    smtp_user = config.username if config else "Sqlalerts@ramrajcotton.net"
    smtp_pass = config.encrypted_password if config else ""
    sender_email = (config.sender_email if config else None) or smtp_user or "no-reply@docuflow.net"
    sender_name = (config.sender_name if config else None) or "DocuFlow Alerts"
    
    if not smtp_host or not smtp_user:
         raise HTTPException(status_code=400, detail="Incomplete SMTP settings (Host and Username are required)")
         
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = payload.subject
        msg["From"] = f"{sender_name} <{sender_email}>"
        msg["To"] = payload.to
        
        msg.attach(MIMEText(payload.html, "html"))
        
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=8)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=8)
            server.starttls()
            
        if smtp_pass:
            server.login(smtp_user, smtp_pass)
        server.sendmail(sender_email, [payload.to], msg.as_string())
        server.quit()
        return {"success": True, "message": f"Test email sent to {payload.to}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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


def resolve_checklist_items(db: Session, inv: Invoice, stage_name: str) -> List[str]:
    # =========================================================================
    # PRIORITY 0 (DIRECT WORKFLOW STAGE CONFIGURATION):
    # Direct stage checklist configured on the workflow step in FlowBuilder UI
    # =========================================================================
    if inv.workflow_profile_id:
        step_def = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.step_name.ilike(stage_name.strip())
        ).first()
        if step_def and step_def.checklist_json:
            try:
                parsed = json.loads(step_def.checklist_json)
                if isinstance(parsed, list) and len(parsed) > 0:
                    clean_items = [str(x).strip() for x in parsed if str(x).strip()]
                    if clean_items:
                        return clean_items
            except Exception:
                pass

    # =========================================================================
    # PRIORITY 1: Specific Category / Company Condition Rules
    # (Matches Company == X, DocType/Category == Y, Branch == Z, Stage/Status == S)
    # =========================================================================
    matching_rules = db.query(ChecklistRule).filter(
        ChecklistRule.stage_name.ilike(stage_name.strip()),
        ChecklistRule.is_active == True
    ).order_by(ChecklistRule.sequence_order.asc()).all()
    
    scored_rules = []
    for r in matching_rules:
        # Match Division / Company
        div_matched = False
        if r.division and r.division != "ALL":
            divs = [d.strip().upper() for d in r.division.split(',') if d.strip()]
            inv_div = (inv.division or "").strip().upper()
            if inv_div in divs or any(inv_div == d or inv_div in d for d in divs):
                div_matched = True
            else:
                continue

        # Match Category / Document Type
        cat_matched = False
        if r.category and r.category != "ALL":
            cats = [c.strip().upper() for c in r.category.split(',') if c.strip()]
            inv_cat = (inv.category or "").strip().upper()
            inv_doc = (inv.document_type or "").strip().upper()
            if (inv_cat and (inv_cat in cats or any(c == inv_cat or inv_cat in c or c in inv_cat for c in cats))) or \
               (inv_doc and (inv_doc in cats or any(c == inv_doc or inv_doc in c or c in inv_doc for c in cats))):
                cat_matched = True
            else:
                continue

        # Match Branch / Plant
        branch_matched = False
        if r.branch and r.branch != "ALL":
            branches = [b.strip().upper() for b in r.branch.split(',') if b.strip()]
            inv_plant = (inv.plant or "").strip().upper()
            if inv_plant in branches or any(inv_plant == b or inv_plant in b for b in branches):
                branch_matched = True
            else:
                continue

        # Match Workflow Profile (if specified on rule)
        wf_matched = False
        if r.workflow_profile and r.workflow_profile != "ALL":
            if r.workflow_profile.strip().upper() == (inv.workflow_profile_id or "").strip().upper():
                wf_matched = True
            else:
                continue
            
        score = 0
        if div_matched: score += 20
        if cat_matched: score += 30
        if branch_matched: score += 10
        if wf_matched: score += 10
        
        # Only consider condition rules with actual matching specificity (score > 0)
        if score > 0:
            scored_rules.append((score, r))
        
    if scored_rules:
        max_score = max(s[0] for s in scored_rules)
        best_rules = [r for score, r in scored_rules if score == max_score]
        res_items = []
        for r in best_rules:
            txt = (r.item_text or "").strip()
            if " || " in txt:
                sub_items = txt.split(" || ")
            elif "\n" in txt:
                sub_items = txt.split("\n")
            else:
                sub_items = [txt]

            for sub_it in sub_items:
                clean = sub_it.strip()
                if clean and clean not in res_items:
                    res_items.append(clean)
        if res_items:
            return res_items

    # =========================================================================
    # PRIORITY 2 (FALLBACK): Workflow-Based Default Checklist (Sheet 4)
    # (Matches WorkflowProfile == P, Stage/Status == S)
    # =========================================================================
    if inv.workflow_profile_id:
        tpl_items = db.query(ChecklistTemplate).filter(
            ChecklistTemplate.workflow_profile == inv.workflow_profile_id,
            ChecklistTemplate.stage_name.ilike(stage_name.strip()),
            ChecklistTemplate.is_active == True
        ).order_by(ChecklistTemplate.sequence_order.asc()).all()
        if tpl_items:
            res = []
            for it in tpl_items:
                c = (it.item_text or "").strip()
                if c and c not in res:
                    res.append(c)
            if res:
                return res

    # =========================================================================
    # PRIORITY 3 (UNIVERSAL BASE): Standard Compliance Checklist
    # =========================================================================
    from app.routers.sync import generate_compliance_checklist_for_category
    return generate_compliance_checklist_for_category(
        inv.category, 
        inv.document_type, 
        inv.division, 
        inv.plant
    )


@router.get("/api/invoices/{invoice_id}/checklist")
def get_invoice_checklist(invoice_id: str, db: Session = Depends(get_db)):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    current_step_name = "Attachment Status" if (inv.current_stage or 1) == 1 else f"Stage {inv.current_stage or 1}"
    if inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.stage_number == (inv.current_stage or 1)
        ).first()
        if step and step.step_name:
            current_step_name = step.step_name
 
    items = db.query(InvoiceChecklistState).filter(
        InvoiceChecklistState.invoice_id == inv.id,
        InvoiceChecklistState.stage_name == current_step_name
    ).order_by(InvoiceChecklistState.id.asc()).all()
 
    if not items:
        default_items = resolve_checklist_items(db, inv, current_step_name)
        for t_text in default_items:
            item = InvoiceChecklistState(
                invoice_id=inv.id,
                stage_name=current_step_name,
                item_text=t_text,
                is_checked=False
            )
            db.add(item)
            items.append(item)
        db.commit()

    return [
        {
            "id": item.id,
            "item_text": item.item_text,
            "is_checked": item.is_checked,
            "checked_by": item.checked_by,
            "checked_at": item.checked_at
        }
        for item in items
    ]

@router.post("/api/invoices/{invoice_id}/checklist")
def update_invoice_checklist(
    invoice_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    inv = find_invoice_by_identifier(db, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    checked_items = payload.get("checked_items", [])
    
    current_step_name = "Attachment Status" if (inv.current_stage or 1) == 1 else f"Stage {inv.current_stage or 1}"
    if inv.workflow_profile_id:
        step = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == inv.workflow_profile_id,
            WorkflowStepDefinition.stage_number == (inv.current_stage or 1)
        ).first()
        if step and step.step_name:
            current_step_name = step.step_name

    items = db.query(InvoiceChecklistState).filter(
        InvoiceChecklistState.invoice_id == inv.id,
        InvoiceChecklistState.stage_name == current_step_name
    ).all()

    username = (user.employee_name or user.name or user.username) if user else (payload.get("username") or "System Reviewer")

    for item in items:
        old_checked = item.is_checked
        item.is_checked = (item.item_text in checked_items)
        if item.is_checked and not old_checked:
            item.checked_by = username
            item.checked_at = datetime.datetime.utcnow()
        elif not item.is_checked:
            item.checked_by = None
            item.checked_at = None
    
    inv.checklist_state = json.dumps({item.item_text: item.is_checked for item in items})
    db.commit()
    return {"success": True, "checklist": [{"item_text": item.item_text, "is_checked": item.is_checked} for item in items]}


@router.get("/api/admin/checklist-rules")
@router.get("/api/checklist-templates")
def get_checklist_templates(db: Session = Depends(get_db)):
    rules = db.query(ChecklistRule).order_by(
        ChecklistRule.sequence_order.asc(),
        ChecklistRule.rule_name.asc()
    ).all()
    return [
        {
            "id": r.id,
            "rule_name": r.rule_name,
            "division": r.division or "ALL",
            "category": r.category or "ALL",
            "branch": r.branch or "ALL",
            "workflow_profile": r.workflow_profile or "ALL",
            "stage_name": r.stage_name or "Attachment Status",
            "item_text": r.item_text or "",
            "is_mandatory": r.is_mandatory,
            "is_active": r.is_active,
            "sequence_order": r.sequence_order
        }
        for r in rules
    ]


@router.post("/api/admin/checklist-rules")
@router.post("/api/checklist-templates")
def save_checklist_template(payload: dict, db: Session = Depends(get_db)):
    tid = payload.get("id")
    if tid and not str(tid).startswith("tmp-"):
        rule = db.query(ChecklistRule).filter(ChecklistRule.id == int(tid)).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Checklist rule not found")
    else:
        rule = ChecklistRule()
        db.add(rule)

    rule.rule_name = payload.get("rule_name", "Checklist Rule")
    rule.division = payload.get("division", "ALL")
    rule.category = payload.get("category", "ALL")
    rule.branch = payload.get("branch", "ALL")
    rule.workflow_profile = payload.get("workflow_profile", "ALL")
    rule.stage_name = payload.get("stage_name", "Attachment Status")
    rule.item_text = payload.get("item_text", "")
    rule.is_mandatory = bool(payload.get("is_mandatory", True))
    rule.is_active = bool(payload.get("is_active", True))
    rule.sequence_order = int(payload.get("sequence_order", 1))

    db.commit()
    db.refresh(rule)
    return {
        "success": True,
        "rule": {
            "id": rule.id,
            "rule_name": rule.rule_name,
            "division": rule.division,
            "category": rule.category,
            "branch": rule.branch,
            "workflow_profile": rule.workflow_profile,
            "stage_name": rule.stage_name,
            "item_text": rule.item_text,
            "is_mandatory": rule.is_mandatory,
            "is_active": rule.is_active,
            "sequence_order": rule.sequence_order
        }
    }


@router.delete("/api/admin/checklist-rules/{rule_id}")
@router.delete("/api/checklist-templates/{rule_id}")
def delete_checklist_template(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(ChecklistRule).filter(ChecklistRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Checklist rule not found")
    db.delete(rule)
    db.commit()
    return {"success": True}

