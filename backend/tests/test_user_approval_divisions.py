import pytest
from app.database.models import User, Invoice
from app.services.rbac_service import get_user_approval_divisions, authorize_document_access
from app.routers.documents import check_approval_authorization
from fastapi import HTTPException


def test_get_user_approval_divisions():
    # User with explicit approval divisions
    u1 = User(username="user1", division="VCC", approval_divisions="VCC, SD")
    assert get_user_approval_divisions(u1) == {"VCC", "SD"}

    # User with single approval division
    u2 = User(username="user2", division="VCC", approval_divisions="VCC")
    assert get_user_approval_divisions(u2) == {"VCC"}

    # Fallback to division when approval_divisions is None
    u3 = User(username="user3", division="SD", approval_divisions=None)
    assert get_user_approval_divisions(u3) == {"SD"}

    # User with JSON formatted or quoted string
    u4 = User(username="user4", division="VCC", approval_divisions='["VCC", "HQ"]')
    assert get_user_approval_divisions(u4) == {"VCC", "HQ"}


def test_approval_division_authorization_check():
    # User authorized ONLY for VCC
    approver = User(
        id=999,
        username="approver_vcc",
        role="employee",
        division="VCC",
        approval_divisions="VCC",
        is_active=True
    )

    # Document in VCC
    vcc_doc = Invoice(
        id=101,
        invoice_number="INV-VCC-01",
        division="VCC",
        status="Pending Approval",
        assigned_approver="approver_vcc"
    )

    # Document in SD
    sd_doc = Invoice(
        id=102,
        invoice_number="INV-SD-01",
        division="SD",
        status="Pending Approval",
        assigned_approver="approver_vcc"
    )

    # VCC document should pass division authorization
    check_approval_authorization(vcc_doc, approver, db=None, require_compliance=False)

    # SD document should be REJECTED with 403 Forbidden because user lacks SD in approval_divisions
    with pytest.raises(HTTPException) as exc_info:
        check_approval_authorization(sd_doc, approver, db=None, require_compliance=False)
    assert exc_info.value.status_code == 403
    assert "You are not authorized to approve documents for division 'SD'" in exc_info.value.detail


def test_multi_division_approver():
    # User authorized for both VCC and SD
    multi_approver = User(
        id=998,
        username="multi_approver",
        role="manager",
        division="VCC",
        approval_divisions="VCC, SD",
        is_active=True
    )

    vcc_doc = Invoice(
        id=201,
        invoice_number="INV-VCC-02",
        division="VCC",
        status="Pending",
        assigned_approver="multi_approver"
    )
    sd_doc = Invoice(
        id=202,
        invoice_number="INV-SD-02",
        division="SD",
        status="Pending",
        assigned_approver="multi_approver"
    )
    other_doc = Invoice(
        id=203,
        invoice_number="INV-OTHER-01",
        division="OTHER_DIV",
        status="Pending",
        assigned_approver="multi_approver"
    )

    # Both VCC and SD should pass
    check_approval_authorization(vcc_doc, multi_approver, db=None, require_compliance=False)
    check_approval_authorization(sd_doc, multi_approver, db=None, require_compliance=False)

    # OTHER_DIV should fail
    with pytest.raises(HTTPException) as exc_info:
        check_approval_authorization(other_doc, multi_approver, db=None, require_compliance=False)
    assert exc_info.value.status_code == 403
