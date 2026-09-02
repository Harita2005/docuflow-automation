# Security Policy & Vulnerability Reporting Guidelines

## Supported Versions

Security updates and patches are actively applied to the primary codebase branch.

| Version | Supported |
| :--- | :--- |
| 2.0.x (Current) | Yes |
| < 2.0 | No |

---

## Reporting a Security Vulnerability

If you discover a potential security vulnerability within the Document Approval Automation System (DAAS), please report it directly to the Corporate Information Security Team.

### Reporting Procedure
1. Do **NOT** disclose the vulnerability publicly or create public issue reports.
2. Email your findings to the Security Response Team at `security@company-domain.internal`.
3. Include detailed reproduction steps, technical impact analysis, and proof-of-concept payloads if available.

### Response SLAs
* **Initial Acknowledgment**: Within 24 hours.
* **Triage & Risk Assessment**: Within 48 hours.
* **Remediation Patch Dispatch**: Critical issues patched within 7 business days.

---

## Security Architecture Principles
* **Authentication**: OAuth2 JWT Bearer Tokens with bcrypt password hashing and active single-session enforcement.
* **Data Isolation**: On-premise execution ensuring data never leaves corporate infrastructure.
* **Access Control**: Role-Based Access Control (RBAC) and Field-Level Access Control (FLAC).
