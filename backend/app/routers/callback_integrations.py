import json
import time
import datetime
import urllib.request
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    Document,
    ThirdPartyApplication,
    CallbackRule,
    CallbackEvent,
    CallbackAttempt,
    IntegrationAuditHistory
)
from app.schemas import (
    ThirdPartyApplicationCreate,
    ThirdPartyApplicationUpdate,
    ThirdPartyApplicationResponse,
    CallbackRuleCreate,
    CallbackRuleUpdate,
    CallbackRuleResponse,
    TestCallbackRequest
)
from app.services.callback_service import (
    build_document_context,
    build_callback_request,
    execute_callback_event,
    mask_sensitive_headers
)

router = APIRouter(prefix="/api/integrations/v2", tags=["Approval Callback Integrations Engine"])

def helper_serialize_json_field(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    return json.dumps(val)

def record_audit(db: Session, entity_type: str, entity_id: int, action: str, prev: Any = None, new_val: Any = None, user: str = "System Admin"):
    try:
        audit = IntegrationAuditHistory(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            previous_value_json=json.dumps(prev, default=str) if prev else None,
            new_value_json=json.dumps(new_val, default=str) if new_val else None,
            changed_by=user,
            timestamp=datetime.datetime.utcnow()
        )
        db.add(audit)
        db.commit()
    except Exception as e:
        print(f"[Audit Recording Error] {e}")

# =========================================================================
# 1. APPLICATIONS MANAGEMENT
# =========================================================================

@router.get("/applications")
def list_applications(db: Session = Depends(get_db)):
    """Returns list of configured third-party applications with rule counts and last activity."""
    apps = db.query(ThirdPartyApplication).order_by(ThirdPartyApplication.id.desc()).all()
    results = []
    for a in apps:
        rules_count = db.query(CallbackRule).filter(CallbackRule.application_id == a.id).count()
        last_evt = db.query(CallbackEvent).filter(CallbackEvent.application_id == a.id).order_by(CallbackEvent.created_at.desc()).first()
        
        last_callback_str = last_evt.created_at.strftime("%I:%M %p") if last_evt and last_evt.created_at else None
        
        results.append({
            "id": a.id,
            "name": a.name,
            "code": a.code,
            "description": a.description,
            "base_url": a.base_url,
            "environment": a.environment or "Production",
            "status": a.status or "Active",
            "auth_type": a.auth_type or "None",
            "auth_config_json": a.auth_config_json,
            "rules_count": rules_count,
            "last_callback": last_callback_str,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None
        })
    return {"success": True, "count": len(results), "data": results}

@router.post("/applications")
def create_application(body: ThirdPartyApplicationCreate, db: Session = Depends(get_db)):
    """Creates a new third-party application configuration."""
    existing = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.code == body.code.strip().upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Application code '{body.code}' already exists. Code must be unique.")

    app_obj = ThirdPartyApplication(
        name=body.name.strip(),
        code=body.code.strip().upper(),
        description=body.description,
        base_url=body.base_url.strip(),
        environment=body.environment or "Production",
        status=body.status or "Active",
        auth_type=body.auth_type or "None",
        auth_config_json=helper_serialize_json_field(body.auth_config_json),
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow()
    )
    db.add(app_obj)
    db.commit()
    db.refresh(app_obj)

    record_audit(db, "APPLICATION", app_obj.id, "CREATED", new_val={"name": app_obj.name, "code": app_obj.code})
    return {"success": True, "data": app_obj}

@router.get("/applications/{app_id}")
def get_application(app_id: int, db: Session = Depends(get_db)):
    app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == app_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail=f"Application #{app_id} not found")
    return {"success": True, "data": app_obj}

@router.put("/applications/{app_id}")
def update_application(app_id: int, body: ThirdPartyApplicationUpdate, db: Session = Depends(get_db)):
    app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == app_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail=f"Application #{app_id} not found")

    prev_state = {"name": app_obj.name, "status": app_obj.status, "base_url": app_obj.base_url}

    if body.name is not None:
        app_obj.name = body.name.strip()
    if body.code is not None:
        new_code = body.code.strip().upper()
        if new_code != app_obj.code:
            existing = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.code == new_code).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Application code '{new_code}' is already taken.")
            app_obj.code = new_code
    if body.description is not None:
        app_obj.description = body.description
    if body.base_url is not None:
        app_obj.base_url = body.base_url.strip()
    if body.environment is not None:
        app_obj.environment = body.environment
    if body.status is not None:
        app_obj.status = body.status
    if body.auth_type is not None:
        app_obj.auth_type = body.auth_type
    if body.auth_config_json is not None:
        app_obj.auth_config_json = helper_serialize_json_field(body.auth_config_json)

    app_obj.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(app_obj)

    record_audit(db, "APPLICATION", app_obj.id, "UPDATED", prev=prev_state, new_val={"name": app_obj.name, "status": app_obj.status})
    return {"success": True, "data": app_obj}

