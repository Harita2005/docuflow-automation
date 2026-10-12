# PART 19: Questions for the Author

This document compiles all items marked as **"NOT FOUND - needs confirmation from the author"** during the comprehensive code and architectural analysis.

---

## 19.1 Items Requiring Author Confirmation

| Category | Item Description | Status in Repository | Context & Why It Matters |
| :--- | :--- | :--- | :--- |
| **Database & Schema** | **Stored Procedures, Triggers & Views** | `NOT FOUND - needs confirmation from the author` | The codebase uses SQLAlchemy ORM exclusively. Confirm whether the target Microsoft SQL Server instance (`DocuFlowDB`) contains any existing native database triggers, stored procedures, or reporting views not tracked in Git. |
| **Database & Schema** | **Automated Backup & Disaster Recovery** | `NOT FOUND - needs confirmation from the author` | No SQL Server Agent backup scripts or Azure automated backup policies exist in the repo. Confirm the RPO/RTO backup schedule and recovery playbook for production. |
| **External ERP Integration** | **ERP Target Webhook Contract & Authentication** | `NOT FOUND - needs confirmation from the author` | `integration_service.py` pushes JSON webhooks to configurable URLs. Confirm the exact payload schemas, HTTP headers, and authentication tokens required by the live SAP / Oracle / Dynamics ERP destination. |
| **External Communications** | **Production SMTP Server & Relay Configuration** | `NOT FOUND - needs confirmation from the author` | Credentials are empty in `.env.example`. Confirm corporate SMTP host, port, STARTTLS requirements, and verified sender domain for MFA and notifications. |
| **External Communications** | **Active SMS Provider for MFA** | `NOT FOUND - needs confirmation from the author` | Drivers for Twilio, Fast2SMS, and Generic HTTP SMS are supported. Confirm which vendor is contracted and active for production OTP delivery. |
| **Identity & SSO** | **Azure AD / Microsoft Entra ID Tenant Details** | `NOT FOUND - needs confirmation from the author` | The OAuth2 SSO endpoints in `auth.py` require `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET`. Confirm the Entra ID tenant registration status and allowed corporate user groups. |
| **Infrastructure** | **Production Storage Volume Mounts** | `NOT FOUND - needs confirmation from the author` | Confirm whether `/app/stored_pdfs` is mounted to local server storage, a network NAS/SAN share, or a cloud blob volume (e.g. Azure Files / AWS EFS) for high-availability multi-instance access. |

---

**Verified against source**: Whole repository scan (`backend/`, `frontend/`, `scripts/`, `.github/`, `docker-compose.yml`, `.env.example`).

