# DocuFlow Automation (FlowApprove) — End-User Manual
**Beginner-Friendly Step-by-Step Operating Guide**  
**Application Version:** 2.0.0  
**Target Audience:** Accounts Payable Staff, Department Approvers, Operational Clerks, and System Administrators  
**Document Classification:** User Operational Manual  

---

## 1. Introduction

### What is DocuFlow Automation?
**DocuFlow Automation** (also known as **FlowApprove**) is a modern, web-based software application designed to manage, verify, and approve company documents—especially vendor invoices, purchase orders, and payment records. 

Instead of printing paper documents, sending manual emails, or carrying physical invoices from desk to desk to collect manager signatures, DocuFlow lets you upload digital invoices, automatically reads the document text using smart artificial intelligence (AI), and routes each document to the right managers for electronic sign-off.

### Why is it Used?
DocuFlow brings speed, accuracy, and full transparency to document approvals:
- **Zero Lost Paperwork:** Invoices cannot get lost on a desk or misplaced in an email inbox.
- **Instant Reading:** The system automatically extracts important details like invoice numbers, supplier names, dates, amounts, and tax breakdowns in seconds.
- **Clear Approval Responsibility:** Every department manager knows exactly which invoices are waiting for their review.
- **Accurate Records:** Every action (who approved what, when, and with what comment) is saved permanently in an unalterable audit log.

### What Problems Does it Solve?
| Old Manual Way | Modern DocuFlow Way |
| :--- | :--- |
| Paper invoices take 5 to 15 days to collect handwritten signatures. | Invoices are reviewed and signed electronically within hours. |
| Staff manually type invoice amounts into computers, leading to typos. | Smart AI scans and types the invoice numbers and amounts automatically. |
| Duplicate invoices get paid twice by mistake. | The system warns you instantly if an invoice number has already been processed. |
| Nobody knows which manager is currently holding an urgent payment. | The real-time tracker shows the exact stage, manager name, and remaining time. |

### Who Can Use It?
- **Document Submitters / Data Entry Clerks:** Upload vendor invoices and review the scanned information.
- **Department Approvers & Managers:** Review invoices, inspect line items, and click **Approve** or **Reject**.
- **Finance & Accounts Payable Officers:** Verify tax breakdowns, perform final audits, and prepare invoices for payment.
- **System Administrators:** Manage user accounts, setup approval rules, and configure notification alerts.

---

## 2. Getting Started

### 2.1 System Requirements
You do not need to install any heavy software or special plugins on your computer. DocuFlow runs directly in any modern web browser:
- **Supported Browsers:** Google Chrome, Microsoft Edge, Mozilla Firefox, or Apple Safari (updated within the last 12 months).
- **Screen Display:** A computer monitor or laptop screen (recommended resolution of 1366 × 768 or higher).
- **Network Connection:** Connected to the company office network or secure company VPN.

### 2.2 How to Access the Application
1. Open your web browser (Chrome or Edge).
2. Click the address bar at the top of the browser.
3. Type the application URL provided by your IT department (for example: `http://192.168.179.22:8085` or your company intranet link) and press **Enter**.
4. The **DocuFlow Login Screen** will appear.

### 2.3 Login Instructions
DocuFlow uses secure multi-factor authentication (MFA) to protect sensitive company financial data.

```mermaid
flowchart TD
    A[Open Login Page] --> B[Enter Username & Password]
    B --> C[Click 'Sign In']
    C --> D{Is Two-Factor Auth (MFA) Enabled?}
    D -- Yes --> E[Enter 6-Digit Code from Authenticator App or SMS]
    E --> F[Click 'Verify Code']
    D -- No --> G[Direct Access Granted]
    F --> H[Welcome to DocuFlow Dashboard]
    G --> H
```

#### Step-by-Step Login:
1. **Enter Your Username:** Type your registered company email address or username into the **Username / Email** box.
2. **Enter Your Password:** Type your password into the **Password** box. Click the eye icon if you wish to show the characters to check for typos.
3. **Click the Sign In Button:** Click the blue **Sign In** button.
4. **Complete Two-Factor Verification (If Prompted):**
   - If your account has two-factor authentication enabled, a prompt will ask for a **6-Digit Security Code**.
   - Open your mobile phone's authenticator app (such as Google Authenticator or Microsoft Authenticator) or check your SMS/email.
   - Type the 6 numbers into the boxes and click **Verify Code**.
5. **Dashboard Loads:** Once verified, you will be taken directly to the main application dashboard.

