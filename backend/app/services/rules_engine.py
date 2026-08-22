import json
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.models import BusinessRule, WorkflowProfile, WorkflowStepDefinition, Invoice

def infer_document_type(category: str = "", trans_type: str = "", wf_name: str = "", doc_type: str = "") -> str:
    if doc_type and doc_type.upper() not in ["AP INVOICE", ""]:
        return doc_type
    n = f"{category} {trans_type} {wf_name}".upper()
    if "EVOUCHER" in n or "E-VOUCHER" in n or "E_VOUCHER" in n:
        return "E-VOUCHER"
    elif "ASSET" in n or "CAPEX" in n or "MACHINERY" in n or "MACHINE" in n:
        return "CAPEX / FIXED ASSET"
    elif "GRN" in n or "STOCK" in n or "GOODS" in n:
        return "GRN / GOODS RECEIPT"
    elif "CASHFLOW" in n or "CASH_FLOW" in n or "PETTY" in n or "CASH FLOW" in n:
        return "CASH VOUCHER"
    elif "FREIGHT" in n or "TRANSPORT" in n or "COURIER" in n or "POSTAGE" in n:
        return "FREIGHT & LOGISTICS"
    elif "RENT" in n or "EB" in n or "ELECTRICITY" in n or "POWER" in n:
        return "UTILITY & RENT"
    elif "TRAVEL" in n or "WELFARE" in n or "INCENTIVE" in n or "SALARY" in n:
        return "STAFF & HR EXPENSE"
    elif "PURCHASE" in n or "PO_" in n:
        return "PURCHASE INVOICE"
    elif "MAINTENANCE" in n or "REPAIRS" in n or "SERVICE" in n:
        return "SERVICE & MAINTENANCE"
    elif "ADVANCE" in n:
        return "ADVANCE VOUCHER"
    elif "JRNL" in n or "JOURNAL" in n:
        return "JOURNAL VOUCHER"
    return doc_type or "PURCHASE INVOICE"

def get_doc_type_prefix(doc_type: str = "", category: str = "", trans_type: str = "", wf_name: str = "") -> str:
    combined = f"{doc_type or ''} {category or ''} {trans_type or ''} {wf_name or ''}".strip().upper()
    if "CASH VOUCHER" in combined or "CASH" in combined or "PETTY" in combined:
        return "CV"
    elif "E-VOUCHER" in combined or "EVOUCHER" in combined:
        return "EV"
    elif "JOURNAL" in combined or "JRNL" in combined:
        return "JV"
    elif "ADVANCE" in combined:
        return "ADV"
    elif "CAPEX" in combined or "FIXED ASSET" in combined or "ASSET" in combined or "MACHINERY" in combined:
        return "CAPEX"
    elif "GRN" in combined or "GOODS" in combined:
        return "GRN"
    elif "SERVICE" in combined or "MAINTENANCE" in combined or "REPAIR" in combined:
        return "SRV"
    elif "FREIGHT" in combined or "LOGISTICS" in combined or "TRANSPORT" in combined or "COURIER" in combined:
        return "FRT"
    elif "UTILITY" in combined or "RENT" in combined or "ELECTRICITY" in combined or "POWER" in combined:
        return "UTL"
    elif "STAFF" in combined or "HR" in combined or "EXPENSE" in combined or "TRAVEL" in combined or "WELFARE" in combined or "SALARY" in combined:
        return "EXP"
    elif "DEBIT" in combined:
        return "DN"
    elif "CREDIT" in combined:
        return "CN"
    elif "PROJECT" in combined or "BUDGET" in combined:
        return "PRJ"
    elif "NON - RETURNABLE" in combined or "NON-RETURNABLE" in combined:
        return "NR"
    elif "INVOICE" in combined or "AP" in combined or "TAX" in combined:
        return "INV"
    elif "VOUCHER" in combined:
        return "VOUCH"
    # Default prefix for all standard records/invoices
    return "INV"


def evaluate_single_condition(cond: Dict[str, Any], invoice: Any) -> bool:
    field = cond.get("field", "").strip()
    operator = cond.get("operator", "equals").strip().lower()
    val = cond.get("value", "")

    # Helper to get field from either dictionary or model object
    def get_val(obj: Any, attr: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(attr)
        return getattr(obj, attr, None)

    raw_doc_type = get_val(invoice, "document_type") or ""
    cat_val = get_val(invoice, "category") or ""
    wf_val = get_val(invoice, "workflow_profile_id") or ""
    inferred_doc_type = infer_document_type(category=cat_val, wf_name=wf_val, doc_type=raw_doc_type)

    # Map condition field names to Invoice attributes
    field_mapping = {
        "Division": get_val(invoice, "division") or "",
        "Company": get_val(invoice, "division") or "",
        "Plant": get_val(invoice, "plant") or "",
        "Branch": get_val(invoice, "plant") or "",
        "Category": cat_val or inferred_doc_type,
        "Cost Center": get_val(invoice, "cost_center") or "",
        "Vendor Name": get_val(invoice, "vendor_name") or "",
        "Vendor Type": "Standard",
        "Document Type": inferred_doc_type,
        "Invoice Amount (Total)": float(get_val(invoice, "amount") or 0.0),
        "Amount": float(get_val(invoice, "amount") or 0.0),
        "Tax Amount": float(get_val(invoice, "tax_amount") or 0.0),
    }

    field_val = field_mapping.get(field)
    if field_val is None:
        # Check custom_data if present
        custom_data = get_val(invoice, "custom_data")
        if custom_data:
            try:
                custom_dict = json.loads(custom_data) if isinstance(custom_data, str) else custom_data
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

    # If condition value is "all", it matches anything
    if str_val == "all" or str_val == "*":
        return True

    items = [s.strip().lower() for s in str_val.split(",") if s.strip()] if "," in str_val else [str_val]
    if "all" in items or "*" in items:
        return True

    if operator in ["equals", "==", "="]:
        return str_field in items or any(str_field == it for it in items)

    if operator in ["not equals", "!=", "!=="]:
        return str_field not in items and not any(str_field == it for it in items)

    if operator in ["contains any of", "contains any of (or)", "contains"]:
        return any(it in str_field or str_field in it for it in items)

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
    # Sort by priority DESC — highest priority number wins
    rules = db.query(BusinessRule).filter(
        BusinessRule.is_active == True,
        BusinessRule.is_deleted == False
    ).order_by(BusinessRule.priority.desc()).all()

    for rule in rules:
        if not rule.conditions_json:
            continue
        try:
            conds = json.loads(rule.conditions_json)
            if isinstance(conds, dict) and "conditions" in conds:
                conds = conds["conditions"]
            if evaluate_rule_conditions(conds, invoice):
                print(f"[RulesEngine] Matched rule '{rule.rule_name}' -> workflow '{rule.target_workflow_id}'")
                return rule.target_workflow_id
        except Exception as e:
            print(f"[RulesEngine] Error evaluating rule {rule.rule_name}: {e}")

    return None
