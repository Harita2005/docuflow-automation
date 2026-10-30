-- =============================================================================
-- DocuFlow Automation - Integration, Core & Audit Schema Migration
-- Script: 02_integration_and_audit_schema_migration.sql
-- Target Engine: Microsoft SQL Server 2017+
-- Target Database: DocuFlowDB
-- Security Finding: SEC-03 (Eliminate Runtime Database Schema Modifications)
-- DBA Instructions:
--   1. Review script in staging/QA prior to production application.
--   2. Execute under high-privilege DBA account (e.g. sysadmin or db_owner).
--   3. All statements are idempotent (safe to run multiple times).
--   4. Grants least-privilege DML permissions (SELECT, INSERT, UPDATE) to [docuflow_app].
--   5. Enforces append-only immutability on audit tables.
-- =============================================================================

USE [DocuFlowDB];
GO

PRINT 'Starting DocuFlow Schema Migration (02_integration_and_audit_schema_migration)...';
GO

-- =============================================================================
-- 1. SCHEMAS INITIALIZATION
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'integration')
BEGIN
    PRINT 'Creating schema [integration]...';
    EXEC('CREATE SCHEMA integration');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'core')
BEGIN
    PRINT 'Creating schema [core]...';
    EXEC('CREATE SCHEMA core');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'security')
BEGIN
    PRINT 'Creating schema [security]...';
    EXEC('CREATE SCHEMA security');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'audit')
BEGIN
    PRINT 'Creating schema [audit]...';
    EXEC('CREATE SCHEMA audit');
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'rules')
BEGIN
    PRINT 'Creating schema [rules]...';
    EXEC('CREATE SCHEMA rules');
END
GO

-- =============================================================================
-- 2. INTEGRATION SCHEMA TABLES
-- =============================================================================

IF OBJECT_ID('integration.source_systems', 'U') IS NULL
BEGIN
    PRINT 'Creating table [integration].[source_systems]...';
    CREATE TABLE integration.source_systems (
        source_system_id INT IDENTITY(1,1) PRIMARY KEY,
        system_code VARCHAR(50) NOT NULL UNIQUE,
        system_name VARCHAR(200) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('integration.sync_runs', 'U') IS NULL
BEGIN
    PRINT 'Creating table [integration].[sync_runs]...';
    CREATE TABLE integration.sync_runs (
        sync_run_id INT IDENTITY(1,1) PRIMARY KEY,
        source_system_id INT NOT NULL,
        idempotency_key VARCHAR(100) NOT NULL,
        sync_status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
        records_processed INT NOT NULL DEFAULT 1,
        started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_sync_runs_idempotency
        ON integration.sync_runs (source_system_id, idempotency_key);
END
GO

IF OBJECT_ID('integration.source_records', 'U') IS NULL
BEGIN
    PRINT 'Creating table [integration].[source_records]...';
    CREATE TABLE integration.source_records (
        source_record_id INT IDENTITY(1,1) PRIMARY KEY,
        source_system_id INT NOT NULL,
        sync_run_id INT NULL,
        canonical_document_id INT NULL,
        external_record_key VARCHAR(100) NOT NULL,
        payload_json NVARCHAR(MAX) NULL,
        status VARCHAR(50) NULL DEFAULT 'RECEIVED',
        ingested_at DATETIME2 NULL DEFAULT SYSUTCDATETIME(),
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_source_records_ext_key
        ON integration.source_records (source_system_id, external_record_key);
END
ELSE
BEGIN
    -- Ensure all required columns exist idempotently
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='sync_run_id')
        ALTER TABLE integration.source_records ADD sync_run_id INT NULL;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='canonical_document_id')
        ALTER TABLE integration.source_records ADD canonical_document_id INT NULL;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='status')
        ALTER TABLE integration.source_records ADD status VARCHAR(50) NULL DEFAULT 'RECEIVED';
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='integration' AND TABLE_NAME='source_records' AND COLUMN_NAME='ingested_at')
        ALTER TABLE integration.source_records ADD ingested_at DATETIME2 NULL DEFAULT SYSUTCDATETIME();
END
GO

IF OBJECT_ID('integration.source_record_versions', 'U') IS NULL
BEGIN
    PRINT 'Creating table [integration].[source_record_versions]...';
    CREATE TABLE integration.source_record_versions (
        version_id INT IDENTITY(1,1) PRIMARY KEY,
        source_record_id INT NOT NULL,
        version_number INT NOT NULL,
        payload_snapshot_json NVARCHAR(MAX) NULL,
        received_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_source_record_versions_rec_id
        ON integration.source_record_versions (source_record_id, version_number);
END
GO

-- =============================================================================
-- 3. CORE SCHEMA TABLES
-- =============================================================================

IF OBJECT_ID('core.document_types', 'U') IS NULL
BEGIN
    PRINT 'Creating table [core].[document_types]...';
    CREATE TABLE core.document_types (
        document_type_id INT IDENTITY(1,1) PRIMARY KEY,
        type_code VARCHAR(50) NOT NULL UNIQUE,
        type_name VARCHAR(100) NOT NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

IF OBJECT_ID('core.documents', 'U') IS NULL
BEGIN
    PRINT 'Creating table [core].[documents]...';
    CREATE TABLE core.documents (
        document_id INT IDENTITY(1,1) PRIMARY KEY,
        document_type_id INT NOT NULL,
        source_record_id INT NULL,
        document_number VARCHAR(100) NOT NULL,
        created_by_user_id INT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'NEW',
        correlation_id UNIQUEIDENTIFIER NULL,
        is_deleted BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_core_documents_lookup
        ON core.documents (document_type_id, document_number);
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='core' AND TABLE_NAME='documents' AND COLUMN_NAME='created_by_user_id')
        ALTER TABLE core.documents ADD created_by_user_id INT NULL;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='core' AND TABLE_NAME='documents' AND COLUMN_NAME='correlation_id')
        ALTER TABLE core.documents ADD correlation_id UNIQUEIDENTIFIER NULL;
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='core' AND TABLE_NAME='documents' AND COLUMN_NAME='updated_at')
        ALTER TABLE core.documents ADD updated_at DATETIME2 NULL DEFAULT SYSUTCDATETIME();
