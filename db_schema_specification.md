# Detailed Database Schema & Workflow Specification

This document provides a highly detailed and clear specification of the entire **DocuFlow Automation** database schema and the complete step-by-step lifecycle of an **AP Invoice**—from ingestion to local archival.

---

## 1. Document Lifecycle & Approval Pipeline

```mermaid
graph TD
    %% Ingestion & Pre-processing Phase
    Start([Document Received: Email / Upload]) --> OCR[1. OCR processing & Text Extraction]
    OCR --> LLM[2. LLM Document Type & Field Identification]
    
    %% Verification Desk
    LLM --> Verify[3. Data Verification Desk: AP Executive checks metadata]
    Verify --> Gate[4. Gate Entry Desk: Verify Goods Receipt / GRN Match]
    
    %% Routing Engine Decision Point
    Gate --> PO_Check{5. Is PO in Table?}
    
    %% Path A: PO Invoices (Yes)
    PO_Check -- Yes --> Route_PO[Route to 'PO Invoice Workflow']
    Route_PO --> S1_PO[Stage 1: [INDENTER] Approval]
    S1_PO --> S2_PO[Stage 2: [PO_OWNER] Approval]
    S2_PO --> S3_PO[Stage 3: [DEPT_HEAD] Approval]
    S3_PO --> Archive[6. Local Server Archival & ERP Sync]
    
    %% Path B: Non-PO Invoices / Unmatched POs (No / Empty)
    PO_Check -- No / Empty --> Route_NonPO[Route to 'Non-PO Standard Workflow']
    Route_NonPO --> S1_NPO[Stage 1: Cost Center Manager Approval]
    S1_NPO --> S2_NPO[Stage 2: Head of Finance Approval]
    S2_NPO --> Archive

    %% Black and White Styling
    style Start fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style OCR fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style LLM fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Verify fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Gate fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style PO_Check fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Route_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S1_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S2_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S3_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Route_NonPO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S1_NPO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S2_NPO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Archive fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
```

---

