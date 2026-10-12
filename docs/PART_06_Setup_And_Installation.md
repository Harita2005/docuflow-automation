# PART 6: Setup and Installation

## 6.1 System Prerequisites

Before setting up DocuFlow on a new developer machine or server, verify the following prerequisites:

| Component | Minimum Version | Recommended / Tested | Purpose |
| :--- | :--- | :--- | :--- |
| **Python** | `3.11.0` | `3.11.9` | Backend runtime |
| **Node.js** | `18.0.0` | `20.18.0` (LTS) | Frontend build runtime |
| **npm** | `9.0.0` | `10.8.0` | Frontend package manager |
| **Microsoft SQL Server** | `2017` | `2019 / 2022 Enterprise / Express` | Database persistence |
| **MS ODBC Driver** | `ODBC Driver 17` | `ODBC Driver 17 for SQL Server` | Native DB driver for `pyodbc` |
| **Docker & Docker Compose** | `24.0.0+` | `Compose v2.20+` | Containerized deployment |
| **Git** | `2.40.0+` | Latest | Version control |

> [!IMPORTANT]
> **Windows/Linux ODBC Driver Requirement**:
> If running outside Docker, the Microsoft ODBC Driver 17 for SQL Server must be installed on your operating system:
> - **Windows**: Download and install `msodbcsql.msi` from Microsoft.
> - **Ubuntu / Debian**: `sudo apt-get install -y unixodbc unixodbc-dev msodbcsql17`

---

## 6.2 Bare-Metal / Local Development Setup

### Step 1: Clone Repository & Configure Environment
```bash
git clone <repository_url> docuflow-automation
cd docuflow-automation

# Copy environment configuration
cp .env.example .env
```
Open `.env` in an editor and configure the connection parameters for your SQL Server instance (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`), and set random secret strings for `SECRET_KEY`, `FILE_URL_SIGNING_SECRET`, and `SERVICE_API_KEY`.

---

### Step 2: Database Initialization & Seeding
1. **Create the Database in SQL Server Management Studio (SSMS) or `sqlcmd`**:
   ```sql
   CREATE DATABASE DocuFlowDB;
   GO
   ```
2. **Create Least-Privilege Database User (Optional, Recommended for Production)**:
   Run [`scripts/sql/01_create_least_privilege_app_user.sql`](file:///scripts/sql/01_create_least_privilege_app_user.sql) to grant dedicated DML privileges to the application service user.

3. **Run Schema Migrations**:
   From the repository root:
   ```bash
   python backend/scripts/migrations/run_db_migrations.py
   ```

4. **Seed RBAC Catalogue (Roles, Permissions & System Admin)**:
   ```bash
   python backend/scripts/seed_rbac_catalogue.py
   ```

5. **Seed Workflow Matrix & Step Definitions**:
   ```bash
   python backend/scripts/seed_sd_workflow_matrix.py
   ```

---

### Step 3: Backend Setup & Launch
```bash
cd backend

# Create and activate Python virtual environment
python -m venv venv

# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Start backend server
python run.py
```
The FastAPI backend will start listening at: `http://localhost:3000`.
Interactive OpenAPI docs are available at: `http://localhost:3000/docs`.

---

### Step 4: Frontend Setup & Launch
Open a second terminal window:
```bash
cd frontend

# Install Node dependencies
npm install --legacy-peer-deps

# Start Vite development server
npm run dev
```
The React development frontend will be accessible at: `http://localhost:5173`.

---

## 6.3 Containerized Setup via Docker Compose

To build and run the entire stack (FastAPI Backend + React Nginx Frontend) in isolated Docker containers:

```bash
# From repository root:
docker-compose up --build -d
```

### Container Port Mappings
- **Frontend (Nginx reverse proxy)**: `http://localhost:8085` (proxies `/api/` to backend)
- **Backend (FastAPI direct)**: `http://localhost:3000`

---

## 6.4 Verification Steps & Smoke Testing

| Action | Verification Command / URL | Expected Result |
| :--- | :--- | :--- |
| **Backend Health Check** | `curl -f http://localhost:3000/api/health` | `{"status": "ok", "database": "connected"}` |
| **OpenAPI Documentation** | Browser: `http://localhost:3000/docs` | Swagger UI loads with all endpoints |
| **Frontend UI Landing** | Browser: `http://localhost:5173` (or `8085`) | Login page renders cleanly |
| **Admin Authentication** | Log in with configured admin credentials | Dashboard redirects to `/dashboard` |

---

## 6.5 Common Setup Errors & Troubleshooting

| Error Symptom | Root Cause | Exact Resolution |
| :--- | :--- | :--- |
| `[IM002] [Microsoft][ODBC Driver Manager] Data source name not found and no default driver specified` | The MS ODBC Driver 17 for SQL Server is not installed on the host OS. | Install the official Microsoft ODBC Driver 17 for SQL Server. On Linux, run `apt-get install msodbcsql17`. |
| `FATAL: SERVICE_API_KEY is missing or empty in production environment` | Production mode is active (`ENVIRONMENT=production`) but `SERVICE_API_KEY` was left empty or as placeholder. | In `.env`, set `SERVICE_API_KEY` to a random string of at least 32 characters. |
| `FATAL: FILE_URL_SIGNING_SECRET must be distinct from SECRET_KEY` | Both environment variables were set to the identical string. | Generate two distinct cryptographic keys for `SECRET_KEY` and `FILE_URL_SIGNING_SECRET`. |
| `Cannot connect to 192.168.179.22:1443` | Remote SQL Server host is offline or network unreachable from local machine. | Backend automatically falls back to `localhost:1433`. Ensure a local SQL Server instance is running or update `DB_HOST` in `.env`. |
| `npm ERR! ERESOLVE unable to resolve dependency tree` | React 19 peer dependency conflicts with legacy packages. | Always run `npm install --legacy-peer-deps` as configured in CI pipeline. |

---

**Verified against source**: [`backend/run.py`](file:///backend/run.py), [`backend/Dockerfile`](file:///backend/Dockerfile), [`frontend/Dockerfile`](file:///frontend/Dockerfile), [`docker-compose.yml`](file:///docker-compose.yml), [`backend/scripts/migrations/run_db_migrations.py`](file:///backend/scripts/migrations/run_db_migrations.py), [`backend/scripts/seed_rbac_catalogue.py`](file:///backend/scripts/seed_rbac_catalogue.py), [`backend/scripts/seed_sd_workflow_matrix.py`](file:///backend/scripts/seed_sd_workflow_matrix.py), [`scripts/sql/01_create_least_privilege_app_user.sql`](file:///scripts/sql/01_create_least_privilege_app_user.sql).

