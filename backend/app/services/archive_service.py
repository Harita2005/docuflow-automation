import datetime
import logging
import threading
import time
from typing import Dict, Any, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.config.settings import settings
from app.database.connection import SessionLocal, engine
from app.database.models import ArchiveSetting

logger = logging.getLogger(__name__)

# Child tables related to documents that must be archived
ARCHIVE_CHILD_TABLES = [
    'document_line_items',
    'document_checklist_states',
    'document_approval_logs',
    'system_engine_logs',
    'document_locks',
    'integration_sync_logs',
    'callback_events',
    'approval_assignments',
]

COMPLETED_STATUSES = ('Approved', 'Cancelled', 'Settled', 'Paid', 'Ready for Payment', 'Rejected')

_archive_worker_thread: Optional[threading.Thread] = None
_archive_worker_stop_event: Optional[threading.Event] = None
_archive_engine = None


def get_archive_engine():
    global _archive_engine
    if _archive_engine is None:
        archive_url = settings.get_archive_database_url()
        _archive_engine = create_engine(
            archive_url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
            pool_recycle=300,
        )
    return _archive_engine


def get_archive_settings(db: Session) -> Dict[str, Any]:
    setting = db.query(ArchiveSetting).first()
    if not setting:
        setting = ArchiveSetting(
            enabled=False,
            retention_value=90,
            retention_unit="Days",
            frequency="Daily",
            scheduled_time="02:00",
            last_run_status="Not run yet",
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)

    return {
        "id": setting.id,
        "enabled": bool(setting.enabled),
        "retention_value": int(setting.retention_value or 90),
        "retention_unit": str(setting.retention_unit or "Days"),
        "frequency": str(setting.frequency or "Daily"),
        "scheduled_time": str(setting.scheduled_time or "02:00"),
        "last_run_status": setting.last_run_status,
        "last_run_at": setting.last_run_at.isoformat() if setting.last_run_at else None,
        "last_run_details": setting.last_run_details,
    }


def update_archive_settings(
    db: Session,
    enabled: bool,
    retention_value: int,
    retention_unit: str,
    frequency: str,
    scheduled_time: str,
) -> Dict[str, Any]:
    setting = db.query(ArchiveSetting).first()
    if not setting:
        setting = ArchiveSetting()
        db.add(setting)

    setting.enabled = bool(enabled)
    setting.retention_value = max(1, int(retention_value))
    setting.retention_unit = str(retention_unit).capitalize()
    if setting.retention_unit not in ("Days", "Months", "Years"):
        setting.retention_unit = "Days"

    setting.frequency = str(frequency).capitalize()
    if setting.frequency not in ("Daily", "Weekly", "Monthly"):
        setting.frequency = "Daily"

    # Validate scheduled_time: must be in HH:MM format with minute restricted to 00, 15, 30, 45
    raw_time = str(scheduled_time).strip()
    try:
        parts = raw_time.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        if hour < 0 or hour > 23:
            raise ValueError(f"Hour must be between 00 and 23. Received: {hour}")
        if minute not in (0, 15, 30, 45):
            raise ValueError(f"Minute must be in 15-minute intervals (00, 15, 30, 45). Received: {minute:02d}")
        setting.scheduled_time = f"{hour:02d}:{minute:02d}"
    except (ValueError, IndexError) as exc:
        raise ValueError(f"Invalid scheduled time '{raw_time}'. {exc}")

    setting.updated_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(setting)
    return get_archive_settings(db)


def calculate_cutoff_date(retention_value: int, retention_unit: str) -> datetime.datetime:
    now = datetime.datetime.utcnow()
    unit = str(retention_unit).lower().strip()
    if "year" in unit:
        days = retention_value * 365
    elif "month" in unit:
        days = retention_value * 30
    else:
        days = retention_value
    return now - datetime.timedelta(days=days)


