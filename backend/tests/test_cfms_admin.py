"""
Tests for the Customer Feedback (CFMS) administration proxy /api/admin/cfms/*.

CFMS is mocked with httpx.MockTransport; no network, no database server.
Run standalone (no DocuFlow DB fixtures needed):
    cd backend && python -m pytest --noconftest -q tests/test_cfms_admin.py
"""

import hashlib
import hmac
import json
import logging
import os
import re
import sys
import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

_CA = tempfile.NamedTemporaryFile("w", suffix=".crt", delete=False)
_CA.write("-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n")
_CA.close()
SECRET = "x" * 48
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.update({
    "CFMS_API_URL": "https://host.docker.internal:8444",
    "CFMS_API_KEY_ID": "docuflow-1",
    "CFMS_API_SECRET": SECRET,
    "CFMS_API_CA_FILE": _CA.name,
})

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth import get_current_active_user  # noqa: E402
from app.database.connection import get_db  # noqa: E402
from app.routers import cfms_admin  # noqa: E402
from app.services import cfms_client  # noqa: E402
from app.services.rbac_service import check_permission  # noqa: E402

UUID_V4 = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


# ----------------------------------------------------------------------------- fixtures
class FakeCfms:
    """Records every request; verifies the signature exactly as CFMS does."""

    def __init__(self):
        self.requests = []
        self.reply = lambda req: httpx.Response(200, json={"ok": True})
        self.fail_times = 0

    def __call__(self, request: httpx.Request):
        if self.fail_times > 0:
            self.fail_times -= 1
            raise httpx.ConnectError("connection refused", request=request)
        self.requests.append(request)
        return self.reply(request)


def expected_signature(req: httpx.Request) -> str:
    h = req.headers
    target = req.url.raw_path.decode()
    canonical = "\n".join([h["x-cfms-key-id"], h["x-cfms-timestamp"], h["x-cfms-request-id"], req.method,
                           target, hashlib.sha256(req.content or b"").hexdigest(), h["x-cfms-actor"],
                           h["x-cfms-permissions"], h.get("idempotency-key", "")])
    return hmac.new(SECRET.encode(), canonical.encode(), hashlib.sha256).hexdigest()


@pytest.fixture
def env(monkeypatch):
    fake = FakeCfms()
    monkeypatch.setattr(cfms_client, "_transport_override", httpx.MockTransport(fake))
    cfms_admin.limiter.reset()
    state = {"user": SimpleNamespace(username="alice", role="Operations", role_id=7, is_active=True),
             "granted": {"cfms:view", "cfms:sync", "cfms:settings"}, "role_codes": set()}

    monkeypatch.setattr(cfms_admin, "check_permission", lambda user, code, db: code in state["granted"])
    monkeypatch.setattr(cfms_admin, "_role_permission_codes", lambda user, db: state["role_codes"])

    app = FastAPI()
    app.include_router(cfms_admin.router)
    cfms_admin.install_exception_handlers(app)
    app.dependency_overrides[get_current_active_user] = lambda: state["user"]
    app.dependency_overrides[get_db] = lambda: None
    client = TestClient(app)
    return SimpleNamespace(client=client, fake=fake, state=state, app=app)


def idem():
    return {"Idempotency-Key": str(uuid.uuid4())}


# ----------------------------------------------------------------------------- signing
def test_signature_matches_cfms_reference_vectors():
    # Same vectors as CFMS tests/internal-api-tests.js (cross-language check).
    args = ("k1", "1700000000", "11111111-1111-4111-8111-111111111111", "post", "/internal/v1/sync/now",
            b'{"reportDate":"2026-11-10"}', "alice", "cfms:sync,cfms:view", "22222222-2222-4222-8222-222222222222")
    assert cfms_client.sign("s" * 32, *args) == "a8084384fd283e6d1e28d9ea5091dbf3bce66872f48ad59c53a62495c545b824"
    args2 = ("k1", "1700000000", "11111111-1111-4111-8111-111111111111", "GET", "/internal/v1/jobs?limit=20",
             b"", "alice", "cfms:sync,cfms:view", "")
    assert cfms_client.sign("s" * 32, *args2) == "61a6a8a26f9fb8d33570efdaba864d41d27a7f79ce4f6dfc97460511ba29d758"


def test_signed_headers_are_complete_and_valid(env):
    env.fake.reply = lambda req: httpx.Response(200, json={"salesforce": {}, "email": {}, "schedule": {}})
    r = env.client.get("/api/admin/cfms/settings")
    assert r.status_code == 200
    req = env.fake.requests[0]
    assert req.url.raw_path.decode() == "/internal/v1/settings"
    assert str(req.url).startswith("https://host.docker.internal:8444/")
    h = req.headers
    assert h["x-cfms-key-id"] == "docuflow-1"
    assert UUID_V4.match(h["x-cfms-request-id"])
    assert h["x-cfms-actor"] == "alice"
    assert h["x-cfms-permissions"] == "cfms:settings,cfms:sync,cfms:view"
    assert abs(int(h["x-cfms-timestamp"]) - int(__import__("time").time())) < 5
    assert h["x-cfms-signature"] == expected_signature(req)
    assert "idempotency-key" not in h


