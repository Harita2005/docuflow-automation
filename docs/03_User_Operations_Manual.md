# DOCUFLOW AUTOMATION SYSTEM — USER OPERATIONS MANUAL
**Document Version:** 2.4.0  
**Target Audience:** Operations Staff, Accounts Approvers, Department Managers, End Users  
**Classification:** Operational End-User Manual  

---

## TABLE OF CONTENTS
1. [Introduction for New Users](#1-introduction-for-new-users)
2. [Signing In & Navigation](#2-signing-in--navigation)
3. [Dashboard Workload Overview](#3-dashboard-workload-overview)
4. [Uploading Invoices & Documents](#4-uploading-invoices--documents)
5. [Work Tracker (My Pending Queue)](#5-work-tracker-my-pending-queue)
6. [Inspecting & Verifying Invoices](#6-inspecting--verifying-invoices)
7. [Approving, Holding, & Rejecting Invoices](#7-approving-holding--rejecting-invoices)
8. [Viewing Approved & Historical Records](#8-viewing-approved--historical-records)
9. [Notification Center & Alerts](#9-notification-center--alerts)
10. [Common Troubleshooting & FAQs](#10-common-troubleshooting--faqs)

---

## 1. INTRODUCTION FOR NEW USERS

Welcome to DocuFlow! This guide walks you through processing invoices and documents assigned to you, completing stage checklists, and signing off on approvals.

---

## 2. SIGNING IN & NAVIGATION

1. Open DocuFlow in your web browser (`http://<server-ip>:5173`).
2. Enter your email and password, then click **Sign In**.
3. Use the left navigation panel to switch between available pages:
   - **Dashboard:** Overview of active invoice counts.
   - **Work Tracker:** Documents pending your explicit action.
   - **Approved Docs:** Archive of settled bills.
   - **Upload Document:** Ingest new supplier invoices.

---

## 3. DASHBOARD WORKLOAD OVERVIEW

- **KPI Cards:** Click any KPI card (**PENDING**, **ON HOLD**, **REJECTED**, **APPROVED**) to instantly filter your view.
- **Doc Type Pills:** Filter by AP Invoice, Freight Invoice, Utility Bill, or Capex.

---

## 4. UPLOADING INVOICES & DOCUMENTS

*(Available if your role includes `upload` permission)*

1. Click **Upload Document** on the left menu.
2. Choose **Division** (e.g. `VCC`) and **Expense Category** (e.g. `Standard AP Invoice`).
3. Drag and drop your invoice PDF/Image file into the upload zone.
4. Click **Run Automated OCR Extraction**.
5. Review extracted fields (Vendor Name, Invoice Number, Gross Amount, Base Amount, 18% GST).
6. Click **Submit & Queue Document**.

---

## 5. WORK TRACKER (MY PENDING QUEUE)

- **Assigned View:** Work Tracker shows **ONLY** documents currently assigned to you at your active approval stage.
- **Assigned To Column:** Displays assignee name, role badge, or approval pool.
- **Status Pills:** Indicates current workflow stage (`Stage 1 Review`, `Stage 2 Approval`).

---

## 6. INSPECTING & VERIFYING INVOICES

1. Click any document row in Work Tracker to open the **Document Inspection Drawer**.
2. **Review Header:** Check Supplier Name, Invoice Date, PO Reference, and Gross Amount.
3. **Mandatory Checklist:** You must check all mandatory stage verification boxes (e.g., *"GSTIN Validated"*, *"PO Lines Match"*) before approving.

---

## 7. APPROVING, HOLDING, & REJECTING INVOICES

- **APPROVE & PASS STAGE:**
  1. Complete mandatory checklist.
  2. Click **Approve & Pass Stage**.
  3. Enter optional sign-off remarks and click **Confirm Approval**.
- **HOLD / PAUSE WORKFLOW:**
  1. Click **Hold / Pause**.
  2. **Required:** Type explicit clarification comments explaining what supplier information is missing.
  3. Click **Confirm Hold**.
- **REJECT INVOICE:**
  1. Click **Reject Document**.
  2. **Required:** Type rejection command notes.
  3. Click **Confirm Rejection**.

---

## 8. VIEWING APPROVED & HISTORICAL RECORDS

1. Click **Approved Docs** in the left menu.
2. Search by Vendor Name, Invoice Number, or Date Range.
3. Click **Download Signed PDF** to download the physical invoice stamped with digital approval signatures.

---

## 9. NOTIFICATION CENTER & ALERTS

- Click the **Bell Icon** (`🔔`) in the top header bar to view real-time workflow notifications.
- Unread count badge indicates new assignments or stage updates.

---

## 10. COMMON TROUBLESHOOTING & FAQS

| Issue | Reason | Solution |
| :--- | :--- | :--- |
| **Cannot Approve Document** | Unchecked mandatory checklist item | Check all required verification items first |
| **Hold/Reject Button Grayed Out** | Comments box empty | Type explanation in the mandatory comment field |
| **Document Not in Work Tracker** | Assigned to another user/stage | Check if document is at your current stage |
