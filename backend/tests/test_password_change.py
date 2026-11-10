import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User
from app.auth import get_password_hash

client = TestClient(app)

def test_initial_password_and_force_change_flow():
    db = SessionLocal()
    test_emp_id = "TEST_EMP_999"
    test_username = "test_user_999"

    # Clean up any existing test user
    db.query(User).filter(User.employee_id == test_emp_id).delete()
    db.commit()

    # Create user with initial password = test_emp_id
    test_user = User(
        employee_id=test_emp_id,
        employee_name="Test Password Flow User",
        name="Test Password Flow User",
        username=test_username,
        email="test999@example.com",
        role="employee",
        division="VCC",
        password_hash=get_password_hash(test_emp_id),
        must_change_password=True,
        mfa_enabled=False,
        is_active=True,
    )
    db.add(test_user)
    db.commit()
    db.refresh(test_user)

    try:
        # 1. Login with employee_id as password
        login_res = client.post("/api/auth/login", json={
            "username": test_emp_id,
            "password": test_emp_id,
        })
        assert login_res.status_code == 200, login_res.text
        data = login_res.json()
        assert data.get("must_change_password") is True
        token = data.get("token")
        assert token is not None

        headers = {"Authorization": f"Bearer {token}"}

        # 2. Attempt to change password to employee_id (should be rejected)
        bad_change = client.post("/api/auth/change-password", headers=headers, json={
            "current_password": test_emp_id,
            "new_password": test_emp_id,
        })
        assert bad_change.status_code == 400
        assert "cannot be your Employee ID" in bad_change.text

        # 3. Change password to a secure new password
        good_change = client.post("/api/auth/change-password", headers=headers, json={
            "current_password": test_emp_id,
            "new_password": "NewSecurePassword@2026",
        })
        assert good_change.status_code == 200
        assert good_change.json().get("success") is True

        # 4. Login with new password -> must_change_password is now False
        login_again = client.post("/api/auth/login", json={
            "username": test_emp_id,
            "password": "NewSecurePassword@2026",
        })
        assert login_again.status_code == 200
        data2 = login_again.json()
        assert data2.get("must_change_password") is False

        # 5. Forgot password request (with SHOW_OTP_IN_UI enabled for testing harness)
        from app.config.settings import settings
        orig_show_otp = settings.SHOW_OTP_IN_UI
        settings.SHOW_OTP_IN_UI = True
        try:
            forgot_res = client.post("/api/auth/forgot-password", json={
                "identifier": test_emp_id
            })
            assert forgot_res.status_code == 200
            reset_token = forgot_res.json().get("reset_token")
            assert reset_token is not None

            # 6. Reset password using token
            reset_res = client.post("/api/auth/reset-password", json={
                "token": reset_token,
                "new_password": "BrandNewResetPassword!123"
            })
            assert reset_res.status_code == 200
        finally:
            settings.SHOW_OTP_IN_UI = orig_show_otp

        # 7. Login with reset password
        login_post_reset = client.post("/api/auth/login", json={
            "username": test_emp_id,
            "password": "BrandNewResetPassword!123"
        })
        assert login_post_reset.status_code == 200
        assert login_post_reset.json().get("must_change_password") is False

    finally:
        # Cleanup
        db.query(User).filter(User.employee_id == test_emp_id).delete()
        db.commit()
        db.close()

if __name__ == '__main__':
    test_initial_password_and_force_change_flow()
    print(">>> ALL PASSWORD FLOW TESTS PASSED SUCCESSFULLY! <<<")
