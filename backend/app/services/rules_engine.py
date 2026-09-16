import logging
import re
import json
import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.database.models import BusinessRule, Invoice, WorkflowProfile, WorkflowStepDefinition

logger = logging.getLogger(__name__)

def parse_date_str(val: Any) -> Optional[datetime.date]:
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.date() if isinstance(val, datetime.datetime) else val
    if not val:
        return None
    s = str(val).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d', '%m/%d/%Y'):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None

def infer_document_type(category: str='', trans_type: str='', wf_name: str='', doc_type: str='') -> str:
    if doc_type and doc_type.upper() not in ['AP INVOICE', '']:
        return doc_type
    n = f'{category} {trans_type} {wf_name}'.upper()
    if 'EVOUCHER' in n or 'E-VOUCHER' in n or 'E_VOUCHER' in n:
        return 'E-VOUCHER'
    elif 'ASSET' in n or 'CAPEX' in n or 'MACHINERY' in n or ('MACHINE' in n):
        return 'CAPEX / FIXED ASSET'
    elif 'GRN' in n or 'STOCK' in n or 'GOODS' in n:
        return 'GRN / GOODS RECEIPT'
    elif 'CASHFLOW' in n or 'CASH_FLOW' in n or 'PETTY' in n or ('CASH FLOW' in n):
        return 'CASH VOUCHER'
    elif 'FREIGHT' in n or 'TRANSPORT' in n or 'COURIER' in n or ('POSTAGE' in n):
        return 'FREIGHT & LOGISTICS'
    elif 'RENT' in n or 'EB' in n or 'ELECTRICITY' in n or ('POWER' in n):
        return 'UTILITY & RENT'
    elif 'TRAVEL' in n or 'WELFARE' in n or 'INCENTIVE' in n or ('SALARY' in n):
        return 'STAFF & HR EXPENSE'
    elif 'PURCHASE' in n or 'PO_' in n:
        return 'PURCHASE INVOICE'
    elif 'MAINTENANCE' in n or 'REPAIRS' in n or 'SERVICE' in n:
        return 'SERVICE & MAINTENANCE'
    elif 'ADVANCE' in n:
        return 'ADVANCE VOUCHER'
    elif 'JRNL' in n or 'JOURNAL' in n:
        return 'JOURNAL VOUCHER'
    return doc_type or 'PURCHASE INVOICE'

def get_doc_type_prefix(doc_type: str='', category: str='', trans_type: str='', wf_name: str='') -> str:
    combined = f"{doc_type or ''} {category or ''} {trans_type or ''} {wf_name or ''}".strip().upper()
    if 'CASH VOUCHER' in combined or 'CASH' in combined or 'PETTY' in combined:
        return 'CV'
    elif 'E-VOUCHER' in combined or 'EVOUCHER' in combined:
        return 'EV'
    elif 'JOURNAL' in combined or 'JRNL' in combined:
        return 'JV'
    elif 'ADVANCE' in combined:
        return 'ADV'
    elif 'CAPEX' in combined or 'FIXED ASSET' in combined or 'ASSET' in combined or ('MACHINERY' in combined):
        return 'CAPEX'
    elif 'GRN' in combined or 'GOODS' in combined:
        return 'GRN'
    elif 'SERVICE' in combined or 'MAINTENANCE' in combined or 'REPAIR' in combined:
        return 'SRV'
    elif 'FREIGHT' in combined or 'LOGISTICS' in combined or 'TRANSPORT' in combined or ('COURIER' in combined):
        return 'FRT'
    elif 'UTILITY' in combined or 'RENT' in combined or 'ELECTRICITY' in combined or ('POWER' in combined):
        return 'UTL'
    elif 'STAFF' in combined or 'HR' in combined or 'EXPENSE' in combined or ('TRAVEL' in combined) or ('WELFARE' in combined) or ('SALARY' in combined):
        return 'EXP'
    elif 'DEBIT' in combined:
        return 'DN'
    elif 'CREDIT' in combined:
        return 'CN'
    elif 'PROJECT' in combined or 'BUDGET' in combined:
        return 'PRJ'
    elif 'NON - RETURNABLE' in combined or 'NON-RETURNABLE' in combined:
        return 'NR'
    elif 'INVOICE' in combined or 'AP' in combined or 'TAX' in combined:
        return 'INV'
    elif 'VOUCHER' in combined:
        return 'VOUCH'
    return 'INV'