def test_each_request_gets_a_new_request_id_and_query_is_signed(env):
    env.fake.reply = lambda req: httpx.Response(200, json={"jobs": []})
    env.client.get("/api/admin/cfms/jobs?limit=20")
    env.client.get("/api/admin/cfms/jobs?limit=20")
    ids = [r.headers["x-cfms-request-id"] for r in env.fake.requests]
    assert len(set(ids)) == 2
    assert env.fake.requests[0].url.raw_path.decode() == "/internal/v1/jobs?limit=20"
    assert all(r.headers["x-cfms-signature"] == expected_signature(r) for r in env.fake.requests)


def test_secret_never_reaches_the_browser(env):
    env.fake.reply = lambda req: httpx.Response(200, json={"salesforce": {"username": "svc"}, "email": {}, "schedule": {}})
    r = env.client.get("/api/admin/cfms/settings")
    assert SECRET not in r.text and SECRET not in str(dict(r.headers))


# ----------------------------------------------------------------------------- auth / RBAC
def test_unauthenticated_is_401():
    app = FastAPI()
    app.include_router(cfms_admin.router)
    app.dependency_overrides[get_db] = lambda: None
    r = TestClient(app).get("/api/admin/cfms/settings")
    assert r.status_code == 401


@pytest.mark.parametrize("method,path,body,needs_key", [
    ("GET", "/api/admin/cfms/settings", None, False),
    ("POST", "/api/admin/cfms/sync/now", {"reportDate": "2026-11-01"}, True),
    ("POST", "/api/admin/cfms/sync/schedule", {"reportDate": "2026-11-01"}, True),
    ("POST", "/api/admin/cfms/sync/J-1/cancel", None, False),
    ("GET", "/api/admin/cfms/jobs/J-1", None, False),
    ("GET", "/api/admin/cfms/jobs", None, False),
    ("GET", "/api/admin/cfms/calendar?month=2026-11", None, False),
    ("GET", "/api/admin/cfms/schedule", None, False),
    ("PUT", "/api/admin/cfms/schedule", {"startTime": "10:00", "attempts": 3, "intervalMinutes": 60}, False),
    ("PUT", "/api/admin/cfms/salesforce/password", {"newPassword": "abcdefgh", "confirmPassword": "abcdefgh"}, True),
    ("POST", "/api/admin/cfms/salesforce/login-test", None, True),
    ("PUT", "/api/admin/cfms/email/sender", {"sender": "a@ramrajcotton.net"}, False),
    ("PUT", "/api/admin/cfms/email/recipients", {"recipients": ["a@ramrajcotton.net"]}, False),
    ("POST", "/api/admin/cfms/email/recipients", {"recipients": ["a@ramrajcotton.net"]}, False),
    ("DELETE", "/api/admin/cfms/email/recipients/a@ramrajcotton.net", None, False),
    ("GET", "/api/admin/cfms/audit", None, False),
])
def test_no_cfms_permission_is_403_on_every_endpoint(env, method, path, body, needs_key):
    env.state["granted"] = set()
    r = env.client.request(method, path, json=body, headers=idem() if needs_key else {})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"
    assert env.fake.requests == []
    assert env.client.get("/api/admin/cfms/permissions").json() == {"permissions": []}


def test_admin_role_shortcut_does_not_grant_cfms_admin(env, monkeypatch):
    # Real RBAC: a role named "Admin" passes check_permission for every code...
    admin_user = SimpleNamespace(username="ops-admin", role="Admin", role_id=None, is_active=True)
    assert check_permission(admin_user, "cfms:admin", None) is True
    # ...but cfms:admin must be granted explicitly to the role.
    monkeypatch.setattr(cfms_admin, "check_permission", check_permission)
    env.state["user"] = admin_user
    assert env.client.get("/api/admin/cfms/permissions").json() == {"permissions": ["cfms:settings", "cfms:sync", "cfms:view"]}
    r = env.client.put("/api/admin/cfms/salesforce/password", json={"newPassword": "abcdefgh", "confirmPassword": "abcdefgh"}, headers=idem())
    assert r.status_code == 403
    r = env.client.post("/api/admin/cfms/salesforce/login-test", headers=idem())
    assert r.status_code == 403
    env.state["role_codes"] = {"cfms:admin"}
    assert "cfms:admin" in env.client.get("/api/admin/cfms/permissions").json()["permissions"]


