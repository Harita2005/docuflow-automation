# Detailed Database Schema & Workflow Specification

This document provides a comprehensive specification of the **DocuFlow Automation** database schema and the complete step-by-step lifecycle of all supported documents—from ingestion to local archival.

---

## 1. Document Lifecycle & Approval Pipeline

DocuFlow Automation ingests various document types and uses a dynamic Rules Engine to classify them, verify their metadata, and route them through defined approval workflows.

### 1.1 Supported Document Types
The system is built to ingest and process the following document categories:
* **AP Invoice** (Standard accounts payable invoices)
* **AP Debit Note** (Supplier return or price adjustment notes)
* **Non-Returnable** (Gate passes or non-billable movement logs)
* **Journal Entry** (General ledger records)
* **VCC Purchase Invoice** (Virtual credit card related invoices)
* **AR Credit Note** (Accounts receivable credit records)
* **Project Budget** (Capital expenditure or operational budget sheets)
* **OCR and Inhouse OCR** (Generic scanned documents requiring raw OCR processing)

### 1.2 Step-by-Step Processing Flow

```mermaid
graph TD
    %% Ingestion & Pre-processing Phase
    Start([Document Received: Email / Upload]) --> OCR[1. OCR Processing & Text Extraction]
    OCR --> LLM[2. AI Document Type & Field Identification]
    
    %% Verification Desk
    LLM --> Verify[3. Data Verification Desk: AP Executive checks metadata]
    
    %% Routing Engine Decision Point
    Verify --> PO_Check{4. Is PO Number Valid & Matched?}
    
    %% Path A: Dynamic PO Routing
    PO_Check -- Yes --> Route_PO[Route via Dynamic PO Workflow]
    Route_PO --> S1_PO[Stage 1: [PO_OWNER] Review]
    S1_PO --> S2_PO[Stage 2: [INDENTER] Approval (If Present)]
    S2_PO --> S3_PO[Stage 3: [DEPT_HEAD] Approval]
    S3_PO --> Archive[5. Local Server Archival & ERP Sync]
    
    %% Path B: Rules Engine / Manual Fallback
    PO_Check -- No / Empty --> Rules_Check{5. Do Business Rules Match?}
    Rules_Check -- Yes --> Route_Rule[Route to Target Rule Workflow]
    Rules_Check -- No --> Manual_Route[Manual Workflow Assignment]
    
    Route_Rule --> Run_Wf[6. Execute Custom React Flow Workflow Steps]
    Manual_Route --> Run_Wf
    Run_Wf --> Archive

    %% Black and White Styling
    style Start fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style OCR fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style LLM fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Verify fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style PO_Check fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Route_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S1_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S2_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style S3_PO fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Rules_Check fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Route_Rule fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Manual_Route fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Run_Wf fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
    style Archive fill:#ffffff,stroke:#000000,stroke-width:1px,color:#000000
```

1. **Ingestion:** Documents are uploaded via the UI dashboard or fetched directly from configured email inboxes.
2. **OCR & Extraction:** The system performs raw text and geometry coordinate extraction on PDFs or images.
3. **AI Classification:** A local LLM parses the text to identify the document type (e.g. `AP INVOICE`, `AP DEBIT NOTE`) and populates structured fields.
4. **Verification Desk:** The AP Executive reviews the AI-extracted fields, making manual corrections if required.
5. **PO Routing Engine:**
   - If a valid PO is matched against the ERP system, the system bypasses standard business rules to generate a dynamic three-stage workflow mapping to the PO's stakeholders (`PO Owner Review`, `Indenter Approval`, and `Department Head Approval`).
   - If there is no PO (or no match), the system runs the document through the **Automated Business Rules Engine** to find matching routing conditions (e.g., `Amount > 10,000`).
   - If no business rule matches, the document remains in the verification queue waiting for manual workflow assignment.
6. **Workflow Execution:** Approvers perform actions (approve, reject, send back) based on the mapped workflow stages.
7. **ERP Sync & Archival:** The document data is synced to the external ERP, and the file is moved to local compliance archival.

---

## 2. Complete Entity Relationship Diagram (ERD)

The diagram below represents the complete physical database structure, demonstrating how all 28 tables are interconnected.

