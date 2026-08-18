import json
import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models_wf import WfExecutionInput, WfExecutionChecklist
from app.services.wf_engine import match_workflow, create_execution, get_execution_checklist

router = APIRouter(prefix="/api/workflow", tags=["Workflow Engine"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MatchRequest(BaseModel):
    sourceRecordId: Optional[str] = None
    sourceSystem:   Optional[str] = "EXTERNAL_APP"
    division:       Optional[str] = None
    plant:          Optional[str] = None
    category:       Optional[str] = None
    costCenter:     Optional[str] = None


class ChecklistUpdateRequest(BaseModel):
    status:  str
    remarks: Optional[str] = None


# ---------------------------------------------------------------------------
# POST /api/workflow/match
# ---------------------------------------------------------------------------

@router.post("/match")
def workflow_match(payload: MatchRequest, db: Session = Depends(get_db)):
    input_data = {
        "division":    payload.division,
        "plant":       payload.plant,
        "category":    payload.category,
        "cost_center": payload.costCenter,
    }

    # Save input record
    inp = WfExecutionInput(
        source_system=payload.sourceSystem,
        external_record_id=payload.sourceRecordId,
        division=payload.division,
        plant=payload.plant,
        category=payload.category,
        cost_center=payload.costCenter,
        raw_payload=json.dumps(payload.model_dump()),
        received_at=datetime.datetime.utcnow(),
    )
    db.add(inp)
    db.flush()

    result = match_workflow(db, input_data, inp.input_id)

    if not result["matched"]:
        return {
            "matched":  False,
            "rule":     None,
            "workflow": None,
            "inputId":  inp.input_id,
            "message":  result["message"],
        }

    rule     = result["rule"]
    workflow = result["workflow"]

    # Create execution transactionally
    execution = create_execution(db, inp.input_id, rule, workflow)

    return {
        "matched": True,
        "inputId": inp.input_id,
        "rule": {
            "ruleId":   rule.rule_id,
            "ruleName": rule.rule_name,
            "priority": rule.priority,
        },
        "workflow": {
            "workflowId":   workflow.workflow_id,
            "workflowName": workflow.workflow_name,
            "workflowCode": workflow.workflow_code,
        },
        "execution": {
            "executionId": execution.execution_id,
            "status":      execution.status,
        },
        "conditions": result["conditions"],
    }


# ---------------------------------------------------------------------------
# GET /api/workflow/execution/{executionId}/checklist
# ---------------------------------------------------------------------------

@router.get("/execution/{execution_id}/checklist")
def get_checklist(execution_id: int, db: Session = Depends(get_db)):
    data = get_execution_checklist(db, execution_id)
    if not data:
        raise HTTPException(status_code=404, detail="Execution not found")
    return data


# ---------------------------------------------------------------------------
# PATCH /api/workflow/execution/checklist/{executionChecklistId}
# ---------------------------------------------------------------------------

@router.patch("/execution/checklist/{execution_checklist_id}")
def update_checklist_item(
    execution_checklist_id: int,
    payload: ChecklistUpdateRequest,
    db: Session = Depends(get_db),
):
    valid_statuses = {"PENDING", "COMPLETED", "REJECTED", "NOT_APPLICABLE"}
    if payload.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid_statuses}")

    ec = db.query(WfExecutionChecklist).filter(
        WfExecutionChecklist.execution_checklist_id == execution_checklist_id
    ).first()
    if not ec:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    ec.status  = payload.status
    ec.remarks = payload.remarks
    if payload.status == "COMPLETED":
        ec.completed_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(ec)

    return {
        "executionChecklistId": ec.execution_checklist_id,
        "status":               ec.status,
        "remarks":              ec.remarks,
        "completedAt":          ec.completed_at.isoformat() if ec.completed_at else None,
    }


# ---------------------------------------------------------------------------
# GET /api/workflow/execution/{executionId}  (summary)
# ---------------------------------------------------------------------------

@router.get("/execution/{execution_id}")
def get_execution(execution_id: int, db: Session = Depends(get_db)):
    data = get_execution_checklist(db, execution_id)
    if not data:
        raise HTTPException(status_code=404, detail="Execution not found")
    return data