> [!TIP]
> If you enter an incorrect password 5 times in a row, the system locks your account for 30 minutes to protect against hackers. If this happens, contact your system administrator to unlock your profile.

---

## 3. Understanding the Dashboard

When you log in, the **Main Dashboard** provides an executive summary of all document operations across your division.

```
+---------------------------------------------------------------------------------------------------+
|  [DocuFlow Logo]   Search documents...        [Division: Apparel v]   [Bell Icon]   [User: John Doe] |
+---------------------------------------------------------------------------------------------------+
|  SIDEBAR           |  EXECUTIVE DASHBOARD                                                        |
|  ----------------- |  -------------------------------------------------------------------------  |
|  [o] Dashboard     |  +----------------+  +----------------+  +----------------+  +-------------+  |
|  [+] Upload Ingest |  | TOTAL INVOICES |  | PENDING REVIEW |  | APPROVED TODAY |  | SLA BREACH  |  |
|  [=] Work Tracker  |  |      1,420     |  |       38       |  |       12       |  |      2      |  |
|  [*] Approvals     |  +----------------+  +----------------+  +----------------+  +-------------+  |
|  [v] Verification  |                                                                             |
|  [x] Approved Docs |  MONTHLY THROUGHPUT CHART                 PENDING APPROVAL QUEUE            |
|  [?] Feedback      |  [Bar chart showing invoices approved]   [Table of invoices waiting on you]|
|  ----------------- |                                                                             |
|  [#] Admin Portal  |                                                                             |
+---------------------------------------------------------------------------------------------------+
```

### Main Screen Elements

1. **Top Header Bar:**
   - **Company / Application Logo:** Clicking this at any time returns you to your home Dashboard.
   - **Global Search Box:** Allows you to quickly search for any invoice by typing the invoice number, supplier name, or PO number.
   - **Division Selector:** If your account has access to multiple company divisions (such as Weaving, Spinning, or Garments), this dropdown lets you switch between them.
   - **Notification Bell:** Displays real-time alerts when a new document is assigned to you or when an invoice SLA is approaching its deadline.
   - **User Profile Menu:** Displays your name and role. Clicking this lets you view your profile details or click **Logout**.

2. **Left Navigation Sidebar:**
   - **Dashboard:** Returns to the summary overview.
   - **Upload & Ingest:** Open the file dropzone to upload new invoices.
   - **Work Tracker:** View all active documents across the enterprise categorized by their current stage.
   - **Approvals (Approval Queue):** Your personal inbox containing only the documents waiting for your approval.
   - **Data Verification:** A specialized screen to double-check and correct AI-scanned invoice numbers and amounts.
   - **Approved Documents:** The completed archive of all finalized and signed documents.
   - **Customer Feedback:** A dedicated review screen for customer service feedback forms.
   - **Admin Portal (Visible to Admins only):** Settings for users, roles, workflow rules, and audit logs.

3. **Dashboard KPI Summary Cards:**
   - **Total Documents:** The total number of invoices uploaded into your division this month.
   - **Pending Review:** Documents currently in active review that have not yet reached final approval.
   - **Approved Today:** Invoices that completed their final sign-off today.
   - **SLA Breaches / Urgent:** Documents that have been waiting longer than the permitted time limit (e.g., 24 or 48 hours) and require immediate attention.

---

## 4. Step-by-Step User Instructions

### Feature 1: Uploading a Document

#### 1. What the feature does
Allows you to upload PDF invoice files, scanned images (PNG, JPG), or batch files from your computer into DocuFlow.

#### 2. Why you need it
To introduce new vendor bills or documents into the electronic approval pipeline so the system can read them and route them to managers.

#### 3. Where to find it
Click **Upload & Ingest** in the left navigation sidebar.

#### 4. Which button to select
Click the large dashed upload box or the **Browse Files** button. You can also drag and drop a PDF file directly from your computer folder into the box.

#### 5. What information to enter
1. Select the **Document Type** (for example: *Vendor Invoice*, *Purchase Order*, or *Customer Feedback*).
2. Confirm the correct **Company Division** from the dropdown menu.
3. Select your file (maximum file size is 50 Megabytes).

#### 6. What happens after the action
The application immediately displays a progress bar. In the background, the smart OCR and AI reader starts scanning the pages to identify invoice numbers, dates, supplier names, and line items.

#### 7. How to confirm success
Within 5 to 10 seconds, the screen updates to show a green banner: **"Extraction Complete — Preview Ready"**. The extracted fields will appear on your screen alongside a preview of your document.

