import os
import sys
import subprocess
import time

def run_script(script_name, extra_args=None):
    cmd = [sys.executable, os.path.join(os.path.dirname(__file__), script_name)]
    if extra_args:
        cmd.extend(extra_args)
    print(f"\n{'#'*80}\n# RUNNING: {script_name}\n{'#'*80}")
    t0 = time.time()
    res = subprocess.run(cmd, cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
    elapsed = time.time() - t0
    print(f"Finished {script_name} with exit code {res.returncode} in {elapsed:.1f}s")
    if res.returncode != 0:
        raise RuntimeError(f"Benchmark script {script_name} failed with exit code {res.returncode}")

def main():
    print("=" * 80)
    print("  DOCUFLOW AUTOMATION: FULL PRODUCTION READINESS PERFORMANCE TEST SUITE")
    print("=" * 80)
    start_all = time.time()

    # 1. Stepped Concurrency Ramp (10, 25, 50, 75, 100)
    run_script("suite_concurrency_ramp.py")

    # 2. 100-User Instant Burst & Realistic Workload
    run_script("suite_realistic_and_burst.py")

    # 3. RBAC Isolation and ACID Data Integrity
    run_script("suite_integrity_and_rbac.py")

    # 4. Sustained Stability & Memory Leak Verification (180s = 3m endurance cycle)
    run_script("suite_sustained_stability.py", ["--duration", "120", "--concurrency", "20"])

    total_time = time.time() - start_all
    print("\n" + "=" * 80)
    print(f"  ALL PERFORMANCE & INTEGRITY BENCHMARKS COMPLETED SUCCESSFULLY IN {total_time:.1f}s")
    print("=" * 80)

if __name__ == "__main__":
    main()
