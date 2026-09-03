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
    
    from sqlalchemy import text, inspect
    
    def run_migration_sql(sql_cmd: str):
        try:
            with engine.begin() as conn:
                conn.execute(text(sql_cmd))
        except Exception as err:
            print(f"[Database Migration Notice] {err}")

    # 1. Rename legacy tables if present
    run_migration_sql("IF OBJECT_ID('invoices', 'U') IS NOT NULL AND OBJECT_ID('documents', 'U') IS NULL EXEC sp_rename 'invoices', 'documents';")
    run_migration_sql("IF OBJECT_ID('invoice_line_items', 'U') IS NOT NULL AND OBJECT_ID('document_line_items', 'U') IS NULL EXEC sp_rename 'invoice_line_items', 'document_line_items';")
    run_migration_sql("IF OBJECT_ID('invoice_checklist_states', 'U') IS NOT NULL AND OBJECT_ID('document_checklist_states', 'U') IS NULL EXEC sp_rename 'invoice_checklist_states', 'document_checklist_states';")

    # 2. Data type conversions & index fixes
    run_migration_sql("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='documents' AND COLUMN_NAME='doc_num' AND DATA_TYPE='int') ALTER TABLE documents ALTER COLUMN doc_num VARCHAR(100) NULL;")
    run_migration_sql("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs' AND COLUMN_NAME='invoice_id' AND IS_NULLABLE='NO') ALTER TABLE audit_logs ALTER COLUMN invoice_id VARCHAR(100) NULL;")
    run_migration_sql("IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'ix_invoices_doc_key' AND object_id = OBJECT_ID('documents')) DROP INDEX ix_invoices_doc_key ON documents;")
    run_migration_sql("IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'ix_documents_doc_key' AND object_id = OBJECT_ID('documents')) DROP INDEX ix_documents_doc_key ON documents;")
    run_migration_sql("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='documents' AND COLUMN_NAME='doc_key' AND DATA_TYPE <> 'varchar') ALTER TABLE documents ALTER COLUMN doc_key VARCHAR(100) NULL;")
    run_migration_sql("IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'ix_documents_doc_key' AND object_id = OBJECT_ID('documents')) CREATE INDEX ix_documents_doc_key ON documents (doc_key);")

    # 3. Documents table column additions (Individual guaranteed transactions)
    doc_cols = [
        ("party_name", "NVARCHAR(250) NULL"),
        ("party_code", "NVARCHAR(100) NULL"),
        ("party_tax_id", "NVARCHAR(50) NULL"),
        ("vendor_name", "NVARCHAR(250) NULL"),
        ("vendor_code", "NVARCHAR(100) NULL"),
        ("vendor_gstin", "NVARCHAR(50) NULL"),
        ("cgst", "FLOAT NULL"),
        ("sgst", "FLOAT NULL"),
        ("igst", "FLOAT NULL"),
        ("is_deleted", "BIT NOT NULL DEFAULT 0"),
        ("deleted_at", "DATETIME NULL"),
        ("pi_indicator", "NVARCHAR(10) NULL"),
        ("trans_type", "NVARCHAR(20) NULL"),
        ("gstin", "NVARCHAR(15) NULL"),
        ("doc_status", "INT NULL DEFAULT 0"),
        ("doc_due_date", "DATE NULL"),
        ("contact_person", "NVARCHAR(100) NULL"),
        ("pay_mode", "NVARCHAR(10) NOT NULL DEFAULT N'BANK'"),
        ("link_column", "NVARCHAR(500) NULL"),
        ("external_sync_status", "VARCHAR(50) NULL DEFAULT 'UNSYNCED'"),
        ("external_sync_ref", "VARCHAR(100) NULL"),
        ("external_synced_at", "DATETIME NULL"),
        ("external_sync_system", "VARCHAR(100) NULL"),
        ("external_sync_error", "NVARCHAR(MAX) NULL")
    ]
    for col_name, col_type in doc_cols:
        run_migration_sql(f"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='documents' AND COLUMN_NAME='{col_name}') ALTER TABLE documents ADD {col_name} {col_type};")

    # 4. Users table column additions
    user_cols = [
        ("is_deleted", "BIT NOT NULL DEFAULT 0"),
        ("deleted_at", "DATETIME NULL"),
        ("mfa_enabled", "BIT NOT NULL DEFAULT 0"),
        ("mfa_type", "VARCHAR(50) NULL DEFAULT 'EMAIL'"),
        ("mfa_secret", "VARCHAR(100) NULL"),
        ("last_login", "DATETIME NULL"),
        ("active_session_id", "VARCHAR(100) NULL"),
        ("active_device_info", "NVARCHAR(255) NULL"),
        ("session_created_at", "DATETIME NULL"),
        ("last_activity_at", "DATETIME NULL")
    ]
    for col_name, col_type in user_cols:
        run_migration_sql(f"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='users' AND COLUMN_NAME='{col_name}') ALTER TABLE users ADD {col_name} {col_type};")

    # 5. Workflow profiles table column additions
    wf_cols = [
        ("is_deleted", "BIT NOT NULL DEFAULT 0"),
        ("deleted_at", "DATETIME NULL"),
        ("rule_action", "VARCHAR(50) NOT NULL DEFAULT 'WORKFLOW_ROUTE'"),
        ("cancel_reason", "NVARCHAR(MAX) NULL"),
        ("auto_approve_enabled", "BIT NOT NULL DEFAULT 0"),
        ("auto_approve_condition", "NVARCHAR(MAX) NULL"),
        ("auto_cancel_enabled", "BIT NOT NULL DEFAULT 0"),
        ("auto_cancel_condition", "NVARCHAR(MAX) NULL")
    ]
    for col_name, col_type in wf_cols:
        run_migration_sql(f"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='workflow_profiles' AND COLUMN_NAME='{col_name}') ALTER TABLE workflow_profiles ADD {col_name} {col_type};")

    # 6. Workflow step definitions table column additions
    run_migration_sql("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='workflow_step_definitions' AND COLUMN_NAME='checklist_json') ALTER TABLE workflow_step_definitions ADD checklist_json NVARCHAR(MAX) NULL;")

    # 7. Business rules table column additions
    rule_cols = [
        ("is_deleted", "BIT NOT NULL DEFAULT 0"),
        ("deleted_at", "DATETIME NULL"),
        ("rule_action", "VARCHAR(50) NOT NULL DEFAULT 'WORKFLOW_ROUTE'"),
        ("cancel_reason", "NVARCHAR(MAX) NULL"),
        ("auto_approve_enabled", "BIT NOT NULL DEFAULT 0"),
        ("auto_approve_condition", "NVARCHAR(MAX) NULL"),
        ("auto_cancel_enabled", "BIT NOT NULL DEFAULT 0"),
        ("auto_cancel_condition", "NVARCHAR(MAX) NULL")
    ]
    for col_name, col_type in rule_cols:
        run_migration_sql(f"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='business_rules' AND COLUMN_NAME='{col_name}') ALTER TABLE business_rules ADD {col_name} {col_type};")

    # 8. Document line items table column additions
    line_cols = [
        ("item_code", "VARCHAR(100) NULL"),
        ("warranty_text", "NVARCHAR(500) NULL"),
        ("serial_numbers", "NVARCHAR(1000) NULL"),
        ("quantity", "NUMERIC(12, 2) NULL DEFAULT 1.0"),
        ("unit_price", "NUMERIC(18, 2) NULL DEFAULT 0.0"),
        ("amount", "NUMERIC(18, 2) NULL DEFAULT 0.0")
    ]
    for col_name, col_type in line_cols:
        run_migration_sql(f"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='document_line_items' AND COLUMN_NAME='{col_name}') ALTER TABLE document_line_items ADD {col_name} {col_type};")

    # 9. Callback rules table column additions
    callback_cols = [
        ("payload_source", "VARCHAR(50) NOT NULL DEFAULT 'MAPPING'"),
        ("stored_procedure_name", "VARCHAR(200) NULL")
    ]
    for col_name, col_type in callback_cols:
        run_migration_sql(f"IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='callback_rules' AND COLUMN_NAME='{col_name}') ALTER TABLE callback_rules ADD {col_name} {col_type};")

    # 10. Audit & system logs type conversions
    run_migration_sql("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs' AND COLUMN_NAME='invoice_id' AND DATA_TYPE IN ('int', 'bigint')) ALTER TABLE audit_logs ALTER COLUMN invoice_id VARCHAR(100) NULL;")
    run_migration_sql("IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='system_logs' AND COLUMN_NAME='invoice_id' AND DATA_TYPE IN ('int', 'bigint')) ALTER TABLE system_logs ALTER COLUMN invoice_id VARCHAR(100) NULL;")

    # 11. Default cleanups for NULL values
    run_migration_sql("UPDATE documents SET is_deleted = 0 WHERE is_deleted IS NULL;")
    run_migration_sql("UPDATE users SET is_deleted = 0 WHERE is_deleted IS NULL;")
    run_migration_sql("UPDATE workflow_profiles SET is_deleted = 0 WHERE is_deleted IS NULL;")
    run_migration_sql("UPDATE business_rules SET is_deleted = 0 WHERE is_deleted IS NULL;")

    print("[Database] Schema migrations completed successfully.")
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
        
        # Seed core default users if missing
        from app.auth import get_password_hash
        seed_users = [
            ("admin", "admin@company.com", "Admin"),
            ("YUVASREE", "yuvasree@company.com", "Employee"),
            ("Nattudurai", "nattudurai@company.com", "Approver"),
            ("VIGNESH", "vignesh@company.com", "Finance"),
            ("VARUNAN", "varunan@company.com", "Audit"),
            ("KUMAR", "kumar@company.com", "Approver"),
            ("ANBU", "anbu@company.com", "Approver")
        ]
        for uname, uemail, urole in seed_users:
            u_exists = db.query(User).filter(User.username == uname).first()
            if not u_exists:
                db.add(User(
                    username=uname,
                    email=uemail,
                    hashed_password=get_password_hash("password123"),
                    role=urole,
                    is_active=True
                ))
        db.commit()

        user_count = db.query(User).count()
        wf_count = db.query(WorkflowProfile).count()
        inv_count = db.query(Invoice).filter(Invoice.is_deleted == False).count()
        if wf_count == 0:
            print(f"[Startup] Seeding complete dataset (Found {wf_count} workflows, {inv_count} invoices)...")
            try:
                from seed_sd_workflow_matrix import seed_sd_workflow_matrix
                seed_sd_workflow_matrix()
            except Exception as e:
                print(f"[Startup] Seed notice: {e}")

        # Always synchronize workflow stage definitions to designated 4 demo approvers
        from app.models import WorkflowStepDefinition
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 1).update({'approver_target': 'YUVASREE', 'approver_type': 'Specific Employee'}, synchronize_session=False)
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 2).update({'approver_target': 'Nattudurai', 'approver_type': 'Specific Employee'}, synchronize_session=False)
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number == 3).update({'approver_target': 'VIGNESH', 'approver_type': 'Specific Employee'}, synchronize_session=False)
        db.query(WorkflowStepDefinition).filter(WorkflowStepDefinition.stage_number >= 4).update({'approver_target': 'VARUNAN', 'approver_type': 'Specific Employee'}, synchronize_session=False)
        db.commit()

        # Always synchronize active stage approvers for all documents
        active_docs = db.query(Invoice).filter(Invoice.is_deleted == False).all()
        for d in active_docs:
            stage_num = d.current_stage or 1
            if stage_num == 1:
                d.assigned_approver = "YUVASREE"
            elif stage_num == 2:
                d.assigned_approver = "Nattudurai"
            elif stage_num == 3:
                d.assigned_approver = "VIGNESH"
            elif stage_num >= 4:
                d.assigned_approver = "VARUNAN"
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

from app.routers import auth, users, documents, workflows, conditions, audit, sync, sync_router, integrations, events, callback_integrations

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
app.include_router(callback_integrations.router)
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
