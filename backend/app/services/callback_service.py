import os
import re
import json
import base64
import time
import uuid
import hmac
import hashlib
import urllib.request
import urllib.parse
import urllib.error
import datetime
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from app.models import (
    Document,
    ThirdPartyApplication,
    CallbackRule,
    CallbackEvent,
    CallbackAttempt,
    IntegrationAuditHistory
)

# Supported dynamic variable names
DYNAMIC_VARIABLES = [
    "primaryKey",
    "documentNumber",
    "approvalStatus",
    "documentType",
    "applicationCode",
    "company",
    "category",
    "branch",
    "costCenter",
    "approvedBy",
    "approvalDate",
    "rejectionReason",
    "eventId"
]

def build_document_context(doc: Document, decision: str = "APPROVED", event_id: str = "") -> Dict[str, Any]:
    """Extracts a unified context dictionary from a Document record for rule evaluation and template filling."""
    primary_key = doc.external_sync_ref or doc.doc_key or doc.id
    doc_number = doc.doc_num or doc.invoice_number or doc.id
    doc_type = doc.document_type or "AP INVOICE"
    company = doc.division or "GLOBAL"
    category = doc.category or ""
    branch = doc.plant or ""
    cost_center = doc.cost_center or ""
    pay_mode = doc.pay_mode or "BANK"
    
    # Extract last approver / rejection notes
    approved_by = "System Admin"
    rejection_reason = ""
    if doc.approval_logs:
        logs = sorted(doc.approval_logs, key=lambda x: x.timestamp or datetime.datetime.min)
        if logs:
            last_log = logs[-1]
            if last_log.user:
                approved_by = last_log.user
            if decision == "REJECTED" or "Reject" in (last_log.action or ""):
                rejection_reason = last_log.notes or "Rejected during workflow approval."

    approval_date = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    return {
        "primaryKey": str(primary_key),
        "documentNumber": str(doc_number),
        "approvalStatus": str(decision).upper(),
        "documentType": str(doc_type),
        "applicationCode": "", # Filled during rule processing
        "company": str(company),
        "category": str(category),
        "branch": str(branch),
        "costCenter": str(cost_center),
        "pay_mode": str(pay_mode),
        "approvalStage": str(doc.current_stage),
        "status": str(doc.status),
        "fdoDecision": str(decision).upper(),
        "approvedBy": str(approved_by),
        "approvalDate": approval_date,
        "rejectionReason": str(rejection_reason),
        "eventId": str(event_id),
        "amount": float(doc.amount) if doc.amount is not None else 0.0,
        "party_name": doc.party_name or doc.vendor_name or "",
        "party_code": doc.party_code or doc.vendor_code or ""
    }

def resolve_dynamic_variables(template_str: str, context: Dict[str, Any]) -> str:
    """Replaces {{variableName}} in string template with corresponding values from context."""
    if not template_str:
        return ""
    
    result = str(template_str)
    for key, val in context.items():
        placeholder = f"{{{{{key}}}}}"
        if placeholder in result:
            result = result.replace(placeholder, str(val) if val is not None else "")
            
    # Also support general lower case or snake_case key mappings
    for key, val in context.items():
        snake_key = re.sub(r'(?<!^)(?=[A-Z])', '_', key).lower()
        placeholder = f"{{{{{snake_key}}}}}"
        if placeholder in result:
            result = result.replace(placeholder, str(val) if val is not None else "")
            
    return result

