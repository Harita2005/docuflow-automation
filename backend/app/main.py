import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import User, WorkflowProfile
from app.routers import auth, users, invoices, workflows, conditions, audit, sync

# Initialize database schema tables and run migrations on import
try:
    Base.metadata.create_all(bind=engine)
    
    # Auto-migrate SQL Server schema columns immediately on import
    from sqlalchemy import text, inspect
    try:
        with engine.connect() as conn:
            conn.execute(text("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='invoices' AND COLUMN_NAME='doc_num' AND DATA_TYPE='int') ALTER TABLE invoices ALTER COLUMN doc_num VARCHAR(100) NULL;"))
            conn.execute(text("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs' AND COLUMN_NAME='invoice_id' AND IS_NULLABLE='NO') ALTER TABLE audit_logs ALTER COLUMN invoice_id VARCHAR(100) NULL;"))
            
            # Add cgst, sgst, igst columns to invoices if missing
            try:
                inspector = inspect(engine)
                
                # Invoices table migrations
                existing_cols_invoices = [c['name'] for c in inspector.get_columns('invoices')]
                if 'cgst' not in existing_cols_invoices:
                    conn.execute(text("ALTER TABLE invoices ADD cgst FLOAT NULL;"))
                if 'sgst' not in existing_cols_invoices:
                    conn.execute(text("ALTER TABLE invoices ADD sgst FLOAT NULL;"))
                if 'igst' not in existing_cols_invoices:
                    conn.execute(text("ALTER TABLE invoices ADD igst FLOAT NULL;"))
                if 'is_deleted' not in existing_cols_invoices:
                    conn.execute(text("ALTER TABLE invoices ADD is_deleted BIT NOT NULL DEFAULT 0;"))
                if 'deleted_at' not in existing_cols_invoices:
                    conn.execute(text("ALTER TABLE invoices ADD deleted_at DATETIME NULL;"))
                
                # Users table migrations
                existing_cols_users = [c['name'] for c in inspector.get_columns('users')]
                if 'is_deleted' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD is_deleted BIT NOT NULL DEFAULT 0;"))
                if 'deleted_at' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD deleted_at DATETIME NULL;"))
                if 'mfa_enabled' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD mfa_enabled BIT NOT NULL DEFAULT 0;"))
                if 'mfa_type' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD mfa_type VARCHAR(50) NULL DEFAULT 'EMAIL';"))
                if 'mfa_secret' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD mfa_secret VARCHAR(100) NULL;"))
                if 'last_login' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD last_login DATETIME NULL;"))
                    
                # Workflow profiles table migrations
                existing_cols_workflows = [c['name'] for c in inspector.get_columns('workflow_profiles')]
                if 'is_deleted' not in existing_cols_workflows:
                    conn.execute(text("ALTER TABLE workflow_profiles ADD is_deleted BIT NOT NULL DEFAULT 0;"))
                if 'deleted_at' not in existing_cols_workflows:
                    conn.execute(text("ALTER TABLE workflow_profiles ADD deleted_at DATETIME NULL;"))
                    
            except Exception as col_err:
                print(f"[Database] Column migration warning: {col_err}")
            
            conn.commit()
        print("[Database] Schema migrations completed successfully.")
    except Exception as mig_err:
        print(f"[Database] Migration error: {mig_err}")
except Exception as e:
    print(f"[Database] Warning on table creation: {e}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

@app.on_event("startup")
def startup_event():
    try:

        db = SessionLocal()
        user_count = db.query(User).count()
        wf_count = db.query(WorkflowProfile).count()
        if user_count < 10 or wf_count == 0:
            print(f"[Startup] Seeding complete dataset (Found {user_count} users, {wf_count} workflows)...")
            from seed_excel import seed_database
            seed_database()
        db.close()
    except Exception as e:
        print(f"[Startup] Notice during startup seed: {e}")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory for PDF documents and attachments
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")

# Include API Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(users.admin_router)
app.include_router(invoices.router)
app.include_router(workflows.router)
app.include_router(conditions.router)
app.include_router(audit.router)
app.include_router(sync.router)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": "MS SQL Server" if not settings.DATABASE_URL.startswith("sqlite") else "SQLite (Local)",
        "docs": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}
