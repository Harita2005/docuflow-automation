import pytest
import uuid
import datetime
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import User, Invoice, InAppNotification
from app.auth import create_access_token
from app.routers.documents import (
    is_notification_for_user_handles,
    get_user_notification_handles,
    dispatch_assignment_inapp_notification,
    dispatch_approval_inapp_notifications,
    dispatch_rejection_inapp_notifications
)

client = TestClient(app)

@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture(scope="module")
def test_users(db):
    user_admin = db.query(User).filter(User.username == "admin").first()
    user_vignesh = db.query(User).filter(User.username == "VIGNESH").first()
    user_other = db.query(User).filter(User.username == "YUVASREE").first()

    token_admin = create_access_token({"sub": user_admin.username, "role": user_admin.role})
    token_vignesh = create_access_token({"sub": user_vignesh.username, "role": user_vignesh.role})
    token_other = create_access_token({"sub": user_other.username, "role": user_other.role})

    return {
        "admin": user_admin,
        "vignesh": user_vignesh,
        "other": user_other,
        "token_admin": token_admin,
        "token_vignesh": token_vignesh,
        "token_other": token_other
    }

def test_01_multi_word_and_role_suffix_matching(test_users):
    """
    Scenario 6: Verify multi-word employee names, parentheses, and role suffixes
    are properly matched without token-splitting destruction.
    """
    vignesh = test_users["vignesh"]
    handles_v = get_user_notification_handles(vignesh)

    # 1. Matches role suffix with parentheses
    n2 = InAppNotification(recipient_handle="VIGNESH (MANAGER)")
    assert is_notification_for_user_handles(n2, handles_v) is True

    # 2. Matches username
    n3 = InAppNotification(recipient_handle="vignesh")
    assert is_notification_for_user_handles(n3, handles_v) is True

    # 3. Matches role with parens
    n4 = InAppNotification(recipient_handle="(MANAGER)")
    assert is_notification_for_user_handles(n4, handles_v) is True

    # 4. Matches email
    n5 = InAppNotification(recipient_handle=vignesh.email)
    assert is_notification_for_user_handles(n5, handles_v) is True

    # 5. Matches comma-separated list
    n6 = InAppNotification(recipient_handle="admin, VIGNESH, other_person")
    assert is_notification_for_user_handles(n6, handles_v) is True

    # 6. Rejects unrelated users
    n_other = InAppNotification(recipient_handle="unrelated_person_xyz")
    assert is_notification_for_user_handles(n_other, handles_v) is False

    # 7. Multi-word test on dummy user with multi-word name
    class DummyUser:
        username = "vkumar"
        employee_id = "EMP99"
        employee_name = "Vignesh Kumar"
        email = "vignesh.k@docuflow.internal"
        role = "manager"

    dummy_handles = get_user_notification_handles(DummyUser())
    n_multi = InAppNotification(recipient_handle="Vignesh Kumar")
    assert is_notification_for_user_handles(n_multi, dummy_handles) is True
    n_multi_parens = InAppNotification(recipient_handle="Vignesh Kumar (MANAGER)")
    assert is_notification_for_user_handles(n_multi_parens, dummy_handles) is True
    assert is_notification_for_user_handles(InAppNotification(recipient_handle="John Doe"), dummy_handles) is False

def test_02_prevent_duplicate_assignment_notifications(db, test_users):
    """
    Scenario 7: Repeated assignment dispatch for the same document, recipient,
    and stage must NOT create duplicate unread notifications.
    """
    doc_id = f"DOC-DUP-{uuid.uuid4().hex[:6]}"
    vignesh = test_users["vignesh"]

    inv = Invoice(
        id=doc_id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
        vendor_name="Acme Supplies",
        amount=5000.0,
        status="In Progress (Stage 1)",
        current_stage=1,
        assigned_approver=vignesh.username,
        is_deleted=False
    )

    try:
        # Dispatch 1st time
        dispatch_assignment_inapp_notification(db, inv, assigned_target=vignesh.username)
        db.commit()

        # Count notifications
        count1 = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == vignesh.username,
            InAppNotification.notification_type == "PENDING_APPROVAL"
        ).count()
        assert count1 == 1

        # Dispatch 2nd time (simulating re-save or re-ingest)
        dispatch_assignment_inapp_notification(db, inv, assigned_target=vignesh.username)
        db.commit()

        # Count notifications must remain 1
        count2 = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == vignesh.username,
            InAppNotification.notification_type == "PENDING_APPROVAL"
        ).count()
        assert count2 == 1, "Duplicate assignment notification was created!"
    finally:
        db.query(InAppNotification).filter(InAppNotification.document_id == doc_id).delete()
        db.commit()

