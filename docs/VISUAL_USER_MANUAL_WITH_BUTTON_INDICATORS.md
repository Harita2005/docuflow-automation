# FlowApprove / DocuFlow — Visual Screen Manual with Button Indicators
**System Version:** 2.1.0 Enterprise  
**Document Purpose:** Visual Control Reference with Numbered Button Indicators  
**Audience:** Accounts Payable Staff, Department Approvers, Operational Managers, and System Admins  

---

## Quick Navigation Index
* [Global Navigation Header & Rail](#0-global-navigation-header--sidebar-rail)
* [Screen 1: Login & Authentication Portal](#1-screen-1-login--authentication-portal)
* [Screen 2: Multi-Factor Authentication (OTP / TOTP Modal)](#2-screen-2-multi-factor-authentication-otp--totp-modal)
* [Screen 3: Executive Analytics Dashboard](#3-screen-3-executive-analytics-dashboard)
* [Screen 4: Drag & Drop Document Ingestion Portal](#4-screen-4-drag--drop-document-ingestion-portal)
* [Screen 5: Work Tracker & Operational Queue](#5-screen-5-work-tracker--operational-queue)
* [Screen 6: Split-Screen OCR & Document Verification Cockpit](#6-screen-6-split-screen-ocr--document-verification-cockpit)
* [Screen 7: Dedicated Approval Queue](#7-screen-7-dedicated-approval-queue)
* [Screen 8: Approved Documents Archive](#8-screen-8-approved-documents-archive)
* [Screen 9: Visual Flow Builder (Workflow Studio)](#9-screen-9-visual-flow-builder-workflow-studio)
* [Screen 10: Admin User Provisioning & Division Scoping](#10-screen-10-admin-user-provisioning--division-scoping)
* [Screen 11: DAPI Integration Studio & Webhook Callbacks](#11-screen-11-dapi-integration-studio--webhook-callbacks)

---

## 0. Global Navigation Header & Sidebar Rail

The global layout surrounds every page in the application, providing consistent menu navigation and enterprise context.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| [1] ☰  [2] RAMRAJ COTTON - FlowApprove    [3] Division: [All Divisions ▼]    [4] 🔔(2)  [5] 🌙  [6] User [▼]|
+---------------------------------------------------------------------------------------------------------+
| [7]  📊 Dashboard        |                                                                              |
| [8]  📤 Upload Document  |                                                                              |
| [9]  📋 Work Tracker     |                                                                              |
| [10] ✔  Approval Queue   |                       MAIN PAGE CONTENT AREA                                 |
| [11] 📁 Approved Docs    |                                                                              |
| [12] 💰 Payment Staging  |                                                                              |
| [13] 🔀 Workflow Studio  |                                                                              |
| [14] 🛡  Audit Logs      |                                                                              |
| [15] ⚙  Administration   |                                                                              |
+--------------------------+------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | Location | What Happens When Clicked |
| :-: | :--- | :--- | :--- | :--- |
| **[1]** | **Sidebar Toggle** | Hamburger Icon (`☰`) | Top-Left | Collapses menu to narrow icon-rail or expands to full text view. |
| **[2]** | **Brand Home Link** | Ramraj / FlowApprove Logo | Top-Left | Navigates directly back to the Executive Dashboard. |
| **[3]** | **Division Dropdown**| Select Box (`Garments Unit 1`, `Retail`, `All`) | Top-Center | Filters all metrics, queues, and tables to the chosen organizational division. |
| **[4]** | **Notification Center**| Bell Icon with red badge (`🔔 2`) | Top-Right | Opens sliding drawer showing pending approvals, SLA warnings, and notes. |
| **[5]** | **Dark / Light Toggle**| Sun / Crescent Moon Icon | Top-Right | Instantly flips UI between high-contrast light mode and dark mode. |
| **[6]** | **User Profile & Logout**| Avatar + User Name with Caret | Top-Far-Right| Drops down Profile, Role details, and **Sign Out** button (clears session & redirects). |
| **[7]** | **Dashboard Nav** | Grid Icon + `Dashboard` | Sidebar Row 1 | Opens real-time volume, approval throughput, and SLA analytics. |
| **[8]** | **Upload Nav** | Cloud Icon + `Upload Document` | Sidebar Row 2 | Opens PDF and scanned document ingestion dropzone. |
| **[9]** | **Work Tracker Nav** | Checklist Icon + `Work Tracker` | Sidebar Row 3 | Opens active multi-stage operational processing table. |
| **[10]**| **Approval Queue Nav** | Check-Square + `Approval Queue`| Sidebar Row 4 | Opens queue displaying documents requiring *your* active signature. |
| **[11]**| **Approved Docs Nav** | Archive Box + `Approved Docs` | Sidebar Row 5 | Opens read-only archive of finalized invoices and audit certificates. |
| **[12]**| **Payment Staging Nav**| Banknote + `Payment Readiness` | Sidebar Row 6 | Opens finance verification for bank batch file export. |
| **[13]**| **Workflow Studio Nav**| Branch Icon + `Workflow Studio`| Sidebar Row 7 | Opens ReactFlow visual approval chain editor. |
| **[14]**| **Audit Logs Nav** | Shield + `Audit Logs` | Sidebar Row 8 | Opens cryptographic system activity and login log explorer. |
| **[15]**| **Administration Nav** | Gear + `Administration` | Sidebar Row 9 | Opens user provisioning, RBAC matrix, and database backup controls. |

---

## 1. Screen 1: Login & Authentication Portal

**Component:** `LoginPage.tsx`  
**Purpose:** Secure multi-tenant entry supporting password or passwordless Employee ID OTP.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
|                               DOCUFLOW ENTERPRISE AUTHENTICATION                                        |
|                                                                                                         |
|       +-----------------------------------------------------------------------------------------+       |
|       |                     [1] Tab: Standard Login  |  [2] Tab: Passwordless OTP               |       |
|       +-----------------------------------------------------------------------------------------+       |
|       |                                                                                         |       |
|       |   [3] Username or Employee ID:                                                          |       |
|       |   +---------------------------------------------------------------------------------+   |       |
|       |   | e.g. EMP1042 or accounts.manager@ramrajcotton.net                               |   |       |
|       |   +---------------------------------------------------------------------------------+   |       |
|       |                                                                                         |       |
|       |   [4] Password:                                                                         |       |
|       |   +---------------------------------------------------------------------+-------------+   |       |
|       |   | ********************                                                | [5] 👁 Show  |   |       |
|       |   +---------------------------------------------------------------------+-------------+   |       |
|       |                                                                                         |       |
|       |   [6] Remind Me on this Computer [ ]                [7] Forgot Password? (Contact IT)   |       |
|       |                                                                                         |       |
|       |   +---------------------------------------------------------------------------------+   |       |
|       |   |                           [8] SIGN IN TO FLOWAPPROVE                            |   |       |
|       |   +---------------------------------------------------------------------------------+   |       |
|       +-----------------------------------------------------------------------------------------+       |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Visual Indicator | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Standard Login Tab** | Underlined Tab: `Standard Login` | Shows traditional Username and Password input fields. |
| **[2]** | **Passwordless Tab** | Tab: `Passwordless OTP` | Hides password field; displays Employee ID input + "Send One-Time Code" button. |
| **[3]** | **Username / ID Input** | Text box with user icon | User enters email or Employee ID. Validates format. |
| **[4]** | **Password Input** | Masked dots (`••••••••`) | User enters password. Transmitted via HTTPS with bcrypt verification. |
| **[5]** | **Show/Hide Password** | Eye Icon (`👁`) | Unmasks password characters to plaintext for easy error correction. |
| **[6]** | **Remember Me** | Checkbox | Extends local JWT session duration to 30 days. |
| **[7]** | **Forgot Password** | Blue Text Link | Opens modal with IT Helpdesk contact and password reset instructions. |
| **[8]** | **Sign In Button** | Solid Blue Button | Submits credentials to `POST /api/auth/token`. If MFA is active, opens Screen 2. |

---

## 2. Screen 2: Multi-Factor Authentication (OTP / TOTP Modal)

**Component:** `LoginPage.tsx` (MFA Sub-Dialog)  
**Purpose:** Verifies secondary identity via 6-digit Email OTP or Authenticator App (Google Authenticator).

### Visual Layout Map with Numbered Indicators
```
+-------------------------------------------------------------------------+
|                       TWO-STEP VERIFICATION                             |
|                                                                         |
|   Enter the 6-digit verification code sent to your registered email:    |
|   comm*******@ramrajcotton.net                                          |
|                                                                         |
|         [1]       [2]       [3]       [4]       [5]       [6]           |
|       +-----+   +-----+   +-----+   +-----+   +-----+   +-----+         |
|       |  4  |   |  9  |   |  2  |   |  8  |   |  1  |   |  0  |         |
|       +-----+   +-----+   +-----+   +-----+   +-----+   +-----+         |
|                                                                         |
|   [7] ⏱ Code expires in: 04:52                                         |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                   [8] VERIFY & ENTER DASHBOARD                  |   |
|   +-----------------------------------------------------------------+   |
|                                                                         |
|   Didn't receive code?  [9] ↻ Resend OTP (Wait 45s)   [10] Cancel & Exit|
+-------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1-6]**| **6-Digit Code Boxes**| 6 Individual Square Inputs | Automatically jumps to next box as you type; supports pasting full code at once. |
| **[7]** | **Countdown Timer** | Yellow Clock Pill | Displays remaining validity time (5 minutes). Rejects expired codes. |
| **[8]** | **Verify Button** | Solid Green Button | Calls `POST /api/auth/verify-otp`. Upon success, stores JWT and loads Dashboard. |
| **[9]** | **Resend OTP** | Blue Link (`↻ Resend Code`) | Invalidates previous code, generates new 6-digit OTP, and emails it. |
| **[10]**| **Cancel Button** | Gray Link | Closes modal and returns to the initial login screen. |

---

## 3. Screen 3: Executive Analytics Dashboard

**Component:** `Dashboard.tsx`  
**Purpose:** High-level executive cockpit showing document processing KPIs, SLA health, and department workloads.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| Executive Dashboard                        [1] Period: [Last 30 Days ▼]  [2] ↻ Refresh  [3] ⬇ Export PDF|
+---------------------------------------------------------------------------------------------------------+
| +--------------------+ +--------------------+ +--------------------+ +--------------------+             |
| | [4] TOTAL UPLOADED | | [5] PENDING ACTION | | [6] OVERDUE / SLA  | | [7] APPROVED VALUE |             |
| | 390 Documents      | | 42 Awaiting Sign   | | 3 Past Deadline    | | ₹ 48,29,150.00     |             |
| | +12% from last wk  | | 5 Urgent Priority  | | Immediate Action   | | 348 Total Approved |             |
| +--------------------+ +--------------------+ +--------------------+ +--------------------+             |
|                                                                                                         |
| [8] INVOICE VOLUME TREND OVER TIME (CHART)                       [9] STAGE BOTTLENECK BREAKDOWN         |
| +--------------------------------------------------------------+ +------------------------------------+ |
| |   30 |         ___                                           | | 1. Initial Ingestion : 4 docs      | |
| |   20 |   /\   /   \    /\                                    | | 2. HOD Review        : 18 docs     | |
| |   10 |  /  \_/     \__/  \                                   | | 3. Finance Audit     : 14 docs     | |
| |    0 +------------------------                               | | 4. CFO Sign-off      : 6 docs      | |
| |       Mon Tue Wed Thu Fri Sat                                | +------------------------------------+ |
| +--------------------------------------------------------------+                                        |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Period Dropdown** | Dropdown (`Today`, `7 Days`, `30 Days`, `Year`) | Recalculates all KPI cards and charts for selected time frame. |
| **[2]** | **Refresh Data** | Button with circular arrow (`↻ Refresh`) | Re-queries `/api/dashboard/stats` without requiring browser page reload. |
| **[3]** | **Export PDF Report** | Blue Button (`⬇ Export PDF`) | Generates executive summary report PDF with charts and volume metrics. |
| **[4]** | **Total Uploaded Card**| Blue Stat Card (`390 Documents`) | Clicking navigates to Work Tracker showing all non-archived files. |
| **[5]** | **Pending Action Card**| Amber Stat Card (`42 Awaiting`) | Clicking filters Work Tracker to documents currently in review. |
| **[6]** | **Overdue SLA Card** | Red Stat Card (`3 Past Deadline`) | Clicking filters Work Tracker to urgent documents that breached SLA hours. |
| **[7]** | **Approved Value Card**| Green Stat Card (`₹ 48.29 Lakh`) | Displays total approved invoice value; clicks to Approved Archive. |
| **[8]** | **Volume Chart** | Interactive Line / Bar Chart | Hovering data points shows exact document counts and dates. |
| **[9]** | **Bottleneck Breakdown**| Progress Bars per Approval Stage | Shows which department is currently holding the highest volume of invoices. |

---

## 4. Screen 4: Drag & Drop Document Ingestion Portal

**Component:** `DocumentUpload.tsx`  
**Purpose:** Upload PDF invoices, gate entry receipts, and supporting documents individually or in batches.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| Document Ingestion & AI Processing Portal                                                                |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|   +-------------------------------------------------------------------------------------------------+   |
|   |                                                                                                 |   |
|   |                                  [1] DRAG & DROP PDF FILES HERE                                 |   |
|   |                                                or                                               |   |
|   |                                     [2] [ Browse Computer ]                                     |   |
|   |                                                                                                 |   |
|   |                             Supports: .PDF, .JPG, .PNG (Up to 25 MB)                            |   |
|   +-------------------------------------------------------------------------------------------------+   |
|                                                                                                         |
|   UPLOAD SETTINGS:                                                                                      |
|   [3] Document Type: [ Standard Vendor Invoice ▼ ]      [4] Division: [ Garments Unit 1 - Tirupur ▼ ]   |
|   [5] [✔] Expedited / High Priority Processing          [6] Auto-extract with GPU AI (Ollama) [✔]       |
|                                                                                                         |
|   STAGED FILES QUEUE (2 Files Ready):                                                                   |
|   +-------------------------------------------------------------------------------------------------+   |
|   | File Name                Size       Type         Priority     Action                            |   |
|   | ----------------------------------------------------------------------------------------------- |   |
|   | INV_Cotton_Supplies.pdf  1.4 MB     Vendor Inv   High         [7] 👁 Preview   [8] 🗑 Remove    |   |
|   | Yarn_Delivery_Challan.pdf 840 KB    GRN Entry    Standard     [7] 👁 Preview   [8] 🗑 Remove    |   |
|   +-------------------------------------------------------------------------------------------------+   |
|                                                                                                         |
|   [9] [ 🗑 Clear All Files ]                                 [10] [ 🚀 START UPLOAD & EXTRACT (2) ]     |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Dropzone Canvas** | Large Dashed Rectangle | Dragging PDF files onto this area stages them for immediate processing. |
| **[2]** | **Browse Computer** | Button: `Browse Computer` | Opens local file explorer dialog filtered to `.pdf` and `.png` files. |
| **[3]** | **Document Type Selector**| Dropdown (`Vendor Invoice`, `GRN`, `PO`)| Tells the backend which AI extraction schema and validation rules to apply. |
| **[4]** | **Division Dropdown** | Dropdown (`Unit 1`, `Retail`, `Spinning`)| Restricts invoice access to personnel assigned to that division. |
| **[5]** | **Expedited Priority** | Checkbox: `High Priority` | Flags document with red "Urgent" pill and shortens review SLA from 24h to 4h. |
| **[6]** | **AI Extraction Toggle** | Checkbox: `Auto-extract with GPU AI`| Sends extracted text to Ollama `llama3.2` for structured field recognition. |
| **[7]** | **File Preview Icon** | Blue Eye Icon (`👁`) | Opens lightweight in-browser modal showing first page of selected PDF. |
| **[8]** | **Remove File Icon** | Red Trash Icon (`🗑`) | Deletes single item from staging list before uploading. |
| **[9]** | **Clear All Button** | Outline Gray Button | Clears all staged files from browser memory. |
| **[10]**| **Start Upload Button**| Solid Green (`🚀 Start Upload & Extract`) | Submits files to `POST /api/documents/upload`. Shows progress bar; navigates to Tracker. |

---

## 5. Screen 5: Work Tracker & Operational Queue

**Component:** `WorkTrackerPage.tsx`  
**Purpose:** Master operations dashboard showing every active document and its progress across approval stages.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| Work Tracker                                                [1] [ + New Upload ]  [2] [ ⬇ Export CSV ]  |
+---------------------------------------------------------------------------------------------------------+
| [3] 🔍 [Search invoice #, vendor, PO...]  [4] Status: [All Active ▼]  [5] Division: [All ▼]  [6] [ Reset]|
+---------------------------------------------------------------------------------------------------------+
| [7] [] (Select All)   [8] BATCH ACTIONS: [✔ Bulk Approve]  [↪ Bulk Reassign]                            |
+---------------------------------------------------------------------------------------------------------+
| [ ] | Invoice #   | Vendor Name       | Date       | Amount (₹)   | Stage / Approver  | SLA   | Actions |
| ----+-------------+-------------------+------------+--------------+-------------------+-------+---------|
| [9] | INV-2026-04 | Sri Murugan Yarn  | 02/11/2026 | 1,45,200.00  | Stage 2: HOD Fin  | 4h    | [10][11]|
| [ ] | INV-2026-05 | Texmo Machinery   | 01/11/2026 |   84,000.00  | Stage 1: Clerk    | 18h   | [10][11]|
| [ ] | INV-2026-06 | Ramraj Logistics  | 31/10/2026 |   22,500.00  | Stage 3: CFO      | ⚠️Exp | [10][11]|
+---------------------------------------------------------------------------------------------------------+
| Showing 1-25 of 142 records                                [12] [< Prev]  Page 1 of 6  [Next >] [13]    |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **New Upload Button** | Solid Blue (`+ New Upload`) | Navigates directly to Screen 4 (Upload Portal). |
| **[2]** | **Export CSV Button** | Outline Button (`⬇ Export CSV`) | Downloads filtered table data to an Excel-compatible spreadsheet. |
| **[3]** | **Search Bar** | Input with search icon | Filters rows in real-time as you type invoice number or vendor name. |
| **[4]** | **Status Filter** | Dropdown (`Pending`, `Under Review`, etc.)| Shows only documents matching the selected operational state. |
| **[5]** | **Division Filter** | Dropdown | Isolates invoices by corporate plant or business unit. |
| **[6]** | **Reset Filter Button**| Gray Button (`Reset`) | Clears search text and resets all dropdown filters to default. |
| **[7]** | **Header Checkbox** | Checkbox at top-left of table | Selects all currently visible rows for batch operations. |
| **[8]** | **Bulk Action Bar** | Floating pill bar | Allows 1-click batch approval or reassignment of all checked rows. |
| **[9]** | **Row Checkbox** | Individual row checkbox | Selects specific invoice for bulk action. |
| **[10]**| **Review / Verify** | Blue Eye Button (`Verify / Open`) | Opens Screen 6 (Split-Screen Verification Cockpit) and acquires edit lock. |
| **[11]**| **Lock Indicator** | Padlock Icon (`🔒`) | Displays name of reviewer who currently holds the active 30s heartbeat edit lease. |
| **[12]**| **Previous Page** | Button: `< Prev` | Navigates to prior page of records. |
| **[13]**| **Next Page** | Button: `Next >` | Navigates to subsequent page of records. |

---

## 6. Screen 6: Split-Screen OCR & Document Verification Cockpit

**Component:** `DataVerificationPage.tsx` & `DocumentDetails.tsx`  
**Purpose:** Core verification screen. Shows PDF on left and AI-extracted data form on right with full sign-off buttons.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| Document Verification: INV-2026-04 (Locked by You)                    [1] ⏱ Lease: 00:28 (Auto-pings)  |
+-------------------------------------------------------------------+-------------------------------------+
| LEFT PANE: INTERACTIVE PDF VIEWER                                 | RIGHT PANE: AI EXTRACTION & FORM    |
|                                                                   |                                     |
| [2] 🔍+  [3] 🔍-  [4] ⊡ Fit  [5] ↻ 90°  [6] Page < 1/2 >  [7] ⬇  | [8] Extraction: 98% AI (Ollama)     |
| +---------------------------------------------------------------+ |                                     |
| |                                                               | | [9] Vendor Name:                    |
| |   TAX INVOICE                                                 | | [ Sri Murugan Yarn Mills Pvt Ltd  ] |
| |   Vendor: Sri Murugan Yarn Mills                              | |                                     |
| |   GSTIN: 33AAAAA0000A1Z5                                      | | [10] GSTIN Number:                  |
| |   Invoice #: INV-2026-04         Date: 02/11/2026             | | [ 33AAAAA0000A1Z5                 ] |
| |                                                               | |                                     |
| |   Items:                                                      | | [11] Invoice #        [12] Date:    |
| |   1. 40s Combed Cotton Yarn      ₹ 1,20,000.00                | | [ INV-2026-04      ]  [ 02/11/2026  ] |
| |   CGST 2.5%                      ₹    3,000.00                | |                                     |
| |   SGST 2.5%                      ₹    3,000.00                | | [13] Total Amount (₹):              |
| |   Total:                         ₹ 1,26,000.00                | | [ 1,26,000.00                     ] |
| |                                                               | |                                     |
| |                                                               | | [14] [ + Add Item ] [15] [ Re-Run AI|
| +---------------------------------------------------------------+ |                                     |
+-------------------------------------------------------------------+-------------------------------------+
| ACTION BAR:                                                                                             |
| [16] [💾 Save Draft]    [17] [❓ Request More Info]    [18] [✖ Reject]         [19] [ ✔ APPROVE & SIGN ]|
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Lease Heartbeat** | Green Pulsing Clock | Shows active editing lease. Heartbeat pings backend every 30s to keep document locked. |
| **[2]** | **Zoom In** | Plus Magnifier (`🔍+`) | Enlarges PDF view by 25% for reading small print. |
| **[3]** | **Zoom Out** | Minus Magnifier (`🔍-`) | Reduces PDF view scale by 25%. |
| **[4]** | **Fit to Width** | Expand Box Icon (`⊡`) | Automatically zooms PDF to fit entire left column width. |
| **[5]** | **Rotate Page** | Arrow (`↻`) | Rotates PDF page 90 degrees clockwise (useful for landscape scanned invoices). |
| **[6]** | **Page Flipping** | Arrows (`<` `1/2` `>`) | Navigates between page 1, 2, and attachments of multi-page invoices. |
| **[7]** | **Download PDF** | Download Tray Icon | Downloads original source PDF file to local workstation. |
| **[8]** | **AI Extraction Badge**| Green Pill: `98% Ollama` | Displays model confidence; confirms extraction was powered by GPU `llama3.2`. |
| **[9]** | **Vendor Field** | Input Field | Editable vendor name. AI auto-populates; edits are tracked in audit trail. |
| **[10]**| **GSTIN Field** | Input Field | Validates 15-character Indian GST format. Warns if invalid. |
| **[11]**| **Invoice # Field** | Input Field | Checks database in real-time for duplicate invoice alerts. |
| **[12]**| **Date Field** | Date Picker | Calendar selector; flags warning if invoice date is older than 90 days. |
| **[13]**| **Total Amount Field**| Currency Input | Gross total; verifies Subtotal + Taxes = Total math. |
| **[14]**| **Add Item Button** | Button: `+ Add Item` | Inserts a blank row into the line-items table for manual data entry. |
| **[15]**| **Re-Run AI Button** | Purple: `Re-Run AI` | Re-submits PDF text to GPU Ollama to re-parse fields if scan was poor. |
| **[16]**| **Save Draft** | Outline Button (`💾 Save Draft`) | Persists field corrections without moving invoice to the next approval stage. |
| **[17]**| **Request More Info** | Amber Button (`❓ Request Info`) | Returns document to uploader with a mandatory query comment. |
| **[18]**| **Reject Button** | Solid Red (`✖ Reject`) | Prompts mandatory rejection reason, marks document `REJECTED`, stops flow. |
| **[19]**| **Approve & Sign** | Solid Green (`✔ Approve & Sign`) | Opens sign-off modal, records digital signature & timestamp, increments stage, and triggers ERP callback if final stage. |

---

## 7. Screen 7: Dedicated Approval Queue

**Component:** `ApprovalQueuePage.tsx`  
**Purpose:** Streamlined inbox showing only invoices where the currently logged-in user is the active assigned reviewer.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| My Pending Approvals (3 Invoices Waiting)                                                               |
+---------------------------------------------------------------------------------------------------------+
| Invoice #     | Vendor Name       | Amount (₹)   | SLA Deadline      | Fast Actions                     |
| --------------+-------------------+--------------+-------------------+--------------------------------- |
| INV-2026-04   | Sri Murugan Yarn  | 1,45,200.00  | [1] ⏱ 3h 45m left | [2] [✔ Approve] [3] [✖] [4] [👁] |
| INV-2026-08   | Shiva Packaging   |   12,400.00  | [1] ⏱ 19h 10m left| [2] [✔ Approve] [3] [✖] [4] [👁] |
| INV-2026-09   | Apex Transports   |    8,900.00  | [1] ⚠️ OVERDUE     | [2] [✔ Approve] [3] [✖] [4] [👁] |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **SLA Countdown** | Pill with clock | Shows remaining time before escalation email triggers to senior management. |
| **[2]** | **Quick Approve** | Green Button (`✔ Approve`) | Signs off invoice immediately with default approval comment without opening full viewer. |
| **[3]** | **Quick Reject** | Red Cross (`✖`) | Prompts for required rejection reason note before marking invoice rejected. |
| **[4]** | **Open Full Review** | Blue Eye (`👁`) | Opens Screen 6 (Full Verification Cockpit) to inspect PDF and line items. |

---

## 8. Screen 8: Approved Documents Archive

**Component:** `ApprovedDocumentsPage.tsx`  
**Purpose:** Permanent, immutable repository of all fully signed and finalized invoices.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| Approved Documents Historical Archive                      [1] [ ⬇ Export All to Excel ]                |
+---------------------------------------------------------------------------------------------------------+
| [2] 🔍 [Search archive by vendor, invoice #, approver...]             [3] Date Range: [This Year ▼]     |
+---------------------------------------------------------------------------------------------------------+
| Invoice #   | Vendor Name       | Final Amount | Completed On | Approved By | Compliance | Actions      |
| ------------+-------------------+--------------+--------------+-------------+------------+------------- |
| INV-2026-01 | Ramraj Spinning   | 3,12,000.00  | 28/10/2026   | HOD + CFO   | [✔ Verified| [4]👁 [5]📜 [6]⬇|
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Export All to Excel**| Solid Green Button | Generates `.xlsx` spreadsheet containing all approved records and approval history. |
| **[2]** | **Archive Search** | Input Box | Performs deep search across historical vendor names, dates, and amounts. |
| **[3]** | **Date Filter** | Dropdown | Limits archive display to specific fiscal quarters or years. |
| **[4]** | **View Document** | Blue Eye (`👁`) | Opens read-only preview of the finalized document. |
| **[5]** | **Audit Certificate**| Scroll Icon (`📜 Certificate`) | Generates cryptographically hashed PDF listing exact sign-off timestamps and users. |
| **[6]** | **Download File** | Download Tray (`⬇`) | Downloads the signed, stamped PDF from `/stored_pdfs/approved/`. |

---

## 9. Screen 9: Visual Flow Builder (Workflow Studio)

**Component:** `FlowBuilder.jsx` (powered by ReactFlow)  
**Purpose:** Drag-and-drop canvas to configure multi-stage approval flows and branch conditions.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| Workflow Studio: [ Vendor Invoices Standard Flow ▼ ]            [1] [ + Stage ] [2] [ + Split ] [3] [💾]|
+---------------------------------------------------------------------------------------------------------+
| [4] VISUAL CANVAS                                                                                       |
|                                                                                                         |
|     +-------------------+         +---------------------+         +---------------------+               |
|     | [5] Ingestion Node| ------> | [6] Stage 1 Node    | ------> | [7] Decision Split  |               |
|     | Document Upload   |         | Reviewer: AP Clerk  |         | If Amount > ₹50,000 |               |
|     +-------------------+         +---------------------+         +----------+----------+               |
|                                                                              |                          |
|                                              +-------------------------------+                          |
|                                              | (Yes)                                 | (No)             |
|                                              v                                       v                  |
|                                   +---------------------+                 +---------------------+       |
|                                   | [8] Stage 2: CFO    |                 | [9] Final Approval  |       |
|                                   +---------------------+                 +---------------------+       |
|                                                                                                         |
| [10] ⊡ Fit Screen  [11] 🔀 Auto-Align Nodes                                                              |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Add Stage Node** | Button: `+ Stage` | Spawns a new approval step box on the visual canvas. |
| **[2]** | **Add Decision Split** | Button: `+ Split` | Spawns a branching condition node (e.g. route based on amount threshold). |
| **[3]** | **Publish Workflow** | Solid Green (`💾 Publish`) | Validates graph for errors and publishes new workflow version to production. |
| **[4]** | **Canvas Area** | Grid Canvas | Interactive drag-and-drop area. Pan by dragging; zoom using mouse wheel. |
| **[5-9]**| **Workflow Nodes** | Rectangular Cards | Click any node to open its configuration drawer (assign approver roles, SLAs). |
| **[10]**| **Fit to Screen** | Icon: `⊡ Fit Screen` | Re-centers and zooms diagram so all nodes fit comfortably on the screen. |
| **[11]**| **Auto-Align** | Icon: `🔀 Auto-Align` | Automatically rearranges messy nodes into neat, symmetrical flow lines. |

---

## 10. Screen 10: Admin User Provisioning & Division Scoping

**Component:** `AdminUsers.jsx`  
**Purpose:** Manage employee logins, assign approval roles, scope divisional access, and reset MFA.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| User Management & Division Access Control                                     [1] [ + Add New User ]    |
+---------------------------------------------------------------------------------------------------------+
| [2] 🔍 [Filter by name, email, Employee ID...]                         [3] Role: [All Roles ▼]          |
+---------------------------------------------------------------------------------------------------------+
| Emp ID  | Full Name        | Email                     | Role         | Division     | Status | Actions |
| --------+------------------+---------------------------+--------------+--------------+--------+-------- |
| EMP101  | Rajesh Kumar     | r.kumar@ramrajcotton.net  | Finance HOD  | Garments U1  | [4]ON  | [5][6]  |
| EMP102  | Ananya Sharma    | a.sharma@ramrajcotton.net | AP Clerk     | Retail Div   | [4]ON  | [5][6]  |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Add New User** | Solid Blue (`+ Add New User`) | Opens modal to enter Employee ID, Name, Email, Role, and Divisions. |
| **[2]** | **User Search** | Input Field | Live search filtering user table by name or ID. |
| **[3]** | **Role Filter** | Dropdown | Filters table by role (e.g., show only `Finance Managers`). |
| **[4]** | **Status Switch** | Green/Gray Toggle (`Active`)| Instantly enables or disables employee login rights. |
| **[5]** | **Edit User** | Pencil Icon (`✏`) | Opens edit modal to change roles or add division permissions. |
| **[6]** | **Reset MFA** | Key Icon (`🔑 Reset MFA`) | Clears employee's authenticator secret; prompts QR scan on next login. |

---

## 11. Screen 11: DAPI Integration Studio & Webhook Callbacks

**Component:** `ApplicationStudioPage.tsx` & `CallbackRulesPage.tsx`  
**Purpose:** Connect FlowApprove with company ERPs (SAP, Tally, Custom APIs) and configure outbound webhook alerts.

### Visual Layout Map with Numbered Indicators
```
+---------------------------------------------------------------------------------------------------------+
| DAPI ERP Integration & Webhook Studio                                   [1] [ + Register Webhook ]      |
+---------------------------------------------------------------------------------------------------------+
| Active Integrations:                                                                                    |
| +-----------------------------------------------------------------------------------------------------+ |
| | Target: [2] SAP S/4HANA Vendor Ledger            URL: https://erp.ramrajcotton.net/api/v1/invoices  | |
| | Events: [✔] On Final Approval   [✔] On Payment Released                                             | |
| | Security: [3] HMAC-SHA256 Signing Active         Status: [4] Healthy (200 OK - 84ms)                | |
| | Actions: [5] [ ⚡ Test Ping ]   [6] [ ↻ View Logs ]   [7] [ ✏ Edit ]   [8] [ 🗑 Delete ]             | |
| +-----------------------------------------------------------------------------------------------------+ |
+---------------------------------------------------------------------------------------------------------+
```

### Button & Control Indicator Table
| # | Control Name | Appearance | What Happens When Clicked |
| :-: | :--- | :--- | :--- |
| **[1]** | **Register Webhook** | Solid Blue (`+ Register`) | Opens configuration form to connect a new ERP callback endpoint. |
| **[2]** | **Integration Name** | Bold Header | Identifies destination ERP system and business purpose. |
| **[3]** | **HMAC Security Tag**| Shield Pill | Confirms outbound payload is cryptographically signed with secret key. |
| **[4]** | **Health Status** | Green Pill: `Healthy (200 OK)`| Shows real-time heartbeat and latency of external ERP endpoint. |
| **[5]** | **Test Ping** | Button: `⚡ Test Ping` | Sends mock test JSON payload to ERP to verify connection immediately. |
| **[6]** | **View Logs** | Button: `↻ View Logs` | Opens sliding drawer showing history of dispatched webhooks and retry attempts. |
| **[7]** | **Edit Webhook** | Button: `✏ Edit` | Modifies destination URL, secret key, or subscribed event triggers. |
| **[8]** | **Delete Webhook** | Trash Icon (`🗑`) | Deletes webhook registration after confirmation prompt. |

---

*End of Visual Screen Manual with Button Indicators.*
