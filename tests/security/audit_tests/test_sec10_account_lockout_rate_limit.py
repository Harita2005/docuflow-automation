from fastapi.testclient import TestClient
from fastapi import FastAPI
from app.services.security_middleware import RateLimiterMiddleware
from app.database.models import User, UserAccessLog
from app.auth import get_password_hash


def test_rate_limiter_middleware_sliding_window():
    """Verify that RateLimiterMiddleware blocks excess requests with 429."""
    app = FastAPI()
    app.add_middleware(
        RateLimiterMiddleware,
        max_auth_requests=3,
        window_seconds=60,
        enable_in_tests=True,
    )

    @app.post("/api/auth/login")
    def dummy_login():
        return {"status": "ok"}

    @app.post("/api/documents/upload")
    def dummy_upload():
        return {"status": "ok"}

    client = TestClient(app)

    # 3 allowed logins
    for _ in range(3):
        res = client.post("/api/auth/login")
        assert res.status_code == 200

    # 4th request triggers 429
    res4 = client.post("/api/auth/login")
    assert res4.status_code == 429
    assert "Rate limit exceeded" in res4.json()["detail"]


def test_account_lockout_after_consecutive_failures(db_session):
    """Verify that 5 failed logins triggers account lockout and logs ACCOUNT_LOCKED event."""
    from app.routers.auth import router as auth_router

    # Create dummy user in database session
    test_user = (
        db_session.query(User)
        .filter(User.username == "test_lockout_user")
        .first()
    )
    if not test_user:
        test_user = User(
            username="test_lockout_user",
            employee_id="EMP_LOCKOUT_01",
            employee_name="Lockout Test User",
            name="Lockout Test User",
            email="lockout_test@example.com",
            password_hash=get_password_hash("CorrectPassword123!"),
            is_active=True,
            is_deleted=False,
        )
        db_session.add(test_user)
        db_session.commit()

    # Clean prior access logs for test user
    db_session.query(UserAccessLog).filter(
        UserAccessLog.username == "test_lockout_user"
    ).delete()
    db_session.commit()

    test_app = FastAPI()
    test_app.include_router(auth_router)
    client = TestClient(test_app)

    # 4 bad attempts
    for i in range(4):
        res = client.post(
            "/api/auth/login",
            json={"username": "test_lockout_user", "password": "WrongPassword!"},
        )
        assert res.status_code == 401

    # 5th bad attempt should trigger 403 Forbidden (Lockout)
    res5 = client.post(
        "/api/auth/login",
        json={"username": "test_lockout_user", "password": "WrongPassword!"},
    )
    assert res5.status_code == 403
    assert "Account is temporarily locked" in res5.json()["detail"]

    # 6th attempt (even with CORRECT password) should remain locked
    res6 = client.post(
        "/api/auth/login",
        json={"username": "test_lockout_user", "password": "CorrectPassword123!"},
    )
    assert res6.status_code == 403
    assert "Account is temporarily locked" in res6.json()["detail"]

    # Verify ACCOUNT_LOCKED logged
    lockout_logs = (
        db_session.query(UserAccessLog)
        .filter(
            UserAccessLog.username == "test_lockout_user",
            UserAccessLog.event_type == "ACCOUNT_LOCKED",
        )
        .all()
    )
    assert len(lockout_logs) >= 1

    # Clean up test user
    db_session.query(UserAccessLog).filter(
        UserAccessLog.username == "test_lockout_user"
    ).delete()
    db_session.query(User).filter(User.username == "test_lockout_user").delete()
    db_session.commit()
