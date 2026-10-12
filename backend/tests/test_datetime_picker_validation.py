import pytest
from unittest.mock import MagicMock
from app.services.archive_service import update_archive_settings
from app.database.models import ArchiveSetting


def test_scheduled_time_15_minute_intervals_permitted():
    """Verify that permitted minutes (00, 15, 30, 45) are accepted for scheduling."""
    mock_db = MagicMock()
    setting_obj = ArchiveSetting()
    mock_db.query.return_value.first.return_value = setting_obj

    # Test all permitted intervals across various hours
    permitted_times = ["00:00", "02:15", "14:30", "23:45"]
    for valid_time in permitted_times:
        res = update_archive_settings(
            db=mock_db,
            enabled=True,
            retention_value=30,
            retention_unit="Days",
            frequency="Daily",
            scheduled_time=valid_time,
        )
        assert res["scheduled_time"] == valid_time


def test_scheduled_time_non_15_minute_intervals_rejected():
    """Verify that minutes such as 05, 17, and 42 cannot be set for scheduling."""
    mock_db = MagicMock()
    setting_obj = ArchiveSetting()
    mock_db.query.return_value.first.return_value = setting_obj

    # Test prohibited minute values specified in requirements: 05, 17, 42
    invalid_times = ["02:05", "10:17", "16:42", "00:01", "12:59"]
    for bad_time in invalid_times:
        with pytest.raises(ValueError) as exc_info:
            update_archive_settings(
                db=mock_db,
                enabled=True,
                retention_value=30,
                retention_unit="Days",
                frequency="Daily",
                scheduled_time=bad_time,
            )
        assert "15-minute intervals (00, 15, 30, 45)" in str(exc_info.value)


def test_scheduled_time_invalid_hour_rejected():
    """Verify that invalid hours (e.g. 24, 25, -1) are rejected."""
    mock_db = MagicMock()
    mock_db.query.return_value.first.return_value = ArchiveSetting()

    for bad_time in ["24:00", "25:15", "-1:30"]:
        with pytest.raises(ValueError) as exc_info:
            update_archive_settings(
                db=mock_db,
                enabled=True,
                retention_value=30,
                retention_unit="Days",
                frequency="Daily",
                scheduled_time=bad_time,
            )
        assert "Invalid scheduled time" in str(exc_info.value)
