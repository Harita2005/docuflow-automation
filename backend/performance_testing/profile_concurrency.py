import os
import sys
import time
import concurrent.futures
import statistics

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token

token = create_access_token(data={"sub": "admin", "role": "admin"})
headers = {"Authorization": f"Bearer {token}"}

def run_test(concurrency, endpoint="/api/invoices"):
    client = TestClient(app)
    def fetch():
        t0 = time.perf_counter()
        r = client.get(endpoint, headers=headers)
        return (time.perf_counter() - t0) * 1000, r.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as ex:
        t_start = time.perf_counter()
        futures = [ex.submit(fetch) for _ in range(concurrency)]
        results = [f.result() for f in futures]
        t_total = time.perf_counter() - t_start

    lats = [r[0] for r in results]
    print(f"{endpoint} Concurrency {concurrency}: Total={t_total:.2f}s | Avg={statistics.mean(lats):.1f}ms | P50={statistics.median(lats):.1f}ms | P95={sorted(lats)[int(len(lats)*0.95)]:.1f}ms | Max={max(lats):.1f}ms")

print("--- Testing /api/invoices ---")
for c in [1, 10, 25, 50, 75, 100]:
    run_test(c, "/api/invoices")

print("\n--- Testing /api/invoices/DOC-1 or first doc ---")
for c in [1, 10, 25, 50, 75, 100]:
    run_test(c, "/api/invoices/1")
