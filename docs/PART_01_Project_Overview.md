# PART 1: Project Overview

## 1.1 Executive Summary & Purpose

**DocuFlow** (also identified throughout the codebase as **DAAS - Document Approval & Automation System** and *Strivh Professional Enterprises - Document Approval & Automation System*) is an enterprise-grade document ingestion, workflow routing, approval hierarchy, OCR extraction, and bidirectional ERP synchronization platform.

The primary mission of DocuFlow is to automate the intake, multi-tier approval lifecycle, policy validation, dynamic checklist enforcement, and ERP back-synchronization for financial, operational, and customer records.

- **Primary Entry Points**:
  - Backend: [`backend/app/main.py`](file:///backend/app/main.py) (FastAPI app factory and startup lifecycles)
  - Backend Runner: [`backend/run.py`](file:///backend/run.py) (Uvicorn host launcher)
  - Frontend: [`frontend/src/main.tsx`](file:///frontend/src/main.tsx) (React 19 root bootstrap)
  - Frontend Container: [`frontend/src/App.tsx`](file:///frontend/src/App.tsx) (Application shell and view switcher)

---

## 1.2 Core Modules & Functional Capabilities

The application is structured into the following operational modules:

| Module Name | Primary Objective | Supporting Frontend Views | Core Backend Routers & Services |
| :--- | :--- | :--- | :--- |
| **Approval Flow (Core Engine)** | Manages multi-stage document lifecycles (Submit &rarr; Pending &rarr; Approve / Reject / Return / Hold / Sendback &rarr; Archival & ERP Back-Sync). | [`ApprovalQueuePage.tsx`](file:///frontend/src/components/ApprovalQueuePage.tsx), [`DocumentDetails.tsx`](file:///frontend/src/components/DocumentDetails.tsx) | [`documents.py`](file:///backend/app/routers/documents.py), [`rules_engine.py`](file:///backend/app/services/rules_engine.py), [`integration_service.py`](file:///backend/app/services/integration_service.py) |
| **Document Ingestion & Inbound Sync** | Accepts batch records and base64 file payloads from 3rd-party ERPs / SAP / n8n / Excel triggers. | [`DocumentUpload.tsx`](file:///frontend/src/components/DocumentUpload.tsx), [`DataVerificationPage.tsx`](file:///frontend/src/components/DataVerificationPage.tsx) | [`sync.py`](file:///backend/app/routers/sync.py), [`sync_router.py`](file:///backend/app/routers/sync_router.py), [`excel_trigger_service.py`](file:///backend/app/services/excel_trigger_service.py) |
| **Workflow & Condition Matrix** | Configures multi-level workflow profiles, stages, steps, fallback escalations, and dynamic routing conditions based on document fields. | [`FlowBuilder.jsx`](file:///frontend/src/components/FlowBuilder.jsx), [`PolicyMatrix.jsx`](file:///frontend/src/components/PolicyMatrix.jsx), [`WorkflowRulesPage.jsx`](file:///frontend/src/pages/WorkflowRulesPage.jsx) | [`workflows.py`](file:///backend/app/routers/workflows.py), [`conditions.py`](file:///backend/app/routers/conditions.py) |
| **Customer Feedback & Claims** | Handles customer complaints/feedback, defective batch claims, invoice cross-referencing, and automatic attachment of approved invoice PDFs. | [`CustomerFeedbackPage.tsx`](file:///frontend/src/components/CustomerFeedbackPage.tsx), [`CustomerFeedbackDetails.tsx`](file:///frontend/src/components/CustomerFeedbackDetails.tsx) | [`sync.py`](file:///backend/app/routers/sync.py), [`documents.py`](file:///backend/app/routers/documents.py) |
| **Dynamic More Info & Checklists** | Contextual checklist execution, conditional field requests, dynamic questionnaires, and approval gates. | [`MoreInfoConfigDrawer.tsx`](file:///frontend/src/components/MoreInfoConfigDrawer.tsx), [`ChecklistConditionBuilder.jsx`](file:///frontend/src/components/ChecklistConditionBuilder.jsx) | [`more_info.py`](file:///backend/app/routers/more_info.py) |
| **Identity, Authentication & RBAC** | Local credential login, multi-factor authentication (MFA via TOTP/Email/SMS), Microsoft Azure AD SSO, granular roles and permissions. | [`LoginPage.tsx`](file:///frontend/src/components/LoginPage.tsx), [`AdminRBAC.jsx`](file:///frontend/src/components/AdminRBAC.jsx), [`AdminUsers.jsx`](file:///frontend/src/components/AdminUsers.jsx) | [`auth.py`](file:///backend/app/routers/auth.py), [`users.py`](file:///backend/app/routers/users.py), [`roles.py`](file:///backend/app/routers/roles.py), [`mfa_service.py`](file:///backend/app/services/mfa_service.py) |
| **Integrations & ERP Back-Sync** | Outgoing webhooks to external ERPs on approval/rejection, exponential backoff retries, signed file deliveries. | [`AdminSystem.jsx`](file:///frontend/src/components/AdminSystem.jsx), [`dapi-sync-back/`](file:///frontend/src/components/dapi-sync-back/) | [`integrations.py`](file:///backend/app/routers/integrations.py), [`integration_service.py`](file:///backend/app/services/integration_service.py), [`callback_service.py`](file:///backend/app/services/callback_service.py) |
| **Audit & Compliance** | Immutable change logging, document access tracking, RACI notification matrices, lock contention monitoring. | [`AdminSystem.jsx`](file:///frontend/src/components/AdminSystem.jsx), [`AdminRACI.jsx`](file:///frontend/src/components/AdminRACI.jsx) | [`audit.py`](file:///backend/app/routers/audit.py), [`lock_service.py`](file:///backend/app/services/lock_service.py) |

---

## 1.3 User Roles and Permission Architecture

Role-based access control (RBAC) is implemented via database tables `roles`, `permissions`, and `role_permissions` defined in [`backend/app/database/models.py`](file:///backend/app/database/models.py) and enforced by [`backend/app/services/rbac_service.py`](file:///backend/app/services/rbac_service.py).

### Built-in System Roles
The system defines canonical roles seeded via [`backend/scripts/seed_rbac_catalogue.py`](file:///backend/scripts/seed_rbac_catalogue.py) and [`backend/app/routers/roles.py`](file:///backend/app/routers/roles.py):

| Role Code | Role Name | Intended Scope & Capabilities |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | Super Administrator | Unrestricted platform access: user provisioning, security config, global matrix editing, override approvals, system logs. |
| `ADMIN` | System Administrator | Workflow profile administration, rule authoring, integration configuration, audit reporting, user management within division. |
| `APPROVER` | Workflow Approver | Inspect assigned pending documents, review line items, approve, reject, return, request more info, manage checklists. |
| `INITIATOR` / `REQUESTER` | Document Initiator | Upload documents, submit records for workflow initiation, view status tracking of submitted documents. |
| `AUDITOR` / `VIEWER` | Read-only Auditor | Read-only inspection of approved documents, audit logs, system event history, without mutation rights. |

### Module-Level Permission Actions
Permissions are structured hierarchically: `{MODULE}:{SUBPAGE}:{ACTION}` or legacy string patterns:
- **Modules**: `DOCUMENT`, `WORKFLOW`, `RULE`, `CHECKLIST`, `INTEGRATION`, `USER`, `ROLE`, `AUDIT`, `FEEDBACK`.
- **Actions**: `CREATE`, `READ`, `UPDATE`, `DELETE`, `APPROVE`, `REJECT`, `OVERRIDE`, `EXPORT`, `EXECUTE`.

---

## 1.4 How Modules Are Interconnected

```
+----------------------------------------------------------------------------------------------------+
|                                      EXTERNAL SYSTEMS (ERP / SAP)                                  |
+----------------------------------------------------------------------------------------------------+
                   | Inbound Sync (REST / API Key)                  ^ Back-Sync (Webhook / HMAC)
                   v                                                |
+----------------------------------------------------------------------------------------------------+
| DOCUFLOW INGESTION ENGINE                                                                          |
| - /api/sync/documents & /api/sync/base64-attachment                                                |
| - Validates payload, stores file to /stored_pdfs, creates Document record (status: PENDING)         |
+----------------------------------------------------------------------------------------------------+
                   |
                   v
+----------------------------------------------------------------------------------------------------+
| POLICY & WORKFLOW EVALUATION (RulesEngine.evaluate_workflow)                                       |
| - Evaluates business rules (amount, vendor, category, division)                                    |
| - Assigns workflow profile & binds first step (current_step_id, approver_target)                   |
| - If STP rule matches: automatically marks Approved & skips stages                                 |
+----------------------------------------------------------------------------------------------------+
                   |
                   v
+----------------------------------------------------------------------------------------------------+
| APPROVAL LIFECYCLE (documents.py & lock_service.py)                                                |
| - Concurrent row locking (DocumentLock & expected_version optimistic check)                       |
| - Dynamic Checklists & More-Info forms (more_info.py)                                              |
| - Multi-stage progression: Step 1 -> Step 2 -> ... -> Final Step                                  |
+----------------------------------------------------------------------------------------------------+
                   |
                   v (Final Approval)
+----------------------------------------------------------------------------------------------------+
| FINAL LIFECYCLE COMPLETION (complete_document_lifecycle)                                           |
| 1. Archive physical PDF into /stored_pdfs/approved/{YYYY}/{MM}/{doc_id}/                          |
| 2. Outbound Back-Sync trigger: push approved status to 3rd-party ERP webhook                       |
| 3. Dispatch RACI Notifications & record immutable AuditLog entry                                   |
| 4. On failure: Enqueue into Outbound Sync Retry Engine (exponential backoff)                       |
+----------------------------------------------------------------------------------------------------+
```

---

## 1.5 Supported Document Types

Found in [`backend/app/database/models.py`](file:///backend/app/database/models.py) (`Document.document_type` and `DocumentTypeFieldConfiguration`):

1. **AP INVOICE** / **PURCHASE INVOICE**: Accounts Payable supplier bills and purchase invoices.
2. **CUSTOMER FEEDBACK** / **COMPLAINT**: Customer product grievances, defective batch claims, credit requests with invoice cross-referencing.
3. **E-VOUCHER** / **CASH VOUCHER**: Petty cash, electronic reimbursement and cash vouchers.
4. **CAPEX / FIXED ASSET**: Capital expenditure and machinery procurement.
5. **GRN / GOODS RECEIPT**: Warehouse Goods Receipt Notes and inventory stock receipts.
6. **FREIGHT & LOGISTICS**: Transportation, courier, freight and shipping bills.
7. **UTILITY & RENT**: Electricity, power, office rent and municipal utility expenses.
8. **STAFF & HR EXPENSE**: Travel claims, staff welfare, incentives and payroll-related reimbursements.
9. **SERVICE & MAINTENANCE**: Equipment repairs, AMC and operational servicing.
10. **ADVANCE VOUCHER** & **JOURNAL VOUCHER**: Financial accounting adjustments and employee expense advances.

---

**Verified against source**: [`backend/app/main.py`](file:///backend/app/main.py), [`backend/run.py`](file:///backend/run.py), [`backend/app/database/models.py`](file:///backend/app/database/models.py), [`backend/app/services/rules_engine.py`](file:///backend/app/services/rules_engine.py), [`backend/app/services/rbac_service.py`](file:///backend/app/services/rbac_service.py), [`backend/scripts/seed_rbac_catalogue.py`](file:///backend/scripts/seed_rbac_catalogue.py), [`frontend/src/App.tsx`](file:///frontend/src/App.tsx), [`frontend/src/main.tsx`](file:///frontend/src/main.tsx).

