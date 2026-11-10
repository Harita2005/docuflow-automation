# DocuFlow Automation / FlowApprove — Enterprise User Manual
## Production Operational & Administration Manual
*Comprehensive Guide for Document Verification, Multi-Stage Approvals, OCR Extraction, and Enterprise System Administration*

---

| Document Version | Release Date | Author / Role | Approval Authority | Document Scope |
| :--- | :--- | :--- | :--- | :--- |
| 2.0.0 (Final) | October 2026 | Senior Technical Writer | System Architect & QA Lead | End-to-End Enterprise Manual |


# Table of Contents

1. Executive Summary & System Architecture

2. Chapter 1: Application Access, Login, MFA & Security Management

3. Chapter 2: Executive Dashboard & Analytics

4. Chapter 3: Document Upload & Ingestion Engine

5. Chapter 4: Work Tracker & Active Operations

6. Chapter 5: Document Details, OCR Extraction & Verification Form

7. Chapter 6: Approved Documents & Historical Records Archive

8. Chapter 7: Specialized Document Types (GRN Gate Entry & Customer Feedback)

9. Chapter 8: Flow Builder & Multi-Stage Workflow Canvas

10. Chapter 9: Condition Builder & Dynamic Routing Logic

11. Chapter 10: Checklist Creation & Compliance Templates

12. Chapter 11: Role Creation & Role-Based Access Control (RBAC)

13. Chapter 12: User Management & Scoped Division Provisioning

14. Chapter 13: Third-Party Application Synchronization (DAPI Sync Hub)

15. Chapter 14: In-App Notifications & RACI Email Alert Matrix

16. Chapter 15: System Administration, Database Archival & Retention Maintenance

17. Chapter 16: Troubleshooting & Diagnostic Guide

18. Chapter 17: Comprehensive Glossary & Quick-Reference Sheets

19. Chapter 18: Documentation Gaps & Unresolved Evidence

# Executive Summary & System Architecture

DocuFlow Automation (marketed as FlowApprove) is an enterprise-grade document approval, optical character recognition (OCR), multi-stage workflow automation, and enterprise resource planning (ERP) synchronization platform. Built upon high-throughput Python FastAPI, Microsoft SQL Server, and React with TypeScript, it eliminates manual invoice data entry, automates multi-stage departmental sign-offs, and guarantees financial compliance.

## System Architecture & High-Concurrency Pipeline

The platform operates as a cohesive, self-contained architecture with zero external workflow engine dependencies (100% native Python business rules dispatcher).

- **Frontend Layer: ** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, and React-PDF viewer.
- **Backend Application Server: ** Python 3.11 FastAPI running on Uvicorn with AnyIO concurrency limiter tuned to 200 tokens.
- **Database Management System: ** Microsoft SQL Server (DocuFlowDB) utilizing SQLAlchemy ORM with a tuned connection pool (pool size 100, max overflow 150).
- **AI & Extraction Engine: ** Local/Cloud OCR LLM pipeline reading PDF vectors and raster scans to extract 20+ structured invoice headers and line items.
- **Outbound ERP Sync Hub: ** DAPI Sync Hub executing automated HMAC-signed webhooks to third-party ERP platforms (SAP, Oracle, Tally) upon final approval.
> [!NOTE]
> **SYSTEM PREREQUISITE:** DocuFlow requires modern web browsers (Google Chrome 110+, Microsoft Edge 110+, or Mozilla Firefox 110+). Ensure network access to port 3000 (backend API) and port 5173 / IIS production port.

## Executive Summary & System Architecture

DocuFlow Automation (FlowApprove) is an enterprise document approval, OCR extraction, workflow automation, and ERP synchronization platform.

# Chapter 1: Application Access, Login, MFA & Security Management

**Purpose: ** This chapter covers secure access to DocuFlow, Multi-Factor Authentication (MFA), single-session concurrency management, and secure sign-out.

**Authorized Users: ** All registered enterprise users across Clerk, Reviewer, Manager, Controller, and Administrator roles.

