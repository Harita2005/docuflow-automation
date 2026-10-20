# Page and Feature Inventory — DocuFlow Automation
**Document ID:** DASS-RES-02  
**Verification Level:** Verified in Live Running Application and Codebase  

---

## Page 1: Secure Login & Multi-Factor Authentication

| Attribute | Specification |
|---|---|
| **Page Name** | User Login & Authentication Screen |
| **Frontend Route** | `/` (Unauthenticated Viewport) |
| **Purpose** | Authenticates users securely into their workspace using their username or employee ID and multi-factor verification (OTP). |
| **Permitted Roles** | Public access for all registered staff. |
| **Navigation Path** | Default landing page when no active session exists or upon logging out. |
| **Visible Elements** | Organization logo, greeting banner ("Welcome back to FlowApprove"), Username / Employee ID text field, "Continue" button, "Single Sign-On (Microsoft)" button, OTP Verification Dialog, "Auto Fill" demo button (in development mode), "Verify & Enter Workspace" button. |
| **Inputs** | - Username / Email / Employee ID (Required)<br>- OTP Code (6-digit numeric, Required during step 2) |
| **Validation Rules** | - Empty username triggers: "Please enter your username or employee ID."<br>- Invalid username triggers: "User not found or account inactive."<br>- Incorrect OTP triggers: "Invalid or expired OTP. Please check your email or request a new code."<br>- Rate limiting: 15 login attempts per minute per IP address. |
| **Action & Result** | Submitting valid credentials issues a cryptographically signed JWT token stored in browser `localStorage`, initializes active user permissions, and directs the user to their designated landing page. |
| **Success Feedback** | "Login successful! Entering workspace..." and transition to Dashboard or Work Tracker. |
| **Backend API Reference** | `POST /api/auth/login`, `POST /api/auth/mfa/send-otp`, `POST /api/auth/mfa/verify` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 2: Operational Dashboard

| Attribute | Specification |
|---|---|
| **Page Name** | Executive & Operational Dashboard |
| **Frontend Route** | View state: `dashboard` (`/`) |
| **Purpose** | Provides at-a-glance summary cards of all document activities, financial totals, and immediate quick-links to filtered task lists. |
| **Permitted Roles** | `admin`, `manager`, `accounts_approver`, `employee`, `settings_editor`. |
| **Navigation Path** | Top item in the Left Sidebar ("Dashboard") or FlowApprove logo. |
| **Visible Elements** | - **Metric Cards:** Total Documents, Pending Approvals, Pending Verification, Ready for Payment, Fully Approved, Rejected Records, Total Spend (₹ INR).<br>- **Interactive Action:** Clicking on any count card navigates immediately to the Work Tracker filtered to that exact status.<br>- **Search Bar:** Global search input by vendor, invoice number, or document key.<br>- **Document Type Filter Bar:** Quick filter buttons (All, AP Invoice, Capex, Purchase Invoice, Cash Voucher, Customer Feedback).<br>- **Recent Invoices Table:** Columns: Document ID, Vendor Name, Document Type, Gross Amount (₹), Status Badge, Current Stage, Last Updated, Actions ("View Details" button). |
| **Inputs** | - Search query string (Optional)<br>- Document Type filter selection (Optional) |
| **Validation Rules** | If no matching documents exist, displays: "No matching documents found in this view." |
| **Action & Result** | Clicking "View Details" on any table row transitions the workspace to the full Document Details view (`/review/{id}`). |
| **Success Feedback** | Real-time metric card counter animations and instant client-side table filtering. |
| **Backend API Reference** | `GET /api/dashboard/stats`, `GET /api/documents` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 3: Work Tracker (Core Operational Queue)

| Attribute | Specification |
|---|---|
| **Page Name** | Work Tracker & Task Allocation Hub |
| **Frontend Route** | View state: `work-tracker` |
| **Purpose** | The everyday work engine where reviewers, managers, and approvers track, filter, and act on documents assigned to their stage. |
| **Permitted Roles** | All authenticated roles (`admin`, `manager`, `accounts_approver`, `employee`). |
| **Navigation Path** | Left Sidebar: "Work Tracker" (Layers Icon). |
| **Visible Elements** | - **Status Tab Bar:** All (count), Pending Review (count), Stage 1 (Initial Review), Stage 2 (Manager Review), Stage 3 (Accounts Settlement), Approved, On Hold, Rejected.<br>- **Filter Controls:** Division dropdown (HQ, VCC, ACC, PRM), Document Type dropdown, Date Range picker, Assignee filter.<br>- **Main Table Columns:** Checkbox (for bulk selection), Document ID, Document Type, Vendor / Account Name, Invoice Amount, Submission Date, Current Stage Display Name, Assigned Approver Badge, SLA Status (Green/Amber/Red countdown), Action Button ("Review & Act"). |
| **Inputs** | Filter selections (Division, Doc Type, Status tabs). |
| **Validation Rules** | Only documents matching the selected filters are displayed. If non-admin user is logged in, division isolation restricts documents to their assigned division. |
| **Action & Result** | Clicking "Review & Act" opens the full split-screen inspection interface for that document. |
| **Success Feedback** | Interactive row highlight; immediate table updates upon stage progression. |
| **Backend API Reference** | `GET /api/documents/work-tracker` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 4: Document Details & Interactive Approval Interface

