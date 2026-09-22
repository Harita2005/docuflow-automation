import io
import json
import logging
import os
import re
import uuid
import datetime
import urllib.request
from typing import Optional, Dict, Any, List
import openpyxl
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.database.models import (
    Invoice,
    User,
    Division,
    WorkflowProfile,
    WorkflowStepDefinition,
    AuditLog,
)
from app.services.rules_engine import (
    evaluate_business_rules_full,
    infer_document_type,
)
from app.routers.documents import (
    resolve_checklist_items,
    safe_broadcast_event,
)

logger = logging.getLogger(__name__)

# Configurable local Ollama model for classification
DEFAULT_LLM_MODEL = os.environ.get("EXCEL_LLM_MODEL", "qwen2.5:3b")
OLLAMA_API_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")


def find_invoice_by_num_or_id(db: Session, identifier: str) -> Optional[Invoice]:
    """Finds an active existing invoice by invoice number, document ID, or doc_key."""
    raw_str = str(identifier).strip()
    if not raw_str:
        return None
    id_clean = re.sub(
        r'^(DOC|INV|CV|EV|JV|ADV|CAPEX|GRN|SRV|FRT|UTL|EXP|DN|CN|PRJ|NR|VOUCH)[-_#]?',
        '',
        raw_str,
        flags=re.IGNORECASE,
    ).strip()

    return (
        db.query(Invoice)
        .filter(
            (Invoice.id == raw_str)
            | (Invoice.invoice_number == raw_str)
            | (Invoice.id == f'DOC-{id_clean}')
            | (Invoice.id == f'INV-{id_clean}')
            | (Invoice.invoice_number == id_clean)
            | (Invoice.doc_key == raw_str)
            | (Invoice.doc_key == id_clean)
        )
        .filter(Invoice.is_deleted == False)
        .first()
    )


def parse_excel_rows(file_bytes: bytes) -> List[Dict[str, Any]]:
    """Reads Excel file using openpyxl and returns normalized rows with headers."""
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse Excel file: {str(exc)}",
        )

    ws = wb.active
    if not ws:
        return []

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []

    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    parsed_rows = []

    for r_idx, row_values in enumerate(rows[1:], start=2):
        if not any(v is not None and str(v).strip() != "" for v in row_values):
            continue

        row_dict = {"_row_number": r_idx}
        for h, val in zip(headers, row_values):
            if h:
                row_dict[h] = val
        parsed_rows.append(row_dict)

    return parsed_rows


def get_allowed_metadata(db: Session) -> Dict[str, List[str]]:
    """
    Inspects existing database configuration and returns allowed options for:
    - divisions
    - company/compliance types
    """
    # 1. Existing Divisions
    db_divs = [d.code.strip() for d in db.query(Division).filter(Division.is_active == True).all() if d.code]
    inv_divs = [d[0].strip() for d in db.query(Invoice.division).distinct().all() if d[0] and str(d[0]).strip()]
    allowed_divisions = sorted(list(set(db_divs + inv_divs + ["VCC", "HQ", "SD", "GLOBAL"])))

    # 2. Existing Compliance Types / Categories
    inv_cats = [c[0].strip() for c in db.query(Invoice.category).distinct().all() if c[0] and str(c[0]).strip()]
    inv_types = [t[0].strip() for t in db.query(Invoice.document_type).distinct().all() if t[0] and str(t[0]).strip()]
    baseline_comps = [
        "Transport",
        "Non-Transport",
        "AP INVOICE",
        "GENERATOR",
        "General Records",
        "Plant Maintenance",
        "Raw Materials",
        "CREDIT NOTE",
        "SERVICE & MAINTENANCE",
    ]
    allowed_compliance = sorted(list(set(inv_cats + inv_types + baseline_comps)))

    return {
        "divisions": allowed_divisions,
        "compliance_types": allowed_compliance,
    }


