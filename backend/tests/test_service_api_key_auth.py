import pytest
from unittest.mock import patch
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.auth import verify_service_api_key
from app.config.settings import settings
from app.database.connection import SessionLocal

client = TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.mark.anyio
async def test_1_valid_api_key_direct(db_session):
    """Verify that the exact valid service API key succeeds."""
    result = await verify_service_api_key(
        x_api_key=settings.SERVICE_API_KEY,
        credentials=None,
        db=db_session,
    )
    assert result is True


@pytest.mark.anyio
async def test_2_valid_api_key_with_whitespace_direct(db_session):
    """Verify that valid service API key with surrounding whitespace succeeds."""
    result = await verify_service_api_key(
        x_api_key=f"  {settings.SERVICE_API_KEY}  ",
        credentials=None,
        db=db_session,
    )
    assert result is True


@pytest.mark.anyio
async def test_3_invalid_api_key_direct(db_session):
    """Verify that an invalid API key raises HTTP 401."""
    with pytest.raises(HTTPException) as exc_info:
        await verify_service_api_key(
            x_api_key="WrongSecretKey-12345",
            credentials=None,
            db=db_session,
        )
    assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_4_empty_and_none_api_key_direct(db_session):
    """Verify that None, empty, or whitespace-only keys raise HTTP 401."""
    for empty_val in [None, "", "   ", "\t\n"]:
        with pytest.raises(HTTPException) as exc_info:
            await verify_service_api_key(
                x_api_key=empty_val,
                credentials=None,
                db=db_session,
            )
        assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_5_tampered_prefix_suffix_api_key_direct(db_session):
    """Verify that single-character or prefix tampered keys are rejected."""
    key = settings.SERVICE_API_KEY
    tampered_keys = [
        key[:-1],            # truncated
        key + "extra",       # appended
        key.lower(),         # case changed
        "X" + key[1:],       # first char changed
    ]
    for bad_key in tampered_keys:
        with pytest.raises(HTTPException) as exc_info:
            await verify_service_api_key(
                x_api_key=bad_key,
                credentials=None,
                db=db_session,
            )
        assert exc_info.value.status_code == 401


@pytest.mark.anyio
async def test_6_server_configured_key_none_or_empty(db_session):
    """Verify that if the server configured key is empty or None, requests are rejected."""
    with patch.object(settings, "SERVICE_API_KEY", ""):
        with pytest.raises(HTTPException) as exc_info:
            await verify_service_api_key(
                x_api_key="SomeAttemptedKey",
                credentials=None,
                db=db_session,
            )
        assert exc_info.value.status_code == 401

    with patch.object(settings, "SERVICE_API_KEY", None):
        with pytest.raises(HTTPException) as exc_info:
            await verify_service_api_key(
                x_api_key="SomeAttemptedKey",
                credentials=None,
                db=db_session,
            )
        assert exc_info.value.status_code == 401


def test_7_endpoint_service_auth_integration():
    """Verify API endpoint enforcement of X-API-Key with valid and invalid values."""
    # Invalid key
    res_bad = client.post(
        "/api/sync/record",
        headers={"X-API-Key": "invalid-hacker-key"},
        json={"source": "SAP", "payload": {}},
    )
    assert res_bad.status_code == 401
    assert "unauthorized" in res_bad.text.lower()

    # Missing key
    res_none = client.post(
        "/api/sync/record",
        json={"source": "SAP", "payload": {}},
    )
    assert res_none.status_code == 401

    # Valid key (does not fail with 401 Unauthorized)
    res_good = client.post(
        "/api/sync/record",
        headers={"X-API-Key": settings.SERVICE_API_KEY},
        json={"source": "TEST_INTEGRATION", "payload": {}},
    )
    assert res_good.status_code != 401, f"Valid key should not be 401: got {res_good.status_code} ({res_good.text})"


def test_8_service_key_cannot_write_workflows_or_conditions():
    """Verify that service key is barred from writing workflows and conditions, but allowed on sync-approvers."""
    headers = {"X-API-Key": settings.SERVICE_API_KEY}

    # 1. POST /api/admin/workflows must reject service key (requires user Bearer token)
    res_wf = client.post(
        "/api/admin/workflows",
        headers=headers,
        json={"profile_name": "UNAUTHORIZED_SERVICE_WF", "workflow_category": "TEST"},
    )
    assert res_wf.status_code in {401, 403}, f"Service key must not write workflows: {res_wf.status_code}"

    # 2. POST /api/admin/conditions must reject service key
    res_cond = client.post(
        "/api/admin/conditions",
        headers=headers,
        json={"rule_name": "UNAUTHORIZED_SERVICE_RULE", "workflow_id": "TEST_WF"},
    )
    assert res_cond.status_code in {401, 403}, f"Service key must not write conditions: {res_cond.status_code}"

    # 3. POST /api/admin/workflows/sync-approvers retains service key access
    res_sync_approvers = client.post(
        "/api/admin/workflows/sync-approvers",
        headers=headers,
    )
    assert res_sync_approvers.status_code == 200, f"Service key should be allowed on sync-approvers: {res_sync_approvers.status_code}"


@pytest.mark.anyio
async def test_9_user_jwt_with_service_claims_without_scope_rejected(db_session):
    """Verify that a JWT with sub=sync_service or role=service lacking scope='data:sync' is rejected."""
    from app.auth import create_access_token
    from fastapi.security import HTTPAuthorizationCredentials

    # 1. Token with sub=sync_service but NO scope
    token_no_scope = create_access_token({"sub": "sync_service", "role": "service"})
    creds_no_scope = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_no_scope)

    # Must raise 401 in verify_service_api_key
    with pytest.raises(HTTPException) as exc_info:
        await verify_service_api_key(
            x_api_key=None,
            credentials=creds_no_scope,
            db=db_session,
        )
    assert exc_info.value.status_code == 401

    # 2. Token WITH scope='data:sync' is accepted as valid service identity
    token_with_scope = create_access_token({"sub": "sync_service", "role": "service", "scope": "data:sync"})
    creds_with_scope = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token_with_scope)

    result = await verify_service_api_key(
        x_api_key=None,
        credentials=creds_with_scope,
        db=db_session,
    )
    assert result is True