| Attribute | Specification |
|---|---|
| **Page Name** | Document Review, OCR Inspection & Action Panel |
| **Frontend Route** | View state: `details` (`/review/{invoice_id}`) |
| **Purpose** | In-depth verification of extracted invoice data against the uploaded PDF original, checklist sign-off, and one-click approval/rejection. |
| **Permitted Roles** | All authenticated roles with assigned review or viewing permissions. |
| **Navigation Path** | Click "View Details" / "Review & Act" from Dashboard, Work Tracker, or Approved Documents. |
| **Visible Elements** | - **Left Pane (PDF Viewer):** Interactive document preview with Zoom In, Zoom Out, Rotate, Download, and Fullscreen controls.<br>- **Right Pane (Extracted Metadata Form):** Header with Status Badge, Current Stage, and Assigned Approver.<br>- **Editable Metadata Fields:** Vendor Name, Invoice Number, Invoice Date, Total Gross Amount, Tax Amount, PO Number, Division, Currency.<br>- **Compliance Checklist Section:** List of mandatory check items with checkboxes.<br>- **More-Info Drawer Toggle:** "Customize Visible Fields" button.<br>- **Action Buttons Toolbar:**<br>  * `Approve` (Green button with check icon)<br>  * `Reject` (Red button with cross icon)<br>  * `Put on Hold` (Amber button with pause icon)<br>  * `Send Back` (Gray button with arrow icon)<br>- **Audit Trail Timeline:** Collapsible audit log at bottom showing timestamped events, who reviewed what, and prior stage comments. |
| **Inputs** | - Checklist item checkboxes (Mandatory before approval if configured).<br>- Rejection reason / comments (Mandatory on rejection).<br>- Hold reason (Mandatory on hold). |
| **Validation Rules** | - Clicking Approve without checking all mandatory checklist items displays: *"Please complete all required checklist items before approving."*<br>- Clicking Reject without entering a comment displays: *"Please provide a rejection reason."*<br>- Optimistic Lock Conflict: If another manager approved the document in another session, displays: *"Conflict (409): Document was modified by another approver. Please refresh."* |
| **Action & Result** | - `Approve`: Advances document to the next stage in the workflow (or marks "Approved" if at final stage).<br>- `Reject`: Marks document as "Rejected" and halts workflow.<br>- `Put on Hold`: Pauses SLA timers and marks status as "On Hold".<br>- `Send Back`: Returns document to the prior stage reviewer. |
| **Success Feedback** | Floating toast notification: *"Document CMP-00000172 successfully approved for Stage 2"* and returns to Work Tracker. |
| **Backend API Reference** | `GET /api/invoices/{id}`, `POST /api/invoices/{id}/approve`, `POST /api/invoices/{id}/reject`, `POST /api/invoices/{id}/hold`, `POST /api/invoices/{id}/step-action` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 5: Customer Feedback & Complaint Management

| Attribute | Specification |
|---|---|
| **Page Name** | Customer Feedback & Service Complaint Portal |
| **Frontend Route** | View state: `customer-feedback` (`/customer-feedback/{id}`) |
| **Purpose** | Specialized handling of customer complaints, store service feedback, dealer issues, and product quality surveys. |
| **Permitted Roles** | `admin`, `manager`, `employee`, `customer_feedback_agent`. |
| **Navigation Path** | Left Sidebar: "Customer Feedback" (Message Square Icon). |
| **Visible Elements** | - Customer Feedback Queue Table (Complaint ID, Account Name, Dealer Name, Subtype of Complaint, Rating, Created At).<br>- Detailed Inspection Modal: Displays customer rating (1 to 5 stars), survey date, dealer contact, feedback type, and attached product defect photographs (Image 1 through 5).<br>- Resolution actions: Resolve Complaint, Escalate to Area Manager, Close Ticket. |
| **Inputs** | Corrective action notes, resolution status dropdown. |
| **Validation Rules** | Requires valid resolution comments before closing complaint. |
| **Action & Result** | Updates complaint record in `documents` table and dispatches customer satisfaction event. |
| **Success Feedback** | "Feedback ticket marked as Resolved." |
| **Backend API Reference** | `GET /api/documents?type=CUSTOMER%20FEEDBACK`, `PUT /api/documents/{id}` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 6: Approved Documents Repository

