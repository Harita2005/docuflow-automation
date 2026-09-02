import datetime
import json
import re
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import WorkflowProfile, WorkflowStepDefinition, BusinessRule, ChecklistTemplate, ChecklistRule
from app.schemas import WorkflowProfileSchema, WorkflowStepSchema

router = APIRouter(tags=["Workflow Administration"])

def format_step_with_checklist(db: Session, step: WorkflowStepDefinition, profile_name: str) -> dict:
    items: List[str] = []
    if step.checklist_json:
        try:
            parsed = json.loads(step.checklist_json)
            if isinstance(parsed, list):
                items = [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            items = []
    
    if not items:
        # Fallback to ChecklistTemplate
        tpls = db.query(ChecklistTemplate).filter(
            ChecklistTemplate.workflow_profile == profile_name,
            ChecklistTemplate.stage_name.ilike(step.step_name.strip()),
            ChecklistTemplate.is_active == True
        ).order_by(ChecklistTemplate.sequence_order.asc()).all()
        for t in tpls:
            if "," in t.item_text:
                for sub in t.item_text.split(","):
                    c = sub.strip()
                    if c and c not in items:
                        items.append(c)
            else:
                c = t.item_text.strip()
                if c and c not in items:
                    items.append(c)

    if not items:
        from app.routers.sync import generate_compliance_checklist_for_category
        wf = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == profile_name).first()
        items = generate_compliance_checklist_for_category(
            wf.workflow_category if wf else None,
            wf.workflow_type if wf else None
        )

    return {
        "stage_number": step.stage_number,
        "step_name": step.step_name,
        "approver_type": step.approver_type,
        "approver_target": step.approver_target,
        "delegate_approver": step.delegate_approver,
        "document_type": step.document_type,
        "action_required": step.action_required,
        "permissions": step.permissions,
        "sla_hours": step.sla_hours,
        "checklist_items": items,
        "checklist_json": json.dumps(items)
    }

from collections import defaultdict

def ensure_workflow_code(p: WorkflowProfile, db: Session = None) -> str:
    """Ensures every workflow profile has a standardized WF-XXX numeric code (e.g. WF-837)."""
    if p.workflow_code and str(p.workflow_code).strip() and re.match(r'^WF-\d{3,5}$', str(p.workflow_code).strip()):
        return str(p.workflow_code).strip()
    code_id = p.id if p.id else abs(hash(p.profile_name or "WF"))
    code = f"WF-{(code_id * 13 + 107) % 900 + 100}"
    p.workflow_code = code
    if db:
        try: db.commit()
        except Exception: db.rollback()
    return code

@router.get("/api/workflows", response_model=List[WorkflowProfileSchema])
@router.get("/api/admin/workflows", response_model=List[WorkflowProfileSchema])
def get_all_workflow_profiles(db: Session = Depends(get_db)):
    profiles = db.query(WorkflowProfile).filter(WorkflowProfile.is_deleted == False).order_by(WorkflowProfile.created_at.desc()).all()
    if not profiles:
        return []

    # 2. Fetch all steps in 1 query and group by profile_name
    all_steps = db.query(WorkflowStepDefinition).order_by(WorkflowStepDefinition.stage_number.asc()).all()
    steps_by_profile = defaultdict(list)
    for st in all_steps:
        if st.profile_name:
            steps_by_profile[st.profile_name].append(st)

    # 3. Fetch all active checklist templates in 1 query and group by (profile, stage_name)
    all_tpls = db.query(ChecklistTemplate).filter(ChecklistTemplate.is_active == True).order_by(ChecklistTemplate.sequence_order.asc()).all()
    tpls_by_profile_stage = defaultdict(list)
    for t in all_tpls:
        key = ((t.workflow_profile or "").strip().lower(), (t.stage_name or "").strip().lower())
        tpls_by_profile_stage[key].append(t)

    result = []
    for p in profiles:
        wf_code = ensure_workflow_code(p, db)
        raw_steps = steps_by_profile.get(p.profile_name, [])
        steps = []
        for st in raw_steps:
            items: List[str] = []
            if st.checklist_json:
                try:
                    parsed = json.loads(st.checklist_json)
                    if isinstance(parsed, list):
                        items = [str(x).strip() for x in parsed if str(x).strip()]
                except Exception:
                    items = []
            
            if not items:
                tpl_key = ((p.profile_name or "").strip().lower(), (st.step_name or "").strip().lower())
                tpls = tpls_by_profile_stage.get(tpl_key, [])
                for t in tpls:
                    if "," in t.item_text:
                        for sub in t.item_text.split(","):
                            c = sub.strip()
                            if c and c not in items:
                                items.append(c)
                    else:
                        c = t.item_text.strip()
                        if c and c not in items:
                            items.append(c)

            steps.append({
                "stage_number": st.stage_number,
                "step_name": st.step_name,
                "approver_type": st.approver_type,
                "approver_target": st.approver_target,
                "delegate_approver": st.delegate_approver,
                "document_type": st.document_type,
                "action_required": st.action_required,
                "permissions": st.permissions,
                "sla_hours": st.sla_hours,
                "checklist_items": items,
                "checklist_json": json.dumps(items)
            })

        p_dict = {
            "profile_name": p.profile_name,
            "workflow_code": wf_code,
            "workflow_category": p.workflow_category,
            "workflow_type": p.workflow_type,
            "description": p.description,
            "status": p.status,
            "approval_threshold": p.approval_threshold,
            "rejection_handling": p.rejection_handling,
            "reminder_interval_hours": p.reminder_interval_hours,
            "escalation_after_hours": p.escalation_after_hours,
            "auto_escalation": p.auto_escalation,
            "rule_action": p.rule_action or "WORKFLOW_ROUTE",
            "cancel_reason": p.cancel_reason,
            "auto_approve_enabled": bool(p.auto_approve_enabled),
            "auto_approve_condition": p.auto_approve_condition,
            "auto_cancel_enabled": bool(p.auto_cancel_enabled),
            "auto_cancel_condition": p.auto_cancel_condition,
            "steps": steps
        }
        result.append(p_dict)
    return result

