# DocuFlow Automation System (DASS / FlowApprove)
## Application Overview & Research Report

**Document ID:** DASS-RES-01  
**Verification Status:** Verified against Live Running Application (React 19 / FastAPI 0.115 / Microsoft SQL Server 2022)  
**Target Audience:** Non-technical Business Users, Operations Executives, Approvers, and System Administrators  

---

### 1. What is DocuFlow Automation System?
DocuFlow Automation System (also branded in user interfaces as **FlowApprove** or **DAAS**) is an intelligent, automated enterprise document approval and tracking platform.

In simple terms:
Instead of manually printing, emailing, checking paper invoices, or tracking customer complaints across spreadsheets, DocuFlow automatically receives documents, extracts their key details using Artificial Intelligence (Optical Character Recognition / AI), routes them to the right managers for review, verifies required checklist items, and tracks every step until final approval.

### 2. Primary Business Problems Solved
1. **Elimination of Lost Paperwork:** Invoices and customer feedback records are digitally indexed and securely archived.
2. **Automated Data Capture:** Rather than staff manually typing in invoice numbers, dates, and amounts, the system automatically reads digital PDFs and scans.
3. **Deterministic Multi-Stage Routing:** Documents automatically travel from Stage 1 (Initial Review) to Stage 2 (Technical/Department Review) and Stage 3 (Accounts/Finance Settlement) according to predefined business policies.
4. **Mandatory Compliance Checklists:** Approvers cannot accidentally approve a document without confirming critical business prerequisites (e.g. Purchase Order match, signature present, valid tax registration).
5. **Real-Time Visibility:** At any second, employees and department heads can see exactly whose desk a document is currently sitting on and how long it has been waiting.
6. **Seamless ERP Synchronization:** Approved invoices and complaints automatically sync back to external ERP software (e.g. SAP, Tally, Ramraj ERP) without human re-entry.

---

### 3. Key User Persona Classifications

Based on verified access control rules in the source code:

| User Type | Everyday Persona | Primary Focus & Routine | Permitted System Views |
|---|---|---|---|
| **Employee / Data Operator** | Accounts Clerk, Field Staff, General Staff | Submits documents, monitors personal submissions, and checks status of pending items. | Dashboard, Work Tracker, Customer Feedback, Approved Documents. |
| **Department Reviewer / Manager** | Store Manager, Plant Head, Operations Supervisor | Reviews incoming invoices for their division, checks goods received, verifies checklist items, and signs off on Stage 1 or Stage 2. | Dashboard, Work Tracker, Approved Documents, Customer Feedback, Document Details. |
| **Finance / Accounts Approver** | Accounts Payable Officer, Finance Manager | Performs financial verification (tax, calculations, bank details) and grants final payment approval. | Dashboard, Work Tracker, Approved Documents, Document Details, Payment Readiness. |
| **System Administrator** | IT Lead, Systems Manager, Security Auditor | Manages user accounts, configures workflow routing conditions, assigns roles, configures ERP connections, and audits security logs. | Complete access to all 12 operational views, including Workflow Rules, Control Settings (Admin), and Integration Studio. |

---

### 4. Application Architecture & Navigation Philosophy

DocuFlow is designed as a **Single-Page Application (SPA)** with a fixed top navigation header and an expandable/collapsible left sidebar:

```
+-----------------------------------------------------------------------------------+
|  [Logo] FlowApprove         [Search Documents...]       [Notifications] [Profile] |
+------------------+----------------------------------------------------------------+
|  SIDEBAR         |  MAIN CONTENT VIEWPORT                                         |
|  - Dashboard     |                                                                |
|  - Work Tracker  |  Active Page: Cards, Tables, Forms, or Document Viewer          |
|  - Approved Docs |                                                                |
|  - Upload Doc    |                                                                |
|  - Feedback      |                                                                |
|  - Workflows*    |                                                                |
|  - Admin*        |                                                                |
+------------------+----------------------------------------------------------------+
  * Visible only to authorized roles (Admins, Settings Editors)
```

#### Navigation Highlights:
- **Collapsible Sidebar:** Clicking the sidebar toggle button shrinks the menu to slim icon mode (64px width), maximizing screen real estate for viewing complex invoices and comparison tables.
- **Dynamic Address Bar Synchronization:** As users navigate between pages or view specific documents (e.g. `/customer-feedback/CMP-00000172`), the browser URL updates automatically, allowing easy bookmarking.
- **Multi-Tab Session Sync:** If a user logs out in one tab or their session expires, all other open browser tabs instantly synchronize and display the secure login screen.
- **20-Minute Inactivity Protection:** To prevent unauthorized access on unattended office computers, the system warns users at 18 minutes of idle time and automatically logs them out at 20 minutes.
