"""
Customer Feedback (CFMS) administration proxy: /api/admin/cfms/*  ->  CFMS /internal/v1/* (same sub-path).
CFMS <-> DocuFlow Integration Specification v2, section 8A/8B.

- Every route requires a logged-in DocuFlow user and a cfms:* permission derived from server-side RBAC.
    cfms:view, cfms:sync, cfms:settings : granted through the normal RBAC check (Administrator roles have them).
    cfms:admin                           : must be EXPLICITLY granted to the user's role (Super Admin only).
      The generic "role name contains admin" shortcut of check_permission does NOT apply to cfms:admin.
- The browser never talks to CFMS and never receives CFMS secrets; only CFMS's JSON is passed through.
- Idempotency-Key (UUIDv4) from the browser is required on POST /sync/now, POST /sync/schedule,
  POST /salesforce/login-test and PUT /salesforce/password, and forwarded unchanged.
- Request bodies are never logged (passwords!).
"""

import datetime
import logging
import re
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy.orm import Session

from app.auth import get_current_active_user
from app.database.connection import get_db
from app.database.models import User
from app.services import cfms_client
from app.services.rbac_service import check_permission, get_role_permissions_set

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/cfms", tags=["Customer Feedback (CFMS)"])

CFMS_PERMISSIONS = ("cfms:view", "cfms:sync", "cfms:settings", "cfms:admin")
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30), "Asia/Kolkata")  # no daylight saving
EMAIL_RE = re.compile(r"^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$")
UUID_V4_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
JOB_ID_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")
MAX_RECIPIENTS = 500


# ---------------------------------------------------------------------------- errors
def err(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}, **extra},
                        headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------------------- permissions
def _role_permission_codes(user: User, db: Session) -> set:
    role_id = getattr(user, "role_id", None)
    if not role_id and getattr(user, "role", None):
        from app.database.models import Role
        name = user.role.strip()
        row = db.query(Role.id).filter((Role.code.ilike(name)) | (Role.name.ilike(name))).first()
        role_id = row[0] if row else None
    if not role_id:
        return set()
    try:
        return set(get_role_permissions_set(role_id, db))
    except Exception:  # pragma: no cover - defensive
        logger.exception("Could not read role permissions for CFMS check")
        return set()


def cfms_permissions_for(user: User, db: Session) -> List[str]:
    """Effective cfms:* codes for this user (server-side RBAC only; never browser-supplied)."""
    if not user or not getattr(user, "is_active", False):
        return []
    granted = [code for code in ("cfms:view", "cfms:sync", "cfms:settings") if check_permission(user, code, db)]
    if "cfms:admin" in _role_permission_codes(user, db) or getattr(user, "is_superuser", False) is True:
        granted.append("cfms:admin")
    return sorted(granted)


def require_cfms(code: str):
    def dependency(user: User = Depends(get_current_active_user), db: Session = Depends(get_db)) -> Tuple[User, List[str]]:
        perms = cfms_permissions_for(user, db)
        if code not in perms:
            raise _Forbidden(code)
        return user, perms
    return dependency


class _Forbidden(Exception):
    def __init__(self, code: str):
        self.code = code


def install_exception_handlers(app):
    """Registered by main.py so 403s use the {error:{code,message}} shape."""
    @app.exception_handler(_Forbidden)
    async def _forbidden_handler(_request, exc: _Forbidden):  # noqa: ANN001
        return err(403, "FORBIDDEN", f"Permission {exc.code} is required.")


# ---------------------------------------------------------------------------- rate limits (per worker)
class _Limiter:
    """Sliding-window limiter. A retry of the same click (same Idempotency-Key) is not counted twice.
    CFMS enforces its own persistent limits as well."""

    def __init__(self):
        self._lock = threading.Lock()
        self._events: Dict[str, List[Tuple[float, str]]] = {}

    def take(self, bucket: str, limit: int, window: float, idem: str = "") -> Optional[int]:
        now = time.monotonic()
        with self._lock:
            events = [(t, k) for (t, k) in self._events.get(bucket, []) if now - t < window]
            if idem and any(k == idem for (_, k) in events):
                self._events[bucket] = events
                return None
            if len(events) >= limit:
                self._events[bucket] = events
                return max(1, int(window - (now - events[0][0])))
            events.append((now, idem))
            self._events[bucket] = events
            return None

    def reset(self):
        with self._lock:
            self._events.clear()


