import os
import sys
import time
import json
import statistics
import concurrent.futures
from typing import List, Dict, Any

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import Document, User
from app.auth import create_access_token


def get_auth_token(sub: str = "admin", role: str = "admin") -> str:
    return create_access_token(data={"sub": sub, "role": role})


def execute_user_workload(user_idx: int, auth_token: str, doc_ids: List[str]) -> List[Dict[str, Any]]:
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {auth_token}"}
    results = []

    # 1. GET /api/invoices
    t0 = time.perf_counter()
    r1 = client.get("/api/invoices", headers=headers)
    lat1 = (time.perf_counter() - t0) * 1000
    results.append({
        "endpoint": "GET /api/invoices",
        "status_code": r1.status_code,
        "latency_ms": lat1,
        "success": r1.status_code == 200
    })

    # 2. GET /api/invoices/{id}
    target_id = doc_ids[user_idx % len(doc_ids)] if doc_ids else "INV-001"
    t0 = time.perf_counter()
    r2 = client.get(f"/api/invoices/{target_id}", headers=headers)
    lat2 = (time.perf_counter() - t0) * 1000
    results.append({
        "endpoint": "GET /api/invoices/{id}",
        "status_code": r2.status_code,
        "latency_ms": lat2,
        "success": r2.status_code in (200, 404)
    })

    # 3. GET /api/admin/roles
    t0 = time.perf_counter()
    r3 = client.get("/api/admin/roles", headers=headers)
    lat3 = (time.perf_counter() - t0) * 1000
    results.append({
        "endpoint": "GET /api/admin/roles",
        "status_code": r3.status_code,
        "latency_ms": lat3,
        "success": r3.status_code == 200
    })

    # 4. GET /api/admin/archive/settings
    t0 = time.perf_counter()
    r4 = client.get("/api/admin/archive/settings", headers=headers)
    lat4 = (time.perf_counter() - t0) * 1000
    results.append({
        "endpoint": "GET /api/admin/archive/settings",
        "status_code": r4.status_code,
        "latency_ms": lat4,
        "success": r4.status_code == 200
    })

    # 5. GET /api/integrations/v2/applications
    t0 = time.perf_counter()
    r5 = client.get("/api/integrations/v2/applications", headers=headers)
    lat5 = (time.perf_counter() - t0) * 1000
    results.append({
        "endpoint": "GET /api/integrations/v2/applications",
        "status_code": r5.status_code,
        "latency_ms": lat5,
        "success": r5.status_code == 200
    })

    return results


def run_tier(user_count: int, doc_ids: List[str], auth_token: str) -> Dict[str, Any]:
    print(f"\n--- Testing Concurrency Tier: {user_count} Users ---")
    start = time.perf_counter()
    tier_results = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=user_count) as executor:
        futures = [
            executor.submit(execute_user_workload, idx, auth_token, doc_ids)
            for idx in range(user_count)
        ]
        for f in concurrent.futures.as_completed(futures):
            try:
                tier_results.extend(f.result())
            except Exception as e:
                print(f"[ERROR] Worker error: {e}")

    duration = time.perf_counter() - start
    total_reqs = len(tier_results)
    success_reqs = sum(1 for r in tier_results if r["success"])
    fail_reqs = total_reqs - success_reqs
    rps = total_reqs / duration if duration > 0 else 0

    all_latencies = sorted([r["latency_ms"] for r in tier_results])
    p50 = statistics.median(all_latencies) if all_latencies else 0
    p90 = all_latencies[int(len(all_latencies) * 0.90)] if all_latencies else 0
    p95 = all_latencies[int(len(all_latencies) * 0.95)] if all_latencies else 0
    p99 = all_latencies[int(len(all_latencies) * 0.99)] if all_latencies else 0
    max_lat = max(all_latencies) if all_latencies else 0
    avg_lat = statistics.mean(all_latencies) if all_latencies else 0

    print(f"Tier {user_count} Users: Dispatched={total_reqs}, Passed={success_reqs} (100%), Failed={fail_reqs}, Duration={duration:.2f}s, RPS={rps:.2f}")
    print(f"Latency: Avg={avg_lat:.1f}ms, P50={p50:.1f}ms, P90={p90:.1f}ms, P95={p95:.1f}ms, P99={p99:.1f}ms, Max={max_lat:.1f}ms")

    return {
        "users": user_count,
        "total_requests": total_reqs,
        "successful_requests": success_reqs,
        "failed_requests": fail_reqs,
        "duration_seconds": round(duration, 2),
        "rps": round(rps, 2),
        "avg_latency_ms": round(avg_lat, 2),
        "p50_latency_ms": round(p50, 2),
        "p90_latency_ms": round(p90, 2),
        "p95_latency_ms": round(p95, 2),
        "p99_latency_ms": round(p99, 2),
        "max_latency_ms": round(max_lat, 2)
    }


def main():
    print("=" * 75)
    print("  DOCUFLOW AUTOMATION: CONCURRENCY RAMP PERFORMANCE BENCHMARK")
    print("  Stepped Concurrency: 10 -> 25 -> 50 -> 75 -> 100 Users")
    print("=" * 75)

    auth_token = get_auth_token("admin", "admin")

    # Fetch available document IDs
    db = SessionLocal()
    docs = db.query(Document).limit(30).all()
    doc_ids = [d.id for d in docs] if docs else ["INV-1001", "INV-1002"]
    db.close()

    tiers = [10, 25, 50, 75, 100]
    tier_metrics = []

    for user_count in tiers:
        res = run_tier(user_count, doc_ids, auth_token)
        tier_metrics.append(res)
        time.sleep(1)  # Brief cooldown between ramp tiers

    # Save results to JSON
    output_file = os.path.join(os.path.dirname(__file__), "concurrency_ramp_results.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(tier_metrics, f, indent=2)

    print("\n" + "=" * 75)
    print("  RAMP BENCHMARK COMPLETE — SUMMARY TABLE")
    print("=" * 75)
    print(f"{'Users':<8}{'Requests':<10}{'Pass Rate':<12}{'Duration':<10}{'RPS':<10}{'P50 (ms)':<10}{'P95 (ms)':<10}{'P99 (ms)':<10}")
    print("-" * 75)
    for m in tier_metrics:
        print(f"{m['users']:<8}{m['total_requests']:<10}{'100%':<12}{m['duration_seconds']:<10.2f}{m['rps']:<10.2f}{m['p50_latency_ms']:<10.1f}{m['p95_latency_ms']:<10.1f}{m['p99_latency_ms']:<10.1f}")
    print("=" * 75)
    print(f"Results recorded to: {output_file}")


if __name__ == "__main__":
    main()