#### 8. What to do if something goes wrong
- **Error: "File format not supported":** Ensure your document is a `.pdf`, `.png`, or `.jpg` file. Word documents (`.docx`) or text files must be saved as PDF first.
- **Error: "File size exceeds limit":** Compress the PDF file or ensure it is below 50MB.

---

### Feature 2: Checking and Correcting Extracted AI Information

#### 1. What the feature does
Displays the original PDF on the left side of your screen and the computer-read fields on the right side in editable form boxes.

#### 2. Why you need it
Even advanced AI can misread faint, handwritten, or poorly scanned documents. This screen allows you to verify that the extracted amounts and vendor names match the paper bill before saving.

#### 3. Where to find it
Immediately appears after upload preview, or accessible by clicking **Data Verification** in the left sidebar.

#### 4. Which buttons to use
- Click into any text box on the right to edit details.
- Use the **Zoom In (+)** and **Zoom Out (-)** buttons above the PDF to read small numbers clearly.
- Click the blue **Confirm & Ingest** button at the bottom right when you are finished.

#### 5. What information to check
Verify these 5 critical fields:
1. **Vendor / Supplier Name:** Does it match the company printed at the top of the invoice?
2. **Invoice Number:** Are all digits, dashes, and slashes typed correctly?
3. **Invoice Date:** Is the date formatted correctly (`YYYY-MM-DD`)?
4. **Total Gross Amount:** Does the total amount match the bottom line of the invoice?
5. **Tax Breakdown:** Check that CGST, SGST, or IGST tax amounts match the invoice totals.

#### 6. What happens after the action
Clicking **Confirm & Ingest** saves the invoice permanently into the database, assigns a unique tracking number (e.g., `DOC-2026-00812`), and assigns it to the Stage 1 Approver.

#### 7. How to confirm success
A notification appears stating: **"Document DOC-2026-XXXXX successfully submitted to workflow"**, and the document moves into the active queue.

#### 8. What to do if something goes wrong
- **Warning: "Duplicate invoice detected":** The system found an existing document with the exact same invoice number and vendor name. Check whether this bill was already uploaded earlier.

---

### Feature 3: Viewing Your Pending Approval Queue

#### 1. What the feature does
Shows a clean list of all invoices and documents currently waiting for your personal review and signature.

#### 2. Why you need it
Department managers need a quick, focused inbox without searching through thousands of other department files.

#### 3. Where to find it
Click **Approvals** (or **Approval Queue**) in the left sidebar.

#### 4. Which button to select
Click directly on any document row in the table to open its full detail screen.

#### 5. What information to view
The table displays:
- **Document ID:** The system tracking number.
- **Invoice Number & Date:** The vendor's bill number and invoice date.
- **Vendor Name:** Who submitted the bill.
- **Total Amount:** The gross amount requiring payment.
- **Current Stage:** Which approval level this document is currently at (e.g., *Stage 1: HOD Review*).
- **Time Remaining (SLA):** Hours left before the document breaches its deadline.

#### 6. What happens after the action
The **Document Details** screen opens, showing the document preview, line items, and approval buttons.

---

### Feature 4: Approving a Document

#### 1. What the feature does
Electronically records your signature and advances the document to the next approval stage or final payment status.

#### 2. Why you need it
To authorize payment for goods and services received by your department.

#### 3. Where to find it
Inside the **Document Details** inspection view, located at the top-right corner or bottom action panel.

#### 4. Which button to select
Click the green **Approve** button.

#### 5. What information to enter
An approval confirmation dialog will pop up:
- **Comments Box (Optional for approvals):** You can type any helpful note (e.g., *"Materials verified against PO #99482, approved for payment"*).
- Click the confirm button: **Submit Approval**.

```
+-------------------------------------------------------------+
|  Confirm Approval                                           |
|  ---------------------------------------------------------  |
|  Are you sure you want to approve Invoice INV-2026-8941?    |
|  Amount: INR 142,500.00                                     |
|                                                             |
|  Approval Comments (Optional):                              |
|  [ Materials verified against PO #99482                   ] |
|                                                             |
|              [ Cancel ]         [ Confirm & Approve (Green) ]|
+-------------------------------------------------------------+
```

#### 6. What happens after the action
The document's version number increments, your approval timestamp is permanently recorded in the audit trail, and the invoice is moved to the next manager's queue. If you are the final approver, the invoice status changes to **Approved**.