def evaluate_single_condition(condition: Dict[str, Any], doc_context: Dict[str, Any]) -> bool:
    """Evaluates a single condition object like {"field": "company", "operator": "Equals", "value": "ABC"}."""
    field = condition.get("field", "")
    op = condition.get("operator", "Equals")
    target_val = condition.get("value", "")

    actual_val = doc_context.get(field, "")
    
    # Also check case-insensitive match for field key
    if actual_val == "" and field:
        for k, v in doc_context.items():
            if k.lower() == field.lower():
                actual_val = v
                break

    str_actual = str(actual_val or "").strip()
    str_target = str(target_val or "").strip()

    if op in ["Equals", "==", "eq"]:
        return str_actual.lower() == str_target.lower()
    elif op in ["Not Equals", "!=", "ne"]:
        return str_actual.lower() != str_target.lower()
    elif op in ["Contains", "contains"]:
        return str_target.lower() in str_actual.lower()
    elif op in ["Does Not Contain", "not_contains"]:
        return str_target.lower() not in str_actual.lower()
    elif op in ["Starts With", "starts_with"]:
        return str_actual.lower().startswith(str_target.lower())
    elif op in ["Ends With", "ends_with"]:
        return str_actual.lower().endswith(str_target.lower())
    elif op in ["In", "in"]:
        candidates = [c.strip().lower() for c in str_target.split(",") if c.strip()]
        return str_actual.lower() in candidates
    elif op in ["Not In", "not_in"]:
        candidates = [c.strip().lower() for c in str_target.split(",") if c.strip()]
        return str_actual.lower() not in candidates
    elif op in ["Greater Than", ">", "gt"]:
        try:
            return float(str_actual) > float(str_target)
        except ValueError:
            return str_actual > str_target
    elif op in ["Greater Than or Equal", ">=", "gte"]:
        try:
            return float(str_actual) >= float(str_target)
        except ValueError:
            return str_actual >= str_target
    elif op in ["Less Than", "<", "lt"]:
        try:
            return float(str_actual) < float(str_target)
        except ValueError:
            return str_actual < str_target
    elif op in ["Less Than or Equal", "<=", "lte"]:
        try:
            return float(str_actual) <= float(str_target)
        except ValueError:
            return str_actual <= str_target
    elif op in ["Is Empty", "is_empty"]:
        return str_actual == ""
    elif op in ["Is Not Empty", "is_not_empty"]:
        return str_actual != ""
    elif op in ["Is True", "is_true"]:
        return str_actual.lower() in ["true", "1", "yes"]
    elif op in ["Is False", "is_false"]:
        return str_actual.lower() in ["false", "0", "no"]

    return True

def evaluate_rule_conditions(conditions_json: Optional[str], doc_context: Dict[str, Any]) -> bool:
    """Evaluates a condition tree structure against document context."""
    if not conditions_json:
        return True
    
    try:
        cond_data = json.loads(conditions_json) if isinstance(conditions_json, str) else conditions_json
        if not cond_data:
            return True
        
        if isinstance(cond_data, list):
            for cond in cond_data:
                if not evaluate_single_condition(cond, doc_context):
                    return False
            return True

        if isinstance(cond_data, dict):
            logical_op = cond_data.get("logicalOperator", cond_data.get("logic", "AND")).upper()
            conditions = cond_data.get("conditions", [])

            if not conditions:
                return True

            results = []
            for cond in conditions:
                if "conditions" in cond:
                    results.append(evaluate_rule_conditions(cond, doc_context))
                else:
                    results.append(evaluate_single_condition(cond, doc_context))

            if logical_op == "OR":
                return any(results)
            else: # AND
                return all(results)
    except Exception as e:
        print(f"[Condition Evaluation Warning] Error evaluating conditions: {e}")
        return True

    return True

def validate_url_ssrf(url_str: str):
    """Protects against SSRF by validating URI scheme and blocking unsafe protocols."""
    parsed = urllib.parse.urlparse(url_str)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ["http", "https"]:
        raise ValueError(f"Disallowed URL protocol '{scheme}'. Only HTTP and HTTPS callbacks are supported.")
    
    if url_str.startswith("file://") or url_str.startswith("ftp://") or url_str.startswith("data:"):
        raise ValueError(f"Dangerous URL protocol in '{url_str}' is blocked for security.")

def mask_sensitive_headers(headers: Dict[str, str]) -> Dict[str, str]:
    """Masks secret values in headers dictionary for secure display and logging."""
    masked = {}
    secret_keys = ["authorization", "x-api-key", "api-key", "token", "secret", "password"]
    for k, v in headers.items():
        lk = k.lower()
        if any(sk in lk for sk in secret_keys):
            if v.startswith("Bearer "):
                masked[k] = "Bearer ••••••••••••"
            elif v.startswith("Basic "):
                masked[k] = "Basic ••••••••••••"
            else:
                masked[k] = "••••••••••••"
        else:
            masked[k] = v
    return masked