def is_wildcard(val: Optional[str]) -> bool:
    if val is None:
        return True
    s = str(val).strip().lower()
    if s in ['', 'all', '*']:
        return True
    items = [x.strip().lower() for x in s.split(',') if x.strip()]
    return 'all' in items or '*' in items

def sanitize_text(val: Any) -> str:
    if val is None:
        return ''
    s = str(val).strip().lower()
    for char in ['-', '_', ' ', '/', '\\', '.', ',', '(', ')']:
        s = s.replace(char, '')
    return s

def match_field_value(rule_val: Any, doc_val: Any, operator: str='equals') -> bool:
    op_str = (operator or '').strip().lower()

    # 1. Is Empty / Is Not Empty
    if op_str in ['is empty', 'is_empty', 'empty']:
        return doc_val is None or str(doc_val).strip() in ['', 'None', 'null', 'nan'] or doc_val == []
    if op_str in ['is not empty', 'is_not_empty', 'not empty', 'not_empty']:
        return doc_val is not None and str(doc_val).strip() not in ['', 'None', 'null', 'nan'] and doc_val != []

    if is_wildcard(rule_val):
        return True

    raw_r = str(rule_val if rule_val is not None else '').strip()
    raw_d = str(doc_val if doc_val is not None else '').strip()

    # 2. Date Comparison
    date_ops = ['before', 'after', 'on or before', 'on or after']
    d_doc = parse_date_str(doc_val)
    if op_str == 'between' and d_doc is not None:
        d_start, d_end = None, None
        if isinstance(rule_val, (list, tuple)) and len(rule_val) >= 2:
            d_start, d_end = parse_date_str(rule_val[0]), parse_date_str(rule_val[1])
        elif isinstance(rule_val, dict):
            d_start = parse_date_str(rule_val.get('start') or rule_val.get('from') or rule_val.get('min'))
            d_end = parse_date_str(rule_val.get('end') or rule_val.get('to') or rule_val.get('max'))
        else:
            sep = ' - ' if ' - ' in raw_r else (',' if ',' in raw_r else ' to ')
            parts = [p.strip() for p in raw_r.split(sep) if p.strip()]
            if len(parts) >= 2:
                d_start, d_end = parse_date_str(parts[0]), parse_date_str(parts[1])
        if d_start and d_end:
            return min(d_start, d_end) <= d_doc <= max(d_start, d_end)
        return False

    if (op_str in date_ops or (d_doc and op_str in ['equals', '==', '=', 'not equals', '!=', '!=='])):
        d_rule = parse_date_str(rule_val)
        if d_doc and d_rule:
            if op_str == 'before':
                return d_doc < d_rule
            elif op_str == 'after':
                return d_doc > d_rule
            elif op_str == 'on or before':
                return d_doc <= d_rule
            elif op_str == 'on or after':
                return d_doc >= d_rule
            elif op_str in ['equals', '==', '=']:
                return d_doc == d_rule
            elif op_str in ['not equals', '!=', '!==']:
                return d_doc != d_rule
        if op_str in date_ops:
            return False

    # 3. Numeric Comparison
    clean_r_str = re.sub(r'[^0-9\.\-]', '', raw_r) if not isinstance(rule_val, (int, float)) else str(rule_val)
    clean_d_str = re.sub(r'[^0-9\.\-]', '', raw_d.replace(',', '')) if not isinstance(doc_val, (int, float)) else str(doc_val)
    is_num_op = op_str in ['greater than', 'greater than or equal', 'less than', 'less than or equal', 'between', '>', '>=', '<', '<=', 'gt', 'gte', 'lt', 'lte']

    if op_str == 'between':
        try:
            num_doc = float(clean_d_str)
            min_val, max_val = None, None
            if isinstance(rule_val, (list, tuple)) and len(rule_val) >= 2:
                min_val, max_val = float(rule_val[0]), float(rule_val[1])
            elif isinstance(rule_val, dict):
                min_val = float(rule_val.get('min', rule_val.get('start', 0)))
                max_val = float(rule_val.get('max', rule_val.get('end', 0)))
            else:
                sep = ' - ' if ' - ' in raw_r else (',' if ',' in raw_r else ' to ')
                parts = [p.strip() for p in raw_r.split(sep) if p.strip()]
                if len(parts) >= 2:
                    min_val = float(re.sub(r'[^0-9\.\-]', '', parts[0]))
                    max_val = float(re.sub(r'[^0-9\.\-]', '', parts[1]))
            if min_val is not None and max_val is not None:
                return min(min_val, max_val) <= num_doc <= max(min_val, max_val)
        except Exception as exc:
            logger.debug('Number between parse exception: %s', exc)
        return False

    if is_num_op or (isinstance(doc_val, (int, float)) and op_str in ['equals', '==', '=', 'not equals', '!=', '!==']):
        try:
            if clean_r_str and clean_d_str:
                num_doc = float(clean_d_str)
                num_rule = float(clean_r_str)
                is_greater_or_equal = op_str in ['greater than or equal', '>=', 'gte'] or '>=' in raw_r
                is_greater = (op_str in ['greater than', '>', 'gt'] or '>' in raw_r) and not is_greater_or_equal
                is_less_or_equal = op_str in ['less than or equal', '<=', 'lte'] or '<=' in raw_r
                is_less = (op_str in ['less than', '<', 'lt'] or '<' in raw_r) and not is_less_or_equal
                if is_greater_or_equal:
                    return num_doc >= num_rule
                if is_greater:
                    return num_doc > num_rule
                if is_less_or_equal:
                    return num_doc <= num_rule
                if is_less:
                    return num_doc < num_rule
                if op_str in ['equals', '==', '=', 'eq']:
                    return abs(num_doc - num_rule) < 0.001
                if op_str in ['not equals', '!=', '!==', 'neq']:
                    return abs(num_doc - num_rule) >= 0.001
        except Exception as exc:
            logger.debug('Numeric comparison exception: %s', exc)

    # 4. Categorical / Text Comparison (Multi-value OR semantics)
    if isinstance(rule_val, (list, tuple, set)):
        rule_items = [str(x).strip() for x in rule_val if str(x).strip()]
    elif isinstance(rule_val, str):
        if '\n' in rule_val:
            rule_items = [s.strip() for s in rule_val.split('\n') if s.strip()]
        elif ',' in rule_val:
            rule_items = [s.strip() for s in rule_val.split(',') if s.strip()]
        elif '\t' in rule_val:
            rule_items = [s.strip() for s in rule_val.split('\t') if s.strip()]
        elif ';' in rule_val:
            rule_items = [s.strip() for s in rule_val.split(';') if s.strip()]
        else:
            rule_items = [rule_val.strip()] if rule_val.strip() else []
    else:
        rule_items = [str(rule_val).strip()] if str(rule_val).strip() else []

    if not rule_items:
        return False
    if any(is_wildcard(it) for it in rule_items):
        return True

    str_doc = str(doc_val or '').strip().lower()
    clean_doc = sanitize_text(doc_val)
    clean_rule_items = [sanitize_text(it) for it in rule_items]
    rule_items_lower = [it.lower() for it in rule_items]

    if op_str in ['equals', '==', '=', 'eq']:
        return str_doc in rule_items_lower or clean_doc in clean_rule_items or any(clean_doc == cit for cit in clean_rule_items if cit)

    if op_str in ['not equals', '!=', '!==', 'neq', 'not equal']:
        return str_doc not in rule_items_lower and clean_doc not in clean_rule_items and not any(clean_doc == cit for cit in clean_rule_items if cit)

    if op_str in ['contains', 'contains any of', 'contains any of (or)', 'is one of', 'in', 'in (comma-separated)']:
        # Multiple values belonging to ONE field are OR/membership values:
        # Category Contains [A, B, C] -> Category=A OR Category=B OR Category=C
        return any(
            (it and (it in str_doc or str_doc in it)) or
            (cit and (cit in clean_doc or clean_doc in cit))
            for it, cit in zip(rule_items_lower, clean_rule_items)
        )

    if op_str in ['does not contain', 'not contains', 'is not one of', 'not in']:
        # True only if NONE of the items match
        return not any(
            (it and (it in str_doc or str_doc in it)) or
            (cit and (cit in clean_doc or clean_doc in cit))
            for it, cit in zip(rule_items_lower, clean_rule_items)
        )

    if op_str in ['starts with', 'starts_with']:
        return any(str_doc.startswith(it) for it in rule_items_lower if it)
    if op_str in ['ends with', 'ends_with']:
        return any(str_doc.endswith(it) for it in rule_items_lower if it)

    return False