```mermaid
erDiagram
    User ||--o{ Invoice : "uploads (uploaded_by_id)"
    Invoice ||--o| GoodsReceipt : "has (invoice_id)"
    Invoice ||--o| WorkflowInstance : "executes (invoice_id)"
    Invoice ||--o| ActiveApprovalLog : "has active stage (invoice_id)"
    Invoice ||--o{ SystemLog : "logs events (invoice_id)"
    Invoice ||--o{ DocumentComment : "has comments (invoice_id)"
    Invoice ||--o{ Notification : "triggers (document_id)"
    Invoice ||--o{ CorrectionLog : "tracks corrections (invoice_id)"
    Invoice ||--o| ProcessingQueue : "enqueued in (invoice_id)"

    WorkflowInstance ||--o{ Approval : "records (workflow_instance_id)"
    WorkflowProfile ||--o{ WorkflowStepDefinition : "defines steps (profile_name)"
    
    NotificationRule ||--o{ NotificationRecipient : "targets (notification_rule_id)"
    NotificationRule }|--|| EmailTemplate : "uses (template_id)"

    %% Independent/Config Tables (No physical DB relationships, but logical ties)
    Workflow ||--o{ WorkflowInstance : "instantiates (workflow_id)"
    BusinessRule }|--|| Workflow : "routes to (target_workflow_id)"
    DocumentTemplate ||--|| BusinessRule : "shares type (document_type)"
    ERPMaster ||--|| CorporateAppMock : "references PO (po_number)"
    VendorMaster ||--|| Invoice : "validates vendor (vendor_name)"
    RACIMatrix ||--|| WorkflowProfile : "maps notifications (workflow_profile)"
    EmailProviderConfig ||--|| EmailLog : "delivers mail"
    SystemConfig ||--|| User : "governs dashboard"
    InAppNotificationConfig ||--|| Notification : "formats alerts"
    Sequence ||--|| Invoice : "generates track id"

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

    Workflow {
        String id PK
        String workflow_name
        String workflow_json
    }

    DocumentTemplate {
        String id PK
        String name UNIQUE
        String description
        String fields_json
        String category
        String document_type
        DateTime created_at
    }

    BusinessRule {
        String id PK
        String rule_name
        Int priority
        String conditions_json
        String target_workflow_id
        String document_type
        String rule_category
        DateTime created_at
    }

    WorkflowInstance {
        String id PK
        String invoice_id FK,UNIQUE
        String workflow_id
        String current_stage
        String status
        String state_json
    }

    Approval {
        String id PK
        String workflow_instance_id FK
        String approver
        String action
        String comments
        DateTime timestamp
    }

    SystemLog {
        String id PK
        String invoice_id FK
        DateTime timestamp
        String action
        String user
        String details
    }

    WorkflowProfile {
        String profile_name PK
        String workflow_code
        String workflow_category
        String workflow_type
        String description
        String status
        Int approval_threshold
        String rejection_handling
        Int reminder_interval_hours
        Int escalation_after_hours
        Boolean auto_escalation
    }

    WorkflowStepDefinition {
        String id PK
        String profile_name FK
        Int stage_number
        String approver_target
        String action_required
        String permissions
        String document_type
        String step_name
        String role
        String approver_type
        String delegate_approver
        String escalation_rule
        String target_division
        String target_department
    }

    ActiveApprovalLog {
        String id PK
        String invoice_id FK,UNIQUE
        String workflow_profile
        Int current_stage_number
        String status
        DateTime last_updated
    }

    ERPMaster {
        String po_number PK
        Float po_amount
        String po_currency
        Float tolerance_amount
        String division
        String department
        String category
        String cost_center
        String plant
        String vendor
        String requestor_email
    }

    VendorMaster {
        String id PK
        String vendor_code UNIQUE
        String vendor_name
        Boolean is_active
        DateTime created_at
    }

    DocumentComment {
        String id PK
        String invoice_id FK
        String user_email
        String user_name
        String text
        DateTime created_at
    }

    Notification {
        String notification_id PK
        String document_id FK
        String recipient_user_id
        String recipient_email
        String notification_type
        String title
        String message
        String status
        Boolean is_read
        DateTime sent_at
        DateTime created_at
        Int retry_count
        String external_response
    }

    CorporateAppMock {
        String po_number PK
        String po_owner_email
        String indenter_email
        String dept_head_email
    }

    EmailProviderConfig {
        String id PK
        String provider
        String smtp_server
        Int port
        String username
        String encrypted_password
        String sender_email
        String sender_name
        Boolean tls_enabled
        DateTime created_at
        DateTime updated_at
    }

    NotificationRule {
        String id PK
        String name
        String trigger_event
        String subject
        String template_id FK
        Boolean enabled
        Int delay_minutes
        String target_workflow
        DateTime created_at
        DateTime updated_at
    }

    NotificationRecipient {
        String id PK
        String notification_rule_id FK
        String recipient_type
        String recipient_source
        String value
        DateTime created_at
    }

    EmailTemplate {
        String id PK
        String template_name
        String html_body
        String text_body
        DateTime created_at
        DateTime updated_at
    }

    EmailLog {
        String id PK
        String notification_rule_id
        String event
        String sender
        String recipients
        String cc
        String bcc
        String subject
        String status
        String error_message
        DateTime sent_at
        DateTime created_at
    }

    CorrectionLog {
        String id PK
        String invoice_id FK
        String vendor_name
        String original_ai_prediction
        String human_corrected_data
        DateTime created_at
    }

    SystemConfig {
        String id PK
        String key UNIQUE
        String value
        String description
        DateTime updated_at
    }

    InAppNotificationConfig {
        String id PK
        String trigger_event UNIQUE
        Boolean enabled
        String title_template
        String message_template
        DateTime updated_at
    }

    ProcessingQueue {
        String id PK
        String invoice_id FK,UNIQUE
        String filename
        String status
        DateTime created_at
        DateTime updated_at
    }

    RACIMatrix {
        String id PK
        String workflow_profile
        String event_name
        String responsible_emails
        String accountable_emails
        String consulted_emails
        String informed_emails
        String title_template
        String message_template
        DateTime created_at
        DateTime updated_at
    }

    Sequence {
        String id PK
        String code UNIQUE
        Int current
    }
```