def test_03_approval_notification_types_and_recipients(db, test_users):
    """
    Scenario 2 & 11: Intermediate approval must use 'APPROVED' (not PENDING_APPROVAL)
    for approver confirmation, notify next stage approver with 'PENDING_APPROVAL',
    and notify document creator with 'APPROVED'.
    """
    doc_id = f"DOC-APPR-{uuid.uuid4().hex[:6]}"
    inv_num = f"INV-APPR-{uuid.uuid4().hex[:6]}"
    admin = test_users["admin"]
    vignesh = test_users["vignesh"]
    other = test_users["other"]

    inv = Invoice(
        id=doc_id,
        invoice_number=inv_num,
        vendor_name="Textile Corp",
        amount=12000.0,
        status="In Progress (Stage 2)",
        current_stage=2,
        assigned_approver="Stage 2 Approver",
        contact_person=other.email,
        is_deleted=False
    )

    try:
        dispatch_approval_inapp_notifications(
            db=db,
            inv=inv,
            approver_name=vignesh.username,
            prev_stage=1,
            new_stage=2,
            next_approver_target=admin.username,
            is_completed=False
        )
        db.commit()

        # 1. Approver confirmation must be APPROVED (not PENDING_APPROVAL)
        approver_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == vignesh.username
        ).first()
        assert approver_notif is not None
        assert approver_notif.notification_type == "APPROVED", f"Expected APPROVED, got {approver_notif.notification_type}"
        assert "Approval Confirmed" in approver_notif.title

        # 2. Next approver must be PENDING_APPROVAL (Action Required)
        next_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == admin.username
        ).first()
        assert next_notif is not None
        assert next_notif.notification_type == "PENDING_APPROVAL"
        assert "Action Required" in next_notif.title

        # 3. Creator must be notified with APPROVED
        creator_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == other.email
        ).first()
        assert creator_notif is not None
        assert creator_notif.notification_type == "APPROVED"
        assert "Invoice Approved" in creator_notif.title

    finally:
        db.query(InAppNotification).filter(InAppNotification.document_id == doc_id).delete()
        db.commit()

def test_04_completion_notification_types_and_recipients(db, test_users):
    """
    Scenario 4 & 11: Final completion (is_completed=True) must notify both
    the final approver and the creator with 'COMPLETED'.
    """
    doc_id = f"DOC-COMP-{uuid.uuid4().hex[:6]}"
    inv_num = f"INV-COMP-{uuid.uuid4().hex[:6]}"
    admin = test_users["admin"]
    other = test_users["other"]

    inv = Invoice(
        id=doc_id,
        invoice_number=inv_num,
        vendor_name="Global Logistics",
        amount=30000.0,
        status="Approved",
        current_stage=3,
        contact_person=other.email,
        is_deleted=False
    )

    try:
        dispatch_approval_inapp_notifications(
            db=db,
            inv=inv,
            approver_name=admin.username,
            prev_stage=3,
            new_stage=3,
            next_approver_target=None,
            is_completed=True
        )
        db.commit()

        # Approver gets COMPLETED
        appr_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == admin.username
        ).first()
        assert appr_notif is not None
        assert appr_notif.notification_type == "COMPLETED"

        # Creator gets COMPLETED
        creator_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == other.email
        ).first()
        assert creator_notif is not None
        assert creator_notif.notification_type == "COMPLETED"
        assert "Fully Approved" in creator_notif.title

    finally:
        db.query(InAppNotification).filter(InAppNotification.document_id == doc_id).delete()
        db.commit()

def test_05_rejection_notification_types(db, test_users):
    """
    Scenario 3 & 11: Step-back sends 'SENT_BACK' to target approver, 'REJECTED' to approver and creator.
    """
    doc_id = f"DOC-REJ-{uuid.uuid4().hex[:6]}"
    inv_num = f"INV-REJ-{uuid.uuid4().hex[:6]}"
    vignesh = test_users["vignesh"]
    other = test_users["other"]

    inv = Invoice(
        id=doc_id,
        invoice_number=inv_num,
        vendor_name="Hardware Ltd",
        amount=1500.0,
        status="In Progress (Stage 1)",
        current_stage=1,
        contact_person=other.email,
        is_deleted=False
    )

    try:
        dispatch_rejection_inapp_notifications(
            db=db,
            inv=inv,
            approver_name=vignesh.username,
            from_stage=2,
            to_stage=1,
            remarks="Missing tax breakdown",
            target_approver="admin",
            is_cancelled=False
        )
        db.commit()

        # Target approver gets SENT_BACK (Action Required)
        prev_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == "admin"
        ).first()
        assert prev_notif is not None
        assert prev_notif.notification_type == "SENT_BACK"
        assert "Action Required" in prev_notif.title

        # Approver gets REJECTED confirmation
        rej_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == vignesh.username
        ).first()
        assert rej_notif is not None
        assert rej_notif.notification_type == "REJECTED"

        # Creator gets REJECTED notice
        creator_notif = db.query(InAppNotification).filter(
            InAppNotification.document_id == doc_id,
            InAppNotification.recipient_handle == other.email
        ).first()
        assert creator_notif is not None
        assert creator_notif.notification_type == "REJECTED"

    finally:
        db.query(InAppNotification).filter(InAppNotification.document_id == doc_id).delete()
        db.commit()

