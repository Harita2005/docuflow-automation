"""
CFMS Automation Scheduler Service
Manages persistence in SQL Server and automated daily execution in Asia/Kolkata timezone.
Runs the CFMS synchronization workflow once daily at the configured IST time.
Guarantees duplicate prevention across app restarts using last_run_date tracking.
"""

import datetime
import logging
import re
import threading
import time
import uuid
import zoneinfo
from typing import Dict, Any, Optional

from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.database.models import CfmsAutomationSchedule, AuditLog
from app.services import cfms_client

logger = logging.getLogger(__name__)

IST = zoneinfo.ZoneInfo("Asia/Kolkata")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

_cfms_worker_thread: Optional[threading.Thread] = None
_cfms_worker_stop_event: Optional[threading.Event] = None


def get_or_create_schedule(db: Session) -> CfmsAutomationSchedule:
    """Retrieve the single-row CFMS schedule configuration, creating default if absent."""
    sched = db.query(CfmsAutomationSchedule).first()
    if not sched:
        sched = CfmsAutomationSchedule(
            enabled=False,
            execution_time="10:00",
            last_run_date=None,
            last_run_status=None,
        )
        db.add(sched)
        db.commit()
        db.refresh(sched)
    return sched


def get_schedule_view(db: Session) -> Dict[str, Any]:
    """Return JSON-serializable schedule view for API consumers."""
    sched = get_or_create_schedule(db)
    time_str = str(sched.execution_time or "10:00")
    return {
        "enabled": bool(sched.enabled),
        "execution_time": time_str,
        "executionTime": time_str,
        "startTime": time_str,
        "timezone": "Asia/Kolkata",
        "lastRunDate": sched.last_run_date,
        "lastRunStatus": sched.last_run_status,
        "lastRunAt": sched.last_run_at.isoformat() if sched.last_run_at else None,
    }


def update_schedule(
    db: Session,
    enabled: bool,
    execution_time: str,
    actor: str = "administrator",
) -> Dict[str, Any]:
    """Validate and persist schedule settings into SQL Server."""
    clean_time = str(execution_time or "").strip()
    if not TIME_RE.match(clean_time):
        raise ValueError("Execution time must be HH:MM in 24-hour format (e.g. 10:00).")

    sched = get_or_create_schedule(db)
    old_enabled = sched.enabled
    old_time = sched.execution_time

    sched.enabled = bool(enabled)
    sched.execution_time = clean_time
    sched.updated_at = datetime.datetime.utcnow()

    try:
        db.add(
            AuditLog(
                invoice_id=None,
                user=actor,
                action="CFMS Schedule Updated",
                stage="Administration",
                notes=f"Customer Feedback Automation Schedule updated by {actor}: "
                      f"enabled={sched.enabled} (was {old_enabled}), "
                      f"execution_time={sched.execution_time} IST (was {old_time}).",
            )
        )
    except Exception as exc:
        logger.debug("Failed to record audit log for schedule update: %s", exc)

    db.commit()
    db.refresh(sched)
    logger.info(
        "[CFMS Scheduler] Schedule updated by %s: enabled=%s, execution_time=%s IST",
        actor, sched.enabled, sched.execution_time,
    )
    return get_schedule_view(db)


def is_schedule_due(sched: CfmsAutomationSchedule, now_ist: Optional[datetime.datetime] = None) -> bool:
    """
    Evaluates whether the schedule is currently due for execution in Asia/Kolkata.
    Guarantees:
      - Does not execute if enabled is False.
      - Does not execute more than once on the same calendar date in IST.
      - Survives application restarts without duplicate runs.
    """
    if not sched.enabled:
        return False

    if now_ist is None:
        now_ist = datetime.datetime.now(IST)

    today_ist = now_ist.strftime("%Y-%m-%d")
    if sched.last_run_date == today_ist:
        return False  # Already ran today in IST

    try:
        parts = str(sched.execution_time).split(":")
        target_hour = int(parts[0])
        target_minute = int(parts[1]) if len(parts) > 1 else 0
    except Exception:
        target_hour = 10
        target_minute = 0

    # Within 5-minute execution window starting from target hour:minute
    if now_ist.hour == target_hour and 0 <= (now_ist.minute - target_minute) < 5:
        return True

    return False