def match_condition(rule: Any, document: Any) -> bool:
    """
    Evaluates a single condition dict or general rule matching against a document.
    Handles Division/Category/Branch/CostCenter/Amount/etc. with wildcard ('ALL'/'*') support.
    """

    def get_val(obj: Any, attr: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(attr)
        return getattr(obj, attr, None)
    if isinstance(rule, dict) and 'field' in rule:
        field = str(rule.get('field', '')).strip()
        operator = str(rule.get('operator', 'equals')).strip().lower()
        val = rule.get('value', '')
        raw_doc_type = get_val(document, 'document_type') or ''
        cat_val = get_val(document, 'category') or ''
        wf_val = get_val(document, 'workflow_profile_id') or ''
        inferred_doc_type = infer_document_type(category=cat_val, wf_name=wf_val, doc_type=raw_doc_type)
        clean_field_key = sanitize_text(field)
        if clean_field_key in ['division', 'company', 'companycode', 'div']:
            field_val = get_val(document, 'division') or ''
        elif clean_field_key in ['costcenter', 'cost_center', 'cc', 'cost_centre', 'costcentre']:
            field_val = get_val(document, 'cost_center') or ''
        elif clean_field_key in ['plant', 'branch', 'location', 'plantcode']:
            field_val = get_val(document, 'branch') or get_val(document, 'plant') or ''
        elif clean_field_key in ['category', 'cat', 'dept', 'department']:
            field_val = cat_val or inferred_doc_type
        elif clean_field_key in ['vendorname', 'vendor', 'vendor_name']:
            field_val = get_val(document, 'vendor_name') or ''
        elif clean_field_key in ['documenttype', 'doctype', 'type']:
            field_val = inferred_doc_type
        elif clean_field_key in ['baseamount', 'base_amount', 'taxableamount', 'subtotal', 'netamount']:
            field_val = float(get_val(document, 'base_amount') or 0.0)
        elif clean_field_key in ['invoiceamounttotal', 'amount', 'invoiceamount', 'totalamount', 'grossamount']:
            gross_val = float(get_val(document, 'amount') or get_val(document, 'total_amount') or 0.0)
            base_val = float(get_val(document, 'base_amount') or 0.0)
            op_clean = operator.strip().lower()
            if op_clean in ['equals', '==', '=', '', 'eq']:
                # If rule specifies an amount with equals, match if it equals either gross total or taxable base
                if match_field_value(val, gross_val, operator):
                    return True
                if base_val > 0 and match_field_value(val, base_val, operator):
                    return True
                return False
            field_val = gross_val
        elif clean_field_key in ['taxamount', 'tax', 'gstamount']:
            field_val = float(get_val(document, 'tax_amount') or 0.0)
        elif clean_field_key in ['invoicedate', 'invoice_date', 'date', 'documentdate', 'docdate']:
            field_val = get_val(document, 'invoice_date') or get_val(document, 'created_at') or ''
        elif clean_field_key in ['paymentmode', 'paymode', 'payment_mode', 'pay_mode']:
            field_val = get_val(document, 'payment_mode') or get_val(document, 'payment_terms') or ''
        elif clean_field_key in ['gstin', 'vendorgstin', 'vendor_gstin']:
            field_val = get_val(document, 'vendor_gstin') or ''
        elif clean_field_key in ['ponumber', 'po_number', 'po']:
            field_val = get_val(document, 'po_number') or ''
        else:
            field_mapping = {
                'Division': get_val(document, 'division') or '',
                'Company': get_val(document, 'division') or '',
                'Plant': get_val(document, 'plant') or '',
                'Branch': get_val(document, 'plant') or '',
                'Category': cat_val or inferred_doc_type,
                'Cost Center': get_val(document, 'cost_center') or '',
                'Vendor Name': get_val(document, 'vendor_name') or '',
                'Vendor Type': 'Standard',
                'Document Type': inferred_doc_type,
                'Invoice Amount (Total)': float(get_val(document, 'amount') or 0.0),
                'Base Amount': float(get_val(document, 'base_amount') or 0.0),
                'Amount': float(get_val(document, 'amount') or 0.0),
                'Tax Amount': float(get_val(document, 'tax_amount') or 0.0),
                'Invoice Date': get_val(document, 'invoice_date') or get_val(document, 'created_at') or '',
                'Payment Mode': get_val(document, 'payment_mode') or get_val(document, 'payment_terms') or '',
                'GSTIN': get_val(document, 'vendor_gstin') or '',
                'PO Number': get_val(document, 'po_number') or ''
            }
            field_val = field_mapping.get(field)
        if field_val is None:
            custom_data = get_val(document, 'custom_data')
            if custom_data:
                try:
                    custom_dict = json.loads(custom_data) if isinstance(custom_data, str) else custom_data
                    if isinstance(custom_dict, dict):
                        if field in custom_dict:
                            field_val = custom_dict[field]
                        else:
                            norm_target = sanitize_text(field)
                            for ck, cv in custom_dict.items():
                                if sanitize_text(ck) == norm_target or ck.lower().strip() == field.lower().strip():
                                    field_val = cv
                                    break
                except Exception as exc:
                    logger.debug('Handled exception: %s', exc)
            if field_val is None:
                field_val = get_val(document, field) or ''
        return match_field_value(val, field_val, operator)
    div_val = get_val(rule, 'division')
    cat_val = get_val(rule, 'category')
    branch_val = get_val(rule, 'branch')
    cc_val = get_val(rule, 'cost_center') or get_val(rule, 'costcenter')
    wf_val = get_val(rule, 'workflow_profile') or get_val(rule, 'target_workflow_id')
    doc_div = get_val(document, 'division')
    doc_cat = get_val(document, 'category')
    doc_type = get_val(document, 'document_type')
    doc_branch = get_val(document, 'plant') or get_val(document, 'branch')
    doc_cc = get_val(document, 'cost_center')
    doc_wf = get_val(document, 'workflow_profile_id')
    if div_val and (not is_wildcard(div_val)):
        if not match_field_value(div_val, doc_div, 'contains any of' if ',' in str(div_val) else 'equals'):
            return False
    if cat_val and (not is_wildcard(cat_val)):
        cat_matched = match_field_value(cat_val, doc_cat, 'contains any of' if ',' in str(cat_val) else 'equals') or match_field_value(cat_val, doc_type, 'contains any of' if ',' in str(cat_val) else 'equals')
        if not cat_matched:
            return False
    if branch_val and (not is_wildcard(branch_val)):
        if not match_field_value(branch_val, doc_branch, 'contains any of' if ',' in str(branch_val) else 'equals'):
            return False
    if cc_val and (not is_wildcard(cc_val)):
        if not match_field_value(cc_val, doc_cc, 'contains any of' if ',' in str(cc_val) else 'equals'):
            return False
    if wf_val and (not is_wildcard(wf_val)):
        if str(wf_val).strip().upper() != str(doc_wf or '').strip().upper():
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
    div_val = get_val(rule, 'division')
    cat_val = get_val(rule, 'category')
    cc_val = get_val(rule, 'cost_center')
    branch_val = get_val(rule, 'branch')
    wf_val = get_val(rule, 'workflow_profile') or get_val(rule, 'category_name')
    doc_div = get_val(document, 'division')
    doc_cat = get_val(document, 'category')
    doc_cc = get_val(document, 'cost_center')
    doc_type = get_val(document, 'document_type')
    doc_branch = get_val(document, 'plant') or get_val(document, 'branch')
    doc_wf = get_val(document, 'workflow_profile_id')
    score = 1
    if div_val and (not is_wildcard(div_val)):
        if match_field_value(div_val, doc_div, 'contains any of' if ',' in str(div_val) else 'equals'):
            score += 20
        else:
            return 0
    if cat_val and (not is_wildcard(cat_val)):
        cat_matched = match_field_value(cat_val, doc_cat, 'contains any of' if ',' in str(cat_val) else 'equals') or match_field_value(cat_val, doc_type, 'contains any of' if ',' in str(cat_val) else 'equals')
        if cat_matched:
            score += 30
        else:
            return 0
    if cc_val and (not is_wildcard(cc_val)):
        if match_field_value(cc_val, doc_cc, 'contains any of' if ',' in str(cc_val) else 'equals'):
            score += 15
        else:
            return 0
    if branch_val and (not is_wildcard(branch_val)):
        if match_field_value(branch_val, doc_branch, 'contains any of' if ',' in str(branch_val) else 'equals'):
            score += 10
        else:
            return 0
    if wf_val and (not is_wildcard(wf_val)):
        if str(wf_val).strip().upper() == str(doc_wf or '').strip().upper():
            score += 10
        elif match_field_value(wf_val, doc_cat, 'contains any of' if ',' in str(wf_val) else 'equals'):
            score += 5
    return score

def calculate_rule_priority(cat_val: str, branch_val: str, cc_val: str, base_priority: int=50) -> int:
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
    if not isinstance(cond, dict) or 'field' not in cond or not cond.get('field'):
        logger.warning(f"[RulesEngine] Malformed or empty condition rejected (fail-closed): {cond}")
        return False
    return match_condition(cond, invoice)

def evaluate_rule_conditions(conditions: Any, invoice: Any) -> bool:
    if not conditions:
        return False
    if hasattr(conditions, 'conditions_json'):
        conditions = getattr(conditions, 'conditions_json')
    if isinstance(conditions, str):
        try:
            conditions = json.loads(conditions)
        except Exception:
            return False
    match_mode = 'ALL'
    cond_list = conditions
    if isinstance(conditions, dict):
        match_mode = str(conditions.get('match_type') or conditions.get('matchType') or conditions.get('match') or 'ALL').upper().strip()
        cond_list = conditions.get('conditions', [])
    if not isinstance(cond_list, list) or len(cond_list) == 0:
        return False

    if match_mode == 'ANY':
        return any(evaluate_single_condition(cond, invoice) for cond in cond_list)
    elif match_mode == 'ALL':
        return all(evaluate_single_condition(cond, invoice) for cond in cond_list)
    else:
        is_match = True
        for idx, cond in enumerate(cond_list):
            matched = evaluate_single_condition(cond, invoice)
            logical_op = cond.get('logicalOperator', 'AND').upper() if isinstance(cond, dict) else 'AND'
            if idx == 0:
                is_match = matched
            elif logical_op == 'OR':
                is_match = is_match or matched
            else:
                is_match = is_match and matched
        return is_match

def resolve_step_approvers(db: Session, step: Any, doc: Any) -> List[Any]:
    """
    Dynamically resolves active approvers for a workflow step based on:
    - Step approver_type ('Role', 'Specific Employee', or targets)
    - Document context: division, department
    - Organizational hierarchy: user's division/department matching document's
    - Only active users (is_active == True)
    """
    from app.database.models import User
    if not step:
        return []

    targets = []
    if getattr(step, 'approver_target', None):
        targets.extend([t.strip() for t in step.approver_target.split(',') if t.strip()])
    if getattr(step, 'delegate_approver', None):
        targets.extend([t.strip() for t in step.delegate_approver.split(',') if t.strip()])

    doc_div = getattr(doc, 'division', None)
    doc_dept = getattr(doc, 'department', None) or getattr(doc, 'category', None)

    resolved_users: List[Any] = []

    for target in targets:
        # Check if target matches known roles
        role_users = db.query(User).filter(
            User.is_active == True,
            (User.role.ilike(target) | (User.role.ilike(f"%{target}%")))
        ).all()
        
        if role_users:
            for u in role_users:
                u_div = (u.division or '').strip().upper()
                d_div = (doc_div or '').strip().upper()
                div_match = not d_div or not u_div or u_div in ['GLOBAL', 'HQ', 'ALL'] or u_div == d_div
                
                u_dept = (u.department or '').strip().upper()
                d_dept = (doc_dept or '').strip().upper()
                dept_match = not d_dept or not u_dept or u_dept in ['ALL'] or u_dept == d_dept or u_div in ['GLOBAL', 'HQ']
                
                if div_match and dept_match:
                    if u not in resolved_users:
                        resolved_users.append(u)
        else:
            # Match by specific employee username, employee_id, email, or employee_name
            specific_users = db.query(User).filter(
                User.is_active == True,
                (
                    (User.username.ilike(target)) |
                    (User.employee_id.ilike(target)) |
                    (User.email.ilike(target)) |
                    (User.employee_name.ilike(target))
                )
            ).all()
            for u in specific_users:
                if u not in resolved_users:
                    resolved_users.append(u)

    # If no active approver resolved, log warning and return empty list
    if not resolved_users:
        logger.warning(
            f"[ApproverResolution] No active approvers found for step '{getattr(step, 'step_name', 'Step')}' "
            f"(stage {getattr(step, 'stage_number', 1)}, target '{getattr(step, 'approver_target', '')}') "
            f"on doc {getattr(doc, 'id', 'N/A')}."
        )

    return resolved_users

def evaluate_business_rules(db: Session, invoice: Invoice) -> Optional[str]:
    res = evaluate_business_rules_full(db, invoice)
    return res.get('target_workflow_id') if res else None

def evaluate_business_rules_full(db: Session, invoice: Invoice) -> Optional[Dict[str, Any]]:
    rules = db.query(BusinessRule).filter(BusinessRule.is_active == True, BusinessRule.is_deleted == False).order_by(BusinessRule.priority.desc()).all()
    for rule in rules:
        if not rule.conditions_json:
            continue
        try:
            conds = json.loads(rule.conditions_json)
            if evaluate_rule_conditions(conds, invoice):
                if rule.target_workflow_id:
                    profile = db.query(WorkflowProfile).filter(
                        (WorkflowProfile.profile_name == rule.target_workflow_id) |
                        (WorkflowProfile.workflow_code == rule.target_workflow_id)
                    ).filter(WorkflowProfile.is_deleted == False).first()
                    if not profile:
                        logger.warning("[RulesEngine] Skipping rule '%s' because target workflow '%s' is inactive or deleted.", rule.rule_name, rule.target_workflow_id)
                        continue
                    canonical_target_wf = profile.profile_name
                else:
                    profile = None
                    canonical_target_wf = None

                logger.info("[RulesEngine] Matched rule '%s' -> workflow '%s', action '%s'", rule.rule_name, canonical_target_wf, rule.rule_action)
                effective_action = rule.rule_action or 'WORKFLOW_ROUTE'
                effective_cancel_reason = rule.cancel_reason
                if effective_action == 'WORKFLOW_ROUTE' and profile:
                    if profile.rule_action and (profile.rule_action != 'WORKFLOW_ROUTE'):
                        effective_action = profile.rule_action
                        effective_cancel_reason = profile.cancel_reason or f'Auto-cancelled via Workflow Profile: {profile.profile_name}'
                return {'rule_name': rule.rule_name, 'target_workflow_id': canonical_target_wf, 'rule_action': effective_action, 'cancel_reason': effective_cancel_reason}
        except Exception as e:
            logger.debug('Handled exception: %s', e)
    return None

def simulate_rule_evaluation(db: Session, mock_invoice: Any, draft_rules: Optional[List[Dict[str, Any]]]=None) -> Dict[str, Any]:
    """
    Dry-run simulation engine for Business Rules.
    Evaluates mock document attributes against all active and draft rules, producing a full execution trace and stage breakdown.
    """
    db_rules = db.query(BusinessRule).filter(BusinessRule.is_active == True, BusinessRule.is_deleted == False).order_by(BusinessRule.priority.desc()).all()
    all_rules_to_eval = []
    if draft_rules:
        for idx, dr in enumerate(draft_rules):
            all_rules_to_eval.append({'rule_name': dr.get('rule_name') or f'Draft Rule #{idx + 1}', 'priority': int(dr.get('priority') or 999), 'target_workflow_id': dr.get('target_workflow_id') or '', 'conditions_json': dr.get('conditions_json') or '[]', 'rule_action': dr.get('rule_action') or 'WORKFLOW_ROUTE', 'cancel_reason': dr.get('cancel_reason') or '', 'is_draft': True})
    for r in db_rules:
        all_rules_to_eval.append({'rule_name': r.rule_name, 'priority': r.priority, 'target_workflow_id': r.target_workflow_id, 'conditions_json': r.conditions_json, 'rule_action': r.rule_action or 'WORKFLOW_ROUTE', 'cancel_reason': r.cancel_reason or '', 'is_draft': False})
    all_rules_to_eval.sort(key=lambda x: x.get('priority', 0), reverse=True)
    matched_rule = None
    trace = []
    for rule_info in all_rules_to_eval:
        cond_str = rule_info.get('conditions_json')
        if not cond_str:
            continue
        try:
            conds = json.loads(cond_str)
            match_mode = 'ALL'
            cond_list = conds
            if isinstance(conds, dict):
                match_mode = str(conds.get('match_type') or conds.get('matchType') or conds.get('match') or 'ALL').upper().strip()
                cond_list = conds.get('conditions', [])
            cond_eval_details = []
            is_match = False
            if isinstance(cond_list, list) and cond_list:
                for cIdx, cond in enumerate(cond_list):
                    field = cond.get('field', '')
                    op = cond.get('operator', 'equals')
                    exp_val = cond.get('value', '')
                    log_op = cond.get('logicalOperator', 'OR' if match_mode == 'ANY' else 'AND').upper()
                    matched_cond = evaluate_single_condition(cond, mock_invoice)
                    cond_eval_details.append({'field': field, 'operator': op, 'expected': exp_val, 'passed': matched_cond, 'logicalOperator': log_op})
                if match_mode == 'ANY':
                    is_match = any(c['passed'] for c in cond_eval_details)
                elif match_mode == 'ALL':
                    is_match = all(c['passed'] for c in cond_eval_details)
                else:
                    for cIdx, c in enumerate(cond_eval_details):
                        if cIdx == 0:
                            is_match = c['passed']
                        elif c['logicalOperator'] == 'OR':
                            is_match = is_match or c['passed']
                        else:
                            is_match = is_match and c['passed']
            trace.append({'rule_name': rule_info.get('rule_name'), 'priority': rule_info.get('priority'), 'target_workflow_id': rule_info.get('target_workflow_id'), 'is_draft': rule_info.get('is_draft', False), 'matched': is_match, 'conditions_detail': cond_eval_details})
            if is_match and (not matched_rule):
                matched_rule = rule_info
                break
        except Exception as err:
            logger.debug('Handled exception: %s', err)
    stages = []
    if matched_rule and matched_rule.get('target_workflow_id'):
        wf_id = matched_rule['target_workflow_id']
        step_defs = db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_id).order_by(WorkflowStepDefinition.stage_number.asc()).all()
        for s in step_defs:
            stages.append({'stage_number': s.stage_number, 'step_name': s.step_name, 'approver_target': s.approver_target, 'approver_pool': [x.strip() for x in (s.approver_target or '').split(',') if x.strip()]})
    return {'success': True, 'matched': bool(matched_rule), 'matched_rule': matched_rule, 'target_workflow': matched_rule.get('target_workflow_id') if matched_rule else None, 'stages': stages, 'total_stages': len(stages), 'trace': trace[:15]}