---

## 3. Table-by-Table Data Dictionary

### 3.1 `User`
Stores account profiles, roles, and structural departments for all internal employees.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier for the user. |
| `username` | String (Nullable) | UNIQUE | Unique username used for credential login. |
| `employee_id` | String (Nullable) | UNIQUE | Corporate employee ID (e.g. `EMP-1003`). |
| `email` | String | UNIQUE | Primary email address. |
| `password_hash` | String | | Bcrypt hash of the user's password. |
| `role` | String | | System role (e.g., `admin`, `ap_executive`, `manager`, `employee`). |
| `name` | String | | Full name of the employee. |
| `division` | String (Nullable) | | Corporate division. |
| `department` | String (Nullable) | | Corporate department name. |
| `permissions` | String (JSON Array) | | List of granted system permissions. Defaults to `[]`. |
| `created_at` | DateTime | | Account creation timestamp. Defaults to `now()`. |

---

### 3.2 `Invoice`
The primary table holding extracted metadata, execution state, and OCR outputs for all documents.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique document identifier. |
| `invoice_number` | String | | Vendor invoice number. |
| `vendor_name` | String | | Extracted name of the supplier/vendor. |
| `invoice_date` | String | | Date of the invoice. |
| `po_number` | String | | Associated Purchase Order number. |
| `amount` | Float | | Total document amount. |
| `currency` | String | | Document currency. |
| `base_currency` | String | | Local currency. Defaults to `INR`. |
| `base_amount` | Float (Nullable) | | Amount converted to local base currency. |
| `price_variance` | Float (Nullable) | | Price variance calculated against PO. |
| `is_price_variance`| Boolean | | Variance indicator. Defaults to `false`. |
| `erp_sync_status` | String | | Sync status (`Pending`, `Synced`, `Failed`). Defaults to `Pending`. |
| `status` | String | | Main execution status (e.g. `Received`, `In Approval`, `Approved`). |
| `is_exception` | Boolean | | Indicates manual handling. Defaults to `false`. |
| `exception_reason` | String (Nullable) | | Description of exception. |
| `document_type` | String | | Document category. Defaults to `Invoice`. |
| `tracking_id` | String (Nullable) | UNIQUE | Sequence tracking ID. |
| `uploaded_by_id` | String (Nullable) | FK | Links to `User.id` (uploader). |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |
| `file_name` | String | | Uploaded file name. |
| `file_size` | Int | | File size in bytes. |
| `mime_type` | String | | File mime type (e.g., `application/pdf`). |
| `file_path` | String | | Storage path on disk. |
| `file_hash` | String (Nullable) | | SHA-256 hash to prevent duplicate uploads. |
| `ocr_confidence` | Float | | Score from OCR parser. |
| `ocr_text` | String (Text) | | Raw extracted text content. |
| `tax_details` | String (Text) | | Parsed tax line metadata. |
| `ocr_layout` | String (Nullable) | | OCR coordinate mapping. |
| `custom_data` | String (Nullable) | | Extended custom attributes. |
| `cgst` | Float (Nullable) | | Central GST tax. |
| `sgst` | Float (Nullable) | | State GST tax. |
| `igst` | Float (Nullable) | | Integrated GST tax. |
| `items` | String (JSON Array) | | Parsed line-item details. |