def test_06_idor_security_prevention(db, test_users):
    """
    Scenario 8: A user CANNOT mark another user's notification as read.
    Must return 403 Forbidden.
    """
    vignesh = test_users["vignesh"]
    token_other = test_users["token_other"]
    token_vignesh = test_users["token_vignesh"]

    notif_id = f"NOTIF-IDOR-{uuid.uuid4().hex[:8]}"
    notif = InAppNotification(
        notification_id=notif_id,
        document_id="DOC-IDOR",
        recipient_handle=vignesh.username,
        notification_type="APPROVED",
        title="Private Notification for Vignesh",
        message="Important confidential details",
        is_read=False
    )
    db.add(notif)
    db.commit()

    try:
        # Other user attempts to mark Vignesh's notification as read
        resp = client.put(
            f"/api/notifications/{notif_id}/read",
            headers={"Authorization": f"Bearer {token_other}"}
        )
        assert resp.status_code == 403, f"Expected 403 Forbidden on IDOR attempt, got {resp.status_code}: {resp.text}"

        # Notification must still be unread
        db.refresh(notif)
        assert notif.is_read is False

        # Vignesh can mark their own notification as read
        resp_v = client.put(
            f"/api/notifications/{notif_id}/read",
            headers={"Authorization": f"Bearer {token_vignesh}"}
        )
        assert resp_v.status_code == 200
        db.refresh(notif)
        assert notif.is_read is True

    finally:
        db.query(InAppNotification).filter(InAppNotification.notification_id == notif_id).delete()
        db.commit()

def test_07_mark_all_read_scoped_to_current_user(db, test_users):
    """
    Scenario 5, 9, 10: Mark All Read must only mark current user's unread notifications.
    Other users' notifications remain unread. Read notifications remain in database.
    """
    vignesh = test_users["vignesh"]
    other = test_users["other"]
    token_vignesh = test_users["token_vignesh"]

    notif_v_id = f"NOTIF-V-{uuid.uuid4().hex[:8]}"
    notif_o_id = f"NOTIF-O-{uuid.uuid4().hex[:8]}"

    notif_v = InAppNotification(
        notification_id=notif_v_id,
        document_id="DOC-TEST-V",
        recipient_handle=vignesh.username,
        notification_type="PENDING_APPROVAL",
        title="Action Required: Review V",
        message="Please approve document V",
        is_read=False
    )
    notif_o = InAppNotification(
        notification_id=notif_o_id,
        document_id="DOC-TEST-O",
        recipient_handle=other.username,
        notification_type="PENDING_APPROVAL",
        title="Action Required: Review O",
        message="Please approve document O",
        is_read=False
    )
    db.add_all([notif_v, notif_o])
    db.commit()

    try:
        # Vignesh marks all as read
        resp = client.put(
            "/api/notifications/read-all",
            headers={"Authorization": f"Bearer {token_vignesh}"}
        )
        assert resp.status_code == 200

        db.refresh(notif_v)
        db.refresh(notif_o)

        # Vignesh's notification is read
        assert notif_v.is_read is True
        # Other user's notification is STILL unread
        assert notif_o.is_read is False

        # Verify notifications persist in history (not deleted)
        check_a = db.query(InAppNotification).filter(InAppNotification.notification_id == notif_v_id).first()
        assert check_a is not None, "Read notification was erroneously deleted!"
        assert check_a.is_read is True

        # Fetch notifications for Vignesh via API
        get_resp = client.get(
            "/api/notifications",
            headers={"Authorization": f"Bearer {token_vignesh}"}
        )
        assert get_resp.status_code == 200
        fetched = get_resp.json()
        found_ids = [n["notification_id"] for n in fetched]
        assert notif_v_id in found_ids
        assert notif_o_id not in found_ids, "Vignesh saw Other user's notification!"

    finally:
        db.query(InAppNotification).filter(InAppNotification.notification_id.in_([notif_v_id, notif_o_id])).delete()
        db.commit()