def detect_rule_conflicts(db: Session, custom_rules: Optional[List[Dict[str, Any]]]=None) -> Dict[str, Any]:
    """
    Conflict & Overlap Detector for Policy Matrix rules.
    Detects duplicate condition signatures, priority ties, and shadowed rules.
    """
    if custom_rules is not None:
        rules_list = custom_rules
    else:
        db_rules = db.query(BusinessRule).filter(BusinessRule.is_deleted == False).all()
        rules_list = [{'id': r.id, 'rule_name': r.rule_name, 'priority': r.priority, 'target_workflow_id': r.target_workflow_id, 'conditions_json': r.conditions_json, 'is_active': r.is_active} for r in db_rules]
    conflicts = []
    rule_signatures: Dict[str, List[Dict[str, Any]]] = {}
    for r in rules_list:
        cond_str = r.get('conditions_json') or '[]'
        try:
            conds = json.loads(cond_str)
            if isinstance(conds, dict) and 'conditions' in conds:
                conds = conds['conditions']
            sig_parts = []
            if isinstance(conds, list):
                for c in sorted(conds, key=lambda x: str(x.get('field', ''))):
                    sig_parts.append(f"{c.get('field')}={c.get('operator')}={str(c.get('value')).strip().upper()}")
            sig = ' & '.join(sig_parts) if sig_parts else 'EMPTY_UNIVERSAL'
            if sig not in rule_signatures:
                rule_signatures[sig] = []
            rule_signatures[sig].append(r)
        except Exception as exc:
            logger.debug('Handled exception: %s', exc)
            continue
    for sig, matching_list in rule_signatures.items():
        if len(matching_list) > 1:
            active_matches = [m for m in matching_list if m.get('is_active', True)]
            if len(active_matches) > 1:
                priorities = [m.get('priority', 0) for m in active_matches]
                workflows = set((m.get('target_workflow_id') for m in active_matches))
                has_priority_tie = len(priorities) != len(set(priorities))
                has_diff_workflows = len(workflows) > 1
                severity = 'HIGH' if has_priority_tie and has_diff_workflows else 'MEDIUM'
                conflict_type = 'PRIORITY_COLLISION' if has_priority_tie else 'OVERLAPPING_CONDITIONS'
                conflicts.append({'conflict_type': conflict_type, 'severity': severity, 'signature': sig, 'affected_rules': [m.get('rule_name') for m in active_matches], 'target_workflows': list(workflows), 'priorities': priorities, 'recommendation': 'Adjust priorities to ensure a clear evaluation order.' if has_priority_tie else 'One rule shadows another with the same conditions. Consider merging or archiving obsolete rules.'})
    return {'success': True, 'total_rules_scanned': len(rules_list), 'conflict_count': len(conflicts), 'conflicts': conflicts}