---

### 3.3 `GoodsReceipt`
Stores physical delivery verification matching logs for documents.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique GRN entry identifier. |
| `invoice_id` | String | FK, UNIQUE | Links to `Invoice.id`. |
| `status` | String | | Verification status (e.g. `Verified`). |
| `confirmed_by` | String | | User identifier who validated goods receipt. |
| `confirmed_at` | DateTime (Nullable)| | Timestamp of confirmation. |
| `remarks` | String | | Comments or inspection notes. |
| `box_count` | Int (Nullable) | | Extracted box count. |
| `quantity_received`| Int (Nullable) | | Total parts quantity validated. |

---

### 3.4 `Workflow`
Stores raw workflow builder (React Flow) structure layouts.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier. |
| `workflow_name` | String | | Display name of the workflow. |
| `workflow_json` | String (Text) | | Serialized nodes and edges React Flow configuration. |

---

### 3.5 `DocumentTemplate`
Holds dynamic classification schema structures used by the OCR and AI extraction modules.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique template identifier. |
| `name` | String | UNIQUE | Name of the template (e.g., `AP DEBIT NOTE`). |
| `description` | String | | Brief description. |
| `fields_json` | String (Text) | | Field schema definitions for extraction. |
| `category` | String | | Profile category. Defaults to `Vendor Payment Workflows`. |
| `document_type` | String | | Target class type. Defaults to `AP Invoice`. |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |

---

### 3.6 `BusinessRule`
Configures priority-ranked routing conditions evaluated during classification.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique rule identifier. |
| `rule_name` | String | | Description of the rule. |
| `priority` | Int | | Priority rank (lowest numbers evaluate first). |
| `conditions_json` | String (Text) | | Serialized query logic structure (e.g., field operators). |
| `target_workflow_id`| String | | Target workflow profile/name mapped if matched. |
| `document_type` | String | | Target document type constraint. Defaults to `Invoice`. |
| `rule_category` | String | | Category division. Defaults to `Vendor Payment Workflows`. |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |

---

### 3.7 `WorkflowInstance`
Tracks active approval workflows running on a document.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique execution instance identifier. |
| `invoice_id` | String | FK, UNIQUE | Links to `Invoice.id`. |
| `workflow_id` | String (Nullable) | | Links to target workflow template. |
| `current_stage` | String | | Active workflow node identifier or label. |
| `status` | String | | Execution state (`In Progress`, `Completed`, `Aborted`). |
| `state_json` | String (Nullable) | | Serialized workflow state variable cache. |

---

### 3.8 `Approval`
Detailed log records tracking individual user decisions inside active workflows.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique approval action log ID. |
| `workflow_instance_id`| String | FK | Links to `WorkflowInstance.id`. |
| `approver` | String | | User email or target role performing decision. |
| `action` | String | | Action taken (`Approve`, `Reject`, `Send Back`). |
| `comments` | String | | Comments submitted by reviewer. |
| `timestamp` | DateTime | | Action completion time. Defaults to `now()`. |

---

### 3.9 `SystemLog`
Central audit logs recording infrastructure and system actions.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique log entry identifier. |
| `invoice_id` | String (Nullable) | FK | Links to `Invoice.id`. |
| `timestamp` | DateTime | | Log entry timestamp. Defaults to `now()`. |
| `action` | String | | Title of the event (e.g., `User Login`, `Auto-Routed`). |
| `user` | String | | Actor who initiated the event (e.g., `admin`, `System`). |
| `details` | String (Text) | | Verbose logs or diagnostic data. |