limiter = _Limiter()


def _rate(bucket: str, limit: int, window: float, idem: str = "") -> Optional[JSONResponse]:
    retry = limiter.take(bucket, limit, window, idem)
    if retry is not None:
        return err(429, "RATE_LIMITED", "Too many requests; please wait and try again.", retryAfterSeconds=retry)
    return None


# ---------------------------------------------------------------------------- validation helpers
def _today_ist() -> str:
    return datetime.datetime.now(IST).date().isoformat()


def _valid_report_date(value: Any) -> Optional[JSONResponse]:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return err(422, "INVALID_DATE", "reportDate must be YYYY-MM-DD.")
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        return err(422, "INVALID_DATE", "reportDate is not a valid calendar date.")
    if value > _today_ist():
        return err(422, "FUTURE_DATE", "Future report dates are not allowed.")
    return None


def _valid_email(value: Any) -> bool:
    return isinstance(value, str) and len(value) <= 254 and bool(EMAIL_RE.match(value.strip()))


async def _json_body(request: Request) -> Tuple[Optional[dict], Optional[JSONResponse]]:
    raw = await request.body()
    if not raw:
        return {}, None
    if len(raw) > 64 * 1024:
        return None, err(413, "BODY_TOO_LARGE", "Request body too large.")
    try:
        import json
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None, err(400, "INVALID_JSON", "Request body is not valid JSON.")
    if not isinstance(data, dict):
        return None, err(422, "INVALID_INPUT", "Request body must be a JSON object.")
    return data, None


