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
    rule = None
    if payload.id:
        rule = db.query(BusinessRule).filter(BusinessRule.id == payload.id).filter(BusinessRule.is_deleted == False).first()
    if not rule:
        rule = db.query(BusinessRule).filter(BusinessRule.rule_name == payload.rule_name).filter(BusinessRule.is_deleted == False).first()
    if rule:
        rule.rule_name = payload.rule_name
        rule.rule_category = payload.rule_category
        rule.document_type = payload.document_type
        rule.priority = payload.priority
        rule.target_workflow_id = payload.target_workflow_id
        rule.conditions_json = payload.conditions_json
        rule.description = payload.description
        rule.rule_action = payload.rule_action or "WORKFLOW_ROUTE"
        rule.cancel_reason = payload.cancel_reason
        rule.is_active = payload.is_active
    else:
        rule = BusinessRule(
            rule_name=payload.rule_name,
            rule_category=payload.rule_category,
            document_type=payload.document_type,
            priority=payload.priority,
            target_workflow_id=payload.target_workflow_id,
            conditions_json=payload.conditions_json,
            description=payload.description,
            rule_action=payload.rule_action or "WORKFLOW_ROUTE",
            cancel_reason=payload.cancel_reason,
            is_active=payload.is_active
        )
        db.add(rule)

    db.commit()
    db.refresh(rule)
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

