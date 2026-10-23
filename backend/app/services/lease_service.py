"""
Distributed System Leases for Multi-Worker Readiness
Allows background workers and schedulers to coordinate execution safely.
"""

import os
import uuid
import datetime
import logging
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger(__name__)

WORKER_INSTANCE_ID = f"worker_{os.getpid()}_{uuid.uuid4().hex[:6]}"


def acquire_system_lease(
    db: Session,
    lease_name: str,
    owner_id: str = WORKER_INSTANCE_ID,
    ttl_seconds: int = 120
) -> bool:
    """
    Attempts to acquire or renew a distributed lease.
    Returns True if the lease was granted/renewed to owner_id, False otherwise.
    Fails safely / latent if table does not exist.
    """
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(seconds=ttl_seconds)

    try:
        # Atomic upsert/claim query for SQL Server
        query = text("""
            SET NOCOUNT ON;
            UPDATE system_leases
            SET owner_id = :owner_id, acquired_at = :now, expires_at = :expires_at
            WHERE lease_name = :lease_name AND (expires_at < :now OR owner_id = :owner_id);

            IF @@ROWCOUNT = 0
            BEGIN
                BEGIN TRY
                    INSERT INTO system_leases (lease_name, owner_id, acquired_at, expires_at)
                    VALUES (:lease_name, :owner_id, :now, :expires_at);
                END TRY
                BEGIN CATCH
                    -- Another worker acquired the lease concurrently
                END CATCH
            END;

            SELECT owner_id FROM system_leases WHERE lease_name = :lease_name AND owner_id = :owner_id AND expires_at >= :now;
        """)
        res = db.execute(query, {
            "lease_name": lease_name,
            "owner_id": owner_id,
            "now": now,
            "expires_at": expires_at
        }).scalar()
        db.commit()
        return bool(res == owner_id)
    except Exception as e:
        db.rollback()
        # Latent: if table doesn't exist, log debug and allow single-instance execution
        logger.debug("Database lease check fell back to local single-instance: %s", e)
        return True


def release_system_lease(
    db: Session,
    lease_name: str,
    owner_id: str = WORKER_INSTANCE_ID
) -> None:
    """Releases an actively held lease."""
    try:
        db.execute(text("""
            DELETE FROM system_leases WHERE lease_name = :lease_name AND owner_id = :owner_id;
        """), {"lease_name": lease_name, "owner_id": owner_id})
        db.commit()
    except Exception as e:
        db.rollback()
        logger.debug("Failed releasing system lease: %s", e)
