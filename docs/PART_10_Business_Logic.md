# PART 10: Business Logic

## 10.1 State Machine & Allowed Status Transitions

The document lifecycle is governed by an explicit state machine implemented in [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py):

| Initial Status | Permitted Action | Next Status | Enforcement Logic & Conditions |
| :--- | :--- | :--- | :--- |
| `Pending` / `In Progress (Stage N)` | `APPROVE` (Intermediate) | `In Progress (Stage N+1)` | Validates `expected_version`; assigns next step approver pool; increments `inv.version`. |
| `In Progress (Final Stage)` | `APPROVE` (Final Step) | `Approved` | No next step exists. Executes `complete_document_lifecycle()` ([`documents.py#L1278`](file:///backend/app/routers/documents.py)). |
| `Pending` / `In Progress` | `REJECT` | `Rejected` | Terminates workflow; records reason; notifies submitter. |
| `Pending` / `In Progress` | `HOLD` | `On Hold` | Temporarily freezes SLAs; requires `hold_reason`. |
| `On Hold` | `UNHOLD` | `In Progress` | Resumes active approval timer and SLA. |
| `Pending` / `In Progress` | `SENDBACK` | `Returned` | Routes document backward to initiator or previous stage. |
| `Pending` / `In Progress` | `REQUEST_MORE_INFO` | `More Info Requested` | Pauses approval until initiator answers required questions. |
| `More Info Requested` | `SUBMIT_ANSWERS` | `Pending` / `In Progress` | Answers validated; returned to approver's queue. |
| Any In-Progress State | `OVERRIDE_APPROVE` | `Approved` | Restricted to `SUPER_ADMIN`; logs compliance override. |

### Blocked / Invalid Transitions
- **`Approved` &rarr; Any State**: Once approved, documents are immutable. Any attempt to approve, reject, or edit an approved document raises HTTP 400 Bad Request.
- **`Rejected` &rarr; `Approved`**: Terminal rejection state cannot be revived. A new document must be submitted.
- **Maker-Checker Policy Violation** ([`documents.py#L1830-L1868`](file:///backend/app/routers/documents.py)): The creator or submitter of a document cannot approve their own document. Raises HTTP 403 Forbidden.
- **Duplicate Approval Block** ([`documents.py#L1869-L1880`](file:///backend/app/routers/documents.py)): A user who has already approved an invoice in an earlier step cannot approve it again in a subsequent step. Raises HTTP 400.
- **Stage Order Enforcement** ([`documents.py#L1895-L1915`](file:///backend/app/routers/documents.py)): Approvers assigned to future stages cannot approve until preceding stages are completed. Raises HTTP 403.
- **Physical Attachment Compulsory** ([`documents.py#L1916-L1950`](file:///backend/app/routers/documents.py)): Non-feedback documents at Stage 1 must have a valid physical PDF file on disk before approval can proceed.
- **Double Approval Collision**: If two approvers submit simultaneously, optimistic concurrency (`expected_version`) ensures only one succeeds; the second receives HTTP 409 Conflict.

---

## 10.2 Workflow Routing & Condition Evaluation Rules

Workflow assignment is executed by `evaluate_business_rules_full()` and `evaluate_rule_conditions()` in [`backend/app/services/rules_engine.py`](file:///backend/app/services/rules_engine.py):

### Rule Precedence & Tie-Breaking
1. Active rules are fetched from `business_rules`:
   `WHERE is_active = True AND is_deleted = False`
2. Ordered deterministically by:
   `ORDER BY priority DESC, id ASC`
3. The first rule whose complete set of conditions evaluates to `True` wins.

### Supported Condition Operators ([`rules_engine.py#L300-L340`](file:///backend/app/services/rules_engine.py))
| Operator | Data Types | Evaluation Rule |
| :--- | :--- | :--- |
| `equals`, `==`, `=`, `eq` | Number, String, Date | Strict equality. Case-insensitive string matching. |
| `not equals`, `!=`, `neq` | Number, String | Non-equality check. |
| `>`, `>=` | Number, Date | Greater than / Greater than or equal to. |
| `<`, `<=` | Number, Date | Less than / Less than or equal to. |
| `contains`, `in`, `like` | String, List | Substring or list membership match. |
| `does not contain`, `not in`| String, List | Substring or list absence check. |
| `starts with`, `starts_with`| String | Prefix string matching. |
| `ends with`, `ends_with` | String | Suffix string matching. |

### Straight-Through Processing (STP) Rule
If a matching rule has `rule_action == "AUTO_APPROVE"` (e.g., invoices under $500 for preferred vendors), human review stages are bypassed entirely:
1. `document.status` is set directly to `Approved`.
2. `complete_document_lifecycle()` is invoked immediately upon ingestion.

---

## 10.3 Stage Progression & The Empty Target Guard (AUD-01)

Located in [`backend/app/routers/documents.py#L2022`](file:///backend/app/routers/documents.py) and [`#L2153`](file:///backend/app/routers/documents.py):

When advancing to the next step, the system verifies:
```python
if next_step:
    if not next_step.approver_target or not str(next_step.approver_target).strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Workflow configuration error: Step {next_step.stage_number} ('{next_step.step_name}') has no valid approver target."
        )
```
This guarantees that a document will never be prematurely approved or stuck if an intermediate step has no assigned approver pool.

---

## 10.4 Post-Approval Lifecycle Execution (AUD-03)

The centralized function `complete_document_lifecycle()` ([`backend/app/routers/documents.py#L1278`](file:///backend/app/routers/documents.py)) enforces a strict, atomic execution order:

1. **Physical Archival**: Moves/copies the document PDF via `archive_approved_pdf(inv)`.
   - If archiving succeeds: `inv.storage_status = 'ARCHIVED'`.
   - If archiving fails: `inv.storage_status = 'PENDING'` (logged at warning; database data is not lost).
2. **Idempotent Audit Log & In-App Notifications**:
   - Checks if final approval audit log already exists for this stage (`not existing_final_log`) to prevent duplicate logs.
3. **Database Commit First**:
   - `db.commit()` commits approval state, audit logs, and storage status to SQL Server.
4. **Outbound Back-Sync**:
   - Calls `trigger_async_integration_push(str(inv.id))` **ONLY after DB commit** and **ONLY if archiving succeeded** (`archive_success == True`).

---

## 10.5 SLA Tracking & Escalation Rules

Implemented in [`backend/app/services/escalation_service.py`](file:///backend/app/services/escalation_service.py):

- Each step defines `sla_hours` (e.g., 24 hours, 48 hours).
- A periodic check calculates elapsed hours:
  `elapsed = now() - step_assignment_timestamp`
- If `elapsed > sla_hours`:
  1. Sets `is_escalated = True`.
  2. Dispatches reminder notifications to the assigned approver and their direct supervisor.
  3. Records an escalation event in `system_engine_logs`.

---

**Verified against source**: [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py), [`backend/app/services/rules_engine.py`](file:///backend/app/services/rules_engine.py), [`backend/app/services/escalation_service.py`](file:///backend/app/services/escalation_service.py), [`backend/app/database/models.py`](file:///backend/app/database/models.py).