@router.post("/applications/{app_id}/toggle-status")
def toggle_application_status(app_id: int, db: Session = Depends(get_db)):
    app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == app_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail=f"Application #{app_id} not found")

    new_status = "Inactive" if app_obj.status == "Active" else "Active"
    app_obj.status = new_status
    app_obj.updated_at = datetime.datetime.utcnow()
    db.commit()

    action_label = "ENABLED" if new_status == "Active" else "DISABLED"
    record_audit(db, "APPLICATION", app_obj.id, action_label, new_val={"status": new_status})
    return {"success": True, "status": new_status, "message": f"Application #{app_id} status set to {new_status}"}

@router.delete("/applications/{app_id}")
def delete_application(app_id: int, db: Session = Depends(get_db)):
    app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == app_id).first()
    if not app_obj:
        raise HTTPException(status_code=404, detail=f"Application #{app_id} not found")

    name = app_obj.name
    db.delete(app_obj)
    db.commit()

    record_audit(db, "APPLICATION", app_id, "DELETED", prev={"name": name})
    return {"success": True, "message": f"Application '{name}' deleted successfully"}


# =========================================================================
# 2. CALLBACK RULES MANAGEMENT
# =========================================================================

@router.get("/rules")
def list_callback_rules(application_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Lists all configured callback rules."""
    query = db.query(CallbackRule).join(ThirdPartyApplication)
    if application_id:
        query = query.filter(CallbackRule.application_id == application_id)
    
    rules = query.order_by(CallbackRule.priority.asc(), CallbackRule.id.desc()).all()
    results = []
    for r in rules:
        last_evt = db.query(CallbackEvent).filter(CallbackEvent.rule_id == r.id).order_by(CallbackEvent.created_at.desc()).first()
        last_exec_str = last_evt.created_at.strftime("%I:%M %p") if last_evt and last_evt.created_at else None

        results.append({
            "id": r.id,
            "rule_name": r.rule_name,
            "description": r.description,
            "application_id": r.application_id,
            "application_name": r.application.name if r.application else "Unknown",
            "application_code": r.application.code if r.application else "",
            "status": r.status or "ACTIVE",
            "priority": r.priority or 100,
            "trigger_event": r.trigger_event or "FDO_FINAL_DECISION",
            "run_when": r.run_when or "BOTH",
            "conditions_json": r.conditions_json,
            "http_method": r.http_method or "POST",
            "url_mode": r.url_mode or "INHERIT_BASE",
            "endpoint_path": r.endpoint_path,
            "custom_url": r.custom_url,
            "body_type": r.body_type or "JSON",
            "content_type": r.content_type or "application/json",
            "payload_mapping_json": r.payload_mapping_json,
            "raw_payload_template": r.raw_payload_template,
            "query_params_json": r.query_params_json,
            "headers_json": r.headers_json,
            "auth_override_type": r.auth_override_type or "INHERIT",
            "auth_override_config_json": r.auth_override_config_json,
            "timeout_seconds": r.timeout_seconds or 30,
            "success_criteria_json": r.success_criteria_json,
            "follow_redirects": bool(r.follow_redirects),
            "retry_config_json": r.retry_config_json,
            "last_execution": last_exec_str,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None
        })
    return {"success": True, "count": len(results), "data": results}

@router.post("/rules")
def create_callback_rule(body: CallbackRuleCreate, db: Session = Depends(get_db)):
    app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == body.application_id).first()
    if not app_obj:
        raise HTTPException(status_code=400, detail=f"Target Application #{body.application_id} does not exist.")

    rule = CallbackRule(
        rule_name=body.rule_name.strip(),
        description=body.description,
        application_id=body.application_id,
        status=body.status or "ACTIVE",
        priority=body.priority if body.priority is not None else 100,
        trigger_event=body.trigger_event or "FDO_FINAL_DECISION",
        run_when=body.run_when or "BOTH",
        conditions_json=helper_serialize_json_field(body.conditions_json),
        http_method=(body.http_method or "POST").upper(),
        url_mode=body.url_mode or "INHERIT_BASE",
        endpoint_path=body.endpoint_path,
        custom_url=body.custom_url,
        body_type=body.body_type or "JSON",
        payload_source=body.payload_source or "MAPPING",
        stored_procedure_name=body.stored_procedure_name,
        content_type=body.content_type or "application/json",
        payload_mapping_json=helper_serialize_json_field(body.payload_mapping_json),
        raw_payload_template=body.raw_payload_template,
        query_params_json=helper_serialize_json_field(body.query_params_json),
        headers_json=helper_serialize_json_field(body.headers_json),
        auth_override_type=body.auth_override_type or "INHERIT",
        auth_override_config_json=helper_serialize_json_field(body.auth_override_config_json),
        timeout_seconds=body.timeout_seconds or 30,
        success_criteria_json=helper_serialize_json_field(body.success_criteria_json),
        follow_redirects=bool(body.follow_redirects),
        retry_config_json=helper_serialize_json_field(body.retry_config_json),
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow()
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    record_audit(db, "RULE", rule.id, "CREATED", new_val={"rule_name": rule.rule_name, "app": app_obj.name})
    return {"success": True, "data": rule}

@router.get("/rules/{rule_id}")
def get_callback_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CallbackRule).filter(CallbackRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Callback rule #{rule_id} not found")
    return {"success": True, "data": rule}

@router.put("/rules/{rule_id}")
def update_callback_rule(rule_id: int, body: CallbackRuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(CallbackRule).filter(CallbackRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Callback rule #{rule_id} not found")

    prev_state = {"rule_name": rule.rule_name, "status": rule.status}

    if body.rule_name is not None:
        rule.rule_name = body.rule_name.strip()
    if body.description is not None:
        rule.description = body.description
    if body.application_id is not None:
        app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == body.application_id).first()
        if not app_obj:
            raise HTTPException(status_code=400, detail=f"Application #{body.application_id} does not exist")
        rule.application_id = body.application_id
    if body.status is not None:
        rule.status = body.status
    if body.priority is not None:
        rule.priority = body.priority
    if body.trigger_event is not None:
        rule.trigger_event = body.trigger_event
    if body.run_when is not None:
        rule.run_when = body.run_when
    if body.conditions_json is not None:
        rule.conditions_json = helper_serialize_json_field(body.conditions_json)
    if body.http_method is not None:
        rule.http_method = body.http_method.upper()
    if body.url_mode is not None:
        rule.url_mode = body.url_mode
    if body.endpoint_path is not None:
        rule.endpoint_path = body.endpoint_path
    if body.custom_url is not None:
        rule.custom_url = body.custom_url
    if body.body_type is not None:
        rule.body_type = body.body_type
    if body.payload_source is not None:
        rule.payload_source = body.payload_source
    if body.stored_procedure_name is not None:
        rule.stored_procedure_name = body.stored_procedure_name
    if body.content_type is not None:
        rule.content_type = body.content_type
    if body.payload_mapping_json is not None:
        rule.payload_mapping_json = helper_serialize_json_field(body.payload_mapping_json)
    if body.raw_payload_template is not None:
        rule.raw_payload_template = body.raw_payload_template
    if body.query_params_json is not None:
        rule.query_params_json = helper_serialize_json_field(body.query_params_json)
    if body.headers_json is not None:
        rule.headers_json = helper_serialize_json_field(body.headers_json)
    if body.auth_override_type is not None:
        rule.auth_override_type = body.auth_override_type
    if body.auth_override_config_json is not None:
        rule.auth_override_config_json = helper_serialize_json_field(body.auth_override_config_json)
    if body.timeout_seconds is not None:
        rule.timeout_seconds = body.timeout_seconds
    if body.success_criteria_json is not None:
        rule.success_criteria_json = helper_serialize_json_field(body.success_criteria_json)
    if body.follow_redirects is not None:
        rule.follow_redirects = bool(body.follow_redirects)
    if body.retry_config_json is not None:
        rule.retry_config_json = helper_serialize_json_field(body.retry_config_json)

    rule.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(rule)

    record_audit(db, "RULE", rule.id, "UPDATED", prev=prev_state, new_val={"rule_name": rule.rule_name, "status": rule.status})
    return {"success": True, "data": rule}

@router.post("/rules/{rule_id}/duplicate")
def duplicate_callback_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CallbackRule).filter(CallbackRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Callback rule #{rule_id} not found")

    new_rule = CallbackRule(
        rule_name=f"{rule.rule_name} (Copy)",
        description=rule.description,
        application_id=rule.application_id,
        status="DRAFT",
        priority=rule.priority,
        trigger_event=rule.trigger_event,
        run_when=rule.run_when,
        conditions_json=rule.conditions_json,
        http_method=rule.http_method,
        url_mode=rule.url_mode,
        endpoint_path=rule.endpoint_path,
        custom_url=rule.custom_url,
        body_type=rule.body_type,
        content_type=rule.content_type,
        payload_mapping_json=rule.payload_mapping_json,
        raw_payload_template=rule.raw_payload_template,
        query_params_json=rule.query_params_json,
        headers_json=rule.headers_json,
        auth_override_type=rule.auth_override_type,
        auth_override_config_json=rule.auth_override_config_json,
        timeout_seconds=rule.timeout_seconds,
        success_criteria_json=rule.success_criteria_json,
        follow_redirects=rule.follow_redirects,
        retry_config_json=rule.retry_config_json,
        created_at=datetime.datetime.utcnow(),
        updated_at=datetime.datetime.utcnow()
    )
    db.add(new_rule)
    db.commit()
    db.refresh(new_rule)

    record_audit(db, "RULE", new_rule.id, "DUPLICATED", new_val={"rule_name": new_rule.rule_name})
    return {"success": True, "data": new_rule}

@router.post("/rules/{rule_id}/toggle-status")
def toggle_rule_status(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CallbackRule).filter(CallbackRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Callback rule #{rule_id} not found")

    new_status = "INACTIVE" if rule.status == "ACTIVE" else "ACTIVE"
    rule.status = new_status
    rule.updated_at = datetime.datetime.utcnow()
    db.commit()

    action_label = "ENABLED" if new_status == "ACTIVE" else "DISABLED"
    record_audit(db, "RULE", rule.id, action_label, new_val={"status": new_status})
    return {"success": True, "status": new_status, "message": f"Rule #{rule_id} status changed to {new_status}"}

@router.delete("/rules/{rule_id}")
def delete_callback_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(CallbackRule).filter(CallbackRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=f"Callback rule #{rule_id} not found")

    name = rule.rule_name
    db.delete(rule)
    db.commit()

    record_audit(db, "RULE", rule_id, "DELETED", prev={"rule_name": name})
    return {"success": True, "message": f"Callback rule '{name}' deleted successfully"}


# =========================================================================
# 3. TEST CALLBACK EXECUTION & PREVIEW
# =========================================================================

@router.post("/test")
def execute_test_callback(body: TestCallbackRequest, db: Session = Depends(get_db)):
    """
    Executes a test callback against a real or sample endpoint without modifying database rules.
    Returns preview of resolved URL, Headers, Body, and execution result.
    """
    app_obj = None
    rule_obj = None

    if body.rule_id:
        rule_obj = db.query(CallbackRule).filter(CallbackRule.id == body.rule_id).first()
        if rule_obj:
            app_obj = rule_obj.application

    if not app_obj and body.application_id:
        app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == body.application_id).first()

    if not app_obj and body.rule_config and body.rule_config.application_id:
        app_obj = db.query(ThirdPartyApplication).filter(ThirdPartyApplication.id == body.rule_config.application_id).first()

    # Construct mock application if missing
    if not app_obj:
        app_obj = ThirdPartyApplication(
            name="Sample Target Application",
            code="SAMPLE_APP",
            base_url="https://httpbin.org",
            auth_type="None"
        )

    # Construct rule from config or existing rule
    if not rule_obj and body.rule_config:
        cfg = body.rule_config
        rule_obj = CallbackRule(
            rule_name=cfg.rule_name,
            application_id=app_obj.id or 1,
            http_method=cfg.http_method or "POST",
            url_mode=cfg.url_mode or "INHERIT_BASE",
            endpoint_path=cfg.endpoint_path or "/post",
            custom_url=cfg.custom_url,
            body_type=cfg.body_type or "JSON",
            content_type=cfg.content_type or "application/json",
            payload_mapping_json=helper_serialize_json_field(cfg.payload_mapping_json),
            raw_payload_template=cfg.raw_payload_template,
            query_params_json=helper_serialize_json_field(cfg.query_params_json),
            headers_json=helper_serialize_json_field(cfg.headers_json),
            auth_override_type=cfg.auth_override_type or "INHERIT",
            auth_override_config_json=helper_serialize_json_field(cfg.auth_override_config_json),
            timeout_seconds=cfg.timeout_seconds or 10
        )

    if not rule_obj:
        rule_obj = CallbackRule(
            rule_name="Default Test Callback Rule",
            application_id=app_obj.id or 1,
            http_method="POST",
            url_mode="INHERIT_BASE",
            endpoint_path="/post",
            body_type="JSON"
        )

    sample_ctx = {
        "primaryKey": body.sample_primary_key or "TEST-84932",
        "documentNumber": body.sample_document_number or "TEST-INV-1024",
        "approvalStatus": (body.sample_approval_status or "APPROVED").upper(),
        "company": body.sample_company or "VCC",
        "documentType": body.sample_document_type or "AP INVOICE",
        "category": "Raw Materials",
        "branch": "TN-PLANT-01",
        "costCenter": "FIN-CC-102",
        "approvedBy": "QA Test Admin",
        "approvalDate": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "rejectionReason": "Test rejection notice" if (body.sample_approval_status or "").upper() == "REJECTED" else "",
        "eventId": f"TEST-EVT-{int(time.time())}"
    }

    try:
        method, final_url, final_headers, body_bytes = build_callback_request(rule_obj, app_obj, sample_ctx, db=db)

        request_preview = {
            "method": method,
            "url": final_url,
            "headers": mask_sensitive_headers(final_headers),
            "body": body_bytes.decode("utf-8", errors="ignore") if body_bytes else None
        }

        parsed_u = urllib.parse.urlparse(final_url)
        if parsed_u.scheme not in ("http", "https") or not parsed_u.netloc:
            return {
                "success": False,
                "error": "Invalid or untrusted target URL scheme. Only HTTP and HTTPS allowed.",
                "request_preview": request_preview
            }

        # Perform actual HTTP request
        start = time.time()
        req = urllib.request.Request(
            url=final_url,
            data=body_bytes,
            headers=final_headers,
            method=method
        )
        with urllib.request.urlopen(req, timeout=rule_obj.timeout_seconds or 15) as resp:
            elapsed_ms = int((time.time() - start) * 1000)
            resp_body = resp.read().decode("utf-8", errors="ignore")
            
            return {
                "success": True,
                "status_code": resp.status,
                "response_time_ms": elapsed_ms,
                "request_preview": request_preview,
                "response_body": resp_body[:2000]
            }
    except urllib.error.HTTPError as he:
        resp_body = he.read().decode("utf-8", errors="ignore")
        return {
            "success": False,
            "status_code": he.code,
            "error": f"HTTP Error {he.code}",
            "request_preview": request_preview if 'request_preview' in locals() else None,
            "response_body": resp_body[:2000]
        }
    except Exception as ex:
        return {
            "success": False,
            "error": f"Callback execution failed: {type(ex).__name__}",
            "request_preview": request_preview if 'request_preview' in locals() else None
        }


# =========================================================================
# 4. INTEGRATION LOGS & MANUAL RETRIES
# =========================================================================

@router.get("/logs")
def list_integration_logs(
    application_id: Optional[int] = None,
    rule_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    decision: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """Returns real-time CallbackEvent logs for auditing and monitoring."""
    query = db.query(CallbackEvent).join(ThirdPartyApplication).join(CallbackRule)

    if application_id:
        query = query.filter(CallbackEvent.application_id == application_id)
    if rule_id:
        query = query.filter(CallbackEvent.rule_id == rule_id)
    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(CallbackEvent.status == status_filter.upper())
    if decision and decision.upper() != "ALL":
        query = query.filter(CallbackEvent.decision == decision.upper())
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            (CallbackEvent.event_id.ilike(s)) |
            (CallbackEvent.document_number.ilike(s)) |
            (CallbackEvent.source_primary_key.ilike(s))
        )

    events = query.order_by(CallbackEvent.created_at.desc()).limit(limit).all()

    data = []
    for e in events:
        data.append({
            "id": e.id,
            "event_id": e.event_id,
            "document_id": e.document_id,
            "document_number": e.document_number or e.document_id,
            "primary_key": e.source_primary_key or e.document_id,
            "application_id": e.application_id,
            "application_name": e.application.name if e.application else "Unknown",
            "rule_id": e.rule_id,
            "rule_name": e.rule.rule_name if e.rule else "Unknown",
            "decision": e.decision,
            "method": e.rule.http_method if e.rule else "POST",
            "status": e.status,
            "attempt_count": e.attempt_count,
            "max_attempts": e.max_attempts,
            "next_retry_at": e.next_retry_at.isoformat() if e.next_retry_at else None,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "updated_at": e.updated_at.isoformat() if e.updated_at else None
        })

    return {"success": True, "count": len(data), "data": data}

@router.get("/logs/{event_id}")
def get_integration_log_detail(event_id: str, db: Session = Depends(get_db)):
    """Returns detailed information for a specific CallbackEvent including all retry attempts."""
    # Can query by numeric id or event_id string
    if event_id.isdigit():
        evt = db.query(CallbackEvent).filter(CallbackEvent.id == int(event_id)).first()
    else:
        evt = db.query(CallbackEvent).filter(CallbackEvent.event_id == event_id).first()

    if not evt:
        raise HTTPException(status_code=404, detail=f"CallbackEvent '{event_id}' not found")

    attempts = db.query(CallbackAttempt).filter(CallbackAttempt.callback_event_id == evt.id).order_by(CallbackAttempt.attempt_number.asc()).all()

    attempts_data = []
    for a in attempts:
        attempts_data.append({
            "id": a.id,
            "attempt_number": a.attempt_number,
            "http_method": a.http_method,
            "request_url": a.request_url,
            "request_headers": a.request_headers_json,
            "request_body": a.request_body,
            "response_status_code": a.response_status_code,
            "response_headers": a.response_headers_json,
            "response_body": a.response_body,
            "response_time_ms": a.response_time_ms,
            "status": a.status,
            "error_message": a.error_message,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None
        })

    return {
        "success": True,
        "event": {
            "id": evt.id,
            "event_id": evt.event_id,
            "document_id": evt.document_id,
            "document_number": evt.document_number,
            "primary_key": evt.source_primary_key,
            "decision": evt.decision,
            "status": evt.status,
            "attempt_count": evt.attempt_count,
            "max_attempts": evt.max_attempts,
            "created_at": evt.created_at.isoformat() if evt.created_at else None,
            "application_name": evt.application.name if evt.application else "",
            "rule_name": evt.rule.rule_name if evt.rule else ""
        },
        "attempts": attempts_data
    }

@router.post("/logs/{event_id}/retry")
def manual_retry_callback(event_id: str, db: Session = Depends(get_db)):
    """
    Manually retries a failed or pending callback event using the EXACT SAME event_id for idempotency safety.
    """
    if event_id.isdigit():
        evt = db.query(CallbackEvent).filter(CallbackEvent.id == int(event_id)).first()
    else:
        evt = db.query(CallbackEvent).filter(CallbackEvent.event_id == event_id).first()

    if not evt:
        raise HTTPException(status_code=404, detail=f"CallbackEvent '{event_id}' not found")

    res = execute_callback_event(db, evt.id)
    return {
        "success": res.get("success", False),
        "event_id": evt.event_id,
        "message": "Manual retry executed successfully" if res.get("success") else "Manual retry attempt failed",
        "result": res
    }

@router.post("/logs/bulk-retry")
def bulk_retry_failed_callbacks(db: Session = Depends(get_db)):
    """
    Bulk re-dispatches all failed callback events using idempotency safety.
    """
    failed_events = db.query(CallbackEvent).filter(CallbackEvent.status.in_(["FAILED", "RETRYING"])).all()
    results = []
    for evt in failed_events:
        res = execute_callback_event(db, evt.id)
        results.append({
            "event_id": evt.event_id,
            "success": res.get("success", False),
            "result": res
        })
    return {
        "success": True,
        "total_retried": len(failed_events),
        "successful_count": sum(1 for r in results if r["success"]),
        "failed_count": sum(1 for r in results if not r["success"]),
        "results": results
    }

@router.get("/audit-history")
def get_audit_history(limit: int = 50, db: Session = Depends(get_db)):
    """Returns configuration change audit history for integration settings."""
    audits = db.query(IntegrationAuditHistory).order_by(IntegrationAuditHistory.timestamp.desc()).limit(limit).all()
    return {
        "success": True,
        "data": [
            {
                "id": a.id,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "action": a.action,
                "previous_value": a.previous_value_json,
                "new_value": a.new_value_json,
                "changed_by": a.changed_by,
                "timestamp": a.timestamp.isoformat() if a.timestamp else None
            }
            for a in audits
        ]
    }