@router.get("/api/admin/workflow-steps")
def get_workflow_steps(db: Session = Depends(get_db)):
    steps = db.query(WorkflowStepDefinition).order_by(WorkflowStepDefinition.profile_name.asc(), WorkflowStepDefinition.stage_number.asc()).all()
    return steps

@router.post("/api/admin/workflows")
@router.post("/api/admin/workflows/save")
def save_workflow_profile(payload: WorkflowProfileSchema, db: Session = Depends(get_db)):
    try:
        existing = db.query(WorkflowProfile).filter(
            WorkflowProfile.profile_name == payload.profile_name
        ).filter(WorkflowProfile.is_deleted == False).first()

        if existing:
            existing.workflow_code = payload.workflow_code
            existing.workflow_category = payload.workflow_category
            existing.workflow_type = payload.workflow_type
            existing.description = payload.description
            existing.status = payload.status
            existing.approval_threshold = payload.approval_threshold
            existing.rejection_handling = payload.rejection_handling
            existing.reminder_interval_hours = payload.reminder_interval_hours
            existing.escalation_after_hours = payload.escalation_after_hours
            existing.auto_escalation = payload.auto_escalation
            existing.rule_action = payload.rule_action or "WORKFLOW_ROUTE"
            existing.cancel_reason = payload.cancel_reason
            existing.auto_approve_enabled = payload.auto_approve_enabled or False
            existing.auto_approve_condition = payload.auto_approve_condition
            existing.auto_cancel_enabled = payload.auto_cancel_enabled or False
            existing.auto_cancel_condition = payload.auto_cancel_condition
            db.flush()
            
            # Replace existing steps
            db.query(WorkflowStepDefinition).filter(
                WorkflowStepDefinition.profile_name == payload.profile_name
            ).delete(synchronize_session='fetch')
        else:
            existing = WorkflowProfile(
                profile_name=payload.profile_name,
                workflow_code=payload.workflow_code,
                workflow_category=payload.workflow_category,
                workflow_type=payload.workflow_type,
                description=payload.description,
                status=payload.status,
                approval_threshold=payload.approval_threshold,
                rejection_handling=payload.rejection_handling,
                reminder_interval_hours=payload.reminder_interval_hours,
                escalation_after_hours=payload.escalation_after_hours,
                auto_escalation=payload.auto_escalation,
                rule_action=payload.rule_action or "WORKFLOW_ROUTE",
                cancel_reason=payload.cancel_reason,
                auto_approve_enabled=payload.auto_approve_enabled or False,
                auto_approve_condition=payload.auto_approve_condition,
                auto_cancel_enabled=payload.auto_cancel_enabled or False,
                auto_cancel_condition=payload.auto_cancel_condition
            )
            db.add(existing)
            db.flush()

        # Clean old ChecklistTemplate entries for this workflow
        db.query(ChecklistTemplate).filter(
            ChecklistTemplate.workflow_profile == payload.profile_name
        ).delete(synchronize_session='fetch')

        for step in payload.steps:
            new_step = WorkflowStepDefinition(
                profile_name=payload.profile_name,
                stage_number=step.stage_number,
                step_name=step.step_name,
                approver_type=step.approver_type,
                approver_target=step.approver_target,
                delegate_approver=step.delegate_approver,
                document_type=step.document_type,
                action_required=step.action_required,
                permissions=step.permissions,
                sla_hours=step.sla_hours,
                checklist_json=json.dumps(step.checklist_items) if step.checklist_items else None
            )
            db.add(new_step)

            # Populate ChecklistTemplate table for backwards compatibility
            if step.checklist_items:
                for item_text in step.checklist_items:
                    chk = ChecklistTemplate(
                        workflow_profile=payload.profile_name,
                        stage_name=step.step_name or f"Stage {step.stage_number}",
                        item_text=item_text,
                        is_mandatory=True
                    )
                    db.add(chk)

        db.commit()
        db.refresh(existing)
        wf_code = ensure_workflow_code(existing, db)
        return {"success": True, "profile_name": payload.profile_name, "workflow_code": wf_code}
    except Exception as e:
        db.rollback()
        print(f"[Workflow Save Error] Failed to save workflow '{payload.profile_name}': {e}")
        raise HTTPException(status_code=500, detail=f"Database error while saving workflow: {str(e)}")


