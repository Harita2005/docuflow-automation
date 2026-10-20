# Validation and Error Messages Troubleshooting Guide
**Document ID:** DASS-RES-05  
**Target Audience:** All End Users, Team Leads, and Level 1 Helpdesk Support  

---

## 1. Authentication & Session Errors

### 1.1 "Invalid or expired OTP. Please check your email or request a new code."
- **What You See:** A red banner under the OTP input boxes during login.
- **Plain English Meaning:** The 6-digit code entered does not match the code sent to your email, or more than 10 minutes have elapsed since it was generated.
- **What You Should Do:** Wait 30 seconds and click **Resend OTP** to receive a brand-new code. Make sure to enter the most recent code received.
- **When to Contact IT:** If you do not receive any email after 2 minutes, check your Spam/Junk folder first, then contact your IT support desk.

### 1.2 "Your session was terminated because your account was logged in from another device/browser."
- **What You See:** A warning modal appears and your session locks, returning you to the login screen.
- **Plain English Meaning:** For your security, DocuFlow only permits one active session per account at a time. Someone signed into your account from another computer or tab.
- **What You Should Do:** If you switched computers or opened another browser, simply log in again. If you did not log in elsewhere, contact IT immediately to check your account security.

### 1.3 "Rate limit exceeded for login. Please wait 60 seconds before trying again."
- **What You See:** An error modal reading HTTP 429 Too Many Requests.
- **Plain English Meaning:** The security system detected more than 15 login attempts within one minute from your computer and temporarily paused logins to prevent automated password guessing.
- **What You Should Do:** Take your hands off the keyboard and wait exactly one full minute (60 seconds) without clicking. Then try logging in once carefully.

---

## 2. Document Review & Approval Errors

### 2.1 "Please complete all required checklist items before approving."
- **What You See:** An amber alert box appears above the Approve button, and the document does not advance.
- **Plain English Meaning:** Your company policy mandates that specific checks must be signed off before this document can be approved.
- **What You Should Do:** Scroll down to the **Compliance Checklist** section in the right-hand panel. Review each item and check the box confirming you have verified it. Once all boxes are checked, click Approve again.

### 2.2 "Please provide a rejection reason."
- **What You See:** The confirmation button is disabled or an alert appears when trying to reject an invoice.
- **Plain English Meaning:** To maintain accountability, the system forbids silent rejections. A written reason is mandatory so the submitting employee knows what to correct.
- **What You Should Do:** Type a brief explanation in the text box (e.g. *"Tax amount does not match PO"*) and then submit.

### 2.3 "Conflict (409): Document was modified by another approver. Please refresh."
- **What You See:** An error banner appears when you click Approve, Reject, or Hold.
- **Plain English Meaning:** While you had the document open on your screen, another authorized manager (or system administrator) took action on it in another session.
- **What You Should Do:** Click the blue **Refresh** button at the top of your screen to load the latest state of the document.

---

## 3. Document Upload & File Ingestion Errors

### 3.1 "File size exceeds 10MB limit."
- **What You See:** The upload area turns red and rejects the file immediately.
- **Plain English Meaning:** The document file you selected is too large for the system to process efficiently.
- **What You Should Do:** Open your scanning software or PDF tool and re-save the document with medium resolution (150–200 DPI), or compress the PDF before uploading.

### 3.2 "Unsupported file type or invalid file signature."
- **What You See:** An alert: *"Only valid PDF, TIFF, PNG, and JPEG files are permitted."*
- **Plain English Meaning:** The file selected is either not an approved format (e.g. Word `.docx`, Excel `.xlsx`, executable `.exe`), or a file with a renamed extension that failed magic-number validation.
- **What You Should Do:** Ensure your document is saved as a genuine Adobe PDF or standard image file before uploading.

### 3.3 "Potential duplicate document detected: INV-998877 already exists in the system."
- **What You See:** A warning card displaying the existing document number and date.
- **Plain English Meaning:** Another staff member or automated ERP sync already uploaded an invoice with this exact vendor and invoice number.
- **What You Should Do:** Open the **Work Tracker** and search for the invoice number before uploading again to prevent paying the vendor twice!

---

## 4. Access Control & Division Permissions

### 4.1 "Access Denied: You do not have permission to view or approve documents for division 'ACC'."
- **What You See:** A locked padlock screen reading HTTP 403 Forbidden.
- **Plain English Meaning:** You are registered under one company division (e.g. `VCC`), but the document belongs to another company entity (e.g. `ACC`).
- **What You Should Do:** You do not need to take any action; this document belongs to a colleague in that department. If your job role recently changed, ask your System Administrator to update your assigned division in Control Settings.
