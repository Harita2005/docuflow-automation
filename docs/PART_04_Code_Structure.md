# PART 4: Code Structure

## 4.1 Repository Folder Tree & File Directory

```
docuflow-automation/
├── .github/
│   └── workflows/
│       └── ci.yml                     # Continuous integration pipeline for testing and build verification
├── backend/                           # Python FastAPI REST backend application
│   ├── app/
│   │   ├── config/
│   │   │   ├── __init__.py
│   │   │   └── settings.py            # Pydantic BaseSettings loading environment configuration
│   │   ├── database/
│   │   │   ├── __init__.py
│   │   │   ├── connection.py          # SQLAlchemy engine, sessionmaker, and failover connection logic
│   │   │   └── models.py              # Complete database ORM schema (31 SQLAlchemy model classes)
│   │   ├── routers/                   # REST API route controllers
│   │   │   ├── __init__.py
│   │   │   ├── audit.py               # Audit logs, access logs, and compliance export endpoints
│   │   │   ├── auth.py                # Login, refresh tokens, MFA challenges, and Azure SSO
│   │   │   ├── callback_integrations.py # Incoming webhook callbacks and registration endpoints
│   │   │   ├── conditions.py          # Rule conditions, operator expressions, and criteria endpoints
│   │   │   ├── documents.py           # Document lifecycles: approve, reject, return, hold, signed URLs
│   │   │   ├── events.py              # Server-Sent Events (SSE) and WebSocket real-time updates
│   │   │   ├── integrations.py        # Outbound ERP webhook configurations and manual retry triggers
│   │   │   ├── more_info.py           # Dynamic checklist configuration and More-Info questionnaires
│   │   │   ├── roles.py               # RBAC role management and permission assignments
│   │   │   ├── sync.py                # Primary ERP document ingestion and base64 attachment endpoints
│   │   │   ├── sync_router.py         # Secondary ERP schema synchronization and batch ingestion
│   │   │   ├── users.py               # User provisioning, department assignments, and profile updates
│   │   │   └── workflows.py           # Workflow profiles, stages, steps, and visual flow definitions
│   │   ├── schemas/                   # Pydantic request and response DTO schemas
│   │   │   ├── __init__.py
│   │   │   ├── audit.py               # DTOs for audit logs and event records
│   │   │   ├── auth.py                # DTOs for login requests, JWT responses, and MFA tickets
│   │   │   ├── callback.py            # DTOs for webhook callbacks and payloads
│   │   │   ├── condition.py           # DTOs for condition evaluation and rules
│   │   │   ├── document.py            # DTOs for documents, approvals, rejections, line items
│   │   │   ├── dynamic_config.py      # DTOs for dynamic fields and schema configuration
│   │   │   ├── more_info.py           # DTOs for checklist questionnaires and responses
│   │   │   ├── role.py                # DTOs for roles and permissions
│   │   │   ├── user.py                # DTOs for user creation and updates
│   │   │   └── workflow.py            # DTOs for workflow stages and step configurations
│   │   ├── services/                  # Business logic and external integration services
│   │   │   ├── __init__.py
│   │   │   ├── callback_service.py    # Outbound webhook event dispatcher
│   │   │   ├── crypto_service.py      # AES-256-GCM encryption at rest for sensitive webhook secrets
│   │   │   ├── document_query_service.py # Complex multi-table document filtering and aggregation queries
│   │   │   ├── escalation_service.py  # SLA timeout tracking and automatic supervisor escalation
│   │   │   ├── excel_trigger_service.py # Excel sheet watcher for automated batch document intake
│   │   │   ├── file_security.py       # Magic-byte file validation and path traversal sanitization
│   │   │   ├── integration_service.py # ERP back-sync engine with exponential retry background worker
│   │   │   ├── lock_service.py        # Optimistic concurrency locks and reaper for document editing
│   │   │   ├── mfa_service.py         # TOTP authenticator enrollment and token verification
│   │   │   ├── ocr_service.py         # PyMuPDF/Tesseract/Pillow document text extraction engine
│   │   │   ├── otp_service.py         # Email and SMS OTP generation, delivery, and verification
│   │   │   ├── pdf_compressor.py      # PDF file optimization and compression utilities
│   │   │   ├── rbac_service.py        # Enforces role permissions and route access guards
│   │   │   ├── rules_engine.py        # Evaluates document attributes against business rules matrix
│   │   │   ├── security_middleware.py # Security headers, rate limiting, and request sanitization
│   │   │   ├── security_service.py    # Password hashing (bcrypt) and JWT signing
│   │   │   └── signed_file_service.py # Generates short-lived HMAC-signed URLs for document access
│   │   └── main.py                    # FastAPI application initialization and middleware configuration
│   ├── data/                          # Seed data files and configuration matrices
│   │   └── SD Checklists.xlsx         # Reference matrix of SD checklist questions and conditions
│   ├── scripts/                       # Database migrations, maintenance, and administrative scripts
│   │   ├── migrations/                # Database migration scripts
│   │   │   ├── encrypt_secrets_at_rest.py # Migrates legacy plain secrets to AES-256-GCM ciphertexts
│   │   │   └── run_db_migrations.py   # Migration runner script
│   │   ├── cleanup_users.py           # Deletes stale test accounts
│   │   ├── seed_rbac_catalogue.py     # Populates default permissions, roles, and mappings
│   │   ├── seed_sd_workflow_matrix.py # Populates enterprise workflow profiles and step definitions
│   │   └── ...                        # Additional diagnostic, sync, and purge utilities
│   ├── tests/                         # Pytest test suite
│   │   ├── security/                  # Specialized security and penetration tests
│   │   │   ├── test_smtp_not_configured.py
│   │   │   └── test_ssrf_validator.py
│   │   ├── conftest.py                # Pytest fixtures, test database setup, and mock clients
│   │   ├── test_audit_approval_fixes.py # Verifies approval transitions, concurrency, and back-sync
│   │   ├── test_document_locks_security.py # Verifies lock leasing and 423 Locked enforcement
│   │   └── ...                        # Comprehensive unit and integration test files
│   ├── uploads/                       # Temporary folder for in-flight document uploads
│   ├── Dockerfile                     # Python 3.11 container image definition
│   ├── requirements.txt               # Backend Python dependency specifications
│   └── run.py                         # Production and development server launcher script
├── frontend/                          # React Single Page Application (TypeScript)
│   ├── src/
│   │   ├── assets/                    # Static image assets, logos, and icons
│   │   ├── components/                # Modular React UI components
│   │   │   ├── dapi-sync-back/        # UI components for ERP back-sync monitoring
│   │   │   ├── integrations/          # Webhook configuration modals and forms
│   │   │   ├── ApprovalQueuePage.tsx  # Document approval inbox with status tabs and actions
│   │   │   ├── ApprovedDocumentsPage.tsx # Repository of historical approved documents
│   │   │   ├── CustomerFeedbackPage.tsx # Feedback complaint intake and auto-attachment review
│   │   │   ├── CustomerFeedbackDetails.tsx # Detailed view for customer grievance tickets
│   │   │   ├── Dashboard.tsx          # Real-time analytics, charts, and KPI counters
│   │   │   ├── DataVerificationPage.tsx # Ingested data validation and OCR verification view
│   │   │   ├── DocumentDetails.tsx    # Split-screen PDF viewer, fields, comments, and actions
│   │   │   ├── DocumentUpload.tsx     # Drag-and-drop file upload and metadata entry form
│   │   │   ├── FlowBuilder.jsx        # Visual drag-and-drop workflow builder (ReactFlow)
│   │   │   ├── Header.tsx             # Global application navbar with user avatar and alerts
│   │   │   ├── LoginPage.tsx          # Credentials, MFA challenge, and Azure SSO login screen
│   │   │   ├── MoreInfoConfigDrawer.tsx # Drawer for defining dynamic checklist questions
│   │   │   ├── PolicyMatrix.jsx       # Grid view of business rules and condition routing
│   │   │   ├── Sidebar.tsx            # Left navigation sidebar with module navigation links
│   │   │   └── WorkTrackerPage.tsx    # Task tracker and personal queue view
│   │   ├── pages/                     # High-level page containers
│   │   │   ├── Admin.jsx              # System administration portal container
│   │   │   └── WorkflowRulesPage.jsx  # Workflow and rules configuration view
│   │   ├── types/                     # TypeScript interface definitions
│   │   ├── utils/                     # Formatting utilities, API helpers, and formatters
│   │   │   ├── formatters.ts          # Currency, date, and document status formatters
│   │   │   └── formatters.test.ts     # Unit tests for formatting logic
│   │   ├── App.tsx                    # Root UI shell, global routing, and active screen state
│   │   ├── index.css                  # Global Tailwind CSS styles and theme directives
│   │   ├── main.tsx                   # React root render entry point
│   │   └── types.ts                   # Core document, user, and workflow interfaces
│   ├── Dockerfile                     # Multi-stage Node.js build and Nginx serving container
│   ├── nginx.conf                     # Nginx configuration for SPA routing and API reverse proxy
│   ├── package.json                   # Frontend dependencies and build scripts
│   └── vite.config.ts                 # Vite bundler configuration
├── stored_pdfs/                       # Local directory for archived and approved PDF documents
│   └── approved/                      # Year/Month partitioned storage for approved documents
├── docker-compose.yml                 # Multi-container orchestration (Backend + Frontend)
├── .dockerignore                      # Docker build ignore patterns
├── .env.example                       # Template environment configuration file
└── README.md                          # Repository overview
```

