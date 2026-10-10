import pytest
from fastapi import HTTPException
from app.database.models import User, Invoice
from app.routers.documents import check_approval_authorization, is_user_in_approver_pool

def test_is_user_in_approver_pool_exact_matching():
    user = User(
        id=101,
        username="john",
        employee_id="EMP-101",
        employee_name="John Doe",
        name="John Doe",
        email="john@example.com",
        role="employee",
        is_active=True,
    )

    # Exact matches must succeed
    assert is_user_in_approver_pool(user, "john", ignore_admin_bypass=True) is True
    assert is_user_in_approver_pool(user, "EMP-101", ignore_admin_bypass=True) is True
    assert is_user_in_approver_pool(user, "alice, john, bob", ignore_admin_bypass=True) is True

    # Partial substring matches must FAIL
    assert is_user_in_approver_pool(user, "john_approver", ignore_admin_bypass=True) is False
    assert is_user_in_approver_pool(user, "st_john", ignore_admin_bypass=True) is False
    assert is_user_in_approver_pool(user, "johnny", ignore_admin_bypass=True) is False
    assert is_user_in_approver_pool(user, "EMP-1010", ignore_admin_bypass=True) is False

def test_check_approval_authorization_blocks_substring_approver():
    user_attacker = User(
        id=999,
        username="adm",  # Substring of admin
        employee_id="EMP-999",
        employee_name="Attacker",
        name="Attacker",
        email="attacker@example.com",
        role="employee",
        is_active=True,
    )
    inv = Invoice(
        id="INV-TEST-001",
        assigned_approver="admin_user",
        status="Pending Approval",
        current_stage=1,
    )

    # Should raise 403 Forbidden because "adm" != "admin_user"
    with pytest.raises(HTTPException) as exc_info:
        check_approval_authorization(inv, user_attacker, db=None, require_compliance=False)
    assert exc_info.value.status_code == 403
    assert "Access Denied" in exc_info.value.detail
