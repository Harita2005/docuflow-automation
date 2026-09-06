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


def is_wildcard(val: Optional[str]) -> bool:
    if val is None:
        return True
    s = str(val).strip().lower()
    if s in ["", "all", "*"]:
        return True
    items = [x.strip().lower() for x in s.split(",") if x.strip()]
    return "all" in items or "*" in items

def sanitize_text(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip().lower()
    for char in ["-", "_", " ", "/", "\\", ".", ",", "(", ")"]:
        s = s.replace(char, "")
    return s

def match_field_value(rule_val: Any, doc_val: Any, operator: str = "equals") -> bool:
    if is_wildcard(rule_val):
        return True

    # Robust Numeric & Amount Evaluation (handles '10000', '> 10000', '>= 10000', 'greater than', etc.)
    try:
        raw_r = str(rule_val or "").strip()
        raw_d = str(doc_val or "0").replace(",", "").strip()
        op_str = (operator or "").strip().lower()

        is_num_rule = isinstance(rule_val, (int, float)) or any(c.isdigit() for c in raw_r)
        is_num_doc = isinstance(doc_val, (int, float)) or any(c.isdigit() for c in raw_d)

        if is_num_doc and is_num_rule and not isinstance(rule_val, bool):
            clean_r_str = re.sub(r'[^0-9\.\-]', '', raw_r)
            clean_d_str = re.sub(r'[^0-9\.\-]', '', raw_d)

            if clean_r_str and clean_d_str:
                num_doc = float(clean_d_str)
                num_rule = float(clean_r_str)

                is_greater_or_equal = ">=" in op_str or ">=" in raw_r or "greater than or equal" in op_str or "greater_or_equal" in op_str
                is_greater = (">" in op_str or ">" in raw_r or "greater" in op_str) and not is_greater_or_equal

                is_less_or_equal = "<=" in op_str or "<=" in raw_r or "less than or equal" in op_str or "less_or_equal" in op_str
                is_less = ("<" in op_str or "<" in raw_r or "less" in op_str) and not is_less_or_equal

                if is_greater_or_equal:
                    return num_doc >= num_rule
                if is_greater:
                    return num_doc > num_rule
                if is_less_or_equal:
                    return num_doc <= num_rule
                if is_less:
                    return num_doc < num_rule

                if op_str in ["equals", "==", "=", ""]:
                    if ">=" in raw_r:
                        return num_doc >= num_rule
                    elif ">" in raw_r or "greater" in raw_r:
                        return num_doc > num_rule
                    elif "<=" in raw_r:
                        return num_doc <= num_rule
                    elif "<" in raw_r or "less" in raw_r:
                        return num_doc < num_rule
                    return abs(num_doc - num_rule) < 0.01
    except Exception:
        # Explicitly handled fallback for optional feature
        pass

    str_doc = str(doc_val or "").strip().lower()
    str_rule = str(rule_val or "").strip().lower()
    rule_items = [s.strip().lower() for s in str_rule.split(",") if s.strip()] if "," in str_rule else [str_rule]

    if "all" in rule_items or "*" in rule_items:
        return True

    # Ultra-flexible sanitization: removes hyphens, spaces, underscores, slashes, dots
    clean_doc = sanitize_text(doc_val)
    clean_rule_items = [sanitize_text(it) for it in rule_items]

    op = operator.strip().lower()
    if op in ["equals", "==", "="]:
        return (
            str_doc in rule_items or
            clean_doc in clean_rule_items or
            any(clean_doc == cit for cit in clean_rule_items)
        )

    if op in ["not equals", "!=", "!=="]:
        return str_doc not in rule_items and clean_doc not in clean_rule_items

    if op in ["contains any of", "contains any of (or)", "contains"]:
        return any(
            it in str_doc or str_doc in it or (cit and cit in clean_doc) or (clean_doc and clean_doc in cit)
            for it, cit in zip(rule_items, clean_rule_items)
        )

    return True

def match_condition(rule: Any, document: Any) -> bool:
    """
    Evaluates a single condition dict or general rule matching against a document.
    Handles Division/Category/Branch/CostCenter/Amount/etc. with wildcard ('ALL'/'*') support.
    """
    def get_val(obj: Any, attr: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(attr)
        return getattr(obj, attr, None)

    # Case 1: Dict with 'field', 'operator', 'value'
    if isinstance(rule, dict) and "field" in rule:
        field = str(rule.get("field", "")).strip()
        operator = str(rule.get("operator", "equals")).strip().lower()
        val = rule.get("value", "")

        raw_doc_type = get_val(document, "document_type") or ""
        cat_val = get_val(document, "category") or ""
        wf_val = get_val(document, "workflow_profile_id") or ""
        inferred_doc_type = infer_document_type(category=cat_val, wf_name=wf_val, doc_type=raw_doc_type)

        clean_field_key = sanitize_text(field)

        # Universal Field Resolution Map (handles any field naming variation)
        if clean_field_key in ["division", "company", "companycode", "div"]:
            field_val = get_val(document, "division") or ""
        elif clean_field_key in ["costcenter", "cost_center", "cc", "cost_centre", "costcentre"]:
            field_val = get_val(document, "cost_center") or ""
        elif clean_field_key in ["plant", "branch", "location", "plantcode"]:
            field_val = get_val(document, "plant") or ""
        elif clean_field_key in ["category", "cat", "dept", "department"]:
            field_val = cat_val or inferred_doc_type
        elif clean_field_key in ["vendorname", "vendor", "vendor_name"]:
            field_val = get_val(document, "vendor_name") or ""
        elif clean_field_key in ["documenttype", "doctype", "type"]:
            field_val = inferred_doc_type
        elif clean_field_key in ["invoiceamounttotal", "amount", "invoiceamount", "totalamount", "grossamount"]:
            field_val = float(get_val(document, "amount") or 0.0)
        elif clean_field_key in ["taxamount", "tax", "gstamount"]:
            field_val = float(get_val(document, "tax_amount") or 0.0)
        else:
            field_mapping = {
                "Division": get_val(document, "division") or "",
                "Company": get_val(document, "division") or "",
                "Plant": get_val(document, "plant") or "",
                "Branch": get_val(document, "plant") or "",
                "Category": cat_val or inferred_doc_type,
                "Cost Center": get_val(document, "cost_center") or "",
                "Vendor Name": get_val(document, "vendor_name") or "",
                "Vendor Type": "Standard",
                "Document Type": inferred_doc_type,
                "Invoice Amount (Total)": float(get_val(document, "amount") or 0.0),
                "Amount": float(get_val(document, "amount") or 0.0),
                "Tax Amount": float(get_val(document, "tax_amount") or 0.0),
            }
            field_val = field_mapping.get(field)

        if field_val is None:
            custom_data = get_val(document, "custom_data")
            if custom_data:
                try:
                    custom_dict = json.loads(custom_data) if isinstance(custom_data, str) else custom_data
                    field_val = custom_dict.get(field, "")
                except Exception:
                    field_val = ""
            else:
                field_val = ""

        return match_field_value(val, field_val, operator)

    # Case 2: Object or dict representing multi-field entity (e.g. ChecklistRule)
    div_val = get_val(rule, "division")
    cat_val = get_val(rule, "category")
    branch_val = get_val(rule, "branch")
    cc_val = get_val(rule, "cost_center") or get_val(rule, "costcenter")
    wf_val = get_val(rule, "workflow_profile") or get_val(rule, "target_workflow_id")

    doc_div = get_val(document, "division")
    doc_cat = get_val(document, "category")
    doc_type = get_val(document, "document_type")
    doc_branch = get_val(document, "plant") or get_val(document, "branch")
    doc_cc = get_val(document, "cost_center")
    doc_wf = get_val(document, "workflow_profile_id")

    if div_val and not is_wildcard(div_val):
        if not match_field_value(div_val, doc_div, "contains any of" if "," in str(div_val) else "equals"):
            return False

    if cat_val and not is_wildcard(cat_val):
        cat_matched = match_field_value(cat_val, doc_cat, "contains any of" if "," in str(cat_val) else "equals") or \
                      match_field_value(cat_val, doc_type, "contains any of" if "," in str(cat_val) else "equals")
        if not cat_matched:
            return False

    if branch_val and not is_wildcard(branch_val):
        if not match_field_value(branch_val, doc_branch, "contains any of" if "," in str(branch_val) else "equals"):
            return False

    if cc_val and not is_wildcard(cc_val):
        if not match_field_value(cc_val, doc_cc, "contains any of" if "," in str(cc_val) else "equals"):
            return False

    if wf_val and not is_wildcard(wf_val):
        if str(wf_val).strip().upper() != str(doc_wf or "").strip().upper():
            return False

    return True

def score_checklist_rule(rule: Any, document: Any) -> int:
    """
    Scores a ChecklistRule against a document based on specificity:
    Division (+20), Category (+30), CostCenter (+15), Branch (+10), WorkflowProfile / CategoryName (+10).
    Returns 0 if any non-wildcard field fails to match.
    """
    def get_val(obj: Any, attr: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(attr)
        return getattr(obj, attr, None)

    div_val = get_val(rule, "division")
    cat_val = get_val(rule, "category")
    cc_val = get_val(rule, "cost_center")
    branch_val = get_val(rule, "branch")
    wf_val = get_val(rule, "workflow_profile") or get_val(rule, "category_name")

    doc_div = get_val(document, "division")
    doc_cat = get_val(document, "category")
    doc_cc = get_val(document, "cost_center")
    doc_type = get_val(document, "document_type")
    doc_branch = get_val(document, "plant") or get_val(document, "branch")
    doc_wf = get_val(document, "workflow_profile_id")

    score = 1

    if div_val and not is_wildcard(div_val):
        if match_field_value(div_val, doc_div, "contains any of" if "," in str(div_val) else "equals"):
            score += 20
        else:
            return 0

    if cat_val and not is_wildcard(cat_val):
        cat_matched = match_field_value(cat_val, doc_cat, "contains any of" if "," in str(cat_val) else "equals") or \
                      match_field_value(cat_val, doc_type, "contains any of" if "," in str(cat_val) else "equals")
        if cat_matched:
            score += 30
        else:
            return 0

    if cc_val and not is_wildcard(cc_val):
        if match_field_value(cc_val, doc_cc, "contains any of" if "," in str(cc_val) else "equals"):
            score += 15
        else:
            return 0

    if branch_val and not is_wildcard(branch_val):
        if match_field_value(branch_val, doc_branch, "contains any of" if "," in str(branch_val) else "equals"):
            score += 10
        else:
            return 0

    if wf_val and not is_wildcard(wf_val):
        if str(wf_val).strip().upper() == str(doc_wf or "").strip().upper():
            score += 10
        elif match_field_value(wf_val, doc_cat, "contains any of" if "," in str(wf_val) else "equals"):
            score += 5

    return score

def calculate_rule_priority(cat_val: str, branch_val: str, cc_val: str, base_priority: int = 50) -> int:
    """
    Calculates consolidated business rule priority based on specificity:
    Base (50) + Category (!= 'ALL', +20) + Branch (!= 'ALL', +15) + Cost Center (!= 'ALL', +15).
    """
    priority = base_priority
    if not is_wildcard(cat_val):
        priority += 20
    if not is_wildcard(branch_val):
        priority += 15
    if not is_wildcard(cc_val):
        priority += 15
    return priority

def evaluate_single_condition(cond: Dict[str, Any], invoice: Any) -> bool:
    return match_condition(cond, invoice)

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
    res = evaluate_business_rules_full(db, invoice)
    return res.get("target_workflow_id") if res else None

def evaluate_business_rules_full(db: Session, invoice: Invoice) -> Optional[Dict[str, Any]]:
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
                print(f"[RulesEngine] Matched rule '{rule.rule_name}' -> workflow '{rule.target_workflow_id}', action '{rule.rule_action}'")
                
                # Check profile-level rule_action override if rule itself is WORKFLOW_ROUTE
                effective_action = rule.rule_action or "WORKFLOW_ROUTE"
                effective_cancel_reason = rule.cancel_reason
                
                if effective_action == "WORKFLOW_ROUTE" and rule.target_workflow_id:
                    profile = db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == rule.target_workflow_id).first()
                    if profile and profile.rule_action and profile.rule_action != "WORKFLOW_ROUTE":
                        effective_action = profile.rule_action
                        effective_cancel_reason = profile.cancel_reason or f"Auto-cancelled via Workflow Profile: {profile.profile_name}"

                return {
                    "rule_name": rule.rule_name,
                    "target_workflow_id": rule.target_workflow_id,
                    "rule_action": effective_action,
                    "cancel_reason": effective_cancel_reason
                }
        except Exception as e:
            print(f"[RulesEngine] Error evaluating rule {rule.rule_name}: {e}")

    return None

def simulate_rule_evaluation(db: Session, mock_invoice: Any, draft_rules: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Dry-run simulation engine for Business Rules.
    Evaluates mock document attributes against all active and draft rules, producing a full execution trace and stage breakdown.
    """
    db_rules = db.query(BusinessRule).filter(
        BusinessRule.is_active == True,
        BusinessRule.is_deleted == False
    ).order_by(BusinessRule.priority.desc()).all()

    all_rules_to_eval = []
    
    # Prepend draft rules if provided (giving them highest evaluation priority during simulation)
    if draft_rules:
        for idx, dr in enumerate(draft_rules):
            all_rules_to_eval.append({
                "rule_name": dr.get("rule_name") or f"Draft Rule #{idx+1}",
                "priority": int(dr.get("priority") or 999),
                "target_workflow_id": dr.get("target_workflow_id") or "",
                "conditions_json": dr.get("conditions_json") or "[]",
                "rule_action": dr.get("rule_action") or "WORKFLOW_ROUTE",
                "cancel_reason": dr.get("cancel_reason") or "",
                "is_draft": True
            })

    for r in db_rules:
        all_rules_to_eval.append({
            "rule_name": r.rule_name,
            "priority": r.priority,
            "target_workflow_id": r.target_workflow_id,
            "conditions_json": r.conditions_json,
            "rule_action": r.rule_action or "WORKFLOW_ROUTE",
            "cancel_reason": r.cancel_reason or "",
            "is_draft": False
        })

    # Sort all by priority DESC
    all_rules_to_eval.sort(key=lambda x: x.get("priority", 0), reverse=True)

    matched_rule = None
    trace = []

    for rule_info in all_rules_to_eval:
        cond_str = rule_info.get("conditions_json")
        if not cond_str:
            continue
        try:
            conds = json.loads(cond_str)
            if isinstance(conds, dict) and "conditions" in conds:
                conds = conds["conditions"]
            
            cond_eval_details = []
            is_match = True
            
            if not isinstance(conds, list) or len(conds) == 0:
                is_match = True
            else:
                for cIdx, cond in enumerate(conds):
                    field = cond.get("field", "")
                    op = cond.get("operator", "equals")
                    exp_val = cond.get("value", "")
                    log_op = cond.get("logicalOperator", "AND").upper()
                    
                    matched_cond = evaluate_single_condition(cond, mock_invoice)
                    cond_eval_details.append({
                        "field": field,
                        "operator": op,
                        "expected": exp_val,
                        "passed": matched_cond,
                        "logicalOperator": log_op
                    })

                    if cIdx == 0:
                        is_match = matched_cond
                    else:
                        if log_op == "OR":
                            is_match = is_match or matched_cond
                        else:
                            is_match = is_match and matched_cond

            trace.append({
                "rule_name": rule_info.get("rule_name"),
                "priority": rule_info.get("priority"),
                "target_workflow_id": rule_info.get("target_workflow_id"),
                "is_draft": rule_info.get("is_draft", False),
                "matched": is_match,
                "conditions_detail": cond_eval_details
            })

            if is_match and not matched_rule:
                matched_rule = rule_info
                break

        except Exception as err:
            trace.append({
                "rule_name": rule_info.get("rule_name"),
                "error": f"Rule evaluation error ({type(err).__name__})",
                "matched": False
            })

    # If matched, look up the target workflow step definitions
    stages = []
    if matched_rule and matched_rule.get("target_workflow_id"):
        wf_id = matched_rule["target_workflow_id"]
        step_defs = db.query(WorkflowStepDefinition).filter(
            WorkflowStepDefinition.profile_name == wf_id
        ).order_by(WorkflowStepDefinition.stage_number.asc()).all()

        for s in step_defs:
            stages.append({
                "stage_number": s.stage_number,
                "step_name": s.step_name,
                "approver_target": s.approver_target,
                "approver_pool": [x.strip() for x in (s.approver_target or "").split(",") if x.strip()]
            })

    return {
        "success": True,
        "matched": bool(matched_rule),
        "matched_rule": matched_rule,
        "target_workflow": matched_rule.get("target_workflow_id") if matched_rule else None,
        "stages": stages,
        "total_stages": len(stages),
        "trace": trace[:15] # Top 15 evaluated rules for visibility
    }

def detect_rule_conflicts(db: Session, custom_rules: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Conflict & Overlap Detector for Policy Matrix rules.
    Detects duplicate condition signatures, priority ties, and shadowed rules.
    """
    if custom_rules is not None:
        rules_list = custom_rules
    else:
        db_rules = db.query(BusinessRule).filter(
            BusinessRule.is_deleted == False
        ).all()
        rules_list = [
            {
                "id": r.id,
                "rule_name": r.rule_name,
                "priority": r.priority,
                "target_workflow_id": r.target_workflow_id,
                "conditions_json": r.conditions_json,
                "is_active": r.is_active
            }
            for r in db_rules
        ]

    conflicts = []
    rule_signatures: Dict[str, List[Dict[str, Any]]] = {}

    for r in rules_list:
        cond_str = r.get("conditions_json") or "[]"
        try:
            conds = json.loads(cond_str)
            if isinstance(conds, dict) and "conditions" in conds:
                conds = conds["conditions"]
            
            # Extract standard key attributes
            sig_parts = []
            if isinstance(conds, list):
                for c in sorted(conds, key=lambda x: str(x.get("field", ""))):
                    sig_parts.append(f"{c.get('field')}={c.get('operator')}={str(c.get('value')).strip().upper()}")
            
            sig = " & ".join(sig_parts) if sig_parts else "EMPTY_UNIVERSAL"
            if sig not in rule_signatures:
                rule_signatures[sig] = []
            rule_signatures[sig].append(r)
        except Exception:
            continue

    # Analyze collisions & overlaps
    for sig, matching_list in rule_signatures.items():
        if len(matching_list) > 1:
            active_matches = [m for m in matching_list if m.get("is_active", True)]
            if len(active_matches) > 1:
                # Check priority collision vs duplicate
                priorities = [m.get("priority", 0) for m in active_matches]
                workflows = set(m.get("target_workflow_id") for m in active_matches)
                
                has_priority_tie = len(priorities) != len(set(priorities))
                has_diff_workflows = len(workflows) > 1
                
                severity = "HIGH" if (has_priority_tie and has_diff_workflows) else "MEDIUM"
                conflict_type = "PRIORITY_COLLISION" if has_priority_tie else "OVERLAPPING_CONDITIONS"

                conflicts.append({
                    "conflict_type": conflict_type,
                    "severity": severity,
                    "signature": sig,
                    "affected_rules": [m.get("rule_name") for m in active_matches],
                    "target_workflows": list(workflows),
                    "priorities": priorities,
                    "recommendation": (
                        "Adjust priorities to ensure a clear evaluation order." if has_priority_tie
                        else "One rule shadows another with the same conditions. Consider merging or archiving obsolete rules."
                    )
                })

    return {
        "success": True,
        "total_rules_scanned": len(rules_list),
        "conflict_count": len(conflicts),
        "conflicts": conflicts
    }
