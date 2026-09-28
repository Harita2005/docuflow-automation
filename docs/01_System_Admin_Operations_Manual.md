# DOCUFLOW AUTOMATION SYSTEM — SYSTEM & ADMIN OPERATIONS MANUAL
**Document Version:** 2.4.0  
**Target Audience:** System Administrators, IT Governance, Operations Leads, System Auditors  
**Classification:** Enterprise Operational Documentation  

---

## TABLE OF CONTENTS
1. [Introduction & Architectural Overview](#1-introduction--architectural-overview)
2. [Login and Authentication](#2-login-and-authentication)
3. [Dashboard & Analytical Counters](#3-dashboard--analytical-counters)
4. [Navigation & Sidebar Reference](#4-navigation--sidebar-reference)
5. [Document Management & Repository](#5-document-management--repository)
6. [Document Upload & Automated Extraction](#6-document-upload--automated-extraction)
7. [Document Inspection & Field Verification](#7-document-inspection--field-verification)
8. [Work Tracker & Assigned Workflows](#8-work-tracker--assigned-workflows)
9. [Stage Approval & Clearance Procedures](#9-stage-approval--clearance-procedures)
10. [Workflow Flow Builder](#10-workflow-flow-builder)
11. [Routing Condition Builder](#11-routing-condition-builder)
12. [Universal Checklist Management](#12-universal-checklist-management)
13. [Department & Division Governance](#13-department--division-governance)
14. [User Account Management](#14-user-account-management)
15. [Role Management & Access Control](#15-role-management--access-control)
16. [Permission Management Catalogue](#16-permission-management-catalogue)
17. [Role-Permission-User Architecture](#17-role-permission-user-architecture)
18. [Customer Feedback Governance](#18-customer-feedback-governance)
19. [Error Handling & Troubleshooting Guide](#19-error-handling--troubleshooting-guide)
20. [End-to-End Administrator Journey](#20-end-to-end-administrator-journey)

---

## 1. INTRODUCTION & ARCHITECTURAL OVERVIEW

### 1.1 What is DocuFlow?
DocuFlow is an enterprise-grade Document Approval & Automation System (DAAS). It orchestrates supplier invoice intake, automated OCR extraction, multi-stage approval routing, universal checklist verification, customer feedback resolution, and cryptographic audit logging.

### 1.2 Purpose & Business Goals
- **Automated Intake & Extraction:** Convert raw PDF/Image invoices into structured data (Gross Amount, Base Amount, 18% GST splits, PO Numbers).
- **Sequential Approval Enforcements:** Route documents through multi-stage approval pools with strict role/user assignment.
- **Role-Based Access Control (RBAC):** Enforce strict page-level and action-level clearances across operations, feedback, and admin settings.
- **Audit Compliance:** Maintain tamper-evident, cryptographically timestamped audit dockets for every approval, hold, rejection, or permission update.

### 1.3 Application Journey Overview
```
           +-------------------------------------------------------+
           |                     LOGIN PAGE                        |
           +-------------------------------------------------------+
                                       |
                                       v
           +-------------------------------------------------------+
           |                 MAIN SYSTEM DASHBOARD                 |
           +-------------------------------------------------------+
                                       |
    +------------------+---------------+------------------+------------------+
    |                  |                                  |                  |
    v                  v                                  v                  v
+-------+      +---------------+                  +---------------+  +---------------+
|UPLOAD |      | WORK TRACKER  |                  | CUSTOMER FB   |  | CONTROL SETTINGS|
|INTAKE |      | (MY PENDING)  |                  | (COMPLAINTS)  |  | (ADMIN & RBAC)  |
+-------+      +---------------+                  +---------------+  +---------------+
    |                  |                                  |                  |
    +--------+---------+                                  |                  |
             |                                            |                  |
             v                                            v                  v
+-------------------------------+                +------------------+ +------------------+
| DOCUMENT DETAILS & CHECKLIST  |                | INSPECT EVIDENCE | | BUILD FLOWS &    |
| APPROVE / HOLD / REJECT       |                | HANDOVER STAGE   | | PERMISSION MATRIX|
+-------------------------------+                +------------------+ +------------------+
             |                                            |                  |
             +--------------------+-----------------------+------------------+
                                  |
                                  v
           +-------------------------------------------------------+
           |           SETTLEMENT & SIGNED AUDIT TRAIL             |
           +-------------------------------------------------------+
```

---

## 2. LOGIN AND AUTHENTICATION

### 2.1 Purpose
Secure user verification and session token generation via OAuth2 Password Bearer / JWT protocol.

### 2.2 Fields & Credentials
- **Username / Email Address:** Standard corporate email (e.g. `admin@docuflow.com`, `approver@docuflow.com`).
- **Password:** User authentication secret.
- **Select Operating Role:** Optional fast-switch role selector for multi-role profiles.

### 2.3 Procedure & Validation
1. Open browser and navigate to `http://<server-ip>:5173`.
2. Enter email/username and password.
3. Click **Sign In to DocuFlow**.
4. **Validation:** System checks credentials against database (`users` table).
   - If invalid: Displays red alert banner *"Invalid username or password"*.
   - If inactive: Displays *"User account is deactivated. Contact system administrator."*
5. **Success:** Generates JWT bearer token, stores token in browser `localStorage`, and redirects user to `Dashboard` or `Work Tracker`.

### 2.4 Multi-Tab Synchronization & Kick-Out Protection
- **Single-Active Session:** DocuFlow enforces real-time Server-Sent Events (SSE) session monitoring. If the same account logs in from another browser or device, the existing active session receives a `SESSION_KICKED` notification and is logged out immediately with the message: *"Your session was terminated because your account was logged in from another device/browser."*

---

## 3. DASHBOARD & ANALYTICAL COUNTERS

### 3.1 Overview
The Dashboard provides real-time workload KPIs, category distribution charts, date filtering, and quick navigation shortcuts.

### 3.2 Key Counters & Widgets
| Widget Name | Field / Status | Data Displayed | Click Action |
| :--- | :--- | :--- | :--- |
| **TOTAL INGESTED** | All Documents | Total volume of ingested invoices | Clears filters to show all records |
| **PENDING APPROVAL** | `Pending Approval`, `In Progress` | Workload awaiting active stage sign-off | Filters list to active pending bills |
| **ON HOLD / PAUSED** | `On Hold`, `Paused` | Invoices paused for clarification | Filters list to documents on hold |
| **REJECTED** | `Rejected` | Invalid or rejected invoices | Filters list to rejected bills |
| **APPROVED & SETTLED** | `Approved`, `Settled` | Completed bills stamped with signatures | Opens Approved Documents View |

### 3.3 Date & Filter Controls
- **Date Presets:** `Today`, `This Week`, `This Month`, `All Time`, `Custom Date Range`.
- **Document Type Filter:** AP Invoice, Freight Invoice, Utility Bill, Capex Expense.

---

## 4. NAVIGATION & SIDEBAR REFERENCE

### 4.1 Overview
Navigation is dynamically controlled by the user's role permissions (`rolePermissions`). Unpermitted items are hidden.

| Menu Item | Required Permission | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `dashboard` | All Active Roles | Overview KPIs & analytics |
| **Work Tracker** | `work-tracker` | Approvers, Managers, Admin | Pending stage action queue |
| **Approved Docs** | `approved-documents` | All Active Roles | Historical archive of settled bills |
| **Upload Document** | `upload` | AP Executive, Admin | Single & batch PDF invoice intake |
| **Customer Feedback**| `customer-feedback` | Feedback Agent, Admin | Complaints & defect tickets hub |
| **Workflow & Rules** | `workflow-rules` | Admin, Settings Editor | Flow Builder, Condition Builder |
| **Control Settings** | `admin` | Admin, Settings Editor | RBAC, User Master, RACI, Backups |

---

## 5. DOCUMENT MANAGEMENT & REPOSITORY

### 5.1 Repository Controls
- **Global Search:** Instant text search across Supplier Name, Invoice Number, PO Reference, and Document ID.
- **Filters:** Filter by Division (VCC, ENES, ACM), Category, Status, and Date Range.
- **Row Inspection:** Click any row to open the complete **Document Inspection Drawer**.

---

## 6. DOCUMENT UPLOAD & AUTOMATED EXTRACTION

### 6.1 Upload Procedure
1. Navigate to **Upload Document** (`/upload`).
2. Select target **Division** (e.g. `VCC`, `ENES`).
3. Select **Expense Category** (e.g. `Standard AP Invoice`, `Freight Bill`).
4. Drag & drop PDF/image file or click **Browse Files**.
5. Click **Run Automated OCR Extraction**.
6. System parses:
   - Vendor Name
   - Invoice Number & Invoice Date
   - Gross Amount, Base Amount, and 18% GST split
   - PO Reference Number
7. Click **Submit & Queue Document** to launch workflow routing.

---

## 7. DOCUMENT INSPECTION & FIELD VERIFICATION

### 7.1 Field Structure & Verification
- **Supplier & Document Header:** Vendor Name, Invoice #, Invoice Date, Expense Category.
- **Financial Breakdown:** Gross Amount, Base Amount, CGST (9%), SGST (9%), IGST (18%).
- **Verification Checklist:** Stage-specific mandatory checkboxes (e.g., *"GSTIN Validated"*, *"PO Line Items Match"*).
- **Audit History Docket:** Chronological log of all prior approval actions, hold comments, and timestamps.

---

## 8. WORK TRACKER & ASSIGNED WORKFLOWS

### 8.1 Work Tracker Scoping
- **Non-Admin Users:** Displays ONLY documents assigned to the logged-in user at their current workflow stage.
- **Admin Users:** Displays overall enterprise work queues with search and filter capabilities.

---

## 9. STAGE APPROVAL & CLEARANCE PROCEDURES

### 9.1 Executing Actions
1. **APPROVE & PASS STAGE:**
   - Click `Approve & Pass Stage`.
   - Enter optional approval notes.
   - Click `Confirm Approval`. Ownership passes strictly to Stage 2 approver pool.
2. **HOLD / PAUSE WORKFLOW:**
   - Click `Hold / Pause`.
   - **Mandatory:** Enter hold reason/clarification details.
   - Document status updates to `On Hold`.
3. **REJECT INVOICE:**
   - Click `Reject Document`.
   - **Mandatory:** Enter rejection command notes.
   - Document moves to `Rejected` state.

---

## 10. WORKFLOW FLOW BUILDER

### 10.1 Purpose
Build multi-stage approval profiles defining sequential approval pools.

### 10.2 Procedure
1. Go to **Workflow & Rules** (`/workflow-rules`) -> **Flow Builder** tab.
2. Click **+ Create New Workflow Profile**.
3. Enter Profile Name (e.g. `Capex Approval Profile > 5L`).
4. Add Stages:
   - **Stage 1:** Assigned Role: `AP Executive` | SLA: 24 Hours
   - **Stage 2:** Assigned Role: `Finance Manager` | SLA: 48 Hours
   - **Stage 3:** Assigned User: `Executive Approver`
5. Click **Save Workflow Profile**.

---

## 11. ROUTING CONDITION BUILDER

### 11.1 Purpose
Route incoming invoices to target Workflow Profiles based on rules (Division, Category, Amount).

### 11.2 Procedure
1. Go to **Workflow & Rules** -> **Condition Builder** tab.
2. Click **+ Add Routing Rule**.
3. Select Field (e.g., `Gross Amount`), Operator (`Greater Than`), Value (`500000`).
4. Select Target Workflow Profile.
5. Click **Save & Publish Rule**.

---

## 12. UNIVERSAL CHECKLIST MANAGEMENT

### 12.1 Purpose
Define mandatory check items required before stage sign-off.

### 12.2 Procedure
1. Go to **Workflow & Rules** -> **Universal Checklist Matrix**.
2. Click **+ Add Checklist Rule**.
3. Map Division + Category + Stage Name.
4. Add items (e.g., *"Physical Goods Received"*, *"Tax Invoice Stamped"*).
5. Mark items as **Mandatory**. Click **Save Checklist**.

---

## 13. DEPARTMENT & DIVISION GOVERNANCE

### 13.1 Governance Structure
- Enterprise Divisions (`VCC`, `ENES`, `ACM`).
- Department mapping for document access boundaries.

---

## 14. USER ACCOUNT MANAGEMENT

### 14.1 Procedure
1. Go to **Control Settings** (`/admin`) -> **User Management** tab.
2. Click **+ Add New Employee**.
3. Enter Full Name, Email, Employee Code, Department, and Assigned Role.
4. Click **Create User**.
5. **Deactivate User:** Click status toggle switch to disable access instantly.

---

## 15. ROLE MANAGEMENT & ACCESS CONTROL

### 15.1 Procedure
1. Go to **Control Settings** -> **Access Control & RBAC** tab.
2. Click **+ Add System Permission**.
3. Enter Permission Name, Module Group, Subpage, Action Scope.
4. Click **Create Permission**.
5. **Role Clearance Matrix:** Toggle page switches (`View`, `Edit/Action`, `Admin`) for each role row.

---

## 16. PERMISSION MANAGEMENT CATALOGUE

### 16.1 System Permission Keys
- `dashboard`: View dashboard KPIs.
- `work-tracker`: View and process assigned work tracker items.
- `upload`: Ingest single/batch invoices.
- `customer-feedback`: Manage defect and complaint tickets.
- `approved-documents`: Access settled invoice archives.
- `workflow-rules`: Access Flow Builder & Condition Builder.
- `admin`: Access Control Settings & RBAC matrix.

---

## 17. ROLE-PERMISSION-USER ARCHITECTURE

```
+-------------------+       +-------------------+       +-----------------------+
|    USER MASTER    | ----> |    ROLE MASTER    | ----> | PERMISSION CATALOGUE  |
| (e.g. John Doe)   |       | (e.g. Manager)    |       | (e.g. work-tracker)   |
+-------------------+       +-------------------+       +-----------------------+
```

---

## 18. CUSTOMER FEEDBACK GOVERNANCE

### 18.1 Customer Feedback Hub
1. Navigate to **Customer Feedback** (`/customer-feedback`).
2. Inspect complaint tickets, evidence photos, dealer details, and SLA countdowns.
3. Click **Approve / Pass Stage** to hand over complaint to Stage 2 resolution manager with assigned designation.

---

## 19. ERROR HANDLING & TROUBLESHOOTING GUIDE

| Error Scenario | Root Cause | Resolution Step |
| :--- | :--- | :--- |
| **Invalid Credentials** | Incorrect password or unregistered email | Verify email spelling or reset password |
| **Session Terminated** | Account logged in from another device | Re-login; ensure single-active session |
| **403 Forbidden Page** | Role lacks required page permission | Request administrator to update Role Clearance Matrix |
| **Checklist Incomplete** | Mandatory checklist item not checked | Check all required verification items before sign-off |
| **Mandatory Comment Required**| Hold/Reject clicked without notes | Enter explicit clarification/rejection remarks in comment box |

---

## 20. END-TO-END ADMINISTRATOR JOURNEY

```
1. Login with Admin Credentials
   ↓
2. Review Dashboard Analytical Counters
   ↓
3. Navigate to Control Settings -> RBAC Matrix
   ↓
4. Configure Role Clearances & Add New Employee
   ↓
5. Open Workflow & Rules -> Design Flow Builder Profile
   ↓
6. Link Condition Builder Routing Rules
   ↓
7. Inspect Audit Trail Logs for Compliance
   ↓
8. Secure Logout
```