#### 7. How to confirm success
A green alert appears: **"Document approved successfully"**. The document disappears from your pending approvals list and moves forward.

#### 8. What to do if something goes wrong
- **Error: "Conflict / Version Mismatch (409)":** Another manager or administrator modified or approved this document a few seconds before you clicked the button. Simply refresh your page to see the latest status.

---

### Feature 5: Rejecting a Document

#### 1. What the feature does
Halts the approval process and rejects the invoice, preventing any payment from being issued.

#### 2. Why you need it
If an invoice is incorrect, fraudulent, billed for the wrong department, or contains unauthorized charges.

#### 3. Where to find it
Inside the **Document Details** inspection view.

#### 4. Which button to select
Click the red **Reject** button.

#### 5. What information to enter
- **Rejection Reason (MANDATORY):** You **must** type a clear explanation of why the bill is being rejected (e.g., *"Quantity billed is 500 units, but warehouse received only 350 units. Please request credit note from vendor"*).
- Click **Confirm Rejection**.

#### 6. What happens after the action
The document lifecycle stops immediately. The status changes to **Rejected**. An email alert with your rejection reason is automatically sent to the person who uploaded the document.

#### 7. How to confirm success
The screen displays **"Document marked as Rejected"**, and the status badge updates to red.

---

### Feature 6: Placing a Document on Hold or Requesting More Info

#### 1. What the feature does
Temporarily pauses the document without approving or rejecting it.

#### 2. Why you need it
- **Hold:** When you are waiting for a shipment delivery or physical quality check before signing off. Putting a document on hold pauses the SLA timer so you do not get penalized for delays.
- **Request More Info / Send Back:** When a supporting document (like a delivery challan or PO copy) is missing and you need the uploader to attach it.

#### 3. Where to find it
Inside the **Document Details** screen next to the Approve and Reject buttons.

#### 4. Which button to select
Click the amber **Hold** button or the blue **Send Back** button.

#### 5. What information to enter
Type the reason for the hold or what additional information is required in the dialog box, then click **Confirm**.

#### 6. What happens after the action
The document status changes to **On Hold** or **More Info Requested**. The uploader is notified to provide the answers or missing files.

---

### Feature 7: Reviewing Approved Documents and Downloading Signed Copies

#### 1. What the feature does
Provides an unalterable searchable archive of every document that has completed its approval cycle.

#### 2. Why you need it
For finance audits, vendor payment confirmation, and tax compliance checks.

#### 3. Where to find it
Click **Approved Documents** in the left sidebar.

#### 4. Which button to select
- Use the search bar at the top of the table to find specific vendor names or invoice numbers.
- Click the blue **Download PDF** icon on the right side of any row.

#### 5. What happens after the action
The system generates a secure, temporary signed link and downloads the original PDF along with its stamped electronic approval audit log directly to your computer's `Downloads` folder.

---

### Feature 8: Searching and Filtering Documents

#### 1. What the feature does
Enables you to quickly locate any invoice among thousands of historical records using multiple search filters.

#### 2. Where to find it
At the top of the **Work Tracker**, **Approvals**, or **Approved Documents** screens.

#### 3. Available Filters:
- **Search Text:** Type an invoice number, vendor name, or PO number.
- **Status Filter:** Select *All*, *Pending*, *In Progress*, *Approved*, *On Hold*, or *Rejected*.
- **Date Range:** Filter by start date and end date.
- **Division Filter:** Limit records to a specific factory or business unit.

---

## 5. Understanding Document Statuses

DocuFlow uses color-coded status badges to show the exact state of every document at a glance.

| Status Badge | Color | What It Means | What You Should Do |
| :--- | :---: | :--- | :--- |
| **Pending** | Yellow | The invoice was uploaded and is waiting for initial workflow assignment or Stage 1 review. | If you are the uploader, wait for review. If you are an approver, open the document to inspect it. |
| **In Progress (Stage 1 / 2 / 3)** | Blue | The invoice is actively moving through the approval hierarchy (e.g., currently waiting on Department Head or General Manager). | The assigned manager for that stage should review and approve. Other users can view read-only progress. |
| **Approved** | Green | The invoice has received all required manager signatures and is finalized. | Finance team can now proceed with payment disbursement or ERP export. No further user action required. |
| **Rejected** | Red | The invoice was declined by an approver due to errors, price discrepancies, or invalid billing. | Read the rejection comments in the audit history. Contact the vendor to issue a revised invoice. |
| **On Hold** | Amber | An approver paused the invoice (e.g., waiting for goods delivery or price verification). | SLA countdown is paused. The approver will click **Unhold** once the issue is clarified. |
| **More Info Requested** | Purple | The approver asked a specific question or requested missing attachments from the submitter. | The original submitter must open the document, answer the questions or attach the missing files, and resubmit. |
| **Returned** | Orange | The document was sent backward to a previous stage or to the uploader for corrections. | Review the approver's feedback notes, correct the fields, and click **Resubmit**. |

