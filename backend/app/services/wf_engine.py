import json
import re
import datetime
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session, joinedload
from app.models_wf import (
    WfRule, WfRuleCondition, WfRuleConditionValue,
    WfWorkflow, WfChecklistTemplate, WfChecklistStage, WfChecklistItem,
    WfExecutionInput, WfExecution, WfExecutionChecklist, WfMatchLog
)


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------

def normalize(value: Any) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    s = re.sub(r"\s+", " ", s)
    return s.upper()


# ---------------------------------------------------------------------------
# Operator evaluation
# ---------------------------------------------------------------------------

def evaluate_operator(operator: str, field_val: str, condition_values: List[str]) -> bool:
    op = operator.strip().lower()
    fv = normalize(field_val)
    cvs = [normalize(v) for v in condition_values]

    if op == "equals":
        return fv in cvs
    if op == "not equals":
        return fv not in cvs
    if op == "contains":
        return any(cv in fv for cv in cvs)
    if op in ("contains any of", "contains any of (or)"):
        return fv in cvs or any(cv == fv for cv in cvs)
    if op == "starts with":
        return any(fv.startswith(cv) for cv in cvs)
    if op == "ends with":
        return any(fv.endswith(cv) for cv in cvs)
    # fallback
    return fv in cvs


# ---------------------------------------------------------------------------
# Field extraction from input dict
# ---------------------------------------------------------------------------

FIELD_MAP = {
    "division":    ["division", "company", "companycode"],
    "plant":       ["plant", "branch"],
    "category":    ["category"],
    "cost_center": ["costcenter", "cost_center", "costcentre"],
}

def extract_field(input_data: Dict[str, Any], field_name: str) -> str:
    fn = field_name.strip().lower().replace(" ", "_")
    # direct match
    for key, aliases in FIELD_MAP.items():
        if fn in aliases or fn == key:
            for alias in [key] + aliases:
                for k, v in input_data.items():
                    if k.lower().replace(" ", "_") == alias:
                        return str(v) if v is not None else ""
    # fallback: try direct key lookup
    for k, v in input_data.items():
        if k.lower().replace(" ", "_") == fn:
            return str(v) if v is not None else ""
    return ""


# ---------------------------------------------------------------------------
# Core rule evaluation
# ---------------------------------------------------------------------------

def evaluate_rule(rule: WfRule, input_data: Dict[str, Any]) -> Tuple[bool, List[Dict]]:
    """
    Returns (matched: bool, condition_details: list)
    """
    conditions = sorted(
        [c for c in rule.conditions if c.is_active],
        key=lambda c: c.condition_order
    )
    if not conditions:
        return True, []

    details = []
    result = None

    for cond in conditions:
        values = [cv.value for cv in cond.values if cv.is_active]
        if not values:
            # single-value condition stored without value rows — skip
            continue

        field_val = extract_field(input_data, cond.field_name)
        matched = evaluate_operator(cond.operator, field_val, values)

        details.append({
            "field":    cond.field_name,
            "operator": cond.operator,
            "expected": values if len(values) > 1 else values[0],
            "actual":   field_val,
            "matched":  matched,
        })

        lo = cond.logical_operator.upper()
        if result is None:
            result = matched
        elif lo == "OR":
            result = result or matched
        else:
            result = result and matched

    return (result if result is not None else True), details


# ---------------------------------------------------------------------------
# Main match function
# ---------------------------------------------------------------------------