@router.get("/api/admin/workflows/{profile_name}", response_model=WorkflowProfileSchema)
@router.get("/api/workflows/{profile_name}", response_model=WorkflowProfileSchema)
def get_single_workflow_profile(profile_name: str, db: Session = Depends(get_db)):
    p = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == profile_name).filter(WorkflowProfile.is_deleted == False).first()
    if not p:
        raise HTTPException(status_code=404, detail="Workflow not found")
    raw_steps = db.query(WorkflowStepDefinition).filter(
        WorkflowStepDefinition.profile_name == p.profile_name
    ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
    
    steps = [format_step_with_checklist(db, st, p.profile_name) for st in raw_steps]
    return {
        "profile_name": p.profile_name,
        "workflow_code": p.workflow_code,
        "workflow_category": p.workflow_category,
        "workflow_type": p.workflow_type,
        "description": p.description,
        "status": p.status,
        "approval_threshold": p.approval_threshold,
        "rejection_handling": p.rejection_handling,
        "reminder_interval_hours": p.reminder_interval_hours,
        "escalation_after_hours": p.escalation_after_hours,
        "auto_escalation": p.auto_escalation,
        "rule_action": p.rule_action or "WORKFLOW_ROUTE",
        "cancel_reason": p.cancel_reason,
        "auto_approve_enabled": bool(p.auto_approve_enabled),
        "auto_approve_condition": p.auto_approve_condition,
        "auto_cancel_enabled": bool(p.auto_cancel_enabled),
        "auto_cancel_condition": p.auto_cancel_condition,
        "steps": steps
    }

@router.delete("/api/admin/categories/{category_name}")
@router.delete("/api/categories/{category_name}")
def delete_category_endpoint(category_name: str, db: Session = Depends(get_db)):
    import urllib.parse
    raw_name = category_name.strip()
    decoded = urllib.parse.unquote(raw_name)
    
    # Find all workflow profiles in this category
    profiles = db.query(WorkflowProfile).filter(
        (WorkflowProfile.workflow_category == raw_name) |
        (WorkflowProfile.workflow_category == decoded) |
        (WorkflowProfile.workflow_category.ilike(raw_name)) |
        (WorkflowProfile.workflow_category.ilike(decoded))
    ).filter(WorkflowProfile.is_deleted == False).all()
    
    for p in profiles:
        p.is_deleted = True
        p.deleted_at = datetime.datetime.utcnow()
        db.query(BusinessRule).filter(BusinessRule.target_workflow_id == p.profile_name).update({
            "is_deleted": True,
            "deleted_at": datetime.datetime.utcnow()
        }, synchronize_session='fetch')
        
    db.query(BusinessRule).filter(
        (BusinessRule.rule_category == raw_name) |
        (BusinessRule.rule_category == decoded) |
        (BusinessRule.rule_category.ilike(raw_name)) |
        (BusinessRule.rule_category.ilike(decoded))
    ).update({
        "is_deleted": True,
        "deleted_at": datetime.datetime.utcnow()
    }, synchronize_session='fetch')
    
    db.commit()
    return {"success": True, "category": decoded, "deleted_workflows": len(profiles)}

@router.delete("/api/admin/workflows/{profile_name}")
@router.delete("/api/workflows/{profile_name}")
def delete_workflow_profile(profile_name: str, db: Session = Depends(get_db)):
    import urllib.parse
    raw_name = profile_name.strip()
    decoded = urllib.parse.unquote(raw_name)
    
    p = db.query(WorkflowProfile).filter(
        (WorkflowProfile.profile_name == raw_name) |
        (WorkflowProfile.profile_name == decoded) |
        (WorkflowProfile.profile_name.ilike(raw_name)) |
        (WorkflowProfile.profile_name.ilike(decoded))
    ).filter(WorkflowProfile.is_deleted == False).first()
    
    if not p:
        raise HTTPException(status_code=404, detail=f"Workflow '{profile_name}' not found")
    
    p.is_deleted = True
    p.deleted_at = datetime.datetime.utcnow()
    db.query(BusinessRule).filter(BusinessRule.target_workflow_id == p.profile_name).update({
        "is_deleted": True,
        "deleted_at": datetime.datetime.utcnow()
    }, synchronize_session='fetch')
    db.commit()
    return {"success": True, "deleted": p.profile_name}

@router.post("/api/admin/workflow-steps")
def save_workflow_step(payload: dict, db: Session = Depends(get_db)):
    step_id = payload.get("id")
    profile_name = payload.get("profile_name")
    
    if not profile_name:
        wf_code = payload.get("workflow_code") or payload.get("workflow_id")
        if wf_code:
            prof = db.query(WorkflowProfile).filter(
                (WorkflowProfile.workflow_code == str(wf_code)) | (WorkflowProfile.profile_name == str(wf_code))
            ).first()
            if prof:
                profile_name = prof.profile_name
        if not profile_name:
            first_prof = db.query(WorkflowProfile).first()
            if first_prof:
                profile_name = first_prof.profile_name
            else:
                profile_name = "DEFAULT_WORKFLOW"
        
    step_obj = None
    if step_id and not str(step_id).startswith("tmp-"):
        try:
            int_id = int(step_id)
            step_obj = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.id == int_id).first()
        except ValueError:
            pass
            
    if not step_obj:
        step_obj = WorkflowStepDefinition(profile_name=profile_name)
        db.add(step_obj)
        
    step_obj.profile_name = profile_name
    step_obj.stage_number = int(payload.get("stage_number") or payload.get("step_order") or 1)
    step_obj.step_name = payload.get("step_name") or "New Step"
    step_obj.approver_type = payload.get("approver_type") or payload.get("role") or "Approval Pool"
    step_obj.approver_target = payload.get("approver_target") or payload.get("approver")
    step_obj.delegate_approver = payload.get("delegate_approver")
    step_obj.document_type = payload.get("document_type") or "AP INVOICE"
    step_obj.action_required = payload.get("action_required") or "Approve"
    step_obj.permissions = payload.get("permissions") or "Approve / Reject"
    step_obj.sla_hours = int(payload.get("sla_hours") or 48)
    
    db.commit()
    db.refresh(step_obj)
    return {"success": True, "step": step_obj}

@router.delete("/api/admin/workflow-steps/{step_id}")
def delete_workflow_step(step_id: int, db: Session = Depends(get_db)):
    step = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.id == step_id).first()
    if not step:
        raise HTTPException(status_code=404, detail="Workflow step not found")
    db.delete(step)
    db.commit()
    return {"success": True, "deleted_id": step_id}

@router.post("/api/admin/publish")
def publish_configurations(payload: dict, db: Session = Depends(get_db)):
    from app.models import AuditLog, SystemLog
    changes = payload.get("changes") or 0
    
    db.add(AuditLog(
        invoice_id=None,
        user="Administrator",
        action="Config Published",
        stage="All Rules & Steps",
        notes=f"Successfully published {changes} policy drafts to production."
    ))
    db.add(SystemLog(
        invoice_id=None,
        action="Publish Drafts",
        user="Admin Engine",
        details=f"System configurations updated. Published {changes} items."
    ))
    db.commit()
    return {"success": True, "message": f"Successfully published {changes} config changes."}


