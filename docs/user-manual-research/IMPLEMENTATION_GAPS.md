# Implementation Gaps, Discrepancies & Limitations Report
**Document ID:** DASS-RES-08  
**Verification Audit:** Source Code Analysis & Live Behavior Comparison  

---

## 1. Feature Implementation Status Matrix

| Feature / Capability | Frontend UI Implementation | Backend API Implementation | Live Verification Status | Notes / Discrepancies |
|---|:---:|:---:|:---:|---|
| **User Login & OTP MFA** | Full | Full | **Verified in Running App** | Email OTP works. In development mode, an "Auto Fill" button is enabled for testing. |
| **Microsoft Single Sign-On (SSO)** | UI Button Present | Partial (`/api/auth/microsoft`) | **Partially Verified** | SSO button is rendered on the login page; requires valid corporate Azure AD Client ID & Secret in production `.env`. |
| **Executive Dashboard & KPIs** | Full | Full | **Verified in Running App** | All 7 cards update live from `GET /api/dashboard/stats`. |
| **Work Tracker Main Queue** | Full | Full | **Verified in Running App** | Status tabs, SLA countdown, and division filters work completely. |
| **Document Details Split-View** | Full | Full | **Verified in Running App** | Interactive PDF viewer, metadata form, checklist checks, and action buttons work. |
| **Dynamic More-Info Fields** | Full | Full | **Verified in Running App** | Allows users to configure visible columns per document type (`AP INVOICE`, `CAPEX`, etc.). |
| **Customer Feedback Portal** | Full | Full | **Verified in Running App** | Handles customer complaints, defect images, and resolution tracking. |
| **Approved Documents Repository**| Full | Full | **Verified in Running App** | Lists finalized records with signed PDF download links. |
| **PDF Upload & AI OCR Ingestion** | Full | Full | **Verified in Running App** | Neural OCR extracts key fields. Max file size: 10 MB. Limited to 3 concurrent OCR jobs (`MAX_CONCURRENT_OCR = 3`). |
| **Workflow Rules (Flow Builder)** | Full | Full | **Verified in Running App** | ReactFlow interactive canvas; allows creating nodes and saving workflows. |
| **Condition Builder (Rules Table)**| Full | Full | **Verified in Running App** | Tabular conditional routing rules (`amount`, `division`, `document_type`). |
| **Control Settings (Users & RBAC)**| Full | Full | **Verified in Running App** | User directory, account locking/unlocking, and granular permission matrix. |
| **ERP Integration Studio** | Full | Full | **Verified in Running App** | Application management, callback rules, and transmission log drawers. |
| **Goods Receipt Page (GRN)** | Partial (`GoodsReceiptPage.tsx` exists) | Full | **Partially Implemented in UI** | Page component exists in source code, but is currently accessible primarily via Admin settings or sub-routes rather than the primary sidebar menu. |
| **Payment Readiness Queue** | Partial (`PaymentReadinessPage.tsx` exists) | Full | **Partially Implemented in UI** | Component exists; accessible via deep link or Finance Manager role redirection. |

---

## 2. Identified Discrepancies Between Documentation and Code

1. **Role Names in Old Docs vs Source Code:**
   - *Old Documentation:* Frequently referred to generic roles like `Reviewer` and `Approver`.
   - *Actual Implementation:* The database and RBAC service use specific role codes: `manager`, `accounts_approver`, `accounts_approver2`, `ap_executive`, `customer_feedback_agent`, and `admin`. The user manual must guide users using the real role names displayed in the software.
2. **Document Type Naming Conventions:**
   - *Observation:* The backend supports standard canonical names: `AP INVOICE`, `CAPEX / FIXED ASSET`, `CASH VOUCHER`, `E-VOUCHER`, `PURCHASE INVOICE`, `STAFF & HR EXPENSE`, `UTILITY & RENT`, and `CUSTOMER FEEDBACK`. Variations like `Customer Complaint` automatically map to `CUSTOMER FEEDBACK`.
3. **Optimistic Locking Behavior:**
   - When two approvers view the same document simultaneously, the second approver receives an HTTP 409 Conflict. The UI displays an alert asking them to refresh to prevent overwriting someone else's decision.
