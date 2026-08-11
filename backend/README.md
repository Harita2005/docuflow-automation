# DocuFlow Automation — Python FastAPI Backend

Enterprise-grade document approval, compliance verification, and dynamic workflow automation engine built with **Python FastAPI**, **SQLAlchemy 2.0**, and **Microsoft SQL Server (MS SQL)**.

---

## 🏛️ Architecture & Directory Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py               # FastAPI App, CORS, Static Uploads, Exception Handlers
│   ├── config.py             # Settings, JWT secrets, database connection
│   ├── database.py           # SQLAlchemy Engine, SessionLocal, MS SQL / SQLite connection
│   ├── models.py             # SQLAlchemy ORM Models (DocTrans, Users, WorkflowProfile, StepDefinitions, Rules, AuditLogs)
│   ├── schemas.py            # Pydantic v2 validation schemas
│   ├── auth.py               # JWT authentication & bcrypt password verification
│   ├── services/
│   │   ├── __init__.py
│   │   ├── rules_engine.py   # Multi-condition branch evaluator & workflow matching
│   │   └── ocr_service.py    # PyMuPDF document extraction
│   └── routers/
│       ├── __init__.py
│       ├── auth.py           # /api/auth/login, /api/auth/me
│       ├── users.py          # /api/users
│       ├── invoices.py       # /api/invoices, /api/documents, stage approvals, auto-routing
│       ├── workflows.py      # /api/admin/workflows CRUD & reordering
│       ├── conditions.py     # /api/admin/conditions Policy Matrix CRUD
│       └── audit.py          # /api/audit-logs, /api/system-logs
├── requirements.txt
├── seed_excel.py             # Parses Excel Approval Matrix & seeds database
├── run.py                    # Uvicorn entry point
└── README.md
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Database (`.env`)
To connect to your company's **Microsoft SQL Server**:
```ini
DATABASE_URL=mssql+pyodbc://sa:password@localhost:1433/SmartDocLive?driver=ODBC+Driver+17+for+SQL+Server
```
*(If no `.env` is configured, it automatically falls back to local SQLite `backend/docuflow.db` for offline testing).*

### 3. Seed Workflows & Rules from Excel
```bash
python seed_excel.py
```

### 4. Start the Server
```bash
python run.py
```
* **API Server**: `http://localhost:8000`
* **Swagger Interactive Docs**: `http://localhost:8000/docs`
* **ReDoc**: `http://localhost:8000/redoc`

---

## 🎛️ Key Features

* **Excel Branch Matrix Routing**: Dynamically maps regional branches (`TN-SIVAKASI` ➔ `EVOUCHER_INV SR10`, `TN-CBE-SULUR` ➔ `SR2`, `HQ` ➔ `SR`, etc.).
* **Multi-Stage Approval Pipeline**: Supports 2-stage branch vouchers, 3-stage deposit/rent flows, and 4-stage SD Asset approval flows (`Attachment Status` ➔ `First Approval` ➔ `IA Approval` ➔ `Final Approval`).
* **Live Compliance Audit Trail**: Full chronological logging of reviews, stage transitions, hold remarks, and sign-offs.