---

## 6. Understanding AI and OCR Results

### What is OCR?
**OCR** stands for **Optical Character Recognition**. It is like a digital scanner that looks at pictures of words and letters inside a PDF file and turns them into real computer text that can be searched, copied, and stored.

### How Does the AI Extract Information?
DocuFlow uses an advanced local Artificial Intelligence engine. Once the OCR reads the text of an invoice, the AI reads through the words just like a human clerk would. It automatically identifies:
- Where the **Vendor Name** is printed (usually at the very top).
- Where the **Invoice Number** and **PO Number** are located.
- The **Invoice Date** and **Payment Due Date**.
- The table of **Line Items** (descriptions, quantities, unit prices, and line totals).
- The **Tax Amounts** (CGST, SGST, IGST) and final **Total Gross Amount**.

### Why Extracted Information May Sometimes Be Incorrect
While the AI is very accurate, mistakes can occasionally happen if:
1. **Low Scan Quality:** The invoice was scanned crookedly, contains faint ink, or has dark shadows.
2. **Handwritten Notes:** Handwritten numbers or signatures overlapping printed text.
3. **Unusual Layouts:** Foreign invoices or unusual invoice designs where totals are placed in unexpected locations.
4. **Similar Characters:** The scanner might confuse the number `0` with the letter `O`, or the number `1` with the letter `I` or `l`.

### How to Verify and Correct Information
The **Data Verification** screen is specifically designed so that humans always have the final say:
1. Look at the numbers printed on the PDF image on the left.
2. Compare them with the values typed into the form boxes on the right.
3. If an amount or invoice number is wrong, simply click into the box, delete the wrong character, and type the correct number.
4. Click **Confirm & Ingest**. Once confirmed, your human-verified values are what gets saved.

---

## 7. Common Problems and Solutions

The following troubleshooting guide helps you resolve common daily issues quickly without waiting for IT support.

| Problem | Possible Reason | What the User Should Do |
| :--- | :--- | :--- |
| **Cannot log in; message says "Invalid credentials"** | Incorrect username or password entered; Caps Lock might be on. | Check that Caps Lock is off. Re-type your password carefully. If forgotten, click **Forgot Password** or contact IT. |
| **Account is locked out** | Password was entered incorrectly 5 consecutive times. | Wait 30 minutes for the automatic security unlock, or ask your system administrator to unlock your account immediately. |
| **Two-factor authentication code rejected** | The 6-digit code expired (they change every 30 seconds), or phone time is out of sync. | Wait for the next 6-digit code to generate on your phone and type it in immediately. Ensure your phone clock is set to automatic network time. |
| **Upload button does nothing or gives an error** | The file is not a supported format or is larger than 50MB. | Ensure your file ends in `.pdf`, `.jpg`, or `.png`. If your PDF is too large, compress it before uploading. |
| **Cannot find an invoice that was uploaded earlier** | The wrong company division is selected in the top menu, or a filter is active. | Check the **Division** dropdown in the top header. Clear all search filters by clicking **Reset Filters**. |
| **Approve button is greyed out (disabled)** | You are not the assigned approver for the current stage, or another user is currently viewing the document. | Check the **Assigned Approver** field. If it says another manager's name, that person must approve first. If it says "Locked by Jane Doe", wait a moment for Jane to close the document. |
| **"Version Conflict (409)" error when approving** | Two managers clicked approve at almost the same second, or the document was updated. | Refresh your web browser page (press `F5` or `Ctrl + R`). The page will reload with the latest status. |
| **Document says "SLA Breached" in red** | The document stayed in an approval stage longer than the allowed time (e.g., 24 hours). | Open the document and complete your approval immediately, or reassign it to a delegate approver if the manager is out of office. |

---

## 8. Frequently Asked Questions (FAQ)

#### Q1: Can I use DocuFlow on my mobile phone or tablet?
**Answer:** Yes. DocuFlow has a responsive web design that adapts to smartphone and tablet screens. Open Chrome or Safari on your mobile device, enter the website address, and log in normally.

