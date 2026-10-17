import os
import sys
import time
import json
import random
import statistics
import concurrent.futures
from typing import List, Dict, Any

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import Document
from app.auth import create_access_token


def get_token(sub: str = "admin", role: str = "admin") -> str:
    return create_access_token(data={"sub": sub, "role": role})


def simulate_burst_user(user_idx: int, auth_token: str, doc_ids: List[str]) -> List[Dict[str, Any]]:
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {auth_token}"}
    results = []

    # 1. Fetch Invoices Queue
    t0 = time.perf_counter()
    r = client.get("/api/invoices", headers=headers)
    results.append({"name": "GET /api/invoices", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    # 2. View Document Details
    doc_id = doc_ids[user_idx % len(doc_ids)] if doc_ids else "INV-001"
    t0 = time.perf_counter()
    r = client.get(f"/api/invoices/{doc_id}", headers=headers)
    results.append({"name": "GET /api/invoices/{id}", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code in (200, 404)})

    # 3. RBAC Roles
    t0 = time.perf_counter()
    r = client.get("/api/admin/roles", headers=headers)
    results.append({"name": "GET /api/admin/roles", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    # 4. Archival Settings
    t0 = time.perf_counter()
    r = client.get("/api/admin/archive/settings", headers=headers)
    results.append({"name": "GET /api/admin/archive/settings", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    # 5. Third Party Integrations
    t0 = time.perf_counter()
    r = client.get("/api/integrations/v2/applications", headers=headers)
    results.append({"name": "GET /api/integrations/v2/applications", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    return results


def simulate_realistic_user(user_idx: int, auth_token: str, doc_ids: List[str], think_time_range=(0.2, 0.8)) -> List[Dict[str, Any]]:
    """
    Simulates an interactive user session with realistic think time between operational steps.
    """
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {auth_token}"}
    results = []

    # Step 1: Open invoices queue / dashboard
    time.sleep(random.uniform(*think_time_range))
    t0 = time.perf_counter()
    r = client.get("/api/invoices", headers=headers)
    results.append({"name": "GET /api/invoices (Realistic)", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    # Step 2: Open specific document
    time.sleep(random.uniform(*think_time_range))
    doc_id = doc_ids[user_idx % len(doc_ids)] if doc_ids else "INV-001"
    t0 = time.perf_counter()
    r = client.get(f"/api/invoices/{doc_id}", headers=headers)
    results.append({"name": "GET /api/invoices/{id} (Realistic)", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code in (200, 404)})

    # Step 3: Check integration applications
    time.sleep(random.uniform(*think_time_range))
    t0 = time.perf_counter()
    r = client.get("/api/integrations/v2/applications", headers=headers)
    results.append({"name": "GET /api/integrations/v2/applications (Realistic)", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    # Step 4: Check roles and privileges
    time.sleep(random.uniform(*think_time_range))
    t0 = time.perf_counter()
    r = client.get("/api/admin/roles", headers=headers)
    results.append({"name": "GET /api/admin/roles (Realistic)", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    # Step 5: Check archival settings
    time.sleep(random.uniform(*think_time_range))
    t0 = time.perf_counter()
    r = client.get("/api/admin/archive/settings", headers=headers)
    results.append({"name": "GET /api/admin/archive/settings (Realistic)", "latency": (time.perf_counter() - t0) * 1000, "success": r.status_code == 200})

    return results


def summarize_results(name: str, results: List[Dict[str, Any]], duration: float) -> Dict[str, Any]:
    total = len(results)
    success = sum(1 for r in results if r["success"])
    fail = total - success
    latencies = sorted([r["latency"] for r in results])

    p50 = statistics.median(latencies) if latencies else 0
    p90 = latencies[int(len(latencies) * 0.90)] if latencies else 0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    p99 = latencies[int(len(latencies) * 0.99)] if latencies else 0
    max_l = max(latencies) if latencies else 0
    min_l = min(latencies) if latencies else 0
    avg_l = statistics.mean(latencies) if latencies else 0
    rps = total / duration if duration > 0 else 0

    print(f"\n================== {name} ==================")
    print(f"Total Requests: {total} | Passed: {success} ({success/total*100:.1f}%) | Failed: {fail}")
    print(f"Duration: {duration:.2f}s | RPS: {rps:.2f}")
    print(f"Latency: Min={min_l:.1f}ms | Avg={avg_l:.1f}ms | P50={p50:.1f}ms | P95={p95:.1f}ms | P99={p99:.1f}ms | Max={max_l:.1f}ms")

    # Endpoint breakdown
    endpoint_names = sorted(list(set(r["name"] for r in results)))
    breakdown = {}
    print("\nEndpoint Breakdown:")
    for ep in endpoint_names:
        ep_lats = sorted([r["latency"] for r in results if r["name"] == ep])
        ep_p50 = statistics.median(ep_lats) if ep_lats else 0
        ep_p95 = ep_lats[int(len(ep_lats) * 0.95)] if ep_lats else 0
        ep_avg = statistics.mean(ep_lats) if ep_lats else 0
        ep_pass = sum(1 for r in results if r["name"] == ep and r["success"])
        print(f"  {ep:<45} | Req: {len(ep_lats):<4} | Pass: {ep_pass:<4} | Avg: {ep_avg:7.1f}ms | P95: {ep_p95:7.1f}ms")
        breakdown[ep] = {
            "requests": len(ep_lats),
            "passed": ep_pass,
            "avg_ms": round(ep_avg, 2),
            "p50_ms": round(ep_p50, 2),
            "p95_ms": round(ep_p95, 2),
        }

    return {
        "test_name": name,
        "total_requests": total,
        "successful_requests": success,
        "failed_requests": fail,
        "duration_seconds": round(duration, 2),
        "rps": round(rps, 2),
        "min_latency_ms": round(min_l, 2),
        "avg_latency_ms": round(avg_l, 2),
        "p50_latency_ms": round(p50, 2),
        "p90_latency_ms": round(p90, 2),
        "p95_latency_ms": round(p95, 2),
        "p99_latency_ms": round(p99, 2),
        "max_latency_ms": round(max_l, 2),
        "breakdown": breakdown
    }


def main():
    print("=" * 75)
    print("  DOCUFLOW: 100-USER BURST & REALISTIC INTERACTIVE WORKLOAD SUITE")
    print("=" * 75)

    auth_token = get_token("admin", "admin")

    db = SessionLocal()
    docs = db.query(Document).limit(30).all()
    doc_ids = [d.id for d in docs] if docs else ["INV-1001", "INV-1002"]
    db.close()

    # Part 1: Zero-delay 100-user Burst Test
    print("\n[PHASE 1] Executing 100-User Instant Burst (Zero Think Time)...")
    t0 = time.perf_counter()
    burst_results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = [executor.submit(simulate_burst_user, i, auth_token, doc_ids) for i in range(100)]
        for f in concurrent.futures.as_completed(futures):
            burst_results.extend(f.result())
    burst_duration = time.perf_counter() - t0
    burst_summary = summarize_results("100-USER INSTANT BURST TEST", burst_results, burst_duration)

    # Part 2: Realistic 100-User Interactive Session with Think Times
    print("\n[PHASE 2] Executing 100-User Realistic Session (Natural Think Time)...")
    t0 = time.perf_counter()
    realistic_results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
        futures = [executor.submit(simulate_realistic_user, i, auth_token, doc_ids) for i in range(100)]
        for f in concurrent.futures.as_completed(futures):
            realistic_results.extend(f.result())
    realistic_duration = time.perf_counter() - t0
    realistic_summary = summarize_results("100-USER REALISTIC INTERACTIVE SESSION", realistic_results, realistic_duration)

    # Save to disk
    out_path = os.path.join(os.path.dirname(__file__), "burst_and_realistic_results.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"burst": burst_summary, "realistic": realistic_summary}, f, indent=2)

    print(f"\nAll benchmark records written to: {out_path}")


if __name__ == "__main__":
    main()