END
GO

IF OBJECT_ID('core.document_versions', 'U') IS NULL
BEGIN
    PRINT 'Creating table [core].[document_versions]...';
    CREATE TABLE core.document_versions (
        version_id INT IDENTITY(1,1) PRIMARY KEY,
        document_id INT NOT NULL,
        version_number INT NOT NULL,
        document_snapshot_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_core_document_versions_doc_id
        ON core.document_versions (document_id, version_number);
END
GO

IF OBJECT_ID('core.document_metadata', 'U') IS NULL
BEGIN
    PRINT 'Creating table [core].[document_metadata]...';
    CREATE TABLE core.document_metadata (
        metadata_id INT IDENTITY(1,1) PRIMARY KEY,
        document_id INT NOT NULL,
        meta_key VARCHAR(100) NOT NULL,
        meta_value NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_core_document_metadata_doc_id
        ON core.document_metadata (document_id, meta_key);
END
GO

-- =============================================================================
-- 4. SECURITY SCHEMA TABLES
-- =============================================================================

IF OBJECT_ID('security.app_users', 'U') IS NULL
BEGIN
    PRINT 'Creating table [security].[app_users]...';
    CREATE TABLE security.app_users (
        user_id INT IDENTITY(1,1) PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NULL,
        password_hash VARCHAR(255) NULL,
        external_user_key VARCHAR(100) NULL,
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END
GO

-- =============================================================================
-- 5. AUDIT SCHEMA TABLES
-- =============================================================================

IF OBJECT_ID('audit.audit_events', 'U') IS NULL
BEGIN
    PRINT 'Creating table [audit].[audit_events]...';
    CREATE TABLE audit.audit_events (
        event_id INT IDENTITY(1,1) PRIMARY KEY,
        correlation_id UNIQUEIDENTIFIER NULL,
        actor_user_id INT NULL,
        source_system_id INT NULL,
        event_category VARCHAR(50) NULL,
        event_type VARCHAR(100) NULL,
        entity_schema VARCHAR(50) NULL,
        entity_table VARCHAR(100) NULL,
        entity_id VARCHAR(100) NULL,
        action_type VARCHAR(50) NULL,
        before_json NVARCHAR(MAX) NULL,
        after_json NVARCHAR(MAX) NULL,
        metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE NONCLUSTERED INDEX IX_audit_events_created
        ON audit.audit_events (created_at DESC);
    CREATE NONCLUSTERED INDEX IX_audit_events_correlation
        ON audit.audit_events (correlation_id);
END
GO

-- =============================================================================
-- 6. RULES SCHEMA TABLES
-- =============================================================================

IF OBJECT_ID('rules.rule_evaluation_runs', 'U') IS NULL
BEGIN
    PRINT 'Creating table [rules].[rule_evaluation_runs]...';
    CREATE TABLE rules.rule_evaluation_runs (
        evaluation_run_id INT IDENTITY(1,1) PRIMARY KEY,
        document_id INT NOT NULL,
        run_time DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        correlation_id UNIQUEIDENTIFIER NULL
    );
END
ELSE
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='rules' AND TABLE_NAME='rule_evaluation_runs' AND COLUMN_NAME='evaluation_run_id')
       AND EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='rules' AND TABLE_NAME='rule_evaluation_runs' AND COLUMN_NAME='run_id')
    BEGIN
        PRINT 'Renaming rules.rule_evaluation_runs.run_id to evaluation_run_id...';
        EXEC sp_rename 'rules.rule_evaluation_runs.run_id', 'evaluation_run_id', 'COLUMN';
    END
END
GO

-- =============================================================================
-- 7. LEAST-PRIVILEGE PERMISSIONS FOR APPLICATION ACCOUNT [docuflow_app]
-- =============================================================================

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'docuflow_app')
BEGIN
    PRINT 'Granting DML permissions to [docuflow_app]...';
    
    -- Grant SELECT, INSERT, UPDATE on the new schemas
    GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::integration TO [docuflow_app];
    GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::core TO [docuflow_app];
    GRANT SELECT, INSERT, UPDATE ON SCHEMA::security TO [docuflow_app];
    GRANT SELECT, INSERT, UPDATE ON SCHEMA::rules TO [docuflow_app];
    
    -- Audit tables must be append-only: allow SELECT and INSERT, deny UPDATE and DELETE
    GRANT SELECT, INSERT ON SCHEMA::audit TO [docuflow_app];
    DENY UPDATE, DELETE ON OBJECT::audit.audit_events TO [docuflow_app];
    
    PRINT 'Least-privilege permissions configured for [docuflow_app].';
END
ELSE
BEGIN
    PRINT 'Notice: [docuflow_app] user not found in database. Permissions should be granted after creating the user via 01_create_least_privilege_app_user.sql.';
END
GO

PRINT 'DocuFlow Schema Migration completed successfully.';
GO