---

## 4.2 Application Entry Points

1. **Backend Server Execution**:
   - Primary File: [`backend/run.py`](file:///backend/run.py)
   - Function / Logic: Reads `PORT` (defaults to 3000) and `HOST` (0.0.0.0), invokes `uvicorn.run("app.main:app", host=host, port=port, reload=...)`.
   - Application Factory: [`backend/app/main.py`](file:///backend/app/main.py) initializes FastAPI with title, CORS middleware, security headers, rate limiting, and mounts `/api/` routers.

2. **Frontend Client Execution**:
   - Primary File: [`frontend/src/main.tsx`](file:///frontend/src/main.tsx)
   - Logic: Mounts the React component tree into the `#root` DOM element using `ReactDOM.createRoot(document.getElementById('root')!).render(...)`.
   - Top-Level Shell: [`frontend/src/App.tsx`](file:///frontend/src/App.tsx) handles user session authentication state, sidebar navigation, and active screen rendering.

---

## 4.3 Architectural & Coding Patterns

### 1. Service Layer Pattern (Backend)
- Business logic is strictly separated from HTTP controllers.
- Routers in [`backend/app/routers/`](file:///backend/app/routers/) validate incoming request bodies (via Pydantic schemas) and delegate business logic to dedicated classes in [`backend/app/services/`](file:///backend/app/services/):
  - `RulesEngine.evaluate_workflow` evaluates dynamic rules.
  - `complete_document_lifecycle` handles post-approval archiving and ERP back-sync.
  - `SignedFileService` creates short-lived secure viewing URLs.

### 2. Dependency Injection Pattern (FastAPI)
- Database sessions are created per request using the FastAPI `Depends(get_db)` pattern.
- User authentication and permissions are resolved via `Depends(get_current_user)` and `Depends(require_permission("PERMISSION_CODE"))`.

### 3. Data Transfer Objects (DTOs) with Pydantic V2
- All incoming payloads and outgoing API responses are strictly typed via Pydantic models in [`backend/app/schemas/`](file:///backend/app/schemas/).
- Ensures runtime validation, type safety, and automatic OpenAPI schema documentation.

### 4. Concurrency Control & State Machine Patterns
- **Optimistic Concurrency**: Documents feature an integer `version` field. State transitions require `expected_version` matching the current version; concurrent modifications result in an HTTP 409 Conflict.
- **Pessimistic Row Leasing**: [`lock_service.py`](file:///backend/app/services/lock_service.py) provides exclusive document locks with automatic TTL expiration to prevent simultaneous conflicting reviews.

### 5. Frontend State Management & Component Composition
- **Zustand Stores**: Lightweight reactive state stores manage authentication sessions, user profile data, and active filter criteria.
- **Component Separation**: Visual presentation components (e.g., [`ApprovalQueuePage.tsx`](file:///frontend/src/components/ApprovalQueuePage.tsx)) are separated from stateful business containers.

---

## 4.4 Naming Conventions

| Language / Domain | Construct | Convention | Concrete Code Example |
| :--- | :--- | :--- | :--- |
| **Python** | Modules & Files | `snake_case` | `rules_engine.py`, `integration_service.py` |
| **Python** | Classes | `PascalCase` | `RulesEngine`, `DocumentLockManager` |
| **Python** | Functions & Methods | `snake_case` | `complete_document_lifecycle()`, `acquire_lock()` |
| **Python** | Global Constants | `UPPER_SNAKE_CASE` | `MAX_CONCURRENT_OCR`, `FILE_URL_TTL_SECONDS` |
| **TypeScript / React** | Components & Files | `PascalCase` | `ApprovalQueuePage.tsx`, `FlowBuilder.jsx` |
| **TypeScript** | Interfaces & Types | `PascalCase` | `DocumentItem`, `WorkflowStep` |
| **TypeScript** | Functions & Variables | `camelCase` | `fetchDocuments()`, `handleApprove()` |
| **Database** | Table Names | `lower_snake_case` (plural) | `documents`, `workflow_profiles`, `audit_logs` |
| **Database** | Column Names | `lower_snake_case` | `invoice_number`, `current_step_id`, `created_at` |
| **REST API** | URI Endpoints | `kebab-case` & nouns | `/api/documents/{id}/file-url`, `/api/sync/base64-attachment` |

---

**Verified against source**: [`backend/app/main.py`](file:///backend/app/main.py), [`backend/run.py`](file:///backend/run.py), [`frontend/src/main.tsx`](file:///frontend/src/main.tsx), [`frontend/src/App.tsx`](file:///frontend/src/App.tsx), [`backend/app/routers/`](file:///backend/app/routers/), [`backend/app/services/`](file:///backend/app/services/), [`backend/app/schemas/`](file:///backend/app/schemas/), [`frontend/src/components/`](file:///frontend/src/components/).

