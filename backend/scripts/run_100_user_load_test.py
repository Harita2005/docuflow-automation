import os
import sys
import time
import statistics
import concurrent.futures
from typing import List, Dict, Any

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.database.models import Document

def get_admin_token(client: TestClient) -> str:
    """Helper to fetch or generate a valid test auth token for admin."""
    from app.auth import create_access_token
    token = create_access_token(data={"sub": "admin", "role": "admin"})
    return token

def simulate_user_session(user_id: int, auth_token: str, doc_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Simulates a single active user performing realistic operational workflows:
    1. Browsing dashboard and invoice queue
    2. Opening document details and line items
    3. Querying system configurations and RBAC roles
    4. Querying audit trails
    """
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {auth_token}"}
    results = []

    # 1. Fetch Invoices Queue (Dashboard & Work Tracker load)
    t0 = time.perf_counter()
    res1 = client.get("/api/invoices", headers=headers)
    lat1 = (time.perf_counter() - t0) * 1000
    results.append({
        "user_id": user_id,
        "endpoint": "GET /api/invoices",
        "status_code": res1.status_code,
        "latency_ms": lat1,
        "success": res1.status_code == 200
    })

    # 2. View Individual Document Details (Work Tracker inspection)
    doc_id = doc_ids[user_id % len(doc_ids)] if doc_ids else "INV-001"
    t0 = time.perf_counter()
    res2 = client.get(f"/api/invoices/{doc_id}", headers=headers)
    lat2 = (time.perf_counter() - t0) * 1000
    results.append({
        "user_id": user_id,
        "endpoint": "GET /api/invoices/{id}",
        "status_code": res2.status_code,
        "latency_ms": lat2,
        "success": res2.status_code in (200, 404)  # 404 is valid if sample ID doesn't exist
    })

    # 3. Fetch User RBAC and Roles List
    t0 = time.perf_counter()
    res3 = client.get("/api/admin/roles", headers=headers)
    lat3 = (time.perf_counter() - t0) * 1000
    results.append({
        "user_id": user_id,
        "endpoint": "GET /api/admin/roles",
        "status_code": res3.status_code,
        "latency_ms": lat3,
        "success": res3.status_code == 200
    })

    # 4. Fetch Archival Settings & Storage Status
    t0 = time.perf_counter()
    res4 = client.get("/api/admin/archive/settings", headers=headers)
    lat4 = (time.perf_counter() - t0) * 1000
    results.append({
        "user_id": user_id,
        "endpoint": "GET /api/admin/archive/settings",
        "status_code": res4.status_code,
        "latency_ms": lat4,
        "success": res4.status_code == 200
    })

    # 5. Fetch Third-Party Integration Applications
    t0 = time.perf_counter()
    res5 = client.get("/api/integrations/v2/applications", headers=headers)
    lat5 = (time.perf_counter() - t0) * 1000
    results.append({
        "user_id": user_id,
        "endpoint": "GET /api/integrations/v2/applications",
        "status_code": res5.status_code,
        "latency_ms": lat5,
        "success": res5.status_code == 200
    })

    return results

def run_concurrent_load_test(num_users: int = 100):
    print("=" * 75)
    print("  DOCUFLOW AUTOMATION — 100 CONCURRENT USERS LOAD & STRESS TEST")
    print(f"  Target: {num_users} simultaneous active users executing live database queries")
    print("=" * 75)

    # Initialize client and test token
    init_client = TestClient(app)
    auth_token = get_admin_token(init_client)

    # Query existing document IDs from database
    db = SessionLocal()
    docs = db.query(Document).limit(20).all()
    doc_ids = [d.id for d in docs] if docs else ["INV-1001", "INV-1002", "INV-1003"]
    db.close()

    print(f"\n[INFO] Starting concurrent execution of {num_users} user sessions...")
    start_total = time.perf_counter()

    all_results: List[Dict[str, Any]] = []

    # Execute with 100 concurrent threads simultaneously
    with concurrent.futures.ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(simulate_user_session, user_id=i + 1, auth_token=auth_token, doc_ids=doc_ids)
            for i in range(num_users)
        ]

        for future in concurrent.futures.as_completed(futures):
            try:
                user_results = future.result()
                all_results.extend(user_results)
            except Exception as e:
                print(f"[ERROR] Worker thread failed: {e}")

    total_duration = time.perf_counter() - start_total
    total_requests = len(all_results)
    successful_requests = sum(1 for r in all_results if r["success"])
    failed_requests = total_requests - successful_requests

    latencies = [r["latency_ms"] for r in all_results]
    latencies.sort()

    avg_latency = statistics.mean(latencies) if latencies else 0
    median_latency = statistics.median(latencies) if latencies else 0
    p95_latency = latencies[int(len(latencies) * 0.95)] if latencies else 0
    p99_latency = latencies[int(len(latencies) * 0.99)] if latencies else 0
    min_latency = min(latencies) if latencies else 0
    max_latency = max(latencies) if latencies else 0

    throughput_rps = total_requests / total_duration if total_duration > 0 else 0

    print("\n" + "=" * 75)
    print("  LOAD TEST RESULTS & CONCURRENCY BENCHMARK SUMMARY")
    print("=" * 75)
    print(f"  Total Simulated Users:      {num_users} Concurrent Virtual Users (VUs)")
    print(f"  Total Requests Dispatched:   {total_requests} requests")
    print(f"  Successful Requests:         {successful_requests} ({successful_requests/total_requests*100:.1f}%)")
    print(f"  Failed / Timed Out:          {failed_requests} ({failed_requests/total_requests*100:.1f}%)")
    print(f"  Total Test Duration:         {total_duration:.2f} seconds")
    print(f"  Throughput (Throughput/sec): {throughput_rps:.2f} Requests/Second (RPS)")
    print("-" * 75)
    print("  RESPONSE TIME (LATENCY) DISTRIBUTION:")
    print(f"    • Minimum Latency:         {min_latency:.2f} ms")
    print(f"    • Median (P50) Latency:    {median_latency:.2f} ms")
    print(f"    • Average (Mean) Latency:  {avg_latency:.2f} ms")
    print(f"    • 95th Percentile (P95):   {p95_latency:.2f} ms")
    print(f"    • 99th Percentile (P99):   {p99_latency:.2f} ms")
    print(f"    • Maximum Latency:         {max_latency:.2f} ms")
    print("-" * 75)
    print("  BREAKDOWN BY ENDPOINT:")
    endpoints = sorted(list(set(r["endpoint"] for r in all_results)))
    for ep in endpoints:
        ep_lats = [r["latency_ms"] for r in all_results if r["endpoint"] == ep]
        ep_succ = sum(1 for r in all_results if r["endpoint"] == ep and r["success"])
        ep_avg = statistics.mean(ep_lats) if ep_lats else 0
        ep_p95 = ep_lats[int(len(ep_lats) * 0.95)] if ep_lats else 0
        print(f"    {ep:<38} | Req: {len(ep_lats):<4} | Pass: {ep_succ:<4} | Avg: {ep_avg:>6.1f}ms | P95: {ep_p95:>6.1f}ms")

    print("=" * 75)
    return {
        "num_users": num_users,
        "total_requests": total_requests,
        "successful_requests": successful_requests,
        "failed_requests": failed_requests,
        "total_duration_sec": total_duration,
        "throughput_rps": throughput_rps,
        "avg_latency_ms": avg_latency,
        "median_latency_ms": median_latency,
        "p95_latency_ms": p95_latency,
        "p99_latency_ms": p99_latency,
        "min_latency_ms": min_latency,
        "max_latency_ms": max_latency
    }

if __name__ == "__main__":
    run_concurrent_load_test(100)
