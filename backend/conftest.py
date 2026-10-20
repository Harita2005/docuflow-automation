import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Import all test DB fixtures, safety guards, and configuration from tests.conftest
from tests.conftest import (
    REAL_PRODUCTION_DB_NAMES,
    APPROVED_TEST_DB_NAMES,
    TEST_DB_NAME,
    validate_test_database,
    is_production_database,
    is_approved_test_database,
    enforce_test_db_safety_guard,
    isolated_db_transaction,
)

__all__ = [
    "REAL_PRODUCTION_DB_NAMES",
    "APPROVED_TEST_DB_NAMES",
    "TEST_DB_NAME",
    "validate_test_database",
    "is_production_database",
    "is_approved_test_database",
    "enforce_test_db_safety_guard",
    "isolated_db_transaction",
]