def build_auth_headers(auth_type: str, auth_config_json: Optional[str]) -> Dict[str, str]:
    """Generates HTTP authentication headers based on configuration."""
    headers = {}
    if not auth_type or auth_type == "None" or not auth_config_json:
        return headers

    try:
        cfg = json.loads(auth_config_json) if isinstance(auth_config_json, str) else auth_config_json
        if not isinstance(cfg, dict):
            return headers

        if auth_type == "API_KEY":
            header_name = cfg.get("header_name") or cfg.get("headerName") or "X-API-Key"
            api_key = cfg.get("api_key") or cfg.get("apiKey") or cfg.get("secret") or ""
            prefix = cfg.get("prefix", "")
            val = f"{prefix} {api_key}".strip() if prefix else api_key
            if header_name and val:
                headers[header_name] = val

        elif auth_type == "BEARER_TOKEN":
            token = cfg.get("token") or cfg.get("bearer_token") or ""
            if token:
                headers["Authorization"] = f"Bearer {token}" if not token.startswith("Bearer ") else token

        elif auth_type == "BASIC_AUTH":
            username = cfg.get("username") or ""
            password = cfg.get("password") or ""
            creds = f"{username}:{password}".encode("utf-8")
            encoded = base64.b64encode(creds).decode("utf-8")
            headers["Authorization"] = f"Basic {encoded}"

        elif auth_type == "OAUTH2":
            access_token = cfg.get("access_token") or cfg.get("token") or ""
            client_id = cfg.get("client_id") or ""
            client_secret = cfg.get("client_secret") or ""
            token_url = cfg.get("token_url") or ""

            if not access_token and client_id and client_secret and token_url:
                try:
                    validate_url_ssrf(token_url)
                    auth_data = urllib.parse.urlencode({
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "scope": cfg.get("scope", "")
                    }).encode("utf-8")
                    tok_req = urllib.request.Request(token_url, data=auth_data, headers={"Content-Type": "application/x-www-form-urlencoded"})
                    with urllib.request.urlopen(tok_req, timeout=10) as tok_res:
                        tok_body = json.loads(tok_res.read().decode("utf-8"))
                        access_token = tok_body.get("access_token") or ""
                except Exception as ex:
                    print(f"[OAuth Warning] Could not acquire OAuth token: {ex}")

            if access_token:
                headers["Authorization"] = f"Bearer {access_token}"
    except Exception as e:
        print(f"[Auth Configuration Error] {e}")

    return headers

