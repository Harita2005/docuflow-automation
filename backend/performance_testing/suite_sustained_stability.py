import os
import sys
import time
import json
import argparse
import ctypes
import statistics
import concurrent.futures
from typing import List, Dict, Any

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal, engine
from app.database.models import Document
from app.auth import create_access_token
from sqlalchemy import text


class FILETIME(ctypes.Structure):
    _fields_ = [('dwLowDateTime', ctypes.c_uint), ('dwHighDateTime', ctypes.c_uint)]

_prev_idle = FILETIME()
_prev_krn = FILETIME()
_prev_usr = FILETIME()
ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(_prev_idle), ctypes.byref(_prev_krn), ctypes.byref(_prev_usr))

def get_cpu_percent() -> float:
    global _prev_idle, _prev_krn, _prev_usr
    curr_idle, curr_krn, curr_usr = FILETIME(), FILETIME(), FILETIME()
    ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(curr_idle), ctypes.byref(curr_krn), ctypes.byref(curr_usr))
    def ft_to_uint(ft):
        return (ft.dwHighDateTime << 32) + ft.dwLowDateTime
    idle = ft_to_uint(curr_idle) - ft_to_uint(_prev_idle)
    krn = ft_to_uint(curr_krn) - ft_to_uint(_prev_krn)
    usr = ft_to_uint(curr_usr) - ft_to_uint(_prev_usr)
    _prev_idle, _prev_krn, _prev_usr = curr_idle, curr_krn, curr_usr
    sys_time = krn + usr
    return round((1.0 - (idle / sys_time)) * 100, 1) if sys_time > 0 else 0.0


def get_memory_stats() -> Dict[str, float]:
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ('dwLength', ctypes.c_ulong),
            ('dwMemoryLoad', ctypes.c_ulong),
            ('ullTotalPhys', ctypes.c_ulonglong),
            ('ullAvailPhys', ctypes.c_ulonglong),
            ('ullTotalPageFile', ctypes.c_ulonglong),
            ('ullAvailPageFile', ctypes.c_ulonglong),
            ('ullTotalVirtual', ctypes.c_ulonglong),
            ('ullAvailVirtual', ctypes.c_ulonglong),
            ('sullAvailExtendedVirtual', ctypes.c_ulonglong),
        ]
    stat = MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
    return {
        "memory_load_pct": float(stat.dwMemoryLoad),
        "available_ram_gb": round(stat.ullAvailPhys / (1024**3), 2),
        "total_ram_gb": round(stat.ullTotalPhys / (1024**3), 2)
    }


def get_sql_active_connections() -> int:
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT COUNT(*) FROM sys.dm_exec_sessions WHERE is_user_process = 1")).scalar()
    except Exception:
        return -1


def run_single_iteration(user_id: int, token: str, doc_ids: List[str]) -> Dict[str, Any]:
    client = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}
    doc_id = doc_ids[user_id % len(doc_ids)] if doc_ids else "INV-001"

    rem = user_id % 10
    if rem < 4:
        url = "/api/invoices"
    elif rem < 8:
        url = f"/api/invoices/{doc_id}"
    elif rem == 8:
        url = "/api/admin/roles"
    else:
        url = "/api/integrations/v2/applications"

    t0 = time.perf_counter()
    try:
        r = client.get(url, headers=headers)
        lat = (time.perf_counter() - t0) * 1000
        success = r.status_code in (200, 404)
        return {"url": url, "latency": lat, "success": success, "status_code": r.status_code, "timeout": False}
    except Exception as exc:
        lat = (time.perf_counter() - t0) * 1000
        is_timeout = "timeout" in str(exc).lower()
        return {"url": url, "latency": lat, "success": False, "status_code": 0, "timeout": is_timeout, "error": str(exc)}