def test_permissions_header_comes_from_server_rbac_not_the_browser(env):
    env.fake.reply = lambda req: httpx.Response(200, json={})
    env.client.get("/api/admin/cfms/settings", headers={"X-CFMS-Permissions": "cfms:admin", "X-CFMS-Actor": "root"})
    h = env.fake.requests[0].headers
    assert h["x-cfms-permissions"] == "cfms:settings,cfms:sync,cfms:view"
    assert h["x-cfms-actor"] == "alice"


# ----------------------------------------------------------------------------- idempotency
@pytest.mark.parametrize("method,path,body", [
    ("POST", "/api/admin/cfms/sync/now", {"reportDate": "2026-11-01"}),
    ("POST", "/api/admin/cfms/sync/schedule", {"reportDate": "2026-11-01"}),
    ("POST", "/api/admin/cfms/salesforce/login-test", None),
    ("PUT", "/api/admin/cfms/salesforce/password", {"newPassword": "abcdefgh", "confirmPassword": "abcdefgh"}),
])
def test_idempotency_key_required_and_forwarded(env, method, path, body):
    env.state["role_codes"] = {"cfms:admin"}
    r = env.client.request(method, path, json=body)
    assert r.status_code == 400 and r.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"
    r = env.client.request(method, path, json=body, headers={"Idempotency-Key": "not-a-uuid"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_IDEMPOTENCY_KEY"
    assert env.fake.requests == []
    env.fake.reply = lambda req: httpx.Response(202, json={"jobId": "J-1", "status": "PROCESSING"})
    key = str(uuid.uuid4())
    env.client.request(method, path, json=body, headers={"Idempotency-Key": key})
    sent = env.fake.requests[0]
    assert sent.headers["idempotency-key"] == key
    assert sent.headers["x-cfms-signature"] == expected_signature(sent)


def test_network_retry_uses_new_request_id_and_same_idempotency_key(env):
    env.fake.fail_times = 1
    env.fake.reply = lambda req: httpx.Response(202, json={"jobId": "J-9", "status": "PROCESSING"})
    real = env.fake.__call__
    attempts = []

    def spy(request):
        attempts.append((request.headers["x-cfms-request-id"], request.headers.get("idempotency-key")))
        return real(request)

    cfms_client._transport_override = httpx.MockTransport(spy)
    key = str(uuid.uuid4())
    r = env.client.post("/api/admin/cfms/sync/now", json={"reportDate": "2026-11-01"}, headers={"Idempotency-Key": key})
    assert r.status_code == 202 and r.json() == {"jobId": "J-9", "status": "PROCESSING"}
    assert len(attempts) == 2
    assert attempts[0][0] != attempts[1][0]
    assert attempts[0][1] == attempts[1][1] == key


def test_cfms_unreachable_is_502(env):
    env.fake.fail_times = 2
    r = env.client.get("/api/admin/cfms/settings")
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "CFMS_UNAVAILABLE"


def test_cfms_errors_are_passed_through(env):
    env.fake.reply = lambda req: httpx.Response(409, json={"error": {"code": "JOB_RUNNING", "message": "busy"}})
    r = env.client.post("/api/admin/cfms/sync/now", json={"reportDate": "2026-11-01"}, headers=idem())
    assert r.status_code == 409 and r.json() == {"error": {"code": "JOB_RUNNING", "message": "busy"}}
    env.fake.reply = lambda req: httpx.Response(500, text="<html>oops</html>")
    r = env.client.get("/api/admin/cfms/settings")
    assert r.status_code == 500 and r.json()["error"]["code"] in ("CFMS_BAD_RESPONSE", "CFMS_ERROR")


def test_not_configured_is_503(env, monkeypatch):
    monkeypatch.setenv("CFMS_API_CA_FILE", "/does/not/exist.crt")
    r = env.client.get("/api/admin/cfms/settings")
    assert r.status_code == 503 and r.json()["error"]["code"] == "CFMS_NOT_CONFIGURED"


# ----------------------------------------------------------------------------- validation (422)
@pytest.mark.parametrize("body,code", [
    ({"reportDate": "2026-13-01"}, "INVALID_DATE"),
    ({"reportDate": "11/11/2026"}, "INVALID_DATE"),
    ({"reportDate": "2999-01-01"}, "FUTURE_DATE"),
    ({}, "INVALID_DATE"),
])
def test_report_date_validation(env, body, code):
    r = env.client.post("/api/admin/cfms/sync/now", json=body, headers=idem())
    assert r.status_code == 422 and r.json()["error"]["code"] == code
    assert env.fake.requests == []


def test_schedule_validation(env):
    env.state["role_codes"] = {"cfms:admin"}
    r = env.client.put("/api/admin/cfms/schedule", json={"startTime": "9:5", "attempts": 0, "intervalMinutes": 500})
    assert r.status_code == 422 and len(r.json()["errors"]) == 3
    r = env.client.put("/api/admin/cfms/schedule", json={"startTime": "10:00", "attempts": True, "intervalMinutes": 60})
    assert r.status_code == 422
    env.fake.reply = lambda req: httpx.Response(200, json={"mode": "fixed"})
    assert env.client.put("/api/admin/cfms/schedule", json={"startTime": "10:00", "attempts": 6, "intervalMinutes": 15}).status_code == 200


def test_email_validation(env):
    assert env.client.put("/api/admin/cfms/email/sender", json={"sender": "nope"}).status_code == 422
    r = env.client.put("/api/admin/cfms/email/recipients", json={"recipients": ["a@ramrajcotton.net", "bad"]})
    assert r.status_code == 422 and r.json()["invalid"] == ["bad"]
    r = env.client.post("/api/admin/cfms/email/recipients", json={"recipients": [f"u{i}@ramrajcotton.net" for i in range(501)]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "TOO_MANY_RECIPIENTS"
    assert env.fake.requests == []
    env.fake.reply = lambda req: httpx.Response(200, json={"total": 1})
    env.client.delete("/api/admin/cfms/email/recipients/a@ramrajcotton.net")
    assert env.fake.requests[0].url.raw_path.decode() == "/internal/v1/email/recipients/a%40ramrajcotton.net"


def test_password_validation_and_body_never_logged(env, caplog):
    env.state["role_codes"] = {"cfms:admin"}
    secret_pw = "Very-Secret-Sf-Pass-2026"
    caplog.set_level(logging.DEBUG)
    r = env.client.put("/api/admin/cfms/salesforce/password", json={"newPassword": secret_pw, "confirmPassword": "different"}, headers=idem())
    assert r.status_code == 422
    r = env.client.put("/api/admin/cfms/salesforce/password", json={"newPassword": "short", "confirmPassword": "short"}, headers=idem())
    assert r.status_code == 422
    env.fake.reply = lambda req: httpx.Response(204)
    r = env.client.put("/api/admin/cfms/salesforce/password", json={"newPassword": secret_pw, "confirmPassword": secret_pw}, headers=idem())
    assert r.status_code == 204 and r.content == b""
    assert json.loads(env.fake.requests[0].content) == {"newPassword": secret_pw, "confirmPassword": secret_pw}
    assert secret_pw not in caplog.text


# ----------------------------------------------------------------------------- rate limits
def test_rate_limits(env):
    env.state["role_codes"] = {"cfms:admin"}
    env.fake.reply = lambda req: httpx.Response(202, json={"jobId": "J-1", "status": "PROCESSING"})
    k = idem()
    assert env.client.post("/api/admin/cfms/sync/now", json={"reportDate": "2026-11-01"}, headers=k).status_code == 202
    assert env.client.post("/api/admin/cfms/sync/now", json={"reportDate": "2026-11-01"}, headers=k).status_code == 202, "retry of the same click is not limited"
    r = env.client.post("/api/admin/cfms/sync/now", json={"reportDate": "2026-11-02"}, headers=idem())
    assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
    assert env.client.post("/api/admin/cfms/salesforce/login-test", headers=idem()).status_code == 202
    assert env.client.post("/api/admin/cfms/salesforce/login-test", headers=idem()).status_code == 429
    env.fake.reply = lambda req: httpx.Response(204)
    for _ in range(5):
        assert env.client.put("/api/admin/cfms/salesforce/password", json={"newPassword": "abcdefgh", "confirmPassword": "abcdefgh"}, headers=idem()).status_code == 204
    assert env.client.put("/api/admin/cfms/salesforce/password", json={"newPassword": "abcdefgh", "confirmPassword": "abcdefgh"}, headers=idem()).status_code == 429


def test_audit_query_forwarding(env):
    env.fake.reply = lambda req: httpx.Response(200, json={"total": 0, "page": 1, "pageSize": 50, "rows": []})
    r = env.client.get("/api/admin/cfms/audit?from=2026-11-01&to=2026-11-10&status=FAILED&type=MANUAL&q=login&page=2&pageSize=50")
    assert r.status_code == 200
    target = env.fake.requests[0].url.raw_path.decode()
    assert target == "/internal/v1/audit?from=2026-11-01&to=2026-11-10&status=FAILED&type=MANUAL&q=login&page=2&pageSize=50"
    assert env.client.get("/api/admin/cfms/audit?status=BOGUS").status_code == 422
    assert env.client.get("/api/admin/cfms/calendar?month=2026-13").status_code == 422
