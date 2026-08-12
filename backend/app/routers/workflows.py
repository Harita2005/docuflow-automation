from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import WorkflowProfile, WorkflowStepDefinition
from app.schemas import WorkflowProfileSchema

router = APIRouter(tags=["Workflow Administration"])

@router.get("/api/workflows", response_model=List[WorkflowProfileSchema])
@router.get("/api/admin/workflows", response_model=List[WorkflowProfileSchema])
def get_workflow_profiles(db: Session = Depends(get_db)):
    profiles = db.query(WorkflowProfile).order_by(WorkflowProfile.id.asc()).all()
    result = []
    for p in profiles:
        steps = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == p.profile_name
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        
        p_dict = {
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
    existing = db.query(WorkflowProfile).filter(
        WorkflowProfile.profile_name == payload.profile_name
    ).first()

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
        
        # Replace steps
        db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == payload.profile_name
        ).delete()
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
            auto_escalation=payload.auto_escalation
        )
        db.add(existing)

    for step in payload.steps:
        step_obj = WorkflowStepDefinition(
            profile_name=payload.profile_name,
            stage_number=step.stage_number,
            step_name=step.step_name,
            approver_type=step.approver_type,
            approver_target=step.approver_target,
            delegate_approver=step.delegate_approver,
            document_type=step.document_type,
            action_required=step.action_required,
            permissions=step.permissions,
            sla_hours=step.sla_hours
        )
        db.add(step_obj)

    db.commit()
    return {"success": True, "profile_name": payload.profile_name}

@router.get("/api/admin/workflows/{profile_name}", response_model=WorkflowProfileSchema)
@router.get("/api/workflows/{profile_name}", response_model=WorkflowProfileSchema)
def get_single_workflow_profile(profile_name: str, db: Session = Depends(get_db)):
    p = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == profile_name).first()
    if not p:
        raise HTTPException(status_code=404, detail="Workflow not found")
    steps = db.query(WorkflowStepDefinition).filter(
        WorkflowStepDefinition.profile_name == p.profile_name
    ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
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
        "steps": steps
    }

@router.delete("/api/admin/workflows/{profile_name}")
@router.delete("/api/workflows/{profile_name}")
def delete_workflow_profile(profile_name: str, db: Session = Depends(get_db)):
    p = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == profile_name).first()
    if not p:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == profile_name).delete()
    db.delete(p)
    db.commit()
    return {"success": True, "deleted": profile_name}