---

### 3.10 `WorkflowProfile`
Contains metadata and default configurations for linear workflow definitions.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `profile_name` | String | PK | Unique profile identifier (e.g., `AP Invoice - Workflow 1`). |
| `workflow_code` | String (Nullable) | | Code identifier. |
| `workflow_category` | String (Nullable) | | Profile category. Defaults to `Vendor Payment Workflows`. |
| `workflow_type` | String (Nullable) | | Operational workflow type. |
| `description` | String (Nullable) | | Description of the profile. |
| `status` | String | | Status (`Active`, `Inactive`). Defaults to `Active`. |
| `approval_threshold` | Int | | Value threshold for triggering. Defaults to `100`. |
| `rejection_handling`| String | | Defines behavior (`Return to Previous Step`, `Reject`). |
| `reminder_interval_hours`| Int | | SLA hourly interval to trigger alerts. Defaults to `24`. |
| `escalation_after_hours`| Int | | Escalation deadline threshold. Defaults to `72`. |
| `auto_escalation` | Boolean | | Enable automatic SLA escalation. Defaults to `true`. |

---

### 3.11 `WorkflowStepDefinition`
Configures structural linear stages bound to a `WorkflowProfile`.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique step identifier. |
| `profile_name` | String | FK | Links to `WorkflowProfile.profile_name`. |
| `stage_number` | Int | | Order number index (e.g., 1, 2, 3). |
| `approver_target` | String | | Target assignee identifier (e.g. `[PO_OWNER]`, `manager`). |
| `action_required` | String | | Required action. Defaults to `Approve`. |
| `permissions` | String | | Action permission limits. Defaults to `Approve Only`. |
| `document_type` | String | | Restricting document type. Defaults to `Invoice`. |
| `step_name` | String (Nullable) | | Display title. |
| `role` | String (Nullable) | | Associated target role. |
| `approver_type` | String (Nullable) | | Structure type rules (e.g., `Specific User`, `Token`). |
| `delegate_approver`| String (Nullable) | | Username of backup reviewer. |
| `escalation_rule` | String (Nullable) | | Escalation action behavior (e.g., `Route to Delegate`). |
| `target_division` | String (Nullable) | | Target division filtering constraint. |
| `target_department`| String (Nullable) | | Target department filtering constraint. |

---

### 3.12 `ActiveApprovalLog`
Caches the active processing step details for quick dashboard routing checks.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique tracker ID. |
| `invoice_id` | String | FK, UNIQUE | Links to `Invoice.id`. |
| `workflow_profile` | String | | Name of the active workflow profile. |
| `current_stage_number`| Int | | Active stage order number. Defaults to `1`. |
| `status` | String | | Active stage processing state. Defaults to `Pending`. |
| `last_updated` | DateTime | | Timestamp of last activity. Defaults to `now()`. |

---

### 3.13 `ERPMaster`
Simulates the external ERP database record structure of corporate POs.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `po_number` | String | PK | Unique corporate Purchase Order number. |
| `po_amount` | Float | | Target PO budget. Defaults to `0`. |
| `po_currency` | String | | Associated currency. Defaults to `INR`. |
| `tolerance_amount` | Float | | Deviation tolerance margin. Defaults to `500.0`. |
| `division` | String (Nullable) | | Requesting division. |
| `department` | String (Nullable) | | Requesting department. |
| `category` | String (Nullable) | | Material category. |
| `cost_center` | String (Nullable) | | Mapped financial Cost Center. |
| `plant` | String (Nullable) | | Operating plant/factory unit. |
| `vendor` | String (Nullable) | | Supplier vendor code or name. |
| `requestor_email` | String (Nullable) | | Requestor employee email address. |

---

### 3.14 `VendorMaster`
Stores validated corporate supplier vendor codes and names.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier. |
| `vendor_code` | String | UNIQUE | Supplier vendor unique reference code. |
| `vendor_name` | String | | Vendor company registration name. |
| `is_active` | Boolean | | Activity indicator. Defaults to `true`. |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |

---

