"""
CFMS internal API client (server-side only).

DocuFlow backend -> CFMS https://<CFMS_API_URL>/internal/v1/*  (CFMS <-> DocuFlow Integration Spec v2).
The browser never calls CFMS and never receives CFMS_API_SECRET.

Every request carries (v2 section 3):
  X-CFMS-Key-Id, X-CFMS-Timestamp (Unix s), X-CFMS-Request-Id (new UUIDv4 per HTTP request),
  X-CFMS-Actor (DocuFlow username), X-CFMS-Permissions (sorted, comma-separated cfms:* codes derived
  from server-side RBAC), Idempotency-Key (when given), X-CFMS-Signature.

signature = hex(HMAC_SHA256(secret, keyId \n ts \n requestId \n METHOD \n pathWithQuery \n sha256_hex(rawBody)
                              \n actor \n permissions \n idempotencyKey))
pathWithQuery is the exact request target sent, including "/internal/v1". rawBody is the exact bytes sent.

Configuration (environment, never committed):
  CFMS_API_URL       e.g. https://host.docker.internal:8444
  CFMS_API_KEY_ID    key id registered in CFMS (CFMS_API_KEYS)
  CFMS_API_SECRET    shared secret, or CFMS_API_SECRET_FILE (preferred: Docker secret file)
  CFMS_API_CA_FILE   CA certificate that signed the CFMS API certificate (read-only mount)
"""

import hashlib
import hmac
import json
import os
import time
import uuid
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

API_PREFIX = "/internal/v1"
TIMEOUT_SECONDS = 30.0

# Tests inject an httpx.MockTransport here.
_transport_override: Optional[httpx.BaseTransport] = None


class CfmsNotConfigured(Exception):
    pass


@dataclass
class CfmsResponse:
    status: int
    body: Any  # parsed JSON or None


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data or b"").hexdigest()


def canonical_string(key_id: str, ts: str, request_id: str, method: str, path_with_query: str,
                     body: bytes, actor: str, permissions: str, idempotency_key: str) -> str:
    return "\n".join([key_id, str(ts), request_id, method.upper(), path_with_query, sha256_hex(body),
                      actor, permissions, idempotency_key or ""])


def sign(secret: str, *args) -> str:
    return hmac.new(secret.encode("utf-8"), canonical_string(*args).encode("utf-8"), hashlib.sha256).hexdigest()


def _config():
    url = (os.getenv("CFMS_API_URL") or "").strip().rstrip("/")
    key_id = (os.getenv("CFMS_API_KEY_ID") or "").strip()
    secret = os.getenv("CFMS_API_SECRET") or ""
    secret_file = (os.getenv("CFMS_API_SECRET_FILE") or "").strip()
    if not secret and secret_file:
        try:
            with open(secret_file, "r", encoding="utf-8") as fh:
                secret = fh.read().strip()
        except OSError:
            secret = ""
    ca_file = (os.getenv("CFMS_API_CA_FILE") or "").strip()
    if not url or not key_id or len(secret) < 32:
        raise CfmsNotConfigured("CFMS integration is not configured (CFMS_API_URL, CFMS_API_KEY_ID, CFMS_API_SECRET).")
    if not url.startswith("https://"):
        raise CfmsNotConfigured("CFMS_API_URL must use https.")
    if not ca_file or not os.path.isfile(ca_file):
        raise CfmsNotConfigured("CFMS_API_CA_FILE is missing; the CFMS certificate cannot be verified.")
    return url, key_id, secret, ca_file


def call(method: str, path: str, *, actor: str, permissions: list, query: Optional[dict] = None,
         json_body: Any = None, idempotency_key: Optional[str] = None) -> CfmsResponse:
    """
    Signed request to CFMS. path is relative to /internal/v1 (e.g. "/sync/now").
    One network retry (connection error / timeout) with a NEW Request-Id and the SAME Idempotency-Key.
    Raises CfmsNotConfigured, or httpx.TransportError when CFMS cannot be reached twice.
    """
    base, key_id, secret, ca_file = _config()
    target = API_PREFIX + path
    if query:
        clean = {k: v for k, v in query.items() if v is not None and v != ""}
        if clean:
            target += "?" + urlencode(clean)
    body = b"" if json_body is None else json.dumps(json_body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    perms = ",".join(sorted(set(permissions)))
    idem = idempotency_key or ""

    def headers():
        ts = str(int(time.time()))
        request_id = str(uuid.uuid4())
        h = {
            "X-CFMS-Key-Id": key_id,
            "X-CFMS-Timestamp": ts,
            "X-CFMS-Request-Id": request_id,
            "X-CFMS-Actor": actor,
            "X-CFMS-Permissions": perms,
            "X-CFMS-Signature": sign(secret, key_id, ts, request_id, method, target, body, actor, perms, idem),
        }
        if idem:
            h["Idempotency-Key"] = idem
        if body:
            h["Content-Type"] = "application/json"
        return h

    client_kwargs = {"timeout": TIMEOUT_SECONDS, "verify": ca_file, "follow_redirects": False}
    if _transport_override is not None:
        client_kwargs["transport"] = _transport_override
    last_error = None
    with httpx.Client(**client_kwargs) as client:
        for _attempt in range(2):
            try:
                resp = client.request(method, base + target, content=body if body else None, headers=headers())
            except httpx.TransportError as exc:  # connection refused, TLS failure, timeout
                last_error = exc
                continue
            parsed = None
            if resp.status_code != 204 and resp.content:
                try:
                    parsed = resp.json()
                except ValueError:
                    parsed = {"error": {"code": "CFMS_BAD_RESPONSE", "message": "CFMS returned a non-JSON response."}}
            return CfmsResponse(status=resp.status_code, body=parsed)
    raise last_error