def execute_sp_for_callback_payload(db: Optional[Session], sp_name: str, doc_key: str, doc_context: Dict[str, Any]) -> str:
    """
    Executes a SQL Stored Procedure (e.g. sp_GetApprovalCallbackPayload) passing @DocKey as parameter.
    Executes `EXEC {sp_name} @DocKey = :doc_key` and returns the SQL FOR JSON string, or constructs line items payload dynamically.
    """
    clean_sp_name = re.sub(r'[^a-zA-Z0-9_]', '', (sp_name or "sp_GetApprovalCallbackPayload").strip()) or "sp_GetApprovalCallbackPayload"
    
    if db:
        try:
            from sqlalchemy import text
            # MS SQL Server execution
            sql_cmd = text(f"EXEC {clean_sp_name} @DocKey = :doc_key")
            res = db.execute(sql_cmd, {"doc_key": str(doc_key)}).fetchone()
            if res and res[0]:
                return str(res[0])
        except Exception as err:
            print(f"[Stored Procedure Execution Notice] Execution of '{clean_sp_name}' returned notice: {err}")

    # Fallback & Local Dev Engine: Construct dynamic payload with Document + Line Items
    try:
        from app.models import Document, DocumentLineItem
        doc = None
        if db:
            doc = db.query(Document).filter(
                (Document.id == str(doc_key)) | (Document.doc_key == str(doc_key)) | (Document.invoice_number == str(doc_key))
            ).first()
            
        line_items = []
        if doc and doc.line_items:
            for item in doc.line_items:
                line_items.append({
                    "itemCode": item.item_code or "ITEM-001",
                    "itemDescription": item.description,
                    "quantity": float(item.quantity or 1.0),
                    "unitPrice": float(item.unit_price or 0.0),
                    "lineAmount": float(item.amount or 0.0)
                })
                
        payload_data = {
            "documentId": str(doc.id if doc else doc_key),
            "externalDocKey": str(doc.doc_key if doc else doc_context.get("primaryKey")),
            "invoiceNumber": str(doc.invoice_number if doc else doc_context.get("documentNumber")),
            "vendorName": str(doc.party_name or doc.vendor_name if doc else doc_context.get("party_name")),
            "vendorCode": str(doc.party_code or doc.vendor_code if doc else doc_context.get("party_code")),
            "grandTotal": float(doc.amount if doc else doc_context.get("amount", 0.0)),
            "baseAmount": float(doc.base_amount if doc else 0.0),
            "totalTax": float(doc.tax_amount if doc else 0.0),
            "cgst": float(doc.cgst if doc else 0.0),
            "sgst": float(doc.sgst if doc else 0.0),
            "igst": float(doc.igst if doc else 0.0),
            "companyCode": str(doc.division if doc else doc_context.get("company")),
            "branchCode": str(doc.plant if doc else doc_context.get("branch")),
            "costCenter": str(doc.cost_center if doc else doc_context.get("costCenter")),
            "approvalStatus": str(doc.status if doc else doc_context.get("approvalStatus")),
            "approvedBy": str(doc_context.get("approvedBy", "System Admin")),
            "approvalDate": str(doc_context.get("approvalDate", datetime.datetime.utcnow().isoformat())),
            "executedStoredProcedure": clean_sp_name,
            "items": line_items
        }
        return json.dumps(payload_data, indent=2)
    except Exception as ex:
        print(f"[SP Dynamic Generator Error] {ex}")
        return json.dumps({
            "docKey": str(doc_key),
            "status": str(doc_context.get("approvalStatus", "APPROVED")),
            "sp_name": clean_sp_name
        })