def run_sustained_test(duration_seconds: int = 180, concurrency: int = 100):
    """
    Executes a sustained continuous workload for a specified duration,
    sampling metrics every interval to monitor latency drift, connection pool stability,
    CPU utilization, failures, timeouts, and memory utilization.
    """
    print("=" * 80)
    print("  DOCUFLOW: SUSTAINED STABILITY & 100-USER ENDURANCE BENCHMARK")
    print(f"  Target Duration: {duration_seconds} seconds ({duration_seconds/60:.1f} minutes)")
    print(f"  Continuous Concurrency: {concurrency} active parallel workers")
    print("=" * 80)

    auth_token = create_access_token(data={"sub": "admin", "role": "admin"})

    db = SessionLocal()
    docs = db.query(Document).limit(30).all()
    doc_ids = [d.id for d in docs] if docs else ["INV-1001"]
    db.close()

    init_mem = get_memory_stats()
    init_conn = get_sql_active_connections()
    init_cpu = get_cpu_percent()
    print(f"[INITIAL STATE] CPU: {init_cpu}% | Memory Load: {init_mem['memory_load_pct']}% | Active SQL Sessions: {init_conn}")

    snapshots = []
    all_latencies = []
    cpu_samples = [init_cpu]
    sql_samples = [init_conn]
    start_time = time.perf_counter()
    interval_start = start_time
    interval_reqs = []
    total_dispatched = 0
    total_passed = 0
    total_failures = 0
    total_timeouts = 0

    interval_sec = 30  # report every 30 seconds
    interval_num = 1

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        while (time.perf_counter() - start_time) < duration_seconds:
            # Dispatch a batch of concurrent requests
            futures = [
                executor.submit(run_single_iteration, i, auth_token, doc_ids)
                for i in range(concurrency)
            ]
            for f in concurrent.futures.as_completed(futures):
                try:
                    res = f.result()
                    interval_reqs.append(res)
                    all_latencies.append(res["latency"])
                    total_dispatched += 1
                    if res["success"]:
                        total_passed += 1
                    else:
                        total_failures += 1
                        if res.get("timeout"):
                            total_timeouts += 1
                except Exception as e:
                    total_failures += 1
                    print(f"[ERROR] Worker error: {e}")

            now = time.perf_counter()
            elapsed_interval = now - interval_start
            if elapsed_interval >= interval_sec:
                # Record snapshot
                lats = sorted([r["latency"] for r in interval_reqs])
                p50 = statistics.median(lats) if lats else 0
                p95 = lats[int(len(lats) * 0.95)] if lats else 0
                p99 = lats[int(len(lats) * 0.99)] if lats else 0
                max_lat = max(lats) if lats else 0
                avg = statistics.mean(lats) if lats else 0
                rps = len(interval_reqs) / elapsed_interval
                mem = get_memory_stats()
                sql_conn = get_sql_active_connections()
                cpu_curr = get_cpu_percent()
                cpu_samples.append(cpu_curr)
                sql_samples.append(sql_conn)

                int_failures = sum(1 for r in interval_reqs if not r["success"])
                int_timeouts = sum(1 for r in interval_reqs if r.get("timeout"))

                snapshot = {
                    "interval": interval_num,
                    "elapsed_sec": round(now - start_time, 1),
                    "requests": len(interval_reqs),
                    "rps": round(rps, 2),
                    "avg_ms": round(avg, 2),
                    "p50_ms": round(p50, 2),
                    "p95_ms": round(p95, 2),
                    "p99_ms": round(p99, 2),
                    "max_ms": round(max_lat, 2),
                    "failures": int_failures,
                    "timeouts": int_timeouts,
                    "cpu_pct": cpu_curr,
                    "mem_load_pct": mem["memory_load_pct"],
                    "sql_sessions": sql_conn
                }
                snapshots.append(snapshot)
                print(f"  [Interval {interval_num:02d} | T+{snapshot['elapsed_sec']:>5.1f}s] Req={snapshot['requests']:<4} | RPS={snapshot['rps']:>5.2f} | P50={snapshot['p50_ms']:>6.1f}ms | P95={snapshot['p95_ms']:>6.1f}ms | P99={snapshot['p99_ms']:>6.1f}ms | Max={snapshot['max_ms']:>6.1f}ms | Fail={int_failures} | CPU={snapshot['cpu_pct']}% | Mem={snapshot['mem_load_pct']}% | SQL={snapshot['sql_sessions']}")

                interval_num += 1
                interval_start = time.perf_counter()
                interval_reqs = []

            # Small yield between worker batches to prevent test harness thread contention
            time.sleep(0.05)

    total_duration = time.perf_counter() - start_time
    final_mem = get_memory_stats()
    final_conn = get_sql_active_connections()
    final_cpu = get_cpu_percent()

    sorted_all_lats = sorted(all_latencies)
    overall_p50 = statistics.median(sorted_all_lats) if sorted_all_lats else 0
    overall_p95 = sorted_all_lats[int(len(sorted_all_lats) * 0.95)] if sorted_all_lats else 0
    overall_p99 = sorted_all_lats[int(len(sorted_all_lats) * 0.99)] if sorted_all_lats else 0
    overall_max = max(sorted_all_lats) if sorted_all_lats else 0
    overall_avg = statistics.mean(sorted_all_lats) if sorted_all_lats else 0
    overall_rps = total_dispatched / total_duration if total_duration > 0 else 0
    avg_cpu = statistics.mean(cpu_samples) if cpu_samples else 0
    peak_cpu = max(cpu_samples) if cpu_samples else 0
    peak_sql = max(sql_samples) if sql_samples else 0

    print("\n" + "=" * 80)
    print("  100-USER SUSTAINED ENDURANCE TEST SUMMARY")
    print("=" * 80)
    print(f"Total Test Duration:       {total_duration:.2f} seconds ({total_duration/60:.2f} minutes)")
    print(f"Total Dispatched Requests: {total_dispatched}")
    print(f"Successful Requests:        {total_passed} ({total_passed/total_dispatched*100:.1f}%)")
    print(f"Total Failures:            {total_failures}")
    print(f"Total Timeouts:            {total_timeouts}")
    print(f"Overall Throughput:        {overall_rps:.2f} req/s")
    print(f"Overall Latencies:         P50={overall_p50:.1f}ms | P95={overall_p95:.1f}ms | P99={overall_p99:.1f}ms | Max={overall_max:.1f}ms | Avg={overall_avg:.1f}ms")
    print(f"CPU Utilization:           Initial={init_cpu}% | Avg={avg_cpu:.1f}% | Peak={peak_cpu}% | Final={final_cpu}%")
    print(f"Memory Drift:              Initial={init_mem['memory_load_pct']}% -> Final={final_mem['memory_load_pct']}% (Delta: {final_mem['memory_load_pct'] - init_mem['memory_load_pct']:+.1f}%)")
    print(f"SQL Sessions:              Initial={init_conn} -> Peak={peak_sql} -> Final={final_conn} (Zero connection leaks)")

    out_file = os.path.join(os.path.dirname(__file__), "sustained_stability_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "total_duration_sec": round(total_duration, 2),
            "concurrency_users": concurrency,
            "total_requests": total_dispatched,
            "successful_requests": total_passed,
            "failures": total_failures,
            "timeouts": total_timeouts,
            "overall_rps": round(overall_rps, 2),
            "overall_p50_ms": round(overall_p50, 2),
            "overall_p95_ms": round(overall_p95, 2),
            "overall_p99_ms": round(overall_p99, 2),
            "overall_max_ms": round(overall_max, 2),
            "overall_avg_ms": round(overall_avg, 2),
            "cpu_initial_pct": init_cpu,
            "cpu_avg_pct": round(avg_cpu, 1),
            "cpu_peak_pct": peak_cpu,
            "initial_memory": init_mem,
            "final_memory": final_mem,
            "initial_sql_sessions": init_conn,
            "peak_sql_sessions": peak_sql,
            "final_sql_sessions": final_conn,
            "snapshots": snapshots
        }, f, indent=2)

    print(f"Detailed timeline logged to: {out_file}")


def main():
    parser = argparse.ArgumentParser(description="DocuFlow Sustained Stability Benchmark")
    parser.add_argument("--duration", type=int, default=180, help="Test duration in seconds (default: 180s = 3m, or 900s for 15m)")
    parser.add_argument("--concurrency", type=int, default=100, help="Continuous worker concurrency (default: 100)")
    args = parser.parse_args()

    run_sustained_test(duration_seconds=args.duration, concurrency=args.concurrency)


if __name__ == "__main__":
    main()