### 3.15 `DocumentComment`
Allows users to append persistent textual notes against documents.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique comment identifier. |
| `invoice_id` | String | FK | Links to `Invoice.id`. |
| `user_email` | String | | Reviewer email who added the comment. |
| `user_name` | String (Nullable) | | Reviewer name. |
| `text` | String | | Comment contents. |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |

---

### 3.16 `Notification`
Holds pending and sent user alerts displayed in-app or via email.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `notification_id` | String (UUID) | PK | Unique notification identifier. |
| `document_id` | String | FK | Links to `Invoice.id`. |
| `recipient_user_id`| String (Nullable) | | Recipient user identifier. |
| `recipient_email` | String | | Target email address. |
| `notification_type`| String | | Event category (`PENDING_APPROVAL`, `ASSIGNED`, `REJECTED`, `SENT_BACK`, `COMPLETED`, `CLARIFICATION`). |
| `title` | String | | Alert header title. |
| `message` | String | | Main notification body. |
| `status` | String | | Dispatch state (`Pending`, `Sent`, `Failed`). Defaults to `Pending`. |
| `is_read` | Boolean | | Mapped read status. Defaults to `false`. |
| `sent_at` | DateTime (Nullable)| | Timestamp when sent successfully. |
| `created_at` | DateTime | | Record creation timestamp. Defaults to `now()`. |
| `retry_count` | Int | | Counter for dispatch retries. Defaults to `0`. |
| `external_response`| String (Nullable) | | Gateway response log. |

---

### 3.17 `CorporateAppMock`
Mock table simulating corporate directory mapping PO stakeholders.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `po_number` | String | PK | Unique Purchase Order number. |
| `po_owner_email` | String (Nullable) | | Mapped Owner email (`[PO_OWNER]`). |
| `indenter_email` | String (Nullable) | | Mapped Indenter email (`[INDENTER]`). |
| `dept_head_email` | String (Nullable) | | Mapped Dept Head email (`[DEPT_HEAD]`). |

---

### 3.18 `EmailProviderConfig`
Stores external SMTP server configurations for sending emails.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier. |
| `provider` | String | | Email server platform name. Defaults to `Microsoft 365`. |
| `smtp_server` | String | | SMTP host endpoint. Defaults to `smtp.office365.com`. |
| `port` | Int | | SMTP port number. Defaults to `587`. |
| `username` | String (Nullable) | | Authenticated credentials username. |
| `encrypted_password`| String (Nullable)| | Encrypted SMTP password. |
| `sender_email` | String (Nullable) | | E-mail address visible to recipients. |
| `sender_name` | String (Nullable) | | Display name visible to recipients. |
| `tls_enabled` | Boolean | | Secure connection enabled flag. Defaults to `true`. |
| `created_at` | DateTime | | Configuration creation timestamp. Defaults to `now()`. |
| `updated_at` | DateTime | | Timestamp of last modification. |

---

### 3.19 `NotificationRule`
Stores trigger rules linking workflow events to specific email dispatches.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique rule identifier. |
| `name` | String | | Trigger rule name. |
| `trigger_event` | String | | Triggering system event code. |
| `subject` | String | | Default email subject line. |
| `template_id` | String (Nullable) | FK | Links to associated `EmailTemplate.id`. |
| `enabled` | Boolean | | Status flag. Defaults to `true`. |
| `delay_minutes` | Int | | Delays trigger actions. Defaults to `0`. |
| `target_workflow` | String (Nullable) | | Specific workflow scope. |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |
| `updated_at` | DateTime | | Update timestamp. |

---

### 3.20 `NotificationRecipient`
Specifies recipient definitions attached to a `NotificationRule`.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique recipient identifier. |
| `notification_rule_id`| String | FK | Links to `NotificationRule.id`. |
| `recipient_type` | String | | Delivery field types (`TO`, `CC`, `BCC`). |
| `recipient_source` | String | | Source types (`Dynamic`, `Role`, `Custom`). |
| `value` | String | | Email address value or target role code. |
| `created_at` | DateTime | | Timestamp. Defaults to `now()`. |

---

### 3.21 `EmailTemplate`
Html and plain-text body template contents for customized system emails.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique template identifier. |
| `template_name` | String | | Identifier name. |
| `html_body` | String (Text) | | HTML formatting structure markup. |
| `text_body` | String (Text) | | Raw text layout markup. |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |
| `updated_at` | DateTime | | Modification timestamp. |

