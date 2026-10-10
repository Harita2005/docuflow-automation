import pytest
import json
from app.services.crypto_service import (
    encrypt_secret,
    decrypt_secret,
    mask_secret,
    mask_json_secrets,
    PREFIX,
)

def test_aes_gcm_encrypt_decrypt_roundtrip():
    secret = "SuperSecretPassword123!@#"
    encrypted = encrypt_secret(secret)
    assert encrypted != secret
    assert encrypted.startswith(PREFIX)

    decrypted = decrypt_secret(encrypted)
    assert decrypted == secret

def test_encrypt_is_idempotent():
    secret = "MyApiToken_998877"
    enc1 = encrypt_secret(secret)
    enc2 = encrypt_secret(enc1)
    assert enc1 == enc2

def test_legacy_plaintext_backward_compatibility():
    legacy_val = "old_plaintext_secret_without_prefix"
    # Should not crash, should return as-is
    res = decrypt_secret(legacy_val)
    assert res == legacy_val

def test_tampered_ciphertext_fails_decryption():
    secret = "ConfidentialData"
    encrypted = encrypt_secret(secret)
    # Tamper with the ciphertext characters
    tampered = encrypted[:-4] + "AAAA"
    with pytest.raises(ValueError):
        decrypt_secret(tampered)

def test_mask_secret():
    assert mask_secret("sensitive_token_value") == "********"
    assert mask_secret("") == ""
    assert mask_secret(None) == ""

def test_mask_json_secrets():
    payload = {
        "client_id": "public-client-id",
        "api_key": "raw_super_secret_key_12345",
        "nested": {
            "token": "bearer_token_abc",
            "normal_field": "visible_value"
        }
    }
    json_str = json.dumps(payload)
    masked_json = mask_json_secrets(json_str)
    parsed = json.loads(masked_json)

    assert parsed["client_id"] == "public-client-id"
    assert parsed["api_key"] == "********"
    assert parsed["nested"]["token"] == "********"
    assert parsed["nested"]["normal_field"] == "visible_value"
