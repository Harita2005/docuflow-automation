# PART 3: Technology Stack

## 3.1 Core Technologies & Runtime Platforms

| Layer | Technology | Version | Location / Config File | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Backend Runtime** | Python | `3.11` | [`backend/Dockerfile`](file:///backend/Dockerfile#L1), [`.github/workflows/ci.yml`](file:///backend/.github/workflows/ci.yml#L23) | Application server runtime environment |
| **Backend Framework** | FastAPI | `>=0.110.0` | [`backend/requirements.txt`](file:///backend/requirements.txt#L1) | Asynchronous REST API framework |
| **ASGI Web Server** | Uvicorn | `>=0.28.0` | [`backend/requirements.txt`](file:///backend/requirements.txt#L2) | High-performance asynchronous HTTP server |
| **Frontend Runtime** | Node.js | `20` (LTS) | [`frontend/Dockerfile`](file:///frontend/Dockerfile#L2), [`.github/workflows/ci.yml`](file:///frontend/.github/workflows/ci.yml#L40) | Build and compilation runtime for client assets |
| **Frontend Framework** | React | `^19.2.4` | [`frontend/package.json`](file:///frontend/package.json#L22) | Single Page Application UI view engine |
| **Bundler & Dev Server** | Vite | `^6.4.3` | [`frontend/package.json`](file:///frontend/package.json#L52) | Lightning-fast frontend module bundler and compiler |
| **Type Checker** | TypeScript | `^5.8.2` | [`frontend/package.json`](file:///frontend/package.json#L50) | Compile-time static type analysis |
| **Database Engine** | Microsoft SQL Server | `2017+` (DocuFlowDB) | [`backend/app/config/settings.py`](file:///backend/app/config/settings.py#L36-L46) | Enterprise ACID transactional database engine |
| **Reverse Proxy** | Nginx | `alpine` | [`frontend/Dockerfile`](file:///frontend/Dockerfile#L16), [`frontend/nginx.conf`](file:///frontend/nginx.conf) | Static asset web server & reverse proxy for `/api/` |

---

## 3.2 Backend Python Libraries (`backend/requirements.txt`)

Every Python library specified in [`backend/requirements.txt`](file:///backend/requirements.txt) is listed below:

| Package Name | Specified Version | Purpose in Codebase | Key Consuming Files |
| :--- | :--- | :--- | :--- |
| `fastapi` | `>=0.110.0` | REST API routing, request validation, dependency injection, and OpenAPI doc generation | [`backend/app/main.py`](file:///backend/app/main.py), [`backend/app/routers/`](file:///backend/app/routers/) |
| `uvicorn` | `>=0.28.0` | High-throughput ASGI server hosting FastAPI | [`backend/run.py`](file:///backend/run.py) |
| `pydantic` | `>=2.6.0` | Strict data schemas, serialization, and input sanitation | [`backend/app/schemas/`](file:///backend/app/schemas/) |
| `pydantic-settings` | `>=2.14.2` | Typed application configuration loading from `.env` | [`backend/app/config/settings.py`](file:///backend/app/config/settings.py) |
| `sqlalchemy` | `>=2.0.28` | Enterprise ORM, query composition, session management, and migrations | [`backend/app/database/connection.py`](file:///backend/app/database/connection.py), [`backend/app/database/models.py`](file:///backend/app/database/models.py) |
| `pyodbc` | `>=5.1.0` | ODBC bridge for high-speed connectivity to Microsoft SQL Server | [`backend/app/database/connection.py`](file:///backend/app/database/connection.py) |
| `pymssql` | `>=2.2.11` | Secondary fallback DB-API driver for Microsoft SQL Server | [`backend/app/database/connection.py`](file:///backend/app/database/connection.py) |
| `PyJWT` | `>=2.14.0` | Encoding, decoding, and cryptographic verification of JWT access/refresh tokens | [`backend/app/routers/auth.py`](file:///backend/app/routers/auth.py), [`backend/app/services/security_service.py`](file:///backend/app/services/security_service.py) |
| `python-dotenv` | `>=1.0.0` | Reading environment variables from `.env` files | [`backend/app/config/settings.py`](file:///backend/app/config/settings.py) |
| `passlib[bcrypt]` | `>=1.7.4` | Enterprise password hashing framework | [`backend/app/services/security_service.py`](file:///backend/app/services/security_service.py) |
| `bcrypt` | `>=4.1.2` | Core cryptographic hashing engine for user credentials | [`backend/app/services/security_service.py`](file:///backend/app/services/security_service.py) |
| `python-multipart` | `>=0.0.20` | Streaming multipart/form-data parser for invoice PDF and image uploads | [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py), [`backend/app/routers/sync.py`](file:///backend/app/routers/sync.py) |
| `pymupdf` (fitz) | `>=1.23.0` | High-speed PDF text parsing, page count extraction, and PDF rendering | [`backend/app/services/ocr_service.py`](file:///backend/app/services/ocr_service.py), [`backend/app/services/pdf_compressor.py`](file:///backend/app/services/pdf_compressor.py) |
| `Pillow` | `>=12.3.0` | Image processing, thumbnail generation, and preview verification | [`backend/app/services/ocr_service.py`](file:///backend/app/services/ocr_service.py), [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py) |
| `pandas` | `>=2.2.0` | Dataframe manipulation for batch Excel file parsing and data synchronization | [`backend/app/services/excel_trigger_service.py`](file:///backend/app/services/excel_trigger_service.py) |
| `openpyxl` | `>=3.1.2` | Reader and writer for modern `.xlsx` spreadsheet files | [`backend/app/services/excel_trigger_service.py`](file:///backend/app/services/excel_trigger_service.py) |
| `requests` | `>=2.32.2` | Synchronous HTTP client for external ERP webhooks and push syncs | [`backend/app/services/integration_service.py`](file:///backend/app/services/integration_service.py), [`backend/app/services/callback_service.py`](file:///backend/app/services/callback_service.py) |
| `aiofiles` | `>=23.2.1` | Non-blocking asynchronous file filesystem I/O operations | [`backend/app/routers/documents.py`](file:///backend/app/routers/documents.py) |
| `pyotp` | `>=2.9.0` | RFC 6238 Time-based One-Time Password (TOTP) generation and verification | [`backend/app/services/mfa_service.py`](file:///backend/app/services/mfa_service.py) |
| `qrcode` | `>=7.4.2` | Generates Base64/PNG QR codes for authenticator app enrollment | [`backend/app/services/mfa_service.py`](file:///backend/app/services/mfa_service.py) |
| `websockets` | `>=13.0` | Asynchronous WebSocket protocol support for real-time document locks | [`backend/app/routers/events.py`](file:///backend/app/routers/events.py) |
| `cryptography` | `>=49.0.0` | AES-256-GCM encryption at rest for secrets and HMAC-SHA256 signature generation | [`backend/app/services/crypto_service.py`](file:///backend/app/services/crypto_service.py), [`backend/app/services/signed_file_service.py`](file:///backend/app/services/signed_file_service.py) |
| `click` | `>=8.1.8` | Command-line interface utilities for migration and seeding scripts | [`backend/scripts/`](file:///backend/scripts/) |
| `pytest` | `>=8.0.0` | Test runner and assertion framework for backend unit and integration suites | [`backend/tests/`](file:///backend/tests/) |
| `httpx` | `>=0.27.0` | Async HTTP client used by FastAPI `AsyncClient` in tests | [`backend/tests/conftest.py`](file:///backend/tests/conftest.py) |

---

## 3.3 Frontend JavaScript / TypeScript Dependencies (`frontend/package.json`)

### Production Dependencies
| Package Name | Specified Version | Purpose in Codebase |
| :--- | :--- | :--- |
| `react` | `^19.2.4` | React 19 core component library |
| `react-dom` | `^19.2.4` | React DOM bindings |
| `react-router-dom` | `^7.18.0` | Client-side routing, route protection, and navigation |
| `zustand` | `^5.0.14` | Global state management for user session, active document, and UI notifications |
| `axios` | `^1.20.0` | HTTP client with request/response interceptors for JWT injection |
| `lucide-react` | `^0.546.0` | Modern SVG iconography used across all UI navigation and action buttons |
| `reactflow` | `^11.11.4` | Interactive node-based drag-and-drop workflow diagramming for approval rules |
| `react-pdf` | `^10.4.1` | In-browser PDF document viewer with zooming, paging, and rendering |
| `recharts` | `^3.8.1` | Analytics charts for document throughput, approval cycle time, and queues |
| `motion` (Framer) | `^12.23.24` | Smooth transitions, modal entry/exit animations, and drawer interactions |
| `@mui/material` | `^9.1.1` | Enterprise UI components (data tables, drawer panels, modal dialogs) |
| `@mui/icons-material` | `^9.1.1` | Complementary material icon glyphs |
| `@emotion/react` | `^11.14.0` | Emotion styling engine for Material UI |
| `@emotion/styled` | `^11.14.1` | Styled component wrappers for Emotion |
| `quill` | `^2.0.2` | Core rich text editor for comments and document notes |
| `react-quill-new` | `^3.7.0` | React wrapper component for Quill editor |
| `socket.io-client` | `^4.8.3` | Real-time connection client for live document lock updates |

### Development & Tooling Dependencies
| Package Name | Specified Version | Purpose |
| :--- | :--- | :--- |
| `vite` | `^6.4.3` | Vite compilation engine |
| `typescript` | `^5.8.2` | TypeScript compiler |
| `tailwindcss` | `^4.1.14` | Tailwind CSS v4 utility-first CSS framework |
| `@tailwindcss/vite` | `^4.1.14` | Official Vite plugin for Tailwind v4 |
| `vitest` | `^4.1.11` | Vite-native unit testing runner |
| `@testing-library/react` | `^16.3.2` | React component testing utilities |
| `@testing-library/jest-dom` | `^6.9.1` | Custom DOM element matchers for Vitest |
| `jsdom` | `^29.1.1` | Headless browser DOM implementation for Vitest |
| `eslint` | `^10.6.0` | JavaScript/TypeScript linter |
| `typescript-eslint` | `^8.62.1` | TypeScript tooling for ESLint |

---

**Verified against source**: [`backend/requirements.txt`](file:///backend/requirements.txt), [`frontend/package.json`](file:///frontend/package.json), [`backend/Dockerfile`](file:///backend/Dockerfile), [`frontend/Dockerfile`](file:///frontend/Dockerfile), [`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml).