---

### 3.22 `EmailLog`
Audited record of all dispatched email events.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique log identifier. |
| `notification_rule_id`| String (Nullable)| | Associated notification rule. |
| `event` | String | | Event category code. |
| `sender` | String | | Dispatch sender email. |
| `recipients` | String (Text) | | Comma-separated list of target TO emails. |
| `cc` | String (Nullable) | | Comma-separated list of CC emails. |
| `bcc` | String (Nullable) | | Comma-separated list of BCC emails. |
| `subject` | String | | E-mail subject. |
| `status` | String | | Status outcome (`Sent`, `Failed`). |
| `error_message` | String (Nullable) | | Mapped SMTP failure message. |
| `sent_at` | DateTime (Nullable)| | Timestamp when dispatched. |
| `created_at` | DateTime | | Record creation timestamp. Defaults to `now()`. |

---

### 3.23 `CorrectionLog`
Saves manual revisions made at the verification desk for AI training feedback.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique correction log ID. |
| `invoice_id` | String | FK | Links to `Invoice.id`. |
| `vendor_name` | String | | Vendor name during correction. |
| `original_ai_prediction`| String (Text)| | JSON dump of initial AI prediction payload. |
| `human_corrected_data`| String (Text)| | JSON dump of manually corrected payload. |
| `created_at` | DateTime | | Timestamp. Defaults to `now()`. |

---

### 3.24 `SystemConfig`
Key-value configuration store for system configurations.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier. |
| `key` | String | UNIQUE | Global key (e.g. `retention_days`). |
| `value` | String | | Mapped configuration value string. |
| `description` | String (Nullable) | | Brief description. |
| `updated_at` | DateTime | | Timestamp. Defaults to `now()` / updates on modification. |

---

### 3.25 `InAppNotificationConfig`
Configures custom text overlays for visual in-app popups.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique configuration identifier. |
| `trigger_event` | String | UNIQUE | Event trigger key (e.g., `STEP_APPROVED`). |
| `enabled` | Boolean | | Mapped status flag. Defaults to `true`. |
| `title_template` | String | | Handlebars-style custom title template. |
| `message_template` | String | | Handlebars-style custom message body template. |
| `updated_at` | DateTime | | Last updated timestamp. |

---

### 3.26 `ProcessingQueue`
Queue log governing parallel asynchronous OCR file processing.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique queue item identifier. |
| `invoice_id` | String | FK, UNIQUE | Links to `Invoice.id`. |
| `filename` | String | | Processing filename. |
| `status` | String | | Processing state (`Pending`, `Processing`, `Completed`, `Failed`). Defaults to `Pending`. |
| `created_at` | DateTime | | Queue insertion time. Defaults to `now()`. |
| `updated_at` | DateTime | | Update timestamp. |

---

### 3.27 `RACIMatrix`
Specifies Responsible, Accountable, Consulted, and Informed emails for events.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique matrix item identifier. |
| `workflow_profile` | String | UNIQUE* | Mapped workflow profile name. |
| `event_name` | String | UNIQUE* | Mapped event code (e.g. `Approve`, `Reject`). |
| `responsible_emails`| String (JSON Array)| | Mapped responsible emails. |
| `accountable_emails`| String (JSON Array)| | Mapped accountable emails. |
| `consulted_emails` | String (JSON Array)| | Mapped consulted emails. |
| `informed_emails` | String (JSON Array)| | Mapped informed emails. |
| `title_template` | String (Nullable) | | Custom notification subject template. |
| `message_template` | String (Nullable) | | Custom notification description body template. |
| `created_at` | DateTime | | Creation timestamp. Defaults to `now()`. |
| `updated_at` | DateTime | | Update timestamp. |

*\* Note: The combination of `workflow_profile` and `event_name` forms a unique composite constraint.*

---

### 3.28 `Sequence`
Generates clean sequential numeric values for tracking ids.

| Field Name | Data Type | Key | Description |
| :--- | :--- | :---: | :--- |
| `id` | String (UUID) | PK | Unique identifier. |
| `code` | String | UNIQUE | Sequence category code (e.g., `TRACKING_NO`). |
| `current` | Int | | The last generated numeric value. Defaults to `0`. |
