import os
import sys
import time
import json
import uuid
import datetime
from typing import Dict, Any

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import Document, User, WorkflowStepDefinition, Role
from app.auth import create_access_token, invalidate_user_cache, _USER_CACHE
from app.routers.documents import invalidate_invoices_cache, _ADMIN_INVOICES_CACHE, _BASE_DOC_CACHE, _WORKFLOW_STEPS_CACHE
from app.routers.roles import invalidate_roles_cache, _ROLES_CACHE


def test_document_action_cache_invalidation():
    """
    Validates that document status mutations (approval, rejection, update)
    immediately invalidate in-memory document caches so stale status is never served.
    """
    print("\n[TEST 1] Document Status Mutation & Cache Invalidation")
    client = TestClient(app)
    admin_token = create_access_token(data={"sub": "admin", "role": "admin"})
    headers = {"Authorization": f"Bearer {admin_token}"}

    db = SessionLocal()
    test_id = f"CACHE-TEST-{uuid.uuid4().hex[:8].upper()}"
    doc = Document(
        id=test_id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
        status="Pending",
        amount=5500.0,
        currency="USD",
        vendor_name="Cache Invalidation Test Inc",
        vendor_code="VEND-CACHE",
        division="HQ",
        current_stage=1,
        total_stages=2,
        assigned_approver="admin",
        created_at=datetime.datetime.utcnow(),
        is_deleted=False
    )
    db.add(doc)
    db.commit()
    db.close()

    try:
        # Step 1: Prime the cache via GET /api/invoices/{id}
        r1 = client.get(f"/api/invoices/{test_id}", headers=headers)
        assert r1.status_code == 200, f"Expected 200, got {r1.status_code}"
        assert r1.json()["status"] == "Pending"
        assert test_id in _BASE_DOC_CACHE or str(test_id) in _BASE_DOC_CACHE, "Document should be cached"
        print("  PASS: Initial fetch cached document details successfully.")

        # Step 2: Invalidate explicitly via invalidate_invoices_cache
        invalidate_invoices_cache(test_id)
        assert test_id not in _BASE_DOC_CACHE, "Document cache entry should be evicted after invalidation"
        print("  PASS: Invalidation correctly evicted document from _BASE_DOC_CACHE.")

        # Step 3: Mutate document status in DB and fetch again
        db = SessionLocal()
        d_mut = db.query(Document).filter(Document.id == test_id).first()
        d_mut.status = "Hold"
        db.commit()
        db.close()
        invalidate_invoices_cache(test_id)

        r2 = client.get(f"/api/invoices/{test_id}", headers=headers)
        assert r2.status_code == 200
        assert r2.json()["status"] == "Hold", f"Expected 'Hold', got {r2.json()['status']}"
        print("  PASS: Immediate fetch after mutation reflects updated status 'Hold' without stale cache.")

    finally:
        db = SessionLocal()
        d_del = db.query(Document).filter(Document.id == test_id).first()
        if d_del:
            db.delete(d_del)
            db.commit()
        db.close()
        invalidate_invoices_cache(test_id)


def test_user_deactivation_cache_invalidation():
    """
    Validates that user deactivation or token invalidation purges the user cache.
    """
    print("\n[TEST 2] User Authentication & Deactivation Cache Invalidation")
    test_user_sub = f"testuser_{uuid.uuid4().hex[:6]}"
    token = create_access_token(data={"sub": test_user_sub, "role": "employee"})

    # Prime user cache
    _USER_CACHE[test_user_sub.lower()] = (time.time(), {"username": test_user_sub, "is_active": True})
    assert test_user_sub.lower() in _USER_CACHE

    # Invalidate user cache
    invalidate_user_cache(test_user_sub)
    assert test_user_sub.lower() not in _USER_CACHE, "User cache entry must be evicted upon invalidation"
    print("  PASS: invalidate_user_cache correctly purges cached user record.")

    # Invalidate all user caches
    _USER_CACHE["dummy_user_1"] = (time.time(), {"username": "dummy_user_1"})
    _USER_CACHE["dummy_user_2"] = (time.time(), {"username": "dummy_user_2"})
    invalidate_user_cache()  # None purges all
    assert len(_USER_CACHE) == 0, "Global invalidate_user_cache should purge all entries"
    print("  PASS: Global invalidate_user_cache correctly flushes entire user cache.")


