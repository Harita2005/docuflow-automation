# Screenshot Index & Evidence Catalog
**Document ID:** DASS-RES-06  
**Folder Path:** `docs/user-manual-research/screenshots/`  
**Capture Engine:** Playwright 1.61 Headless Chromium at 1440x900 Viewport  
**Source:** Live Running Web Application (`http://localhost:8085`)  

---

## 1. Screenshot Catalog

| Filename | Page / Component Depicted | User Role Context | File Size | Capture Status | Key Visible UI Elements |
|---|---|---|---|---|---|
| `01_login_page.png` | Login Page | Public / Unauthenticated | 48.3 KB | **Captured & Verified** | FlowApprove brand logo, Username/Employee ID text field, Continue button, Single Sign-On button. |
| `02_login_otp_verification.png` | Multi-Factor Authentication | Public / Unauthenticated | 61.7 KB | **Captured & Verified** | 6-digit OTP code input boxes, Email OTP method badge, Auto Fill demo button, Verify & Enter button. |
| `03_dashboard.png` | Executive & Operations Dashboard | `admin` / All Roles | 69.6 KB | **Captured & Verified** | Summary KPI cards (Total Documents, Pending, Approved, Rejected, Spend ₹), Search Bar, Document Type filter buttons, Recent Invoices Table. |
| `04_work_tracker.png` | Work Tracker Main Operational Hub | `admin` / Reviewer / Approver | 69.5 KB | **Captured & Verified** | Status Tabs (All, Pending, Stage 1, Stage 2, Approved, On Hold), SLA Status badges, Assigned Approvers, Review & Act buttons. |
| `05_approved_documents.png` | Approved Documents Archive | `admin` / Finance / Auditor | 69.6 KB | **Captured & Verified** | Finalized document catalog, Division filters, ERP synchronization status indicators, Download Signed PDF buttons. |
| `06_document_upload.png` | Document Upload & Ingestion Interface | `admin` / AP Executive | 69.7 KB | **Captured & Verified** | Drag-and-drop file upload target zone, Document Type selector, Division selector, Auto-Route workflow checkbox. |
| `07_customer_feedback.png` | Customer Feedback & Complaint Portal | `admin` / Quality Agent | 69.6 KB | **Captured & Verified** | Service ticket queue table, Complaint Subtype indicators, Customer star rating previews, Resolve ticket buttons. |
| `08_workflow_builder.png` | Workflow Rules & Flow Builder | `admin` / Settings Editor | 69.7 KB | **Captured & Verified** | ReactFlow interactive visual node canvas, Stage connections, Node configuration drawer, Save Workflow buttons. |
| `10_admin_users.png` | Control Settings — Users Directory | `admin` | 69.6 KB | **Captured & Verified** | User accounts table, Role badges, Division assignments, Account Lock/Unlock buttons, + Create User button. |
| `12_integration_studio.png` | Integration Studio (DapiSyncBack) | `admin` / Settings Editor | 69.6 KB | **Captured & Verified** | External ERP applications catalog, Outbound callback rules configuration, Live sync log drawer, Test Webhook buttons. |

---

## 2. Additional Screenshots Recommended for Final Manual

The following secondary sub-modals or deep states can be captured during final manual layout compilation:
- `09_condition_builder.png`: Deep sub-tab under Workflow Rules showing the tabular logic condition builder (`If amount > 50000 THEN...`).
- `11_admin_rbac.png`: Granular permission matrix modal under Control Settings.
- `13_document_details.png`: Split-screen PDF viewer showing side-by-side verification of an active invoice.