def execute_cfms_sync_workflow(db: Session, force: bool = False) -> Dict[str, Any]:
    """
    Executes the secure CFMS synchronization workflow for yesterday's survey report.
    Idempotent: updates last_run_date immediately to avoid double-execution.
    """
    now_ist = datetime.datetime.now(IST)
    today_ist = now_ist.strftime("%Y-%m-%d")
    yesterday_ist = (now_ist.date() - datetime.timedelta(days=1)).isoformat()

    sched = get_or_create_schedule(db)
    if not force and sched.last_run_date == today_ist:
        return {
            "executed": False,
            "reason": f"Already executed today ({today_ist})",
            "reportDate": yesterday_ist,
        }

    # Mark run in progress immediately in SQL Server before network call
    sched.last_run_date = today_ist
    sched.last_run_at = datetime.datetime.utcnow()
    sched.last_run_status = "RUNNING"
    db.commit()

    logger.info(
        "[CFMS Scheduler] Triggering daily automated sync for report date %s...",
        yesterday_ist,
    )

    try:
        r = cfms_client.call(
            "POST",
            "/sync/now",
            actor="system:scheduler",
            permissions=["cfms:sync"],
            json_body={"reportDate": yesterday_ist},
            idempotency_key=str(uuid.uuid4()),
        )
        if r.status < 400:
            job_id = r.body.get("jobId") if isinstance(r.body, dict) else None
            sched.last_run_status = "TRIGGERED"
            result_detail = f"Accepted by CFMS (jobId={job_id})"
        else:
            sched.last_run_status = f"HTTP_{r.status}"
            result_detail = f"CFMS returned HTTP {r.status}"
    except cfms_client.CfmsNotConfigured:
        sched.last_run_status = "NOT_CONFIGURED"
        result_detail = "CFMS integration is not configured on this server"
        logger.warning("[CFMS Scheduler] Skipped: CFMS integration not configured.")
    except Exception as exc:
        sched.last_run_status = f"ERROR: {type(exc).__name__}"
        result_detail = str(exc)
        logger.error("[CFMS Scheduler] Network/call error triggering sync: %s", exc)

    try:
        db.add(
            AuditLog(
                invoice_id=None,
                user="system:scheduler",
                action="Customer Feedback Daily Sync",
                stage="Synchronization",
                notes=f"Automated daily sync for {yesterday_ist}: {sched.last_run_status} ({result_detail}).",
            )
        )
    except Exception as audit_err:
        logger.debug("Failed to record scheduler audit log: %s", audit_err)

    db.commit()
    db.refresh(sched)
    return {
        "executed": True,
        "status": sched.last_run_status,
        "reportDate": yesterday_ist,
        "detail": result_detail,
    }


def run_cfms_scheduler_loop(stop_event: threading.Event, check_interval: int = 30):
    """Background polling loop checking if automation is due."""
    logger.info("[CFMS Scheduler] Background scheduler loop started (interval=%ss).", check_interval)
    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                sched = db.query(CfmsAutomationSchedule).first()
                if sched and sched.enabled:
                    if is_schedule_due(sched):
                        logger.info(
                            "[CFMS Scheduler] Scheduled time reached (%s IST). Executing sync...",
                            sched.execution_time,
                        )
                        execute_cfms_sync_workflow(db)
        except Exception as exc:
            logger.error("[CFMS Scheduler] Error in loop: %s", exc)

        for _ in range(check_interval):
            if stop_event.is_set():
                break
            time.sleep(1)
    logger.info("[CFMS Scheduler] Background scheduler loop stopped.")


def start_cfms_scheduler(check_interval: int = 30):
    """Start background CFMS scheduler thread if not already running."""
    global _cfms_worker_thread, _cfms_worker_stop_event
    if _cfms_worker_thread is not None and _cfms_worker_thread.is_alive():
        return
    _cfms_worker_stop_event = threading.Event()
    _cfms_worker_thread = threading.Thread(
        target=run_cfms_scheduler_loop,
        args=(_cfms_worker_stop_event, check_interval),
        daemon=True,
        name="DocuFlow-CfmsScheduler",
    )
    _cfms_worker_thread.start()
    logger.info("[CFMS Scheduler] Background thread started.")


def stop_cfms_scheduler():
    """Signal background thread to stop and wait for termination."""
    global _cfms_worker_thread, _cfms_worker_stop_event
    if _cfms_worker_stop_event:
        _cfms_worker_stop_event.set()
    if _cfms_worker_thread and _cfms_worker_thread.is_alive():
        _cfms_worker_thread.join(timeout=3)
    logger.info("[CFMS Scheduler] Background thread stopped.")

