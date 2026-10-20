# 1,000 Concurrent Synchronization Load Test Summary

- **Timestamp**: 2026-10-20T05:05:32.030Z
- **Target Concurrency**: Up to 1,000 Virtual Users
- **Staged Tiers**: 10 &rarr; 50 &rarr; 100 &rarr; 250 &rarr; 500 &rarr; 1,000 VUs
- **Total Ingestion Requests Attempted**: 5
- **Successfully Ingested Records (HTTP 200)**: 3
- **Failed Ingestion Requests**: 0
- **HTTP Failure Rate**: 0.00%
- **Throughput**: 0.09 req/sec
- **Average Latency**: 7741.13 ms
- **P90 Latency**: 22022.32 ms
- **P95 Latency**: 29059.56 ms
- **P99 Latency**: 34689.36 ms

## Verification Note
This summary measures HTTP API ingestion performance. Physical database persistence and duplicate verification are separately audited via `tests/database/verify-sync-results.py`.
