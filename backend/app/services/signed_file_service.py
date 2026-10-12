import hmac
import hashlib
import secrets
import time
import logging
from typing import Optional, Tuple, Dict, Any
from app.config.settings import settings

logger = logging.getLogger(__name__)


def get_signing_secret() -> str:
    """
    Returns the dedicated secret for signing file URLs.
    In development/testing, falls back to a process-lifetime random secret if unset.
    """
    secret = settings.FILE_URL_SIGNING_SECRET
    if not secret:
        runtime_secret = getattr(settings, "_RUNTIME_FILE_SIGNING_SECRET", None)
        if not runtime_secret:
            runtime_secret = secrets.token_hex(32)
            setattr(settings, "_RUNTIME_FILE_SIGNING_SECRET", runtime_secret)
        return runtime_secret
    return secret


def generate_signed_file_token(
    document_id: str,
    user_id: int | str,
    disp: str = "inline",
    ttl: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Generates a secure, short-lived HMAC-signed document access token and URL.
    Canonical format: GET:/api/files/signed/{document_id}:{user_id}:{expires}:{disp}
    """
    ttl = int(ttl or settings.FILE_URL_TTL_SECONDS)
    now = int(time.time())
    expires = now + ttl
    clean_disp = "attachment" if disp == "attachment" else "inline"

    canonical = f"GET:/api/files/signed/{document_id}:{user_id}:{expires}:{clean_disp}"
    secret = get_signing_secret()
    sig = hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    url = f"/api/files/signed/{document_id}?expires={expires}&sig={sig}&disp={clean_disp}&uid={user_id}"
    return {
        "document_id": document_id,
        "signed_url": url,
        "expires_at": expires,
        "expires_in_seconds": ttl,
    }


def verify_signed_file_token(
    document_id: str,
    user_id: int | str,
    expires: int,
    sig: str,
    disp: str = "inline",
) -> Tuple[bool, str]:
    """
    Verifies HMAC signature, expiry, and clock-skew constraints.
    Rejects timestamps exceeding now + FILE_URL_TTL_SECONDS + 5s skew.
    """
    now = int(time.time())
    max_skew = 5
    max_allowed_expires = now + settings.FILE_URL_TTL_SECONDS + max_skew

    if expires < now:
        return False, "Signed URL has expired."

    if expires > max_allowed_expires:
        return False, "Signed URL expiration exceeds allowable threshold."

    clean_disp = "attachment" if disp == "attachment" else "inline"
    canonical = f"GET:/api/files/signed/{document_id}:{user_id}:{expires}:{clean_disp}"
    secret = get_signing_secret()
    expected_sig = hmac.new(
        secret.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not sig or not secrets.compare_digest(
        sig.strip().encode("utf-8"),
        expected_sig.encode("utf-8"),
    ):
        return False, "Invalid file access signature."

    return True, "Valid"