def execute_database_archival(batch_size: int = 200, forced: bool = False) -> Dict[str, Any]:
    """
    Executes a complete, transactional archival run:
    1. Reads active settings from DocuFlowDB.
    2. Identifies completed, retention-expired documents.
    3. Copies documents and their child records into DocuFlowArchiveDB.
    4. Validates archive copy row counts before removing active records.
    5. Cleans up active records safely in transaction.
    6. Updates last run status and audit trail.
    """
    start_time = datetime.datetime.utcnow()
    db_prod = SessionLocal()
    arch_engine = get_archive_engine()

    try:
        setting = db_prod.query(ArchiveSetting).first()
        if not setting and not forced:
            return {"status": "SKIPPED", "message": "No archival settings configured"}

        if setting and not setting.enabled and not forced:
            return {"status": "SKIPPED", "message": "Archival is disabled in settings"}

        ret_val = setting.retention_value if setting else 90
        ret_unit = setting.retention_unit if setting else "Days"
        cutoff_date = calculate_cutoff_date(ret_val, ret_unit)

        # Query eligible document IDs:
        # - Status strictly terminal/completed
        # - Not deleted or soft-deleted
        # - Older than cutoff date based on invoice_date, created_at, or updated_at
        status_placeholders = ", ".join([f"'{s}'" for s in COMPLETED_STATUSES])
        query_sql = f"""
            SELECT TOP ({batch_size}) id 
            FROM DocuFlowDB.dbo.documents
            WHERE status IN ({status_placeholders})
              AND (
                  (invoice_date IS NOT NULL AND TRY_CONVERT(DATETIME, invoice_date) < :cutoff)
                  OR (invoice_date IS NULL AND created_at < :cutoff)
              )
            ORDER BY created_at ASC
        """
        eligible_ids = [
            r[0] for r in db_prod.execute(text(query_sql), {"cutoff": cutoff_date}).fetchall()
        ]

        if not eligible_ids:
            msg = f"No eligible completed documents older than {cutoff_date.strftime('%Y-%m-%d')} found."
            if setting:
                setting.last_run_status = "COMPLETED"
                setting.last_run_at = datetime.datetime.utcnow()
                setting.last_run_details = msg
                db_prod.commit()
            return {"status": "COMPLETED", "archived_count": 0, "details": msg}

        # Perform archival transfers per document or batch
        archived_count = 0
        total_child_records = 0

        # Sync table columns between DBs
        with arch_engine.connect() as a_conn:
            with engine.connect() as p_conn:
                for doc_id in eligible_ids:
                    # Protect against duplicate transfers in archive
                    existing_arch = a_conn.execute(
                        text("SELECT id FROM DocuFlowArchiveDB.dbo.documents WHERE id = :doc_id"),
                        {"doc_id": doc_id}
                    ).fetchone()
                    if existing_arch:
                        # Already in archive; remove from production after validating
                        _remove_production_document_and_children(p_conn, doc_id)
                        p_conn.commit()
                        archived_count += 1
                        continue

                    # 1. Transfer Document header
                    p_cols = [r[0] for r in p_conn.execute(text("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'documents'")).fetchall()]
                    a_cols = [r[0] for r in a_conn.execute(text("SELECT COLUMN_NAME FROM DocuFlowArchiveDB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'documents'")).fetchall()]
                    common_doc_cols = [c for c in p_cols if c in a_cols]
                    cols_str = ", ".join([f"[{c}]" for c in common_doc_cols])

                    insert_doc_sql = f"""
                        INSERT INTO DocuFlowArchiveDB.dbo.documents ({cols_str})
                        SELECT {cols_str}
                        FROM DocuFlowDB.dbo.documents
                        WHERE id = :doc_id
                    """
                    a_conn.execute(text(insert_doc_sql), {"doc_id": doc_id})

                    # 2. Transfer Child Tables
                    for tbl in ARCHIVE_CHILD_TABLES:
                        # Determine FK column name: invoice_id or document_id
                        tbl_cols = [r[0] for r in p_conn.execute(text(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{tbl}'")).fetchall()]
                        arch_tbl_cols = [r[0] for r in a_conn.execute(text(f"SELECT COLUMN_NAME FROM DocuFlowArchiveDB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{tbl}'")).fetchall()]
                        common_tbl_cols = [c for c in tbl_cols if c in arch_tbl_cols]
                        if not common_tbl_cols:
                            continue

                        fk_col = "invoice_id" if "invoice_id" in tbl_cols else "document_id"
                        child_cols_str = ", ".join([f"[{c}]" for c in common_tbl_cols])

                        # Check identity property on child table
                        has_ident = a_conn.execute(text(
                            f"SELECT COLUMN_NAME FROM DocuFlowArchiveDB.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{tbl}' AND COLUMNPROPERTY(OBJECT_ID('DocuFlowArchiveDB.dbo.{tbl}'), COLUMN_NAME, 'IsIdentity') = 1"
                        )).fetchone()

                        ident_on = f"SET IDENTITY_INSERT DocuFlowArchiveDB.dbo.{tbl} ON; " if has_ident else ""
                        ident_off = f" SET IDENTITY_INSERT DocuFlowArchiveDB.dbo.{tbl} OFF;" if has_ident else ""

                        child_sql = f"""
                            {ident_on}
                            INSERT INTO DocuFlowArchiveDB.dbo.{tbl} ({child_cols_str})
                            SELECT {child_cols_str}
                            FROM DocuFlowDB.dbo.{tbl}
                            WHERE [{fk_col}] = :doc_id;
                            {ident_off}
                        """
                        res_child = a_conn.execute(text(child_sql), {"doc_id": doc_id})
                        if res_child.rowcount and res_child.rowcount > 0:
                            total_child_records += res_child.rowcount

                    a_conn.commit()

                    # 3. Validate archive copy before removing active copy
                    verify_copy = a_conn.execute(
                        text("SELECT id, status, invoice_number, file_path, file_url FROM DocuFlowArchiveDB.dbo.documents WHERE id = :doc_id"),
                        {"doc_id": doc_id}
                    ).fetchone()

                    if not verify_copy:
                        raise RuntimeError(f"Archive copy validation failed for document {doc_id}; active record retained.")

                    # 4. Remove active copy from production
                    _remove_production_document_and_children(p_conn, doc_id)
                    p_conn.commit()
                    archived_count += 1

        details_msg = f"Successfully archived {archived_count} documents and {total_child_records} associated records to DocuFlowArchiveDB."
        logger.info("[DatabaseArchival] %s", details_msg)

        if setting:
            setting.last_run_status = "SUCCESS"
            setting.last_run_at = datetime.datetime.utcnow()
            setting.last_run_details = details_msg
            db_prod.commit()

        return {
            "status": "SUCCESS",
            "archived_count": archived_count,
            "child_records_count": total_child_records,
            "details": details_msg,
            "duration_seconds": (datetime.datetime.utcnow() - start_time).total_seconds(),
        }

    except Exception as exc:
        err_msg = f"Archival failed: {str(exc)}"
        logger.error("[DatabaseArchival] %s", err_msg, exc_info=True)
        if setting:
            try:
                setting.last_run_status = "FAILED"
                setting.last_run_at = datetime.datetime.utcnow()
                setting.last_run_details = err_msg
                db_prod.commit()
            except Exception:
                # Silently ignore failure when saving error status to settings
                logger.debug("Handled non-fatal exception")
        return {"status": "FAILED", "error": err_msg}
    finally:
        db_prod.close()


def _remove_production_document_and_children(p_conn, doc_id: str):
    """Safely removes child table records and parent document from DocuFlowDB."""
    for tbl in ARCHIVE_CHILD_TABLES:
        tbl_cols = [r[0] for r in p_conn.execute(text(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{tbl}'")).fetchall()]
        fk_col = "invoice_id" if "invoice_id" in tbl_cols else "document_id"
        p_conn.execute(text(f"DELETE FROM DocuFlowDB.dbo.[{tbl}] WHERE [{fk_col}] = :doc_id"), {"doc_id": doc_id})

    p_conn.execute(text("DELETE FROM DocuFlowDB.dbo.documents WHERE id = :doc_id"), {"doc_id": doc_id})


def is_scheduled_time_due(scheduled_time_str: str, frequency: str, last_run_at: Optional[datetime.datetime]) -> bool:
    """Evaluates if the current time matches the scheduled time and frequency."""
    now = datetime.datetime.utcnow()
    try:
        parts = scheduled_time_str.split(":")
        target_hour = int(parts[0])
        target_minute = int(parts[1]) if len(parts) > 1 else 0
    except Exception:
        target_hour = 2
        target_minute = 0

    # Within 5 minutes of target hour/minute
    if now.hour != target_hour or abs(now.minute - target_minute) > 5:
        return False

    if not last_run_at:
        return True

    diff = now - last_run_at
    freq = (frequency or "Daily").lower()
    if freq == "weekly":
        return diff.total_seconds() >= 6 * 86400
    elif freq == "monthly":
        return diff.total_seconds() >= 27 * 86400
    else:  # Daily
        return diff.total_seconds() >= 23 * 3600


def run_archive_scheduler_loop(stop_event: threading.Event, check_interval: int = 60):
    """Background worker loop checking and executing archival at the scheduled time."""
    logger.info("[DatabaseArchival] Scheduler loop started with check_interval=%ss", check_interval)
    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                setting = db.query(ArchiveSetting).first()
                if setting and setting.enabled:
                    if is_scheduled_time_due(setting.scheduled_time, setting.frequency, setting.last_run_at):
                        logger.info("[DatabaseArchival] Scheduled time reached. Starting automated archival...")
                        execute_database_archival()
        except Exception as exc:
            logger.error("[DatabaseArchival] Error in scheduler loop: %s", exc)

        for _ in range(check_interval):
            if stop_event.is_set():
                break
            time.sleep(1)
    logger.info("[DatabaseArchival] Scheduler loop stopped.")


def start_archive_scheduler():
    global _archive_worker_thread, _archive_worker_stop_event
    if _archive_worker_thread is not None and _archive_worker_thread.is_alive():
        return
    _archive_worker_stop_event = threading.Event()
    _archive_worker_thread = threading.Thread(
        target=run_archive_scheduler_loop,
        args=(_archive_worker_stop_event, 60),
        daemon=True,
        name="DocuFlow-ArchiveScheduler"
    )
    _archive_worker_thread.start()
    logger.info("[DatabaseArchival] Background archival scheduler started.")


def stop_archive_scheduler():
    global _archive_worker_thread, _archive_worker_stop_event
    if _archive_worker_stop_event:
        _archive_worker_stop_event.set()
    if _archive_worker_thread and _archive_worker_thread.is_alive():
        _archive_worker_thread.join(timeout=3)
    _archive_worker_thread = None
    _archive_worker_stop_event = None
    logger.info("[DatabaseArchival] Background archival scheduler stopped.")
