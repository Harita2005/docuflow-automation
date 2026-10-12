import os
import base64
import json
import hashlib
import logging
from typing import Optional, Union, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

PREFIX = "enc:v1:"

def get_encryption_key() -> bytes:
    """
    Derives a 256-bit (32-byte) key for AES-256-GCM from environment or settings.
    """
    raw_key = os.getenv("DOCUFLOW_ENCRYPTION_KEY")
    if not raw_key:
        try:
            from app.config.settings import settings
            raw_key = getattr(settings, "SECRET_KEY", None) or getattr(settings, "ENCRYPTION_KEY", None)
        except Exception:
            raw_key = None

    if not raw_key:
        raw_key = "docuflow-default-secure-fallback-encryption-key-32b"

    # If already 32 bytes hex or base64 or raw string, normalize to 32 bytes
    if isinstance(raw_key, str):
        raw_bytes = raw_key.strip().encode("utf-8")
        # Try hex decode if 64 chars
        if len(raw_bytes) == 64:
            try:
                return bytes.fromhex(raw_key.strip())
            except ValueError:
                # String was not valid hex; fall through to next format attempt
                pass
        # Try base64 decode if valid
        if len(raw_bytes) == 44:
            try:
                decoded = base64.b64decode(raw_bytes)
                if len(decoded) == 32:
                    return decoded
            except Exception:
                # String was not valid base64; fall through to hash fallback
                pass
        # Fall back to SHA-256 hash to ensure exact 32-byte key
        return hashlib.sha256(raw_bytes).digest()
    elif isinstance(raw_key, bytes):
        if len(raw_key) == 32:
            return raw_key
        return hashlib.sha256(raw_key).digest()
    return hashlib.sha256(b"docuflow-secure-key").digest()

def encrypt_secret(plaintext: Optional[str]) -> Optional[str]:
    """
    Encrypts a plaintext string using AES-256-GCM.
    Returns string formatted as 'enc:v1:<base64_encoded_payload>'.
    Idempotent: if already encrypted with prefix, returns as-is.
    """
    if plaintext is None:
        return None
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    if not plaintext:
        return ""
    if plaintext.startswith(PREFIX):
        return plaintext

    try:
        key = get_encryption_key()
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)  # 96-bit nonce for GCM
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        payload = base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")
        return f"{PREFIX}{payload}"
    except Exception as exc:
        logger.error("Encryption failure: %s", exc)
        raise ValueError(f"Secret encryption failed: {exc}") from exc

def decrypt_secret(ciphertext: Optional[str]) -> Optional[str]:
    """
    Decrypts an AES-256-GCM ciphertext string with 'enc:v1:' prefix.
    If not encrypted with prefix, gracefully returns the value (backward-compatibility).
    """
    if ciphertext is None:
        return None
    if not isinstance(ciphertext, str):
        return str(ciphertext)
    if not ciphertext:
        return ""
    if not ciphertext.startswith(PREFIX):
        return ciphertext

    try:
        encoded_data = ciphertext[len(PREFIX):]
        raw = base64.urlsafe_b64decode(encoded_data.encode("ascii"))
        if len(raw) < 12 + 16:  # nonce (12) + tag (16)
            raise ValueError("Ciphertext too short")
        nonce = raw[:12]
        data_and_tag = raw[12:]
        key = get_encryption_key()
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(nonce, data_and_tag, None)
        return decrypted.decode("utf-8")
    except Exception as exc:
        logger.error("Decryption failure: %s", exc)
        raise ValueError(f"Secret decryption failed: {exc}") from exc

def mask_secret(val: Optional[str]) -> Optional[str]:
    """Returns masked placeholder string if value is present."""
    if not val:
        return ""
    return "********"

def mask_dict_secrets(obj: Any) -> Any:
    """Recursively masks sensitive keys in dictionaries."""
    SENSITIVE_KEYS = {"password", "secret", "token", "apikey", "api_key", "client_secret", "auth_token", "hmac_secret", "encrypted_password"}
    if isinstance(obj, dict):
        masked = {}
        for k, v in obj.items():
            if str(k).lower() in SENSITIVE_KEYS:
                masked[k] = "********" if v else ""
            else:
                masked[k] = mask_dict_secrets(v)
        return masked
    elif isinstance(obj, list):
        return [mask_dict_secrets(item) for item in obj]
    return obj

def mask_json_secrets(json_val: Optional[Union[str, dict]]) -> Optional[str]:
    """Parses JSON or takes dict, masks sensitive fields, and returns JSON string."""
    if not json_val:
        return None
    try:
        data = json.loads(json_val) if isinstance(json_val, str) else json_val
        masked_data = mask_dict_secrets(data)
        return json.dumps(masked_data)
    except Exception:
        return "********"
