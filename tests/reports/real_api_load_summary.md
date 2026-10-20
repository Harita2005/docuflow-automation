# Real Document API Load Test Summary

- **Timestamp**: 2026-10-20T04:58:09.874Z
- **Total Requests**: 922
- **Throughput**: 13.17 req/sec
- **Overall HTTP Failure Rate**: 0.00%

## Endpoint Performance Breakdown (Real Document APIs vs Health Baseline)

| Endpoint | Tested Operation | Avg Latency (ms) | P90 Latency (ms) | P95 Latency (ms) |
|---|---|---|---|---|
| `GET /health` | Lightweight Health Baseline | 815.35 | 2284.00 | 2384.00 |
| `GET /api/invoices` | Real Paginated Invoice Queue | 2738.99 | 8431.80 | 8831.70 |
| `GET /api/invoices/{id}` | Real Document Details & Logs | 525.62 | 1594.80 | 2156.10 |
| `GET /api/document-types/.../config` | More-Info Dynamic Config | 822.41 | 2951.60 | 3411.00 |

## Concurrency Tiers Tested
- **Tier 1**: 10 Virtual Users
- **Tier 2**: 25 Virtual Users
- **Tier 3**: 50 Virtual Users
- **Tier 4**: 100 Virtual Users
