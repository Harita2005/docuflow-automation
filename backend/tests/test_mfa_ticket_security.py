import os
import json
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.main import app
from app.services.mfa_service import (
    create_mfa_ticket,
    get_mfa_ticket,
    delete_mfa_ticket,
    invalidate_legacy_and_all_tickets,
    _CACHE_PATH,
    _LEGACY_CACHE_PATH,
)

client = TestClient(app)


def test_1_mfa_tickets_not_saved_in_public_uploads():
    """Verify MFA ticket storage file is not located in public uploads directory."""
    assert "uploads" not in os.path.normpath(_CACHE_PATH).split(os.sep), (
        f"Security violation: _CACHE_PATH {_CACHE_PATH} must not be in uploads directory"
    )
    assert "data" in os.path.normpath(_CACHE_PATH).split(os.sep), (
        f"_CACHE_PATH {_CACHE_PATH} should be in internal data directory"
    )


def test_2_mfa_tickets_store_hashed_otp_not_plaintext():
    """Verify that when an OTP is dispatched, it is stored hashed and never as plaintext."""
    ticket = create_mfa_ticket(1, "admin")

    with patch("app.routers.auth.generate_numeric_otp", return_value="987654"):
        res = client.post(
            "/api/auth/mfa/send-otp",
            json={"ticket": ticket, "method": "EMAIL"}
        )
        assert res.status_code == 200

    ticket_data = get_mfa_ticket(ticket)
    assert ticket_data is not None

    # In-memory check
    assert ticket_data.get("otp") is None, "Security violation: plaintext OTP found in-memory"
    assert ticket_data.get("otp_hash") is not None, "otp_hash must be present"
    assert ticket_data["otp_hash"] != "987654", "otp_hash must not equal plain OTP"

    # Disk cache check
    if os.path.exists(_CACHE_PATH):
        with open(_CACHE_PATH, "r", encoding="utf-8") as f:
            disk_cache = json.load(f)
        cached_entry = disk_cache.get(ticket)
        if cached_entry:
            assert "otp" not in cached_entry or cached_entry["otp"] is None, (
                "Security violation: plaintext OTP found on disk"
            )
            assert cached_entry.get("otp_hash") is not None, "otp_hash must be present on disk"

    delete_mfa_ticket(ticket)


def test_3_static_mounts_block_dotfiles_and_hidden_files():
    """Verify that requests to static file mounts for dotfiles return 403 Forbidden."""
    # Ensure legacy file does not exist or if it does, it's blocked
    res1 = client.get("/uploads/.mfa_tickets.json")
    assert res1.status_code == 403, f"Expected 403 for dotfile request, got {res1.status_code}"

    res2 = client.get("/uploads/.env")
    assert res2.status_code == 403, f"Expected 403 for .env probe, got {res2.status_code}"

    res3 = client.get("/stored_pdfs/.secret")
    assert res3.status_code == 403, f"Expected 403 for hidden file probe, got {res3.status_code}"


def test_4_startup_invalidation_cleans_legacy_files():
    """Verify that startup cleanup removes any legacy uploads/.mfa_tickets.json file."""
    # Simulate a legacy file placed in uploads
    os.makedirs(os.path.dirname(_LEGACY_CACHE_PATH), exist_ok=True)
    with open(_LEGACY_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump({"fake_ticket": {"otp": "123456"}}, f)
    assert os.path.exists(_LEGACY_CACHE_PATH)

    # Run cleanup
    invalidate_legacy_and_all_tickets()

    # Legacy file must be completely deleted
    assert not os.path.exists(_LEGACY_CACHE_PATH), "Legacy cache file must be removed on invalidation"
