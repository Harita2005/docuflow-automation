import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.auth import get_current_active_user, get_current_user_optional
from app.database.connection import get_db
from app.database.models import BusinessRule, Document, User, WorkflowProfile, WorkflowStepDefinition
from app.schemas import BusinessRuleSchema
from app.services.rbac_service import check_permission

logger = logging.getLogger(__name__)
router = APIRouter(tags=['Policy Matrix & Conditions'])

@router.get('/api/conditions', response_model=List[BusinessRuleSchema])
@router.get('/api/admin/conditions', response_model=List[BusinessRuleSchema])
@router.get('/api/admin/routing-rules', response_model=List[BusinessRuleSchema])
def get_business_rules(
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    if current_user and not check_permission(current_user, 'condition:read', db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Missing required permission 'condition:read'."
        )
    rules = db.query(BusinessRule).filter(BusinessRule.is_deleted == False).order_by(BusinessRule.priority.asc()).all()
    return rules

@router.post('/api/conditions', response_model=BusinessRuleSchema)
@router.post('/api/admin/conditions', response_model=BusinessRuleSchema)
@router.post('/api/admin/conditions/save', response_model=BusinessRuleSchema)
@router.post('/api/admin/routing-rules', response_model=BusinessRuleSchema)
def save_business_rule(
    payload: BusinessRuleSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if not check_permission(current_user, 'condition:write', db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Missing required permission 'condition:write'."
        )

    wf_id_val = getattr(payload, 'workflow_id', None) or payload.target_workflow_id or payload.workflow_code or ''
    target_wf_raw = str(wf_id_val).strip()
    if not target_wf_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid target workflow must be specified for the condition rule."
        )

    from sqlalchemy import or_
    wf_filters = [
        WorkflowProfile.profile_name == target_wf_raw,
        WorkflowProfile.workflow_code == target_wf_raw
    ]
    if target_wf_raw.isdigit():
        wf_filters.append(WorkflowProfile.id == int(target_wf_raw))
    if payload.workflow_code and str(payload.workflow_code).strip():
        wf_filters.append(WorkflowProfile.workflow_code == str(payload.workflow_code).strip())
    if payload.target_workflow_id and str(payload.target_workflow_id).strip():
        wf_filters.append(WorkflowProfile.profile_name == str(payload.target_workflow_id).strip())

    target_profile = db.query(WorkflowProfile).filter(
        or_(*wf_filters),
        WorkflowProfile.is_deleted == False
    ).first()

    if not target_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Target workflow '{target_wf_raw}' does not exist or has been deleted. Cannot attach conditions to invalid workflows."
        )

    target_wf = target_profile.profile_name

    try:
        rule_id = None
        if payload.id:
            try:
                if not str(payload.id).startswith('tmp-'):
                    rule_id = int(payload.id)
            except ValueError as exc:
                logger.debug('Handled exception: %s', exc)
        rule = None
        if rule_id:
            rule = db.query(BusinessRule).filter(BusinessRule.id == rule_id).filter(BusinessRule.is_deleted == False).first()
        if not rule:
            # Check by target workflow to prevent duplicate condition policies for the same workflow
            rule = db.query(BusinessRule).filter(
                (BusinessRule.target_workflow_id == target_profile.profile_name) |
                (BusinessRule.target_workflow_id == target_profile.workflow_code),
                BusinessRule.is_deleted == False
            ).first()
        if not rule:
            rule = db.query(BusinessRule).filter(BusinessRule.rule_name == payload.rule_name).filter(BusinessRule.is_deleted == False).first()
        
        # Check duplicate rule_name across other rules
        if rule:
            duplicate = db.query(BusinessRule).filter(
                BusinessRule.rule_name == payload.rule_name,
                BusinessRule.id != rule.id,
                BusinessRule.is_deleted == False
            ).first()
        else:
            duplicate = db.query(BusinessRule).filter(
                BusinessRule.rule_name == payload.rule_name,
                BusinessRule.is_deleted == False
            ).first()
        if duplicate:
            if duplicate.target_workflow_id in (target_profile.profile_name, target_profile.workflow_code):
                rule = duplicate
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A policy rule with name '{payload.rule_name}' already exists."
                )

        raw_conds = payload.conditions_json if payload.conditions_json is not None else payload.conditions
        if raw_conds is None:
            conds = '[]'
        elif isinstance(raw_conds, (list, dict)):
            import json
            conds = json.dumps(raw_conds)
        else:
            conds = str(raw_conds)

        # Backend validation for condition structure and values
        parsed_conds = None
        if isinstance(raw_conds, str):
            try:
                import json
                parsed_conds = json.loads(raw_conds)
            except Exception:
                parsed_conds = None
        else:
            parsed_conds = raw_conds

        cond_list_to_validate = []
        if isinstance(parsed_conds, dict):
            cond_list_to_validate = parsed_conds.get('conditions', [])
        elif isinstance(parsed_conds, list):
            cond_list_to_validate = parsed_conds

        for idx, c in enumerate(cond_list_to_validate):
            if not isinstance(c, dict):
                continue
            field = str(c.get('field', '')).strip()
            op = str(c.get('operator', '')).strip().lower()
            val = c.get('value')
            if not field:
                raise HTTPException(status_code=400, detail=f"Condition #{idx + 1}: Field is required.")
            if not op:
                raise HTTPException(status_code=400, detail=f"Condition #{idx + 1}: Operator is required.")
            if op in ['is empty', 'is not empty', 'empty', 'not empty']:
                pass  # No value required
            elif op in ['contains', 'does not contain', 'is one of', 'is not one of']:
                if val is None or (isinstance(val, list) and len(val) == 0) or (isinstance(val, str) and not val.strip()):
                    raise HTTPException(status_code=400, detail=f"Condition #{idx + 1} ({field}): At least one value is required for '{op}'.")
            elif op == 'between':
                if val is None or (isinstance(val, list) and len(val) < 2) or (isinstance(val, str) and not val.strip()):
                    raise HTTPException(status_code=400, detail=f"Condition #{idx + 1} ({field}): Both start/minimum and end/maximum values are required for 'Between'.")
            else:
                if val is None or (isinstance(val, str) and not val.strip()):
                    raise HTTPException(status_code=400, detail=f"Condition #{idx + 1} ({field}): Value is required.")

        if rule:
            rule.rule_name = payload.rule_name
            rule.rule_category = payload.rule_category or 'Vendor Payment Workflows'
            rule.document_type = payload.document_type or target_profile.workflow_type or 'AP INVOICE'
            rule.priority = payload.priority or 10
            rule.target_workflow_id = target_wf
            rule.conditions_json = conds
            rule.description = payload.description
            rule.rule_action = payload.rule_action or 'WORKFLOW_ROUTE'
            rule.cancel_reason = payload.cancel_reason
            rule.is_active = payload.is_active if payload.is_active is not None else True
        else:
            rule = BusinessRule(
                rule_name=payload.rule_name,
                rule_category=payload.rule_category or 'Vendor Payment Workflows',
                document_type=payload.document_type or target_profile.workflow_type or 'AP INVOICE',
                priority=payload.priority or 10,
                target_workflow_id=target_wf,
                conditions_json=conds,
                description=payload.description,
                rule_action=payload.rule_action or 'WORKFLOW_ROUTE',
                cancel_reason=payload.cancel_reason,
                is_active=payload.is_active if payload.is_active is not None else True
            )
            db.add(rule)
        db.commit()
        db.refresh(rule)
        
        try:
            from sqlalchemy import or_
            from app.services.rules_engine import evaluate_business_rules_full
            pending_docs = db.query(Document).filter(
                or_(
                    Document.status == 'Pending Approval',
                    Document.status.like('%Unrouted%'),
                    Document.workflow_profile_id.is_(None)
                ),
                Document.is_deleted == False
            ).all()
            for p_doc in pending_docs:
                rule_res = evaluate_business_rules_full(db, p_doc)
                if rule_res and rule_res.get('target_workflow_id'):
                    wf_name = rule_res['target_workflow_id']
                    rule_act = rule_res.get('rule_action', 'WORKFLOW_ROUTE')
                    p_doc.workflow_profile_id = wf_name
                    steps = db.query(WorkflowStepDefinition).filter(
                        WorkflowStepDefinition.profile_name == wf_name
                    ).order_by(WorkflowStepDefinition.stage_number.asc()).all()
                    p_doc.total_stages = len(steps) if steps else 2
                    if rule_act == 'AUTO_APPROVE':
                        p_doc.status = 'Approved'
                        p_doc.current_stage = p_doc.total_stages
                        p_doc.assigned_approver = 'System Auto-Approved'
                    elif rule_act == 'AUTO_CANCEL':
                        p_doc.status = 'Cancelled'
                        p_doc.current_stage = 1
                        p_doc.assigned_approver = 'System Auto-Cancelled'
                    else:
                        if not p_doc.current_stage or p_doc.status.startswith('Unrouted'):
                            p_doc.current_stage = 1
                        cur_stage = p_doc.current_stage or 1
                        stage_idx = max(0, min(cur_stage - 1, len(steps) - 1))
                        if steps:
                            p_doc.assigned_approver = steps[stage_idx].approver_target
                            if p_doc.status.startswith('Unrouted'):
                                p_doc.status = f'Initiated ({steps[0].step_name})'
            db.commit()
        except Exception as eval_err:
            logger.debug('Handled exception during rule re-evaluation: %s', eval_err)
            
        return rule
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        logger.error('Error saving business rule: %s', e)
        db.rollback()
        raise HTTPException(status_code=500, detail=f'Failed to save routing rule: {str(e)}')

