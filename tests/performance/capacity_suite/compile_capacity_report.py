import json
import csv
from pathlib import Path
from datetime import datetime

REPORT_DIR = Path("tests/reports/capacity")

def parse_k6_summary(file_path: Path):
    if not file_path.exists():
        return None
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        metrics = data.get("metrics", {})
        
        http_reqs = metrics.get("http_reqs", {})
        req_duration = metrics.get("http_req_duration", {})
        req_failed = metrics.get("http_req_failed", {})
        vus_obj = metrics.get("vus", {})
        vus_max_obj = metrics.get("vus_max", {})
        
        vus = vus_obj.get("max", vus_max_obj.get("value", 0)) or vus_max_obj.get("value", 0)
        
        fail_rate = req_failed.get("value", 0.0)
        if fail_rate == 0.0 and req_failed.get("rate") is not None:
            fail_rate = req_failed.get("rate")
            
        return {
            "vus": vus,
            "total_requests": http_reqs.get("count", 0),
            "throughput_rps": round(http_reqs.get("rate", 0), 2),
            "duration_avg": round(req_duration.get("avg", 0), 2),
            "duration_med": round(req_duration.get("med", 0), 2),
            "duration_p90": round(req_duration.get("p(90)", 0), 2),
            "duration_p95": round(req_duration.get("p(95)", 0), 2),
            "duration_p99": round(req_duration.get("p(99)", 0), 2),
            "duration_max": round(req_duration.get("max", 0), 2),
            "failure_rate_pct": round(fail_rate * 100, 3),
            "failed_requests": int(req_failed.get("passes", 0)),
        }
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None

def parse_system_resources(csv_path: Path):
    if not csv_path.exists():
        return {}
    
    cpu_vals = []
    ram_pct_vals = []
    back_ws_vals = []
    sql_ws_vals = []
    sql_conn_vals = []
    
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                if row.get("System_CPU_Pct") and row["System_CPU_Pct"] != "N/A":
                    cpu_vals.append(float(row["System_CPU_Pct"]))
                if row.get("System_RAM_Used_Pct") and row["System_RAM_Used_Pct"] != "N/A":
                    ram_pct_vals.append(float(row["System_RAM_Used_Pct"]))
                if row.get("Backend_RAM_WorkingSet_MB") and row["Backend_RAM_WorkingSet_MB"] != "N/A":
                    back_ws_vals.append(float(row["Backend_RAM_WorkingSet_MB"]))
                if row.get("SQL_RAM_WorkingSet_MB") and row["SQL_RAM_WorkingSet_MB"] != "N/A":
                    sql_ws_vals.append(float(row["SQL_RAM_WorkingSet_MB"]))
                if row.get("SQL_Active_Connections") and row["SQL_Active_Connections"] != "N/A":
                    sql_conn_vals.append(float(row["SQL_Active_Connections"]))
            except Exception:
                continue

    return {
        "samples_count": len(cpu_vals),
        "cpu_avg_pct": round(sum(cpu_vals) / len(cpu_vals), 1) if cpu_vals else 0,
        "cpu_peak_pct": round(max(cpu_vals), 1) if cpu_vals else 0,
        "ram_used_avg_pct": round(sum(ram_pct_vals) / len(ram_pct_vals), 1) if ram_pct_vals else 0,
        "ram_used_peak_pct": round(max(ram_pct_vals), 1) if ram_pct_vals else 0,
        "backend_ram_ws_avg_mb": round(sum(back_ws_vals) / len(back_ws_vals), 1) if back_ws_vals else 0,
        "backend_ram_ws_peak_mb": round(max(back_ws_vals), 1) if back_ws_vals else 0,
        "sql_ram_ws_avg_mb": round(sum(sql_ws_vals) / len(sql_ws_vals), 1) if sql_ws_vals else 0,
        "sql_ram_ws_peak_mb": round(max(sql_ws_vals), 1) if sql_ws_vals else 0,
        "sql_connections_peak": int(max(sql_conn_vals)) if sql_conn_vals else 0,
    }

def main():
    scenarios = [
        ("01_frontend_baseline", "Scenario A: Frontend Baseline (Static Web Server)", 100),
        ("02_authenticated_backend", "Scenario B: Authenticated Backend Read Workload", 150),
        ("03_mixed_workload", "Scenario C: Realistic Mixed Business Workload", 150),
        ("04_gradual_concurrency_stress", "Scenario D: Gradual Concurrency Stress Ramp (10-300 VUs)", 300),
        ("05_endurance_test", "Scenario E: Sustained Endurance Test (50 VUs, 3 min)", 50),
        ("06_ai_ocr_controlled", "Scenario F: Controlled AI/OCR Document Ingestion", 2),
    ]

    results = {}
    for key, label, target_vus in scenarios:
        json_file = REPORT_DIR / f"{key}.json"
        summary = parse_k6_summary(json_file)
        if summary:
            summary["label"] = label
            summary["target_vus"] = target_vus
            # Pass / fail evaluation against criteria:
            # - error rate < 1%
            # - P95 < 500ms (or < 30s for AI OCR)
            max_p95 = 30000 if "ocr" in key else 500
            summary["passed"] = (summary["failure_rate_pct"] < 1.0) and (summary["duration_p95"] <= max_p95)
            results[key] = summary

    resources = parse_system_resources(REPORT_DIR / "system_resources_capacity.csv")

    summary_export = {
        "timestamp": datetime.now().isoformat(),
        "scenarios": results,
        "resources": resources,
    }

    with open(REPORT_DIR / "capacity_benchmark_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_export, f, indent=2)

    print("Successfully compiled capacity summary to tests/reports/capacity/capacity_benchmark_summary.json")

if __name__ == "__main__":
    main()