def build_callback_request(
    rule: CallbackRule,
    app: ThirdPartyApplication,
    doc_context: Dict[str, Any],
    db: Optional[Session] = None
) -> Tuple[str, str, Dict[str, str], Optional[bytes]]:
    """
    Constructs full HTTP request parameters: (method, final_url, final_headers, body_bytes).
    Resolves variables in URL, Query Params, Headers, and Payload.
    Supports SQL Stored Procedure dynamic payload generation (@DocKey parameter).
    """
    method = (rule.http_method or "POST").upper()

    if rule.url_mode == "OVERRIDE" and rule.custom_url:
        raw_url = rule.custom_url
    else:
        base = (app.base_url or "").rstrip("/")
        path = (rule.endpoint_path or "").lstrip("/")
        raw_url = f"{base}/{path}" if path else base

    final_url = resolve_dynamic_variables(raw_url, doc_context)
    validate_url_ssrf(final_url)

    query_params = {}
    if rule.query_params_json:
        try:
            params_list = json.loads(rule.query_params_json) if isinstance(rule.query_params_json, str) else rule.query_params_json
            if isinstance(params_list, list):
                for p in params_list:
                    k = p.get("key") or p.get("name")
                    v = p.get("value", "")
                    if k:
                        query_params[k] = resolve_dynamic_variables(v, doc_context)
            elif isinstance(params_list, dict):
                for k, v in params_list.items():
                    query_params[k] = resolve_dynamic_variables(str(v), doc_context)
        except Exception:
            pass

    if query_params:
        parsed_url = urllib.parse.urlparse(final_url)
        existing_query = urllib.parse.parse_qs(parsed_url.query)
        for k, v in query_params.items():
            existing_query[k] = [v]
        new_query_str = urllib.parse.urlencode(existing_query, doseq=True)
        final_url = urllib.parse.urlunparse((
            parsed_url.scheme,
            parsed_url.netloc,
            parsed_url.path,
            parsed_url.params,
            new_query_str,
            parsed_url.fragment
        ))

    final_headers = {
        "User-Agent": "DocuFlow-Approval-Callback-Engine/2.0",
        "X-Approval-Event-ID": doc_context.get("eventId", ""),
        "X-Approval-Attempt": f"{doc_context.get('attemptNumber', 1)}/{doc_context.get('maxAttempts', 3)}"
    }

    auth_type = rule.auth_override_type if rule.auth_override_type and rule.auth_override_type != "INHERIT" else app.auth_type
    auth_config = rule.auth_override_config_json if rule.auth_override_type and rule.auth_override_type != "INHERIT" else app.auth_config_json

    auth_hdrs = build_auth_headers(auth_type, auth_config)
    final_headers.update(auth_hdrs)

    if rule.headers_json:
        try:
            hdrs_list = json.loads(rule.headers_json) if isinstance(rule.headers_json, str) else rule.headers_json
            if isinstance(hdrs_list, list):
                for h in hdrs_list:
                    hk = h.get("key") or h.get("name")
                    hv = h.get("value", "")
                    if hk:
                        final_headers[hk] = resolve_dynamic_variables(hv, doc_context)
            elif isinstance(hdrs_list, dict):
                for hk, hv in hdrs_list.items():
                    final_headers[hk] = resolve_dynamic_variables(str(hv), doc_context)
        except Exception:
            pass

    body_bytes = None
    body_type = (rule.body_type or "NONE").upper()
    payload_src = (getattr(rule, "payload_source", "") or "MAPPING").upper()
    sp_name = getattr(rule, "stored_procedure_name", None)

    if method in ["GET", "HEAD", "OPTIONS"] and body_type == "NONE":
        return method, final_url, final_headers, None

    if body_type != "NONE":
        content_type = rule.content_type or "application/json"
        
        # SQL Stored Procedure dynamic payload generation mode
        if payload_src == "SQL_PROCEDURE" or body_type == "SQL_PROCEDURE" or sp_name:
            content_type = "application/json"
            sp_target_name = sp_name or "sp_GetApprovalCallbackPayload"
            doc_key_val = doc_context.get("primaryKey") or doc_context.get("documentNumber") or ""
            sp_json_payload = execute_sp_for_callback_payload(db, sp_target_name, doc_key_val, doc_context)
            body_bytes = sp_json_payload.encode("utf-8")

        elif rule.raw_payload_template:
            resolved_template = resolve_dynamic_variables(rule.raw_payload_template, doc_context)
            body_bytes = resolved_template.encode("utf-8")
        elif body_type == "JSON":
            content_type = "application/json"
            payload_dict = {}
            if rule.payload_mapping_json:
                try:
                    mapping = json.loads(rule.payload_mapping_json) if isinstance(rule.payload_mapping_json, str) else rule.payload_mapping_json
                    if isinstance(mapping, list):
                        for m in mapping:
                            tp_field = m.get("thirdPartyField") or m.get("field")
                            src_field = m.get("sourceField") or m.get("source")
                            if tp_field and src_field:
                                payload_dict[tp_field] = doc_context.get(src_field, resolve_dynamic_variables(str(src_field), doc_context))
                    elif isinstance(mapping, dict):
                        for tp_field, src_field in mapping.items():
                            payload_dict[tp_field] = doc_context.get(src_field, resolve_dynamic_variables(str(src_field), doc_context))
                except Exception:
                    pass

            if not payload_dict:
                payload_dict = {
                    "primaryKey": doc_context.get("primaryKey"),
                    "documentNumber": doc_context.get("documentNumber"),
                    "approvalStatus": doc_context.get("approvalStatus")
                }

            body_bytes = json.dumps(payload_dict, indent=2).encode("utf-8")

        elif body_type == "FORM_URLENCODED":
            content_type = "application/x-www-form-urlencoded"
            form_dict = {}
            if rule.payload_mapping_json:
                try:
                    mapping = json.loads(rule.payload_mapping_json)
                    for m in mapping:
                        form_dict[m.get("thirdPartyField")] = doc_context.get(m.get("sourceField"), "")
                except Exception:
                    pass
            body_bytes = urllib.parse.urlencode(form_dict).encode("utf-8")
        elif body_type == "RAW_TEXT" or body_type == "XML":
            content_type = rule.content_type or ("application/xml" if body_type == "XML" else "text/plain")
            raw_text = resolve_dynamic_variables(rule.raw_payload_template or "", doc_context)
            body_bytes = raw_text.encode("utf-8")

        final_headers["Content-Type"] = content_type

    # Cryptographic HMAC-SHA256 Payload Signature
    secret_key = None
    if app and app.auth_config_json:
        try:
            ac = json.loads(app.auth_config_json)
            secret_key = ac.get("api_key") or ac.get("token") or ac.get("secret")
        except Exception:
            pass
    if not secret_key and app:
        secret_key = app.code
    if not secret_key:
        secret_key = "DocuFlowSecretKey"

    ts = int(time.time())
    payload_str = body_bytes.decode("utf-8", errors="ignore") if body_bytes else ""
    string_to_sign = f"{ts}.{payload_str}".encode("utf-8")
    sig_hash = hmac.new(secret_key.encode("utf-8"), string_to_sign, hashlib.sha256).hexdigest()
    final_headers["X-Approval-Signature"] = f"t={ts},v1={sig_hash}"

    return method, final_url, final_headers, body_bytes