#### Q2: Can I approve multiple invoices at the same time?
**Answer:** Yes. In the **Approvals** screen, you can check the small square checkboxes on the left side of multiple invoice rows. When multiple rows are selected, a blue **Batch Approve** button appears at the top of the table.

#### Q3: What happens if I go on annual leave? Will my invoices get stuck?
**Answer:** No. DocuFlow includes an automatic escalation rule. If an invoice sits in your queue past its SLA time limit (e.g., 24 or 48 hours), the system will automatically notify your designated **Delegate Approver** so payments are never delayed. You can also ask an administrator to set up temporary delegation before you go on leave.

#### Q4: Is my electronic approval legally binding?
**Answer:** Yes. When you click **Approve**, the system binds your unique user identity, email, role, IP address, and an exact cryptographic timestamp to the document audit record. This fulfills enterprise compliance and legal audit standards.

#### Q5: Can I delete an invoice after uploading it?
**Answer:** Regular users cannot permanently delete invoices once submitted to prevent accidental loss or audit tampering. If you uploaded the wrong document by mistake, open it and click the **Cancel / Reject** button and type *"Uploaded wrong file by mistake"*. System administrators have special permissions to archive or remove duplicate files if needed.

#### Q6: Does DocuFlow send my documents to external cloud AI companies?
**Answer:** No. DocuFlow is built with strict enterprise privacy. All OCR reading and AI extraction runs completely inside your company's own secure servers. No vendor data or invoice amounts ever leave your company's private network.

---

## 9. Important Safety Instructions

Please observe the following operational and cybersecurity safety practices while using DocuFlow:

1. **Protect Your Login Credentials:**
   - Never share your username, password, or two-factor authenticator codes with anyone, including coworkers or IT personnel.
   - Always click **Logout** from your profile menu when leaving your computer workstation unattended.

2. **Always Verify Critical Invoice Numbers:**
   - While the AI is highly intelligent, you must always take 5 seconds to cross-check the **Vendor Name**, **Total Amount**, and **Bank/GSTIN details** against the original PDF image before approving high-value invoices.

3. **Prevent Duplicate Submissions:**
   - Before uploading a paper invoice that arrived in the mail, verify whether the vendor already emailed a digital copy. Pay attention to yellow or red **Duplicate Warning** banners on the screen.

4. **Respect Document Confidentiality:**
   - Do not download approved PDFs or sensitive employee payroll/contract documents onto personal USB flash drives or unmanaged personal laptops.

5. **When to Contact Your Administrator:**
   - Contact your administrator immediately if:
     - You suspect someone else knows your password.
     - You lose the mobile phone containing your authenticator app.
     - You change departments and need your approval permissions updated.
     - An invoice is stuck with an error that does not clear after refreshing.

---

## 10. Quick Reference Guide (Daily Operational Checklist)

Print or bookmark this quick checklist for your daily morning routine:

```
+-----------------------------------------------------------------------------------------+
|                        DOCUFLOW DAILY OPERATIONAL CHECKLIST                             |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|  [ ] 1. SIGN IN:                                                                        |
|      * Open DocuFlow in Chrome or Edge.                                                 |
|      * Enter username and password; complete 2-factor code if prompted.                 |
|                                                                                         |
|  [ ] 2. CHECK YOUR DIVISION:                                                            |
|      * Verify that the top header displays your correct factory / company division.     |
|                                                                                         |
|  [ ] 3. REVIEW URGENT ALERTS (SLA BREACHES):                                            |
|      * Look at the "SLA Breaches" card on your Dashboard.                               |
|      * Clear any red or urgent pending approvals first.                                 |
|                                                                                         |
|  [ ] 4. PROCESS YOUR PENDING QUEUE:                                                     |
|      * Click "Approvals" in the left sidebar.                                           |
|      * Open each document, inspect the PDF on the left and values on the right.         |
|      * Click "Approve" (with optional note) or "Reject" (with mandatory reason).        |
|                                                                                         |
|  [ ] 5. UPLOAD NEW INVOICES:                                                            |
|      * Click "Upload & Ingest".                                                         |
|      * Drag and drop new vendor PDF bills.                                              |
|      * Verify the extracted preview in "Data Verification" and click "Confirm".         |
|                                                                                         |
|  [ ] 6. SIGN OUT:                                                                       |
|      * When finished for the day, click your name in the top right and select "Logout". |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

---

*End of User Manual — DocuFlow Automation (FlowApprove v2.0.0)*