def normalize_against_allowed(value: Optional[str], allowed_list: List[str]) -> Optional[str]:
    """Matches a string value against an allowed list with case, whitespace, and punctuation tolerance."""
    if not value or not str(value).strip():
        return None

    cleaned = str(value).strip().lower()
    cleaned_simplified = re.sub(r'[^a-z0-9]', '', cleaned)

    # 1. Exact case-insensitive match
    for allowed in allowed_list:
        if allowed.lower() == cleaned:
            return allowed

    # 2. Alphanumeric stripped match
    for allowed in allowed_list:
        allowed_simplified = re.sub(r'[^a-z0-9]', '', allowed.lower())
        if allowed_simplified == cleaned_simplified:
            return allowed

    # 3. Substring inclusion match (e.g. 'VCC Division' -> 'VCC')
    for allowed in allowed_list:
        if allowed.lower() in cleaned or cleaned in allowed.lower():
            return allowed

    return None


def classify_with_llm(
    doc_info: Dict[str, Any],
    allowed_divisions: List[str],
    allowed_compliance_types: List[str],
) -> Dict[str, Any]:
    """
    Uses local Ollama LLM to classify document into allowed Company/Compliance Type and Division.
    Includes deterministic heuristic fallback if the LLM is unreachable.
    """
    # Prepare concise document context
    doc_context = (
        f"- Invoice Number: {doc_info.get('invoice_number', 'N/A')}\n"
        f"- Vendor Name: {doc_info.get('vendor_name', 'N/A')}\n"
        f"- Amount: {doc_info.get('amount', 'N/A')}\n"
        f"- Existing Category / Compliance Hint: {doc_info.get('existing_category', 'N/A')}\n"
        f"- Existing Document Type: {doc_info.get('existing_doc_type', 'N/A')}\n"
        f"- Existing Division Hint: {doc_info.get('existing_division', 'N/A')}\n"
        f"- Extra Row Hints: {doc_info.get('extra_hints', 'None')}"
    )

    prompt = (
        "You are an enterprise document classification assistant for a Document Approval Automation System (DAAS).\n"
        "Given the available document information, determine the Company / Compliance Type and Division.\n"
        "You MUST choose ONLY from the allowed options below. Do NOT invent new values.\n\n"
        f"Document Information:\n{doc_context}\n\n"
        "Allowed Divisions:\n" + "\n".join([f"- {d}" for d in allowed_divisions]) + "\n\n"
        "Allowed Compliance Types:\n" + "\n".join([f"- {c}" for c in allowed_compliance_types]) + "\n\n"
        "Return ONLY a valid JSON object in this exact schema with no markdown or additional text:\n"
        "{\n"
        '  "company_or_compliance_type": string,\n'
        '  "division": string,\n'
        '  "confidence": float between 0.0 and 1.0,\n'
        '  "reason": string\n'
        "}"
    )

    # 1. Attempt LLM invocation
    try:
        payload = json.dumps({
            "model": DEFAULT_LLM_MODEL,
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }).encode("utf-8")

        req = urllib.request.Request(
            OLLAMA_API_URL,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            raw_text = resp_data.get("response", "").strip()
            clean_json_str = re.sub(r'^```(?:json)?\s*', '', raw_text)
            clean_json_str = re.sub(r'\s*```$', '', clean_json_str).strip()
            parsed = json.loads(clean_json_str)

            raw_comp = parsed.get("company_or_compliance_type")
            raw_div = parsed.get("division")
            confidence = float(parsed.get("confidence", 0.85))
            reason = parsed.get("reason", "Classified via local LLM")

            # Validate against allowed database values
            norm_comp = normalize_against_allowed(raw_comp, allowed_compliance_types)
            norm_div = normalize_against_allowed(raw_div, allowed_divisions)

            if norm_comp and norm_div and confidence >= 0.6:
                return {
                    "company_or_compliance_type": norm_comp,
                    "division": norm_div,
                    "confidence": round(confidence, 2),
                    "reason": f"LLM ({DEFAULT_LLM_MODEL}): {reason}",
                    "is_valid": True,
                }
            else:
                return {
                    "company_or_compliance_type": norm_comp or raw_comp,
                    "division": norm_div or raw_div,
                    "confidence": round(confidence, 2),
                    "reason": f"LLM low confidence or value outside allowed schema: comp='{raw_comp}', div='{raw_div}'",
                    "is_valid": False,
                }

    except Exception as llm_err:
        logger.warning("[Excel LLM Trigger] Local LLM call failed or timed out: %s. Using heuristic fallback.", llm_err)

    # 2. Heuristic fallback when LLM is unavailable
    hint_comp = doc_info.get("existing_category") or doc_info.get("existing_doc_type") or "AP INVOICE"
    hint_div = doc_info.get("existing_division") or "VCC"

    norm_comp = normalize_against_allowed(hint_comp, allowed_compliance_types) or "AP INVOICE"
    norm_div = normalize_against_allowed(hint_div, allowed_divisions) or "VCC"

    return {
        "company_or_compliance_type": norm_comp,
        "division": norm_div,
        "confidence": 0.80,
        "reason": f"Heuristic fallback: matched from existing document attributes ({norm_comp}, {norm_div})",
        "is_valid": True,
    }


def match_workflow_via_condition_engine(
    db: Session,
    doc: Invoice,
    classified_compliance: str,
    classified_division: str,
) -> Optional[WorkflowProfile]:
    """
    Evaluates existing Condition Engine using the classified compliance type and division.
    Reuses evaluate_business_rules_full without hardcoding.
    """
    # Create evaluation context with classified values
    doc.category = classified_compliance
    doc.division = classified_division

    rule_eval = evaluate_business_rules_full(db, doc)
    matched_target = rule_eval.get("target_workflow_id") if rule_eval else None

    if matched_target:
        profile = (
            db.query(WorkflowProfile)
            .filter(
                (WorkflowProfile.profile_name == matched_target)
                | (WorkflowProfile.workflow_code == matched_target)
            )
            .filter(WorkflowProfile.is_deleted == False)
            .first()
        )
        if profile:
            return profile

    # Fallback to category / division workflow profile match
    profile_fallback = (
        db.query(WorkflowProfile)
        .filter(WorkflowProfile.is_deleted == False)
        .filter(
            (WorkflowProfile.workflow_category == classified_division)
            | (WorkflowProfile.workflow_category.ilike(f"%{classified_compliance}%"))
            | (WorkflowProfile.workflow_type.ilike(f"%{classified_compliance}%"))
        )
        .first()
    )
    if profile_fallback:
        return profile_fallback

    # General default active workflow profile
    return db.query(WorkflowProfile).filter(WorkflowProfile.is_deleted == False).first()


def resolve_approver_by_compliance(
    db: Session,
    step: Optional[WorkflowStepDefinition],
    compliance_type: str,
    division: str,
) -> str:
    """
    Resolves eligible approver using:
        Compliance Type + Division + Role -> Eligible Member -> Assigned Approver
    """
    if not step or not step.approver_target:
        return "Unassigned (No Step Approvers)"

    role_target = step.approver_target.strip()
    clean_div = (division or "").strip().upper()
    clean_comp = (compliance_type or "").strip().upper()

    role_users = (
        db.query(User)
        .filter(
            User.is_active == True,
            (
                (User.role.ilike(role_target))
                | (User.role.ilike(f"%{role_target}%"))
                | (User.employee_name.ilike(role_target))
                | (User.username.ilike(role_target))
            ),
        )
        .all()
    )

    if not role_users:
        return role_target

    # Level 1: Role + Division + Department / Compliance
    level1_matches = []
    for u in role_users:
        u_div = (u.division or "").strip().upper()
        u_dept = (u.department or "").strip().upper()

        div_match = not clean_div or not u_div or u_div in ["GLOBAL", "HQ", "ALL"] or u_div == clean_div
        dept_match = not clean_comp or not u_dept or u_dept in ["ALL"] or u_dept == clean_comp or clean_comp in u_dept

        if div_match and dept_match:
            level1_matches.append(u)

    if level1_matches:
        return ", ".join([u.employee_name or u.username for u in level1_matches])

    # Level 2: Role + Division
    level2_matches = []
    for u in role_users:
        u_div = (u.division or "").strip().upper()
        div_match = not clean_div or not u_div or u_div in ["GLOBAL", "HQ", "ALL"] or u_div == clean_div
        if div_match:
            level2_matches.append(u)

    if level2_matches:
        return ", ".join([u.employee_name or u.username for u in level2_matches])

    return ", ".join([u.employee_name or u.username for u in role_users[:2]]) or role_target


def is_workflow_already_active(doc: Invoice) -> bool:
    """Checks if the document already has an active, in-progress, or settled workflow."""
    if not doc.workflow_profile_id:
        return False
    status_str = (doc.status or "").strip().lower()
    if not status_str or status_str in ["unrouted (no rule matched)", "draft", "unrouted"]:
        return False
    return True


def process_excel_workflow_trigger(
    file_bytes: bytes,
    filename: str,
    db: Session,
    current_user: User,
    start_workflow: bool = False,
) -> Dict[str, Any]:
    """
    Simple Prototype for Excel-based document workflow triggering with LLM classification.

    Flow:
    1. Read Excel rows dynamically (normalize invoice number column)
    2. Search existing documents in DAAS (DO NOT create new documents)
    3. Collect document information
    4. Call LLM to classify into allowed Company/Compliance Type and Division
    5. Evaluate existing Condition Engine to find matching Workflow Profile
    6. Return detailed row-level results (and optionally start stage 1 if requested)
    """
    if not filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload an Excel file (.xlsx or .xls).",
        )

    parsed_rows = parse_excel_rows(file_bytes)

    if not parsed_rows:
        return {
            "success": True,
            "total": 0,
            "matched": 0,
            "started": 0,
            "not_found": 0,
            "review_required": 0,
            "results": [],
        }

    # Inspect headers from first row dynamically
    first_row = parsed_rows[0]
    inv_col = None
    extra_hint_cols = []

    for col in first_row.keys():
        if col == "_row_number":
            continue
        norm_col = str(col).strip().lower().replace(" ", "_").replace("#", "").replace("-", "_")
        if norm_col in [
            "invoice_number",
            "invoicenumber",
            "invoice_no",
            "invoiceno",
            "inv_no",
            "inv_num",
            "invoice",
            "doc_number",
            "docnumber",
            "document_number",
            "documentnumber",
            "doc_no",
            "bill_no",
            "bill_number",
        ]:
            inv_col = col
        else:
            extra_hint_cols.append(col)

    # Fallback column detection if not matched exactly
    if not inv_col:
        for col in first_row.keys():
            if col != "_row_number" and ("number" in str(col).lower() or "inv" in str(col).lower() or "doc" in str(col).lower()):
                inv_col = col
                break
        if not inv_col:
            candidate_cols = [c for c in first_row.keys() if c != "_row_number"]
            inv_col = candidate_cols[0] if candidate_cols else None

    if not inv_col:
        raise HTTPException(
            status_code=400,
            detail="Unable to identify an 'Invoice Number' or 'Document Number' column in the uploaded Excel file.",
        )

    # Get allowed options from existing DB configuration
    allowed_meta = get_allowed_metadata(db)
    allowed_divisions = allowed_meta["divisions"]
    allowed_compliance_types = allowed_meta["compliance_types"]

    batch_id = f"EXCEL_PROTO_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    user_name = current_user.employee_name or current_user.username or "System User"

    matched_count = 0
    started_count = 0
    not_found_count = 0
    review_required_count = 0
    results: List[Dict[str, Any]] = []

    for row in parsed_rows:
        row_number = row["_row_number"]
        raw_inv_val = row.get(inv_col)

        if raw_inv_val is None or not str(raw_inv_val).strip():
            continue

        inv_number_str = str(raw_inv_val).strip()
        # Clean Excel float notation e.g. 1001.0 -> 1001
        if inv_number_str.endswith(".0") and inv_number_str[:-2].isdigit():
            inv_number_str = inv_number_str[:-2]

        # 1. Search existing documents in DAAS
        doc = find_invoice_by_num_or_id(db, inv_number_str)
        if not doc:
            not_found_count += 1
            results.append({
                "row_number": row_number,
                "invoice_number": inv_number_str,
                "document_id": None,
                "company_or_compliance_type": None,
                "division": None,
                "workflow_code": None,
                "workflow_id": None,
                "workflow_name": None,
                "confidence": 0.0,
                "reason": "Invoice number does not exist in DAAS documents table.",
                "status": "NOT_FOUND",
            })
            continue

        # Collect available document info + row hints
        extra_hints = {col: row[col] for col in extra_hint_cols if row.get(col) is not None}
        doc_info = {
            "invoice_number": doc.invoice_number or inv_number_str,
            "document_id": doc.id,
            "vendor_name": doc.vendor_name,
            "amount": doc.amount,
            "existing_category": doc.category,
            "existing_doc_type": doc.document_type,
            "existing_division": doc.division,
            "extra_hints": json.dumps(extra_hints) if extra_hints else "None",
        }

        # 2. LLM Classification into allowed schema
        classification = classify_with_llm(
            doc_info=doc_info,
            allowed_divisions=allowed_divisions,
            allowed_compliance_types=allowed_compliance_types,
        )

        classified_comp = classification.get("company_or_compliance_type")
        classified_div = classification.get("division")
        confidence = classification.get("confidence", 0.0)
        reason = classification.get("reason", "")
        is_valid = classification.get("is_valid", False)

        if not is_valid or confidence < 0.6:
            review_required_count += 1
            results.append({
                "row_number": row_number,
                "invoice_number": doc.invoice_number or inv_number_str,
                "document_id": doc.id,
                "company_or_compliance_type": classified_comp,
                "division": classified_div,
                "workflow_code": None,
                "workflow_id": None,
                "workflow_name": None,
                "confidence": confidence,
                "reason": reason,
                "status": "REVIEW_REQUIRED",
            })
            continue

        # 3. Match against existing Condition Engine
        matched_profile = match_workflow_via_condition_engine(
            db=db,
            doc=doc,
            classified_compliance=classified_comp,
            classified_division=classified_div,
        )

        if not matched_profile:
            review_required_count += 1
            results.append({
                "row_number": row_number,
                "invoice_number": doc.invoice_number or inv_number_str,
                "document_id": doc.id,
                "company_or_compliance_type": classified_comp,
                "division": classified_div,
                "workflow_code": None,
                "workflow_id": None,
                "workflow_name": None,
                "confidence": confidence,
                "reason": "Condition Engine did not match any active workflow configuration.",
                "status": "REVIEW_REQUIRED",
            })
            continue

        # Successfully matched
        matched_count += 1
        wf_code = matched_profile.workflow_code
        wf_id = matched_profile.id
        wf_name = matched_profile.profile_name

        # Optionally start workflow if requested or if document is unstarted
        row_status = "MATCHED"
        if start_workflow:
            doc.workflow_profile_id = wf_name
            doc.category = classified_comp
            doc.division = classified_div
            doc.document_type = infer_document_type(category=classified_comp, wf_name=wf_name, doc_type=doc.document_type)

            steps = (
                db.query(WorkflowStepDefinition)
                .filter(WorkflowStepDefinition.profile_name == wf_name)
                .order_by(WorkflowStepDefinition.stage_number.asc())
                .all()
            )
            doc.total_stages = len(steps) if steps else 2
            doc.current_stage = 1
            first_step = steps[0] if steps else None

            resolved_approver = resolve_approver_by_compliance(db, first_step, classified_comp, classified_div)
            doc.assigned_approver = resolved_approver
            doc.status = f"Initiated ({first_step.step_name})" if first_step and first_step.step_name else "Initiated (Stage 1)"

            first_stage_name = first_step.step_name if first_step and first_step.step_name else "Attachment Status"
            checklist_items = resolve_checklist_items(db, doc, first_stage_name)
            doc.checklist_state = json.dumps({item: False for item in checklist_items})

            db.add(
                AuditLog(
                    invoice_id=doc.id,
                    user=user_name,
                    action="Excel Prototype Workflow Start",
                    stage="Stage 1",
                    notes=(
                        f"Excel Prototype Batch: {batch_id} | Compliance: {classified_comp} | "
                        f"Division: {classified_div} | Workflow: {wf_name} ({wf_code}) | Approver: {resolved_approver}"
                    ),
                    timestamp=datetime.datetime.utcnow(),
                )
            )
            db.commit()
            db.refresh(doc)

            safe_broadcast_event(
                "DOCUMENT_CREATED",
                {
                    "document_id": str(doc.id),
                    "status": doc.status,
                    "current_stage": doc.current_stage,
                    "assigned_approver": doc.assigned_approver,
                },
            )
            started_count += 1
            row_status = "STARTED"

        results.append({
            "row_number": row_number,
            "invoice_number": doc.invoice_number or inv_number_str,
            "document_id": doc.id,
            "company_or_compliance_type": classified_comp,
            "division": classified_div,
            "workflow_code": wf_code,
            "workflow_id": wf_id,
            "workflow_name": wf_name,
            "confidence": confidence,
            "reason": reason,
            "status": row_status,
        })

    return {
        "success": True,
        "total": len(results),
        "matched": matched_count,
        "started": started_count,
        "not_found": not_found_count,
        "review_required": review_required_count,
        "results": results,
    }
