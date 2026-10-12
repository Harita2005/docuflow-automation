# PART 7: Configuration

## 7.1 Configuration Architecture & Variable Inventory

Application settings in DocuFlow are loaded hierarchically from environment variables and `.env` files via Pydantic in [`backend/app/config/settings.py`](file:///backend/app/config/settings.py) (class `Settings`). Server environment templates are maintained in [`.env.example`](file:///.env.example).

### Exact Counts & Variable Mapping
- **`Settings` Pydantic Model Fields**: Exactly **47** fields defined in [`backend/app/config/settings.py`](file:///backend/app/config/settings.py#L25-L172).
- **`.env.example` Template Variables**: Exactly **43** environment keys declared in [`.env.example`](file:///.env.example).
- **Combined Variable Coverage**: All 47 settings fields and all 43 `.env.example` variables are fully documented in the table below.

> [!CAUTION]
> In accordance with security standards, all credentials, encryption keys, and secrets are displayed masked (`********`). Never commit plaintext secret values to version control.

---

## 7.2 Complete Variable Reference Table

| Variable Name | Declared In | Data Type & Default | Description & Operational Purpose | Example Value | Required? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PROJECT_NAME` | `Settings`, `.env.example` | `str = "Strivh Professional..."` | Display name of the enterprise application instance | `DocuFlow Enterprise DAAS` | No |
| `VERSION` | `Settings` | `str = "2.0.0"` | Application semantic version release tag | `2.0.0` | No |
| `ENVIRONMENT` | `Settings`, `.env.example` | `str = "development"` | Runtime environment tier (`development`, `staging`, `production`) | `production` | Yes |
| `NODE_ENV` | `.env.example` | `str = "production"` | Frontend / Node environment mode | `production` | No |
| `API_V1_STR` | `Settings` | `str = "/api"` | REST API base route prefix | `/api` | No |
| `PORT` | `.env.example` | `int = 3000` | Port listened to by Uvicorn backend server | `3000` | No |
| `HOST` | `.env.example` | `str = "0.0.0.0"` | Network interface bind address for backend | `0.0.0.0` | No |
| `FRONTEND_URL` | `.env.example` | `str` | Public web address of frontend client | `http://localhost:5173` | Yes |
| `ALLOWED_ORIGINS` | `Settings`, `.env.example` | `str = "http://localhost:5173..."` | Comma-delimited CORS allowed web origins | `http://localhost:5173,http://localhost:8085` | Yes |
| `DB_HOST` | `Settings`, `.env.example` | `str = "192.168.179.22"` | Primary Microsoft SQL Server host IP or domain | `192.168.179.22` | Yes |
| `DB_PORT` | `Settings`, `.env.example` | `int = 1443` | Microsoft SQL Server listening TCP port | `1443` | Yes |
| `DB_NAME` | `Settings`, `.env.example` | `str = "DocuFlowDB"` | Database catalog/name | `DocuFlowDB` | Yes |
| `DB_USER` | `Settings`, `.env.example` | `str = ""` | Database login account username | `docuflow_app_user` | Yes |
| `DB_PASSWORD` | `Settings`, `.env.example` | `str = ""` | Database login password | `********` | Yes |
| `DB_DRIVER` | `Settings` | `str = "ODBC Driver 17..."` | Name of installed SQL Server ODBC driver | `ODBC Driver 17 for SQL Server` | No |
| `DB_TRUST_SERVER_CERTIFICATE` | `Settings`, `.env.example` | `Optional[bool] = None` | Force TLS cert trust (`true`/`false`); defaults to false in prod | `false` | No |
| `DATABASE_URL` | `Settings`, `.env.example` | `str = ""` | Complete SQLAlchemy connection string (overrides separate DB_* if provided) | `mssql+pyodbc://...` | No |
| `SECRET_KEY` | `Settings`, `.env.example` | `str = ""` | Master cryptographic secret for signing user JWT access tokens | `********` (min 32 chars) | Yes |
| `JWT_SECRET_KEY` | `.env.example` | `str` | Secondary alias for JWT session signing key | `********` | No |
| `ALGORITHM` | `Settings`, `.env.example` | `str = "HS256"` | Cryptographic algorithm for JWT session encoding | `HS256` | No |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `Settings`, `.env.example` | `int = 480` | Lifetime in minutes for user session access tokens | `480` | No |
| `DOCUFLOW_ENCRYPTION_KEY` | `.env.example` | `str` | Master key for AES-256-GCM database secrets encryption at rest | `********` (32-byte hex/base64) | Yes |
| `SERVICE_API_KEY` | `Settings`, `.env.example` | `str = "DocuFlow-M2M..."` | M2M machine authentication key for inbound ERP `/api/sync/*` | `********` (min 32 chars) | Yes |
| `FILE_URL_SIGNING_SECRET` | `Settings`, `.env.example` | `Optional[str] = None` | Dedicated HMAC secret for ephemeral signed document preview URLs | `********` (distinct from SECRET_KEY) | Yes |
| `FILE_URL_TTL_SECONDS` | `Settings`, `.env.example` | `int = 90` | Expiration time in seconds for signed file URLs | `90` | No |
| `PDF_STORAGE_DIR` / `PDF_STORAGE_PATH` | `Settings`, `.env.example` | `Path = stored_pdfs` | Filesystem storage path for uploaded documents | `/app/stored_pdfs` | Yes |
| `APPROVED_PDF_DIR` / `APPROVED_PDF_PATH`| `Settings`, `.env.example` | `Path = stored_pdfs/approved` | Filesystem path for archiving finalized approved documents | `/app/stored_pdfs/approved` | Yes |
| `UPLOAD_DIR` | `Settings`, `.env.example` | `Path = uploads` | Filesystem staging directory for temporary file processing | `/app/uploads` | Yes |
| `DATA_DIR` | `Settings` | `Path = backend/data` | Path to persistent configuration data and reference matrices | `/app/data` | No |
| `EXCEL_PATH` | `Settings` | `Path = data/SD Checklists.xlsx` | Path to Excel SD Checklist reference spreadsheet | `/app/data/SD Checklists.xlsx` | No |
| `AUDIT_LOG_RETENTION_DAYS` | `Settings` | `int = 7` | Retention window in days before purging database audit rows | `7` | No |
| `SMTP_HOST` | `Settings`, `.env.example` | `str = ""` | Mail transfer agent server host for email OTP and alerts | `smtp.office365.com` | Conditional |
| `SMTP_PORT` | `Settings`, `.env.example` | `int = 587` | SMTP mail server port | `587` | No |
| `SMTP_USER` / `SMTP_USERNAME` | `Settings`, `.env.example` | `str = ""` | SMTP authentication username | `notifications@company.com` | Conditional |
| `SMTP_PASS` / `SMTP_PASSWORD` | `Settings`, `.env.example` | `str = ""` | SMTP authentication password | `********` | Conditional |
| `SMTP_FROM` / `SMTP_SENDER_EMAIL`| `Settings`, `.env.example` | `str = ""` | Originating email address on outbound notifications | `noreply@company.com` | Conditional |
| `SMTP_SENDER_NAME` | `Settings`, `.env.example` | `str = "DocuFlow Security"` | Display name shown on outbound notification emails | `DocuFlow Security` | No |
| `SHOW_OTP_IN_UI` | `Settings` | `bool = True` | Debug flag exposing OTP code in JSON API response (disabled in prod) | `false` in prod | No |
| `SMS_PROVIDER` | `Settings`, `.env.example` | `str = "generic"` | Outbound SMS gateway driver (`generic`, `twilio`, `fast2sms`) | `generic` | No |
| `SMS_API_URL` | `Settings`, `.env.example` | `str = ""` | REST endpoint for generic SMS gateway provider | `https://sms.provider.com/api/send` | Conditional |
| `SMS_API_KEY` | `Settings`, `.env.example` | `str = ""` | API token for generic SMS gateway provider | `********` | Conditional |
| `SMS_SENDER_ID` | `Settings`, `.env.example` | `str = "DOCUFLOW"` | Sender ID text header for outbound SMS messages | `DOCUFLOW` | No |
| `TWILIO_ACCOUNT_SID` | `Settings`, `.env.example` | `str = ""` | Twilio Account SID for SMS integration | `********` | Conditional |
| `TWILIO_AUTH_TOKEN` | `Settings`, `.env.example` | `str = ""` | Twilio Auth Token for SMS integration | `********` | Conditional |
| `TWILIO_FROM_NUMBER` | `Settings`, `.env.example` | `str = ""` | Outbound Twilio originating phone number | `+18005550199` | Conditional |
| `FAST2SMS_API_KEY` | `Settings`, `.env.example` | `str = ""` | API token for Fast2SMS gateway | `********` | Conditional |
| `GEMINI_API_KEY` | `Settings` | `str = ""` | Google Gemini API key for multimodal document OCR | `********` | Conditional |
| `OPENAI_API_KEY` | `Settings` | `str = ""` | OpenAI API key for alternative text extraction | `********` | Conditional |
| `MAX_CONCURRENT_OCR` | `Settings`, `.env.example` | `int = 3` | Semaphore ceiling limiting simultaneous heavy OCR processes | `3` | No |
| `OCR_SEMAPHORE_TIMEOUT` | `Settings`, `.env.example` | `float = 60.0` | Maximum seconds waiting for OCR execution slot | `60.0` | No |
| `AZURE_CLIENT_ID` | `.env.example`, `auth.py` | `str = ""` | Microsoft Azure AD App Registration Client ID | `********` | Conditional |
| `AZURE_CLIENT_SECRET` | `.env.example`, `auth.py` | `str = ""` | Microsoft Azure AD App Registration Secret | `********` | Conditional |
| `AZURE_REDIRECT_URI` | `.env.example`, `auth.py` | `str = ""` | OAuth2 Redirect Callback URI for Microsoft SSO | `http://localhost:3000/api/auth/microsoft/callback` | Conditional |

---

## 7.3 Environment-Specific Differences

| Configuration Aspect | Development (`ENVIRONMENT=development`) | Production (`ENVIRONMENT=production`) |
| :--- | :--- | :--- |
| **Strict Production Guards** | Relaxed. Default placeholder API keys permitted without aborting. | **Enforced**. `validate_production_service_api_key()` crashes startup if secrets are placeholders or `< 32` characters. |
| **TLS Certificate Validation** | `TrustServerCertificate=yes` allowed for local or staging self-signed certs. | `TrustServerCertificate=no` strictly enforced for SQL Server encrypted connections. |
| **DB Host Failover** | Auto-falls back to `localhost:1433` if remote `192.168.179.22` is offline. | Must connect strictly to configured `DB_HOST`. |
| **MFA OTP Exposure** | `SHOW_OTP_IN_UI=true` displays OTP code in JSON responses to ease testing. | `SHOW_OTP_IN_UI=false` strictly conceals OTP codes; transmitted only via SMTP/SMS. |
| **CORS Origins** | Permits `http://localhost:5173` and `http://localhost:3000`. | Strictly restricted to production frontend domains. |
| **FastAPI Swagger / OpenAPI** | Enabled at `/docs` and `/redoc`. | Should be disabled or protected behind admin credentials. |

---

**Verified against source**: [`backend/app/config/settings.py`](file:///backend/app/config/settings.py), [`.env.example`](file:///.env.example), [`backend/app/routers/auth.py`](file:///backend/app/routers/auth.py), [`backend/app/services/crypto_service.py`](file:///backend/app/services/crypto_service.py).
