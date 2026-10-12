# PART 13: Security

## 13.1 Authentication & Session Management

DocuFlow implements defense-in-depth security spanning authentication, multi-factor authorization, cryptographic secrets storage, and file access authorization:

### 1. Password Security
- Passwords are encrypted using salted `bcrypt` via Passlib in [`backend/app/services/security_service.py`](file:///backend/app/services/security_service.py).
- Passwords are never logged or stored in plaintext.

### 2. Multi-Factor Authentication (MFA)
- Implemented in [`backend/app/services/mfa_service.py`](file:///backend/app/services/mfa_service.py) and [`backend/app/services/otp_service.py`](file:///backend/app/services/otp_service.py).
- Supported factors:
  - **TOTP**: RFC 6238 time-based authenticator apps (Google Authenticator, Microsoft Authenticator) with QR enrollment.
  - **Email OTP**: 6-digit numeric codes sent via secure SMTP.
  - **SMS OTP**: Sent via Twilio, Fast2SMS, or generic SMS gateway.
- **Challenge Ticket Mechanism**: Upon primary password validation, if MFA is enabled, the API issues a temporary `mfa_ticket` with a 5-minute lifespan. The full JWT access token is released only upon successful second-factor validation.

### 3. JWT Token Architecture
- Signed using `HS256` with `SECRET_KEY`.
- Contains claims: `sub` (user_id), `role`, `division_id`, `department_id`, and expiration timestamp `exp`.
- Standard session lifetime: 480 minutes (8 hours).

---

## 13.2 Authorization & Role-Based Access Control (RBAC)

Access control is enforced via [`backend/app/services/rbac_service.py`](file:///backend/app/services/rbac_service.py) through FastAPI dependencies:

| Scope Level | Scope Rule | Example Enforcement |
| :--- | :--- | :--- |
| `ALL` | Full visibility across all company divisions and departments | System Admins, Corporate Controllers |
| `DIVISION` | Access restricted to documents where `doc.division_id == user.division_id` | Regional Finance Managers |
| `DEPARTMENT` | Access restricted to documents matching `user.department_id` | Departmental Reviewers |
| `OWN` | Access strictly limited to documents where `doc.created_by == user.id` | Individual Requesters |

---

## 13.3 Secrets Management & Cryptography

### 1. Secrets Encryption at Rest
- Sensitive third-party webhook signing secrets and credentials stored in `third_party_webhook_configs` are encrypted at rest using **AES-256-GCM** via [`backend/app/services/crypto_service.py`](file:///backend/app/services/crypto_service.py).
- Legacy database secrets are migrated to ciphertext via [`backend/scripts/migrations/encrypt_secrets_at_rest.py`](file:///backend/scripts/migrations/encrypt_secrets_at_rest.py).

### 2. Ephemeral Signed File URLs
- Physical document paths on disk (`/app/stored_pdfs/...`) are never exposed directly to client browsers.
- When an authorized user requests a file, [`backend/app/services/signed_file_service.py`](file:///backend/app/services/signed_file_service.py) generates a short-lived URL with an HMAC-SHA256 signature:
  `GET /api/documents/view/{doc_id}?expires={timestamp}&sig={hmac_sha256}`
- **TTL**: 90 seconds. Once expired, links cannot be replayed or shared.
- Cryptographic isolation: `FILE_URL_SIGNING_SECRET` is strictly validated to be distinct from `SECRET_KEY` in production environments.

---

## 13.4 Input Validation & File Security

Implemented in [`backend/app/services/file_security.py`](file:///backend/app/services/file_security.py):

- **Path Traversal Defense**: File retrieval strictly evaluates paths against canonical base storage paths using `resolve_safe_path()`, rejecting attempts containing `..`, null bytes, or absolute drive paths outside storage bounds.
- **Magic-Byte MIME Verification**: Uploaded files are validated against true binary headers (magic numbers), preventing malicious executables masked with `.pdf` or `.png` extensions.
- **Filename Sanitization**: Uploaded filenames are scrubbed of special characters and normalized before saving.

---

## 13.5 Vulnerability Assessment & Hardening Log

The following historical findings have been remediated in the codebase:

| Finding ID | Description | Remediation Implemented in Code | Status |
| :--- | :--- | :--- | :--- |
| `SEC-01` | Insecure Default M2M API Keys | Startup guard `validate_production_service_api_key()` halts server if default keys are used in production. | **RESOLVED** |
| `SEC-02` | File URL Token Replay | Replaced static file serving with ephemeral 90-second HMAC signed URLs. | **RESOLVED** |
| `SEC-03` | Secrets in Plaintext | Introduced AES-256-GCM authenticated encryption for webhook secret tokens. | **RESOLVED** |
| `SEC-04` | SSRF Vulnerability in Webhooks | Added IP-range validator in `test_ssrf_validator.py` blocking loopback/internal RFC 1918 IPs in webhook configurations. | **RESOLVED** |
| `AUD-01` | Skipped Stage on Empty Approver | Blocked transitions in `documents.py` if next step has empty `approver_target`. | **RESOLVED** |
| `AUD-02` | Double Approval Race Condition | Enforced mandatory `expected_version` optimistic locking returning HTTP 409 Conflict. | **RESOLVED** |
| `AUD-07` | Silent Sync Failures Without Retries | Elevated back-sync errors to `ERROR` level and introduced exponential retry engine. | **RESOLVED** |

---

**Verified against source**: [`backend/app/services/security_service.py`](file:///backend/app/services/security_service.py), [`backend/app/services/mfa_service.py`](file:///backend/app/services/mfa_service.py), [`backend/app/services/otp_service.py`](file:///backend/app/services/otp_service.py), [`backend/app/services/crypto_service.py`](file:///backend/app/services/crypto_service.py), [`backend/app/services/signed_file_service.py`](file:///backend/app/services/signed_file_service.py), [`backend/app/services/file_security.py`](file:///backend/app/services/file_security.py), [`backend/app/services/security_middleware.py`](file:///backend/app/services/security_middleware.py), [`backend/app/services/rbac_service.py`](file:///backend/app/services/rbac_service.py).