@router.delete('/api/admin/conditions/{rule_id}')
@router.delete('/api/admin/routing-rules/{rule_id}')
def delete_business_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if not check_permission(current_user, 'condition:write', db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Missing required permission 'condition:write'."
        )
    try:
        import datetime
        r_id = int(rule_id)
        rule = db.query(BusinessRule).filter(BusinessRule.id == r_id, BusinessRule.is_deleted == False).first()
        if rule:
            rule.is_deleted = True
            rule.deleted_at = datetime.datetime.utcnow()
            db.commit()
    except Exception as e:
        logger.debug('Error deleting business rule: %s', e)
    return {'success': True, 'deleted_id': rule_id}

@router.post('/api/admin/rules/simulate')
def simulate_rule_routing(payload: dict, db: Session=Depends(get_db)):
    """
    Simulation sandbox for Policy Matrix rules.
    Takes mock document attributes (division, plant, category, amount, etc.) and optional draft rules.
    Returns the matched rule, target workflow, multi-stage approver pools, and condition trace.
    """
    from app.services.rules_engine import simulate_rule_evaluation
    try:
        amt = float(payload.get('amount') or 0.0)
    except (ValueError, TypeError) as exc:
        logger.debug('Handled exception: %s', exc)
    try:
        tax_amt = float(payload.get('tax_amount') or 0.0)
    except (ValueError, TypeError) as exc:
        logger.debug('Handled exception: %s', exc)
    mock_doc = {'division': str(payload.get('division') or 'VCC'), 'plant': str(payload.get('plant') or payload.get('branch') or 'TN-SIVAKASI'), 'category': str(payload.get('category') or 'PURCHASE'), 'document_type': str(payload.get('document_type') or 'AP INVOICE'), 'amount': amt, 'tax_amount': tax_amt, 'vendor_name': str(payload.get('vendor_name') or 'Test Vendor Enterprise'), 'cost_center': str(payload.get('cost_center') or '')}
    draft_rules = payload.get('draft_rules') or []
    return simulate_rule_evaluation(db, mock_invoice=mock_doc, draft_rules=draft_rules)

@router.post('/api/admin/rules/detect-conflicts')
@router.get('/api/admin/rules/conflicts')
def detect_conflicts_endpoint(payload: dict=None, db: Session=Depends(get_db)):
    """
    Detects duplicate condition signatures, priority ties, and shadowed rules across the Policy Matrix.
    """
    from app.services.rules_engine import detect_rule_conflicts
    custom_rules = payload.get('rules') if payload else None
    return detect_rule_conflicts(db, custom_rules=custom_rules)