| Attribute | Specification |
|---|---|
| **Page Name** | Approved Documents Archive |
| **Frontend Route** | View state: `approved-documents` |
| **Purpose** | Historical audit catalog of all successfully processed and finalized documents. |
| **Permitted Roles** | `admin`, `manager`, `accounts_approver`, `employee`. |
| **Navigation Path** | Left Sidebar: "Approved Docs" (Check Circle Icon). |
| **Visible Elements** | - Search Bar and Filter Bar (by Division, Document Type, Date).<br>- Archive Table: Document Key, Vendor Name, Total Amount, Approved By, Final Stage Completion Date, ERP Sync Status Badge ("Synced to SAP" / "Pending Sync").<br>- Action Buttons: "View Audit Log", "Download Signed PDF", "Export CSV". |
| **Inputs** | Filter parameters. |
| **Validation Rules** | Read-only archive view. No modification allowed on approved records. |
| **Action & Result** | "Download Signed PDF" downloads the stamped, finalized PDF copy with approval signatures. |
| **Success Feedback** | Instant file download and filter response. |
| **Backend API Reference** | `GET /api/invoices/approved`, `GET /api/integrations/v1/approved-documents` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 7: Document Upload & AI OCR Ingestion

| Attribute | Specification |
|---|---|
| **Page Name** | Document Upload & Intelligent Ingestion |
| **Frontend Route** | View state: `upload` |
| **Purpose** | Allows users to upload digital PDF invoices or scans and automatically extract metadata using OCR and AI. |
| **Permitted Roles** | `admin`, `ap_executive`, `settings_editor` (or users with `upload` permission). |
| **Navigation Path** | Left Sidebar: "Upload Document" (Upload Cloud Icon). |
| **Visible Elements** | - Drag-and-drop file upload zone (Supports PDF, TIFF, PNG, JPG up to 10 MB).<br>- Document Type selector dropdown (AP Invoice, Capex, Purchase Invoice, Utility & Rent, etc.).<br>- Division selector dropdown (HQ, VCC, ACC, PRM).<br>- "Auto-Route using Workflow Rules" checkbox toggle.<br>- "Process & Extract Details" button.<br>- Live Extraction Preview table: Extracted Vendor, Extracted Amount, Extracted Date, Confidence Score.<br>- "Confirm & Submit to Queue" button. |
| **Inputs** | - Upload File (Required, valid PDF/image format).<br>- Document Type (Required).<br>- Division (Required). |
| **Validation Rules** | - File size $> 10\text{ MB}$ rejected: *"File size exceeds 10MB limit."*<br>- Dangerous file extensions (`.exe`, `.bat`, `.sh`) rejected by magic number security validation.<br>- Empty file rejected: *"Uploaded file is empty."* |
| **Action & Result** | Uploads file to backend, executes neural OCR, parses key-value pairs, creates record in `documents` table, evaluates routing rules, and assigns initial stage approver. |
| **Success Feedback** | Toast: *"Document INV-2026-001 successfully ingested and routed to Stage 1 Review."* |
| **Backend API Reference** | `POST /api/documents/upload`, `POST /api/documents/auto-workflow` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 8: Workflow Rules & Flow Builder

| Attribute | Specification |
|---|---|
| **Page Name** | Workflow Configuration & Rule Studio |
| **Frontend Route** | View state: `workflow-rules` |
| **Purpose** | Visual designer for creating, editing, and managing multi-stage approval workflows, approval policies, and routing logic. |
| **Permitted Roles** | `admin`, `settings_editor`. |
| **Navigation Path** | Left Sidebar: "Workflow & Rules" (Git Fork Icon). |
| **Visible Elements** | - **Tab Bar:** Flow Builder, Condition Builder, Checklist Rules, Policy Matrix.<br>- **Flow Builder Canvas:** Visual interactive flowchart canvas powered by ReactFlow. Nodes represent approval stages (e.g. Stage 1: Department Reviewer $\rightarrow$ Stage 2: Plant Manager $\rightarrow$ Stage 3: CFO). Edges represent approval paths.<br>- **Node Configuration Drawer:** Click node to edit Step Name, Stage Number, Assigned Approver Role or specific user email, and Fallback Approver.<br>- **Condition Builder Tab:** Rules table defining conditional criteria (e.g. `If amount > 50000 AND division == 'VCC' THEN route to 'High Value Capex Flow'`).<br>- **Checklist Rules Tab:** Table configuring mandatory checklist questions required for each document type.<br>- **Action Buttons:** "Add Stage Node", "Validate Workflow", "Save Changes", "Simulate Rule". |
| **Inputs** | Workflow Profile Name, Node details, Stage numbers, Approver usernames. |
| **Validation Rules** | - Saving workflow with an empty approver target is blocked: *"Workflow save blocked: Each stage must specify a valid approver role or user."*<br>- Disconnected or circular workflow paths trigger validation warning. |
| **Action & Result** | Persists workflow structure into `workflow_step_definitions` and `business_rules` in SQL Server. |
| **Success Feedback** | "Workflow profile 'Default AP Invoice Flow' saved successfully." |
| **Backend API Reference** | `GET /api/workflows`, `POST /api/admin/workflows/save`, `GET /api/conditions`, `POST /api/admin/conditions/save`, `POST /api/admin/rules/simulate` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 9: Control Settings & Administration Console

