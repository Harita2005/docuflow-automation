import datetime
from app.database.models import AuditLog
from app.routers.audit import (
    get_audit_retention_days,
    prune_expired_audit_logs,
)


def test_default_audit_retention_days():
    """Verify that default retention is 7 days (1 week)."""
    days = get_audit_retention_days()
    assert days == 7


def test_prune_expired_audit_logs(db_session):
    """Verify pruning removes logs older than retention cutoff and keeps recent ones."""
    now = datetime.datetime.utcnow()

    # 1. Create a recent log (2 days ago)
    recent_log = AuditLog(
        invoice_id="INV-RECENT",
        user="test_user",
        action="APPROVED",
        stage="L1 Approval",
        notes="Recent approval",
        timestamp=now - datetime.timedelta(days=2),
    )

    # 2. Create an expired log (10 days ago, > 7 days default)
    old_log = AuditLog(
        invoice_id="INV-OLD",
        user="test_user",
        action="REJECTED",
        stage="L2 Approval",
        notes="Old rejection",
        timestamp=now - datetime.timedelta(days=10),
    )

    # 3. Create a very old log (30 days ago)
    very_old_log = AuditLog(
        invoice_id="INV-VERY-OLD",
        user="test_user",
        action="SYNCED",
        stage="Sync",
        notes="Old sync",
        timestamp=now - datetime.timedelta(days=30),
    )

    db_session.add_all([recent_log, old_log, very_old_log])
    db_session.commit()

    total_before = db_session.query(AuditLog).count()
    assert total_before == 3

    # Prune with 7-day policy
    pruned = prune_expired_audit_logs(db_session, retention_days=7)
    assert pruned == 2

    remaining = db_session.query(AuditLog).all()
    assert len(remaining) == 1
    assert remaining[0].invoice_id == "INV-RECENT"


def test_prune_indefinite_retention(db_session):
    """Verify retention_days=0 keeps all logs."""
    now = datetime.datetime.utcnow()
    old_log = AuditLog(
        invoice_id="INV-OLD",
        user="test_user",
        action="SUBMITTED",
        timestamp=now - datetime.timedelta(days=50),
    )
    db_session.add(old_log)
    db_session.commit()

    pruned = prune_expired_audit_logs(db_session, retention_days=0)
    assert pruned == 0
    assert db_session.query(AuditLog).count() == 1


def test_retention_api_endpoints(client, db_session):
    """Test GET/POST retention and POST cleanup endpoints."""
    now = datetime.datetime.utcnow()

    # Seed 1 recent log and 1 old log
    log1 = AuditLog(
        invoice_id="INV-1",
        user="admin",
        action="APPROVED",
        timestamp=now - datetime.timedelta(days=1),
    )
    log2 = AuditLog(
        invoice_id="INV-2",
        user="admin",
        action="SYNCED",
        timestamp=now - datetime.timedelta(days=15),
    )
    db_session.add_all([log1, log2])
    db_session.commit()

    # 1. GET retention info
    res = client.get("/api/admin/audit-logs/retention")
    assert res.status_code == 200
    data = res.json()
    assert "retention_days" in data
    assert data["default_retention_days"] == 7
    assert data["total_logs"] == 2
    assert data["expired_logs_count"] == 1

    # 2. Update retention to 30 days (log2 is 15 days, so no longer expired under 30d)
    update_res = client.post(
        "/api/admin/audit-logs/retention",
        json={"retention_days": 30, "prune_immediately": False},
    )
    assert update_res.status_code == 200
    assert update_res.json()["retention_days"] == 30

    res2 = client.get("/api/admin/audit-logs/retention")
    assert res2.json()["retention_days"] == 30
    assert res2.json()["expired_logs_count"] == 0

    # 3. Change back to 7 days and trigger cleanup
    client.post(
        "/api/admin/audit-logs/retention",
        json={"retention_days": 7, "prune_immediately": False},
    )
    cleanup_res = client.post("/api/admin/audit-logs/cleanup")
    assert cleanup_res.status_code == 200
    assert cleanup_res.json()["pruned"] == 1

    # 4. Check audit logs list filters out pruned
    logs_res = client.get("/api/admin/audit-logs")
    assert logs_res.status_code == 200
    logs = logs_res.json()
    assert len(logs) == 1
    assert logs[0]["invoice_id"] == "INV-1"
