# DOCUFLOW AUTOMATION SYSTEM — OPERATIONS USER MANUAL
**Document Version:** 2.4.0  
**Target Audience:** Operations Staff, Document Processors, Accounts Approvers, Department Managers, End Users  
**Classification:** Operational End-User Manual  

---

## TABLE OF CONTENTS
1. [Introduction to DocuFlow Operations](#1-introduction-to-docuflow-operations)
2. [Signing In & Account Access](#2-signing-in--account-access)
3. [Dashboard Overview & Workload Filters](#3-dashboard-overview--workload-filters)
4. [Uploading Invoices & Automated Extraction](#4-uploading-invoices--automated-extraction)
5. [Work Tracker & Pending Workload Queue](#5-work-tracker--pending-workload-queue)
6. [Document Details & Inspection Panel](#6-document-details--inspection-panel)
7. [Executing Workflow Actions (Approve, Hold, Send Back, Reject)](#7-executing-workflow-actions-approve-hold-send-back-reject)
8. [Approved Documents Archive & Signed Downloads](#8-approved-documents-archive--signed-downloads)
9. [Notification Center & Live Alerts](#9-notification-center--live-alerts)
10. [Troubleshooting & Frequently Asked Questions](#10-troubleshooting--frequently-asked-questions)

---

## 1. INTRODUCTION TO DOCUFLOW OPERATIONS

Welcome to DocuFlow Automation! DocuFlow is an enterprise document approval application designed to simplify invoice processing, verification, and workflow approvals. 

### Who Uses This Manual?
This manual is written for daily operational users, including:
- **Accounts Payable Staff & Document Processors** who upload and verify incoming invoices.
- **Approvers & Department Managers** who review document details, complete verification checklists, and sign off on approvals.
- **General Employees** who track invoice states or view approved document records.

> [!NOTE]
> All actions described in this manual are performed directly through the DocuFlow web interface. No technical or programming knowledge is required.

---

## 2. SIGNING IN & ACCOUNT ACCESS

### 2.1 What is the Login Screen?
The Login screen is the initial entry point to DocuFlow. It verifies your corporate identity and grants access to your authorized workspace based on your assigned role.

### 2.2 Fields & Inputs
| Field Name | Meaning & Purpose | What to Enter / Select |
| :--- | :--- | :--- |
| **Username / Email Address** | Your registered corporate email identifier | Enter your official email (e.g., `user@company.com`) |
| **Password** | Your secure account password | Enter your account password |
| **Role Selector** *(If visible)* | Allows multi-role users to select an active operating profile | Select your desired role profile from the dropdown list |

### 2.3 How to Sign In
1. Open your web browser and navigate to the DocuFlow address provided by your administrator.
2. Enter your corporate **Email Address** and **Password**.
3. If prompt appears, select your operating **Role**.
4. Click **Sign In**.

### 2.4 Button Reference
| Button | What It Does |
| :--- | :--- |
| **Sign In** | Authenticates your credentials and opens your default home screen |
| **Forgot Password?** | Triggers a password recovery email to your inbox |

> [!WARNING]
> **Single-Active Session:** DocuFlow allows only one active session per account. If you log in from a secondary browser or device, your previous session will automatically terminate with a notification message.

---

## 3. DASHBOARD OVERVIEW & WORKLOAD FILTERS

### 3.1 What is the Dashboard?
The Dashboard provides an instant, visual summary of your enterprise invoice workload. It displays key operational statistics, pending approval alerts, and quick navigation shortcuts.

### 3.2 Who Uses It?
All users access the Dashboard to check active workload counts and filter documents by status or date.

### 3.3 Dashboard KPI Counters
| KPI Card Name | What It Means | What Happens When Clicked |
| :--- | :--- | :--- |
| **TOTAL INGESTED** | Total number of invoices uploaded into DocuFlow | Resets status filters to display all invoices |
| **PENDING APPROVAL** | Invoices waiting for active review and approval | Filters the document list to show pending invoices |
| **ON HOLD** | Invoices temporarily paused for vendor or internal clarification | Filters the document list to show invoices currently on hold |
| **REJECTED** | Invoices rejected due to discrepancies or invalid details | Filters the document list to show rejected invoices |
| **APPROVED & SETTLED** | Invoices fully approved and cleared through all stages | Opens the Approved Documents page |

### 3.4 Filtering Dashboard Data
- **Date Presets:** Select from preset date buttons (**Today**, **This Week**, **This Month**, **All Time**, or **Custom Range**) to filter workload statistics.
- **Document Type Pills:** Click document category pills (e.g., **AP Invoice**, **Freight Invoice**, **Utility Bill**, **Capex**) to isolate specific invoice categories.

---

## 4. UPLOADING INVOICES & AUTOMATED EXTRACTION

### 4.1 What is the Upload Page?
The Document Upload page allows authorized users to submit new supplier invoices into DocuFlow. The system automatically reads the file and extracts key invoice information for review.

### 4.2 Who Uses It?
Accounts Payable executives, document processors, and administrative staff who receive physical or digital invoices.

### 4.3 Form Fields & Descriptions
| Field Name | Meaning & Purpose | What to Enter / Select |
| :--- | :--- | :--- |
| **Division** | Enterprise business division handling the bill | Select the appropriate division (e.g., `VCC`, `ENES`, `ACM`) |
| **Expense Category** | Classification of the invoice expense | Select the category (e.g., `Standard AP Invoice`, `Freight Bill`) |
| **File Drag & Drop Zone** | File selection area for PDF or image invoices | Drag and drop your file or click **Browse Files** |

### 4.4 Step-by-Step: How to Upload an Invoice
#### Before You Start
Make sure your invoice file is saved in PDF, PNG, or JPG format and that you know the correct Division and Expense Category.

#### Steps
1. Select **Upload Document** from the left navigation menu.
2. Select the target **Division** from the dropdown menu.
3. Select the target **Expense Category**.
4. Drag and drop your invoice file into the file upload box, or click **Browse Files** to pick the file from your computer.
5. Click **Run Automated Extraction**.
6. Review the extracted fields shown on screen:
   - **Vendor Name**
   - **Invoice Number** & **Invoice Date**
   - **Gross Amount**, **Base Amount**, and **GST Tax Splits**
   - **Purchase Order (PO) Reference**
7. If any extracted field needs correction, edit the field directly in the preview form.
8. Click **Submit & Queue Document**.

#### What Happens Next?
The invoice enters DocuFlow and is automatically routed to the designated approver's Work Tracker according to configured business rules.

### 4.5 Button Reference
| Button | What It Does |
| :--- | :--- |
| **Browse Files** | Opens your file browser to pick an invoice file from your computer |
| **Run Automated Extraction** | Scans the uploaded file and populates the data fields |
| **Submit & Queue Document** | Finalizes the invoice upload and starts the approval workflow |
| **Clear Form** | Resets all fields and removes the uploaded file |

> [!TIP]
> Double-check the extracted **Gross Amount** and **Invoice Number** before clicking Submit to ensure accurate routing.

---

## 5. WORK TRACKER & PENDING WORKLOAD QUEUE

### 5.1 What is the Work Tracker?
The Work Tracker is your personal work queue. It displays all documents currently assigned to you or your role for review and approval.

### 5.2 Who Uses It?
Approvers, department managers, and review teams tasked with verifying and approving invoices.

### 5.3 Work Tracker Scoping
- **Standard Users:** You will see only the documents that are currently at your stage and require your explicit action.
- **Managers / Administrators:** May view team queues and reassign documents if permitted.

### 5.4 Page Controls & Search
| Control | Explanation | How to Use |
| :--- | :--- | :--- |
| **Search Bar** | Filters queue by text | Type Vendor Name, Invoice Number, or PO Reference |
| **Status Filter** | Filters queue by status | Select `Pending`, `On Hold`, or `All` |
| **Priority Badge** | Indicates urgency level | Red badge indicates Urgent/Overdue, Blue indicates Standard |
| **Open Inspection** | Opens full document details | Click any invoice row in the table |

---

## 6. DOCUMENT DETAILS & INSPECTION PANEL

### 6.1 What is Document Details?
The Document Details screen opens when you select an invoice from the Work Tracker or Dashboard. It allows authorized users to review invoice metadata, view the original document, complete verification checklists, and execute approval actions.

### 6.2 Key Screen Areas
1. **Document Header:** Displays Document ID, Vendor Name, Category, Division, and current Workflow Stage.
2. **Interactive Document Viewer:** Displays the original PDF or image file on screen with zoom, rotate, and full-page controls.
3. **Editable Data Fields:** Displays key invoice financial details. Authorized users can make corrections if necessary.
4. **Stage Verification Checklist:** Interactive list of required verification items that must be checked before approving.
5. **Approval History Docket:** Displays a complete timestamped record of previous comments, reviews, and sign-offs.

### 6.3 Field Table
| Field Name | Meaning & Purpose | Editable? |
| :--- | :--- | :--- |
| **Vendor / Supplier Name** | Name of the issuing vendor | Yes (Authorized roles) |
| **Invoice Number** | Vendor's invoice identifier | Yes (Authorized roles) |
| **Invoice Date** | Date printed on the invoice | Yes (Authorized roles) |
| **PO Reference Number** | Associated Purchase Order number | Yes (Authorized roles) |
| **Gross Amount** | Total payable amount including taxes | Yes (Authorized roles) |
| **Base Amount** | Net amount before tax additions | Yes (Authorized roles) |
| **GST Tax Splits** | CGST, SGST, or IGST tax amounts | Yes (Authorized roles) |

---

## 7. EXECUTING WORKFLOW ACTIONS (APPROVE, HOLD, SEND BACK, REJECT)

When inspecting a document in your Work Tracker, four primary actions are available: **Approve**, **Hold**, **Send Back**, and **Reject**.

### 7.1 Action Reference Table
| Action Button | Meaning & When to Use | Requirements | What Happens Next |
| :--- | :--- | :--- | :--- |
| **Approve & Pass Stage** | Approves the current stage after verifying all invoice data. | All mandatory checklist items must be checked. Optional sign-off remarks. | Document moves to the next approval stage or to `Approved` state if final stage. |
| **Hold / Pause** | Temporarily pauses processing when vendor details or internal information is missing. | **Mandatory:** Type clear clarification comments in the popup box. | Document status updates to `On Hold`. It remains accessible for updates. |
| **Send Back** | Returns the document to a previous stage or submitter for corrections. | Select target previous stage and enter mandatory return instructions. | Document returns to the chosen stage for correction and re-submission. |
| **Reject Document** | Permanently stops processing an invalid, duplicate, or incorrect invoice. | **Mandatory:** Type explicit rejection reason in the popup box. | Document moves to `Rejected` state and processing stops. |

### 7.2 Step-by-Step: How to Approve an Invoice
1. Open the invoice row from your **Work Tracker**.
2. Review the document image against the displayed details on the right panel.
3. Complete all mandatory boxes in the **Stage Verification Checklist** (e.g., *"Vendor Tax ID Validated"*, *"PO Quantities Match"*).
4. Click **Approve & Pass Stage**.
5. Enter optional sign-off remarks in the confirmation box.
6. Click **Confirm Approval**.

### 7.3 Step-by-Step: How to Put an Invoice On Hold
1. Open the invoice row from your **Work Tracker**.
2. Click **Hold / Pause**.
3. In the popup window, type detailed comments explaining what missing information or clarification is needed.
4. Click **Confirm Hold**.

> [!IMPORTANT]
> The **Confirm Hold** button remains disabled until you type a detailed clarification comment in the remarks box.

---

## 8. APPROVED DOCUMENTS ARCHIVE & SIGNED DOWNLOADS

### 8.1 What is Approved Documents?
The Approved Documents page is a searchable historical archive of all invoices that have successfully completed all approval stages.

### 8.2 Who Uses It?
Finance teams, auditors, and department managers who need to view settled invoices or download signed approval copies.

### 8.3 How to Search and Download Approved Invoices
1. Select **Approved Docs** from the left menu.
2. Use the **Search Bar** to type a Vendor Name, Invoice Number, or PO Reference.
3. Apply **Division** or **Date Range** filters if desired.
4. Click on any invoice row to view its complete audit history and sign-off details.
5. Click **Download Signed PDF** to save an official PDF copy stamped with digital approval signatures.

---

## 9. NOTIFICATION CENTER & LIVE ALERTS

### 9.1 How Notifications Work
DocuFlow alerts you whenever an action requires your attention:
- **Header Bell Icon (`🔔`):** Displays a red badge showing your unread notification count.
- **Clicking the Bell:** Opens a slide-out panel showing recent assignments, stage approvals, and hold updates.
- **Clicking a Notification:** Navigates directly to the relevant document inspection screen.

---

## 10. TROUBLESHOOTING & FREQUENTLY ASKED QUESTIONS

| Issue | Possible Cause | Recommended Action |
| :--- | :--- | :--- |
| **Cannot click "Approve & Pass Stage" button** | One or more mandatory verification checklist items remain unchecked | Review the checklist section in Document Details and check all mandatory boxes. |
| **"Confirm Hold" button is grayed out** | The required clarification comment box is empty | Type an explanation in the comment box describing why the invoice is being paused. |
| **Invoice disappeared from Work Tracker** | The invoice was approved by another pool member, moved to another stage, or placed on hold | Check the **Dashboard** counters or search in **Approved Docs** or **Dashboard** list view. |
| **"Session Expired / Terminated" alert appears** | Your account was logged in from another browser tab, device, or computer | Click Sign In to log back in. Ensure you use a single browser tab. |
| **Uploaded document values are incorrect** | OCR automated extraction misread fuzzy text on the uploaded image | Manually click on the field in the upload preview or Document Details screen and type the correct information. |
