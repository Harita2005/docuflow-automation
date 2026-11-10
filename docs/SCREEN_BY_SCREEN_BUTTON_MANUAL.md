# FlowApprove / DocuFlow Automation — Screen-by-Screen & Button-by-Button Operational Manual
**Application Version:** 2.1.0 (Production Hardened)  
**Document Purpose:** Exhaustive Visual & Functional Control Reference for All UI Screens  
**Target Audience:** End Users, Department Approvers, System Administrators, and Quality Assurance  

---

## Table of Contents
1. [Global Navigation & Header Controls](#1-global-navigation--header-controls)
2. [Screen 1: Login & Multi-Factor Authentication (MFA)](#2-screen-1-login--multi-factor-authentication-mfa)
3. [Screen 2: Executive Dashboard & Analytics](#3-screen-2-executive-dashboard--analytics)
4. [Screen 3: Document Upload & Ingestion Engine](#4-screen-3-document-upload--ingestion-engine)
5. [Screen 4: Work Tracker & Operations Queue](#5-screen-4-work-tracker--operations-queue)
6. [Screen 5: Document Verification & Split-Screen OCR Viewer](#6-screen-5-document-verification--split-screen-ocr-viewer)
7. [Screen 6: Dedicated Approval Queue](#7-screen-6-dedicated-approval-queue)
8. [Screen 7: Approved Documents & Historical Archive](#8-screen-7-approved-documents--historical-archive)
9. [Screen 8: Payment Readiness & Financial Staging](#9-screen-8-payment-readiness--financial-staging)
10. [Screen 9: Goods Receipt Note (GRN) & 3-Way Match](#10-screen-9-goods-receipt-note-grn--3-way-match)
11. [Screen 10: Customer Feedback & Sentiment Resolution](#11-screen-10-customer-feedback--sentiment-resolution)
12. [Screen 11: Visual Flow Builder (Workflow Studio)](#12-screen-11-visual-flow-builder-workflow-studio)
13. [Screen 12: Condition Builder & Dynamic Routing Studio](#13-screen-12-condition-builder--dynamic-routing-studio)
14. [Screen 13: Enterprise Audit Logs Explorer](#14-screen-13-enterprise-audit-logs-explorer)
15. [Screen 14: User Management & Division Scoping](#15-screen-14-user-management--division-scoping)
16. [Screen 15: Role-Based Access Control (RBAC) Matrix](#16-screen-15-role-based-access-control-rbac-matrix)
17. [Screen 16: DAPI Sync-Back & Integration Hub](#17-screen-16-dapi-sync-back--integration-hub)
18. [Screen 17: System Administration & Database Maintenance](#18-screen-17-system-administration--database-maintenance)

---

## 1. Global Navigation & Header Controls

The top navigation header and left-hand collapsible sidebar are persistent across all views after login.

### 1.1 Header Controls
| UI Control / Button | Visual Icon / Label | Location | Action Triggered | Expected System Response |
| :--- | :--- | :--- | :--- | :--- |
| **Sidebar Toggle** | Hamburger Icon (`☰`) | Top-Left | Collapses or expands sidebar | Toggles sidebar between icon-only rail and full text menu. |
| **Division Selector** | Dropdown (`All Divisions` / `Garments` / `Retail` / etc.) | Top-Center | Changes active operational scope | Filters all dashboard metrics and queues by the chosen enterprise division. |
| **Notification Bell** | Bell Icon (`🔔` with red count pill) | Top-Right | Opens in-app notifications drawer | Displays unread document assignment alerts, SLA breach warnings, and approval notices. |
| **Theme / Contrast** | Sun / Moon Icon | Top-Right | Toggles Dark / Light mode | Switches CSS variables for optimal readability and low-light environments. |
| **User Profile Menu** | Avatar / User Full Name | Top-Far-Right | Opens user dropdown menu | Shows User ID, Assigned Roles, Division, and Account Settings. |
| **Sign Out Button** | Logout Icon (`🚪 Sign Out`) | Inside Profile Menu | Terminates active session | Invalidates JWT token, clears local storage, and redirects to Login screen. |

### 1.2 Sidebar Menu Items
| Menu Item | Icon | Route / View | Permissions Required | Target Screen Description |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | LayoutDashboard | `/dashboard` | `view_dashboard` | High-level metrics, pending counts, SLA alerts. |
| **Upload Document** | UploadCloud | `/upload` | `upload_document` | Drag-and-drop ingestion interface for PDF invoices. |
| **Work Tracker** | Clock / ListCheck | `/tracker` | `view_work_tracker` | Comprehensive multi-stage document processing list. |
| **Approval Queue** | CheckSquare | `/approvals` | `approve_document` | Filtered list showing documents waiting for *your* signature. |
| **Approved Docs** | FileCheck | `/approved` | `view_approved_docs` | Read-only historical repository of finalized documents. |
| **Payment Readiness** | Banknote | `/payments` | `view_payments` | Invoices approved and ready for bank disbursement/ERP export. |
| **Goods Receipt (GRN)**| PackageCheck | `/grn` | `view_grn` | Gate entry, purchase order matching, delivery receipts. |
| **Customer Feedback** | MessageSquare | `/feedback` | `view_feedback` | Non-invoice document processing with sentiment extraction. |
| **Workflow Studio** | GitBranch | `/workflows` | `manage_workflows` | Visual ReactFlow canvas for designing approval stages. |
| **Audit Logs** | ShieldAlert | `/audit-logs` | `view_audit_logs` | Immutable audit trail of every click, edit, and login. |
| **Administration** | Settings / Users | `/admin` | `admin_access` | User provisioning, RBAC matrix, and system backups. |

---

## 2. Screen 1: Login & Multi-Factor Authentication (MFA)

**Component:** `LoginPage.tsx`  
**Purpose:** Authenticate users securely using either standard credentials, passwordless Employee ID OTP, or TOTP MFA.

### 2.1 UI Layout
- **Left Panel:** Cultural enterprise branding and security notice.
- **Center/Right Panel:** Dual-tab authentication card (`Password Login` vs. `Passwordless OTP`).

### 2.2 Button & Control Catalog
| Button / Input Field | Visual Label | Location | Purpose & Function | System Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Auth Mode Tabs** | `Standard Login` / `Passwordless OTP` | Top of Login Card | Switches login method | Shows either Username/Password inputs or Employee ID / Email input. |
| **Username Input** | Placeholder: `Enter username or email` | Form Body | Captures user identity | Validates format and checks against active directory / database. |
| **Password Input** | Placeholder: `Enter password` | Form Body | Captures user secret | Masked input with eyeball toggle (`👁`) to reveal plaintext. |
| **Show/Hide Password**| Eye Icon (`👁`) | Inside Password Input | Toggles password masking | Flips input type between `password` and `text`. |
| **Sign In Button** | Primary Blue: `Sign In` | Bottom of Form | Submits authentication payload | Calls `POST /api/auth/token`. If MFA enabled, displays MFA modal. If valid, redirects to `/dashboard`. |
| **Request OTP Button**| Green: `Send One-Time Code` | Passwordless Tab | Dispatches temporary code | Calls `POST /api/auth/request-otp` and triggers SMTP email with 6-digit OTP. Starts 60-second cooldown timer. |
| **OTP Input Boxes** | 6 individual numeric boxes | OTP Modal | Captures email or SMS OTP | Auto-focuses next box on digit entry; supports pasting complete 6-digit code. |
| **Verify OTP Button** | `Verify & Continue` | Inside OTP Modal | Validates one-time code | Submits OTP to backend; initiates user session upon match. |
| **MFA QR Code View** | QR Code Canvas | First-time MFA Setup | Onboards TOTP App | User scans with Google Authenticator, Microsoft Authenticator, or 1Password. |
| **MFA TOTP Input** | `6-digit Authenticator Code` | TOTP Challenge Modal | Captures rolling token | Validates RFC 6238 TOTP against user secret. |

---

## 3. Screen 2: Executive Dashboard & Analytics

**Component:** `Dashboard.tsx`  
**Purpose:** Provides real-time operational overview, queue volume metrics, processing cycle times, and SLA breach monitors.

### 3.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Refresh Data** | Refresh Icon (`↻ Refresh`) | Top-Right of Page | Reloads dashboard figures | Re-fetches statistics from `/api/dashboard/stats` without page reload. |
| **Date Range Filter**| Dropdown (`Today`, `Last 7 Days`, `Month`, `Custom`) | Top Toolbar | Date boundary filter | Recalculates metrics and charts for selected historical window. |
| **KPI Card: Total Invoices** | Blue Card: `Total Uploaded` | Top Metrics Row | Displays gross count | Clicking card filters Work Tracker to show all uploaded records. |
| **KPI Card: Pending Approval** | Amber Card: `Pending Sign-off` | Top Metrics Row | Action-required count | Clicking card redirects to `/approvals` with pending filter active. |
| **KPI Card: Overdue / SLA At Risk** | Red Card: `SLA Breaches` | Top Metrics Row | Urgent escalations | Filters Work Tracker to invoices whose stage time exceeded SLA hours. |
| **KPI Card: Approved Value** | Green Card: `Total Value Approved` | Top Metrics Row | Currency total | Sum of all approved invoice amounts (INR / USD). |
| **Trend Chart Granularity** | Pills (`Day`, `Week`, `Month`) | Top of Analytics Chart | Modifies chart bucket | Renders Bar/Line chart grouped by day, week, or calendar month. |
| **Export Metrics Button** | `Export Report (CSV/PDF)` | Top-Right of Section | Generates analytics export | Downloads executive summary spreadsheet of volume and turnaround times. |

---

## 4. Screen 3: Document Upload & Ingestion Engine

**Component:** `DocumentUpload.tsx`  
**Purpose:** Ingests vendor PDF invoices, receipts, and supporting attachments either one-by-one or in bulk.

### 4.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Dropzone Area** | Dashed Border Box: `Drag & drop PDF here` | Center of Screen | Ingestion trigger | Accepts `.pdf` files via drag-and-drop or file picker dialog. |
| **Browse Files Button** | Secondary: `Browse Computer` | Inside Dropzone | Native file selector | Opens Windows Explorer / OS dialog filtered to PDF documents. |
| **Document Type Selector** | Dropdown (`Standard Vendor Invoice`, `Gate Entry / GRN`, `PO Matching`) | Form Panel | Metadata tagging | Sets processing profile and triggers specific AI extraction templates. |
| **Division Assignment** | Dropdown (`Garments Unit 1`, `Retail`, `Spinning`, etc.) | Form Panel | Multi-tenant scoping | Restricts document access to authorized division staff. |
| **Urgent Priority Flag** | Checkbox: `Mark as High Priority / Expedited` | Form Panel | SLA acceleration | Assigns high-priority tag and shortens notification escalation window. |
| **Clear Queue Button** | Outline Red: `Clear All` | Upload Staging Area | Cancels staged files | Clears all non-uploaded files from the browser memory table. |
| **Remove File Icon** | Red Trash Icon (`🗑`) | Beside Staged File | Deletes single item | Removes specific file from staging table prior to upload. |
| **Start Upload Button** | Primary Solid Green: `Process & Upload (N Files)` | Bottom Right | Submits files to backend | Sends multipart request to `POST /api/documents/upload`. Displays real-time progress bar; redirects to Work Tracker upon OCR completion. |

---

## 5. Screen 4: Work Tracker & Operations Queue

**Component:** `WorkTrackerPage.tsx`  
**Purpose:** Master operational workbench showing every document currently flowing through the pipeline.

### 5.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Search Bar** | Magnifying Glass: `Search invoice #, vendor, PO...` | Top Left | Live table search | Real-time substring filter on invoice number, vendor name, or user. |
| **Status Filter Pills** | `All`, `Pending`, `Under Review`, `Approved`, `Rejected` | Top Filter Bar | Lifecycle filter | Filters grid to show documents matching selected state. |
| **Division Dropdown** | Dropdown: `Filter by Division` | Filter Bar | Department filter | Isolates documents by corporate entity/branch. |
| **Date Created Picker**| Calendar Icon: `Select Dates` | Filter Bar | Date range filter | Filters documents by upload date. |
| **Select All Checkbox**| Checkbox in Table Header | Column 1, Row 1 | Bulk selector | Selects all currently visible document rows for bulk operations. |
| **Row Action: Open** | Blue Eye / File Icon (`View / Verify`) | Table Action Column | Opens verification | Navigates to Screen 5 (`DataVerificationPage.tsx`) for that document. |
| **Row Action: Lock Indicator** | Padlock Icon (`🔒 Locked by UserX`) | Table Status Column | Lease status | Indicates another approver currently holds active edit lease. |
| **Bulk Action: Approve**| Solid Green: `Batch Approve (Selected)` | Bulk Floating Bar | Bulk sign-off | Prompts for confirmation comment and signs off all checked documents. |
| **Bulk Action: Reassign**| Blue: `Reassign Approver` | Bulk Floating Bar | Workflow reassignment | Transfers selected documents to an alternate department approver. |
| **Pagination Buttons** | `< Previous` / `Next >` / Page Numbers | Bottom Right | Table navigation | Steps through document records (default: 25 per page). |

---

## 6. Screen 5: Document Verification & Split-Screen OCR Viewer

**Component:** `DataVerificationPage.tsx` & `DocumentDetails.tsx`  
**Purpose:** Core verification cockpit. Displays interactive PDF preview on left, and AI/OCR extracted data form on right with full audit controls.

### 6.1 PDF Viewer Controls (Left Pane)
| Button / Control | Visual Icon | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Zoom In** | Plus Magnifier (`🔍+`) | PDF Floating Toolbar | Enlarge preview | Increases PDF render scale by 25%. |
| **Zoom Out** | Minus Magnifier (`🔍-`) | PDF Floating Toolbar | Reduce preview | Decreases PDF render scale by 25%. |
| **Fit to Width** | Horizontal Expand Icon | PDF Floating Toolbar | Auto-scale | Scales PDF page to fill exact left pane width. |
| **Rotate Page** | Clockwise Arrow (`↻`) | PDF Floating Toolbar | Orientation fix | Rotates PDF page 90 degrees for landscape invoices. |
| **Page Navigation** | `<` `Page X of Y` `>` | PDF Floating Toolbar | Paging | Flips between multi-page invoice leaves. |
| **Download PDF** | Download Tray Icon | PDF Toolbar | Export file | Downloads original source PDF file to client computer. |

### 6.2 Data Extraction & Field Controls (Right Pane)
| Button / Field | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Confidence Badge** | Green/Amber Pill: `98% High Confidence` | Beside Field Label | Extraction certainty | Highlights whether AI is confident or if human review is advised. |
| **Vendor Name Field** | Editable Input: `Supplier Name` | Form Section 1 | Primary vendor | Auto-populated by AI; editable by reviewer with audit tracking. |
| **GSTIN Field** | Editable Input: `GST Identification Number` | Form Section 1 | Tax verification | Validates Indian GSTIN 15-character alphanumeric format. |
| **Invoice Number** | Editable Input: `Invoice #` | Form Section 1 | Identifier | Checks database instantly for duplicate invoice warning. |
| **Invoice Date** | Date Picker: `DD/MM/YYYY` | Form Section 1 | Transaction date | Calendar picker; warns if date is older than 90 days. |
| **Total Amount Field**| Number Input: `Gross Total (₹)` | Form Section 2 | Financial total | Verifies math: Subtotal + CGST + SGST + IGST = Total. |
| **Add Line Item** | `+ Add Item` | Below Items Table | Manual row addition | Appends blank row to itemized table for manual entry. |
| **Delete Line Item** | Red Trash Icon (`🗑`) | Right of Table Row | Row removal | Removes item row and recalculates total amount automatically. |
| **Re-Run AI OCR** | Purple: `Re-Extract with AI (Ollama)` | Top of Right Pane | Re-triggers LLM | Re-submits PDF text to `llama3.2` model to attempt better field extraction. |

### 6.3 Action Bar & Decision Buttons (Bottom Right)
| Button | Visual Style | Location | Action | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Approve Document**| Solid Green (`✔ Approve & Sign`) | Bottom Action Bar | Authorizes stage sign-off | Opens sign-off modal, records digital signature & timestamp, increments stage, and triggers ERP callback if final stage. |
| **Reject Document** | Solid Red (`✖ Reject`) | Bottom Action Bar | Denies document | Prompts mandatory rejection reason; marks invoice as `REJECTED`, stops workflow, and notifies uploader. |
| **Request More Info**| Amber/Yellow (`❓ Request Info`) | Bottom Action Bar | Queries uploader | Opens comment modal; returns document to uploader with explanation of what details are missing. |
| **Delegate Review** | Outline Blue (`↪ Forward / Delegate`) | Bottom Action Bar | Hand-off task | Reassigns current stage lease to a specific colleague with an explanation note. |
| **Save Draft / Changes**| Outline Gray (`💾 Save Draft`) | Bottom Action Bar | Persists edits | Saves corrected field inputs without moving document to the next approval stage. |

---

## 7. Screen 6: Dedicated Approval Queue

**Component:** `ApprovalQueuePage.tsx`  
**Purpose:** Ultra-focused inbox showing only documents where the currently logged-in user is the active assigned reviewer.

### 7.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Quick Approve** | Green Checkmark Icon | Right of Table Row | 1-Click approval | Prompts quick confirmation modal; signs off invoice immediately without opening split viewer. |
| **Quick Reject** | Red Cross Icon | Right of Table Row | 1-Click rejection | Prompts for mandatory rejection reason note before marking rejected. |
| **SLA Countdown Timer**| Amber/Red Clock (`⏱ 4h 12m remaining`) | SLA Column | Urgency monitor | Displays hours left before automated manager escalation triggers. |
| **Sort by Due Date** | Column Header: `Due Date ⬍` | Table Header | Sort order | Toggles ascending/descending order to prioritize expiring invoices. |
| **Open Full Review** | `Open Review Window` | Table Row Click | Full verification | Opens Screen 5 with active lock lease acquired. |

---

## 8. Screen 7: Approved Documents & Historical Archive

**Component:** `ApprovedDocumentsPage.tsx`  
**Purpose:** Permanent, immutable repository of all fully signed and finalized documents.

### 8.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Global Archive Search**| Search Box: `Search archived records...` | Top Left | Deep search | Searches across historical invoice numbers, vendor names, and approval dates. |
| **Export to Excel** | Green Button (`📊 Export to Excel / CSV`) | Top Right | Spreadsheet dump | Generates downloadable `.xlsx` containing line items, approver names, and timestamps. |
| **Download Audit Certificate**| Blue Button (`📜 Download Audit Trail PDF`) | Inside Record Modal | Legal compliance | Generates cryptographically hashed PDF listing every single approval step and time. |
| **View Final PDF** | Eye Icon (`👁 View Document`) | Table Action Column | Document view | Opens signed document in read-only preview mode. |
| **Payment Status Tag**| Status Badge (`Pending Export` / `Synced to ERP`) | Status Column | Financial integration | Shows whether financial data has been sent to SAP/Tally. |

---

## 9. Screen 8: Payment Readiness & Financial Staging

**Component:** `PaymentReadinessPage.tsx`  
**Purpose:** Finance and treasury dashboard to verify bank details and schedule batch payment releases for approved invoices.

### 9.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Bank Account Validation**| Checkbox: `Bank Details Verified` | Form Row | Vendor verification | Confirms vendor IFSC/IBAN and bank account match ERP master data. |
| **Payment Due Date Picker**| Calendar: `Release Date` | Table Column | Cash-flow planning | Sets scheduled date for bank disbursement. |
| **Mark Ready for Payment** | Primary Green (`💰 Stage for Payment`) | Action Column | Release authorization | Moves invoice to `PAYMENT_STAGED` status. |
| **Generate Payment File** | Solid Blue (`⬇ Export Bank TXT/NEFT Batch`) | Top Right | Treasury integration | Generates standardized bank upload file (CMS / HDFC / ICICI / SBI format). |

---

## 10. Screen 9: Goods Receipt Note (GRN) & 3-Way Match

**Component:** `GoodsReceiptPage.tsx`  
**Purpose:** Gate entry verification matching physical goods received against Purchase Orders (PO) and Vendor Invoices.

### 10.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Fetch PO Data** | Blue Button (`🔗 Fetch PO from ERP`) | Top Form | ERP connection | Pulls line items and approved quantities from central ERP using PO Number. |
| **Variance Highlighting**| Red/Green Delta Indicators | Line Items Grid | Discrepancy detector | Highlights quantity or price differences between PO and Invoice in red. |
| **Accept Quantity** | Checkmark beside Item Row | Items Table | Line item confirmation | Confirms physical count matches delivery challan. |
| **Report Shortage / Damage**| Warning Triangle (`⚠️ Log Discrepancy`) | Items Table | Debit note trigger | Logs damaged goods count; automatically deducts amount from invoice total. |
| **Submit 3-Way Match** | Primary Green (`Confirm 3-Way Match`) | Bottom Right | Matching sign-off | Reconciles PO, GRN, and Invoice; routes to Finance for final payment approval. |

---

## 11. Screen 10: Customer Feedback & Sentiment Resolution

**Component:** `CustomerFeedbackPage.tsx` & `CustomerFeedbackDetails.tsx`  
**Purpose:** Review, categorize, and resolve non-financial documents such as retail customer complaints and quality audit reports.

### 11.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Sentiment Pill** | Red/Yellow/Green Pill (`Negative`, `Neutral`, `Positive`) | Table Header | AI Sentiment | Displays AI-extracted emotional tone of customer letter or email. |
| **Severity Classifier**| Dropdown (`Low`, `Medium`, `High`, `Critical / Executive Escalation`) | Detail Pane | Priority management | Adjusts resolution SLA and notifies department head if critical. |
| **Assign Investigator**| User Dropdown: `Assign QA Officer` | Detail Pane | Assignment | Routes ticket to specific Quality Assurance specialist. |
| **Add Resolution Note**| Text Area: `Internal Findings & Action Taken` | Detail Pane | Record keeping | Logs internal investigation notes. |
| **Close Ticket** | Solid Green (`✔ Resolve & Close`) | Bottom Action Bar | Ticket finalization | Marks feedback ticket as resolved; sends closing notification to customer. |

---

## 12. Screen 11: Visual Flow Builder (Workflow Studio)

**Component:** `FlowBuilder.jsx` (powered by ReactFlow)  
**Purpose:** Interactive visual canvas to drag, connect, and configure multi-stage document approval hierarchies.

### 12.1 Visual Canvas Controls
| Button / Control | Visual Label / Icon | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Add Stage Node** | `+ Add Approval Stage` | Canvas Top Toolbar | Appends node | Spawns a new approval step box on the visual canvas. |
| **Add Condition Node** | `+ Add Decision Split` | Canvas Top Toolbar | Branching logic | Spawns a condition box (e.g., *If Amount > ₹1,00,000 route to CFO*). |
| **Auto-Layout Button** | `🔀 Auto-Align Nodes` | Canvas Top Toolbar | Cleans layout | Uses automated graph algorithm to neatly arrange nodes and connecting arrows. |
| **Zoom to Fit** | `⊡ Fit Screen` | Bottom Left Map | Canvas scaling | Centers and fits entire workflow diagram into current viewport. |
| **Save Workflow** | Solid Green (`💾 Publish Workflow`) | Top Right | Publishes schema | Validates graph for cycles or dead ends; saves new version to database. |
| **Node Config: Approver**| Approver Dropdown inside Node | Inside Stage Box | Assigns role | Sets which user role (e.g., `Finance Manager`) must sign off at this step. |
| **Node Config: SLA Hours**| Number Input: `SLA (Hours)` | Inside Stage Box | Sets deadline | Defines maximum hours allowed before escalation notice triggers. |
| **Delete Node** | Red Trash Icon (`🗑`) | Top-Right of Node | Removes step | Removes node and severs connecting edges. |

---

## 13. Screen 12: Condition Builder & Dynamic Routing Studio

**Component:** `ConditionBuilder.jsx` & `ChecklistConditionBuilder.jsx`  
**Purpose:** Create granular logic rules that dictate which documents require executive approval or compliance checks.

### 13.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Add Rule** | `+ Add Condition Rule` | Rule Set Header | Adds logic row | Adds a new condition row (`[Field] [Operator] [Value]`). |
| **Field Selector** | Dropdown (`Total Amount`, `Vendor GST`, `Division`, `Category`) | Condition Row | Criterion target | Chooses which document metadata field to evaluate. |
| **Operator Selector** | Dropdown (`Greater Than (>)`, `Less Than (<)`, `Equals (=)`, `Contains`) | Condition Row | Comparison logic | Defines the evaluation operator. |
| **Threshold Value** | Input Field (e.g., `50000`) | Condition Row | Evaluation boundary | Numerical or text threshold value. |
| **Logic Connector** | Toggle (`AND` / `OR`) | Between Rules | Multi-rule logic | Determines whether all rules or any single rule must match. |
| **Delete Rule** | Red Minus Icon (`⊖`) | End of Rule Row | Removes condition | Deletes single rule row. |
| **Test Rule Simulation**| Blue Button (`⚡ Test Against Sample`) | Bottom of Section | Dry-run tester | Simulates rule against an existing invoice to verify correct pass/fail evaluation. |

---

## 14. Screen 13: Enterprise Audit Logs Explorer

**Component:** `AuditLogsPage.tsx`  
**Purpose:** Complete, tamper-evident security audit log showing every system interaction, document review, and login.

### 14.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Event Filter** | Dropdown (`All Events`, `Auth`, `Approval`, `Edit`, `Deletion`, `System`) | Filter Bar | Category filter | Isolates logs by operational event type. |
| **User Filter** | Input: `Filter by Username / Employee ID` | Filter Bar | Actor search | Shows all actions performed by a specific employee. |
| **Date Range Filter**| Dual Calendar: `From Date - To Date` | Filter Bar | Time window | Bounds audit records to a specific audit period. |
| **Sanitized CSV Export**| Solid Blue (`⬇ Export Filtered CSV`) | Top Right | Data export | Downloads cryptographic log records formatted for enterprise auditors. |
| **View Raw Payload** | Code Brackets Icon (`{ } Details`) | Table Row Action | Inspection | Opens modal displaying exact JSON before/after state diff of the edit. |

---

## 15. Screen 14: User Management & Division Scoping

**Component:** `AdminUsers.jsx`  
**Purpose:** System administrators provision employees, assign roles, restrict divisional access, and reset credentials.

### 15.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Create New User** | Primary Solid Blue (`+ Add User`) | Top Right | User onboarding | Opens modal to configure Employee ID, Email, Role, and Division. |
| **Status Toggle** | Green/Gray Switch (`Active` / `Inactive`) | User Table Row | Account status | Instantly enables or disables login access for that employee. |
| **Reset MFA Button** | Shield Warning Icon (`🔑 Reset MFA`) | User Action Menu | Security recovery | Clears enrolled TOTP secret; forces user to re-scan QR code on next login. |
| **Division Assignment**| Multi-Select Checkboxes | Edit User Modal | Access restriction | Restricts employee to only view invoices belonging to checked divisions. |
| **Edit Roles Button** | Pencil Icon (`✏ Edit User`) | User Action Menu | Role modification | Changes assigned permissions and authority level. |

---

## 16. Screen 15: Role-Based Access Control (RBAC) Matrix

**Component:** `AdminRBAC.jsx`  
**Purpose:** Define granular roles (e.g., `Finance Officer`, `HOD`, `Auditor`) and configure their 32 system permissions.

### 16.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Create Role** | Blue Button (`+ Create Custom Role`) | Top Right | Role creation | Creates a new named authority group. |
| **Permission Checkbox**| Checkboxes in Permission Grid | Matrix Table | Grants capability | Toggles individual rights (e.g., `can_delete`, `can_export_payments`, `can_override_sla`). |
| **Select All for Category**| Small Pill (`Select All In Category`) | Group Header | Quick bulk grant | Selects all permissions under a heading (e.g., all `Document` actions). |
| **Save Permissions** | Solid Green (`💾 Save Changes`) | Bottom Right | Persists matrix | Updates authorization cache across the server. |

---

## 17. Screen 16: DAPI Sync-Back & Integration Hub

**Component:** `ApplicationStudioPage.tsx` & `CallbackRulesPage.tsx`  
**Purpose:** Connect DocuFlow with external ERPs (SAP, Tally, Custom REST APIs) and configure outbound webhook callbacks.

### 17.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Add Webhook Rule** | `+ Register Callback Target` | Top Right | New endpoint | Opens configuration form for a new ERP listener URL. |
| **Endpoint URL Field**| Input: `https://erp.company.com/api/v1/invoices` | Webhook Config | Destination | Sets target server address for outbound approval payloads. |
| **HMAC Secret Key** | Masked Input: `Shared Secret Token` | Webhook Config | Security signature | Generates SHA-256 header hash to prove authenticity to receiving ERP. |
| **Trigger Event Selector**| Checkboxes (`On Final Approval`, `On Rejection`, `On Payment Stage`) | Webhook Config | Event criteria | Specifies which status changes fire the webhook. |
| **Test Ping Button** | Outline Blue (`⚡ Send Test Ping`) | Action Bar | Diagnostics | Sends mock test payload to destination; displays HTTP response code and latency. |
| **Retry Failed Events**| Yellow Refresh Icon (`↻ Retry All Failed`) | Logs Table Header | Error recovery | Re-queues failed webhook dispatches using exponential backoff worker. |

---

## 18. Screen 17: System Administration & Database Maintenance

**Component:** `AdminSystem.jsx` & `AdminBackups.jsx`  
**Purpose:** Manage database dumps, clean temporary cache files, inspect server resources, and manage soft-deleted documents.

### 18.1 Button & Control Catalog
| Button / Control | Visual Label | Location | Function | Expected System Action |
| :--- | :--- | :--- | :--- | :--- |
| **Trigger Backup Now**| Solid Blue (`💾 Create Database Backup`) | Top Toolbar | Instant dump | Creates timestamped SQL dump in backup storage directory. |
| **Download Backup** | Download Tray Icon | Backups List Row | Offsite copy | Downloads `.sql.gz` archive to local administrator computer. |
| **Restore Database** | Red Warning Button (`⚠️ Restore Snapshot`) | Action Menu | Recovery | Restores system state from selected snapshot with strict confirmation prompt. |
| **Clear Temp OCR Cache**| Gray Button (`🧹 Purge OCR Cache`) | Maintenance Card | Disk cleanup | Deletes cached image crops older than 7 days from `uploads/` directory. |
| **Recycle Bin: Restore**| Green Undo Icon (`↩ Restore Item`) | Recycle Bin Table | Undelete | Restores soft-deleted document back to its prior stage in the Work Tracker. |
| **Recycle Bin: Purge** | Red Trash Icon (`🔥 Permanently Delete`) | Recycle Bin Table | Hard delete | Permanently purges document and files according to data retention policies. |

---

*End of Screen-by-Screen & Button-by-Button Operational Manual.*