def match_workflow(db: Session, input_data: Dict[str, Any], input_id: int) -> Dict[str, Any]:
    rules = (
        db.query(WfRule)
        .options(
            joinedload(WfRule.conditions).joinedload(WfRuleCondition.values),
            joinedload(WfRule.workflow),
        )
        .filter(WfRule.is_active == True)
        .all()
    )

    matching_rules = []
    all_logs = []

    for rule in rules:
        matched, details = evaluate_rule(rule, input_data)
        matched_count = sum(1 for d in details if d["matched"])
        failed_count  = sum(1 for d in details if not d["matched"])

        log = WfMatchLog(
            input_id=input_id,
            rule_id=rule.rule_id,
            matched=matched,
            priority=rule.priority,
            matched_conditions=matched_count,
            failed_conditions=failed_count,
            evaluation_details=json.dumps(details),
            evaluated_at=datetime.datetime.utcnow(),
        )
        db.add(log)
        all_logs.append(log)

        if matched:
            matching_rules.append((rule, details, matched_count))

    db.flush()

    if not matching_rules:
        db.commit()
        return {"matched": False, "rule": None, "workflow": None,
                "message": "No active workflow rule matched the provided input."}

    # Sort: priority DESC, then condition count DESC, then rule_id ASC
    matching_rules.sort(key=lambda x: (-x[0].priority, -x[2], x[0].rule_id))
    winning_rule, winning_details, _ = matching_rules[0]
    workflow = winning_rule.workflow

    return {
        "matched":    True,
        "rule":       winning_rule,
        "workflow":   workflow,
        "conditions": winning_details,
    }


# ---------------------------------------------------------------------------
# Create execution + checklist rows (transactional)
# ---------------------------------------------------------------------------

def create_execution(db: Session, input_id: int, rule: WfRule, workflow: WfWorkflow) -> WfExecution:
    template = (
        db.query(WfChecklistTemplate)
        .filter(WfChecklistTemplate.workflow_id == workflow.workflow_id,
                WfChecklistTemplate.is_active == True)
        .first()
    )

    first_stage_id = None
    checklist_rows = []

    if template:
        stages = sorted(template.stages, key=lambda s: s.stage_order)
        if stages:
            first_stage_id = stages[0].stage_id
        for stage in stages:
            for item in sorted(stage.items, key=lambda i: i.item_order):
                checklist_rows.append(WfExecutionChecklist(
                    checklist_item_id=item.checklist_item_id,
                    status="PENDING",
                ))

    execution = WfExecution(
        workflow_id=workflow.workflow_id,
        rule_id=rule.rule_id,
        input_id=input_id,
        status="IN_PROGRESS",
        current_stage_id=first_stage_id,
        started_at=datetime.datetime.utcnow(),
    )
    db.add(execution)
    db.flush()

    for row in checklist_rows:
        row.execution_id = execution.execution_id
        db.add(row)

    db.commit()
    db.refresh(execution)
    return execution


# ---------------------------------------------------------------------------
# Retrieve checklist for an execution
# ---------------------------------------------------------------------------

def get_execution_checklist(db: Session, execution_id: int) -> Dict[str, Any]:
    execution = (
        db.query(WfExecution)
        .options(
            joinedload(WfExecution.workflow),
            joinedload(WfExecution.checklist).joinedload(WfExecutionChecklist.checklist_item)
                .joinedload(WfChecklistItem.stage),
        )
        .filter(WfExecution.execution_id == execution_id)
        .first()
    )
    if not execution:
        return None

    # Group by stage
    stages_map: Dict[int, Dict] = {}
    for ec in execution.checklist:
        item  = ec.checklist_item
        stage = item.stage
        if stage.stage_id not in stages_map:
            stages_map[stage.stage_id] = {
                "stageId":    stage.stage_id,
                "stageName":  stage.stage_name,
                "stageOrder": stage.stage_order,
                "items":      [],
            }
        stages_map[stage.stage_id]["items"].append({
            "executionChecklistId": ec.execution_checklist_id,
            "checklistItemId":      item.checklist_item_id,
            "itemName":             item.item_name,
            "sequence":             item.item_order,
            "status":               ec.status,
            "remarks":              ec.remarks,
            "completedAt":          ec.completed_at.isoformat() if ec.completed_at else None,
        })

    stages = sorted(stages_map.values(), key=lambda s: s["stageOrder"])
    for s in stages:
        s["items"].sort(key=lambda i: i["sequence"])

    return {
        "executionId": execution.execution_id,
        "workflow":    execution.workflow.workflow_name,
        "status":      execution.status,
        "stages":      stages,
    }
