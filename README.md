# DocuFlow Automation Enterprise Platform

DocuFlow Automation is an enterprise-grade Document Processing, Policy Compliance Engine, and Multi-Stage Workflow Orchestration Platform designed for high-volume corporate document processing, financial verification, and ERP ledger reconciliation.

The platform combines a modern React interface with a high-performance Python FastAPI backend, offering real-time workflow execution, condition-based policy matrix routing, strict field-level access control, and seamless ERP data integration (SAP S/4HANA and MS SQL Server).

---

## Executive System Overview

* **Multi-Stage Workflow Orchestration**: Enables customizable, multi-tier approval chains with role assignment, delegated approvers, SLA monitoring, and dynamic stage routing.
* **Policy Compliance & Condition Matrix Engine**: Dynamically evaluates routing rules based on organizational metadata including Company Division, Branch / Plant Location, Document Category, and Invoice Financial Amounts.
* **Enterprise ERP Integration**: Bidirectional data synchronization supporting live reconciliation with SAP S/4HANA and MS SQL Server database ledgers.
* **Security & Access Control (RBAC & FLAC)**: Implements Role-Based Access Control and Field-Level Access Control to enforce field visibility, edit rights, and active reviewer collision locking.
* **Document Management & Compression**: Native PDF processing powered by PyMuPDF, providing document viewing, attachment management, and stream optimization.
* **Auditability & Traceability**: Comprehensive audit logging recording user actions, sign-offs, timestamps, and compliance verification checkpoints.

---

## Technical Stack Architecture

### Backend Services
* **Framework**: Python FastAPI 0.110+
* **ORM & Database Connection**: SQLAlchemy 2.0+
* **Database Management System**: MS SQL Server (Production) / SQLite (Development)
* **Authentication**: OAuth2 JWT Bearer Tokens with bcrypt password encryption
* **Document & Image Engine**: PyMuPDF (fitz), Pillow, ReportLab

### Frontend Services
* **Core Framework**: React 19, TypeScript
* **Build Tooling**: Vite 6
* **Styling**: Tailwind CSS v4, Lucide React Icon Library
* **Visualization & Analytics**: Recharts, React Flow

---

## Installation & Setup Guide

### Prerequisites
* Python 3.10 or higher
* Node.js v18.0 or higher
* MS SQL Server (for production database storage)
* Git

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   
   # Windows (PowerShell):
   .\venv\Scripts\Activate.ps1
   
   # Linux / macOS:
   source venv/bin/activate
   ```

3. Install required Python packages:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables in `.env`:
   ```env
   PROJECT_NAME="DocuFlow Automation API"
   DATABASE_URL="mssql+pyodbc://sa:YourPassword@localhost:1433/DocuFlowDB?driver=ODBC+Driver+17+for+SQL+Server"
   SECRET_KEY="your-corporate-jwt-secret-key"
   ACCESS_TOKEN_EXPIRE_MINUTES=43200
   ```

5. Launch the backend server:
   ```bash
   python run.py
   ```
   *The FastAPI server runs on port 3000.*

---

### Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install Node dependencies:
   ```bash
   npm install
   ```

3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *The application will run at http://localhost:5173.*

4. Build for production deployment:
   ```bash
   npm run build
   ```

---

## Production Deployment Architecture

For corporate production deployments, DocuFlow recommends:
* **Web Server / Reverse Proxy**: Nginx configured with SSL/TLS termination, proxying requests to Uvicorn and serving static React assets.
* **Application Server**: Uvicorn running under Gunicorn supervisor process.
* **Database**: High-availability MS SQL Server instance with automated backup retention schedules.

---

## API Architecture Overview

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/auth/login` | `POST` | Authenticates users and issues JWT access tokens. |
| `/api/documents` | `GET` / `POST` | Fetches document ledgers or uploads new invoice records. |
| `/api/workflows/approve` | `POST` | Records stage sign-offs and advances workflow routing. |
| `/api/workflows/reject` | `POST` | Executes rejection rules and returns documents to prior stages. |
| `/api/admin/routing-rules` | `GET` / `POST` | Manages policy matrix routing rules and company thresholds. |
| `/api/admin/publish` | `POST` | Publishes draft workflow and condition matrices to live production. |

---

## Data Privacy & Corporate Compliance

DocuFlow Automation is designed for enterprise data security:
* **On-Premise Infrastructure**: All document extraction, business logic, and database operations execute locally within corporate network boundaries.
* **No Unsanctioned Third-Party API Calls**: External data transmission is restricted to configured internal corporate ERP hosts.
* **Session Persistence**: Access tokens utilize configurable corporate expiry periods (default 30 days) to prevent session interruption during active document review.

---

## License & Corporate Information

Confidential and Proprietary. Copyright (c) Enterprise Operations. All rights reserved.
