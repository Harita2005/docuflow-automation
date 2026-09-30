# DOCUFLOW AUTOMATION SYSTEM — CONTROL & ADMINISTRATION MANUAL
**Document Version:** 2.4.0  
**Target Audience:** System Administrators, Control Team, IT Operations Leads, Compliance Officers  
**Classification:** System Control & Administrative End-User Guide  

---

## TABLE OF CONTENTS
1. [Introduction to System Administration](#1-introduction-to-system-administration)
2. [User Account Management](#2-user-account-management)
3. [Roles & Permissions Matrix](#3-roles--permissions-matrix)
4. [Workflow Flow Builder](#4-workflow-flow-builder)
5. [Business Routing Rules (Condition Builder)](#5-business-routing-rules-condition-builder)
6. [Checklist Builder (Universal Checklist Matrix)](#6-checklist-builder-universal-checklist-matrix)
7. [RACI & Notification Settings](#7-raci--notification-settings)
8. [Master Data Governance](#8-master-data-governance)
9. [Recycle Bin & Data Recovery](#9-recycle-bin--data-recovery)
10. [System Backups & Maintenance (Frontend View)](#10-system-backups--maintenance-frontend-view)
11. [Admin Troubleshooting & FAQs](#11-admin-troubleshooting--faqs)

---

## 1. INTRODUCTION TO SYSTEM ADMINISTRATION

The Control & Administration screens in DocuFlow provide authorized administrators with complete control over user access, approval workflows, routing rules, verification checklists, and audit governance.

### Purpose of This Manual
This manual explains how administrators and control team members interact with the administrative screens in DocuFlow.

> [!IMPORTANT]
> **Frontend Governance:** All administrative tasks described in this guide are performed through the DocuFlow graphical user interface. No technical system access or coding is required.

---

## 2. USER ACCOUNT MANAGEMENT

### 2.1 What is User Management?
User Management is the screen where administrators create new employee user accounts, edit employee profiles, assign operating roles, map departments, and activate or deactivate system access.

### 2.2 Who Uses It?
System Administrators and HR Control Officers.

### 2.3 User Creation Field Reference Table
| Field Name | Explanation | Example Value |
| :--- | :--- | :--- |
| **Full Name** | Employee's official first and last name | `Anish Sharma` |
| **Employee ID** | Corporate employee identification code | `EMP-04921` |
| **Email Address** | Corporate email address used for login and notifications | `anish.sharma@company.com` |
| **Assigned Role** | Primary role controlling user access level | `Accounts Approver`, `Manager` |
| **Division** | Primary business division assigned to the user | `VCC`, `ENES`, `ACM` |
| **Department** | Employee's organizational department | `Accounts Payable`, `Finance` |

### 2.4 How to Create a New User
#### Before You Start
Ensure you have the employee's correct corporate email, Employee ID, assigned department, and role requirements.

#### Steps
1. Navigate to **Control Settings** from the left navigation menu.
2. Select the **User Management** tab.
3. Click **Create User** (`+ Add New Employee`).
4. Enter the employee's **Full Name**, **Employee ID**, and **Email Address**.
5. Select the appropriate **Assigned Role** from the dropdown list.
6. Select the assigned **Division** and **Department**.
7. Review the entered information.
8. Click **Save User Account**.

#### What Happens Next?
The user account is created immediately. The employee can now sign in using their corporate email and access features according to their assigned role.

### 2.5 Deactivating or Enabling a User Account
1. Open **User Management**.
2. Locate the employee using the search bar.
3. Toggle the **Account Status** switch (`Active / Inactive`).
4. Confirm the prompt. Deactivated users are immediately prevented from logging into DocuFlow.

### 2.6 Button Reference Table
| Button | What It Does |
| :--- | :--- |
| **Create User** | Opens the new employee setup modal |
| **Save User Account** | Saves the user details and activates account creation |
| **Edit Profile** | Opens existing user details for modifications |
| **Status Toggle Switch** | Instantly toggles access between Active and Deactivated states |

---

## 3. ROLES & PERMISSIONS MATRIX

### 3.1 What is the Roles & Permissions Matrix?
The Roles & Permissions screen allows administrators to define user roles and set feature permissions for each role.

### 3.2 Key System Permissions
| Permission Name | What It Controls in the Interface |
| :--- | :--- |
| **Dashboard** | Grants access to view the main dashboard and workload KPI cards |
| **Work Tracker** | Grants access to view assigned pending document queues and execute stage approvals |
| **Upload Document** | Grants access to upload single/batch invoice files and run automated OCR extraction |
| **Customer Feedback** | Grants access to the Customer Feedback Hub, complaint tickets, and evidence viewer |
| **Approved Documents** | Grants access to search historical settled invoices and download signed PDFs |
| **Workflow Rules** | Grants access to the Workflow Flow Builder, Condition Builder, and Checklist Matrix |
| **Control Settings / Admin** | Grants access to User Management, Role Matrix, RACI settings, and Backup history |

### 3.3 Permission Action Types
For each permission, administrators can enable specific action capabilities:
- **View:** User can view the screen and records.
- **Create:** User can upload or create new records.
- **Edit:** User can edit editable fields and configuration data.
- **Delete:** User can remove or archive records.
- **Approve:** User can execute workflow approvals and stage sign-offs.
- **Export:** User can download files, reports, and signed documents.

### 3.4 Step-by-Step: How to Configure Role Access
1. Open **Control Settings** -> **Access Control & Roles**.
2. Select the role you wish to configure (e.g., `Accounts Approver`).
3. In the permission matrix grid, toggle the switches (`View`, `Create`, `Edit`, `Approve`) for each module row.
4. Click **Save Permission Matrix**.

> [!WARNING]
> Restrict **Control Settings / Admin** permission exclusively to authorized system administrators.

---

## 4. WORKFLOW FLOW BUILDER

### 4.1 What is the Workflow Flow Builder?
The Flow Builder allows administrators to design multi-stage approval paths defining which roles or users must approve a document step-by-step.

### 4.2 Flow Builder Field Table
| Field Name | Explanation | Example Value |
| :--- | :--- | :--- |
| **Profile Name** | Name of the workflow approval path | `Capex Approval > 5 Lakhs` |
| **Category** | Expense classification linked to this workflow | `Capex Expense`, `Standard AP` |
| **Stage Name** | Title of the specific approval step | `Stage 1: AP Verification`, `Stage 2: Finance Manager` |
| **Assigned Role / User** | Role profile or user pool responsible for this stage | `Finance Manager` |
| **Target SLA (Hours)** | Expected maximum duration for stage sign-off | `24 Hours`, `48 Hours` |

### 4.3 Step-by-Step: How to Create a Workflow Profile
1. Navigate to **Workflow & Rules** from the left menu.
2. Select the **Flow Builder** tab.
3. Click **Create New Workflow Profile**.
4. Enter the **Profile Name** and select the target **Category**.
5. Click **+ Add Stage**:
   - Enter **Stage Name** (e.g., `Stage 1 Review`).
   - Select **Assigned Role** (e.g., `AP Executive`).
   - Enter **Target SLA Hours** (e.g., `24`).
6. Click **+ Add Stage** to add additional sequential approval levels as needed.
7. Review stage order and click **Save & Publish Profile**.

### 4.4 Button Reference Table
| Button | What It Does |
| :--- | :--- |
| **Create New Profile** | Starts a new workflow profile builder canvas |
| **+ Add Stage** | Inserts a new sequential approval stage |
| **Reorder Stages** | Shifts stage order up or down in the sequence |
| **Save & Publish** | Activates the workflow profile for incoming documents |

---

## 5. BUSINESS ROUTING RULES (CONDITION BUILDER)

### 5.1 What is the Condition Builder?
The Condition Builder automatically routes incoming documents to specific Workflow Profiles based on invoice attributes such as Invoice Amount, Division, or Expense Category.

### 5.2 Routing Rule Field Reference
| Field Name | Explanation | Selection Options |
| :--- | :--- | :--- |
| **Rule Name** | Name identifying the routing rule | `High-Value Invoices Rule` |
| **Field Selection** | Invoice property evaluated by the rule | `Gross Amount`, `Division`, `Category` |
| **Condition Operator** | Comparison logic applied | `Greater Than`, `Equals`, `Less Than` |
| **Threshold Value** | Value compared against the invoice field | `500000` |
| **Target Workflow Profile** | Workflow profile assigned if rule conditions match | `Executive Approval Profile` |

### 5.3 Step-by-Step: How to Create a Business Routing Rule
1. Open **Workflow & Rules** -> **Condition Builder** tab.
2. Click **Add Routing Rule**.
3. Type a descriptive **Rule Name**.
4. Set the condition:
   - Select **Field** (e.g., `Gross Amount`).
   - Select **Operator** (e.g., `Greater Than`).
   - Enter **Threshold Value** (e.g., `500000`).
5. Select the **Target Workflow Profile** (e.g., `High Value Profile`).
6. Click **Save & Publish Rule**.

---

## 6. CHECKLIST BUILDER (UNIVERSAL CHECKLIST MATRIX)

### 6.1 What is the Checklist Builder?
The Checklist Builder allows administrators to configure mandatory verification items that approvers must check off before they can sign off on a document stage.

### 6.2 Step-by-Step: How to Add Mandatory Checklist Items
1. Open **Workflow & Rules** -> **Checklist Matrix**.
2. Click **+ Add Checklist Rule**.
3. Select **Division**, **Expense Category**, and **Target Workflow Stage**.
4. Type the **Checklist Item Title** (e.g., *"Verify GSTIN Tax Registration"*).
5. Toggle the **Mandatory** switch to **ON**.
6. Click **Save Checklist Item**.

---

## 7. RACI & NOTIFICATION SETTINGS

### 7.1 Understanding RACI Roles in DocuFlow
- **Responsible (R):** The active user assigned to complete the current stage approval.
- **Accountable (A):** The manager responsible for overall department clearance.
- **Consulted (C):** Specialists or reviewers notified during Hold or Clarification requests.
- **Informed (I):** Users who receive automated email or dashboard alerts upon stage completion.

### 7.2 How to Configure Event Notifications
1. Open **Control Settings** -> **RACI & Notifications**.
2. Select the event trigger (e.g., `Document Placed On Hold`, `Overdue SLA Warning`).
3. Select recipient roles for email and in-app alerts.
4. Click **Save Notification Matrix**.

---

## 8. MASTER DATA GOVERNANCE

### 8.1 Master Data Screens
DocuFlow provides screens to manage foundational enterprise reference data:
- **Vendor Master:** View and search approved supplier records and tax numbers.
- **Purchase Orders (PO Master):** View active PO numbers and linked line items.
- **GL Accounts:** General Ledger cost codes for invoice categorization.
- **Cost Centers & Divisions:** Enterprise division structure mappings.

### 8.2 How to Update Master Data Records
1. Open **Control Settings** -> **Master Data Management**.
2. Select the tab for **Vendors**, **Purchase Orders**, or **GL Accounts**.
3. Use the search bar to locate an item or click **Add New Record**.
4. Update the record details and click **Save Changes**.

---

## 9. RECYCLE BIN & DATA RECOVERY

### 9.1 What is the Recycle Bin?
The Recycle Bin holds deleted documents, archived rules, or deactivated templates, preventing accidental loss.

### 9.2 How to Restore a Deleted Item
1. Open **Control Settings** -> **Recycle Bin**.
2. Locate the deleted item in the list.
3. Click **Restore Item**. The item is restored to its original active location.

> [!CAUTION]
> **Permanent Deletion:** Clicking **Permanently Delete** removes the item permanently and cannot be undone.

---

## 10. SYSTEM BACKUPS & MAINTENANCE (FRONTEND VIEW)

### 10.1 Monitoring Backup Status
Administrators can check the system backup status directly from the interface:
1. Open **Control Settings** -> **System Backups**.
2. View the **Backup History Log** displaying recent backup timestamp, size, and status (`Success`, `In Progress`, `Failed`).
3. Click **Start Manual Backup** (if available) to generate an immediate configuration backup.

---

## 11. ADMIN TROUBLESHOOTING & FAQS

| Issue | Possible Cause | Recommended Action |
| :--- | :--- | :--- |
| **New user cannot log in** | Account status set to Inactive or password typed incorrectly | Check User Management to ensure account status is Active. |
| **User cannot access page** | Role permissions do not include page access | Open Role Clearance Matrix and toggle View permission for the role. |
| **Document routed to wrong workflow** | Routing rule threshold or division condition is misconfigured | Open Condition Builder and verify the rule field, operator, and threshold value. |
| **Approver cannot click Approve button** | Mandatory checklist item added in Checklist Builder is unchecked | Instruct approver to check all mandatory verification boxes. |
| **Overdue SLA alerts not firing** | Stage SLA hours set to 0 or notification rule disabled | Open Flow Builder to set target SLA hours and check RACI notification settings. |