**How to Access: ** Navigate your browser to the designated URL (e.g. https://docuflow.internal or http://localhost:5173). If unauthenticated, the system automatically redirects to the Login portal.

## Interface Overview & Input Fields

| Field / Control | Input Type | Required | Validation Rule | Description |
| :--- | :--- | :--- | :--- | :--- |
| Username / Email | Text input | Yes | Valid user handle or email format | Enterprise login ID assigned by IT. |
| Password | Password input | Yes | Min 8 chars, hashed via bcrypt | Secure user password. |
| Remember Session | Checkbox | Optional | Boolean | Persists local authentication claims across browser reloads. |
| Sign In Button | Button (Primary) | Action | Validates against /api/auth/login | Submits credentials for server verification. |
| OTP / MFA Token | Numeric / Text | Conditional | 6-digit code / time-bounded | Required when Multi-Factor Authentication is active. |


## Step-by-Step Login & MFA Procedure

1. Open the application URL in a supported web browser.
2. In the Username field, enter your assigned employee ID or enterprise username.
3. Enter your password in the Password field.
4. Click the 'Sign In' button.
5. If MFA is active on your account, an OTP challenge modal appears. Enter the 6-digit code received via your registered email or authenticator app, then click 'Verify OTP'.
6. Upon successful authentication, the system stores your signed JWT bearer token and redirects you to the Executive Dashboard.

## Flexible Authentication & Multi-Identifier Login

DocuFlow supports seamless enterprise authentication across four login formats:
* **Username:** Standard corporate username handle (e.g. `john.doe`).
* **Email Address:** Full corporate email address (e.g. `johndoe@ramrajcotton.net`).
* **Employee ID:** Official payroll employee identification code (e.g. `EMP_01` or `ADMIN01`).
* **Normalized ID Passwords:** Supports initial login using employee ID credentials with automatic bcrypt password hashing and security upgrade.

## First-Time Login & Mandatory Password Change

To comply with corporate security standards:
1. Newly provisioned accounts or accounts using temporary default credentials are required to change their password upon initial login.
2. The user is redirected to a dedicated **Set New Password** screen requiring verification of minimum complexity (8+ characters, mixed case, numbers, and symbols).
3. Access to operational features (Dashboard, Work Tracker, Approvals) remains locked until the password update is confirmed.

## Self-Service Password Reset Flow

If a user forgets their password:
1. Click **Forgot Password?** on the login portal.
2. Enter the registered corporate email address or username.
3. DocuFlow generates a time-limited (15-minute), cryptographically signed password reset link delivered to the user's email inbox via SMTP.
4. Clicking the link opens the password reset page, allowing the user to establish a new password securely without requiring manual IT helpdesk intervention.

## Multi-Tab Synchronization & Concurrency Enforcement

DocuFlow integrates an HTML5 BroadcastChannel ('docuflow_auth_channel'). Logging in or out on any single browser tab instantaneously synchronizes session state across all other open tabs without requiring manual page refreshes. Furthermore, single-session concurrency enforcement terminates obsolete sessions if your account is accessed from a separate device.

> [!NOTE]
> **SECURITY RESTRICTION:** To prevent brute-force attacks, authentication and MFA endpoints enforce a strict rate limit of 15 requests per minute per IP address. Exceeding this limit results in HTTP 429 Too Many Requests.

# Chapter 2: Executive Dashboard & Real-Time Analytics

**Purpose: ** Provides real-time visibility into document intake volume, stage bottlenecks, division distribution, and SLA status.

**Authorized Users: ** All authenticated users (data displays scoped according to authorized plant divisions).

**How to Access: ** Click the 'Dashboard' link in the primary navigation header or sidebar.

| Metric Card / Chart | Underlying Metric | Filter Behavior | Operational Significance |
| :--- | :--- | :--- | :--- |
| Total Invoices | Count of active non-deleted documents | Displays total intake volume | Total operational backlog. |
| Pending Review | Documents at Stage 1 / Intake | Clicks direct to Work Tracker (Pending) | Identifies intake queue depth. |
| In Approval Flow | Documents actively assigned to approvers | Filters Work Tracker to active workflows | Measures review throughput. |
| On Hold / Escalated | Documents flagged with exceptions | Filters to status = 'On Hold' | Critical exceptions requiring manager action. |
| Approved & Cleared | Terminal approved documents | Navigates to Approved Documents archive | Cleared documents ready for ERP export. |
| Division Distribution | Bar/Pie chart of records per division | Visual breakdown across ACC, VCC, etc. | Identifies departmental volume disparities. |


# Chapter 3: Document Ingestion & Batch Upload Engine

**Purpose: ** Ingests electronic PDFs and scanned images, executes duplicate SHA-256 validation, and initiates the automated OCR extraction pipeline.

**Authorized Users: ** Clerks, Accounts Payable, Store Keepers, and Administrators.

**How to Access: ** Click the 'Upload' tab on the primary top menu bar.

| Control / Field | Type | Required | Description & Constraints |
| :--- | :--- | :--- | :--- |
| Dropzone Area | Drag & Drop / File Browser | Yes | Accepts .pdf, .png, .jpg, .jpeg, .tiff up to 25 MB per file. |
| Document Type | Dropdown | Yes | AP INVOICE, PURCHASE ORDER, GOODS RECEIPT NOTE, CUSTOMER FEEDBACK. |
| Main Division | Dropdown | Yes | Selects parent operating plant (e.g. ACC, VCC, GLOBAL). |
| Sub-Division / Plant | Dropdown | Optional | Specific operating branch (e.g. ACC_ER, ACC_MDU, ACC_PROD). |
| Batch Processing | Multi-file queue | Optional | Allows uploading up to 50 documents simultaneously. |


## Duplicate Prevention Architecture

DocuFlow computes a cryptographic SHA-256 checksum for every uploaded binary file and checks existing database records prior to saving. If an exact file duplicate is detected, the upload is rejected with a message displaying the existing Document ID, preventing redundant financial processing.

# Chapter 4: Work Tracker & Active Document Operations

**Purpose: ** The Work Tracker serves as the daily operational clearinghouse where clerks and approvers inspect, verify, and advance active documents.

**Authorized Users: ** Accounts Payable, Reviewers, Approving Managers, and System Admins.

**How to Access: ** Click 'Work Tracker' in the top header or sidebar navigation.

![Work Tracker Table and Document Review Interface](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792209123169_e8578a7e.png)
*Work Tracker Table and Document Review Interface*

| Column Name | Data Source | Filterable | Description |
| :--- | :--- | :--- | :--- |
| Document ID | Invoice.id / doc_key | Yes (Search) | Unique alphanumeric tracking identifier (e.g. DOC-000172). |
| Document Type | Invoice.document_type | Yes | Classification type (AP Invoice, PO, GRN, Feedback). |
| Vendor / Party | Invoice.vendor_name | Yes (Search) | Supplier or business partner name. |
| Amount | Invoice.total_amount | Yes (Sort) | Net invoice value with formatted currency symbol. |
| Stage / Step | WorkflowStep.step_name | Yes | Current approval milestone (e.g. Attachment Status, Manager Approval). |
| Current Approver | Invoice.assigned_approver | Yes | User or role pool authorized to take action. |
| Status | Invoice.status | Yes | Pending, In Progress, On Hold, or Rejected. |
| Actions | Contextual buttons | No | 'Review' opens split-pane editor; 'Download' exports PDF. |


# Chapter 5: Document Details, OCR Extraction & Verification Form

**Purpose: ** Provides a side-by-side interactive split-pane interface comparing the original document image against OCR-extracted database fields, with full audit trails and checklist enforcement.

**Authorized Users: ** Clerks, Verification Specialists, Approvers, and Auditors.

**How to Access: ** Click 'Review' or double-click any row in the Work Tracker.

## Dynamic More Info Field Configuration

DocuFlow features an adaptive More Info configuration engine. Users and administrators can customize which fields appear in the primary top section of the verification view.

![Dynamic More Info Field Configuration Modal with Category Selection](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792231017841_2210b9c1.png)
*Dynamic More Info Field Configuration Modal with Category Selection*

Field Configuration Options:
• Top 3 Default Fields: Pin key business identifiers (e.g. Purchase Order Number, Payment Terms, GRN Gate ID).
• Scoped Personal Overrides: Standard users can customize their own view without impacting global organization settings.
• Admin Default Promotion: Administrators can set organizational defaults across entire document types.

## Role-Based Authorization & Strict Assigned Approver Policy

DocuFlow enforces strict segregation of responsibilities and step-wise access controls:

### 1. Strict Assigned Approver Rule (Approval & Cancellation)
* **Approval Authority:** Strictly **only the assigned approver** (`assigned_approver`) for the active workflow stage is authorized to approve the document.
* **Cancellation Authority:** For cancellation also, strictly **only the assigned approver** is authorized to cancel or void the document process.
* **Read-Only Lock for Non-Assignees:** If a user is not the designated approver for the active stage, the document is displayed in read-only locked mode with an informative badge (e.g. `Document Locked: Assigned to YUVASREE`), and all operational action buttons are locked.

### 2. Segregation of Duties (Maker-Checker Policy)
* The creator, uploader, or submitter of a document (**Maker**) is strictly prohibited from approving their own document (**Checker**), satisfying corporate accounting and SOX/audit compliance standards.
* For system administration testing, administrators possess an override for designated administrative test workflows.

### 3. Stage 1 Mandatory Attachment & Compliance Checklist
* In **Stage 1 (Attachment Status)**, approval is gated by two strict prerequisites:
  1. **Physical PDF File:** A valid document file must be uploaded on disk (or auto-provisioned via the synthetic fallback engine if created through automated workflows).
  2. **Mandatory Checklist Items:** All stage-wise compliance items (e.g. *Documents Attached*, *Bill Name Verified*, *Bill Date Verified*) must be inspected and checked.
* The **Approve ➔** button remains locked until 100% of the checklist items are satisfied.

### 4. Stage 1 Cancellation Process & Dedicated Reason Modal
* If a document in Stage 1 must be voided (e.g. incorrect vendor, duplicate entry), the assigned approver clicks **Cancel Process**.
* A dedicated **Cancellation Reason Modal** opens, requiring the approver to enter mandatory remarks explaining the cancellation before voiding the workflow.

### 5. Optimistic Concurrency Control (Version Safety)
* Every workflow action transmits the `expected_version` and `expected_stage`.
* If a concurrent modification occurs (e.g. another reviewer signs off simultaneously), the system returns an HTTP 409 Conflict, safeguarding audit trail integrity and preventing duplicate approvals.

## Available Actions & State Transitions

| Button / Action | Target Endpoint | Prerequisites | Database Impact |
| :--- | :--- | :--- | :--- |
| Approve Stage | POST /api/workflows/approve | Checklist 100% verified & user is assigned approver | Advances current_stage +1; if final stage, marks 'Approved' and triggers ERP sync. |
| Cancel Process (Stage 1) | POST /api/workflows/cancel | User is assigned approver & mandatory reason entered in modal | Sets status to 'Cancelled', voids workflow, increments version, and archives record. |
| Put On Hold | POST /api/workflows/hold | User is assigned approver & mandatory clarification notes | Sets status to 'On Hold', pauses SLA timers, preserves record in Work Tracker. |
| Reject / Return (Stage 2+) | POST /api/workflows/{id}/send-back | User is assigned approver & return reason entered | Decrements current_stage to designated milestone, alerts preceding reviewer. |
| Reassign Approver | POST /api/workflows/{id}/escalate | Administrator / Manager permission | Updates assigned_approver in Invoice and approval_assignments tables. |


# Chapter 6: Approved Documents & Historical Records Archive

**Purpose: ** Provides a permanent, immutable read-only repository of cleared and settled documents with full compliance search filters and PDF export.

**Authorized Users: ** All authenticated users (Clerks, Managers, Financial Auditors).

**How to Access: ** Click 'Approved Documents' in the top header menu.

Search & Filtering Features:
• Date Range Filters: Filter by Year, Month, Specific Date, or Custom From/To date boundaries.
• Division & Type Scoping: Filter specifically by operating plant and document category.
• Full-Text Search: Query by Vendor Name, Invoice Number, or internal tracking key.
• Export to Excel / CSV: Download comprehensive audit-ready spreadsheets containing all financial metadata.

# Chapter 7: Specialized Document Types (GRN & Customer Feedback)

**Purpose: ** Details the specialized handling pipelines for Goods Receipt Notes (GRN) and Customer Grievances / Feedback.

## Customer Feedback & Grievance Pipeline

The Customer Feedback portal tracks complaints, field inspection reports, and resolution workflows. Unlike standard financial invoices, feedback records require dedicated hold reason taxonomy and root-cause checklists.

![Customer Feedback Review Dialog with Mandatory Action Selection](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792206887281_0eb59708.png)
*Customer Feedback Review Dialog with Mandatory Action Selection*

> [!NOTE]
> **COMPLIANCE CONTROL:** To prevent accidental document progression, the Action selector in the Customer Feedback review dialog defaults strictly to empty ('— No Action (Normal Feedback) —'). Submitting a review requires explicit action selection and reviewer justification.

# Chapter 8: Flow Builder & Multi-Stage Workflow Canvas

**Purpose: ** Provides visual creation, sequential stage sequencing, approver targeting, and SLA definition for multi-departmental approval paths.

**Authorized Users: ** Workflow Administrators and System Admins (role:manage / workflow:manage permissions).

**How to Access: ** Navigate to 'Control Settings' or 'Workflow Rules' -> 'Flow Builder' tab.

![Flow Builder Multi-Stage Sequential Routing Canvas](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792210070966_c9105a59.png)
*Flow Builder Multi-Stage Sequential Routing Canvas*

| Configuration Property | Input Type | Required | Description |
| :--- | :--- | :--- | :--- |
| Workflow Profile Name | Text string | Yes | Unique workflow identifier (e.g. 'ACC_INVOICE_FLOW', 'CAPEX_HIGH_VALUE'). |
| Stage Number | Integer sequence | Yes | 1-indexed order of execution (Stage 1, Stage 2, Stage 3...). |
| Step / Stage Name | Text label | Yes | Descriptive milestone (e.g. 'Attachment Status', 'Plant Head Approval'). |
| Approver Target | Role / User Handle | Yes | Primary assigned authority (e.g. 'Plant_Finance_Head', 'admin'). |
| Delegate Approver | Role / User Handle | Optional | Fallback approver authorized if primary is on leave or unavailable. |
| SLA Hours Limit | Numeric integer | Optional | Maximum elapsed time before escalation alert is dispatched. |


# Chapter 9: Condition Builder & Dynamic Routing Logic

**Purpose: ** Enables financial policy logic (e.g. 'If total amount > 50,000 INR, route to General Manager; otherwise route to Site Accountant').

**Authorized Users: ** Workflow Administrators and Financial Controllers.

**How to Access: ** Navigate to 'Workflow Rules' -> 'Condition Builder' tab.

Supported Operators & Conditions:
• EQUALS (=) / NOT EQUALS (!=): Exact match on division, vendor, or category.
• GREATER THAN (>) / LESS THAN (<): Numeric boundaries on invoice amount or line item quantity.
• CONTAINS: Substring search across vendor names or item descriptions.
• IN LIST: Matches against designated sets of authorized division codes.
• Chaining Logic: Compound rules supported via logical AND and OR operators.

# Chapter 10: Checklist Creation & Compliance Templates

**Purpose: ** Enforces physical verification checks (e.g. 'Purchase Order Attached', 'Gate GRN Verified', 'Tax ID Validated') that must pass before stage clearance.

**Authorized Users: ** Compliance Managers, Quality Control, and Administrators.

**How to Access: ** Navigate to 'Workflow Rules' -> 'Checklist Templates' tab.

Checklist Architecture:
• Document-Type Binding: Checklists attach to specific document categories (AP Invoices, GRNs, Feedback).
• Stage-Specific Enforcement: Specific checklist items can be required only at Stage 1 (Intake) or Stage 3 (Final Payment).
• Interactive Pass/Fail Persistence: Toggling checklist items writes directly to the InvoiceChecklistState database table with reviewer attribution.

# Chapter 11: Role Creation & Role-Based Access Control (RBAC)

**Purpose: ** Manages enterprise roles, clearance tiers, and granular functional permissions.

**Authorized Users: ** System Administrators.

**How to Access: ** Navigate to 'Control Settings' / 'Admin' -> 'RBAC & Roles' tab.

| Permission Token | Functional Area | Capability Granted |
| :--- | :--- | :--- |
| document:read | Work Tracker / Archive | Allows viewing document metadata, PDF assets, and audit logs. |
| document:verify | Document Details Form | Authorizes modifying OCR fields, line items, and checklist states. |
| workflow:approve | Workflow Actions | Enables clicking 'Approve Stage' to advance documents in assigned stages. |
| workflow:hold_reject | Exception Actions | Permits placing documents on hold or executing final rejection. |
| workflow:manage | Flow Builder | Allows creating and publishing multi-stage workflow definitions. |
| role:manage | Admin RBAC | Grants capability to provision users, edit profiles, and alter clearance matrices. |
| sync:manage | DAPI Sync Hub | Authorizes configuring ERP webhooks and triggering manual batch syncs. |
| system:archive | System Maintenance | Enables altering database retention windows and triggering database archival. |


# Chapter 12: User Management & Scoped Division Provisioning

**Purpose: ** Covers provisioning new enterprise accounts, assigning roles, and scoping user visibility to authorized plant divisions.

**Authorized Users: ** System Administrators and HR / IT Managers.

**How to Access: ** Navigate to 'Admin' -> 'User Management' -> Click '+ User' button.

![Admin User Provisioning Interface with Employee Details](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792207779963_83bea445.png)
*Admin User Provisioning Interface with Employee Details*

## Dynamic Approval Division Filtering

To prevent cross-division authorization errors, selecting a 'Main Division' automatically restricts the 'Approval Divisions' multi-select list strictly to operating units belonging to that group.

![Main Division Scoping: Selecting ACC Automatically Displays ACC Division Sub-Units](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792208527539_58338249.png)
*Main Division Scoping: Selecting ACC Automatically Displays ACC Division Sub-Units*

| Form Input | Type | Validation Constraints | Behavior & Impact |
| :--- | :--- | :--- | :--- |
| Employee ID | Text | Unique, non-empty | Primary enterprise employee identifier. |
| Employee Name | Text | Full legal name | Displays on approval signatures and audit entries. |
| Email Address | Email | Unique valid email | Destination for MFA tokens and SLA escalation alerts. |
| Password | Password | Min 8 characters | Securely hashed via bcrypt prior to database storage. |
| Role | Dropdown | Select from active roles | Assigns clearance permissions (Admin, Manager, Clerk, etc.). |
| Main Division | Dropdown | Required selection | Determines primary operating group (e.g. ACC, VCC, HQ). |
| Approval Divisions | Checkbox list | Filtered by Main Division | Grants granular approval authority for specific plant units. |


# Chapter 13: Third-Party Application Synchronization (DAPI Sync Hub)

**Purpose: ** Manages real-time data exchange, webhook callbacks, and ERP payload synchronization upon final document clearance.

**Authorized Users: ** Integration Engineers, ERP Administrators, and System Admins.

**How to Access: ** Click 'DAPI Sync Hub' / 'Integrations' in the primary navigation header.

![DAPI Callback Webhook Configuration Interface](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792212543663_de3b8f5e.png)
*DAPI Callback Webhook Configuration Interface*

| Configuration Parameter | Type | Required | Operational Description |
| :--- | :--- | :--- | :--- |
| Application Name | Text | Yes | Registered consumer (e.g. 'SAP S/4HANA ERP', 'Tally Prime Hub'). |
| Webhook Target URL | HTTPS URL | Yes | External endpoint receiving the approved invoice payload. |
| Trigger Event | Dropdown | Yes | DOCUMENT_APPROVED, DOCUMENT_REJECTED, or STAGE_COMPLETED. |
| HMAC Secret Key | Password / Token | Yes | Generates SHA-256 signature in X-Signature header for verification. |
| Max Retry Count | Integer (1-10) | Yes | Number of automatic retry attempts if target server returns 5xx error. |
| Retry Interval (s) | Integer (seconds) | Yes | Exponential backoff delay between transmission retries. |


# Chapter 14: In-App Notifications & RACI Email Alert Matrix

**Purpose: ** Configures automated alert delivery, real-time in-app notification toasts, and RACI matrix escalation routing.

**Authorized Users: ** All users receive alerts; Administrators configure delivery rules.

**How to Access: ** In-App Bell in top header; RACI Matrix in 'Control Settings' -> 'RACI / Notifications'.

Notification Types:
• Document Assigned: Immediate alert when a document enters your approval stage.
• SLA Breach Warning: Notification dispatched when an invoice approaches its configured turnaround deadline.
• Document Rejected / Sent Back: Alerts the uploader or previous reviewer with reason notes.
• ERP Sync Failure: System administrator notification if outbound webhook exhausts maximum retries.

# Chapter 15: System Administration, Database Archival & Retention Maintenance

**Purpose: ** Covers automated database archival schedules, audit retention pruning, and system engine diagnostic logs.

**Authorized Users: ** System Administrators and Database Engineers.

**How to Access: ** Navigate to 'Control Settings' -> 'System & Archival' tab.

![Automated Database Archival and Retention Scheduler](../../../.gemini/antigravity/brain/2c32f2a6-d277-416e-8e54-5b2e639268a4/.user_uploaded/media_1792210466624_e6d92f14.png)
*Automated Database Archival and Retention Scheduler*

| Setting | Options | Default | Description |
| :--- | :--- | :--- | :--- |
| Archival Frequency | Daily, Monthly, Yearly | Monthly | Frequency at which background engine migrates settled records. |
| Scheduled Execution Time | 24-hour time (HH:MM) | 02:00 AM | Off-peak execution window to minimize database load. |
| Retention Window | 30, 90, 180, 365 Days | 90 Days | Documents older than this threshold are packaged into archives. |
| Archive File Target | File system path / storage URI | /backups/archive/ | Destination for compressed archive database files. |


# Chapter 16: Troubleshooting & Diagnostic Guide

**Purpose: ** Provides actionable remedies for common operational, authorization, and network error codes.

| Error Symptom | Probable Root Cause | Step-by-Step Remediation Procedure |
| :--- | :--- | :--- |
| HTTP 401 Unauthorized / Token Expired | JWT session expired or invalid credentials | Log out, clear browser cookies, and re-enter credentials with valid MFA token. |
| HTTP 403 Forbidden on Approval | Current user is not in assigned approver pool | Verify current workflow step definition in Flow Builder; ensure user possesses required role. |
| Duplicate Document Detected | File with identical SHA-256 hash exists | Search for document key in Work Tracker or Approved archive; do not re-upload identical PDF. |
| OCR Extraction Field Missing | Low-resolution scan or skewed page | Use rotation buttons in Document Details; click field input box and manually enter correct value. |
| Outbound ERP Sync Pending | Target third-party server down or invalid HMAC | Open DAPI Sync Hub, inspect transmission log, verify webhook URL, and click 'Retry Sync'. |
| HTTP 429 Too Many Requests | Exceeded rate limit (15 requests/min) | Wait 60 seconds before retrying login or MFA token verification. |


# Chapter 17: Comprehensive Glossary & Quick-Reference Sheets

| Acronym / Term | Full Definition | Context in DocuFlow |
| :--- | :--- | :--- |
| OCR | Optical Character Recognition | Automated text extraction from uploaded PDF and image documents. |
| LLM | Large Language Model | AI engine parsing unstructured OCR text into structured financial schemas. |
| RBAC | Role-Based Access Control | Security architecture mapping functional clearances to user roles. |
| RACI | Responsible, Accountable, Consulted, Informed | Matrix defining stakeholder notification and escalation rules. |
| DAPI | Document Application Programming Interface | Synchronization hub exchanging data payloads with third-party ERPs. |
| GRN | Goods Receipt Note | Warehouse physical gate entry verification confirming received merchandise. |
| SLA | Service Level Agreement | Maximum allowable time window for approvers to clear a document stage. |


# Chapter 18: Documentation Gaps & Unresolved Evidence

In accordance with strict technical writing standards, the following table explicitly catalogs features that are operational in backend code but have unverified UI visual states or lack direct screenshot evidence in the current release inventory:

| System Module | Current Documentation Status | Missing Evidence | Recommended Remediation |
| :--- | :--- | :--- | :--- |
| Payment Readiness View | Code verified in PaymentReadinessPage.tsx | Direct high-resolution screenshot pending | Capture production screenshot under financial settlement role. |
| Data Verification Queue | Code verified in DataVerificationPage.tsx | Direct high-resolution screenshot pending | Capture production screenshot under Clerk verification role. |
| SLA Escalation Alert Toast | Code verified in NotificationEngine.py | Visual capture of active toast alert pending | Trigger artificial SLA timeout during staging demo to snapshot alert. |
| Active ERP Webhook Ack | Code verified in callback_integrations.py | Production SAP/Oracle 200 OK receipt image pending | Capture network trace screenshot during live staging ERP sync. |

