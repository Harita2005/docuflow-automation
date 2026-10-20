# Database Integrity & Concurrency Audit Report

- **Timestamp**: 2026-10-20T05:14:40.929829Z
- **Verification Status**: **PASS**
- **Test Prefix Filter**: `PERF_SYNC_%`
- **Total Test Records Persisted**: 297
  - Single Ingestion (`PERF_SYNC_%`): 263
  - Batch Ingestion (`BATCH_%`): 34

## Concurrency & Integrity Audit Findings

| Audit Check | Expected | Measured | Status |
|---|---|---|---|
| Duplicate `doc_key` Identifiers | 0 | 0 | PASS |
| Duplicate `document_number` Identifiers | 0 | 0 | PASS |
| Valid Amounts (> 0) | 100% | 100% | PASS |
| Vendor Name Completeness | 100% | 100% | PASS |
| Workflow State & Approver Assignment | 297 | 297 | PASS |
| Linked Line Item Records | > 0 | 526 | PASS |
| Linked Audit Log Entries | > 0 | 831 | PASS |
| Single-Record Idempotency | True | True | PASS |

### Zero Integrity Violations Detected
All records satisfy unique constraints, foreign keys, and workflow lifecycle rules.

- **Test Cleanup Executed**: False
