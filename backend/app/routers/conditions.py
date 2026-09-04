import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import BusinessRule
from app.schemas import BusinessRuleSchema

router = APIRouter(tags=["Policy Matrix & Conditions"])

@router.get("/api/admin/conditions", response_model=List[BusinessRuleSchema])
@router.get("/api/admin/routing-rules", response_model=List[BusinessRuleSchema])
def get_business_rules(db: Session = Depends(get_db)):
    rules = db.query(BusinessRule).filter(BusinessRule.is_deleted == False).order_by(BusinessRule.priority.asc()).all()
    return rules

@router.post("/api/admin/conditions")
@router.post("/api/admin/conditions/save")
@router.post("/api/admin/routing-rules")
def save_business_rule(payload: BusinessRuleSchema, db: Session = Depends(get_db)):
    rule_id = None
    if payload.id:
        try:
            if not str(payload.id).startswith("tmp-"):
                rule_id = int(payload.id)
        except ValueError:
            pass

    rule = None
    if rule_id:
        rule = db.query(BusinessRule).filter(BusinessRule.id == rule_id).filter(BusinessRule.is_deleted == False).first()
    if not rule:
        rule = db.query(BusinessRule).filter(BusinessRule.rule_name == payload.rule_name).filter(BusinessRule.is_deleted == False).first()

    target_wf = payload.target_workflow_id or payload.workflow_code or ""
    conds = payload.conditions_json or "[]"

    if rule:
        rule.rule_name = payload.rule_name
        rule.rule_category = payload.rule_category or "Vendor Payment Workflows"
        rule.document_type = payload.document_type or "AP INVOICE"
        rule.priority = payload.priority or 10
        rule.target_workflow_id = target_wf
        rule.conditions_json = conds
        rule.description = payload.description
        rule.rule_action = payload.rule_action or "WORKFLOW_ROUTE"
        rule.cancel_reason = payload.cancel_reason
        rule.is_active = payload.is_active if payload.is_active is not None else True
    else:
        rule = BusinessRule(
            rule_name=payload.rule_name,
            rule_category=payload.rule_category or "Vendor Payment Workflows",
            document_type=payload.document_type or "AP INVOICE",
            priority=payload.priority or 10,
            target_workflow_id=target_wf,
            conditions_json=conds,
            description=payload.description,
            rule_action=payload.rule_action or "WORKFLOW_ROUTE",
            cancel_reason=payload.cancel_reason,
            is_active=payload.is_active if payload.is_active is not None else True
        )
        db.add(rule)

    db.commit()
    db.refresh(rule)

    # Re-evaluate all pending unapproved documents against updated rules
    try:
        from app.models import Document, WorkflowStepDefinition
        from app.services.rules_engine import evaluate_business_rules_full

        pending_docs = db.query(Document).filter(Document.status == "Pending Approval", Document.is_deleted == False).all()
        for p_doc in pending_docs:
            rule_res = evaluate_business_rules_full(db, p_doc)
            if rule_res and rule_res.get("target_workflow_id"):
                wf_name = rule_res["target_workflow_id"]
                p_doc.workflow_profile_id = wf_name
                steps = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).order_by(WorkflowStepDefinition.stage_number.asc()).all()
                p_doc.total_stages = len(steps) if steps else 2
                if steps:
                    cur_stage = p_doc.current_stage or 1
                    stage_idx = max(0, min(cur_stage - 1, len(steps) - 1))
                    p_doc.assigned_approver = steps[stage_idx].approver_target
        db.commit()
    except Exception as eval_err:
        print("[Conditions Router] Notice during pending doc re-evaluation:", eval_err)

    return rule
@router.delete("/api/admin/conditions/{rule_id}")
@router.delete("/api/admin/routing-rules/{rule_id}")
def delete_business_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(BusinessRule).filter(BusinessRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"success": True, "deleted_id": rule_id}
@router.post("/api/admin/rules/simulate")
def simulate_rule_routing(payload: dict, db: Session = Depends(get_db)):
    """
    Simulation sandbox for Policy Matrix rules.
    Takes mock document attributes (division, plant, category, amount, etc.) and optional draft rules.
    Returns the matched rule, target workflow, multi-stage approver pools, and condition trace.
    """
    from app.services.rules_engine import simulate_rule_evaluation    
    mock_doc = {
        "division": payload.get("division") or "VCC",
        "plant": payload.get("plant") or payload.get("branch") or "TN-SIVAKASI",
        "category": payload.get("category") or "PURCHASE",
        "document_type": payload.get("document_type") or "AP INVOICE",
        "amount": float(payload.get("amount") or 0.0),
        "tax_amount": float(payload.get("tax_amount") or 0.0),
        "vendor_name": payload.get("vendor_name") or "Test Vendor Enterprise",
        "cost_center": payload.get("cost_center") or ""
    }    
    draft_rules = payload.get("draft_rules") or []
    return simulate_rule_evaluation(db, mock_invoice=mock_doc, draft_rules=draft_rules)
@router.post("/api/admin/rules/detect-conflicts")
@router.get("/api/admin/rules/conflicts")
def detect_conflicts_endpoint(payload: dict = None, db: Session = Depends(get_db)):
    """
    Detects duplicate condition signatures, priority ties, and shadowed rules across the Policy Matrix.
    """
    from app.services.rules_engine import detect_rule_conflicts
    custom_rules = payload.get("rules") if payload else None
    return detect_rule_conflicts(db, custom_rules=custom_rules)

