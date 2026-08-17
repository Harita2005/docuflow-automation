# DocuFlowDB Schema Migration Guide

This directory contains the production-ready baseline database schema, seed data, and validation test scripts for **DocuFlowDB**—a generic document approval workflow engine.

---

## 📂 Deliverables Overview

1. [`migration_script.sql`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/docuflowdb_schema/migration_script.sql): Baseline DDL structure, triggers, constraints, and indexes.
2. [`seed_data.sql`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/docuflowdb_schema/seed_data.sql): Re-runnable default configuration seed data (roles, systems, default workflow stages).
3. [`validation_tests.sql`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/docuflowdb_schema/validation_tests.sql): Automated test scripts running in transactional environments to verify constraints and trigger protection.
4. [`relationship_schema.md`](file:///c:/Users/TempAdmin/OneDrive/Documents/docuflow-automation/docuflowdb_schema/relationship_schema.md): Entity relationship mapping, design parameters, and schema descriptions.

---

## ⚙️ Key Architectural Concepts

### 1. Ingestion Flow (Loose vs. Tight Coupling)
DocuFlow uses a decoupled multi-tiered model to import document records from upstream systems without polluting runtime workflow states:
- **Source Ingestion**: Payloads are POSTed to integration API endpoints. Raw strings are saved in `integration.source_records` and `integration.source_record_versions` (retaining full history of edits/corrections).
- **Validation & Deduplication**: Unique constraints verify duplicate sync keys. High-performance JSON check constraints inspect payload syntax validity.
- **Canonical Model Mapping**: Staged payloads are validated, normalized, and mapped to `core.documents`. General searchable metadata variables are mapped to `core.document_metadata` (e.g. key-value pairs).

### 2. Workflow Versioning Model
- Workflow templates are versioned inside `workflow.workflow_versions` and marked `published = 1`.
- When a document starts processing, the new `workflow.workflow_instances` record pins the specific `workflow_version_id` it started on.
- If an administrator updates or deploys a new workflow template version, all currently running documents continue execution under their original template rules without interruption.

### 3. Concurrency Protection
Active operational and configuration tables incorporate a database-managed `ROWVERSION` column. When updating mutable records (e.g., changing document states or claiming tasks), the application checks the version hash. If a mismatch is detected, the transaction aborts (optimistic locking), avoiding concurrent overwrite issues.

### 4. Audit Trail Immutability
Under normal operations, records written to `audit.audit_events` cannot be modified or deleted. An `INSTEAD OF UPDATE, DELETE` trigger detects DML attempts on the audit log table and throws a fatal database exception using SQL Server's `THROW` handler.

---

## 🚀 Migration Execution Order
When executing the scripts, they run in the following order to satisfy foreign key constraints:
1. **Security Layer**: Mappings of roles, users, and user roles.
2. **Integration Layer**: Source systems, API clients, sync runs, and source records.
3. **Core Documents**: Canonical documents, versions, metadata, and files.
4. **Deferred Foreign Keys**: Core linkages between integration payloads and canonical documents.
5. **Business Rules**: Dispatcher rules mapping documents to workflow models.
6. **Workflow Templates**: Workflow definitions, versions, stages, and transition constraints.
7. **Workflow Runtime**: Active instances, task assignments, checklist checks, and decisions.
8. **Audit Trail**: Audit tables and the SQL `THROW` immutability trigger.
9. **Index Optimization**: Target index definitions for active queues and lookups.
