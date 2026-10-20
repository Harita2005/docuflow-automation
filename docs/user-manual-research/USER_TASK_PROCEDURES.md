# User Task Procedures — DocuFlow Automation
**Document ID:** DASS-RES-04  
**Target Audience:** General Staff, Operations Reviewers, Managers, and Administrators  
**Language Style:** Layperson-Friendly, Action-Oriented Step-by-Step Instructions  

---

## Task 1: How to Log In to Your Account

1. Open your web browser (Google Chrome, Microsoft Edge, or Mozilla Firefox).
2. Enter the application web address provided by your IT department (e.g., `http://192.168.179.22:8085` or `http://localhost:8085`).
3. On the login screen, locate the **Employee ID or Username** text box.
4. Type your username or employee number and click the blue **Continue** button.
5. Select your verification method by clicking **Email OTP**.
6. Check your registered company email inbox for a 6-digit verification code.
7. Type the 6-digit code into the boxes provided on your screen. *(In development or training mode, you may click the convenient "Auto Fill" button).*
8. Click the green **Verify & Enter Workspace** button.
9. **Expected Result:** You will see a success message and your customized operational workspace will open.

> [!NOTE]
> If your account was active in another browser or computer, a prompt will ask: *"You have an active session elsewhere. Would you like to sign in here instead?"* Click **Sign In Here** to safely transfer your session to your current computer.

---

## Task 2: How to Log Out Safely

1. Look at the top right corner of your screen at the **User Profile** section (where your name and role badge are displayed).
2. Click on your profile name to open the dropdown menu.
3. Click the red **Sign Out** button.
4. **Expected Result:** Your session will close immediately, your security tokens will be erased from the browser, and you will return to the clean login screen.

---

## Task 3: Understanding Your Dashboard & Finding Tasks

1. Click **Dashboard** in the left sidebar menu (or click the FlowApprove logo at top left).
2. Review the top summary cards:
   - **Total Documents:** All records currently in the system.
   - **Pending Approvals:** Invoices that need manager or accountant review.
   - **Approved Documents:** Records that have successfully passed all checks.
   - **Rejected Documents:** Items that were declined and stopped.
   - **Total Spend:** Total financial amount (in Indian Rupees ₹) of active invoices.
3. **Quick-Action Shortcut:** Click directly on the **Pending Approvals** card. The system will immediately take you to your personal task list in the Work Tracker!

---

## Task 4: How to Review and Approve an Assigned Document

1. From the left sidebar, click **Work Tracker**.
2. Locate the document you wish to review in the table. Look for rows where the **Assigned Approver** badge matches your name or role.
3. In the rightmost column of that row, click the blue **Review & Act** (or **View Details**) button.
4. The screen will open in a convenient **Split-View**:
   - **Left Half:** High-definition viewer displaying the actual invoice PDF original. You can zoom in, zoom out, or rotate the page.
   - **Right Half:** The extracted form showing Vendor Name, Invoice Number, Date, Gross Amount, and Tax.
5. Carefully compare the extracted data on the right with the original PDF image on the left.
6. Scroll down to the **Compliance Checklist** section.
7. Click each checkbox to confirm that you have verified each required business item (e.g., *"Goods received in good condition"*, *"PO matches invoice total"*, *"Tax calculation correct"*).
8. Once all checklist items are ticked, click the green **Approve** button in the top action bar.
9. **Expected Result:** A green confirmation banner will appear: *"Document successfully approved for next stage."* The document will automatically advance to the next manager's queue.

---

## Task 5: How to Reject an Incorrect Document

1. Open the document review screen following steps 1 through 4 in Task 4.
2. If you spot an error (such as an incorrect amount, missing signature, or damaged goods), click the red **Reject** button.
3. A dialogue box will appear asking: *"Please provide a reason for rejecting this document."*
4. Type a clear, professional explanation describing why the document cannot be approved.
5. Click **Confirm Rejection**.
6. **Expected Result:** The document status changes to **Rejected**, its workflow halts, and the rejection reason is permanently recorded in the audit history.

---

## Task 6: How to Put a Document on Temporary Hold

1. Open the document review screen.
2. If you need more information from the vendor or a colleague before deciding, click the amber **Put on Hold** button.
3. Type the reason for the delay (e.g., *"Awaiting confirmation of goods delivery from store"*).
4. Click **Confirm Hold**.
5. **Expected Result:** The document status updates to **On Hold**, and SLA warning clocks are temporarily paused.

---

## Task 7: How to Upload and Ingest a New Document

1. In the left sidebar, click **Upload Document**.
2. Drag and drop your PDF invoice into the designated dotted box, or click **Browse Files** to select the PDF from your computer.
3. In the **Document Type** dropdown, select the category of the document (e.g. `AP INVOICE`, `CAPEX`, `PURCHASE INVOICE`).
4. In the **Division** dropdown, choose your company division (e.g. `HQ`, `VCC`, `ACC`).
5. Ensure the checkbox **"Auto-Route using Workflow Rules"** is selected.
6. Click the blue **Process & Extract Details** button.
7. The system's AI will scan the document and display a live preview of the extracted vendor name, invoice number, and amount.
8. If the details look correct, click **Confirm & Submit to Queue**.
9. **Expected Result:** The document is assigned a unique Document Key (e.g. `INV-2026-0042`) and automatically routed to Stage 1 Review.

---

## Task 8: Managing Customer Feedback & Complaints

1. In the left sidebar, click **Customer Feedback**.
2. Find the complaint ticket in the list and click **View Complaint**.
3. Review the customer's star rating (1 to 5 stars), survey date, dealer name, and complaint description.
4. Scroll down to view any attached photographs showing product damage.
5. Enter resolution comments in the **Action Taken** box.
6. Click **Mark as Resolved** to close the feedback ticket.

---

## Task 9: Administrator Guide — Creating a New User Account

*(Requires Administrator role)*
1. In the left sidebar, click **Control Settings** (Gear icon).
2. Select the **Users** tab.
3. Click the blue **+ Create User** button at the top right.
4. Fill in the required fields:
   - **Username:** e.g., `initha.m`
   - **Email:** e.g., `initha.m@ramrajcotton.net`
   - **Role:** Select appropriate role (`manager`, `accounts_approver`, `employee`, etc.)
   - **Division:** Select company entity (`VCC`, `ACC`, `PRM`, `HQ`)
5. Click **Save User**.
6. **Expected Result:** The new user appears in the directory and can immediately log in using their email and OTP.

---

## Task 10: Administrator Guide — Designing an Approval Flow in Flow Builder

*(Requires Administrator or Settings Editor role)*
1. In the left sidebar, click **Workflow & Rules**.
2. Select the **Flow Builder** tab.
3. Click **Add Stage Node** to add a new approval step to the visual canvas.
4. Click on the newly created node to open the configuration panel:
   - **Step Name:** e.g., *"Store Manager Initial Sign-off"*
   - **Stage Number:** e.g., `1`
   - **Approver Type:** Select Role or Specific User
   - **Assigned Approver:** Select `manager` or type a specific username
5. Click and drag from the bottom handle of Stage 1 to connect it to Stage 2.
6. Click the green **Save Workflow Changes** button at the top right.
7. **Expected Result:** All future documents matching this profile will automatically follow this exact sequence of review.
