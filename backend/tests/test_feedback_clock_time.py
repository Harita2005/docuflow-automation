import pytest
from fastapi import HTTPException
from app.database.connection import SessionLocal
from app.database.models import Invoice, User, AuditLog
from app.routers.documents import parse_and_validate_scheduled_clock_time, hold_invoice_url
from app.schemas.schemas import InvoiceActionRequest


def test_parse_and_validate_clock_time_12_hour():
    """Verify 5:30 PM parses as a scheduled clock time in 12-hour AM/PM format."""
    # Test 5:30 PM
    res_pm = parse_and_validate_scheduled_clock_time("5:30 PM")
    assert res_pm is not None
    assert res_pm.endswith("T17:30:00")

    # Test 05:30 PM
    res_pm_pad = parse_and_validate_scheduled_clock_time("05:30 PM")
    assert res_pm_pad is not None
    assert res_pm_pad.endswith("T17:30:00")

    # Test 5:30 AM
    res_am = parse_and_validate_scheduled_clock_time("5:30 AM")
    assert res_am is not None
    assert res_am.endswith("T05:30:00")

    # Test 12:00 PM (Noon) and 12:00 AM (Midnight)
    res_noon = parse_and_validate_scheduled_clock_time("12:00 PM")
    assert res_noon.endswith("T12:00:00")
    res_midnight = parse_and_validate_scheduled_clock_time("12:00 AM")
    assert res_midnight.endswith("T00:00:00")


def test_parse_and_validate_date_with_12_hour_clock_time():
    """Verify selecting date and 5:30 PM preserves date and schedules 17:30:00."""
    res = parse_and_validate_scheduled_clock_time("2026-10-12 5:30 PM")
    assert res == "2026-10-12T17:30:00"

    res_iso = parse_and_validate_scheduled_clock_time("2026-10-12T17:30:00")
    assert res_iso == "2026-10-12T17:30:00"


def test_minute_restriction_enforced():
    """Verify minutes are restricted to 00, 15, 30, 45, and minutes like 05, 17, 42 fail."""
    # Valid intervals
    for m in ["00", "15", "30", "45"]:
        res = parse_and_validate_scheduled_clock_time(f"5:{m} PM")
        assert res is not None

    # Invalid minute values
    for bad_m in ["05", "17", "42", "01", "59"]:
        with pytest.raises(HTTPException) as exc_info:
            parse_and_validate_scheduled_clock_time(f"5:{bad_m} PM")
        assert exc_info.value.status_code == 400
        assert "15-minute intervals" in exc_info.value.detail


def test_duration_strings_rejected():
    """Verify duration-style strings like '3 hours' are rejected as actual clock times are required."""
    duration_strings = ["3 hours", "2 hrs", "1 hour", "45 mins", "45 minutes", "2 days"]
    for dur in duration_strings:
        with pytest.raises(HTTPException) as exc_info:
            parse_and_validate_scheduled_clock_time(dur)
        assert exc_info.value.status_code == 400
        assert "Duration-style time" in exc_info.value.detail or "not permitted" in exc_info.value.detail


def test_hold_action_persists_scheduled_clock_time():
    """Verify hold action persists 5:30 PM (2026-10-12T17:30:00) into database due_date and AuditLog."""
    from app.database.models import WorkflowProfile, WorkflowStepDefinition
    db = SessionLocal()
    test_inv_id = "TEST-FEEDBACK-SLA-99"
    wf_name = "TEST_HOLD_WF_99"
    try:
        # Clean up any leftover test data
        db.query(AuditLog).filter(AuditLog.invoice_id == test_inv_id).delete()
        db.query(Invoice).filter(Invoice.id == test_inv_id).delete()
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).delete()
        db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_name).delete()
        db.commit()

        # Create temporary test workflow profile
        wf = WorkflowProfile(profile_name=wf_name, status="Active")
        db.add(wf)
        db.commit()
        step = WorkflowStepDefinition(profile_name=wf_name, stage_number=1, step_name="Feedback Stage 1", approver_target="feedback_reviewer")
        db.add(step)
        db.commit()

        # Insert test feedback document
        test_inv = Invoice(
            id=test_inv_id,
            invoice_number="FB-9999",
            document_type="CUSTOMER FEEDBACK",
            division="VCC",
            status="Pending Approval",
            version=1,
            workflow_profile_id=wf_name,
            assigned_approver="feedback_reviewer"
        )
        db.add(test_inv)
        db.commit()

        reviewer = User(id=999, employee_name="Reviewer Test", username="feedback_reviewer", role="admin", division="VCC", is_active=True)

        action_req = InvoiceActionRequest(
            expected_version=1,
            remarks="[ACTION: Field Inspection Pending] [TARGET SLA: 2026-10-12 5:30 PM] Scheduled inspection with distributor.",
            target_completion_date="2026-10-12T17:30:00",
            scheduled_time="5:30 PM"
        )

        res = hold_invoice_url(
            invoice_id=test_inv_id,
            action=action_req,
            payload=None,
            db=db,
            user=reviewer
        )

        assert res["success"] is True
        assert res["status"] == "On Hold"

        # Verify database record persistence
        updated_doc = db.query(Invoice).filter(Invoice.id == test_inv_id).first()
        assert updated_doc is not None
        assert updated_doc.status == "On Hold"
        assert updated_doc.due_date == "2026-10-12T17:30:00"

        # Verify AuditLog persistence
        audit = db.query(AuditLog).filter(AuditLog.invoice_id == test_inv_id).first()
        assert audit is not None
        assert audit.action == "Placed on Hold"
        assert "5:30 PM" in audit.notes

    finally:
        db.query(AuditLog).filter(AuditLog.invoice_id == test_inv_id).delete()
        db.query(Invoice).filter(Invoice.id == test_inv_id).delete()
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.profile_name == wf_name).delete()
        db.query(WorkflowProfile).filter(WorkflowProfile.profile_name == wf_name).delete()
        db.commit()
        db.close()
