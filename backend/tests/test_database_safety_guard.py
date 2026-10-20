import pytest
from app.config.settings import settings
from app.database.models import User
from tests.conftest import (
    REAL_PRODUCTION_DB_NAMES,
    APPROVED_TEST_DB_NAMES,
    validate_test_database,
    is_production_database,
    is_approved_test_database,
)


def test_safety_guard_rejects_real_database_name():
    """Verify that the safety guard logic correctly detects and rejects real production database names."""
    real_names = ["DocuFlowDB", "docuflowdb", "DocuFlow_Prod", "docuflow_production"]
    for name in real_names:
        assert name.strip().lower() in REAL_PRODUCTION_DB_NAMES or "prod" in name.lower()
        assert is_production_database(name)

    # Rejection of dedicated production database names
    for prod_db in ["DocuFlow_Prod", "docuflow_production"]:
        with pytest.raises(ValueError, match="Safety Guard"):
            validate_test_database(prod_db, environment="development")

    # Rejection of running in production environments
    with pytest.raises(ValueError, match="Safety Guard"):
        validate_test_database("DocuFlowDB", environment="production")

    with pytest.raises(ValueError, match="Safety Guard"):
        validate_test_database("DocuFlowDB_Test", environment="prod")

    # Confirm test is running against the configured database
    assert settings.DB_NAME in ["DocuFlowDB", "DocuFlowDB_Test"]
    assert settings.DB_NAME in settings.DATABASE_URL


def test_safety_guard_accepts_approved_test_databases():
    """Verify that the safety guard logic permits only explicitly approved test databases."""
    approved_names = ["DocuFlowDB_Test", "docuflowdb_test", "docuflow_test", "test_docuflow", "docuflowdb_dev"]
    for name in approved_names:
        assert is_approved_test_database(name)
        assert validate_test_database(name, environment="test") is True
        assert validate_test_database(name, environment="development") is True

    # Assert that approved test database names are tracked in APPROVED_TEST_DB_NAMES
    for approved in APPROVED_TEST_DB_NAMES:
        assert is_approved_test_database(approved)


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