| Attribute | Specification |
|---|---|
| **Page Name** | Control Settings & Administrator Console |
| **Frontend Route** | View state: `admin` |
| **Purpose** | Comprehensive system management, user administration, security controls, database maintenance, and audit reporting. |
| **Permitted Roles** | `admin` only. |
| **Navigation Path** | Left Sidebar: "Control Settings" (Gear Icon). |
| **Visible Elements** | - **Navigation Tabs:**<br>  1. `Users`: Full user directory table (ID, Username, Email, Role, Division, Active Status, Account Lock Status, Unlock Button, Edit Role Modal, Create User Button).<br>  2. `Roles & RBAC`: Granular permission matrix granting or revoking Read/Write/Admin access for each role across each page.<br>  3. `Master Data`: ERP reference tables (Vendors, Purchase Orders, Cost Centers).<br>  4. `RACI Matrix`: Organizational governance matrix.<br>  5. `Backups & Maintenance`: Database backup triggers and history.<br>  6. `In-App Alerts`: System notification broadcast editor.<br>  7. `Recycle Bin`: Soft-deleted records recovery.<br>  8. `System Health`: Server diagnostics, database connectivity, and telemetry. |
| **Inputs** | New user details (Username, Email, Role, Division), permission checkboxes. |
| **Validation Rules** | - Duplicate email or username rejected: *"User with this email already exists."*<br>- Self-lockout prevention: Admin cannot disable or delete their own active account. |
| **Action & Result** | Modifies users, roles, and system parameters in database. |
| **Success Feedback** | Immediate UI notification: *"User created successfully"* or *"Role permissions updated"*. |
| **Backend API Reference** | `GET /api/admin/users`, `POST /api/admin/users`, `GET /api/admin/roles`, `PUT /api/admin/roles/{id}/permissions`, `POST /api/admin/backup/trigger` |
| **Implementation Status** | **Fully Implemented** |

---

## Page 10: Integration Studio (DapiSyncBack Hub)

| Attribute | Specification |
|---|---|
| **Page Name** | Enterprise Integration & Callback Hub |
| **Frontend Route** | View state: `dapi-sync-back` (or `integrations`, `applications`, `callback-rules`) |
| **Purpose** | Connects DocuFlow with external ERP systems (SAP, Tally, Dynamics, Ramraj ERP) and configures automated outbound synchronization upon document approvals. |
| **Permitted Roles** | `admin`, `settings_editor`. |
| **Navigation Path** | Left Sidebar: "Integrations" (Network Cable Icon). |
| **Visible Elements** | - **Applications Tab:** Registered external client applications, API keys, webhook URLs, and active/inactive toggles.<br>- **Callback Rules Tab:** Event triggers (e.g. On Document Fully Approved $\rightarrow$ POST JSON payload to SAP endpoint).<br>- **Integration Logs Tab:** Outbound transmission history (Event ID, Document ID, Target ERP, Status Code: 200/500, Retry Count, "Retry Push" button).<br>- **Field Mapping Tab:** Visual schema mapper connecting DocuFlow fields (e.g. `invoice_number`) to ERP fields (e.g. `VBELN`). |
| **Inputs** | ERP System Code, System Name, Endpoint URL, API Secret Key, Mapping rules. |
| **Validation Rules** | SSRF Validator blocks private local IP ranges (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`) for outbound webhook targets to protect corporate networks. |
| **Action & Result** | Transmits signed payloads upon approval; records success or failure in `integration_sync_logs`. |
| **Success Feedback** | "Webhook test successfully transmitted (Status: 200 OK)." |
| **Backend API Reference** | `GET /api/integrations/v2/applications`, `POST /api/integrations/v2/applications`, `GET /api/integrations/v2/logs`, `POST /api/integrations/v2/logs/{id}/retry` |
| **Implementation Status** | **Fully Implemented** |