## 2. Complete Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o{ Invoice : "uploads"
    Invoice ||--|| GoodsReceipt : "matches"
    Invoice ||--|| WorkflowInstance : "executes"
    Invoice ||--|| ActiveApprovalLog : "has active stage"
    Invoice ||--o{ SystemLog : "logs events"
    Invoice ||--o{ DocumentComment : "has comments"
    Invoice ||--o{ Notification : "triggers"
    Invoice ||--o{ CorrectionLog : "tracks human corrections"
    Invoice ||--|| ProcessingQueue : "enqueued in"

    WorkflowInstance ||--o{ Approval : "records"
    WorkflowProfile ||--o{ WorkflowStepDefinition : "defines steps"
    NotificationRule ||--o{ NotificationRecipient : "targets"
    NotificationRule }|--|| EmailTemplate : "uses"

    User {
        String id PK
        String username UNIQUE
        String employee_id UNIQUE
        String email UNIQUE
        String password_hash
        String role
        String name
        String division
        String department
        String permissions
        DateTime created_at
    }

    Invoice {
        String id PK
        String invoice_number
        String vendor_name
        String invoice_date
        String po_number
        Float amount
        String currency
        String base_currency
        Float base_amount
        Float price_variance
        Boolean is_price_variance
        String erp_sync_status
        String status
        Boolean is_exception
        String exception_reason
        String document_type
        String tracking_id UNIQUE
        String uploaded_by_id FK
        DateTime created_at
        String file_name
        Int file_size
        String mime_type
        String file_path
        String file_hash
        Float ocr_confidence
        String ocr_text
        String tax_details
        String ocr_layout
        String custom_data
        Float cgst
        Float sgst
        Float igst
        String items
    }

    GoodsReceipt {
        String id PK
        String invoice_id FK,UNIQUE
        String status
        String confirmed_by
        DateTime confirmed_at
        String remarks
        Int box_count
        Int quantity_received
    }

    WorkflowInstance {
        String id PK
        String invoice_id FK,UNIQUE
        String workflow_id
        String current_stage
        String status
        String state_json
    }

    ActiveApprovalLog {
        String id PK
        String invoice_id FK,UNIQUE
        String workflow_profile
        Int current_stage_number
        String status
        DateTime last_updated
    }

    CorporateAppMock {
        String po_number PK
        String po_owner_email
        String indenter_email
        String dept_head_email
    }
```

---

## 3. Table-by-Table Data Dictionary

### 3.1 User / Employee Table (`User`)
Stores account information, roles, and organizational departments for all employees.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier for the user. |
| `username` | String | UNIQUE | Unique username used for local credential login. |
| `employee_id` | String | UNIQUE | Corporate employee ID (e.g. `EMP-1003`). |
| `email` | String | UNIQUE | Email address (used for notifications and logins). |
| `password_hash` | String | | Bcrypt hash of the user password. |
| `role` | String | | System role (e.g., `admin`, `ap_executive`, `manager`, `employee`). |
| `name` | String | | Display name of the employee (e.g., `Vijay Kumar`). |
| `division` | String (Nullable) | | Corporate division. |
| `department` | String (Nullable) | | Department name (e.g. `Finance`). |
| `permissions` | String (JSON) | | List of granted system permissions. |
| `created_at` | DateTime | | Account creation timestamp. |

---

### 3.2 Invoice Table (`Invoice`)
Contains all extracted metadata, files, OCR data, and matching statuses for AP invoices.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique invoice ID. |
| `invoice_number` | String | | Vendor invoice number. |
| `vendor_name` | String | | Extracted name of the supplier/vendor. |
| `invoice_date` | String | | Extracted date of invoice. |
| `po_number` | String | | PO number associated with the invoice. |
| `amount` | Float | | Total invoice amount. |
| `currency` | String | | Invoice currency. |
| `base_currency` | String | | Local currency (default `INR`). |
| `base_amount` | Float (Nullable) | | Amount converted to local base currency. |
| `price_variance` | Float (Nullable) | | Detected price variance against PO details. |
| `is_price_variance`| Boolean | | Flag indicating if variance exceeds limits. |
| `erp_sync_status` | String | | Status of export to ERP (`Pending`, `Synced`, `Failed`). |
| `status` | String | | Main status (`Data Verification Pending`, `Approved`, etc.). |
| `is_exception` | Boolean | | Flag indicating if manual exception handling is active. |
| `exception_reason` | String (Nullable) | | Reason for the exception. |
| `document_type` | String | | Detected type (e.g., `AP Invoice`, `AP Debit Note`). |
| `tracking_id` | String | UNIQUE | Internal document sequence ID. |
| `uploaded_by_id` | String | FK | Links to `User.id` (uploader). |
| `created_at` | DateTime | | Record creation timestamp. |
| `file_name` | String | | Uploaded filename. |
| `file_size` | Int | | File size in bytes. |
| `mime_type` | String | | File mime type (e.g. `application/pdf`). |
| `file_path` | String | | Path to the file stored on the local server disk. |
| `file_hash` | String (Nullable) | | SHA-256 hash of the file (prevents duplicate uploads). |
| `ocr_confidence` | Float | | Confidence score from OCR engine. |
| `ocr_text` | String (NVarChar Max) | | Raw OCR text output. |
| `tax_details` | String (NVarChar Max) | | Extracted Tax details. |
| `ocr_layout` | String (Nullable) | | Extracted layout geometry coordinates. |
| `custom_data` | String (Nullable) | | Custom user meta. |
| `cgst` | Float (Nullable) | | Central Goods and Services Tax value. |
| `sgst` | Float (Nullable) | | State Goods and Services Tax value. |
| `igst` | Float (Nullable) | | Integrated Goods and Services Tax value. |
| `items` | String (JSON Array) | | Parsed line-item breakdown (table structure). |

---

### 3.3 PO Details Table (`CorporateAppMock`)
Simulates the corporate master table of Purchase Orders (POs) and contains the key approval stakeholders.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `po_number` | String | PK | Unique PO identifier. |
| `po_owner_email` | String (Nullable) | | Email of the PO owner (approver token: `[PO_OWNER]`). |
| `indenter_email` | String (Nullable) | | Email of the indenter/requester (approver token: `[INDENTER]`). |
| `dept_head_email` | String (Nullable) | | Email of the department head (approver token: `[DEPT_HEAD]`). |

---

### 3.4 Goods Receipt / GRN Table (`GoodsReceipt`)
Holds physical gate validation and delivery verification details.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier. |
| `invoice_id` | String | FK, UNIQUE | Links to `Invoice.id`. |
| `status` | String | | Gate entry validation status (e.g. `Verified`). |
| `confirmed_by` | String | | User ID who completed gate verification. |
| `confirmed_at` | DateTime (Nullable)| | Timestamp of Gate entry confirmation. |
| `remarks` | String | | Delivery comments. |
| `box_count` | Int (Nullable) | | Extracted physical box count. |
| `quantity_received`| Int (Nullable) | | Total count of validated parts. |

---

### 3.5 Active Approval Log (`ActiveApprovalLog`)
Tracks the current workflow stage details for an invoice running in the linear engine.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique record ID. |
| `invoice_id` | String | FK, UNIQUE | Links to `Invoice.id`. |
| `workflow_profile` | String | | Code profile name (e.g. `AP Invoice - Workflow 1`). |
| `current_stage_number`| Int | | Current workflow stage (e.g., `1`, `2`, `3`). |
| `status` | String | | Stage status (`Pending`, `Approved`, etc.). |
| `last_updated` | DateTime | | Timestamp of last approval action. |

---

### 3.6 Workflow Step Definition (`WorkflowStepDefinition`)
Defines the concrete approval paths, assignments, and roles for each workflow profile.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique record ID. |
| `profile_name` | String | FK | Links to `WorkflowProfile.profile_name`. |
| `stage_number` | Int | | Index stage step order. |
| `approver_target` | String | | User ID / Role / Token (e.g. `[PO_OWNER]`, `vijay`). |
| `action_required` | String | | Required action (e.g. `Approve`, `Sign`). |
| `permissions` | String | | Allowed actions (e.g. `Approve Only`). |
| `document_type` | String | | Target document type (e.g., `AP INVOICE`). |
| `step_name` | String (Nullable) | | Descriptive step title (e.g., `PO Raiser Approval`). |
| `role` | String (Nullable) | | Target approver role (e.g. `Employee`). |
| `approver_type` | String (Nullable) | | Rule structure type (e.g. `Specific Employee`). |
| `delegate_approver`| String (Nullable) | | Backup user username. |
| `escalation_rule` | String (Nullable) | | Path to take if SLA is breached (e.g. `Route to Delegate`). |
| `target_division` | String (Nullable) | | Division filter. |
| `target_department`| String (Nullable) | | Department filter. |

---

### 3.7 RACI Matrix (`RACIMatrix`)
Holds configuration profiles mapping stakeholders for system events.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique record ID. |
| `workflow_profile` | String | UNIQUE (Combo) | Target workflow name. |
| `event_name` | String | UNIQUE (Combo) | Triggering event (e.g. `Approve`). |
| `responsible_emails`| String (JSON Array)| | Emails of Responsible team members. |
| `accountable_emails`| String (JSON Array)| | Emails of Accountable managers. |
| `consulted_emails` | String (JSON Array)| | Emails of Consulted stakeholders. |
| `informed_emails` | String (JSON Array)| | Emails of Informed team members. |
| `title_template` | String (Nullable) | | Custom notification title template. |
| `message_template` | String (Nullable) | | Custom notification body template. |

---

### 3.8 System Logs (`SystemLog`)
Audit trail logs mapping events against invoices.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique record ID. |
| `invoice_id` | String (Nullable) | FK | Links to `Invoice.id`. |
| `timestamp` | DateTime | | Event occurrence time. |
| `action` | String | | Description of action (e.g., `Approved`). |
| `user` | String | | Username who initiated the event (or `System`). |
| `details` | String (NVarChar Max) | | Verbose logs metadata. |

---

### 3.9 Notifications (`Notification`)
Holds notifications displayed inside the dashboard interface.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `notification_id` | String (UUID) | PK | Unique record ID. |
| `document_id` | String | FK | Links to `Invoice.id`. |
| `recipient_user_id`| String (Nullable) | | User ID of the recipient. |
| `recipient_email` | String | | Email address. |
| `notification_type`| String | | Event type (e.g., `PENDING_APPROVAL`, `REJECTED`). |
| `title` | String | | Notification header. |
| `message` | String | | Notification details body text. |
| `status` | String | | Notification dispatch status (`Pending`, `Sent`). |
| `is_read` | Boolean | | Read indicator state. |
| `sent_at` | DateTime (Nullable)| | Actual send time. |
| `created_at` | DateTime | | Record creation timestamp. |
| `retry_count` | Int | | Counter for dispatch retries. |
| `external_response`| String (Nullable) | | Gateway response. |
