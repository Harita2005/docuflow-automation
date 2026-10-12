import pytest
import secrets
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.schemas import UserMasterCreate, LoginRequest
from app.auth import get_password_hash, verify_password
from app.database.models import User
from app.routers.users import create_user_master


def test_user_master_create_schema_password_optional():
    """Verify UserMasterCreate accepts payloads without password."""
    data = {
        "employee_id": "EMP-9901",
        "employee_name": "Test Employee",
        "email": "test.emp@company.com",
        "division": "VCC",
        "role": "employee",
        "department": "Finance"
    }
    # Should validate successfully without password
    obj = UserMasterCreate(**data)
    assert obj.employee_id == "EMP-9901"
    assert obj.password is None

    # Should also validate if password is provided
    obj_with_pwd = UserMasterCreate(**{**data, "password": "SecurePassword123!"})
    assert obj_with_pwd.password == "SecurePassword123!"


def test_create_user_master_generates_secure_unpredictable_hash():
    """Verify that omitting password generates a secure bcrypt hash and never predictable plaintext."""
    mock_db = MagicMock()
    # Mock no duplicate employee_id, email, or username
    mock_db.query.return_value.filter.return_value.first.return_value = None

    admin_user = User(
        id=1,
        employee_id="ADM-01",
        employee_name="Admin User",
        username="admin",
        role="admin",
        is_active=True
    )

    payload_no_pwd = UserMasterCreate(
        employee_id="EMP-9902",
        employee_name="No Pass User",
        email="nopass@company.com",
        division="VCC",
        department="Finance",
        role="employee"
    )

    with patch("app.routers.users.resolve_user_foreign_keys", return_value=(None, None, None)):
        created_user = create_user_master(
            payload=payload_no_pwd,
            current_user=admin_user,
            db=mock_db
        )

    # Has a valid bcrypt password hash
    assert created_user.password_hash is not None
    assert created_user.password_hash.startswith(("$2b$", "$2a$"))

    # Must NOT match common predictable passwords
    for predictable in ["", "password", "password123", "EMP-9902", "admin", "123456", "nopass"]:
        assert verify_password(predictable, created_user.password_hash) is False

    # Stored password is NOT plaintext
    assert "nopass" not in created_user.password_hash
    assert "EMP-9902" not in created_user.password_hash


def test_create_user_master_with_explicit_password():
    """Verify that when an admin provides a password, it is hashed correctly."""
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    admin_user = User(
        id=1,
        employee_id="ADM-01",
        employee_name="Admin User",
        username="admin",
        role="admin",
        is_active=True
    )

    payload_with_pwd = UserMasterCreate(
        employee_id="EMP-9903",
        employee_name="Custom Pass User",
        email="custom@company.com",
        password="MySecretPassword99!",
        division="VCC",
        department="Finance",
        role="employee"
    )

    with patch("app.routers.users.resolve_user_foreign_keys", return_value=(None, None, None)):
        created_user = create_user_master(
            payload=payload_with_pwd,
            current_user=admin_user,
            db=mock_db
        )

    assert created_user.password_hash is not None
    assert verify_password("MySecretPassword99!", created_user.password_hash) is True
    assert verify_password("WrongPassword", created_user.password_hash) is False
