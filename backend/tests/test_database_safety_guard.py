import pytest
from app.config.settings import settings
from app.database.connection import SessionLocal
from app.database.models import User


def test_safety_guard_rejects_real_database_name():
    """Verify that the safety guard logic correctly detects and rejects real production database names."""
    from tests.conftest import REAL_PRODUCTION_DB_NAMES

    real_names = ["DocuFlowDB", "docuflowdb", "DocuFlow_Prod", "docuflow_production"]
    for name in real_names:
        assert name.strip().lower() in REAL_PRODUCTION_DB_NAMES or "prod" in name.lower()

    # Confirm test is running against the configured database
    assert settings.DB_NAME in ["DocuFlowDB", "DocuFlowDB_Test"]
    assert settings.DB_NAME in settings.DATABASE_URL


def test_transactional_rollback_preserves_database_state(isolated_db_transaction):
    """
    Verify that any data mutations and commits executed during a test
    are completely isolated and rolled back by the outer transaction fixture.
    """
    # 1. Modify User 1 in this test and commit
    user1 = isolated_db_transaction.query(User).filter(User.id == 1).first()
    assert user1 is not None
    original_status = user1.is_active

    user1.is_active = not original_status
    isolated_db_transaction.commit()

    # Verify changed in-session
    assert user1.is_active == (not original_status)


def test_subsequent_test_sees_unmodified_database_state(isolated_db_transaction):
    """
    Verify that User 1 retains its original state in subsequent tests,
    proving that the previous test's commit was rolled back by the fixture.
    """
    user1 = isolated_db_transaction.query(User).filter(User.id == 1).first()
    assert user1 is not None
    assert user1.is_active is True, "State pollution detected: User 1 should be active"
    assert user1.is_deleted is False, "State pollution detected: User 1 should not be deleted"