def _idempotency_key(request: Request) -> Tuple[Optional[str], Optional[JSONResponse]]:
    key = (request.headers.get("Idempotency-Key") or "").strip()
    if not key:
        return None, err(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header (UUIDv4) is required.")
    if not UUID_V4_RE.match(key):
        return None, err(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be a UUIDv4.")
    return key.lower(), None


# ---------------------------------------------------------------------------- forwarding
def _forward(method: str, path: str, auth: Tuple[User, List[str]], *, query: Optional[dict] = None,
             body: Any = None, idem: Optional[str] = None) -> Response:
    user, perms = auth
    try:
        r = cfms_client.call(method, path, actor=user.username, permissions=perms, query=query,
                             json_body=body, idempotency_key=idem)
    except cfms_client.CfmsNotConfigured as exc:
        logger.error("CFMS integration not configured: %s", exc)
        return err(503, "CFMS_NOT_CONFIGURED", "The Customer Feedback service is not configured on this server.")
    except httpx.TransportError as exc:
        logger.warning("CFMS unavailable (%s %s): %s", method, path, type(exc).__name__)
        return err(502, "CFMS_UNAVAILABLE", "The Customer Feedback service is not reachable. Try again later.")
    if r.status == 204 or r.body is None:
        return Response(status_code=r.status, headers={"Cache-Control": "no-store"})
    if r.status >= 400 and not (isinstance(r.body, dict) and isinstance(r.body.get("error"), dict)):
        return err(r.status, "CFMS_ERROR", "The Customer Feedback service returned an error.")
    return JSONResponse(status_code=r.status, content=r.body, headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------------------- routes
@router.get("/permissions")
def my_permissions(user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    """DocuFlow-only helper for the UI (hide tab/controls). Not forwarded to CFMS."""
    return JSONResponse({"permissions": cfms_permissions_for(user, db)}, headers={"Cache-Control": "no-store"})


@router.get("/settings")
def get_settings(auth=Depends(require_cfms("cfms:view"))):
    return _forward("GET", "/settings", auth)


@router.post("/sync/now")
async def sync_now(request: Request, auth=Depends(require_cfms("cfms:sync"))):
    idem, e = _idempotency_key(request)
    if e:
        return e
    data, e = await _json_body(request)
    if e:
        return e
    e = _valid_report_date(data.get("reportDate"))
    if e:
        return e
    limited = _rate(f"sync-now:{auth[0].username}", 1, 60, idem)
    if limited:
        return limited
    return _forward("POST", "/sync/now", auth, body={"reportDate": data["reportDate"]}, idem=idem)


@router.post("/sync/schedule")
async def sync_schedule(request: Request, auth=Depends(require_cfms("cfms:sync"))):
    idem, e = _idempotency_key(request)
    if e:
        return e
    data, e = await _json_body(request)
    if e:
        return e
    e = _valid_report_date(data.get("reportDate"))
    if e:
        return e
    return _forward("POST", "/sync/schedule", auth, body={"reportDate": data["reportDate"]}, idem=idem)


@router.post("/sync/{job_id}/cancel")
def sync_cancel(job_id: str, auth=Depends(require_cfms("cfms:sync"))):
    if not JOB_ID_RE.match(job_id):
        return err(422, "INVALID_JOB_ID", "Invalid job id.")
    return _forward("POST", f"/sync/{job_id}/cancel", auth)


@router.get("/jobs/{job_id}")
def get_job(job_id: str, auth=Depends(require_cfms("cfms:view"))):
    if not JOB_ID_RE.match(job_id):
        return err(422, "INVALID_JOB_ID", "Invalid job id.")
    return _forward("GET", f"/jobs/{job_id}", auth)


@router.get("/jobs")
def list_jobs(limit: int = 20, auth=Depends(require_cfms("cfms:view"))):
    return _forward("GET", "/jobs", auth, query={"limit": max(1, min(int(limit), 100))})


@router.get("/calendar")
def calendar(month: str = "", auth=Depends(require_cfms("cfms:view"))):
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month or ""):
        return err(422, "INVALID_MONTH", "month must be YYYY-MM.")
    return _forward("GET", "/calendar", auth, query={"month": month})


@router.get("/schedule")
def get_schedule(auth=Depends(require_cfms("cfms:view"))):
    return _forward("GET", "/schedule", auth)


@router.put("/schedule")
async def put_schedule(request: Request, auth=Depends(require_cfms("cfms:admin"))):
    data, e = await _json_body(request)
    if e:
        return e
    errors = []
    start = data.get("startTime")
    if not isinstance(start, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", start):
        errors.append("Start time must be HH:MM (24-hour, India time).")
    attempts = data.get("attempts")
    if not isinstance(attempts, int) or isinstance(attempts, bool) or not 1 <= attempts <= 6:
        errors.append("Total attempts must be a whole number from 1 to 6.")
    interval = data.get("intervalMinutes")
    if not isinstance(interval, int) or isinstance(interval, bool) or not 15 <= interval <= 240:
        errors.append("Retry interval must be 15-240 minutes.")
    if errors:
        return err(422, "VALIDATION_FAILED", " ".join(errors), errors=errors)
    return _forward("PUT", "/schedule", auth, body={"startTime": start, "attempts": attempts, "intervalMinutes": interval})


@router.put("/salesforce/password")
async def put_password(request: Request, auth=Depends(require_cfms("cfms:admin"))):
    # Never log this request or its body.
    idem, e = _idempotency_key(request)
    if e:
        return e
    data, e = await _json_body(request)
    if e:
        return e
    pw, confirm = data.get("newPassword"), data.get("confirmPassword")
    if not isinstance(pw, str) or not isinstance(confirm, str) or pw != confirm:
        return err(422, "INVALID_PASSWORD", "The two passwords do not match.")
    if not 8 <= len(pw) <= 256:
        return err(422, "INVALID_PASSWORD", "The password must have 8-256 characters.")
    limited = _rate(f"password:{auth[0].username}", 5, 15 * 60, idem)
    if limited:
        return limited
    return _forward("PUT", "/salesforce/password", auth, body={"newPassword": pw, "confirmPassword": confirm}, idem=idem)


@router.post("/salesforce/login-test")
def login_test(request: Request, auth=Depends(require_cfms("cfms:admin"))):
    idem, e = _idempotency_key(request)
    if e:
        return e
    limited = _rate("login-test", 1, 3 * 60, idem)
    if limited:
        return limited
    return _forward("POST", "/salesforce/login-test", auth, idem=idem)


@router.put("/email/sender")
async def put_sender(request: Request, auth=Depends(require_cfms("cfms:settings"))):
    data, e = await _json_body(request)
    if e:
        return e
    sender = data.get("sender")
    if not _valid_email(sender):
        return err(422, "INVALID_EMAIL", "Enter a valid sender e-mail address.")
    return _forward("PUT", "/email/sender", auth, body={"sender": sender.strip()})


def _recipient_list(data: dict) -> Tuple[Optional[List[str]], Optional[JSONResponse]]:
    items = data.get("recipients")
    if not isinstance(items, list) or not items or not all(isinstance(x, str) for x in items):
        return None, err(422, "INVALID_INPUT", "recipients must be a non-empty list of e-mail addresses.")
    if len(items) > MAX_RECIPIENTS:
        return None, err(422, "TOO_MANY_RECIPIENTS", f"At most {MAX_RECIPIENTS} recipients are allowed.")
    cleaned = [x.strip() for x in items]
    invalid = [x for x in cleaned if not _valid_email(x)]
    if invalid:
        return None, err(422, "INVALID_EMAIL", "Some addresses are not valid.", invalid=invalid[:50])
    return cleaned, None


@router.put("/email/recipients")
async def put_recipients(request: Request, auth=Depends(require_cfms("cfms:settings"))):
    data, e = await _json_body(request)
    if e:
        return e
    items, e = _recipient_list(data)
    if e:
        return e
    return _forward("PUT", "/email/recipients", auth, body={"recipients": items})


@router.post("/email/recipients")
async def add_recipients(request: Request, auth=Depends(require_cfms("cfms:settings"))):
    data, e = await _json_body(request)
    if e:
        return e
    items, e = _recipient_list(data)
    if e:
        return e
    return _forward("POST", "/email/recipients", auth, body={"recipients": items})


@router.delete("/email/recipients/{email}")
def delete_recipient(email: str, auth=Depends(require_cfms("cfms:settings"))):
    if not _valid_email(email):
        return err(422, "INVALID_EMAIL", "Invalid e-mail address.")
    from urllib.parse import quote
    return _forward("DELETE", f"/email/recipients/{quote(email.strip(), safe='')}", auth)


AUDIT_STATUSES = {"SUCCESS", "NO_RECORDS", "PARTIAL", "FAILED", "RUNNING", "INTERRUPTED"}


@router.get("/audit")
def audit(request: Request, auth=Depends(require_cfms("cfms:view"))):
    q = request.query_params
    query: Dict[str, Any] = {}
    for name in ("from", "to"):
        v = q.get(name)
        if v:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
                return err(422, "INVALID_DATE", f"{name} must be YYYY-MM-DD.")
            query[name] = v
    status_v = q.get("status")
    if status_v:
        if status_v not in AUDIT_STATUSES:
            return err(422, "INVALID_STATUS", "Unknown status filter.")
        query["status"] = status_v
    type_v = q.get("type")
    if type_v:
        if type_v not in ("SCHEDULED", "MANUAL"):
            return err(422, "INVALID_TYPE", "Unknown type filter.")
        query["type"] = type_v
    search = (q.get("q") or "").strip()[:100]
    if search:
        query["q"] = search
    try:
        query["page"] = max(1, int(q.get("page") or 1))
        query["pageSize"] = max(1, min(int(q.get("pageSize") or 50), 200))
    except ValueError:
        return err(422, "INVALID_INPUT", "page and pageSize must be numbers.")
    return _forward("GET", "/audit", auth, query=query)