def execute_callback_event(db: Session, event_id: int) -> Dict[str, Any]:
    """Executes a single CallbackEvent outbound request, logs CallbackAttempt, and updates status."""
    event = db.query(CallbackEvent).filter(CallbackEvent.id == event_id).first()
    if not event:
        return {"success": False, "error": f"CallbackEvent '{event_id}' not found"}

    rule = event.rule
    app = event.application
    doc = event.document

    if not rule or not app or not doc:
        event.status = "FAILED"
        db.commit()
        return {"success": False, "error": "Associated Rule, Application, or Document is missing"}

    doc_context = build_document_context(doc, decision=event.decision, event_id=event.event_id)
    doc_context["applicationCode"] = app.code

    attempt_num = event.attempt_count + 1
    event.attempt_count = attempt_num
    event.status = "SENDING"
    db.commit()

    max_attempts = event.max_attempts or 3
    if rule.retry_config_json:
        try:
            rc = json.loads(rule.retry_config_json)
            max_attempts = int(rc.get("max_attempts", max_attempts))
        except Exception:
            pass

    doc_context["attemptNumber"] = attempt_num
    doc_context["maxAttempts"] = max_attempts

    start_time = time.time()
    last_error = None
    status_code = None
    resp_body = ""
    resp_headers_str = ""

    try:
        method, final_url, final_headers, body_bytes = build_callback_request(rule, app, doc_context, db=db)

        timeout = rule.timeout_seconds or 30
        req = urllib.request.Request(
            url=final_url,
            data=body_bytes,
            headers=final_headers,
            method=method
        )

        with urllib.request.urlopen(req, timeout=timeout) as response:
            status_code = response.status
            resp_bytes = response.read()
            resp_body = resp_bytes.decode("utf-8", errors="ignore")
            resp_headers_dict = dict(response.headers)
            resp_headers_str = json.dumps(resp_headers_dict)

            elapsed_ms = int((time.time() - start_time) * 1000)

            valid_codes = [200, 201, 202, 204]
            if rule.success_criteria_json:
                try:
                    sc = json.loads(rule.success_criteria_json)
                    if isinstance(sc, list) and sc:
                        valid_codes = [int(x) for x in sc]
                except Exception:
                    pass

            is_success = status_code in valid_codes

            attempt = CallbackAttempt(
                callback_event_id=event.id,
                attempt_number=attempt_num,
                http_method=method,
                request_url=final_url,
                request_headers_json=json.dumps(mask_sensitive_headers(final_headers)),
                request_body=body_bytes.decode("utf-8", errors="ignore") if body_bytes else None,
                response_status_code=status_code,
                response_headers_json=resp_headers_str,
                response_body=resp_body[:4000],
                response_time_ms=elapsed_ms,
                status="DELIVERED" if is_success else "FAILED",
                error_message=None if is_success else f"HTTP Status {status_code} not in expected success criteria {valid_codes}"
            )
            db.add(attempt)

            if is_success:
                event.status = "DELIVERED"
                event.next_retry_at = None
                db.commit()
                return {"success": True, "status_code": status_code, "attempt": attempt_num, "response": resp_body[:500]}

            last_error = f"HTTP {status_code}: {resp_body[:300]}"

    except urllib.error.HTTPError as he:
        elapsed_ms = int((time.time() - start_time) * 1000)
        status_code = he.code
        resp_body = he.read().decode("utf-8", errors="ignore")
        last_error = f"HTTP Error {he.code}: {resp_body[:300]}"
        
        attempt = CallbackAttempt(
            callback_event_id=event.id,
            attempt_number=attempt_num,
            http_method=rule.http_method or "POST",
            request_url=rule.custom_url or app.base_url,
            request_headers_json=json.dumps(mask_sensitive_headers(build_auth_headers(app.auth_type, app.auth_config_json))),
            request_body=None,
            response_status_code=status_code,
            response_body=resp_body[:4000],
            response_time_ms=elapsed_ms,
            status="FAILED",
            error_message=last_error
        )
        db.add(attempt)

    except Exception as ex:
        elapsed_ms = int((time.time() - start_time) * 1000)
        last_error = str(ex)
        attempt = CallbackAttempt(
            callback_event_id=event.id,
            attempt_number=attempt_num,
            http_method=rule.http_method or "POST",
            request_url=rule.custom_url or app.base_url,
            request_headers_json=json.dumps(mask_sensitive_headers(build_auth_headers(app.auth_type, app.auth_config_json))),
            request_body=None,
            response_status_code=status_code,
            response_body=None,
            response_time_ms=elapsed_ms,
            status="FAILED",
            error_message=last_error
        )
        db.add(attempt)

    max_attempts = event.max_attempts or 3
    if rule.retry_config_json:
        try:
            rc = json.loads(rule.retry_config_json)
            max_attempts = int(rc.get("max_attempts", max_attempts))
        except Exception:
            pass

    event.max_attempts = max_attempts

    if attempt_num < max_attempts:
        event.status = "RETRYING"
        delay_sec = 30 * (2 ** (attempt_num - 1))
        event.next_retry_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=delay_sec)
    else:
        event.status = "FAILED"
        event.next_retry_at = None

    db.commit()
    return {"success": False, "status_code": status_code, "error": last_error, "attempt": attempt_num}

