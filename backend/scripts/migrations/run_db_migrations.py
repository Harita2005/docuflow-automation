"""
Database Schema Migration Command for DocuFlow
Security Finding: SEC-08 (Least-Privilege Database Principle)

This migration script performs required DDL schema updates and index creations
using an administrative database account (e.g., DBA / sa credentials).
Moving DDL execution out of application startup (main.py) ensures that the DocuFlow
backend application can run under a pure DML least-privilege account (docuflow_app)
without requiring DDL/ALTER/CREATE permissions.

Usage:
    python backend/scripts/migrations/run_db_migrations.py
"""

import logging
import os
import sys

# Ensure backend root is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from sqlalchemy import text
from app.database.connection import engine
from app.database.models import Base

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("run_db_migrations")


def run_migrations():
    logger.info("Starting DocuFlow database schema migrations...")

    try:
        # 1. Create tables if they do not exist
        logger.info("Verifying table existence via SQLAlchemy metadata...")
        Base.metadata.create_all(bind=engine)

        with engine.begin() as conn:
            logger.info("Applying column schema additions and foreign key constraints...")
            # role_id, division_id, approval_divisions columns on users
            conn.execute(text("IF COL_LENGTH('users', 'role_id') IS NULL ALTER TABLE users ADD role_id INT NULL;"))
            conn.execute(text("IF COL_LENGTH('users', 'division_id') IS NULL ALTER TABLE users ADD division_id INT NULL;"))
            conn.execute(text("IF COL_LENGTH('users', 'approval_divisions') IS NULL ALTER TABLE users ADD approval_divisions VARCHAR(500) NULL;"))
            conn.execute(text("""IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'fk_users_role_id')
                ALTER TABLE users ADD CONSTRAINT fk_users_role_id FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;"""))

            # MFA and phone columns on users
            conn.execute(text("IF COL_LENGTH('users', 'phone_number') IS NULL ALTER TABLE users ADD phone_number VARCHAR(50) NULL;"))
            conn.execute(text("IF COL_LENGTH('users', 'mfa_enabled') IS NULL ALTER TABLE users ADD mfa_enabled BIT DEFAULT 0;"))
            conn.execute(text("IF COL_LENGTH('users', 'mfa_type') IS NULL ALTER TABLE users ADD mfa_type VARCHAR(50) DEFAULT 'EMAIL';"))
            conn.execute(text("IF COL_LENGTH('users', 'mfa_secret') IS NULL ALTER TABLE users ADD mfa_secret VARCHAR(100) NULL;"))

            # file_path, source_application, version, file_name, file_size on documents
            conn.execute(text("IF COL_LENGTH('documents', 'file_path') IS NULL ALTER TABLE documents ADD file_path VARCHAR(500) NULL;"))
            conn.execute(text("IF COL_LENGTH('documents', 'source_application') IS NULL ALTER TABLE documents ADD source_application VARCHAR(100) NULL;"))
            conn.execute(text("IF COL_LENGTH('documents', 'version') IS NULL ALTER TABLE documents ADD version INT NULL DEFAULT 1;"))
            conn.execute(text("IF COL_LENGTH('documents', 'file_name') IS NULL ALTER TABLE documents ADD file_name VARCHAR(255) NULL;"))
            conn.execute(text("IF COL_LENGTH('documents', 'file_size') IS NULL ALTER TABLE documents ADD file_size BIGINT NULL;"))

            # is_mandatory on document_checklist_states
            conn.execute(text("IF COL_LENGTH('document_checklist_states', 'is_mandatory') IS NULL ALTER TABLE document_checklist_states ADD is_mandatory BIT NULL DEFAULT 0;"))

            # Filtered unique index on doc_key
            logger.info("Ensuring filtered unique index on documents(doc_key)...")
            conn.execute(text("""
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_documents_doc_key' AND object_id = OBJECT_ID('documents'))
                BEGIN
                    CREATE UNIQUE NONCLUSTERED INDEX uq_documents_doc_key
                    ON documents (doc_key)
                    WHERE doc_key IS NOT NULL;
                END
            """))

            # Enhanced Audit Fields on document_approval_logs
            logger.info("Ensuring audit columns on document_approval_logs...")
            conn.execute(text("IF COL_LENGTH('document_approval_logs', 'approver_user_id') IS NULL ALTER TABLE document_approval_logs ADD approver_user_id INT NULL;"))
            conn.execute(text("IF COL_LENGTH('document_approval_logs', 'stage_id') IS NULL ALTER TABLE document_approval_logs ADD stage_id INT NULL;"))
            conn.execute(text("IF COL_LENGTH('document_approval_logs', 'previous_status') IS NULL ALTER TABLE document_approval_logs ADD previous_status VARCHAR(50) NULL;"))
            conn.execute(text("IF COL_LENGTH('document_approval_logs', 'new_status') IS NULL ALTER TABLE document_approval_logs ADD new_status VARCHAR(50) NULL;"))
            conn.execute(text("IF COL_LENGTH('document_approval_logs', 'remarks') IS NULL ALTER TABLE document_approval_logs ADD remarks NVARCHAR(MAX) NULL;"))

            # Filtered indexes on document_type_field_configurations
            logger.info("Ensuring filtered indexes on document_type_field_configurations...")
            conn.execute(text("""
                IF OBJECT_ID('document_type_field_configurations', 'U') IS NOT NULL
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_dtfc_global_default' AND object_id = OBJECT_ID('document_type_field_configurations'))
                    BEGIN
                        CREATE UNIQUE NONCLUSTERED INDEX uq_dtfc_global_default
                        ON document_type_field_configurations (document_type, field_key)
                        WHERE user_id IS NULL;
                    END

                    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'uq_dtfc_user_override' AND object_id = OBJECT_ID('document_type_field_configurations'))
                    BEGIN
                        CREATE UNIQUE NONCLUSTERED INDEX uq_dtfc_user_override
                        ON document_type_field_configurations (document_type, field_key, user_id)
                        WHERE user_id IS NOT NULL;
                    END
                END
            """))

        logger.info("All database migrations and schema checks completed successfully.")
    except Exception as exc:
        logger.error(f"Migration error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    run_migrations()
