import os
import sys
from typing import Optional
from app.config.settings import settings

SYSTEM_DATABASES = {"master", "msdb", "tempdb", "model"}


def enforce_test_database_safety(
    test_db_name: Optional[str] = None, environment: Optional[str] = None
) -> str:
    """
    Validates that tests and test-runner scripts execute against an explicitly
    configured, non-production test database, OR against DocuFlowDB only with explicit
    backup confirmation via ALLOW_LIVE_DB_TESTS=YES_I_HAVE_A_BACKUP.

    Refuses execution if:
    - Target is a system database (master, msdb, tempdb, model).
    - Target contains 'prod' or 'production'.
    - ENVIRONMENT is 'production' or 'prod'.
    - Target is DocuFlowDB and ALLOW_LIVE_DB_TESTS != 'YES_I_HAVE_A_BACKUP'.
    - Target is unset and ALLOW_LIVE_DB_TESTS != 'YES_I_HAVE_A_BACKUP'.
    """
    allow_live = os.getenv("ALLOW_LIVE_DB_TESTS") == "YES_I_HAVE_A_BACKUP"

    raw_name = test_db_name or os.getenv("TEST_DB_NAME")
    if not raw_name or not str(raw_name).strip():
        if allow_live:
            raw_name = settings.DB_NAME
        else:
            raise RuntimeError(
                "CRITICAL TEST SAFETY VIOLATION: TEST_DB_NAME environment variable must be set explicitly to run tests. "
                "Tests must NEVER run against default or implicit database configurations without explicit backup confirmation "
                "(ALLOW_LIVE_DB_TESTS=YES_I_HAVE_A_BACKUP)."
            )

    clean_name = str(raw_name).strip()
    clean_lower = clean_name.lower()
    live_db_lower = (settings.DB_NAME or "docuflowdb").strip().lower()

    # System databases are ALWAYS forbidden
    if clean_lower in SYSTEM_DATABASES:
        raise RuntimeError(
            f"CRITICAL TEST SAFETY VIOLATION: Refusing to run tests against SQL Server system database '{clean_name}'."
        )

    # Names containing 'prod' are ALWAYS forbidden
    if "prod" in clean_lower:
        raise RuntimeError(
            f"CRITICAL TEST SAFETY VIOLATION: Refusing to run tests against database '{clean_name}' containing 'prod'."
        )

    # Production environment is ALWAYS forbidden
    clean_env = (
        environment
        or os.getenv("ENVIRONMENT")
        or getattr(settings, "ENVIRONMENT", "")
        or ""
    ).strip().lower()
    if clean_env in ("production", "prod"):
        raise RuntimeError(
            "CRITICAL TEST SAFETY VIOLATION: Running tests in a production environment is strictly forbidden!"
        )

    # If targeting DocuFlowDB (or settings.DB_NAME)
    if clean_lower == live_db_lower or clean_lower == "docuflowdb":
        if not allow_live:
            raise RuntimeError(
                f"CRITICAL TEST SAFETY VIOLATION: Target database is the live database '{clean_name}'. "
                "Tests are refused unless ALLOW_LIVE_DB_TESTS=YES_I_HAVE_A_BACKUP is explicitly set."
            )

        warning_box = (
            "\n"
            + "=" * 80 + "\n"
            + " [!] CRITICAL WARNING: RUNNING TESTS AGAINST LIVE DATABASE: " + clean_name.upper() + "\n"
            + f" [!] SQL SERVER HOST: {settings.DB_HOST}:{settings.DB_PORT}\n"
            + " [!] CONFIRMATION: ALLOW_LIVE_DB_TESTS=YES_I_HAVE_A_BACKUP is active.\n"
            + " [!] Invariant: Tests must only create rows prefixed with TEST_ and\n"
            + " [!] delete exactly those rows upon teardown.\n"
            + "=" * 80 + "\n"
        )
        print(warning_box, file=sys.stderr)

    return clean_name