def dispatch_approval_callback_events(db: Session, document_id: str, decision: str) -> List[Dict[str, Any]]:
    """
    Main hook called on FDO Final Decision (APPROVED / REJECTED).
    Evaluates all active CallbackRules, matches conditions, creates CallbackEvents, and dispatches callbacks.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        return []

    rules = db.query(CallbackRule).join(ThirdPartyApplication).filter(
        CallbackRule.status == "ACTIVE",
        ThirdPartyApplication.status == "Active",
        CallbackRule.trigger_event == "FDO_FINAL_DECISION",
        CallbackRule.run_when.in_([decision.upper(), "BOTH"])
    ).order_by(CallbackRule.priority.asc()).all()

    if not rules:
        return []

    results = []
    base_doc_context = build_document_context(doc, decision=decision)

    for rule in rules:
        app = rule.application
        if not app or app.status != "Active":
            continue

        doc_context = dict(base_doc_context)
        doc_context["applicationCode"] = app.code

        if not evaluate_rule_conditions(rule.conditions_json, doc_context):
            continue

        unique_suffix = str(uuid.uuid4())[:8].upper()
        event_id_str = f"APPROVAL-{doc.doc_num or doc.id}-{decision.upper()}-{unique_suffix}"

        event = CallbackEvent(
            event_id=event_id_str,
            document_id=doc.id,
            rule_id=rule.id,
            application_id=app.id,
            source_primary_key=doc_context["primaryKey"],
            document_number=doc_context["documentNumber"],
            decision=decision.upper(),
            status="PENDING",
            attempt_count=0,
            max_attempts=3
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        res = execute_callback_event(db, event.id)
        results.append({
            "event_id": event_id_str,
            "application": app.name,
            "rule": rule.rule_name,
            "result": res
        })

    return results
