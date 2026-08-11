import json
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.models import BusinessRule, WorkflowProfile, WorkflowStepDefinition, Invoice

def evaluate_single_condition(cond: Dict[str, Any], invoice: Invoice) -> bool:
    field = cond.get("field", "").strip()
    operator = cond.get("operator", "equals").strip().lower()
    val = cond.get("value", "")

    # Map condition field names to Invoice attributes
    field_mapping = {
        "Division": invoice.division or "",
        "Company": invoice.division or "",
        "Plant": invoice.plant or "",
        "Branch": invoice.plant or "",
        "Category": invoice.category or invoice.document_type or "",
        "Cost Center": invoice.cost_center or "",
        "Vendor Name": invoice.vendor_name or "",
        "Vendor Type": "Standard",
        "Document Type": invoice.document_type or "AP INVOICE",
        "Invoice Amount (Total)": float(invoice.amount or 0.0),
        "Amount": float(invoice.amount or 0.0),
        "Tax Amount": float(invoice.tax_amount or 0.0),
    }

    field_val = field_mapping.get(field)
    if field_val is None:
        # Check custom_data if present
        if invoice.custom_data:
            try:
                custom_dict = json.loads(invoice.custom_data) if isinstance(invoice.custom_data, str) else invoice.custom_data
                field_val = custom_dict.get(field, "")
            except Exception:
                field_val = ""
        else:
            field_val = ""

    # Numeric evaluation
    if isinstance(field_val, (int, float)) or "amount" in field.lower():
        try:
            num_field = float(field_val or 0.0)
            num_val = float(val or 0.0)
            if "greater" in operator or ">" in operator:
                return num_field > num_val
            if "less" in operator or "<" in operator:
                return num_field < num_val
            return abs(num_field - num_val) < 0.01
        except Exception:
            return False

    # String evaluation
    str_field = str(field_val or "").strip().lower()
    str_val = str(val or "").strip().lower()

    if operator in ["equals", "==", "="]:
        if "," in str_val:
            items = [s.strip() for s in str_val.split(",") if s.strip()]
            return str_field in items
        return str_field == str_val

    if operator in ["not equals", "!=", "!=="]:
        if "," in str_val:
            items = [s.strip() for s in str_val.split(",") if s.strip()]
            return str_field not in items
        return str_field != str_val

    if operator in ["contains any of", "contains any of (or)"]:
        items = [s.strip() for s in str_val.split(",") if s.strip()]
        return any(item in str_field or str_field == item for item in items)

    if operator in ["contains"]:
        return str_val in str_field

    return True

def evaluate_rule_conditions(conditions: List[Dict[str, Any]], invoice: Invoice) -> bool:
    if not conditions:
        return True

    # If first condition is wrapped inside a dict with 'conditions' array
    if isinstance(conditions, dict) and "conditions" in conditions:
        conditions = conditions["conditions"]

    if not isinstance(conditions, list) or len(conditions) == 0:
        return True

    is_match = True
    for idx, cond in enumerate(conditions):
        matched = evaluate_single_condition(cond, invoice)
        logical_op = cond.get("logicalOperator", "AND").upper()
        if idx == 0:
            is_match = matched
        else:
            if logical_op == "OR":
                is_match = is_match or matched
            else:
                is_match = is_match and matched

    return is_match

def evaluate_business_rules(db: Session, invoice: Invoice) -> Optional[str]:
    rules = db.query(BusinessRule).filter(BusinessRule.is_active == True).order_by(BusinessRule.priority.asc()).all()

    for rule in rules:
        if not rule.conditions_json:
            continue

        try:
            conds = json.loads(rule.conditions_json)
            if isinstance(conds, dict) and "conditions" in conds:
                conds = conds["conditions"]
            
            if evaluate_rule_conditions(conds, invoice):
                return rule.target_workflow_id
        except Exception as e:
            print(f"[RulesEngine] Error evaluating rule {rule.rule_name}: {e}")

    return None
