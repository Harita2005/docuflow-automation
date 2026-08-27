import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models import User, WorkflowProfile, Invoice
from app.routers import auth, users, documents, workflows, conditions, audit, sync, sync_router, integrations, events

# Initialize database schema tables and run migrations on import
try:
    Base.metadata.create_all(bind=engine)
    
    # Auto-migrate SQL Server schema columns immediately on import
    from sqlalchemy import text, inspect
    try:
        with engine.connect() as conn:
            # 1. Rename tables dynamically if they exist under old names
            try:
                conn.execute(text("IF OBJECT_ID('invoices', 'U') IS NOT NULL AND OBJECT_ID('documents', 'U') IS NULL EXEC sp_rename 'invoices', 'documents';"))
                conn.execute(text("IF OBJECT_ID('invoice_line_items', 'U') IS NOT NULL AND OBJECT_ID('document_line_items', 'U') IS NULL EXEC sp_rename 'invoice_line_items', 'document_line_items';"))
                conn.execute(text("IF OBJECT_ID('invoice_checklist_states', 'U') IS NOT NULL AND OBJECT_ID('document_checklist_states', 'U') IS NULL EXEC sp_rename 'invoice_checklist_states', 'document_checklist_states';"))
                conn.commit()
            except Exception as rename_err:
                print(f"[Database] Rename tables warning: {rename_err}")

            conn.execute(text("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='documents' AND COLUMN_NAME='doc_num' AND DATA_TYPE='int') ALTER TABLE documents ALTER COLUMN doc_num VARCHAR(100) NULL;"))
            conn.execute(text("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs' AND COLUMN_NAME='invoice_id' AND IS_NULLABLE='NO') ALTER TABLE audit_logs ALTER COLUMN invoice_id VARCHAR(100) NULL;"))
            
            # doc_key column migration to VARCHAR(100)
            try:
                conn.execute(text("IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'ix_invoices_doc_key' AND object_id = OBJECT_ID('documents')) DROP INDEX ix_invoices_doc_key ON documents;"))
                conn.execute(text("IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'ix_documents_doc_key' AND object_id = OBJECT_ID('documents')) DROP INDEX ix_documents_doc_key ON documents;"))
                conn.execute(text("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='documents' AND COLUMN_NAME='doc_key' AND DATA_TYPE <> 'varchar') ALTER TABLE documents ALTER COLUMN doc_key VARCHAR(100) NULL;"))
                conn.execute(text("IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'ix_documents_doc_key' AND object_id = OBJECT_ID('documents')) CREATE INDEX ix_documents_doc_key ON documents (doc_key);"))
                conn.commit()
            except Exception as dockey_err:
                print(f"[Database] doc_key migration warning: {dockey_err}")

            # Add cgst, sgst, igst columns to documents if missing
            try:
                inspector = inspect(engine)
                
                # Documents table migrations
                existing_cols_documents = [c['name'] for c in inspector.get_columns('documents')]
                if 'cgst' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD cgst FLOAT NULL;"))
                if 'sgst' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD sgst FLOAT NULL;"))
                if 'igst' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD igst FLOAT NULL;"))
                if 'is_deleted' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD is_deleted BIT NOT NULL DEFAULT 0;"))
                if 'deleted_at' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD deleted_at DATETIME NULL;"))
                if 'pi_indicator' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD pi_indicator NVARCHAR(10) NULL;"))
                if 'trans_type' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD trans_type NVARCHAR(20) NULL;"))
                if 'gstin' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD gstin NVARCHAR(15) NULL;"))
                if 'doc_status' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD doc_status INT NULL DEFAULT 0;"))
                if 'doc_due_date' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD doc_due_date DATE NULL;"))
                if 'contact_person' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD contact_person NVARCHAR(100) NULL;"))
                if 'pay_mode' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD pay_mode NVARCHAR(10) NOT NULL DEFAULT N'BANK';"))
                if 'link_column' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD link_column NVARCHAR(500) NULL;"))
                if 'external_sync_status' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD external_sync_status VARCHAR(50) NULL DEFAULT 'UNSYNCED';"))
                if 'external_sync_ref' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD external_sync_ref VARCHAR(100) NULL;"))
                if 'external_synced_at' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD external_synced_at DATETIME NULL;"))
                if 'external_sync_system' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD external_sync_system VARCHAR(100) NULL;"))
                if 'external_sync_error' not in existing_cols_documents:
                    conn.execute(text("ALTER TABLE documents ADD external_sync_error NVARCHAR(MAX) NULL;"))
                
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
                if 'active_session_id' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD active_session_id VARCHAR(100) NULL;"))
                if 'active_device_info' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD active_device_info NVARCHAR(255) NULL;"))
                if 'session_created_at' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD session_created_at DATETIME NULL;"))
                if 'last_activity_at' not in existing_cols_users:
                    conn.execute(text("ALTER TABLE users ADD last_activity_at DATETIME NULL;"))
                    
                # Workflow profiles table migrations
                existing_cols_workflows = [c['name'] for c in inspector.get_columns('workflow_profiles')]
                if 'is_deleted' not in existing_cols_workflows:
                    conn.execute(text("ALTER TABLE workflow_profiles ADD is_deleted BIT NOT NULL DEFAULT 0;"))
                if 'deleted_at' not in existing_cols_workflows:
                    conn.execute(text("ALTER TABLE workflow_profiles ADD deleted_at DATETIME NULL;"))

                # Workflow step definitions table migrations
                existing_cols_steps = [c['name'] for c in inspector.get_columns('workflow_step_definitions')]
                if 'checklist_json' not in existing_cols_steps:
                    conn.execute(text("ALTER TABLE workflow_step_definitions ADD checklist_json NVARCHAR(MAX) NULL;"))
                    
                # Business rules table migrations
                existing_cols_rules = [c['name'] for c in inspector.get_columns('business_rules')]
                if 'is_deleted' not in existing_cols_rules:
                    conn.execute(text("ALTER TABLE business_rules ADD is_deleted BIT NOT NULL DEFAULT 0;"))
                if 'deleted_at' not in existing_cols_rules:
                    conn.execute(text("ALTER TABLE business_rules ADD deleted_at DATETIME NULL;"))

                # Document line items table migrations
                if inspector.has_table('document_line_items'):
                    existing_cols_line_items = [c['name'] for c in inspector.get_columns('document_line_items')]
                    if 'item_code' not in existing_cols_line_items:
                        conn.execute(text("ALTER TABLE document_line_items ADD item_code VARCHAR(100) NULL;"))
                    if 'warranty_text' not in existing_cols_line_items:
                        conn.execute(text("ALTER TABLE document_line_items ADD warranty_text NVARCHAR(500) NULL;"))
                    if 'serial_numbers' not in existing_cols_line_items:
                        conn.execute(text("ALTER TABLE document_line_items ADD serial_numbers NVARCHAR(1000) NULL;"))
                    if 'quantity' not in existing_cols_line_items:
                        conn.execute(text("ALTER TABLE document_line_items ADD quantity NUMERIC(12, 2) NULL DEFAULT 1.0;"))
                    if 'unit_price' not in existing_cols_line_items:
                        conn.execute(text("ALTER TABLE document_line_items ADD unit_price NUMERIC(18, 2) NULL DEFAULT 0.0;"))
                    if 'amount' not in existing_cols_line_items:
                        conn.execute(text("ALTER TABLE document_line_items ADD amount NUMERIC(18, 2) NULL DEFAULT 0.0;"))


                # Audit logs & System logs type conversions for invoice_id type matching
                try:
                    conn.execute(text("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs' AND COLUMN_NAME='invoice_id' AND DATA_TYPE IN ('int', 'bigint')) ALTER TABLE audit_logs ALTER COLUMN invoice_id VARCHAR(100) NULL;"))
                    conn.execute(text("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='system_logs' AND COLUMN_NAME='invoice_id' AND DATA_TYPE IN ('int', 'bigint')) ALTER TABLE system_logs ALTER COLUMN invoice_id VARCHAR(100) NULL;"))
                except Exception as log_err:
                    print(f"[Database] Log columns alteration warning: {log_err}")
                
                # Ensure is_deleted defaults to 0 for any existing records where it is NULL
                try:
                    conn.execute(text("UPDATE documents SET is_deleted = 0 WHERE is_deleted IS NULL;"))
                    conn.execute(text("UPDATE users SET is_deleted = 0 WHERE is_deleted IS NULL;"))
                    conn.execute(text("UPDATE workflow_profiles SET is_deleted = 0 WHERE is_deleted IS NULL;"))
                    conn.execute(text("UPDATE business_rules SET is_deleted = 0 WHERE is_deleted IS NULL;"))
                except Exception as update_err:
                    print(f"[Database] Defaults update warning: {update_err}")
                    
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
        inv_count = db.query(Invoice).filter(Invoice.is_deleted == False).count()
        if user_count < 10 or wf_count == 0 or inv_count < 5:
            print(f"[Startup] Seeding complete dataset (Found {user_count} users, {wf_count} workflows, {inv_count} invoices)...")
            try:
                from seed_sd_workflow_matrix import seed_sd_workflow_matrix
                seed_sd_workflow_matrix()
            except Exception as e:
                print(f"[Startup] Seed notice: {e}")

        # Always synchronize active stage approvers for all documents
        from app.models import WorkflowStepDefinition
        active_docs = db.query(Invoice).filter(Invoice.is_deleted == False).all()
        for d in active_docs:
            if d.workflow_profile_id:
                st = db.query(WorkflowStepDefinition).filter(
                    WorkflowStepDefinition.profile_name == d.workflow_profile_id,
                    WorkflowStepDefinition.stage_number == (d.current_stage or 1)
                ).first()
                if st and st.approver_target and st.approver_target.strip() != (d.assigned_approver or '').strip():
                    d.assigned_approver = st.approver_target.strip()
        db.commit()
        db.close()
    except Exception as e:
        print(f"[Startup] Notice during startup sync: {e}")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enterprise Security Headers & Rate Limiting Middleware
from app.services.security_middleware import SecurityHeadersMiddleware, RateLimiterMiddleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimiterMiddleware, max_auth_requests=15, window_seconds=60)

# Mount uploads & stored_pdfs directory for PDF documents and attachments
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")
app.mount("/stored_pdfs", StaticFiles(directory=str(settings.PDF_STORAGE_DIR)), name="stored_pdfs")

# Include API Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(users.admin_router)
app.include_router(documents.router)
app.include_router(workflows.router)
app.include_router(conditions.router)
app.include_router(audit.router)
app.include_router(sync.router)
app.include_router(sync_router.router)
app.include_router(integrations.router)
app.include_router(events.router)

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
