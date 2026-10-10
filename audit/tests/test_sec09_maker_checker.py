import pytest
from fastapi import HTTPException
from app.database.models import User, Invoice
from app.routers.documents import check_approval_authorization

def test_maker_checker_blocks_creator_self_approval():
    creator_user = User(
        id=201,
        username="john_creator",
        employee_id="EMP-201",
        name="John Creator",
        role="accounts_approver",
        is_active=True,
    )
    inv = Invoice(
        id="INV-MC-001",
        assigned_approver="john_creator,alice_manager",
        status="Pending Approval",
        current_stage=1,
    )
    inv.created_by = "john_creator"

    with pytest.raises(HTTPException) as exc_info:
        check_approval_authorization(inv, creator_user, db=None, require_compliance=False)
    assert exc_info.value.status_code == 403
    assert "Maker-Checker policy violation" in exc_info.value.detail

def test_maker_checker_blocks_employee_id_self_approval():
    creator_user = User(
        id=202,
        username="jane_emp",
        employee_id="EMP-999",
        name="Jane Employee",
        role="manager",
        is_active=True,
    )
    inv = Invoice(
        id="INV-MC-002",
        employee_id="EMP-999",
        assigned_approver="jane_emp",
        status="Pending Approval",
        current_stage=1,
    )

    with pytest.raises(HTTPException) as exc_info:
        check_approval_authorization(inv, creator_user, db=None, require_compliance=False)
    assert exc_info.value.status_code == 403
    assert "Maker-Checker policy violation" in exc_info.value.detail

def test_prevent_replay_after_terminal_or_rejected_status():
    approver = User(
        id=203,
        username="alice_manager",
        employee_id="EMP-203",
        role="manager",
        is_active=True,
    )
    inv_rejected = Invoice(
        id="INV-MC-003",
        assigned_approver="alice_manager",
        status="Rejected",
        current_stage=1,
    )
    inv_rejected.created_by = "someone_else"

    with pytest.raises(HTTPException) as exc_info:
        check_approval_authorization(inv_rejected, approver, db=None, require_compliance=False)
    assert exc_info.value.status_code == 400
    assert "terminal/completed state" in exc_info.value.detail

def test_independent_approver_passes_maker_checker():
    approver = User(
        id=204,
        username="independent_approver",
        employee_id="EMP-204",
        role="manager",
        is_active=True,
    )
    inv = Invoice(
        id="INV-MC-004",
        employee_id="EMP-888",
        assigned_approver="independent_approver",
        status="Pending Approval",
        current_stage=1,
    )
    inv.created_by = "submitting_vendor_or_staff"

    # Must succeed without raising HTTPException
    check_approval_authorization(inv, approver, db=None, require_compliance=False)
