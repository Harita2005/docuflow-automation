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
    rules = db.query(BusinessRule).order_by(BusinessRule.priority.asc()).all()
    return rules

@router.post("/api/admin/conditions")
@router.post("/api/admin/conditions/save")
@router.post("/api/admin/routing-rules")
def save_business_rule(payload: BusinessRuleSchema, db: Session = Depends(get_db)):
    rule = None
    if payload.id:
        rule = db.query(BusinessRule).filter(BusinessRule.id == payload.id).first()
    if not rule:
        rule = db.query(BusinessRule).filter(BusinessRule.rule_name == payload.rule_name).first()

    if rule:
        rule.rule_name = payload.rule_name
        rule.rule_category = payload.rule_category
        rule.document_type = payload.document_type
        rule.priority = payload.priority
        rule.target_workflow_id = payload.target_workflow_id
        rule.conditions_json = payload.conditions_json
        rule.description = payload.description
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
            is_active=payload.is_active
        )
        db.add(rule)

    db.commit()
    db.refresh(rule)
    return rule

@router.delete("/{rule_id}")
def delete_business_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(BusinessRule).filter(BusinessRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
    return {"success": True, "deleted_id": rule_id}