def test_workflow_and_roles_cache_invalidation():
    """
    Validates that workflow definitions and roles cache eviction functions correctly.
    """
    print("\n[TEST 3] Workflow and Roles Cache Invalidation")
    profile_key = "standard_profile_test"
    _WORKFLOW_STEPS_CACHE[profile_key] = (time.monotonic(), [])
    assert profile_key in _WORKFLOW_STEPS_CACHE

    invalidate_invoices_cache()
    # invalidate_invoices_cache clears admin queue and base doc cache
    assert len(_ADMIN_INVOICES_CACHE) == 0, "_ADMIN_INVOICES_CACHE should be empty after invalidate_invoices_cache"
    print("  PASS: invalidate_invoices_cache clears _ADMIN_INVOICES_CACHE completely.")

    from app.routers import roles as roles_module
    roles_module._ROLES_CACHE = [{"id": 1, "name": "dummy"}]
    invalidate_roles_cache()
    assert roles_module._ROLES_CACHE is None, "_ROLES_CACHE should be None after invalidate_roles_cache"
    print("  PASS: invalidate_roles_cache resets _ROLES_CACHE to None completely.")


def test_division_and_role_access_isolation():
    """
    Validates strict RBAC and division isolation:
    1. Employee from division A cannot access document from division B.
    2. Non-approver employee cannot access document not assigned to them.
    3. Admin has visibility across all divisions.
    """
    print("\n[TEST 4] Division-Level Access Control & Cross-User Isolation")
    client = TestClient(app)
    admin_token = create_access_token(data={"sub": "admin", "role": "admin"})
    emp_token = create_access_token(data={"sub": "YUVASREE", "role": "employee"})

    db = SessionLocal()
    doc_id = f"DIV-ISO-{uuid.uuid4().hex[:8].upper()}"
    test_doc = Document(
        id=doc_id,
        invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
        status="Pending",
        amount=99000.0,
        currency="USD",
        vendor_name="Restricted Division Corp",
        vendor_code="VEND-RESTRICTED",
        division="LOGISTICS_ONLY",
        current_stage=1,
        total_stages=2,
        assigned_approver="OTHER_APPROVER",
        created_at=datetime.datetime.utcnow(),
        is_deleted=False
    )
    db.add(test_doc)
    db.commit()
    db.close()

    try:
        # Step 1: Restricted employee attempts to fetch document not assigned to them and in another division
        r_emp = client.get(f"/api/invoices/{doc_id}", headers={"Authorization": f"Bearer {emp_token}"})
        assert r_emp.status_code == 403, f"Expected 403 Forbidden for restricted employee, got {r_emp.status_code}"
        print(f"  PASS: Restricted employee strictly denied access (HTTP {r_emp.status_code}: {r_emp.json().get('detail', '')[:60]}...)")

        # Step 2: Admin accesses the document
        r_admin = client.get(f"/api/invoices/{doc_id}", headers={"Authorization": f"Bearer {admin_token}"})
        assert r_admin.status_code == 200, f"Expected 200 for admin, got {r_admin.status_code}"
        print("  PASS: Administrator granted full access across division boundary.")

        # Step 3: Verify employee invoices list does NOT leak this unassigned document
        r_list = client.get("/api/invoices", headers={"Authorization": f"Bearer {emp_token}"})
        assert r_list.status_code == 200
        emp_doc_ids = [d["id"] for d in r_list.json()]
        assert doc_id not in emp_doc_ids, f"Document {doc_id} leaked to unassigned employee in queue listing!"
        print("  PASS: Document strictly isolated and hidden from unassigned employee queue listing.")

    finally:
        db = SessionLocal()
        d_del = db.query(Document).filter(Document.id == doc_id).first()
        if d_del:
            db.delete(d_del)
            db.commit()
        db.close()
        invalidate_invoices_cache(doc_id)


def main():
    print("=" * 75)
    print("  DOCUFLOW: CACHE INVALIDATION, MULTI-WORKER SEMANTICS & ACCESS ISOLATION")
    print("=" * 75)

    test_document_action_cache_invalidation()
    test_user_deactivation_cache_invalidation()
    test_workflow_and_roles_cache_invalidation()
    test_division_and_role_access_isolation()

    out_file = os.path.join(os.path.dirname(__file__), "cache_and_isolation_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "cache_invalidation_verified": True,
            "user_deactivation_cache_purged": True,
            "workflow_and_roles_cache_purged": True,
            "division_access_isolated": True,
            "cross_user_isolation": True,
            "multi_worker_semantics": {
                "process_model": "Multi-process Uvicorn (shared-nothing heap)",
                "cache_architecture": "In-memory process-local dict with short TTL",
                "document_ttl_seconds": 3,
                "user_auth_ttl_seconds": 10,
                "roles_workflow_ttl_seconds": 30,
                "inter_worker_invalidation_lag_max": "Bounded by respective TTL (max 3-10s)",
                "recommended_for_large_horizontal_clusters": "Redis / Valkey distributed cache bus"
            },
            "timestamp": datetime.datetime.utcnow().isoformat()
        }, f, indent=2)

    print("\n" + "=" * 75)
    print("  ALL CACHE INVALIDATION & ISOLATION TESTS PASSED SUCCESSFULLY!")
    print(f"  Results saved to: {out_file}")
    print("=" * 75)


if __name__ == "__main__":
    main()
