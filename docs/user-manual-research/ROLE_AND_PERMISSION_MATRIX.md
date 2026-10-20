# Role and Permission Matrix — DocuFlow Automation
**Document ID:** DASS-RES-03  
**Verification Level:** Verified in Live Backend RBAC Engine (`rbac_service.py`), SQL Server `roles` table, and Frontend (`App.tsx`, `Sidebar.tsx`)  

---

## 1. Verified Role Catalog

The DocuFlow platform implements a dual-layer security model:
1. **System Roles (Coarse-Grained):** Stored in the `users.role` column, establishing the user's primary identity and division scope.
2. **Granular Permissions (Fine-Grained):** Stored in the `roles` and `role_permissions` tables, mapping permission codes (e.g. `document:read`, `document:approve`, `admin:users`, `workflow:write`) to each user role.

### Defined System Roles in Live Database:

| Role Code | Role Display Name | Typical Department / Responsibility | Division Scope |
|---|---|---|---|
| `admin` | System Administrator | IT Lead, Security Officer, Enterprise Superuser | Global (All Divisions) |
| `settings_editor` | Workflow & Integration Architect | Business Process Analyst, Configuration Specialist | Global |
| `gm` / `jmd` / `md` | Executive Management | General Manager, Joint Managing Director, Managing Director | Global / High Value |
| `manager` | Operations / Department Manager | Plant Head, Branch Head, Store Operations Manager | Division-Bound (e.g. VCC, ACC) |
| `accounts_approver` | Accounts Payable Reviewer (Stage 1) | Senior Accountant, AP Auditor | Division-Bound |
| `accounts_approver2` | Finance Settlement Officer (Stage 2/3) | Finance Controller, Cashier, Treasury Officer | Global / Multi-Division |
| `ap_executive` | AP Data Entry & Verification Clerk | Inward Logistics Clerk, OCR Correction Specialist | Division-Bound |
| `customer_feedback_agent` | Customer Relations Representative | Quality Control Officer, Customer Service Desk | Division-Bound |
| `employee` | Standard Staff Member | Store Staff, Warehouse Assistant, General Employee | Division-Bound |

---

## 2. Page & View Access by Role

| Application View / Page | `admin` | `settings_editor` | `gm` / `jmd` / `md` | `manager` | `accounts_approver` | `ap_executive` | `employee` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Dashboard** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Work Tracker** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Approved Documents** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Document Details (Review)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ *View Only* |
| **Document Upload (PDF/OCR)** | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Customer Feedback Portal** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Workflow Rules & Flow Builder** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Control Settings (Admin Console)**| ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Integration Studio (DapiSyncBack)**| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Detailed Role Capability Profiles

### 3.1 System Administrator (`admin`)
- **Document Visibility:** Can inspect every document in the database across all divisions (HQ, VCC, ACC, PRM), regardless of who is assigned.
- **Allowed Actions:**
  * Approve, reject, hold, or send back any document at any stage.
  * Override approver assignments and reassign stuck documents.
  * Create, edit, lock, unlock, and delete user accounts.
  * Configure custom roles and edit the fine-grained permission matrix.
  * Create and modify visual workflows in Flow Builder and Condition Builder.
  * Trigger manual database backups and view system diagnostics.
- **Restrictions:** Cannot disable or delete their own active user account (self-lockout prevention).

### 3.2 Department Manager (`manager`)
- **Document Visibility:** Strictly scoped to documents belonging to their assigned division (e.g. `VCC`). Cannot see documents belonging to other divisions.
- **Allowed Actions:**
  * Review invoices where `assigned_approver` matches their username, email, or role code.
  * Verify compliance checklist items.
  * Approve documents to advance them to the next stage.
  * Reject invoices (requires providing a mandatory rejection reason).
  * Place invoices on temporary hold (pauses SLA timers).
- **Prohibited Actions:** Cannot create users, cannot edit workflows, cannot see administrative settings, cannot view documents from other company divisions.

### 3.3 Accounts Approver (`accounts_approver`, `accounts_approver2`)
- **Document Visibility:** Invoices that have successfully passed initial Department Review (Stage 1) and are waiting for financial verification and settlement.
- **Allowed Actions:**
  * Verify bank details, tax amounts, line items, and invoice calculations.
  * Finalize approval, which moves the document to "Fully Approved" and triggers the ERP callback synchronization.
  * Return document to Stage 1 reviewer (`Send Back`) if discrepancies are discovered.
- **Prohibited Actions:** Cannot modify workflow routing definitions or user permissions.

### 3.4 AP Executive (`ap_executive`)
- **Document Visibility:** Incoming document inbox and invoices in "Data Verification Pending" status.
- **Allowed Actions:**
  * Upload new digital PDF invoices and scans.
  * Inspect raw OCR and AI-extracted text.
  * Correct OCR transcription errors (e.g. fix misread invoice dates or totals).
  * Confirm ingestion and dispatch document to the workflow engine.
- **Prohibited Actions:** Cannot approve documents for financial payment or bypass management sign-off.

### 3.5 General Employee (`employee`)
- **Document Visibility:** Only documents they personally uploaded or registered complaints for within their division.
- **Allowed Actions:**
  * View real-time status of their submitted documents.
  * Check current approval stage and assigned manager.
- **Prohibited Actions:** Cannot approve, reject, or alter documents; cannot upload administrative configurations.

---

## 4. Multi-Tenant Division Isolation Boundaries

To ensure complete data privacy between business entities, DocuFlow enforces strict **Division Isolation**:
- Every document is tagged with a `division` code (e.g. `VCC`, `ACC`, `PRM`, `HQ`).
- Every non-admin user is assigned to a specific division.
- In `backend/app/services/rbac_service.py`, `authorize_document_access()` automatically blocks non-admin users from accessing or modifying documents from outside their division, returning `403 Forbidden`.
